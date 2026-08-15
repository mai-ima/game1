/**
 * 的が射手のほうを向いているかを測る。
 *
 * 「的の形をしているが、真横を向いている」は目で見て気付きにくい。
 * 射撃場は一度、射線が X 方向なのに的の厚みを Z に取っていて、
 * 射座から見ると幅 5cm の板を横から見る形になっていた。
 * 遠目には的が並んでいるようにしか見えない。
 *
 * ここでは的（userData.aimTarget を持つメッシュ）を集め、
 * 射座から的への向きと、的の法線の成す角を測る。
 * 併せて射座から的まで実際にレイを飛ばし、途中で何かに当たらないかも見る。
 *
 *   node tools/aimcheck.mjs [url] "射座名|x,y,z" ...
 *
 * 射座を省くとテストベッドの射座を使う。
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=testbed';
/*
 * 射座は的ごとに違うことがある（射撃場は距離ごとにレーンを分けてある）。
 * 何も渡さなければ、各的が userData に持っている自分の射座から測る。
 */
const spots = process.argv.slice(3).map((s) => {
  const [name, pos] = s.split('|');
  return { name, pos: pos.split(',').map(Number) };
});
if (!spots.length) spots.push(null);            // null = 的ごとの射座を使う

/** これを下回ったら斜めすぎ（正面から 32 度以上ずれている） */
const MIN_COS = 0.85;

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

for (const s of spots) {
  const out = await page.evaluate(`(() => {
    const d = window.__DEV, THREE = d.THREE, g = d.game, ph = g.physics;
    const fixed = ${s ? `[${s.pos.join(',')}]` : 'null'};
    const from = new THREE.Vector3();

    const targets = [];
    d.engine.scene.traverse((o) => { if (o.isMesh && o.userData.aimTarget) targets.push(o); });

    const wp = new THREE.Vector3(), dir = new THREE.Vector3();
    const rows = targets.map((t) => {
      /*
       * 座標は印に書かれていればそれを使う。
       * ジオメトリ側へ平行移動を焼いたメッシュは position が原点のままで、
       * getWorldPosition では狙う点が取れない。
       */
      const a0 = t.userData.aimTarget;
      if (a0.x !== undefined) wp.set(a0.x, a0.y, a0.z);
      else t.getWorldPosition(wp);
      // 射座。指定が無ければ的が持っているものを使う
      if (fixed) from.set(fixed[0], fixed[1], fixed[2]);
      else if (a0.from) from.set(a0.from[0], a0.from[1], a0.from[2]);
      else from.set(0, 1.5, 0);
      dir.copy(wp).sub(from);
      const dist = dir.length();
      dir.divideScalar(dist);
      const a = t.userData.aimTarget;
      // 的の法線（外向き）。射手へ向いていれば内積は正
      const cos = -(a.nx * dir.x + a.nz * dir.z);
      /*
       * 途中に何かあれば的まで届かない。
       * 距離標を射線上に立てていた時期があり、近い的ほど隠れていた。
       */
      /*
       * 途中に何かあれば的まで届かない。
       * raycast は { t, nx, ny, nz, collider } を返す。距離は t。
       * 以前 hit.distance を読んでいて、遮り位置がいつも 0m と出ていた。
       */
      const hit = ph.raycast ? ph.raycast(from, dir, dist - 0.25) : null;
      return {
        名: a.name,
        位置: [+wp.x.toFixed(1), +wp.y.toFixed(1), +wp.z.toFixed(1)],
        距離: +dist.toFixed(1),
        正対: +cos.toFixed(3),
        角度: +(Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI).toFixed(1),
        射座: [+from.x.toFixed(1), +from.y.toFixed(1), +from.z.toFixed(1)],
        遮り: hit ? +(hit.t ?? 0).toFixed(1) : null,
      };
    });
    return JSON.stringify({ 数: targets.length, 一覧: rows });
  })()`);

  const j = JSON.parse(out);
  console.log(`\n== ${s ? `${s.name} (${s.pos.join(', ')})` : '的ごとの射座'} から ==  的 ${j.数} 枚`);
  if (!j.数) { console.log('  的が 1 枚も見つからない（userData.aimTarget が付いていない）'); continue; }
  let bad = 0;
  for (const r of j.一覧) {
    const ng = r.正対 < MIN_COS;
    const blocked = r.遮り !== null;
    if (ng || blocked) bad++;
    console.log(`  ${(r.名 ?? '').padEnd(6)} 射座 ${(r.射座 ?? []).join(',').padEnd(14)} 距離 ${String(r.距離).padStart(5)}m`
      + `  正対 ${String(r.正対).padStart(6)}（${String(r.角度).padStart(5)}度ずれ）`
      + `  ${ng ? '× 横を向いている' : '○'}`
      + `${blocked ? `  × ${r.遮り}m 先で遮られる` : ''}`);
  }
  console.log(bad ? `  → ${bad} 枚に問題がある` : '  → すべて射手を向いていて、射線も通っている');
}
await browser.close();
