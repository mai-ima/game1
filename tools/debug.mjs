import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:5173';
const expr = process.argv[3] || 'JSON.stringify({ok:true})';
const wait = parseInt(process.argv[4] || '20000', 10);

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(wait);
try {
  const r = await page.evaluate(expr);
  console.log('== 評価結果 ==');
  console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 2));
} catch (e) {
  console.log('評価エラー:', e.message);
}
console.log('\n== ログ ==');
console.log(logs.slice(0, 50).join('\n'));
await browser.close();
