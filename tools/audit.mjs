/**
 * 総合検証。報告された不具合を機械的に確認する。
 *
 *   1. リスポーン後に画面が描画されるか（実際の画素で判定）
 *   2. 設定項目がエンジン／ゲームへ反映されるか
 *   3. 動的解像度で画質が落ちすぎないか
 *   4. ゲームバランス（プレイヤーの生存時間・ボットの命中率）
 *   5. 各ゲームモードが成立するか（得点が動くか）
 *
 *   node tools/audit.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });

const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

const ok = (cond, msg) => console.log(`  ${cond ? '○' : '×'} ${msg}`);

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });

/** ゲーム内時間で待つ（ソフトウェア描画では実時間と大きくずれるため） */
const waitGame = async (sec) => {
  const t0 = await page.evaluate('window.__DEV.game.time');
  await page.waitForFunction(`window.__DEV.game.time >= ${t0 + sec}`, { timeout: 300000 }).catch(() => {});
};

/** 画面の明るさ分布を調べる（真っ黒＝何も描画されていない） */
const screenStats = async () => {
  const buf = await page.screenshot({ timeout: 120000 });
  // PNG をそのまま解析せず、キャンバスから直接読む
  return page.evaluate(`(() => {
    const e = window.__DEV.engine;
    // 現在のフレームを読み直してから画素を取る
    const url = e.captureFrame(0.016);
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 160; c.height = 90;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, 160, 90);
        const d = g.getImageData(0, 0, 160, 90).data;
        let lit = 0, sum = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
          sum += l;
          if (l > 12) lit++;
        }
        res(JSON.stringify({ 明るい画素率: +(lit / (160 * 90)).toFixed(3), 平均輝度: Math.round(sum / (160 * 90)) }));
      };
      img.onerror = () => res(JSON.stringify({ 明るい画素率: -1, 平均輝度: -1 }));
      img.src = url;
    });
  })()`);
};

const startMatch = async (mode) => {
  await page.evaluate(`(async () => {
    const d = window.__DEV;
    d.menu.sel.mode = ${JSON.stringify(mode)};
    await d.startMatch(d.menu.sel);
  })()`);
  await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});
  await waitGame(0.6);
};

/* =============== 1. リスポーン =============== */
console.log('\n=== 1. リスポーン後の描画 ===');
await startMatch('tdm');
console.log('  対戦前:', await screenStats());

for (let i = 1; i <= 3; i++) {
  // スコープを覗いた状態で倒れる（黒い縁が残る不具合の再現条件）
  await page.evaluate(`(() => {
    const d = window.__DEV;
    d.game.weapons.setLoadout(['sniper', 'pistol'], { sniper: ['scope8x'] });
    d.input.setAction('ads', true);
  })()`);
  await waitGame(1.2);
  const scoped = await page.evaluate('window.__DEV.game.weapons.isScoped');
  await page.evaluate(`(() => {
    const d = window.__DEV;
    d.game._spawnProtect = 0;
    d.game.playerStats.hp = 1;
    d.game._damagePlayer(50, d.game.bots[0], new (window.__DEV.THREE.Vector3)(0, 0, 1), 'body', d.game.weapons.def);
  })()`);
  await waitGame(0.4);
  const dead = await page.evaluate('!window.__DEV.game.playerStats.alive');
  await page.evaluate('window.__DEV.input.setAction("ads", false)');
  // リスポーンを待つ
  await page.waitForFunction('window.__DEV.game.playerStats.alive === true', { timeout: 300000 }).catch(() => {});
  await waitGame(0.8);

  const st = JSON.parse(await screenStats());
  const info = JSON.parse(await page.evaluate(`JSON.stringify({
    位置: [+window.__DEV.game.player.position.x.toFixed(1),
           +window.__DEV.game.player.position.y.toFixed(1),
           +window.__DEV.game.player.position.z.toFixed(1)],
    スコープ中: window.__DEV.game.weapons.isScoped,
    adsT: +window.__DEV.game.weapons.adsT.toFixed(2),
    埋まっている: window.__DEV.game.physics._overlaps(window.__DEV.game.player.position, 0.34, 1.8),
  })`));
  console.log(`  ${i}回目 死亡前スコープ=${scoped} 倒れた=${dead}`, JSON.stringify(info), JSON.stringify(st));
  ok(st.明るい画素率 > 0.3, `復帰後に画面が描画されている（明るい画素率 ${st.明るい画素率}）`);
  ok(!info.スコープ中, '復帰後にスコープが残っていない');
  ok(!info.埋まっている, '復帰位置が地形に埋まっていない');
  ok(info.位置[1] > -5, '復帰位置が地面より下でない');
}

