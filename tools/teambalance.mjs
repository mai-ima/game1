/**
 * 味方チームと敵チームの強さが釣り合っているかを測る。
 *
 * 自機を戦場から外し、ボットだけで撃ち合わせて撃破数を比べる。
 * 「味方が弱すぎる」という体感が、練度差なのか自機への集中砲火の
 * 副作用なのかを切り分けるための計測。
 *
 *   node tools/teambalance.mjs [url] [難易度] [秒] [試行数]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const diff = process.argv[3] || 'regular';
const seconds = parseFloat(process.argv[4] || '60');
const trials = parseInt(process.argv[5] || '3', 10);
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 380 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('ERR', e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate(`(async () => {
  const d = window.__DEV;
  d.menu.sel.mode = 'tdm';
  d.menu.sel.difficulty = ${JSON.stringify(diff)};
  await d.startMatch(d.menu.sel);
})()`);
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});

await page.evaluate(`(() => {
  const d = window.__DEV, g = d.game;
  /*
   * 自機は戦場から外す。
   * 生きたまま残すとボット全員が自機に群がり、チーム同士の
   * 撃ち合いが起きなくなって比較にならない。
   */
  g.player.enabled = false;
  g.playerStats.alive = false;
  window.__STEP = (n, dt) => { for (let i = 0; i < n; i++) { g.playerStats.alive = false; g.update(dt); } };
  window.__RESET = () => {
    for (const b of g.bots) { b.kills = 0; b.deaths = 0; }
  };
  window.__TALLY = () => {
    const my = g.playerStats.team;
    let ak = 0, ad = 0, ek = 0, ed = 0;
    for (const b of g.bots) {
      if (b.team === my) { ak += b.kills; ad += b.deaths; } else { ek += b.kills; ed += b.deaths; }
    }
    return { 味方撃破: ak, 味方戦死: ad, 敵撃破: ek, 敵戦死: ed };
  };
})()`);

const sum = { 味方撃破: 0, 味方戦死: 0, 敵撃破: 0, 敵戦死: 0 };
for (let t = 0; t < trials; t++) {
  await page.evaluate('window.__RESET()');
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 120) await page.evaluate(`window.__STEP(${Math.min(120, steps - i)}, 1/60)`);
  const r = JSON.parse(await page.evaluate('JSON.stringify(window.__TALLY())'));
  for (const k in sum) sum[k] += r[k];
  console.log(`試行${t + 1}: 味方 ${r.味方撃破} 撃破 / ${r.味方戦死} 戦死   敵 ${r.敵撃破} 撃破 / ${r.敵戦死} 戦死`);
}

const ratio = sum.敵撃破 > 0 ? (sum.味方撃破 / sum.敵撃破).toFixed(2) : '∞';
console.log(`\n合計 ${trials} 試行 × ${seconds} 秒`);
console.log(JSON.stringify(sum));
console.log(`味方の撃破数 ÷ 敵の撃破数 = ${ratio}  （1.0 前後なら互角）`);
await browser.close();
