/**
 * ボットが実際に交戦するか、どのくらい当ててくるかを測る。
 * 敵と自機を近づけて強制的に接敵させ、発砲数・命中数・与ダメージを数える。
 *
 *   node tools/aggression.mjs [url] [難易度] [ゲーム内秒]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const diff = process.argv[3] || 'regular';
const seconds = parseFloat(process.argv[4] || '25');
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 380 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });

await page.evaluate(`(async () => {
  const d = window.__DEV;
  d.menu.sel.mode = 'tdm';
  d.menu.sel.difficulty = ${JSON.stringify(diff)};
  await d.startMatch(d.menu.sel);
})()`);
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});

const waitGame = async (sec) => {
  const t0 = await page.evaluate('window.__DEV.game.time');
  await page.waitForFunction(`window.__DEV.game.time >= ${t0 + sec}`, { timeout: 600000 }).catch(() => {});
};

// 計測フックを仕込み、敵を自機の周囲へ配置して必ず接敵させる
await page.evaluate(`(() => {
  const d = window.__DEV, g = d.game, THREE = d.THREE;
  g.__shots = 0; g.__hits = 0; g.__dmg = 0; g.__deaths0 = g.playerStats.deaths;
  g.__zones = { head: 0, body: 0, limb: 0 };

  const origResolve = g.resolveShot.bind(g);
  g.resolveShot = (o) => { g.__shots++; return origResolve(o); };
  const origDmg = g._damagePlayer.bind(g);
  g._damagePlayer = (amount, from, dir, zone, weapon) => {
    g.__hits++; g.__dmg += amount;
    if (g.__zones[zone] !== undefined) g.__zones[zone]++;
    return origDmg(amount, from, dir, zone, weapon);
  };

  /*
   * 開けた場所で正対させる。
   * マップ中央には主屋があるため、中心付近に置くと視線が通らず
   * 「一発も撃たない」計測になってしまう。南北のスポーン帯を使う。
   */
  const ground = (x, z) => {
    const h = g.physics.raycast(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0), 20, { forBullets: false });
    return h ? h.point.y + 0.05 : 0.05;
  };
  g._spawnProtect = 0;
  g.player.position.set(0, ground(0, 24), 24);
  g.player.yaw = Math.PI;                       // -Z を向く
  let i = 0;
  for (const b of g.bots) {
    if (b.team === g.playerStats.team) continue;
    const x = (i - 1.5) * 2.2, z = 12;
    b.spawn(new THREE.Vector3(x, ground(x, z), z), 0);   // +Z（自機）を向く
    i++;
  }
  // 味方は遠くへ退けて、純粋に敵の射撃だけを測る
  for (const b of g.bots) {
    if (b.team !== g.playerStats.team) continue;
    b.spawn(new THREE.Vector3(30, ground(30, 30), 30), 0);
  }
  // 自機は動かない（純粋に受けるダメージだけを測る）
  g.player.enabled = false;
  return 'ok';
})()`);

await waitGame(seconds);

const r = JSON.parse(await page.evaluate(`(() => {
  const g = window.__DEV.game;
  return JSON.stringify({
    難易度: g.difficulty,
    計測秒: ${seconds},
    ボット発砲数: g.__shots,
    自機被弾数: g.__hits,
    命中率: g.__shots ? +(g.__hits / g.__shots * 100).toFixed(1) : 0,
    部位: g.__zones,
    累計ダメージ: Math.round(g.__dmg),
    毎秒ダメージ: +(g.__dmg / ${seconds}).toFixed(1),
    死亡回数: g.playerStats.deaths - g.__deaths0,
    交戦中の敵: g.bots.filter((b) => b.alive && b.team !== g.playerStats.team && b.state === 'engage').length,
    生存敵: g.bots.filter((b) => b.alive && b.team !== g.playerStats.team).length,
  });
})()`));

console.log(JSON.stringify(r, null, 1));
const ttk = r.毎秒ダメージ > 0 ? (100 / r.毎秒ダメージ).toFixed(1) : '∞';
console.log(`\n体力100を削られるまで: 約 ${ttk} 秒`);
console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
