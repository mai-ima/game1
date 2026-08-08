/**
 * 武器定義（ステータス / ゲームバランス）。
 *
 * バランス設計の基準:
 *   - プレイヤー体力 100
 *   - キルタイム(TTK) は近距離で 250〜420ms に収める
 *   - アサルトライフルを基準(1.0)とし、SMG は近距離有利・低威力、
 *     スナイパーは一撃必殺だが取り回しが重い、という三竦みにする
 *
 * damage       : 胴体基準ダメージ
 * headMul      : ヘッドショット倍率
 * limbMul      : 手足倍率
 * rpm          : 毎分発射数
 * falloff      : [開始距離m, 終了距離m, 最終倍率] この間で線形にダメージ減衰
 * spread       : 腰だめ/ADS の基本拡散（ラジアン）
 * recoil       : 反動パラメータ
 * adsTime      : 覗き込み完了までの秒数
 * sprintOutTime: スプリントから射撃可能になるまでの秒数
 */

export const FIRE_MODE = { AUTO: 'auto', SEMI: 'semi', BURST: 'burst', BOLT: 'bolt', PUMP: 'pump' };

export const WEAPON_CLASS = {
  AR: 'アサルトライフル',
  SMG: 'サブマシンガン',
  LMG: '軽機関銃',
  SNIPER: 'スナイパーライフル',
  SHOTGUN: 'ショットガン',
  PISTOL: 'ハンドガン',
};

