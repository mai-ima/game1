/**
 * 1 セッション内で複数設定のスクリーンショットを撮る調整用ツール。
 *   node tools/tune.mjs '<JSON配列>'
 * 各要素: { name, apply: "JS式文字列" }
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.env.URL || 'http://localhost:5173';
const configs = JSON.parse(process.argv[2]);
const wait = parseInt(process.argv[3] || '28000', 10);
const outDir = process.argv[4] || 'shots/tune';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(wait);

for (const c of configs) {
  try {
    const r = await page.evaluate(c.apply);
    await page.waitForTimeout(c.settle || 1400);
    const out = `${outDir}/${c.name}.png`;
    await page.screenshot({ path: out });
    console.log(`${c.name}: ${typeof r === 'string' ? r : JSON.stringify(r)}`);
  } catch (e) {
    console.log(`${c.name}: エラー ${e.message}`);
  }
}
if (logs.length) console.log('\n--- ログ ---\n' + logs.slice(0, 20).join('\n'));
await browser.close();
