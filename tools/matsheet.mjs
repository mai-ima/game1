/**
 * マテリアル見本帳を撮る。
 * 全プリセットを球と板に貼って一覧にし、色・粗さ・凹凸を目視で確かめる。
 *
 *   node tools/matsheet.mjs [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const outDir = process.argv[3] || 'shots/materials';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

await page.goto(`${url}?rawgpu&quality=high`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});

const names = JSON.parse(await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game.paused = true;
  d.hud.hide();
  d.engine.autoResolution = false;
  return JSON.stringify(d.mats.names ? d.mats.names() : Object.keys(d.mats.constructor.PRESETS || {}));
})()`).catch(() => '[]'));

// プリセット名はライブラリ側から取れないこともあるので、こちらで持つ
const list = names.length ? names : JSON.parse(await page.evaluate(`(() => {
  // get() は未定義名で例外を投げるので、試して通ったものだけ集める
  const cand = ${JSON.stringify([
    'concrete', 'concreteFloor', 'paintedWall', 'paintedWallBlue', 'plaster', 'brick', 'brickPale',
    'rock', 'tile', 'paving', 'asphalt', 'dirt', 'sand', 'gravel',
    'rustedMetal', 'paintedMetal', 'paintedMetalTan', 'brushedMetal', 'aluminum', 'carbon',
    'diamondPlate', 'corrugated', 'hazardStripe', 'gunMetal',
    'wood', 'woodDark', 'plywood', 'fabric', 'camo', 'leather', 'sandbag', 'cardboard',
    'rubber', 'tireTread', 'polymer',
    'marble', 'marbleDark', 'terrazzo', 'granite', 'woodFloor', 'woodFloorDark',
    'carpet', 'carpetRed', 'wallpaper', 'wallpaperWarm', 'ceramicTile', 'ceilingPanel',
    'velvet', 'brassPolished',
    'roadMarking', 'tactilePaving', 'ballast', 'railSteel', 'shutter',
    'rebar', 'galvanized', 'formPly', 'tarp', 'tarpGreen',
  ])};
  const okList = [];
  for (const n of cand) { try { window.__DEV.mats.get(n); okList.push(n); } catch (e) { /* 未定義 */ } }
  return JSON.stringify(okList);
})()`));

console.log(`プリセット ${list.length} 種`);

// 見本帳の舞台を作る
await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE;
  const scene = d.engine.scene;
  scene.fog = null;
  for (const c of scene.children) if (!c.isLight && c.name !== 'Sky') c.visible = false;
  const stage = new THREE.Group(); stage.name = '__matstage';
  scene.add(stage);
  window.__STAGE = stage;
  const key = new THREE.DirectionalLight(0xfff3e4, 2.6); key.position.set(0.7, 1.0, 0.8);
  const fill = new THREE.DirectionalLight(0xaec6dd, 0.9); fill.position.set(-0.8, 0.3, -0.5);
  stage.add(key, fill);
})()`);

const COLS = 5, ROWS = 3, PER = COLS * ROWS;
const pages = Math.ceil(list.length / PER);
for (let p = 0; p < pages; p++) {
  const chunk = list.slice(p * PER, (p + 1) * PER);
  await page.evaluate(`(() => {
    const d = window.__DEV, THREE = d.THREE, stage = window.__STAGE;
    for (let i = stage.children.length - 1; i >= 0; i--) {
      const c = stage.children[i];
      if (!c.isLight) { stage.remove(c); }
    }
    const names = ${JSON.stringify(chunk)};
    const COLS = ${COLS};
    names.forEach((n, i) => {
      const cx = (i % COLS - (COLS - 1) / 2) * 1.25;
      const cy = -(Math.floor(i / COLS) - 1) * 1.25;
      // 板 1m 角（UV をワールドに合わせる）
      const mat = d.mats.scaled(n, 1, 1);
      const plane = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.06), mat);
      plane.position.set(cx, cy, 0);
      // 球（曲面での映り込みと粗さを見る）
      const sph = new THREE.Mesh(new THREE.SphereGeometry(0.26, 40, 28), d.mats.get(n, { repeat: [2, 1] }));
      sph.position.set(cx + 0.34, cy - 0.34, 0.3);
      for (const m of [plane, sph]) {
        m.frustumCulled = false;
        if (m.geometry.attributes.uv && !m.geometry.attributes.uv1) {
          m.geometry.setAttribute('uv1', m.geometry.attributes.uv);
        }
        stage.add(m);
      }
    });
    const cam = d.engine.camera;
    cam.fov = 40; cam.updateProjectionMatrix();
    cam.position.set(0, 0, 6.0);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
  })()`);
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${outDir}/page${String(p + 1).padStart(2, '0')}.png`, timeout: 180000 });
  console.log(`  ページ${p + 1}: ${chunk.join(', ')}`);
}

console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