export const WEAPONS = {
  /* ---------------- アサルトライフル ---------------- */
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    nameJa: 'AK-47',
    class: WEAPON_CLASS.AR,
    desc: '高威力・高反動の傑作アサルトライフル。中距離での制圧力に優れるが、跳ね上がりが強く連射制御に習熟を要する。',
    model: 'ak47',
    fireMode: FIRE_MODE.AUTO,

    damage: 36,
    headMul: 1.55,
    limbMul: 0.88,
    rpm: 600,
    falloff: [26, 52, 0.68],

    magSize: 30,
    reserveAmmo: 150,
    reloadTime: 2.35,
    reloadEmptyTime: 3.05,

    adsTime: 0.30,
    sprintOutTime: 0.24,
    swapTime: 0.68,

    spread: { hip: 0.052, ads: 0.0016, moveMul: 1.85, airMul: 3.2, crouchMul: 0.72 },
    recoil: {
      vertical: 0.0125, horizontal: 0.0058, randomness: 0.42,
      recovery: 9.0, adsMul: 0.72, firstShotMul: 0.55,
      // 連射時の反動パターン（縦, 横）。上へ跳ねつつ右へ流れる AK 特有の癖
      pattern: [[1.0, 0.0], [1.15, 0.25], [1.2, 0.55], [1.1, 0.85], [1.0, 0.6], [0.95, -0.2], [0.9, -0.7], [0.85, -0.95]],
    },
    kick: { back: 0.028, up: 0.020, roll: 0.030 },   // ビューモデルの反動
    muzzleVelocity: 715,
    penetration: 0.55,
    unlockLevel: 1,
    attachments: ['redDot', 'scope4x', 'suppressor'],
  },

  m4a1: {
    id: 'm4a1',
    name: 'M4A1',
    nameJa: 'M4A1',
    class: WEAPON_CLASS.AR,
    desc: '扱いやすい標準的なカービン。反動が素直でどの距離でも安定して戦える万能機。',
    model: 'm4a1',
    fireMode: FIRE_MODE.AUTO,

    damage: 28,
    headMul: 1.5,
    limbMul: 0.9,
    rpm: 800,          // M4A1 のサイクリックレート（実測 700〜950 の中央値）
    falloff: [30, 58, 0.72],

    magSize: 30,
    reserveAmmo: 180,
    reloadTime: 2.05,
    reloadEmptyTime: 2.72,

    adsTime: 0.25,
    sprintOutTime: 0.19,
    swapTime: 0.58,

    spread: { hip: 0.046, ads: 0.0012, moveMul: 1.7, airMul: 3.0, crouchMul: 0.7 },
    recoil: {
      vertical: 0.0088, horizontal: 0.0034, randomness: 0.30,
      recovery: 10.5, adsMul: 0.68, firstShotMul: 0.5,
      pattern: [[1.0, 0.0], [1.05, -0.15], [1.1, -0.35], [1.05, -0.2], [1.0, 0.25], [0.95, 0.5], [0.9, 0.35], [0.88, -0.1]],
    },
    kick: { back: 0.020, up: 0.014, roll: 0.018 },
    muzzleVelocity: 880,
    penetration: 0.48,
    unlockLevel: 1,
    attachments: ['redDot', 'scope4x', 'suppressor'],
  },

  /* ---------------- サブマシンガン ---------------- */
  mp5: {
    id: 'mp5',
    name: 'MP5',
    nameJa: 'MP5',
    class: WEAPON_CLASS.SMG,
    desc: '極めて低い反動と速い取り回しを両立した近距離の名手。中距離以遠では威力減衰が大きい。',
    model: 'mp5',
    fireMode: FIRE_MODE.AUTO,

    damage: 24,
    headMul: 1.42,
    limbMul: 0.92,
    rpm: 800,          // MP5A3 のサイクリックレート
    falloff: [16, 34, 0.55],

    magSize: 30,
    reserveAmmo: 210,
    reloadTime: 1.82,
    reloadEmptyTime: 2.45,

    adsTime: 0.19,
    sprintOutTime: 0.13,
    swapTime: 0.46,

    spread: { hip: 0.038, ads: 0.0014, moveMul: 1.35, airMul: 2.4, crouchMul: 0.74 },
    recoil: {
      vertical: 0.0062, horizontal: 0.0030, randomness: 0.26,
      recovery: 12.5, adsMul: 0.66, firstShotMul: 0.5,
      pattern: [[1.0, 0.0], [1.0, 0.2], [0.95, 0.35], [0.92, 0.1], [0.9, -0.25], [0.88, -0.45], [0.86, -0.2], [0.85, 0.15]],
    },
    kick: { back: 0.014, up: 0.010, roll: 0.014 },
    muzzleVelocity: 400,
    penetration: 0.28,
    unlockLevel: 1,
    attachments: ['redDot', 'suppressor'],
  },

  /* ---------------- スナイパーライフル ---------------- */
  sniper: {
    id: 'sniper',
    name: 'M200 INTERVENTION',
    nameJa: 'M200 インターベンション',
    class: WEAPON_CLASS.SNIPER,
    desc: '.408 CheyTac を撃つ大型ボルトアクション狙撃銃。胴体命中で確殺だが、次弾までの隙が大きく近距離では脆い。',
    model: 'sniper',
    fireMode: FIRE_MODE.BOLT,

    // 実銃: .408 CheyTac、7 連弾倉、初速 910m/s
    damage: 110,
    headMul: 1.5,
    limbMul: 0.85,
    rpm: 45,
    boltTime: 1.10,
    falloff: [150, 240, 0.92],

    magSize: 7,
    reserveAmmo: 35,
    reloadTime: 3.15,
    reloadEmptyTime: 3.75,

    adsTime: 0.52,
    sprintOutTime: 0.42,
    swapTime: 0.95,

    spread: { hip: 0.115, ads: 0.0, moveMul: 2.6, airMul: 4.5, crouchMul: 0.6 },
    recoil: {
      vertical: 0.052, horizontal: 0.010, randomness: 0.35,
      recovery: 5.5, adsMul: 1.0, firstShotMul: 1.0,
      pattern: [[1.0, 0.0]],
    },
    kick: { back: 0.075, up: 0.055, roll: 0.045 },
    muzzleVelocity: 910,
    penetration: 0.94,
    scope: { magnification: 6.5, defaultAttachment: 'scope8x' },
    unlockLevel: 4,
    attachments: ['scope8x', 'suppressor'],
  },

  /* ---------------- ショットガン ---------------- */
  shotgun: {
    id: 'shotgun',
    name: 'M870 BREACHER',
    nameJa: 'M870 ブリーチャー',
    class: WEAPON_CLASS.SHOTGUN,
    desc: 'ポンプアクション散弾銃。至近距離では圧倒的だが、少し離れると急激に威力を失う。',
    model: 'shotgun',
    fireMode: FIRE_MODE.PUMP,

    damage: 17,
    pellets: 9,
    headMul: 1.25,
    limbMul: 0.95,
    rpm: 78,
    pumpTime: 0.72,
    falloff: [7, 15, 0.18],

    magSize: 6,
    reserveAmmo: 42,
    reloadTime: 0.62,     // 1 発ずつ装填
    shellReload: true,
    reloadEmptyTime: 0.62,

    adsTime: 0.28,
    sprintOutTime: 0.22,
    swapTime: 0.66,

    spread: { hip: 0.062, ads: 0.040, moveMul: 1.2, airMul: 1.6, crouchMul: 0.85 },
    recoil: {
      vertical: 0.040, horizontal: 0.012, randomness: 0.5,
      recovery: 6.5, adsMul: 0.85, firstShotMul: 1.0,
      pattern: [[1.0, 0.0]],
    },
    kick: { back: 0.062, up: 0.048, roll: 0.052 },
    muzzleVelocity: 400,
    penetration: 0.15,
    unlockLevel: 3,
    attachments: ['redDot'],
  },

  /* ---------------- ハンドガン ---------------- */
  pistol: {
    id: 'pistol',
    name: 'M1911',
    nameJa: 'M1911',
    class: WEAPON_CLASS.PISTOL,
    desc: '信頼性の高い .45 口径の自動拳銃。副武装として、また咄嗟の切り替えに優れる。',
    model: 'pistol',
    fireMode: FIRE_MODE.SEMI,

    damage: 34,
    headMul: 1.5,
    limbMul: 0.9,
    rpm: 420,
    falloff: [14, 30, 0.6],

    magSize: 8,
    reserveAmmo: 56,
    reloadTime: 1.62,
    reloadEmptyTime: 2.15,

    adsTime: 0.17,
    sprintOutTime: 0.11,
    swapTime: 0.36,

    spread: { hip: 0.034, ads: 0.0018, moveMul: 1.4, airMul: 2.2, crouchMul: 0.76 },
    recoil: {
      vertical: 0.0165, horizontal: 0.0055, randomness: 0.34,
      recovery: 13.0, adsMul: 0.7, firstShotMul: 1.0,
      pattern: [[1.0, 0.0], [1.0, 0.3], [0.95, -0.3]],
    },
    kick: { back: 0.026, up: 0.022, roll: 0.024 },
    muzzleVelocity: 250,
    penetration: 0.22,
    unlockLevel: 1,
    attachments: ['suppressor'],
  },

  /* ---------------- 追加: SCAR-H (Mk 17) ---------------- */
  scarh: {
    id: 'scarh',
    name: 'SCAR-H Mk17',
    nameJa: 'SCAR-H Mk17',
    class: WEAPON_CLASS.AR,
    desc: '7.62mm を撃つ重量級バトルライフル。一発が重く中遠距離で強いが、装弾数が少なく反動も大きい。',
    model: 'scarh',
    fireMode: FIRE_MODE.AUTO,

    // 実銃: 7.62×51mm NATO、20 連弾倉、サイクリック 600rpm、初速 715m/s（16 インチ銃身）
    damage: 40,
    headMul: 1.55,
    limbMul: 0.9,
    rpm: 550,
    falloff: [38, 70, 0.78],

    magSize: 20,
    reserveAmmo: 120,
    reloadTime: 2.42,
    reloadEmptyTime: 3.15,

    adsTime: 0.32,
    sprintOutTime: 0.26,
    swapTime: 0.72,

    spread: { hip: 0.055, ads: 0.0016, moveMul: 1.9, airMul: 3.2, crouchMul: 0.7 },
    recoil: {
      vertical: 0.0295, horizontal: 0.0105, randomness: 0.30,
      recovery: 6.4, adsMul: 0.74, firstShotMul: 1.30,
      pattern: [[1.0, 0.0], [1.0, 0.25], [0.95, -0.35], [0.9, 0.45], [0.85, -0.2]],
    },
    kick: { back: 0.042, up: 0.034, roll: 0.026 },
    muzzleVelocity: 715,
    penetration: 0.72,
    unlockLevel: 6,
    attachments: ['redDot', 'scope4x', 'suppressor'],
  },

  /* ---------------- 追加: FN P90 ---------------- */
  p90: {
    id: 'p90',
    name: 'FN P90',
    nameJa: 'FN P90',
    class: WEAPON_CLASS.SMG,
    desc: '機関部上面に 50 連の横置き弾倉を載せたブルパップ短機関銃。継戦能力と取り回しに優れる。',
    model: 'p90',
    fireMode: FIRE_MODE.AUTO,

    // 実銃: 5.7×28mm、50 連弾倉、サイクリック 900rpm、初速 715m/s
    damage: 20,
    headMul: 1.45,
    limbMul: 0.94,
    rpm: 900,
    falloff: [20, 40, 0.58],

    magSize: 50,
    reserveAmmo: 200,
    reloadTime: 2.60,
    reloadEmptyTime: 3.20,

    adsTime: 0.20,
    sprintOutTime: 0.14,
    swapTime: 0.48,

    spread: { hip: 0.040, ads: 0.0014, moveMul: 1.30, airMul: 2.1, crouchMul: 0.82 },
    recoil: {
      vertical: 0.0132, horizontal: 0.0060, randomness: 0.40,
      recovery: 11.5, adsMul: 0.62, firstShotMul: 1.05,
      pattern: [[1.0, 0.0], [0.95, 0.3], [0.9, -0.35], [0.9, 0.2]],
    },
    kick: { back: 0.020, up: 0.017, roll: 0.016 },
    muzzleVelocity: 715,
    penetration: 0.44,
    unlockLevel: 5,
    attachments: ['redDot', 'suppressor'],
  },

  /* ---------------- 追加: M249 SAW（軽機関銃） ---------------- */
  m249: {
    id: 'm249',
    name: 'M249 SAW',
    nameJa: 'M249 SAW',
    class: WEAPON_CLASS.LMG,
    desc: 'ベルト給弾の分隊支援火器。100 発を撃ち続けられる制圧力が身上だが、構えも移動も鈍重。',
    model: 'm249',
    fireMode: FIRE_MODE.AUTO,

    // 実銃: 5.56×45mm NATO、200 連ベルト（携行は 100 連ボックス）、
    //       サイクリック 800rpm、初速 915m/s
    damage: 30,
    headMul: 1.45,
    limbMul: 0.9,
    rpm: 800,
    falloff: [34, 66, 0.74],

    magSize: 100,
    reserveAmmo: 200,
    reloadTime: 5.20,        // ベルト交換は遅い
    reloadEmptyTime: 6.10,

    adsTime: 0.46,
    sprintOutTime: 0.38,
    swapTime: 0.95,

    // 腰だめは大きく散るが、伏せ・しゃがみで一気に締まる
    spread: { hip: 0.078, ads: 0.0022, moveMul: 2.4, airMul: 4.2, crouchMul: 0.52 },
    recoil: {
      vertical: 0.0205, horizontal: 0.0115, randomness: 0.46,
      recovery: 7.2, adsMul: 0.70, firstShotMul: 1.0,
      pattern: [[1.0, 0.0], [0.95, 0.4], [0.9, -0.5], [0.85, 0.55], [0.8, -0.35], [0.8, 0.3]],
    },
    kick: { back: 0.030, up: 0.024, roll: 0.030 },
    muzzleVelocity: 915,
    penetration: 0.68,
    unlockLevel: 7,
    attachments: ['redDot', 'scope4x'],
  },

  /* ---------------- 追加: Glock 17 ---------------- */
  glock17: {
    id: 'glock17',
    name: 'GLOCK 17',
    nameJa: 'グロック 17',
    class: WEAPON_CLASS.PISTOL,
    desc: '9mm を 17 発装填するポリマーフレーム拳銃。M1911 より一発は軽いが、弾数と連射で押せる。',
    model: 'glock17',
    fireMode: FIRE_MODE.SEMI,

    // 実銃: 9×19mm、17 連弾倉、初速 375m/s
    damage: 26,
    headMul: 1.5,
    limbMul: 0.9,
    rpm: 450,
    falloff: [16, 32, 0.62],

    magSize: 17,
    reserveAmmo: 68,
    reloadTime: 1.48,
    reloadEmptyTime: 1.95,

    adsTime: 0.16,
    sprintOutTime: 0.10,
    swapTime: 0.34,

    spread: { hip: 0.030, ads: 0.0016, moveMul: 1.35, airMul: 2.1, crouchMul: 0.78 },
    recoil: {
      vertical: 0.0126, horizontal: 0.0044, randomness: 0.32,
      recovery: 14.0, adsMul: 0.7, firstShotMul: 1.0,
      pattern: [[1.0, 0.0], [1.0, 0.25], [0.95, -0.25]],
    },
    kick: { back: 0.020, up: 0.017, roll: 0.018 },
    muzzleVelocity: 375,
    penetration: 0.24,
    unlockLevel: 2,
    attachments: ['suppressor'],
  },
};