/* =============== 2. 設定の反映 =============== */
console.log('\n=== 2. 設定の反映 ===');
const settingCheck = await page.evaluate(`(() => {
  const d = window.__DEV, out = {};
  const apply = (k, v) => { d.settings.set(k, v); d.menu.onSettingChange?.(k, v); };

  apply('fov', 100);
  out['視野角'] = { 設定: 100, 実際: Math.round(d.game.player.baseFov), 一致: Math.round(d.game.player.baseFov) === 100 };

  apply('sensitivity', 2.4);
  out['マウス感度'] = { 設定: 2.4, 実際: d.input.sensitivity, 一致: Math.abs(d.input.sensitivity - 2.4) < 1e-6 };

  apply('adsSensitivity', 0.4);
  out['ADS感度'] = { 一致: Math.abs(d.input.adsSensitivity - 0.4) < 1e-6 };

  apply('invertY', true);
  out['Y軸反転'] = { 一致: d.input.invertY === true };

  apply('brightness', 1.4);
  out['明るさ'] = { 一致: Math.abs(d.engine.renderer.toneMappingExposure - 0.95 * 1.4) < 1e-6 };

  apply('filmGrain', false);
  out['グレイン'] = { 一致: d.engine.compositePass.uniforms.uGrain.value === 0 };

  apply('motionBlur', false);
  out['モーションブラー'] = { 一致: d.engine.motionBlurAllowed === false };

  apply('dynamicRes', false);
  out['動的解像度'] = { 一致: d.engine.autoResolution === false };
  apply('dynamicRes', true);

  apply('perfMode', true);
  out['性能優先'] = { 一致: d.engine.autoQualityDowngrade === true };
  apply('perfMode', false);

  apply('showFps', true);
  out['FPS表示'] = { 一致: d.settings.get('showFps') === true };

  apply('quality', 'medium');
  out['画質'] = { 一致: d.engine.quality === 'medium' };

  apply('master', 0.33);
  out['音量'] = { 一致: !d.audio.master || Math.abs(d.audio.master.gain.value - 0.33) < 1e-6 };

  // 既定へ戻す
  d.settings.reset();
  d.menu.onSettingsReset?.();
  out['既定に戻す'] = {
    視野角: d.settings.get('fov'), 感度: d.settings.get('sensitivity'),
    一致: d.settings.get('fov') === 80 && d.settings.get('sensitivity') === 1.0
      && Math.round(d.game.player.baseFov) === 80,
  };
  return JSON.stringify(out, null, 1);
})()`);
console.log(settingCheck);
for (const [k, v] of Object.entries(JSON.parse(settingCheck))) ok(v.一致, k);

/* =============== 3. 画質の下がりすぎ =============== */
console.log('\n=== 3. 動的解像度の下限 ===');
const res = JSON.parse(await page.evaluate(`JSON.stringify({
  画質: window.__DEV.engine.quality,
  倍率: window.__DEV.engine.renderScale,
  解像度: window.__DEV.engine.renderSize,
  自動降格: window.__DEV.engine.autoQualityDowngrade,
})`));
console.log(' ', JSON.stringify(res));
ok(res.倍率 >= 0.6, `解像度倍率が下限（0.6）を下回っていない: ${res.倍率}`);
ok(res.自動降格 === false, '既定では画質の自動降格が無効');

