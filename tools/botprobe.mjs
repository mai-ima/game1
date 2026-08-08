/**
 * 1 体のボットだけを取り出し、毎秒の内部状態を追う。
 * 「目の前に立っている相手を見つけられない / すぐ見失う」原因の切り分け用。
 *
 *   node tools/botprobe.mjs [url] [難易度] [秒]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const diff = process.argv[3] || 'regular';
const seconds = parseFloat(process.argv[4] || '20');
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
  const d = window.__DEV, g = d.game, THREE = d.THREE;
  const ground = (x, z) => {
    const h = g.physics.raycast(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0), 20, { forBullets: false });
    return h ? h.point.y + 0.05 : 0.05;
  };
  // 敵から見える相手を自機だけに絞る（遠くへ置いた味方が囮になってしまう）
  const origEnemies = g.enemiesOf.bind(g);
  g.enemiesOf = function* (team) {
    const enemySide = team !== g.playerStats.team;
    for (const e of origEnemies(team)) {
      if (enemySide && g.bots.includes(e)) continue;
      yield e;
    }
  };
  g.playerStats.maxHp = 1e6; g.playerStats.hp = 1e6;
  g.player.enabled = false; g._spawnProtect = 0;
  g.player.position.set(0, ground(0, 24), 24);
  g.player.yaw = 0;

  // 1 体だけ残し、他は遠くへ
  let first = null;
  for (const b of g.bots) {
    if (b.team === g.playerStats.team || first) {
      b.spawn(new THREE.Vector3(-34, ground(-34, -34), -34), 0);
      b.ammo = 0; b.reserve = 0;
      continue;
    }
    first = b;
    b.spawn(new THREE.Vector3(0, ground(0, 12), 12), Math.PI);
  }
  window.__B = first;
  window.__LOG = [];
  window.__STEP = (n, dt) => {
    for (let i = 0; i < n; i++) {
      g.update(dt);
      if (window.__LOG.length < 1e5 && Math.round(g.time * 60) % 30 === 0) {
        const b = window.__B, pt = g._pt;
        const eye = b.char.getEyePosition(new THREE.Vector3());
        const pe = g.player.getEyePosition(new THREE.Vector3());
        const dir = pe.clone().sub(eye).normalize();
        const fwd = new THREE.Vector3(-Math.sin(b.aimYaw), 0, -Math.cos(b.aimYaw));
        window.__LOG.push({
          t: +g.time.toFixed(1),
          st: b.state,
          tgt: b.targetEnemy === pt ? 'P' : (b.targetEnemy ? 'B' : '-'),
          spot: +((b._spot.get(pt) || 0)).toFixed(2),
          dot: +(fwd.x * dir.x + fwd.z * dir.z).toFixed(2),
          los: g.physics.losBlocked(eye, pe) ? 'X' : 'o',
          d: +b.char.position.distanceTo(g.player.position).toFixed(1),
          rt: +b._reactionT.toFixed(2),
          gl: +b._glanceT.toFixed(2),
          ay: +b.aimYaw.toFixed(2),
          gy: +Math.atan2(-(b._glancePos.x - b.char.position.x), -(b._glancePos.z - b.char.position.z)).toFixed(2),
          vy: +b._aimVelYaw.toFixed(2),
          mt: b.moveTarget ? 1 : 0,
          losT: +b._losT.toFixed(1),
          ammo: b.ammo,
        });
      }
    }
  };
})()`);

const steps = Math.round(seconds * 60);
for (let i = 0; i < steps; i += 120) await page.evaluate(`window.__STEP(${Math.min(120, steps - i)}, 1/60)`);

const log = JSON.parse(await page.evaluate('JSON.stringify(window.__LOG)'));
console.log('  t    状態     標的 索敵 前方dot 視線 距離 注視  aimYaw 注視Yaw 角速度');
for (const r of log) {
  console.log(`${String(r.t).padStart(5)} ${r.st.padEnd(8)} ${r.tgt}   ${String(r.spot).padStart(5)} ${String(r.dot).padStart(6)}  ${r.los}  ${String(r.d).padStart(5)} ${String(r.gl).padStart(5)} ${String(r.ay).padStart(7)} ${String(r.gy).padStart(6)} ${String(r.vy).padStart(6)}`);
}
await browser.close();
