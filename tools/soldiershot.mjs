/**
 * 兵士モデルを同一条件で撮り、造形を目視確認する。
 * 全身の 4 方向と、頭部・胸部の寄り。
 *
 *   node tools/soldiershot.mjs [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const outDir = process.argv[3] || 'shots/soldier';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

await page.goto(`${url}?rawgpu&quality=high`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});

await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE;
  d.game.paused = true;
  d.hud.hide();
  d.engine.autoResolution = false;
  const scene = d.engine.scene;
  scene.fog = null;
  for (const c of scene.children) if (!c.isLight && c.name !== 'Sky') c.visible = false;

  const stage = new THREE.Group(); stage.name = '__soldierstage';
  scene.add(stage);
  const key = new THREE.DirectionalLight(0xfff2e0, 3.0); key.position.set(0.7, 1.0, 0.75);
  const fill = new THREE.DirectionalLight(0xb4c8dd, 1.2); fill.position.set(-0.85, 0.25, -0.35);
  const rim = new THREE.DirectionalLight(0xffffff, 1.5); rim.position.set(0.05, -0.15, -1.0);
  stage.add(key, fill, rim);

  // 生きているボットを 1 体借りて原点に立たせる
  const b = d.game.bots.find((x) => x.alive) || d.game.bots[0];
  b.char.position.set(0, 0, 0);
  b.char.yaw = 0; b.char.pitch = 0;
  b.char.model.visible = true;
  b.char.model.position.set(0, 0, 0);
  b.char.model.rotation.set(0, 0, 0);
  b.char.model.traverse((o) => { o.visible = true; o.frustumCulled = false; });
  stage.add(b.char.model);
  window.__SOLDIER = b.char.model;
})()`);

const views = [
  { n: 'a_正面',   dir: [0, 0.06, 1],     center: [0, 0.95, 0], fov: 32 },
  { n: 'b_斜め',   dir: [0.78, 0.12, 0.7], center: [0, 0.95, 0], fov: 32 },
  { n: 'c_側面',   dir: [1, 0.06, 0],     center: [0, 0.95, 0], fov: 32 },
  { n: 'd_背面',   dir: [0, 0.08, -1],    center: [0, 0.95, 0], fov: 32 },
  { n: 'e_頭部',   dir: [0.5, 0.15, 0.85], center: [0, 1.66, 0], fov: 15 },
  { n: 'f_胸部',   dir: [0.35, 0.1, 0.93], center: [0, 1.25, 0], fov: 20 },
];

for (const v of views) {
  await page.evaluate(`(() => {
    const d = window.__DEV, THREE = d.THREE;
    const c = new THREE.Vector3(${v.center.join(',')});
    const dir = new THREE.Vector3(${v.dir.join(',')}).normalize();
    const cam = d.engine.camera;
    cam.fov = ${v.fov}; cam.updateProjectionMatrix();
    const dist = ${v.fov === 32 ? 3.6 : v.fov === 20 ? 1.9 : 1.3};
    cam.position.copy(c).addScaledVector(dir, dist);
    cam.lookAt(c);
    cam.updateMatrixWorld();
  })()`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${outDir}/${v.n}.png`, timeout: 180000 });
  console.log('撮影:', v.n);
}

console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
