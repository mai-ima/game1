/**
 * 環境マップ（IBL）を外し、半球光で代わりを務めさせたときの
 * 「絵の差」と「速さ」を測る。
 *
 * IBL は描画時間の 4 割近くを占める最大の費目だが、
 * 屋外の空は「上が青くて下が地面色」という単純な形をしているので、
 * 拡散のぶんは半球光でかなり近づけられるはず——という当たりを
 * 実測で確かめるためのもの。
 *
 * 半球光の強さを振って、いちばん元の絵に近づく値を探す。
 *
 *   node tools/envprobe.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=igpu';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('[エラー]', e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(2000);

const out = await page.evaluate(`(async () => {
  const { engine, game, THREE } = window.__DEV;
  const r = engine.renderer, gl = r.getContext();
  game.paused = true;
  engine.autoResolution = false;
  engine.hud?.hide?.();
  await new Promise((res) => requestAnimationFrame(res));
  for (const c of engine.viewScene.children) c.visible = false;

  const cam = engine.camera;
  const VIEWS = [
    ['広場', [0, 1.75, 20], [0, 3, 0], 78],
    ['市場', [16, 1.7, 16], [16, 2, -8], 78],
    ['室内', [-4, 1.7, 4], [6, 1.8, -4], 80],
    ['日陰', [-20, 1.7, 8], [-30, 2, -4], 78],
  ];
  const setView = ([, from, look, fov]) => {
    cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.set(from[0], from[1], from[2]);
    cam.lookAt(new THREE.Vector3(look[0], look[1], look[2]));
    cam.updateMatrixWorld();
    engine.lightPool.snap(cam.position);
  };

  const px = new Uint8Array(4);
  const sync = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  const shot = () => {
    r.render(engine.scene, cam); sync();
    const w = r.domElement.width, h = r.domElement.height;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  };
  const time = (n = 3) => {
    r.render(engine.scene, cam); sync();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { r.render(engine.scene, cam); sync(); }
    return (performance.now() - t0) / n;
  };
  const cmp = (a, b) => {
    let sum = 0, max = 0, over12 = 0;
    const n = a.length / 4;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      const d = Math.max(Math.abs(a[j] - b[j]), Math.abs(a[j+1] - b[j+1]), Math.abs(a[j+2] - b[j+2]));
      sum += d; if (d > max) max = d;
      if (d > 12) over12++;
    }
    return { 平均: +(sum / n).toFixed(2), 最大: max, 差12超: +(over12 / n * 100).toFixed(2) };
  };

  const mats = [...new Set((() => { const s = new Set(); engine.scene.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material)) s.add(o.material); }); return s; })())];
  const envWas = engine.scene.environment;
  const hemiWas = engine.hemi.intensity;
  const perMat = mats.map((m) => m.envMap);

  const setEnv = (on, hemi) => {
    engine.scene.environment = on ? envWas : null;
    for (const m of mats) m.envMap = on ? perMat[mats.indexOf(m)] : null;
    for (const m of mats) m.needsUpdate = true;
    engine.hemi.intensity = hemi;
    r.render(engine.scene, cam);   // シェーダを組み直させる
  };

  const HEMI = [hemiWas, 0.45, 0.65, 0.85, 1.05, 1.3];
  const res = [];
  for (const view of VIEWS) {
    setView(view);
    setEnv(true, hemiWas);
    const base = shot();
    const tBase = time();

    const rows = [];
    for (const h of HEMI) {
      setEnv(false, h);
      const b = shot();
      rows.push({ 半球光: h, ...cmp(base, b) });
    }
    setEnv(false, hemiWas);
    const tOff = time();

    setEnv(true, hemiWas);       // 元に戻す
    rows.sort((a, b) => a.平均 - b.平均);
    res.push({
      視点: view[0],
      IBLあり_ms: +tBase.toFixed(1),
      IBLなし_ms: +tOff.toFixed(1),
      倍率: +(tBase / tOff).toFixed(2),
      いちばん近い半球光: rows[0],
      全候補: rows,
    });
  }
  return JSON.stringify(res, null, 1);
})()`);

const rows = JSON.parse(out);
console.log('環境マップ（IBL）を外し、半球光で代替したときの差と速さ\n');
for (const r of rows) {
  console.log(`■ ${r.視点}  ${r.IBLあり_ms}ms → ${r.IBLなし_ms}ms  (${r.倍率} 倍)`);
  for (const c of r.全候補) {
    const mark = c === r.いちばん近い半球光 ? ' ←最良' : '';
    console.log(`    半球光 ${String(c.半球光).padStart(5)} : 平均差 ${String(c.平均).padStart(6)} / 最大 ${String(c.最大).padStart(3)} / 差12超 ${String(c.差12超).padStart(6)}%${mark}`);
  }
}

await browser.close();
