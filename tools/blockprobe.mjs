/**
 * 「そこに立てない」原因を特定する。
 *
 * 歩かせて止まったとき、何にぶつかっているのかは
 * 画面を見ても分からないことが多い。家具なのか、壁なのか、
 * 見えない当たり判定なのか。
 *
 * ここではプレイヤーの体が占める箱と重なるコライダを全部列挙し、
 * 中心座標・大きさ・表面種別を並べる。
 *
 *   node tools/blockprobe.mjs [url] "名前|x,y,z" ...
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=testbed';
const spots = process.argv.slice(3).map((s) => {
  const [name, pos] = s.split('|');
  return { name, pos: pos.split(',').map(Number) };
});

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

for (const s of spots) {
  const out = await page.evaluate(`(() => {
    const d = window.__DEV, g = d.game, ph = g.physics, p = g.player;
    const [px, py, pz] = [${s.pos.join(',')}];
    const R = p.radius ?? 0.34, H = p.height ?? 1.8;
    const lo = { x: px - R, y: py, z: pz - R };
    const hi = { x: px + R, y: py + H, z: pz + R };
    const hits = [];
    for (const c of ph.colliders) {
      // 回転を無視した粗い判定。並べて眺めるには十分
      const cx = c.center ? c.center.x : c.cx;
      const cy = c.center ? c.center.y : c.cy;
      const cz2 = c.center ? c.center.z : c.cz;
      const hx = c.half ? c.half.x : c.hx;
      const hy = c.half ? c.half.y : c.hy;
      const hz = c.half ? c.half.z : c.hz;
      if (hx === undefined) continue;
      /*
       * 回転ぶんの余裕。
       *
       * 最初は max(hx,hz)*0.42 にしていたが、これでは足りない。
       * 壁は yaw=π/2 で置かれることが多く、そのときローカル Z の
       * 長さ（2m 超）がワールド X 方向へ伸びる。0.42 倍では
       * 目の前の壁が一覧に出てこず、「壁が無い」と読み違えた。
       * 半径の大きいほうを丸ごと足して、取りこぼしを無くす。
       */
      const pad = Math.max(hx, hz);
      if (hi.x < cx - hx - pad || lo.x > cx + hx + pad) continue;
      if (hi.y < cy - hy || lo.y > cy + hy) continue;
      if (hi.z < cz2 - hz - pad || lo.z > cz2 + hz + pad) continue;
      hits.push({
        中心: [+cx.toFixed(2), +cy.toFixed(2), +cz2.toFixed(2)],
        大きさ: [+(hx * 2).toFixed(2), +(hy * 2).toFixed(2), +(hz * 2).toFixed(2)],
        面: c.surface, 向き: +(c.yaw ?? 0).toFixed(2), 印: c.tag || '',
      });
    }
    // プレイヤーを置いてみて、実際に重なるかも見る
    const before = p.position.clone();
    p.position.set(px, py, pz);
    const overlap = ph._overlaps ? ph._overlaps(p.position, R, H) : null;
    const ground = ph._groundBelow ? ph._groundBelow(p.position, R, 2.0) : null;
    p.position.copy(before);
    return JSON.stringify({ 重なり: overlap, 足元: ground === null ? null : +ground.toFixed(2), 数: hits.length, 一覧: hits.slice(0, 14) });
  })()`);
  const j = JSON.parse(out);
  console.log(`\n== ${s.name}  (${s.pos.join(', ')}) ==`);
  console.log(`  体が何かと重なるか: ${j.重なり}   足元の床: ${j.足元}   近くのコライダ: ${j.数} 個`);
  for (const h of j.一覧) {
    console.log(`   中心 ${h.中心.join(', ').padEnd(24)} 大きさ ${h.大きさ.join(' × ').padEnd(22)} ${SURF[h.面] ?? h.面}${h.印 ? ' [' + h.印 + ']' : ''}`);
  }
}
await browser.close();
