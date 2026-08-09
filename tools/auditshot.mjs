/**
 * 監査用の撮影。
 *
 * 「実際に画面に出ているもの」でしか品質は判定できない。
 * ここでは
 *   1. 通常のプレイ画面（HUD 込み）
 *   2. 敵兵を至近から数カット（武器を持っているか・関節・接地）
 *   3. 死亡時の姿勢
 * を撮り、あわせてシーンの統計を吐く。
 *
 *   node tools/auditshot.mjs <出力先> [url]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'shots/audit';
const url = process.argv[3] || 'http://127.0.0.1:4173/?rawgpu&quality=ultra';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });

// メニュー（起動直後の画面）
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/00_menu.png`, timeout: 240000 });

await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.evaluate('window.__DEV.engine.autoResolution = false');
await page.waitForTimeout(4000);

// 通常のプレイ画面（HUD 込み）
await page.screenshot({ path: `${outDir}/01_play_hud.png`, timeout: 240000 });

/* --- 敵兵を至近で見る --- */
const info = await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE, g = d.game;
  const bot = g.bots.find((b) => b.alive) || g.bots[0];
  if (!bot) return JSON.stringify({ err: 'ボットがいない' });
  // 撮影しやすい平地へ移す
  // 試作場の空き地（中央広場の塔に隠れない場所）
  const p = new THREE.Vector3(-50, 0.02, 64);
  bot.char.position.copy(p);
  bot.alive = true; bot.char.alive = true; bot.char.model.visible = true;
  bot.char.setFarLod(false);
  bot.char.yaw = bot.aimYaw = Math.PI;      // カメラ（+Z 側）を向く
  bot.char.pitch = 0;
  window.__AUDIT = { bot };
  window.__STAGE = { x: p.x, z: p.z };
  // 何を持っているか
  const names = [];
  bot.char.model.traverse((o) => { if (o.isMesh) names.push(o.name || '(無名)'); });
  return JSON.stringify({
    メッシュ数: names.length,
    ボット数: g.bots.length,
    武器ID: bot.weaponId,
  });
})()`);
console.log('ボット:', info);

const shot = async (name, setup, wait = 2600) => {
  await page.evaluate(setup);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 240000 });
  console.log('撮影:', name);
};

/** カメラを据える文（式ではなく文の並びを返す） */
const camAt = (x, y, z, tx, ty, tz, fov = 42) => `
  const d = window.__DEV, THREE = d.THREE, cam = d.engine.camera;
  d.game.paused = true; d.hud.hide();
  cam.fov = ${fov}; cam.updateProjectionMatrix();
  cam.position.set(${x} + (window.__STAGE?.x ?? 0), ${y}, ${z} + (window.__STAGE?.z ?? 0));
  cam.lookAt(new THREE.Vector3(${tx} + (window.__STAGE?.x ?? 0), ${ty}, ${tz} + (window.__STAGE?.z ?? 0)));
  cam.updateMatrixWorld();
  d.engine.lightPool.snap(cam.position);
  for (const c of d.engine.viewScene.children) c.visible = false;
`;

// 立ち姿（正面・全身）
await shot('10_bot_front', `(() => {
  const b = window.__AUDIT.bot; b.char.speed = 0; b.char.update(0.016, false);
  ${camAt(0, 1.0, 3.0, 0, 0.95, 0)}
})()`);

// 構え（交戦中の姿勢）
await shot('11_bot_aim', `(() => {
  const b = window.__AUDIT.bot;
  b.char.speed = 0;
  for (let i = 0; i < 90; i++) b.char.update(0.016, true);
  ${camAt(1.6, 1.35, 2.2, 0, 1.25, 0, 36)}
})()`);

// 歩行の途中（脚と腕）
await shot('12_bot_walk', `(() => {
  const b = window.__AUDIT.bot;
  b.char.speed = 4.2;
  for (let i = 0; i < 40; i++) b.char.update(0.016, false);
  ${camAt(2.4, 1.1, 1.6, 0, 0.9, 0, 40)}
})()`);

// 頭部の寄り
await shot('13_bot_head', `(() => {
  ${camAt(0.35, 1.68, 1.1, 0, 1.62, 0, 26)}
})()`);

// 倒れた姿
await shot('14_bot_dead', `(() => {
  const b = window.__AUDIT.bot;
  b.char.alive = false; b.char._deathT = 0;
  for (let i = 0; i < 70; i++) b.char.update(0.016, false);
  ${camAt(2.2, 1.3, 2.2, 0, 0.4, 0, 45)}
})()`);

/* --- シーン統計 --- */
const stat = await page.evaluate(`(() => {
  const d = window.__DEV;
  const r = d.engine.renderer;
  const info = r.info;
  let meshes = 0, tris = 0, mats = new Set(), geos = new Set();
  d.engine.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    meshes++; mats.add(o.material); geos.add(o.geometry);
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return JSON.stringify({
    描画メッシュ: meshes, 三角形: Math.round(tris),
    ユニークマテリアル: mats.size, ユニークジオメトリ: geos.size,
    プログラム数: r.info.programs?.length ?? -1,
    テクスチャ数: info.memory.textures, ジオメトリ数: info.memory.geometries,
  }, null, 1);
})()`);
console.log(stat);
console.log(errors.length ? 'JS エラー: ' + [...new Set(errors)].slice(0, 5).join(' / ') : 'JS エラーなし');
await browser.close();
