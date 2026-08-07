/**
 * スマートフォンの操作ボタンが正しく働くかを、実際のタッチイベントで確認する。
 * 押下→離す を DOM に対して発火させ、ゲーム側の状態がどう変わるかを見る。
 *
 *   node tools/mobileinput.mjs [url]
 */
import { chromium, devices } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
// iPhone 相当・横画面
const ctx = await browser.newContext({
  ...devices['iPhone 14 Pro Max landscape'],
  hasTouch: true, isMobile: true,
});
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(4000);

/** ボタンを実際のタッチで押す */
const press = async (id, holdMs = 90) => {
  const box = await page.locator('#' + id).boundingBox();
  if (!box) { console.log(`  × ${id}: ボタンが見つからない`); return false; }
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.touchscreen.tap(x, y).catch(async () => {
    // tap は down/up が即座なので、長押しが要る場合は手動で発火
  });
  await page.waitForTimeout(holdMs);
  return true;
};

/** 押しっぱなしをゲーム内時間で保つ */
const pressHoldGame = async (id, sec) => {
  const box = await page.locator('#' + id).boundingBox();
  if (!box) { console.log(`  × ${id}: ボタンが見つからない`); return; }
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
  const fire = ([sel, type, px, py, on]) => {
    const el = document.querySelector(sel);
    const t = new Touch({ identifier: 991, target: el, clientX: px, clientY: py });
    el.dispatchEvent(new TouchEvent(type, {
      touches: on ? [t] : [], targetTouches: on ? [t] : [], changedTouches: [t],
      bubbles: true, cancelable: true,
    }));
  };
  await page.evaluate(fire, ['#' + id, 'touchstart', x, y, true]);
  await waitGame(sec);
  await page.evaluate(fire, ['#' + id, 'touchend', x, y, false]);
  await waitGame(0.2);
};

/** 押しっぱなし → 離す */
const pressHold = async (id, holdMs = 600) => {
  const box = await page.locator('#' + id).boundingBox();
  if (!box) { console.log(`  × ${id}: ボタンが見つからない`); return; }
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
  await page.evaluate(([sel, px, py]) => {
    const el = document.querySelector(sel);
    const t = new Touch({ identifier: 991, target: el, clientX: px, clientY: py });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
  }, ['#' + id, x, y]);
  await page.waitForTimeout(holdMs);
  await page.evaluate(([sel, px, py]) => {
    const el = document.querySelector(sel);
    const t = new Touch({ identifier: 991, target: el, clientX: px, clientY: py });
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t], bubbles: true, cancelable: true }));
  }, ['#' + id, x, y]);
  await page.waitForTimeout(250);
};

/**
 * ゲーム内時間で待つ。
 * ソフトウェア描画では 1 フレームあたりの dt が上限（0.05秒）で切られるため、
 * 実時間で待つとゲーム内ではほとんど進まず、リロード等の判定が誤る。
 */
const waitGame = async (sec) => {
  const t0 = await page.evaluate('window.__DEV.game.time');
  await page.waitForFunction(`window.__DEV.game.time >= ${t0 + sec}`, { timeout: 300000 }).catch(() => {});
};

const snap = async (label) => {
  const r = await page.evaluate(`(() => {
    const d = window.__DEV, p = d.game.player, i = d.input;
    const names = ['立ち', 'しゃがみ', '伏せ'];
    return JSON.stringify({
      姿勢: names[p.stance], 目標姿勢: names[p.targetStance],
      身長: +p.height.toFixed(2),
      スライド中: p.sliding, スプリント: p.sprinting,
      ads: p.ads, 射撃入力: i.down('fire'), sprint入力: i.down('sprint'),
      弾: d.game.weapons.getAmmo().mag,
      武器: d.game.weapons.def?.name,
      リロード中: d.game.weapons.reloading,
      近接中: d.game.weapons.meleeT > 0,
    });
  })()`);
  console.log(label.padEnd(22), r);
  return JSON.parse(r);
};

console.log('--- 初期状態 ---');
await snap('開始');

console.log('\n--- しゃがみボタン（静止時） ---');
await press('mcCrouch'); await waitGame(0.4);
const c1 = await snap('1回目タップ後');
await press('mcCrouch'); await waitGame(0.4);
const c2 = await snap('2回目タップ後');
console.log(c1.姿勢 === 'しゃがみ' ? '  ○ しゃがめた' : '  × しゃがめない');
console.log(c2.姿勢 === '立ち' ? '  ○ 立ち上がれた' : '  × 立ち上がれない');

console.log('\n--- しゃがみボタン（移動中 = 自動スプリント） ---');
// スティックを大きく倒す
await page.evaluate(`
  const i = window.__DEV.input;
  i.stickActive = true; i.stickVec.x = 0; i.stickVec.y = -1;`);