/** アタッチメントによるステータス補正 */
export const ATTACHMENTS = {
  redDot: {
    name: 'レッドドットサイト',
    desc: '素早い照準が可能なドット式照準器。視界が広い。',
    mods: { adsTime: -0.02, adsSpreadMul: 0.85 },
    opticZoom: 1.15,
  },
  scope4x: {
    name: '4倍スコープ',
    desc: '中〜遠距離での精度を高める。覗き込みが遅くなる。',
    mods: { adsTime: 0.08, adsSpreadMul: 0.7, recoilMul: 0.94 },
    opticZoom: 4.0,
    pip: true,
  },
  scope8x: {
    name: '8倍スコープ',
    desc: '遠距離狙撃用の高倍率スコープ。',
    mods: { adsTime: 0.14, adsSpreadMul: 0.55 },
    opticZoom: 8.0,
    pip: true,
  },
  suppressor: {
    name: 'サプレッサー',
    desc: '発砲音と発射炎を抑え、ミニマップに表示されなくなる。射程がわずかに落ちる。',
    mods: { falloffMul: 0.88, damageMul: 0.96, adsTime: 0.02 },
    silent: true,
    hideMuzzleFlash: true,
  },
};

/** 1発あたりの発射間隔（秒） */
export function fireInterval(def) {
  return 60 / def.rpm;
}

