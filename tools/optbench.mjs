/**
 * 軽量化の効きを、同じセッションの中で入／切を切り替えて測る。
 *
 * ブラウザを起動し直して比べると、ソフトウェア描画の速度が
 * その時のマシンの混み具合に振られて、10 割近くぶれることがある。
 * 同一プロセス内で交互に測れば、その揺れが両方に等しく乗るので
 * 比率は信用できる。
 *
 *   node tools/optbench.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=igpu';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('[エラー]', e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(2500);

const out = await page.evaluate(`(async () => {
  const { engine, game, THREE } = window.__DEV;
  const r = engine.renderer, gl = r.getContext();
  const mats = game.mats, lp = engine.lightPool;
  game.paused = true;
  engine.autoResolution = false;
  await new Promise((res) => requestAnimationFrame(res));

  const cam = engine.camera;
  for (const c of engine.viewScene.children) c.visible = false;
  /*
   * 視点によって結果が大きく変わる。
   * 空が広く写る画では、そもそも PBR が走らない画素が多く、
   * どんな軽量化も効きが薄く見える。逆に室内では効きが濃く出る。
   * 代表的な 3 通りを測って、偏った結論を出さないようにする。
   */
  const VIEWS = [
    ['広場（空 4 割）', [0, 1.75, 20], [0, 3, 0], 78],
    ['市場（建物に囲まれる）', [16, 1.7, 16], [16, 2, -8], 78],
    ['主屋内（室内灯あり）', [-4, 1.7, 4], [6, 1.8, -4], 80],
  ];
  const setView = ([, from, look, fov]) => {
    cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.set(from[0], from[1], from[2]);
    cam.lookAt(new THREE.Vector3(look[0], look[1], look[2]));
    cam.updateMatrixWorld();
  };
  setView(VIEWS[0]);

  const px = new Uint8Array(4);
  const sync = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  const measure = (fn, n = 3) => {
    fn(); sync();                             // ウォームアップ
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { fn(); sync(); }
    return (performance.now() - t0) / n;
  };
  // シーンだけ（ポスト処理を含めない）と、ポストまで通した全体
  const sceneOnly = () => r.render(engine.scene, cam);
  const whole = () => engine.render(0.016);

  const nDefs = lp.defs.length;
  const fitted = lp.slots.length;

  /** 設定を適用してから測る */
  const setup = (opt) => {
    mats.setDropRoughIBL(opt.ibl);
    mats.setCheapShadows(opt.shadow);
    lp.setCount(opt.lights);
    lp.snap(cam.position);
    engine.render(0.016);                     // シェーダを組み直させる
  };

  const CASES = [
    ['最適化前（全光源・PCF5点・IBLそのまま）', { ibl: false, shadow: false, lights: nDefs }],
    ['光源プールだけ',                          { ibl: false, shadow: false, lights: fitted }],
    ['＋ざらつき面のIBL省略',                   { ibl: true,  shadow: false, lights: fitted }],
    ['＋影のぼかしを1点に（現行）',             { ibl: true,  shadow: true,  lights: fitted }],
  ];

  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const out = [];

  for (const view of VIEWS) {
    setView(view);
    // 順番による偏りを消すため、往復して平均を取る
    const accS = CASES.map(() => []);
    const accW = CASES.map(() => []);
    for (let pass = 0; pass < 2; pass++) {
      const order = pass === 0 ? CASES.map((_, i) => i) : CASES.map((_, i) => CASES.length - 1 - i);
      for (const i of order) {
        setup(CASES[i][1]);
        accS[i].push(measure(sceneOnly));
        accW[i].push(measure(whole));
      }
    }
    const rows = CASES.map(([name], i) => ({
      条件: name,
      シーンms: +avg(accS[i]).toFixed(1),
      全体ms: +avg(accW[i]).toFixed(1),
    }));
    const bS = rows[0].シーンms, bW = rows[0].全体ms;
    for (const row of rows) {
      row['シーン倍率'] = +(bS / row.シーンms).toFixed(2);
      row['全体倍率'] = +(bW / row.全体ms).toFixed(2);
    }
    out.push({
      視点: view[0],
      ポスト処理ms: +(rows[rows.length - 1].全体ms - rows[rows.length - 1].シーンms).toFixed(1),
      結果: rows,
    });
  }

  return JSON.stringify({
    解像度: r.domElement.width + 'x' + r.domElement.height,
    画質: engine.quality,
    マップの光源定義数: nDefs,
    実体の枠数: fitted,
    視点別: out,
  }, null, 1);
})()`);

const d = JSON.parse(out);
console.log(`${d.画質} / ${d.解像度} / 光源 ${d.マップの光源定義数} 定義 → 実体 ${d.実体の枠数} 枠`);
const vlen = (s) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
const w = Math.max(...d.視点別.flatMap((v) => v.結果.map((r) => vlen(r.条件))));
for (const v of d.視点別) {
  console.log(`\n■ ${v.視点}　ポスト処理 ${v.ポスト処理ms} ms（軽量化では減らない固定費）`);
  for (const r of v.結果) {
    console.log(`  ${r.条件}${' '.repeat(w - vlen(r.条件))}  ` +
      `シーン ${String(r.シーンms).padStart(7)}ms ${String(r['シーン倍率']).padStart(5)}倍   ` +
      `全体 ${String(r.全体ms).padStart(7)}ms ${String(r['全体倍率']).padStart(5)}倍`);
  }
}

await browser.close();
