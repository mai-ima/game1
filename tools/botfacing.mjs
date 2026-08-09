/**
 * 敵の体が、狙っている向き・進んでいる向きを向いているかを実戦の中で測る。
 *
 * 向きの取り違えは、コードを読んでも図を描いても見つからない。
 * yaw の符号ひとつで裏返るのに、裏返っても形は同じだからだ。
 * 実際にこれで「全ての敵が後ろ歩きで、背中から発砲する」状態を
 * 30 秒間まったく気付かずに通していた。
 *
 * ここでは階層や規約を一切あてにせず、置かれている形から向きを取る。
 * 背嚢は必ず背中にあるので
 *     正面 = 正規化( 胸の中心 → 背嚢の中心 の逆ベクトル )
 * これなら中間 Group を挟んでも、部位を組み替えても騙されない。
 *
 * 判定に使うのは「体が自分の照準（aimYaw）と一致しているか」。
 * ここには、まっとうな例外が一つも無いので合格線は +0.999 に置ける。
 * 標的の方向や進行方向との比較は、首振り（±0.62rad）や
 * 回避操舵で正しくてもずれるため、参考値として出すだけにする。
 *
 *   node tools/botfacing.mjs [url] [計測秒]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=testbed';
const secs = +(process.argv[3] || 30);

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('ERR', e.message); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});

await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE, g = d.game;
  const S = { aimN: 0, aimSum: 0, aimMin: 9, moveN: 0, moveSum: 0, moveMin: 9, worst: null };
  window.__S = S;
  const back = new WeakMap();     // 胸 -> 背嚢の {mesh, ローカル中心}

  /* 背嚢を割り出す。位置は object ではなくジオメトリに焼き込まれているので、
     境界箱の中心を見る必要がある。 */
  function backOf(chest) {
    if (back.has(chest)) return back.get(chest);
    let best = null, bz = 0;
    for (const c of chest.children) {
      if (!c.isMesh) continue;
      c.geometry.computeBoundingBox();
      const ctr = c.geometry.boundingBox.getCenter(new THREE.Vector3());
      if (ctr.z < bz) { bz = ctr.z; best = { mesh: c, local: ctr }; }
    }
    back.set(chest, best);
    return best;
  }

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3();
  const orig = g.update.bind(g);
  g.update = (dt) => {
    orig(dt);
    for (const b of g.bots) {
      if (!b.alive) continue;
      b.char.model.updateMatrixWorld(true);
      const chest = b.char.model.userData.bones.chest;
      const bk = backOf(chest);
      if (!bk) continue;
      chest.getWorldPosition(_a);
      _b.copy(bk.local).applyMatrix4(bk.mesh.matrixWorld);
      _f.copy(_a).sub(_b).setY(0);
      if (_f.lengthSq() < 1e-8) continue;
      _f.normalize();

      const t = b.targetEnemy;
      if (t) {
        const to = new THREE.Vector3().copy(t.position ?? t.char.position).sub(b.char.position).setY(0);
        if (to.lengthSq() > 1e-6) {
          to.normalize();
          const dp = _f.dot(to);
          S.aimN++; S.aimSum += dp; S.aimMin = Math.min(S.aimMin, dp);
        }
      }
      /*
       * 本命の検査はこちら。
       * 「体が aimYaw と一致しているか」には、まっとうな例外が無い。
       * 進行方向との比較は、首振り（±0.62rad）や回避操舵で
       * 正しくてもずれるので、判定には使わない。
       */
      const aim = new THREE.Vector3(-Math.sin(b.aimYaw), 0, -Math.cos(b.aimYaw));
      const dp = _f.dot(aim);
      S.moveN++; S.moveSum += dp;
      if (dp < S.moveMin) { S.moveMin = dp; S.worst = b.name; }
    }
  };
})()`);

await page.waitForTimeout(secs * 1000);
const r = JSON.parse(await page.evaluate(`(() => { const s = window.__S; return JSON.stringify({
  標的: { 標本: s.aimN, 平均: +(s.aimSum / Math.max(1, s.aimN)).toFixed(3), 最悪: +s.aimMin.toFixed(3) },
  照準: { 標本: s.moveN, 平均: +(s.moveSum / Math.max(1, s.moveN)).toFixed(3), 最悪: +s.moveMin.toFixed(3), 該当: s.worst },
}); })()`));

const line = (name, o, pass) => {
  const ok = o.標本 > 0 && o.平均 >= pass;
  console.log(`${ok ? '○' : (o.標本 ? '×' : '－')} ${name}: 平均 ${o.平均}（標本 ${o.標本} / 最悪 ${o.最悪}） 合格線 ${pass}`);
  return o.標本 === 0 ? null : ok;
};
console.log('内積 1 = 正面を向いている / -1 = 真後ろを向いている\n');
const a = line('狙っている相手のほう', r.標的, 0.9);
const m = line('自分の照準（aimYaw）のほう', r.照準, 0.999);
if (a === null) console.log('  （交戦が起きなかったため標的側は未検証）');
process.exitCode = (a === false || m === false) ? 1 : 0;
await browser.close();
