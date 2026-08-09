/**
 * 実際に遊んで確かめる監査。
 *
 * コードを読むだけでは「動くが破綻している」は見つからない。
 * 敵が後ろ歩きで撃ってくる状態を 30 秒間まったく気付かずに
 * 通していたのが、いい例だった。
 *
 * ここでは本物の入力（キーとマウスのイベント）を投げ、
 * マップの中を歩き回りながら次を毎フレーム監視する。
 *
 *   ・例外とコンソールエラー
 *   ・座標・速度・カメラの NaN
 *   ・床抜け（y が下限を割る）／天井抜け
 *   ・引っ掛かり（前進入力があるのに進まない）
 *   ・カメラが壁の中に入る
 *   ・HUD の値が壊れる（弾数・体力・時間）
 *   ・ボットが交戦しているか、撃破が発生するか
 *
 *   node tools/auditplay.mjs [url] [秒数] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=high';
const seconds = parseInt(process.argv[3] || '70', 10);
const outDir = process.argv[4] || 'shots/auditplay';
/*
 * 画面はソフトウェアで描いているので、大きいと 1 秒に 1 枚も出ない。
 * 遊びの中身を見る回では小さくして、フレーム数を稼ぐ。
 */
const VW = parseInt(process.argv[5] || '520', 10);
const VH = Math.round(VW * 0.5625);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: VW, height: VH } });

const errors = [];
page.on('pageerror', (e) => {
  if (/Pointer Lock/.test(e.message)) return;
  errors.push(`[例外] ${e.message}`);
});
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('404') && !/Pointer Lock/.test(t)) errors.push(`[console] ${t}`);
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.waitForTimeout(3500);

/* ---- 監視を仕込む ---- */
await page.evaluate(`(() => {
  const d = window.__DEV, g = d.game;
  const W = {
    frames: 0, nan: 0, fell: 0, stuck: 0, camIn: 0, hudBad: 0,
    minY: 1e9, maxY: -1e9, maxSpeed: 0,
    engaged: 0, kills0: 0, samples: 0, botsAlive: 0,
    worst: [],
  };
  window.__W = W;
  const note = (s) => { if (W.worst.length < 40 && !W.worst.includes(s)) W.worst.push(s); };

  const p = g.player;
  let lastPos = p.position.clone();
  let fwdT = 0, movedT = 0;

  const orig = g.update.bind(g);
  g.update = (dt) => {
    orig(dt);
    W.frames++;
    const pos = p.position, v = p.velocity;

    if (!Number.isFinite(pos.x + pos.y + pos.z)) { W.nan++; note('プレイヤー座標が NaN'); }
    if (!Number.isFinite(v.x + v.y + v.z)) { W.nan++; note('プレイヤー速度が NaN'); }
    const cam = d.engine.camera.position;
    if (!Number.isFinite(cam.x + cam.y + cam.z)) { W.nan++; note('カメラ座標が NaN'); }

    W.minY = Math.min(W.minY, pos.y);
    W.maxY = Math.max(W.maxY, pos.y);
    W.maxSpeed = Math.max(W.maxSpeed, Math.hypot(v.x, v.z));
    if (pos.y < -3) { W.fell++; note('床を抜けて落下 (y=' + pos.y.toFixed(1) + ')'); }
    if (Math.hypot(v.x, v.z) > 14) note('異常な速度 ' + Math.hypot(v.x, v.z).toFixed(1) + ' m/s');

    // 前進入力があるのに進まない
    // 入力の前進成分は input.move.y（+ が前）。axis というプロパティは無い
    const wantFwd = d.input.move && d.input.move.y > 0.5;
    if (wantFwd) {
      fwdT += dt;
      if (pos.distanceTo(lastPos) > 0.03) movedT += dt;
      if (fwdT > 1.6) {
        if (movedT < fwdT * 0.25) { W.stuck++; note('前進しているのに動かない地点 ' + pos.x.toFixed(0) + ',' + pos.z.toFixed(0)); }
        fwdT = 0; movedT = 0;
      }
    } else { fwdT = 0; movedT = 0; }
    lastPos.copy(pos);

    // カメラが何かの中に入っていないか（目の位置から全方向へ短いレイ）
    if (W.frames % 20 === 0) {
      let inside = 0;
      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]]) {
        const hit = g.physics.raycast({ x: cam.x, y: cam.y, z: cam.z }, { x: dx, y: dy, z: dz }, 0.12);
        if (hit) inside++;
      }
      if (inside >= 4) { W.camIn++; note('カメラが物の中 ' + cam.x.toFixed(0) + ',' + cam.z.toFixed(0)); }
    }

    // HUD の値
    const st = g.playerStats;
    if (st) {
      if (!Number.isFinite(st.hp) || st.hp < 0 || st.hp > 1000) { W.hudBad++; note('体力の値が異常 ' + st.hp); }
    }
    const w = p.weapons;
    if (w && w.state) {
      const a = w.state.ammo;
      if (a != null && (!Number.isFinite(a) || a < 0)) { W.hudBad++; note('弾数が異常 ' + a); }
    }

    // ボットの状況
    if (W.frames % 30 === 0) {
      W.samples++;
      const alive = g.bots.filter((b) => b.alive).length;
      W.botsAlive += alive;
      W.engaged += g.bots.filter((b) => b.alive && b.targetEnemy).length;
    }
  };
})()`);