await waitGame(1.0);
await snap('移動開始');
await press('mcCrouch'); await waitGame(0.5);
const s1 = await snap('移動中タップ');
await waitGame(2.2);
const s2 = await snap('ゲーム内2.2秒後');
await page.evaluate(`
  const i = window.__DEV.input;
  i.stickActive = false; i.stickVec.x = 0; i.stickVec.y = 0;`);
await waitGame(0.8);
const s3 = await snap('停止後');
console.log(s3.姿勢 === '立ち' ? '  ○ 最終的に立っている' : `  × 立てないまま (${s3.姿勢}/${s3.目標姿勢})`);

console.log('\n--- ジャンプ ---');
const jb = await snap('ジャンプ前');
await press('mcJump'); await page.waitForTimeout(200);
const ja = await page.evaluate('JSON.stringify({y: +window.__DEV.game.player.velocity.y.toFixed(2), 接地: window.__DEV.game.player.grounded})');
console.log('  ', ja);

console.log('\n--- リロード ---');
await page.evaluate('window.__DEV.game.weapons.ammo[window.__DEV.game.weapons.loadout[0]].mag = 5');
await press('mcReload'); await waitGame(0.3);
const r1 = await snap('リロードタップ後');
console.log(r1.リロード中 ? '  ○ リロード開始' : '  × リロードが始まらない');
await waitGame(4.0);
const r2 = await snap('リロード完了待ち');

console.log('\n--- 武器切替 ---');
await press('mcSwap'); await waitGame(1.2);
const w1 = await snap('切替1回目');
await press('mcSwap'); await waitGame(1.2);
const w2 = await snap('切替2回目');
console.log(w1.武器 !== r2.武器 ? '  ○ 切り替わった' : '  × 切り替わらない');
console.log(w2.武器 !== w1.武器 ? '  ○ 戻せた' : '  × 戻せない');

console.log('\n--- 射撃（押しっぱなし） ---');
const f0 = await snap('射撃前');
await pressHoldGame('mcFire', 0.8);
const f1 = await snap('射撃後');
console.log(f1.弾 < f0.弾 ? `  ○ 発射された (${f0.弾} → ${f1.弾})` : '  × 発射されない');
console.log(!f1.射撃入力 ? '  ○ 離したら止まる' : '  × 離しても撃ち続ける');

console.log('\n--- 照準（トグル） ---');
await press('mcAds'); await waitGame(0.6);
const a1 = await snap('ADSオン');
await press('mcAds'); await waitGame(0.6);
const a2 = await snap('ADSオフ');
console.log(a1.ads ? '  ○ 覗ける' : '  × 覗けない');
console.log(!a2.ads ? '  ○ 解除できる' : '  × 解除できない');

console.log('\n--- スプリント（トグル） ---');
await press('mcSprint'); await page.waitForTimeout(600);
const p1 = await page.evaluate('JSON.stringify({sprint入力: window.__DEV.input.down("sprint"), ロック: !!window.__DEV.input._sprintLocked})');
console.log('  オン:', p1);
await press('mcSprint'); await page.waitForTimeout(600);
const p2 = await page.evaluate('JSON.stringify({sprint入力: window.__DEV.input.down("sprint"), ロック: !!window.__DEV.input._sprintLocked})');
console.log('  オフ:', p2);

console.log('\n--- 近接攻撃 ---');
// 近接動作は 0.62 秒で終わるため、開始を待ち受けて捕まえる
// （ソフトウェア描画では 1 フレームが数百 ms あり、実時間の待ちでは取りこぼす）
await page.evaluate('window.__meleeSeen = 0; window.__DEV.game.weapons.onMelee = () => { window.__meleeSeen++; }');
await press('mcMelee');
const started = await page.waitForFunction('window.__meleeSeen > 0', { timeout: 30000 })
  .then(() => true).catch(() => false);
console.log(started ? '  ○ 近接攻撃が発動' : '  × 近接攻撃が発動しない');
await waitGame(1.0);
await snap('近接後');

console.log('\n--- 武器切替（キーボード 2 → 1）---');
await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }))`);
await waitGame(1.2);
const k1 = await snap('Digit2');
await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }))`);
await waitGame(1.2);
const k2 = await snap('Digit1');
console.log(k1.武器 !== k2.武器 ? '  ○ 数字キーで切り替わる' : '  × 数字キーが効かない');

console.log('\n=== 結果 ===');
console.log(errors.length ? 'エラー:\n' + [...new Set(errors)].slice(0, 8).join('\n') : 'JS エラーなし');
await browser.close();