/* =============== 4. ゲームバランス =============== */
console.log('\n=== 4. ゲームバランス（正規兵・8体） ===');
await startMatch('tdm');
const balance = await page.evaluate(`(() => {
  const d = window.__DEV;
  // ボットの発砲と命中を数える
  const g = d.game;
  g.__shots = 0; g.__hitsOnPlayer = 0; g.__dmg = 0;
  const origResolve = g.resolveShot.bind(g);
  g.resolveShot = (o) => { g.__shots++; return origResolve(o); };
  const origDmg = g._damagePlayer.bind(g);
  g._damagePlayer = (amount, from, dir, zone, weapon) => {
    g.__hitsOnPlayer++; g.__dmg += amount;
    return origDmg(amount, from, dir, zone, weapon);
  };
  return 'ok';
})()`);
// プレイヤーは動かず、敵の中央へ立たせる
await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game._spawnProtect = 0;
  d.game.playerStats.hp = 100;
})()`);
await waitGame(30);
const bal = JSON.parse(await page.evaluate(`JSON.stringify({
  ボット発砲数: window.__DEV.game.__shots,
  自機被弾数: window.__DEV.game.__hitsOnPlayer,
  累計ダメージ: Math.round(window.__DEV.game.__dmg),
  自機の死亡数: window.__DEV.game.playerStats.deaths,
  自機HP: Math.round(window.__DEV.game.playerStats.hp),
  生存ボット: window.__DEV.game.bots.filter((b) => b.alive).length,
  A側: window.__DEV.game.bots.filter((b) => b.team === 'A').length,
  B側: window.__DEV.game.bots.filter((b) => b.team === 'B').length,
})`));
console.log(' ', JSON.stringify(bal));
const hitRate = bal.ボット発砲数 ? bal.自機被弾数 / bal.ボット発砲数 : 0;
console.log(`  ボットの対自機命中率: ${(hitRate * 100).toFixed(1)}%`);
ok(bal.A側 === bal.B側 - 1 || bal.A側 === bal.B側, `チーム人数が均衡（味方${bal.A側} + 自分 vs 敵${bal.B側}）`);
ok(bal.自機の死亡数 <= 6, `ゲーム内30秒での死亡回数が多すぎない: ${bal.自機の死亡数}`);

/* =============== 5. ゲームモード =============== */
console.log('\n=== 5. 各ゲームモードの成立 ===');
for (const mode of ['tdm', 'ffa', 'dom', 'kc', 'gungame', 'snd']) {
  await startMatch(mode);
  const before = await page.evaluate('JSON.stringify(window.__DEV.game.mode.getScores())');
  // プレイヤーによるキルを 3 回発生させる
  const sim = await page.evaluate(`(() => {
    const d = window.__DEV, g = d.game;
    let killed = 0;
    for (const b of g.bots) {
      if (!b.alive || b.team === g.playerStats.team) continue;
      const p = b.char.position.clone();
      // 直接撃破して、モードの onKill を通す
      while (b.alive) { if (b.damage(60, g.playerStats, 'body')) g._registerKill(g.playerStats, b, g.weapons.def, false); }
      killed++;
      if (killed >= 3) break;
    }
    return JSON.stringify({ 撃破数: killed, スコア: g.mode.getScores() });
  })()`);
  await waitGame(0.4);
  const after = await page.evaluate('JSON.stringify(window.__DEV.game.mode.getScores())');
  console.log(`  [${mode}] 前=${before}`);
  console.log(`         後=${after}  ${sim}`);

  const b = JSON.parse(before), a = JSON.parse(after);
  if (mode === 'kc') {
    ok(JSON.parse(sim).スコア.tags > 0, 'キルコンファームド: ドッグタグが落ちる');
  } else if (mode === 'snd') {
    const s = JSON.parse(sim).スコア;
    ok(!!s.attackers && !!s.defenders, `捜索と破壊: 攻守が決まる（攻 ${s.attackers} / 防 ${s.defenders}）`);
  } else if (mode === 'dom') {
    ok(Array.isArray(a.zones) && a.zones.length > 0, 'ドミネーション: 拠点が存在する');
  } else {
    ok((a.A ?? 0) > (b.A ?? 0), `${mode}: キルで自陣のスコアが増える`);
  }
}

/* =============== 捜索と破壊の設置まで =============== */
console.log('\n=== 5b. 捜索と破壊: 爆弾設置 ===');
await startMatch('snd');
const snd = await page.evaluate(`(() => {
  const d = window.__DEV, g = d.game, m = g.mode;
  // プレイヤーを攻撃側にして目標地点へ運ぶ
  const s = m.getScores();
  g.playerStats.team = m.attackers;
  g.player.position.copy(m.site.pos);
  g.player.position.y += 0.1;
  return JSON.stringify({ 攻撃側: m.attackers, 目標: [+m.site.pos.x.toFixed(1), +m.site.pos.z.toFixed(1)] });
})()`);
console.log(' ', snd);
// 押し続けている間、自機を目標に留め置く（テスト中に流されると計測にならない）
await page.evaluate(`(() => {
  const d = window.__DEV, g = d.game, m = g.mode;
  d.input.setAction('interact', true);
  g.__pin = setInterval(() => {
    if (!g.playerStats.alive) { g.playerStats.hp = 100; g.playerStats.alive = true; g.player.enabled = true; }
    g.player.position.copy(m.site.pos);
    g.player.position.y += 0.1;
    g.player.velocity.set(0, 0, 0);
    d.input.setAction('interact', true);
  }, 30);
})()`);
await waitGame(8.0);
const planted = await page.evaluate('JSON.stringify(window.__DEV.game.mode.getScores())');
await page.evaluate(`(() => {
  clearInterval(window.__DEV.game.__pin);
  window.__DEV.input.setAction('interact', false);
})()`);
console.log(' ', planted);
ok(JSON.parse(planted).planted === true, '目標地点で「使用」を押し続けると爆弾が設置される');

console.log('\n=== 結果 ===');
console.log(errors.length ? 'エラー:\n' + [...new Set(errors)].slice(0, 10).join('\n') : 'JS エラーなし');
await browser.close();
