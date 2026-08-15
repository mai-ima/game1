/**
 * 部屋の中を「面」で確かめる。
 *
 * stairprobe は 1 本の直線しか歩かない。それで奥まで届いても、
 * 実際には机の脇をすり抜けただけで、部屋の半分に立てないことがある。
 * 逆に扉の正面に椅子が 1 脚あるだけで、部屋ごと入れないように見える。
 *
 * ここでは指定した矩形を格子に切り、1 マスずつ
 *   1. 足元の床を探す（段差に乗る想定で、少し上から下を見る）
 *   2. その高さに体を置いて、何かと重なるか
 * を調べ、さらに入口から塗りつぶして「歩いて行けるか」を出す。
 * 塗りつぶしは登れる段差（0.42m）を超える隣は繋げない。
 *
 *   node tools/walkmap.mjs [url] "名前|x0,z0,x1,z1|入口x,入口z|床の高さ" ...
 *
 * 記号
 *   ・ 立てて、入口から歩いて行ける（床は基準の高さ）
 *   1〜9 同上。数字は基準からの段差（10cm 単位）
 *   ｘ 立てるが、入口から行けない（家具で囲まれている／段差が高すぎる）
 *   █ 立てない（壁・家具の中）
 *   ＿ 足元に床が無い（落ちる）
 *
 * 最後に、その矩形に掛かるコライダを大きい順に並べる。
 * 「どこが塞がっているか」と「何が塞いでいるか」を一度に見るため。
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=testbed';
const rooms = process.argv.slice(3).map((s) => {
  const [name, rect, entry, y] = s.split('|');
  const [x0, z0, x1, z1] = rect.split(',').map(Number);
  const [ex, ez] = entry.split(',').map(Number);
  return { name, x0, z0, x1, z1, ex, ez, y: +(y ?? 0.0) };
});

const STEP = 0.25;     // 格子の刻み。プレイヤーの半径 0.34 より細かく取る
const STEP_UP = 0.42;  // 登れる段差（Physics の stepHeight と合わせる）
const PROBE = 0.60;    // 床を探し始める高さ。上がり框や縁側に乗る想定

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('例外:', e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.waitForTimeout(1200);

const SURF = ['コンクリート', '金属', '木', '土', '砂', '砂利', '布', 'ゴム', 'ガラス', '水'];

for (const r of rooms) {
  const out = await page.evaluate(`(() => {
    const d = window.__DEV, g = d.game, ph = g.physics, p = g.player;
    const R = p.radius ?? 0.34, H = p.height ?? 1.8;
    const S = ${STEP}, BASE = ${r.y}, PROBE = ${PROBE};
    const nx = Math.max(1, Math.round((${r.x1} - ${r.x0}) / S) + 1);
    const nz = Math.max(1, Math.round((${r.z1} - ${r.z0}) / S) + 1);
    const cell = [], hgt = [];       // 0=立てない 1=立てる 2=床が無い
    const save = p.position.clone();
    for (let j = 0; j < nz; j++) {
      const row = [], hrow = [];
      for (let i = 0; i < nx; i++) {
        const x = ${r.x0} + i * S, z = ${r.z0} + j * S;
        // 少し上から足元を探す。段差の上に立つ場合を拾うため
        p.position.set(x, BASE + PROBE, z);
        const gr = ph._groundBelow(p.position, R, PROBE + 0.25);
        if (gr === null) { row.push(2); hrow.push(0); continue; }
        p.position.set(x, gr, z);
        row.push(ph._overlaps(p.position, R, H) ? 0 : 1);
        hrow.push(gr);
      }
      cell.push(row); hgt.push(hrow);
    }
    p.position.copy(save);

    // 入口から塗りつぶす（4 近傍。登れる段差だけ繋ぐ）
    const gi = Math.round((${r.ex} - ${r.x0}) / S), gj = Math.round((${r.ez} - ${r.z0}) / S);
    const seen = cell.map((row) => row.map(() => false));
    const okStart = gi >= 0 && gi < nx && gj >= 0 && gj < nz && cell[gj][gi] === 1;
    if (okStart) {
      const q = [[gi, gj]]; seen[gj][gi] = true;
      while (q.length) {
        const [i, j] = q.pop();
        for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const a = i + di, bq = j + dj;
          if (a < 0 || a >= nx || bq < 0 || bq >= nz) continue;
          if (seen[bq][a] || cell[bq][a] !== 1) continue;
          const dy = hgt[bq][a] - hgt[j][i];
          if (dy > ${STEP_UP}) continue;        // 登れない段差
          seen[bq][a] = true; q.push([a, bq]);
        }
      }
    }

    // 矩形に掛かるコライダ
    const hits = [];
    for (const c of ph.colliders) {
      if (!c.blocksMovement) continue;
      if (c.max.x < ${r.x0} - 0.4 || c.min.x > ${r.x1} + 0.4) continue;
      if (c.max.z < ${r.z0} - 0.4 || c.min.z > ${r.z1} + 0.4) continue;
      if (c.min.y > BASE + 2.0 || c.max.y < BASE) continue;
      hits.push({
        c: [+c.center.x.toFixed(2), +c.center.y.toFixed(2), +c.center.z.toFixed(2)],
        h: [+(c.half.x * 2).toFixed(2), +(c.half.y * 2).toFixed(2), +(c.half.z * 2).toFixed(2)],
        y: [+c.min.y.toFixed(2), +c.max.y.toFixed(2)],
        s: c.surface, yaw: +(c.yaw ?? 0).toFixed(2),
      });
    }
    hits.sort((a, b2) => (b2.h[0] * b2.h[2]) - (a.h[0] * a.h[2]));
    return JSON.stringify({ nx, nz, cell, hgt, seen, okStart, hits: hits.slice(0, 26), total: hits.length });
  })()`);

  const j = JSON.parse(out);
  let stand = 0, reach = 0, floor = 0;
  console.log(`\n== ${r.name} ==  x ${r.x0}〜${r.x1} / z ${r.z0}〜${r.z1}   入口 (${r.ex}, ${r.ez})`);
  if (!j.okStart) console.log('  ※ 入口の位置に立てない。到達判定は出せない');
  for (let jj = 0; jj < j.nz; jj++) {
    let line = '';
    for (let i = 0; i < j.nx; i++) {
      const c = j.cell[jj][i];
      if (c === 2) { line += '＿'; continue; }
      floor++;
      if (c === 0) { line += '█'; continue; }
      stand++;
      if (!j.seen[jj][i]) { line += 'ｘ'; continue; }
      reach++;
      const dh = Math.round((j.hgt[jj][i] - r.y) * 10);
      line += dh <= 0 ? '・' : (dh < 10 ? String(dh) : '＊');
    }
    console.log(`  z${(r.z0 + jj * STEP).toFixed(1).padStart(7)} ${line}`);
  }
  const tot = j.nx * j.nz;
  console.log(`  床あり ${floor}/${tot}   立てる ${stand}   入口から歩ける ${reach}`
    + (stand > reach ? `   ※ 孤立 ${stand - reach} マス` : ''));
  console.log(`  -- 掛かるコライダ ${j.total} 個（面積の大きい順に ${j.hits.length}） --`);
  for (const h of j.hits) {
    console.log(`   中心 ${h.c.join(', ').padEnd(22)} 大 ${h.h.join('×').padEnd(19)}`
      + ` y ${h.y[0]}〜${h.y[1]}`.padEnd(15) + ` 向き ${h.yaw}  ${SURF[h.s] ?? h.s}`);
  }
}
await browser.close();
