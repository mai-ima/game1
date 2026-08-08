/**
 * ボットの交戦能力を測る。
 *
 * 「開けた場所で 4 人の敵と正対し、自機は棒立ちで反撃しない」
 * という最悪条件を何度も作り、平均でどれだけ削られるかを見る。
 * 1 回だけだと初動で見つかるかどうかの運で結果が数倍ぶれるため、
 * 一定時間ごとに配置をやり直して複数ラウンドの平均を取る。
 *
 *   node tools/aggression.mjs [url] [難易度] [1ラウンド秒] [ラウンド数]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const diff = process.argv[3] || 'regular';
const roundSec = parseFloat(process.argv[4] || '10');
const rounds = parseInt(process.argv[5] || '6', 10);
const foes = parseInt(process.argv[6] || '0', 10);   // 0 = 敵チーム全員
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

// 計測フックと、ラウンド開始時の配置を仕込む
await page.evaluate(`(() => {
  const d = window.__DEV, g = d.game, THREE = d.THREE;
  g.__shots = 0; g.__hits = 0; g.__dmg = 0;
  g.__zones = { head: 0, body: 0, limb: 0 };
  g.__firstDmgT = [];          // ラウンドごとの「最初に被弾するまでの秒数」

  const origResolve = g.resolveShot.bind(g);
  g.resolveShot = (o) => { if (o.shooter?.team !== g.playerStats.team) g.__shots++; return origResolve(o); };
  const origDmg = g._damagePlayer.bind(g);
  g._damagePlayer = (amount, from, dir, zone, weapon) => {
    g.__hits++; g.__dmg += amount;
    if (g.__zones[zone] !== undefined) g.__zones[zone]++;
    if (g.__roundFirst < 0) g.__roundFirst = g.time - g.__roundT0;
    return origDmg(amount, from, dir, zone, weapon);
  };

  /*
   * 味方は計測から完全に外す。
   * 遠ざけるだけでは敵の視程に入り、敵が自機ではなく味方を標的に
   * してしまって「自機への射撃」が測れない。
   */
  const origEnemies = g.enemiesOf.bind(g);
  g.enemiesOf = function* (team, asker) {
    const enemySide = team !== g.playerStats.team;
    for (const e of origEnemies(team, asker)) {
      if (enemySide && g.bots.includes(e)) continue;   // 敵が狙うのは自機だけ
      yield e;
    }
  };

  const ground = (x, z) => {
    const h = g.physics.raycast(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0), 20, { forBullets: false });
    return h ? h.point.y + 0.05 : 0.05;
  };

  /*
   * 自機は倒れない体力にしておく。
   * 途中で倒れるとリスポーン地点へ飛ばされ、以降は
   * 「敵から見えない場所に立っている」計測になってしまう。
   */
  g.playerStats.maxHp = 1e6;
  g.player.enabled = false;

  const FOES = ${foes};
  window.__ROUND = () => {
    if (g.__roundT0 !== undefined) g.__firstDmgT.push(g.__roundFirst);
    g.__roundT0 = g.time;
    g.__roundFirst = -1;
    g.playerStats.hp = 1e6;
    g.playerStats.alive = true;
    g._spawnProtect = 0;
    // 開けたスポーン帯で正対させる（中央は主屋があり視線が通らない）
    // yaw の前方は (-sin, 0, -cos)。yaw=0 は -Z、yaw=π が +Z。
    g.player.position.set(0, ground(0, 24), 24);
    g.player.yaw = 0;                                       // -Z（敵）を向く
    let i = 0;
    for (const b of g.bots) {
      if (b.team === g.playerStats.team) continue;
      // 参加させない敵は遠くへ置いて弾を抜く（倒すとリスポーンで戻ってきてしまう）
      if (FOES > 0 && i >= FOES) {
        b.spawn(new THREE.Vector3(-34, ground(-34, -34), -34), 0);
        b.ammo = 0; b.reserve = 0; i++; continue;
      }
      const x = (i - 1.5) * 2.2, z = 12;
      b.spawn(new THREE.Vector3(x, ground(x, z), z), Math.PI);  // +Z（自機）を向く
      i++;
    }
    for (const b of g.bots) {
      if (b.team !== g.playerStats.team) continue;
      b.spawn(new THREE.Vector3(30, ground(30, 30), 30), 0);
      b.ammo = 0; b.reserve = 0;                          // 味方は撃たせない
    }
  };

  window.__HIST = {};
  window.__STEP = (n, dt) => {
    for (let i = 0; i < n; i++) {
      g.update(dt);
      for (const b of g.bots) {
        if (b.team === g.playerStats.team) continue;
        const k = b.alive ? b.state : 'dead';
        window.__HIST[k] = (window.__HIST[k] || 0) + 1;
      }
    }
  };
  for (const k in d.BOT_GATE) d.BOT_GATE[k] = 0;
})()`);

/*
 * 描画から切り離して固定 60Hz で進める。
 * ヘッドレス（SwiftShader）は 1〜2 fps しか出ないため、実時間で待つと
 * 25 秒でも数十フレームしか進まず「1 フレーム 1 発」の上限に張り付く。
 */
const stepsPerRound = Math.round(roundSec * 60);
for (let r = 0; r < rounds; r++) {
  await page.evaluate('window.__ROUND()');
  for (let done = 0; done < stepsPerRound; done += 120) {
    const n = Math.min(120, stepsPerRound - done);
    await page.evaluate(`window.__STEP(${n}, 1/60)`);
  }
}

const total = roundSec * rounds;
const res = JSON.parse(await page.evaluate(`(() => {
  const g = window.__DEV.game;
  g.__firstDmgT.push(g.__roundFirst);
  const ft = g.__firstDmgT.filter((v) => v >= 0);
  const hist = window.__HIST; let ht = 0;
  for (const k in hist) ht += hist[k];
  const pct = {}; for (const k in hist) pct[k] = +(hist[k] / ht * 100).toFixed(1);
  return JSON.stringify({
    難易度: g.difficulty,
    敵数: ${foes} || g.bots.filter((b) => b.team !== g.playerStats.team).length,
    ラウンド: ${rounds}, 各秒: ${roundSec}, 合計秒: ${total},
    発砲数: g.__shots,
    命中数: g.__hits,
    命中率: g.__shots ? +(g.__hits / g.__shots * 100).toFixed(1) : 0,
    部位: g.__zones,
    毎秒ダメージ: +(g.__dmg / ${total}).toFixed(1),
    初弾命中までの秒: ft.length ? +(ft.reduce((a, b) => a + b, 0) / ft.length).toFixed(2) : null,
    命中したラウンド: ft.length + '/' + g.__firstDmgT.length,
    敵の状態割合: pct,
    抑止理由: window.__DEV.BOT_GATE,
  });
})()`));

console.log(JSON.stringify(res, null, 1));
const ttk = res.毎秒ダメージ > 0 ? (100 / res.毎秒ダメージ).toFixed(1) : '∞';
console.log(`\n正対したときに体力100を失うまで: 約 ${ttk} 秒`);
console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
