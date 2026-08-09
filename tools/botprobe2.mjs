/**
 * ボットが敵を見つけられているかを、段階ごとに数える。
 *
 * 「交戦が一度も起きない」とき、原因は
 *   相手がいない / 視界に入らない / 遮蔽で見えない /
 *   索敵の蓄積が足りない / 反応待ちのまま
 * のどれか。どこで落ちているかを数字で切り分ける。
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low';
const secs = +(process.argv[3] || 40);
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: execPath,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 360, height: 220 } });
page.on('pageerror', e => { if(!/Pointer Lock/.test(e.message)) console.log('ERR', e.message); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(()=>{});
await page.waitForTimeout(2500);

await page.evaluate(`(() => {
  const d = window.__DEV, g = d.game, THREE = d.THREE;
  const S = { n:0, pairs:0, inRange:0, inFov:0, los:0, spotted:0, targeted:0,
              minDist: 1e9, states: {}, teams: {} };
  window.__S = S;
  const o = g.update.bind(g);
  const eye = new THREE.Vector3(), teye = new THREE.Vector3(), dir = new THREE.Vector3();
  g.update = (dt) => {
    o(dt);
    S.n++;
    if (S.n % 10) return;
    const all = [...g.bots.filter(b => b.alive)];
    if (g.playerStats?.alive) all.push({ team: g.playerTeam ?? 'A', char: null, position: g.player.position, isPlayer: true });
    for (const b of g.bots) {
      if (!b.alive) continue;
      S.states[b.state] = (S.states[b.state] || 0) + 1;
      S.teams[b.team] = (S.teams[b.team] || 0) + 1;
      if (b.targetEnemy) S.targeted++;
      b.char.getEyePosition(eye);
      for (const t of all) {
        if (t === b) continue;
        if (t.team === b.team) continue;
        S.pairs++;
        const tp = t.position ?? t.char.position;
        const dist = eye.distanceTo(tp);
        S.minDist = Math.min(S.minDist, dist);
        if (dist > b.diff.sight) continue;
        S.inRange++;
        dir.copy(tp).sub(eye).normalize();
        const fwd = new THREE.Vector3(-Math.sin(b.aimYaw), 0, -Math.cos(b.aimYaw));
        const dot = fwd.dot(new THREE.Vector3(dir.x, 0, dir.z).normalize());
        if (dot < Math.cos(b.diff.fovDeg * Math.PI / 360)) continue;
        S.inFov++;
        teye.copy(tp); teye.y += 1.5;
        const hit = g.physics.raycast(eye, dir, dist - 0.4);
        if (hit) continue;
        S.los++;
        const sp = b._spot.get(t) ?? b._spot.get(t.char) ?? 0;
        if (sp >= 1) S.spotted++;
      }
    }
  };
})()`);
await page.waitForTimeout(secs * 1000);
const r = await page.evaluate('JSON.stringify(window.__S)');
const s = JSON.parse(r);
console.log(JSON.stringify({
  計測フレーム: s.n,
  '敵味方の組み合わせ（延べ）': s.pairs,
  '視認距離の内側': s.inRange,
  '視野の内側': s.inFov,
  '遮蔽なし（見えている）': s.los,
  '索敵が成立': s.spotted,
  '標的を持っている': s.targeted,
  '最短距離': +s.minDist.toFixed(1),
  '状態の内訳': s.states,
  '陣営の内訳': s.teams,
}, null, 1));
await browser.close();
