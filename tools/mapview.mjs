/**
 * マップ見学モードの動作を確かめる。
 * 誰も居ないこと・終わらないこと・浮遊が効くことを見る。
 *
 *   node tools/mapview.mjs [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=high';
const outDir = process.argv[3] || 'shots/mapview';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 300000 });

await page.evaluate(`(async () => {
  const d = window.__DEV;
  d.menu.sel.mode = 'mapview';
  await d.startMatch(d.menu.sel);
})()`);
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 300000 }).catch(() => {});

const ok = (c, m) => console.log(`  ${c ? '○' : '×'} ${m}`);

const st = JSON.parse(await page.evaluate(`(() => {
  const g = window.__DEV.game;
  return JSON.stringify({
    モード: g.modeId,
    ボット数: g.bots.length,
    生存ボット: g.bots.filter((b) => b.alive).length,
    残り時間: g.mode.getScores().remaining,
    終了判定: g.mode.isOver(),
    自機の体力: g.playerStats.hp,
  });
})()`));
console.log(JSON.stringify(st, null, 1));
ok(st.モード === 'mapview', 'マップ見学モードで開始できる');
ok(st.ボット数 === 0, `敵も味方も居ない: ${st.ボット数} 体`);
ok(st.残り時間 === null || st.残り時間 > 1e9, '時間制限が無い');
ok(st.終了判定 === false, '試合が終了しない');

// 60 秒ぶん進めても終わらないか
await page.evaluate(`(() => { const g = window.__DEV.game; for (let i = 0; i < 3600; i++) g.update(1 / 60); })()`);
const after = JSON.parse(await page.evaluate(`(() => {
  const g = window.__DEV.game;
  return JSON.stringify({ 終了判定: g.mode.isOver(), 死亡回数: g.playerStats.deaths });
})()`));
ok(after.終了判定 === false, '60 秒経っても終了しない');
ok(after.死亡回数 === 0, '誰にも撃たれない');

// 浮遊の切り替え
const fly = JSON.parse(await page.evaluate(`(() => {
  const d = window.__DEV, g = d.game;
  const before = { y: g.player.position.y, noclip: g.player.noclip };
  d.input.setAction('interact', true);
  g.update(1 / 60);
  d.input.setAction('interact', false);
  const on = g.player.noclip;
  // 上昇してみる
  d.input.setAction('jump', true);
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  d.input.setAction('jump', false);
  const risen = g.player.position.y;
  // 壁抜けできるか（真横へ押し込む）
  const x0 = g.player.position.x;
  d.input.move.x = 0; d.input.move.y = 1;
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  d.input.move.y = 0;
  return JSON.stringify({
    切替前: before, 浮遊: on,
    上昇後y: +risen.toFixed(2), 前進距離: +Math.abs(g.player.position.x - x0).toFixed(1),
  });
})()`));
console.log(JSON.stringify(fly, null, 1));
ok(fly.浮遊 === true, 'F キーで浮遊に切り替わる');
ok(fly.上昇後y > fly.切替前.y + 5, `上昇できる（y ${fly.切替前.y.toFixed(2)} → ${fly.上昇後y}）`);

// HUD ごと（得点や時計が壊れていないか目で見る）
await page.evaluate(`(() => {
  const d = window.__DEV, g = d.game;
  d.input.move.x = 0; d.input.move.y = 0;
  g.player.position.set(0, 34, 56);
  g.player.yaw = 0; g.player.pitch = -0.42;   // yaw=0 は -Z 向き＝マップの中心側
  g.update(1 / 60);
  g.paused = true;
})()`);
await page.waitForTimeout(3200);
await page.screenshot({ path: `${outDir}/hud.png`, timeout: 180000 });
console.log('撮影: hud');

await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game.paused = true;
  d.hud.hide();
  const cam = d.engine.camera;
  cam.fov = 74; cam.updateProjectionMatrix();
  cam.position.set(0, 40, 66);
  cam.lookAt(new d.THREE.Vector3(0, 0, 0));
  cam.updateMatrixWorld();
})()`);
await page.waitForTimeout(3200);
await page.screenshot({ path: `${outDir}/mapview.png`, timeout: 180000 });

console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 5).join('\n') : '\nJS エラーなし');
await browser.close();
