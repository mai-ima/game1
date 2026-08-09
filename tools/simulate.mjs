/**
 * 描画を止めて、試合の中身だけを早回しする。
 *
 * ソフトウェア描画では実時間 40 秒でもゲーム内 5 秒しか進まない。
 * それでは「ボットが交戦するか」「試合が決着するか」といった、
 * 時間をかけないと現れないことが何も観測できない。
 * 実際、最初の計測では「敵同士が一度も 97m 以内に近づかない」
 * という結果になったが、これは単に時間が足りていなかっただけだった。
 *
 * ここでは requestAnimationFrame を待たずに game.update(dt) を直接回す。
 * 描画しないので、実時間 20 秒でゲーム内 10 分ぶんを回せる。
 *
 *   node tools/simulate.mjs [url] [ゲーム内秒数]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low';
const simSeconds = +(process.argv[3] || 300);

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.waitForTimeout(2000);

const out = await page.evaluate(`(async () => {
  const d = window.__DEV, g = d.game, THREE = d.THREE;
  const DT = 1 / 60;
  const steps = Math.round(${simSeconds} / DT);

  const S = {
    steps: 0, err: null,
    minEnemyDist: 1e9, targeted: 0, samples: 0,
    firstEngage: -1, firstKill: -1,
    states: {}, killsBy: {},
    distHist: [0, 0, 0, 0, 0, 0],     // <10 <20 <40 <60 <90 それ以上
    stuck: 0, offMap: 0,
    // 時間帯ごとの様子（最初だけ活発、といった変化を捉える）
    buckets: [],
  };
  const eye = new THREE.Vector3();

  /*
   * 撃ち合いの中身を数える。
   * 「撃破が少ない」とき、原因は
   *   撃っていない / 当たっていない / 一発が軽い / 見つけていない
   * のどれか。それぞれ別の直し方になるので、切り分けが要る。
   */
  const F = { shots: 0, hits: 0, dmg: 0, engageT: 0, ttk: [], firstHitAt: new Map() };
  S.fight = F;
  for (const b of g.bots) {
    if (b.__wrapped) continue;
    b.__wrapped = true;
    // 実際に弾が出た回数（BOT_GATE.fire が発射のたびに増える）
    const od = b.damage.bind(b);
    b.damage = (amount, from, zone) => {
      F.hits++; F.dmg += amount;
      if (!F.firstHitAt.has(b)) F.firstHitAt.set(b, S.steps * DT);
      const died = od(amount, from, zone);
      if (died) {
        const t0 = F.firstHitAt.get(b);
        if (t0 != null) F.ttk.push(+(S.steps * DT - t0).toFixed(2));
        F.firstHitAt.delete(b);
      }
      return died;
    };
  }

  /*
   * 画面の更新は止める。
   * HUD の更新も止めないと、DOM 書き換えで時間を取られる。
   */
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    try { g.update(DT); } catch (e) { S.err = String(e.message); break; }
    S.steps++;

    if (i % 30 === 0) {
      S.samples++;
      const alive = g.bots.filter((b) => b.alive);
      let anyTarget = 0;
      for (const b of alive) {
        S.states[b.state] = (S.states[b.state] || 0) + 1;
        if (b.targetEnemy) anyTarget++;
        if (Math.abs(b.char.position.x) > 400 || Math.abs(b.char.position.z) > 400) S.offMap++;
      }
      S.targeted += anyTarget;
      if (anyTarget > 0 && S.firstEngage < 0) S.firstEngage = +(i * DT).toFixed(1);

      // 敵味方の最短距離
      for (const a of alive) {
        a.char.getEyePosition(eye);
        for (const b of alive) {
          if (a === b || a.team === b.team) continue;
          const dd = eye.distanceTo(b.char.position);
          S.minEnemyDist = Math.min(S.minEnemyDist, dd);
          const k = dd < 10 ? 0 : dd < 20 ? 1 : dd < 40 ? 2 : dd < 60 ? 3 : dd < 90 ? 4 : 5;
          S.distHist[k]++;
        }
      }
      const totalKills = g.bots.reduce((s, b) => s + b.kills, 0);
      if (totalKills > 0 && S.firstKill < 0) S.firstKill = +(i * DT).toFixed(1);
    }
    // 100 ステップごとにイベントループへ返す（ページが固まらないように）
    if (i % 600 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const wall = (performance.now() - t0) / 1000;

  for (const b of g.bots) S.killsBy[b.name] = b.kills;
  const sc = g.mode?.snapshot ? g.mode.snapshot() : null;
  return JSON.stringify({
    シミュレート秒: +(S.steps * DT).toFixed(1),
    実時間秒: +wall.toFixed(1),
    例外: S.err,
    初交戦: S.firstEngage, 初撃破: S.firstKill,
    '標的を持つボット（延べ / 標本）': [S.targeted, S.samples],
    敵味方の最短距離: +S.minEnemyDist.toFixed(1),
    '距離の分布 <10/<20/<40/<60/<90/それ以上': S.distHist,
    状態の内訳: S.states,
    撃破数: g.bots.reduce((s, b) => s + b.kills, 0),
    被撃破数: g.bots.reduce((s, b) => s + b.deaths, 0),
    'ボット別 撃破': S.killsBy,
    プレイヤー: g.playerStats ? { 撃破: g.playerStats.kills, 被撃破: g.playerStats.deaths, 体力: Math.round(g.playerStats.hp) } : null,
    得点: sc?.scores ?? null,
    場外: S.offMap,
    推移: S.buckets.map((b2) => b2 && ({
      分: b2.分, 累計撃破: b2.撃破, 累計発射: b2.発射,
      交戦率: +(b2.交戦 / Math.max(1, b2.n)).toFixed(2),
      巡回率: +(b2.巡回 / Math.max(1, b2.n)).toFixed(2),
      平均速度: +(b2.平均速度 / Math.max(1, b2.n)).toFixed(2),
    })),
    撃ち合い: {
      発射弾数: d.BOT_GATE.fire,
      命中回数: S.fight.hits,
      命中率: +(S.fight.hits / Math.max(1, d.BOT_GATE.fire)).toFixed(3),
      '撃てなかった理由': {
        バースト休み: d.BOT_GATE.pause, 状態が違う: d.BOT_GATE.state,
        反応待ち: d.BOT_GATE.react, 標的なし: d.BOT_GATE.notgt,
        弾切れ: d.BOT_GATE.ammo, 遮蔽: d.BOT_GATE.los,
        '照準が向いていない': d.BOT_GATE.dot, 連射間隔: d.BOT_GATE.timer,
        '遠すぎる': d.BOT_GATE.far,
      },
      '照準の一致（平均）': +(d.BOT_GATE.dotSum / Math.max(1, d.BOT_GATE.dotN)).toFixed(3),
      与ダメージ合計: Math.round(S.fight.dmg),
      '1分あたりの撃破': +((g.bots.reduce((s2, b) => s2 + b.kills, 0)) / (S.steps * DT / 60)).toFixed(2),
      '倒すまでの秒数（初弾から）': S.fight.ttk.slice(0, 20),
    },
  }, null, 1);
})()`);

console.log(out);
if (errors.length) console.log('\nエラー:', [...new Set(errors)].slice(0, 8).join('\n'));
await browser.close();
