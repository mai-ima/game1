/**
 * マップが組み上がるかどうかだけを、短く確かめる。
 *
 * 他の検査（walkmap / aimcheck / leakprobe）は、マップが組み上がる前提で
 * running になるのを 10 分待つ。組み立ての途中で例外が出ると、
 * どれも黙って 10 分待ってから何も出さずに終わるので、
 * 「検査が遅い」のか「マップが壊れている」のか区別が付かない。
 *
 * ここでは待ち時間を短く切り、コンソールと例外をそのまま出す。
 * 何かおかしいと思ったら、まずこれを回す。
 *
 *   node tools/loadcheck.mjs [url] [待つ秒数]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=testbed';
const waitSec = parseInt(process.argv[3] || '240', 10);

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });

/*
 * 例外はためずに、出た瞬間に書く。
 * 最後にまとめて出す作りにしていたら、途中で待ち時間を超えて
 * 落ちたときに 1 行も残らず、何が起きたのか判らなかった。
 */
const errs = [];
const say = (s) => { errs.push(s); console.log(s); };
page.on('pageerror', (e) => say('例外: ' + e.message.split('\n')[0]));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('404')) say('コンソール: ' + t.slice(0, 220));
  // マップ側の警告（区画の重なりなど）は必ず出す
  else if (/テストベッド|警告|warn/i.test(t)) console.log('  ' + t.slice(0, 220));
});

const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 120000 });
console.log(`起動 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

await page.evaluate('window.__DEV.startMatch()');
const ok = await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: waitSec * 1000 })
  .then(() => true).catch(() => false);
console.log(`マップ構築 ${((Date.now() - t0) / 1000).toFixed(1)}s: ${ok ? '成功' : `失敗（${waitSec} 秒待っても running にならない）`}`);

if (ok) {
  const s = await page.evaluate(`(() => {
    const d = window.__DEV, g = d.game;
    let tri = 0, mesh = 0;
    d.engine.scene.traverse((o) => {
      if (!o.isMesh) return;
      mesh++;
      const p = o.geometry?.getAttribute?.('position');
      if (p) tri += p.count / 3;
    });
    const tf = d.mats.tf;
    return JSON.stringify({
      コライダ: g.physics.colliders.length,
      メッシュ: mesh,
      三角形: Math.round(tri),
      材質: d.mats.cache?.size ?? null,
      テクスチャ組: tf?.cache?.size ?? null,
      テクスチャMB: tf ? +(tf.bytes / 1048576).toFixed(0) : null,
      上限MB: tf ? +(tf.budget / 1048576).toFixed(0) : null,
      解像度を落とした回数: tf?.downgraded ?? null,
      光源: g.map?.lights?.length ?? null,
    });
  })()`);
  for (const [k, v] of Object.entries(JSON.parse(s))) console.log(`  ${k}: ${v}`);
}
console.log(errs.length ? '\n' + [...new Set(errs)].slice(0, 8).join('\n') : '\nJS エラーなし');
await browser.close();
process.exitCode = ok && !errs.length ? 0 : 1;
