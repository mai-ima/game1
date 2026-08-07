/**
 * 動的解像度（DRS）と自動画質降格の動作確認。
 * ソフトウェア描画で意図的に重い状況を作り、
 * 解像度と画質が段階的に下がっていくかを見る。
 *
 *   node tools/drs.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
page.on('crash', () => errors.push('!!! ページがクラッシュ !!!'));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });

// 独立した rAF カウンタ（完全停止の検出用）
await page.evaluate(`
  window.__W = { raf: 0, last: performance.now(), maxGap: 0 };
  (function tick() {
    const n = performance.now();
    window.__W.maxGap = Math.max(window.__W.maxGap, n - window.__W.last);
    window.__W.last = n; window.__W.raf++;
    requestAnimationFrame(tick);
  })();
`);

const t0 = Date.now();
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});
console.log(`対戦開始までの所要: ${((Date.now() - t0) / 1000).toFixed(1)}秒`);

const snap = async (label) => {
  const r = await page.evaluate(`(() => {
    const e = window.__DEV.engine, W = window.__W;
    const o = {
      画質: e.quality,
      解像度: e.renderSize,
      倍率: e.renderScale,
      平均フレームms: Math.round(e._frameMs * 10) / 10,
      最大フレーム間隔ms: Math.round(W.maxGap),
      raf: W.raf,
      draws: e.drawCalls,
      ボイス数: window.__DEV.audio._voices ? window.__DEV.audio._voices.length : -1,
    };
    W.maxGap = 0;
    return JSON.stringify(o);
  })()`);
  console.log(label.padEnd(10), r);
  return JSON.parse(r);
};

let prev = await snap('開始直後');
// 撃ちっぱなしで負荷をかけ続ける
await page.evaluate('window.__DEV.input.setAction("fire", true)');
for (let i = 1; i <= 8; i++) {
  await page.waitForTimeout(8000);
  const cur = await snap(`${i * 8}秒`);
  if (cur.raf === prev.raf) { console.log('!!! rAF 停止 = 完全フリーズ !!!'); break; }
  prev = cur;
}
await page.evaluate('window.__DEV.input.setAction("fire", false)');

console.log('\n=== 結果 ===');
console.log(errors.length ? 'エラー:\n' + [...new Set(errors)].slice(0, 8).join('\n') : 'JS エラーなし');
await browser.close();
