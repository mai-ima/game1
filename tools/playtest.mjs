/**
 * 自動プレイテスト。
 * 対戦を開始し、射撃・覗き込み・リロード・武器切替・移動を一通り実行して
 * 例外が出ないかを確認する。
 *
 *   node tools/playtest.mjs [url] [秒数]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:4173/';
const seconds = parseInt(process.argv[3] || '40', 10);
const outDir = 'shots/playtest';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });

const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 6).join('\n')}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('404')) errors.push(`[console] ${t}`);
  else if (m.type() === 'warning') logs.push(`[warn] ${t}`);
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('起動待ち…');
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
console.log('起動完了。対戦を開始します。');

await page.evaluate('window.__DEV.startMatch()');
// レベル生成とボット配置の完了を待つ
await page.waitForFunction('window.__DEV.game.running === true', { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(8000);

/** ゲーム内で一連の操作を行う */
const step = async (name, expr, waitMs = 2500) => {
  const before = errors.length;
  try {
    await page.evaluate(expr);
  } catch (e) {
    errors.push(`[evaluate:${name}] ${e.message}`);
  }
  await page.waitForTimeout(waitMs);
  const added = errors.length - before;
  console.log(`  ${added ? '×' : '○'} ${name}${added ? ` (${added}件のエラー)` : ''}`);
};

console.log('\n--- 操作テスト ---');
await step('射撃(連射)', 'window.__DEV.input.setAction("fire", true)', 4000);
await step('射撃停止', 'window.__DEV.input.setAction("fire", false)', 1200);
await step('覗き込み(ADS)', 'window.__DEV.input.setAction("ads", true)', 3000);
await step('ADS中に射撃', 'window.__DEV.input.setAction("fire", true)', 3000);
await step('射撃停止', 'window.__DEV.input.setAction("fire", false)', 800);
await step('ADS解除', 'window.__DEV.input.setAction("ads", false)', 1500);
await step('リロード', 'window.__DEV.input.tapAction("reload")', 3500);
await step('武器切替(サブ)', 'window.__DEV.game.weapons.equip(1)', 2500);
await step('サブで射撃', 'window.__DEV.input.setAction("fire", true)', 2500);
await step('射撃停止', 'window.__DEV.input.setAction("fire", false)', 600);
await step('武器切替(メイン)', 'window.__DEV.game.weapons.equip(0)', 2500);
await step('しゃがみ', 'window.__DEV.input.tapAction("crouch")', 1500);
await step('ジャンプ', 'window.__DEV.input.tapAction("jump")', 1800);
await step('移動+スプリント', 'const d=window.__DEV;d.input._dirs.forward=true;d.input.setAction("sprint",true)', 4000);
await step('スライディング', 'window.__DEV.input.tapAction("crouch")', 2500);
await step('移動停止', 'const d=window.__DEV;d.input._dirs.forward=false;d.input.setAction("sprint",false)', 1500);
await step('スコープ装備(8倍)', `
  const d = window.__DEV;
  d.game.weapons.setLoadout(['sniper','pistol'], { sniper:['scope8x'] });`, 4000);
await step('スコープ覗き込み', 'window.__DEV.input.setAction("ads", true)', 4000);
await step('スコープで射撃', 'window.__DEV.input.setAction("fire", true)', 3000);
await step('射撃停止', 'window.__DEV.input.setAction("fire", false)', 800);
await page.screenshot({ path: `${outDir}/scope.png`, timeout: 60000 }).catch(() => console.log('  (スクショ省略)'));
await step('スコープ解除', 'window.__DEV.input.setAction("ads", false)', 2000);
await step('AK-47+レッドドット', `
  const d = window.__DEV;
  d.game.weapons.setLoadout(['ak47','pistol'], { ak47:['redDot'] });`, 4000);
await step('AK連射', 'window.__DEV.input.setAction("fire", true)', 4000);
await step('射撃停止', 'window.__DEV.input.setAction("fire", false)', 800);
await step('ショットガン', `
  const d = window.__DEV;
  d.game.weapons.setLoadout(['shotgun','pistol'], {});`, 4000);
await step('ショットガン射撃', 'window.__DEV.input.setAction("fire", true)', 3500);
await step('射撃停止', 'window.__DEV.input.setAction("fire", false)', 800);
await step('スコアボード', 'window.__DEV.hud.setBoard(true, {mode:"テスト",map:"コンパウンド",teamA:[],teamB:[],scoreA:0,scoreB:0})', 1200);

// 放置して AI と物理を回す
console.log(`\n--- ${seconds}秒 放置して安定性を確認 ---`);
await page.waitForTimeout(seconds * 1000);
await page.screenshot({ path: `${outDir}/final.png`, timeout: 60000 }).catch(() => console.log('  (スクショ省略)'));

const state = await page.evaluate(`(() => {
  const g = window.__DEV.game;
  return JSON.stringify({
    running: g.running, time: Math.round(g.time),
    hp: Math.round(g.playerStats.hp), kills: g.playerStats.kills, deaths: g.playerStats.deaths,
    bots: g.bots.length, alive: g.bots.filter(b => b.alive).length,
  });
})()`);

console.log('\n--- 結果 ---');
console.log('状態:', state);
if (errors.length) {
  console.log(`\n!!! エラー ${errors.length} 件 !!!`);
  console.log([...new Set(errors)].slice(0, 12).join('\n---\n'));
} else {
  console.log('エラーなし');
}
await browser.close();
process.exit(errors.length ? 1 : 0);
