/**
 * Playwright によるスクリーンショット取得ツール。
 *
 *   node tools/screenshot.mjs --url http://localhost:5173 --out shots/a.png \
 *        --w 1920 --h 1080 --wait 6000 --script "window.__DEV.showcase()"
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
}

const url = args.url || 'http://localhost:5173';
const out = args.out || 'shots/shot.png';
const W = parseInt(args.w || '1920', 10);
const H = parseInt(args.h || '1080', 10);
const wait = parseInt(args.wait || '7000', 10);
const script = args.script || null;
const device = args.device || null;
const scale = parseFloat(args.scale || '1');

if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });

// 環境に用意された Chromium を直接使う（Playwright 同梱版とビルド番号が異なるため）
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];
const execPath = CHROME_CANDIDATES.find((p) => p && existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--disable-web-security',
  ],
});

const ctxOpts = device && devices[device]
  ? { ...devices[device] }
  : { viewport: { width: W, height: H }, deviceScaleFactor: scale };

const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(wait);
  if (script) {
    await page.evaluate(script);
    await page.waitForTimeout(parseInt(args.postwait || '2500', 10));
  }
  await page.screenshot({ path: out, timeout: 180000 });
  console.log(`保存: ${out}`);
} catch (e) {
  console.error('エラー:', e.message);
} finally {
  if (logs.length) {
    console.log('\n--- ブラウザログ ---');
    console.log(logs.slice(0, 60).join('\n'));
  }
  await browser.close();
}
