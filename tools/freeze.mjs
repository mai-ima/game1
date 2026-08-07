/**
 * フリーズ検出。
 * requestAnimationFrame の進行を直接監視し、
 * 「完全に停止した」のか「遅いだけ」なのかを切り分ける。
 * 併せてヒープ使用量・WebGL リソース数・DOM ノード数の推移を記録する。
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:4173/';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });

const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
page.on('crash', () => errors.push('!!! ページがクラッシュしました !!!'));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });

// rAF の進行を独立して数える（ゲームのループとは別に回す）
await page.evaluate(`
  window.__W = { raf: 0, lastRaf: performance.now(), maxGap: 0, gl: null };
  (function tick() {
    const now = performance.now();
    const gap = now - window.__W.lastRaf;
    if (gap > window.__W.maxGap) window.__W.maxGap = gap;
    window.__W.lastRaf = now;
    window.__W.raf++;
    requestAnimationFrame(tick);
  })();
`);

const snap = async (label) => {
  const r = await page.evaluate(`(() => {
    const W = window.__W, e = window.__DEV.engine, g = window.__DEV.game;
    const info = e.renderer.info;
    const m = performance.memory;
    const out = {
      raf: W.raf,
      最大フレーム間隔ms: Math.round(W.maxGap),
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: e.renderer.info.programs ? e.renderer.info.programs.length : -1,
      sceneObjects: (() => { let n = 0; e.scene.traverse(() => n++); return n; })(),
      domNodes: document.getElementsByTagName('*').length,
      heapMB: m ? Math.round(m.usedJSHeapSize / 1048576) : -1,
      audioNodes: window.__DEV.audio?.ctx ? window.__DEV.audio.ctx.state : 'なし',
      particles: g.effects ? g.effects.particles.filter(p => p.active).length : -1,
      tempLights: g.effects?._tempLights?.length ?? 0,
      feedRows: window.__DEV.hud._feedRows.length,
      bots: g.bots.length,
    };
    W.maxGap = 0;
    return JSON.stringify(out);
  })()`);
  console.log(label.padEnd(14), r);
  return JSON.parse(r);
};

console.log('=== 起動直後 ===');
let prev = await snap('起動');

await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(10000);
prev = await snap('対戦開始');

// 実際の操作を繰り返して負荷をかける
const cycles = 6;
for (let i = 1; i <= cycles; i++) {
  await page.evaluate(`
    const d = window.__DEV;
    d.input.setAction('fire', true);
    d.input._dirs.forward = true;
  `);
  await page.waitForTimeout(6000);
  await page.evaluate(`
    const d = window.__DEV;
    d.input.setAction('fire', false);
    d.input.setAction('ads', true);
  `);
  await page.waitForTimeout(4000);
  await page.evaluate(`
    const d = window.__DEV;
    d.input.setAction('ads', false);
    d.input.tapAction('reload');
    d.input._dirs.forward = false;
  `);
  await page.waitForTimeout(4000);

  const cur = await snap(`周回 ${i}`);
  // rAF が進んでいなければ完全停止
  if (cur.raf === prev.raf) {
    console.log('\n!!! rAF が進行していません = 完全フリーズ !!!');
    break;
  }
  prev = cur;
}

console.log('\n=== 結果 ===');
if (errors.length) console.log('エラー:', [...new Set(errors)].slice(0, 8).join('\n'));
else console.log('JS エラーなし');
await browser.close();