/* ---- 本物の入力で歩き回る ---- */
const keys = { W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD' };
const hold = async (code, ms) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
};
const look = async (dx, dy) => {
  await page.evaluate(`(() => {
    const d = window.__DEV;
    d.game.player.yaw   -= ${dx} * 0.0022;
    d.game.player.pitch  = Math.max(-1.5, Math.min(1.5, d.game.player.pitch - ${dy} * 0.0022));
  })()`);
};

const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 240000 });
};

console.log('操作を開始します…');
const script = [
  ['前進', async () => hold(keys.W, 3000)],
  ['右を見る', async () => { await look(600, 0); await page.waitForTimeout(600); }],
  ['前進しながら射撃', async () => {
    await page.keyboard.down(keys.W);
    await page.mouse.down();
    await page.waitForTimeout(2600);
    await page.mouse.up();
    await page.keyboard.up(keys.W);
  }],
  ['リロード', async () => { await page.keyboard.press('KeyR'); await page.waitForTimeout(2600); }],
  ['覗き込んで射撃', async () => {
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(700);
    await page.mouse.down();
    await page.waitForTimeout(1800);
    await page.mouse.up();
    await page.mouse.up({ button: 'right' });
  }],
  ['武器切替', async () => { await page.keyboard.press('Digit2'); await page.waitForTimeout(1800);
                            await page.keyboard.press('Digit1'); await page.waitForTimeout(1600); }],
  ['しゃがんで前進', async () => {
    await page.keyboard.down('ControlLeft');
    await hold(keys.W, 2200);
    await page.keyboard.up('ControlLeft');
  }],
  ['走る', async () => {
    await page.keyboard.down('ShiftLeft');
    await hold(keys.W, 3000);
    await page.keyboard.up('ShiftLeft');
  }],
  ['跳ぶ', async () => { await page.keyboard.press('Space'); await page.waitForTimeout(1400); }],
  ['左へ回り込む', async () => { await look(-700, 0); await hold(keys.A, 2200); }],
  ['後退', async () => hold(keys.S, 2000)],
  ['近接', async () => { await page.keyboard.press('KeyV'); await page.waitForTimeout(1500); }],
  ['手榴弾', async () => { await page.keyboard.press('KeyG'); await page.waitForTimeout(2600); }],
  ['見回す', async () => { for (let i = 0; i < 6; i++) { await look(420, i % 2 ? 90 : -90); await page.waitForTimeout(320); } }],
  ['走って前進', async () => {
    await page.keyboard.down('ShiftLeft');
    await hold(keys.W, 3600);
    await page.keyboard.up('ShiftLeft');
  }],
];

let i = 0;
for (const [name, fn] of script) {
  const before = errors.length;
  try { await fn(); } catch (e) { errors.push(`[操作:${name}] ${e.message}`); }
  const add = errors.length - before;
  console.log(`  ${add ? '×' : '○'} ${name}${add ? ` (${add} 件)` : ''}`);
  if (i % 4 === 0) await shot(`play_${String(i).padStart(2, '0')}_${name}`);
  i++;
}

// 残り時間はボットに任せて放置し、交戦が起きるか見る
const left = Math.max(0, seconds * 1000 - i * 2500);
if (left > 0) await page.waitForTimeout(left);
await shot('play_final');

/* ---- 集計 ---- */
const r = JSON.parse(await page.evaluate(`(() => {
  const W = window.__W, d = window.__DEV, g = d.game;
  const st = g.playerStats || {};
  return JSON.stringify({
    フレーム: W.frames,
    NaN: W.nan, 床抜け: W.fell, 引っ掛かり: W.stuck, カメラ埋没: W.camIn, HUD異常: W.hudBad,
    高さの範囲: [+W.minY.toFixed(2), +W.maxY.toFixed(2)],
    最高速度: +W.maxSpeed.toFixed(2),
    平均生存ボット: +(W.botsAlive / Math.max(1, W.samples)).toFixed(2),
    交戦中の割合: +(W.engaged / Math.max(1, W.botsAlive || 1)).toFixed(3),
    プレイヤー: { 撃破: st.kills ?? 0, 被撃破: st.deaths ?? 0, 体力: st.hp ?? 0 },
    ボットの撃破合計: g.bots.reduce((s, b) => s + b.kills, 0),
    ボットの被撃破合計: g.bots.reduce((s, b) => s + b.deaths, 0),
    描画: d.engine.drawCalls, 三角形k: Math.round(d.engine.triangles / 1000),
    気になった点: W.worst,
  }, null, 1);
})()`));

console.log('\n--- 結果 ---');
console.log(JSON.stringify(r, null, 1));
console.log(errors.length ? `\n--- エラー ${errors.length} 件 ---\n` + [...new Set(errors)].slice(0, 12).join('\n') : '\nJS エラーなし');
await browser.close();
