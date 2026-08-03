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
    rpm: 760,
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
    rpm: 855,
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
    name: 'MK-14 INTERVENTION',
    nameJa: 'MK-14 インターベンション',
    class: WEAPON_CLASS.SNIPER,
    desc: 'ボルトアクションの対人狙撃銃。胴体命中で確殺だが、次弾までの隙が大きく近距離では脆い。',
    model: 'sniper',
    fireMode: FIRE_MODE.BOLT,

    damage: 110,
    headMul: 1.5,
    limbMul: 0.85,
    rpm: 48,
    boltTime: 1.05,
    falloff: [120, 200, 0.9],

    magSize: 5,
    reserveAmmo: 30,
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
    muzzleVelocity: 900,
    penetration: 0.92,
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
];
