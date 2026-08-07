/**
 * スマートフォン表示の検証用スクリーンショット。
 * タッチ端末として認識させ、モバイル操作 UI を表示させた状態で撮る。
 *
 *   node tools/mobileshot.mjs <device> <out> <waitMs>
 */
import { chromium, devices } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const deviceName = process.argv[2] || 'iPhone 14 Pro Max landscape';
const out = process.argv[3] || 'shots/mobile/phone.png';
const wait = parseInt(process.argv[4] || '90000', 10);
const url = process.env.URL || 'http://localhost:4173/';

if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const dev = devices[deviceName];
if (!dev) { console.error('未知の端末:', deviceName); process.exit(1); }

const ctx = await browser.newContext({ ...dev, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
// __DEV が生えるまで待つ（ソフトウェア描画では初期化に時間がかかる）
await page.waitForFunction('!!window.__DEV', { timeout: 240000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: out.replace(/\.png$/, '_title.png'), timeout: 180000 });
console.log('保存:', out.replace(/\.png$/, '_title.png'));

// メニューへ進み、対戦を開始する
try {
  await page.evaluate('window.__DEV && window.__DEV.menu.showMenu()');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out.replace(/\.png$/, '_menu.png'), timeout: 180000 });
  console.log('保存:', out.replace(/\.png$/, '_menu.png'));

  await page.evaluate('window.__DEV && window.__DEV.startMatch()');
  await page.waitForTimeout(wait);
  await page.screenshot({ path: out, timeout: 180000 });
  console.log('保存:', out);
} catch (e) {
  console.error('エラー:', e.message);
}

console.log('端末:', deviceName, dev.viewport);
if (logs.length) console.log(logs.slice(0, 12).join('\n'));
await browser.close();
