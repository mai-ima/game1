/**
 * 対戦中の画面をまとめて撮る。
 * 修正後の見た目に破綻がないかを目視で確認するためのもの。
 *
 *   node tools/shotgame.mjs [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=high';
const outDir = process.argv[3] || 'shots/fix';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });

const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });

const shot = async (name, ms = 6000) => {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 120000 });
  console.log('撮影:', name);
};

// メニュー
await page.evaluate('window.__DEV.menu.showMenu?.()').catch(() => {});
await shot('02_menu', 4000);

await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});
await shot('03_game', 12000);

// 覗き込み
await page.evaluate('window.__DEV.input.setAction("ads", true)');
await shot('04_ads', 8000);
await page.evaluate('window.__DEV.input.setAction("ads", false)');

// スナイパースコープ（黒縁を radial-gradient に置き換えた箇所の確認）
await page.evaluate(`window.__DEV.game.weapons.setLoadout(['sniper','pistol'], { sniper:['scope8x'] })`);
await page.waitForTimeout(4000);
await page.evaluate('window.__DEV.input.setAction("ads", true)');
await shot('05_scope', 10000);
await page.evaluate('window.__DEV.input.setAction("ads", false)');

// 射撃
await page.evaluate('window.__DEV.input.setAction("fire", true)');
await shot('06_fire', 6000);
await page.evaluate('window.__DEV.input.setAction("fire", false)');

// スコアボード
await page.evaluate(`window.__DEV.hud.setBoard(true, {
  mode:'チームデスマッチ', map:'コンパウンド',
  teamA:[{name:'あなた',kills:7,deaths:3,score:900,me:true},{name:'アイリス',kills:4,deaths:5,score:520}],
  teamB:[{name:'ヴィクター',kills:6,deaths:4,score:760},{name:'デルタ',kills:2,deaths:6,score:300}],
  scoreA:34, scoreB:29 })`);
await shot('07_board', 2500);

const info = await page.evaluate(`JSON.stringify({
  画質: window.__DEV.engine.quality,
  解像度: window.__DEV.engine.renderSize,
  GPU: window.__DEV.engine.gpu.name,
})`);
console.log(info);
console.log(errors.length ? 'エラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : 'JS エラーなし');
await browser.close();