/**
 * 距離に応じた実効ダメージを計算。
 * @param {object} def 武器定義
 * @param {number} dist 距離(m)
 * @param {string} hitZone 'head' | 'body' | 'limb'
 */
export function damageAt(def, dist, hitZone = 'body') {
  const [near, far, endMul] = def.falloff;
  let mul = 1;
  if (dist > near) {
    const t = Math.min(1, (dist - near) / Math.max(0.001, far - near));
    mul = 1 + (endMul - 1) * t;
  }
  let zone = 1;
  if (hitZone === 'head') zone = def.headMul;
  else if (hitZone === 'limb') zone = def.limbMul;
  return def.damage * mul * zone;
}

/** 既定のロードアウト（解禁レベル順） */
export const DEFAULT_LOADOUTS = [
  { primary: 'm4a1', secondary: 'pistol', attachments: { m4a1: ['redDot'] } },
  { primary: 'ak47', secondary: 'pistol', attachments: { ak47: ['redDot'] } },
  { primary: 'mp5', secondary: 'pistol', attachments: {} },
  { primary: 'sniper', secondary: 'pistol', attachments: { sniper: ['scope8x'] } },
  { primary: 'shotgun', secondary: 'pistol', attachments: {} },
  { primary: 'p90', secondary: 'glock17', attachments: { p90: ['redDot'] } },
  { primary: 'scarh', secondary: 'glock17', attachments: { scarh: ['scope4x'] } },
  { primary: 'm249', secondary: 'glock17', attachments: {} },
];
