/**
 * 全武器モデルを同一条件で撮り、形状を目視確認する。
 * 側面・斜め前・斜め後ろの 3 方向。
 *
 *   node tools/gunshots.mjs [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const outDir = process.argv[3] || 'shots/guns';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 420 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

await page.goto(`${url}?rawgpu&quality=high`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});

/*
 * 武器を「展示台」として本編シーンとは別に置く。
 * ビューモデル用シーンをそのまま使うと手ぶれや姿勢演出が乗るため、
 * 主シーンへ実物大で置き、真横から撮る。
 */
await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE;
  d.game.paused = true;
  d.hud.hide();
  d.engine.autoResolution = false;

  // 展示専用の入れ物
  const stage = new THREE.Group();
  stage.name = '__gunstage';
  d.engine.scene.add(stage);
  window.__STAGE = stage;

  // 周囲を暗くして被写体だけを見せる
  d.engine.scene.fog = null;
  for (const c of d.engine.scene.children) {
    if (c !== stage && !c.isLight && c.name !== 'Sky') c.visible = false;
  }
  // 撮影用の追加照明
  const key = new THREE.DirectionalLight(0xfff4e2, 3.2); key.position.set(0.6, 0.9, 0.7);
  const fill = new THREE.DirectionalLight(0xb8ccdd, 1.1); fill.position.set(-0.8, 0.2, -0.4);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(0.1, -0.3, -1.0);
  stage.add(key, fill, rim);
})()`);

const shoot = async (id, name) => {
  const info = await page.evaluate(`(() => {
    const d = window.__DEV, THREE = d.THREE;
    const stage = window.__STAGE;
    // 前回の武器を捨てる
    for (let i = stage.children.length - 1; i >= 0; i--) {
      const c = stage.children[i];
      if (c.isLight) continue;
      stage.remove(c);
    }
    // ロードアウトを切り替えてモデルを作らせ、それを借りて展示する
    d.game.weapons.setLoadout([${JSON.stringify(id)}, 'pistol'], {});
    const m = d.game.weapons.model;
    const clone = m.root.clone(true);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.visible = true;
    clone.traverse((o) => { o.visible = true; o.frustumCulled = false; });
    stage.add(clone);

    // 銃のワールド境界から画角を決める
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3(); box.getSize(size);
    const c = new THREE.Vector3(); box.getCenter(c);
    window.__FIT = { size: [size.x, size.y, size.z], center: [c.x, c.y, c.z] };
    return JSON.stringify({ 全長mm: Math.round(size.z * 1000), 高さmm: Math.round(size.y * 1000) });
  })()`);

  const views = [
    { n: 'a_側面', dir: [1, 0.12, 0] },
    { n: 'b_斜め前', dir: [0.75, 0.35, -0.7] },
    { n: 'c_斜め後', dir: [-0.7, 0.30, 0.75] },
  ];
  for (const v of views) {
    await page.evaluate(`(() => {
      const d = window.__DEV, THREE = d.THREE;
      const f = window.__FIT;
      const c = new THREE.Vector3(...f.center);
      const r = Math.max(f.size[0], f.size[1], f.size[2]) * 0.62;
      const dist = r / Math.tan(THREE.MathUtils.degToRad(28) / 2) * 1.05;
      const dir = new THREE.Vector3(${v.dir.join(',')}).normalize();
      const cam = d.engine.camera;
      cam.fov = 28; cam.updateProjectionMatrix();
      cam.position.copy(c).addScaledVector(dir, dist);
      cam.lookAt(c);
      cam.updateMatrixWorld();
    })()`);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${outDir}/${name}_${v.n}.png`, timeout: 180000 });
  }
  console.log(name.padEnd(10), info);
};

const guns = [
  ['ak47', '01_ak47'], ['m4a1', '02_m4a1'], ['mp5', '03_mp5'],
  ['sniper', '04_m200'], ['shotgun', '05_m870'], ['pistol', '06_m1911'],
  ['scarh', '07_scarh'], ['p90', '08_p90'], ['m249', '09_m249'], ['glock17', '10_glock17'],
];
for (const [id, name] of guns) await shoot(id, name);

console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
