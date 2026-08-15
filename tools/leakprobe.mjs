/**
 * 敷地の外へ出られる場所を探す。
 *
 * 塀は「立っていれば止めている」わけではない。
 * テストベッドの万年塀は、板をすべて collide:false で置き、
 * 当たり判定は 2m 間隔の柱（走り方向の見付け 0.16m）と
 * 高さ 0.18m の基礎だけだった。柱と柱の間に 1.84m の穴があり、
 * 直径 0.68m のプレイヤーはそのまま歩いて抜けられた。
 * 抜けた先は敷地スラブの外なので、落ち続けて戻れない。
 *
 * 見た目は完全に塞がって見えるので、撮っても判らない。
 * ここでは外周の内側に沿って一定間隔で立たせ、外向きに歩かせて、
 * 境界線を越えた点を座標付きで並べる。
 *
 *   node tools/leakprobe.mjs [url] [間隔m]
 *
 * 境界はマップの bounds を使う。bounds の 1m 内側から歩き出し、
 * bounds を 1.5m 越えたら「抜けた」と数える。
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=testbed';
const step = parseFloat(process.argv[3] || '1.5');

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

const out = await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE, g = d.game, ph = g.physics, p = g.player;
  const bb = g.mapInfo.bounds;
  const R = p.radius ?? 0.34, H = p.height ?? 1.8;
  const S = ${step};

  const INSET = 1.0;     // 歩き出す位置（境界の内側）
  const OUT = 1.5;       // これだけ越えたら抜けたと数える
  const FRAMES = 90;     // 1 点あたり 1.5 秒ぶん
  const SPEED = 5.0;

  const pos = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const leaks = [];
  let tested = 0;

  /** 1 点を外向きに歩かせる。抜けたら最終位置を返す */
  const push = (sx, sz, dx, dz, y) => {
    pos.set(sx, y, sz);
    // 足元を拾ってから歩き出す（浮いた位置から始めると落下判定になる）
    const gr = ph._groundBelow(pos, R, 3.0);
    if (gr === null) return null;               // そもそも床が無い
    pos.y = gr;
    if (ph._overlaps(pos, R, H)) return null;   // 塀や物の中。ここからは試せない
    for (let i = 0; i < FRAMES; i++) {
      delta.set(dx * SPEED / 60, -9.8 / 60, dz * SPEED / 60);
      ph.moveCharacter(pos, R, H, delta, { stepHeight: 0.42 });
      if (pos.y < -20) break;                   // 落ちた
    }
    const outX = dx > 0 ? pos.x - bb.max.x : (dx < 0 ? bb.min.x - pos.x : -99);
    const outZ = dz > 0 ? pos.z - bb.max.z : (dz < 0 ? bb.min.z - pos.z : -99);
    const escaped = Math.max(outX, outZ) > OUT || pos.y < -3;
    return escaped ? { x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), z: +pos.z.toFixed(1) } : null;
  };

  // 4 辺を走査
  const edges = [
    { name: '北辺', dx: 0, dz: -1, fixed: bb.min.z + INSET, along: 'x' },
    { name: '南辺', dx: 0, dz: 1, fixed: bb.max.z - INSET, along: 'x' },
    { name: '西辺', dx: -1, dz: 0, fixed: bb.min.x + INSET, along: 'z' },
    { name: '東辺', dx: 1, dz: 0, fixed: bb.max.x - INSET, along: 'z' },
  ];
  for (const e of edges) {
    const a0 = e.along === 'x' ? bb.min.x + 2 : bb.min.z + 2;
    const a1 = e.along === 'x' ? bb.max.x - 2 : bb.max.z - 2;
    let hit = 0;
    for (let a = a0; a <= a1; a += S) {
      const sx = e.along === 'x' ? a : e.fixed;
      const sz = e.along === 'x' ? e.fixed : a;
      tested++;
      const r = push(sx, sz, e.dx, e.dz, 1.0);
      if (r) { hit++; leaks.push({ 辺: e.name, 出た位置: [sx.toFixed(1), sz.toFixed(1)], 到達: [r.x, r.y, r.z] }); }
    }
  }
  return JSON.stringify({ 境界: [bb.min.x, bb.min.z, bb.max.x, bb.max.z], 試した点: tested, 抜けた点: leaks });
})()`);

const d = JSON.parse(out);
const [x0, z0, x1, z1] = d.境界;
console.log(`境界 x ${x0}〜${x1} / z ${z0}〜${z1} の内側 1m を ${step}m 間隔で ${d.試した点} 点`);
if (!d.抜けた点.length) {
  console.log('○ どこからも敷地の外へ出られない');
} else {
  const byEdge = {};
  for (const l of d.抜けた点) (byEdge[l.辺] ??= []).push(l);
  console.log(`× 敷地の外へ出られる点が ${d.抜けた点.length} 個:`);
  for (const [name, list] of Object.entries(byEdge)) {
    console.log(`  ${name}: ${list.length} 点 / ${d.試した点 / 4} 点中`);
    for (const l of list.slice(0, 6)) {
      console.log(`     (${l.出た位置.join(', ')}) から歩いて (${l.到達.join(', ')}) まで出た`);
    }
    if (list.length > 6) console.log(`     …ほか ${list.length - 6} 点`);
  }
}
await browser.close();
