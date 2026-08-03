import * as THREE from 'three';
import {
  GunBuilder, roundedBox, tubeZ, tubeY, tubeX, extrudeProfile, curvedBox,
  picatinnyRail, flashHider, suppressor, pistolGrip, triggerGuard, trigger,
  frontSight, rearSight, boltHead, slingLoop, chargingHandle, merge,
} from './GunParts.js';

/**
 * 武器の手続き型モデル定義。
 * 各関数は GunBuilder を返し、呼び出し側でマテリアルを与えて Mesh 化する。
 *
 * マテリアルキー:
 *   metal      … 主要な鋼部品（パーカライズ仕上げ）
 *   darkMetal  … より暗い鋼 / 黒染め
 *   polymer    … 樹脂パーツ
 *   wood       … 木製ストック・ハンドガード
 *   accent     … 真鍮 / 銅（薬莢・刻印）
 *   optic      … 光学機器の筐体
 *   lens       … レンズ面（発光）
 */

/* ================================================================== *
 *  AK-47
 * ================================================================== */
export function buildAK47() {
  const b = new GunBuilder();

  /* --- レシーバ（打ち抜き鋼板） --- */
  // 特徴的な台形断面
  const recvProfile = [
    [-0.019, 0.000], [0.019, 0.000],
    [0.019, 0.052], [0.013, 0.062], [-0.013, 0.062], [-0.019, 0.052],
  ];
  b.add('metal', extrudeProfile(recvProfile, 0.245, 0.0018), { y: 0.0, z: 0.012 });

  // ダストカバー（上面）
  b.add('metal', roundedBox(0.030, 0.012, 0.212, 0.006, 0.002), { y: 0.066, z: 0.020 });
  // ダストカバーの補強リブ
  for (let i = 0; i < 2; i++) {
    b.add('metal', roundedBox(0.0035, 0.006, 0.190, 0.001, 0.0006), { x: (i ? 1 : -1) * 0.010, y: 0.072, z: 0.020 });
  }

  // レシーバのリベット（AK の象徴的なディテール）
  for (const z of [-0.085, -0.045, 0.062, 0.098]) {
    b.addMirrored('darkMetal', boltHead(0.0028, 0.0018, 8), { x: 0.0192, z, y: 0.020, ry: Math.PI / 2 });
  }
  for (const z of [-0.070, 0.080]) {
    b.addMirrored('darkMetal', boltHead(0.0028, 0.0018, 8), { x: 0.0192, z, y: 0.045, ry: Math.PI / 2 });
  }

  /* --- 銃身とガスシステム --- */
  b.add('darkMetal', tubeZ(0.0092, 0.0092, 0.300, 18), { y: 0.049, z: -0.238 });
  // ガスブロック
  b.add('metal', roundedBox(0.026, 0.030, 0.036, 0.004, 0.002), { y: 0.058, z: -0.300 });
  b.add('metal', tubeZ(0.0062, 0.0062, 0.026, 12), { y: 0.075, z: -0.300, rx: -0.30 });
  // ガスチューブ（銃身上）
  b.add('metal', tubeZ(0.0088, 0.0088, 0.175, 16), { y: 0.072, z: -0.205 });
  b.add('metal', roundedBox(0.021, 0.010, 0.030, 0.003, 0.0015), { y: 0.074, z: -0.122 });

  /* --- 木製ハンドガード --- */
  // 下部（握り部）
  const lowerHG = extrudeProfile([
    [-0.021, 0.000], [0.021, 0.000], [0.023, 0.014], [0.018, 0.030],
    [-0.018, 0.030], [-0.023, 0.014],
  ], 0.128, 0.002);
  b.add('wood', lowerHG, { y: 0.024, z: -0.176 });
  // 上部（ガスチューブを覆う）
  const upperHG = extrudeProfile([
    [-0.019, 0.000], [0.019, 0.000], [0.016, 0.022], [-0.016, 0.022],
  ], 0.118, 0.002);
  b.add('wood', upperHG, { y: 0.066, z: -0.196 });
  // ハンドガードの金属リテーナ
  b.add('metal', roundedBox(0.044, 0.034, 0.014, 0.004, 0.0018), { y: 0.048, z: -0.117 });
  b.add('metal', roundedBox(0.046, 0.030, 0.012, 0.004, 0.0018), { y: 0.052, z: -0.243 });

  /* --- マズルブレーキ（AKM 型の斜めカット） --- */
  b.add('darkMetal', tubeZ(0.0125, 0.0125, 0.052, 16), { y: 0.049, z: -0.404 });
  b.add('darkMetal', roundedBox(0.026, 0.020, 0.030, 0.003, 0.0015), { y: 0.053, z: -0.412, rx: 0.34 });
  b.add('darkMetal', tubeZ(0.0136, 0.0136, 0.006, 16), { y: 0.049, z: -0.376 });

  /* --- 照準器 --- */
  b.add('metal', frontSight(0.026, 0.013), { y: 0.076, z: -0.352 });
  b.add('metal', rearSight(0.022, 0.017, false), { y: 0.068, z: -0.086 });
  // リアサイトブロック（タンジェント式の傾斜）
  b.add('metal', roundedBox(0.030, 0.014, 0.052, 0.003, 0.0015), { y: 0.060, z: -0.092, rx: -0.06 });

  /* --- マガジン（湾曲した 30 連） --- */
  b.add('metal', curvedBox(0.026, 0.048, 0.185, 0.36, 9, 0.94), { y: -0.006, z: -0.030, rx: 0.10 });
  // マガジンキャッチ
  b.add('darkMetal', roundedBox(0.012, 0.016, 0.010, 0.002, 0.001), { y: -0.004, z: 0.052 });

  /* --- グリップ --- */
  b.add('polymer', pistolGrip(0.030, 0.100, 0.040, 0.40), { y: -0.004, z: 0.058 });

  /* --- トリガー周り --- */
  b.add('metal', triggerGuard(0.015, 0.050, 0.032), { y: -0.002, z: 0.020 });
  b.add('darkMetal', trigger(0.007, 0.024), { y: -0.006, z: 0.024 });

  /* --- セレクターレバー（AK の巨大な右側レバー） --- */
  b.add('metal', roundedBox(0.006, 0.062, 0.016, 0.003, 0.0012), { x: 0.021, y: 0.030, z: 0.010 });
  b.add('metal', roundedBox(0.007, 0.014, 0.030, 0.003, 0.0012), { x: 0.021, y: 0.056, z: -0.006 });

  /* --- チャージングハンドル（右側・ボルトキャリアと一体） --- */
  b.add('metal', chargingHandle(0.048, 0.0055), { x: 0.024, y: 0.056, z: -0.052, ry: 0.0 });

  /* --- 木製ストック --- */
  const stockProfile = [
    [-0.021, 0.000], [0.021, 0.000], [0.023, 0.052], [0.019, 0.070],
    [-0.019, 0.070], [-0.023, 0.052],
  ];
  b.add('wood', extrudeProfile(stockProfile, 0.210, 0.003), { y: 0.006, z: 0.240, rx: -0.055 });
  // バットプレート
  b.add('darkMetal', roundedBox(0.040, 0.088, 0.010, 0.005, 0.002), { y: 0.030, z: 0.346, rx: -0.055 });
  // ストック下部の窪み
  b.add('wood', roundedBox(0.034, 0.026, 0.100, 0.010, 0.004), { y: -0.006, z: 0.210, rx: 0.12 });

  /* --- 小物: スリング環、刻印プレート --- */
  b.add('darkMetal', slingLoop(0.0075, 0.0016), { x: -0.020, y: 0.030, z: 0.156, ry: Math.PI / 2 });
  b.add('darkMetal', slingLoop(0.0075, 0.0016), { x: -0.022, y: 0.040, z: -0.248, ry: Math.PI / 2 });
  b.add('accent', roundedBox(0.024, 0.010, 0.0012, 0.001, 0.0005), { x: 0.0196, y: 0.038, z: 0.072, ry: Math.PI / 2 });

  /* --- 取付位置 --- */
  b.anchor('muzzle', 0, 0.049, -0.432);
  b.anchor('eject', 0.022, 0.056, -0.028);
  b.anchor('sight', 0, 0.086, -0.086);       // アイアンサイトの目線高さ
  b.anchor('optic', 0, 0.078, -0.030);
  b.anchor('grip', 0, -0.05, 0.070);
  b.anchor('magazine', 0, -0.02, -0.030);
  return b;
}

/* ================================================================== *
 *  M4A1 カービン
 * ================================================================== */
export function buildM4A1() {
  const b = new GunBuilder();

  /* --- ロワーレシーバ --- */
  b.add('metal', roundedBox(0.030, 0.044, 0.170, 0.006, 0.0022), { y: 0.020, z: 0.030 });
  // マグウェル
  b.add('metal', roundedBox(0.034, 0.052, 0.048, 0.006, 0.0022), { y: -0.006, z: -0.028 });
  b.add('metal', roundedBox(0.038, 0.010, 0.052, 0.005, 0.002), { y: 0.018, z: -0.028 });

  /* --- アッパーレシーバ --- */
  b.add('metal', roundedBox(0.032, 0.036, 0.196, 0.010, 0.0025), { y: 0.058, z: -0.010 });
  // ブラスディフレクタ（AR の象徴）
  b.add('metal', roundedBox(0.012, 0.020, 0.028, 0.006, 0.002), { x: 0.018, y: 0.058, z: 0.030 });
  // フォワードアシスト
  b.add('metal', tubeZ(0.0062, 0.0062, 0.022, 12), { x: 0.019, y: 0.070, z: 0.048 });
  b.add('metal', roundedBox(0.011, 0.014, 0.010, 0.003, 0.0012), { x: 0.019, y: 0.070, z: 0.060 });
  // エジェクションポートカバー
  b.add('darkMetal', roundedBox(0.004, 0.021, 0.044, 0.002, 0.001), { x: 0.017, y: 0.055, z: 0.020 });

  /* --- フラットトップレール --- */
  b.add('metal', picatinnyRail(0.190, 0.021), { y: 0.076, z: -0.010 });

  /* --- 銃身 --- */
  b.add('darkMetal', tubeZ(0.0082, 0.0082, 0.238, 18), { y: 0.058, z: -0.226 });
  // バレルナット
  b.add('metal', tubeZ(0.0155, 0.0155, 0.028, 20), { y: 0.058, z: -0.120 });
  // ガスブロック + ガスチューブ
  b.add('metal', roundedBox(0.020, 0.024, 0.028, 0.003, 0.0015), { y: 0.062, z: -0.286 });
  b.add('metal', tubeZ(0.0032, 0.0032, 0.150, 10), { y: 0.076, z: -0.212 });

  /* --- クアッドレール・ハンドガード --- */
  const hgLen = 0.168;
  b.add('metal', tubeZ(0.0245, 0.0245, hgLen, 8), { y: 0.058, z: -0.190, rz: Math.PI / 8 });
  // 4 面のレール
  b.add('metal', picatinnyRail(hgLen * 0.94, 0.021), { y: 0.082, z: -0.190 });
  b.add('metal', picatinnyRail(hgLen * 0.94, 0.021), { y: 0.034, z: -0.190, rz: Math.PI });
  b.add('metal', picatinnyRail(hgLen * 0.94, 0.021), { x: 0.024, y: 0.058, z: -0.190, rz: -Math.PI / 2 });
  b.add('metal', picatinnyRail(hgLen * 0.94, 0.021), { x: -0.024, y: 0.058, z: -0.190, rz: Math.PI / 2 });

  /* --- バードケージ・フラッシュハイダー --- */
  b.add('darkMetal', flashHider(0.0112, 0.052, 5), { y: 0.058, z: -0.372 });

  /* --- 照準器（フリップアップ） --- */
  b.add('darkMetal', frontSight(0.024, 0.012), { y: 0.086, z: -0.262 });
  b.add('darkMetal', rearSight(0.022, 0.018, true), { y: 0.082, z: -0.052 });

  /* --- マガジン（STANAG 30連・わずかに湾曲） --- */
  b.add('polymer', curvedBox(0.024, 0.044, 0.178, 0.90, 8, 0.97), { y: -0.014, z: -0.028, rx: 0.04 });
  b.add('polymer', roundedBox(0.028, 0.012, 0.050, 0.003, 0.0015), { y: -0.186, z: -0.010 });

  /* --- グリップ --- */
  b.add('polymer', pistolGrip(0.029, 0.096, 0.038, 0.32), { y: -0.002, z: 0.070 });

  /* --- トリガー --- */
  b.add('metal', triggerGuard(0.014, 0.048, 0.030), { y: -0.002, z: 0.026 });
  b.add('darkMetal', trigger(0.007, 0.023), { y: -0.006, z: 0.030 });
  // セレクター
  b.add('darkMetal', roundedBox(0.006, 0.010, 0.026, 0.002, 0.001), { x: -0.017, y: 0.030, z: 0.058 });

  /* --- チャージングハンドル（T 字・後方） --- */
  b.add('metal', roundedBox(0.048, 0.008, 0.014, 0.002, 0.001), { y: 0.070, z: 0.128 });
  b.add('metal', roundedBox(0.010, 0.010, 0.056, 0.002, 0.001), { y: 0.070, z: 0.106 });

  /* --- 伸縮ストック --- */
  b.add('metal', tubeZ(0.0165, 0.0165, 0.170, 14), { y: 0.040, z: 0.180 });
  b.add('polymer', roundedBox(0.036, 0.062, 0.096, 0.010, 0.004), { y: 0.038, z: 0.212 });
  b.add('polymer', roundedBox(0.040, 0.078, 0.012, 0.006, 0.003), { y: 0.036, z: 0.262 });
  // チークレスト
  b.add('polymer', roundedBox(0.030, 0.014, 0.086, 0.006, 0.003), { y: 0.072, z: 0.206 });
  // ストック位置調整の刻み
  for (let i = 0; i < 5; i++) {
    b.add('darkMetal', roundedBox(0.006, 0.004, 0.005, 0.001, 0.0006), { y: 0.023, z: 0.150 + i * 0.018 });
  }

  /* --- 小物 --- */
  b.add('darkMetal', slingLoop(0.0072, 0.0016), { x: -0.021, y: 0.040, z: 0.150, ry: Math.PI / 2 });
  b.add('darkMetal', boltHead(0.0032, 0.002, 8), { x: 0.0155, y: 0.030, z: -0.006, ry: Math.PI / 2 });
  b.add('darkMetal', boltHead(0.0032, 0.002, 8), { x: -0.0155, y: 0.030, z: -0.006, ry: Math.PI / 2 });

  b.anchor('muzzle', 0, 0.058, -0.400);
  b.anchor('eject', 0.020, 0.058, 0.020);
  b.anchor('sight', 0, 0.098, -0.052);
  b.anchor('optic', 0, 0.086, -0.030);
  b.anchor('grip', 0, -0.05, 0.080);
  b.anchor('magazine', 0, -0.03, -0.028);
  return b;
}

/* ================================================================== *
 *  MP5 サブマシンガン
 * ================================================================== */
export function buildMP5() {
  const b = new GunBuilder();

  // レシーバ（円筒 + 角）
  b.add('metal', tubeZ(0.0215, 0.0215, 0.210, 16), { y: 0.052, z: -0.010 });
  b.add('metal', roundedBox(0.036, 0.030, 0.130, 0.006, 0.0025), { y: 0.040, z: 0.020 });
  // 特徴的な溝
  for (let i = 0; i < 3; i++) {
    b.addMirrored('darkMetal', roundedBox(0.003, 0.010, 0.120, 0.001, 0.0006), { x: 0.0208, y: 0.045 + i * 0.010, z: -0.020 });
  }

  // 銃身とハンドガード
  b.add('darkMetal', tubeZ(0.0072, 0.0072, 0.140, 14), { y: 0.052, z: -0.170 });
  b.add('polymer', roundedBox(0.038, 0.040, 0.150, 0.012, 0.004), { y: 0.046, z: -0.164 });
  b.add('darkMetal', flashHider(0.0098, 0.030, 4), { y: 0.052, z: -0.248 });

  // ドラムサイト（MP5 の象徴）
  b.add('metal', tubeZ(0.014, 0.014, 0.020, 16), { y: 0.080, z: 0.040 });
  b.add('metal', roundedBox(0.020, 0.026, 0.016, 0.003, 0.0015), { y: 0.074, z: 0.040 });
  b.add('metal', frontSight(0.022, 0.011), { y: 0.070, z: -0.226 });

  // マガジン（直線的な 30 連）
  b.add('metal', roundedBox(0.022, 0.170, 0.040, 0.005, 0.002), { y: -0.062, z: -0.052, rx: 0.04 });

  // グリップ・トリガー
  b.add('polymer', pistolGrip(0.030, 0.092, 0.038, 0.30), { y: 0.014, z: 0.060 });
  b.add('metal', triggerGuard(0.014, 0.044, 0.028), { y: 0.016, z: 0.024 });
  b.add('darkMetal', trigger(0.007, 0.022), { y: 0.012, z: 0.028 });

  // コッキングレバー（左前方の跳ね上げ）
  b.add('metal', roundedBox(0.010, 0.012, 0.038, 0.003, 0.0015), { x: -0.026, y: 0.078, z: -0.118 });
  b.add('metal', roundedBox(0.024, 0.010, 0.012, 0.003, 0.0015), { x: -0.034, y: 0.078, z: -0.132 });

  // 伸縮ストック
  b.add('metal', roundedBox(0.008, 0.010, 0.150, 0.002, 0.001), { x: 0.016, y: 0.048, z: 0.150 });
  b.add('metal', roundedBox(0.008, 0.010, 0.150, 0.002, 0.001), { x: -0.016, y: 0.048, z: 0.150 });
  b.add('polymer', roundedBox(0.042, 0.052, 0.014, 0.006, 0.003), { y: 0.048, z: 0.226 });

  b.anchor('muzzle', 0, 0.052, -0.264);
  b.anchor('eject', 0.020, 0.058, -0.020);
  b.anchor('sight', 0, 0.096, 0.040);
  b.anchor('optic', 0, 0.080, 0.000);
  b.anchor('magazine', 0, -0.05, -0.052);
  return b;
}

/* ================================================================== *
 *  ハンドガン（M1911 系）
 * ================================================================== */
export function buildPistol() {
  const b = new GunBuilder();

  // スライド
  b.add('metal', roundedBox(0.026, 0.030, 0.176, 0.005, 0.0022), { y: 0.062, z: -0.024 });
  // スライドのセレーション
  for (let i = 0; i < 7; i++) {
    b.addMirrored('darkMetal', roundedBox(0.0028, 0.020, 0.0035, 0.0006, 0.0004), { x: 0.0132, y: 0.062, z: 0.030 + i * 0.0075 });
  }
  // 銃身とブッシング
  b.add('darkMetal', tubeZ(0.0072, 0.0072, 0.020, 14), { y: 0.058, z: -0.110 });
  b.add('metal', tubeZ(0.0105, 0.0105, 0.012, 16), { y: 0.058, z: -0.106 });

  // フレーム
  b.add('metal', roundedBox(0.024, 0.026, 0.130, 0.004, 0.002), { y: 0.036, z: 0.006 });
  // グリップ（角度付き）
  b.add('polymer', pistolGrip(0.028, 0.086, 0.036, 0.44), { y: 0.024, z: 0.050 });
  // グリップパネル
  b.addMirrored('wood', roundedBox(0.004, 0.070, 0.030, 0.004, 0.0015), { x: 0.0145, y: -0.014, z: 0.062, rx: 0.44 });

  // トリガー
  b.add('metal', triggerGuard(0.013, 0.040, 0.028), { y: 0.032, z: 0.010 });
  b.add('darkMetal', trigger(0.006, 0.020), { y: 0.030, z: 0.012 });

  // ハンマー
  b.add('darkMetal', roundedBox(0.006, 0.020, 0.010, 0.003, 0.0012), { y: 0.078, z: 0.078, rx: -0.30 });

  // 照準器
  b.add('darkMetal', roundedBox(0.006, 0.008, 0.006, 0.001, 0.0006), { y: 0.080, z: -0.104 });
  b.add('darkMetal', roundedBox(0.016, 0.008, 0.008, 0.001, 0.0006), { y: 0.080, z: 0.050 });

  // マガジンベース
  b.add('darkMetal', roundedBox(0.024, 0.008, 0.034, 0.002, 0.001), { y: -0.052, z: 0.056 });

  b.anchor('muzzle', 0, 0.058, -0.120);
  b.anchor('eject', 0.016, 0.070, -0.010);
  b.anchor('sight', 0, 0.090, 0.050);
  b.anchor('optic', 0, 0.082, 0.000);
  b.anchor('magazine', 0, -0.03, 0.056);
  return b;
}

/* ================================================================== *
 *  ボルトアクション狙撃銃
 * ================================================================== */
export function buildSniper() {
  const b = new GunBuilder();

  // レシーバ
  b.add('metal', roundedBox(0.034, 0.040, 0.230, 0.008, 0.003), { y: 0.062, z: 0.020 });
  // ヘビーバレル（テーパー付き）
  b.add('darkMetal', tubeZ(0.0105, 0.0135, 0.420, 20), { y: 0.062, z: -0.300 });
  // マズルブレーキ
  b.add('darkMetal', tubeZ(0.0165, 0.0165, 0.062, 18), { y: 0.062, z: -0.540 });
  for (let i = 0; i < 4; i++) {
    b.addMirrored('darkMetal', roundedBox(0.006, 0.012, 0.008, 0.001, 0.0006), { x: 0.014, y: 0.070, z: -0.556 + i * 0.013 });
  }

  // ボルトハンドル
  b.add('metal', tubeZ(0.0085, 0.0085, 0.090, 14), { x: 0.020, y: 0.076, z: 0.030 });
  b.add('metal', tubeX(0.0055, 0.048), { x: 0.046, y: 0.072, z: 0.062 });
  b.add('metal', new THREE.SphereGeometry(0.0092, 14, 12), { x: 0.070, y: 0.072, z: 0.062 });

  // シャーシ / ストック
  b.add('polymer', roundedBox(0.044, 0.048, 0.250, 0.012, 0.004), { y: 0.024, z: 0.060 });
  b.add('polymer', roundedBox(0.042, 0.070, 0.150, 0.014, 0.005), { y: 0.040, z: 0.256 });
  b.add('polymer', roundedBox(0.046, 0.088, 0.014, 0.008, 0.003), { y: 0.036, z: 0.332 });
  // チークピース
  b.add('polymer', roundedBox(0.036, 0.024, 0.110, 0.008, 0.003), { y: 0.086, z: 0.236 });
  // ハンドガード（フリーフロート）
  b.add('metal', tubeZ(0.026, 0.026, 0.220, 10), { y: 0.062, z: -0.180, rz: Math.PI / 10 });
  b.add('metal', picatinnyRail(0.200, 0.021), { y: 0.088, z: -0.180 });

  // 上部レール
  b.add('metal', picatinnyRail(0.210, 0.021), { y: 0.084, z: 0.020 });

  // マガジン
  b.add('metal', roundedBox(0.026, 0.070, 0.080, 0.005, 0.002), { y: -0.014, z: -0.030 });

  // グリップ / トリガー
  b.add('polymer', pistolGrip(0.030, 0.100, 0.040, 0.30), { y: 0.006, z: 0.086 });
  b.add('metal', triggerGuard(0.015, 0.050, 0.032), { y: 0.006, z: 0.038 });
  b.add('darkMetal', trigger(0.007, 0.024), { y: 0.002, z: 0.042 });

  // バイポッド（畳んだ状態）
  b.addMirrored('darkMetal', roundedBox(0.008, 0.008, 0.130, 0.002, 0.001), { x: 0.014, y: 0.034, z: -0.230, rx: 0.14 });

  b.anchor('muzzle', 0, 0.062, -0.572);
  b.anchor('eject', 0.022, 0.070, 0.030);
  b.anchor('sight', 0, 0.100, 0.020);
  b.anchor('optic', 0, 0.092, -0.020);
  b.anchor('magazine', 0, -0.04, -0.030);
  return b;
}

/* ================================================================== *
 *  ショットガン（ポンプアクション）
 * ================================================================== */
export function buildShotgun() {
  const b = new GunBuilder();

  b.add('metal', roundedBox(0.038, 0.046, 0.190, 0.008, 0.003), { y: 0.052, z: 0.030 });
  // 銃身 + チューブマガジン
  b.add('darkMetal', tubeZ(0.0155, 0.0155, 0.400, 18), { y: 0.062, z: -0.260 });
  b.add('darkMetal', tubeZ(0.0125, 0.0125, 0.330, 16), { y: 0.032, z: -0.230 });
  // ポンプ（フォアエンド）
  b.add('polymer', roundedBox(0.046, 0.040, 0.130, 0.012, 0.004), { y: 0.036, z: -0.200 });
  for (let i = 0; i < 6; i++) {
    b.add('polymer', roundedBox(0.048, 0.005, 0.008, 0.001, 0.0006), { y: 0.017, z: -0.250 + i * 0.020 });
  }
  // 照準（ビーズ）
  b.add('accent', new THREE.SphereGeometry(0.0035, 10, 8), { y: 0.080, z: -0.446 });
  // ストック
  b.add('polymer', roundedBox(0.042, 0.058, 0.210, 0.014, 0.005), { y: 0.036, z: 0.216, rx: -0.05 });
  b.add('polymer', roundedBox(0.044, 0.082, 0.014, 0.008, 0.003), { y: 0.024, z: 0.320, rx: -0.05 });
  // グリップ・トリガー
  b.add('polymer', pistolGrip(0.030, 0.086, 0.038, 0.42), { y: 0.006, z: 0.086 });
  b.add('metal', triggerGuard(0.015, 0.046, 0.030), { y: 0.006, z: 0.044 });
  b.add('darkMetal', trigger(0.007, 0.022), { y: 0.002, z: 0.048 });

  b.anchor('muzzle', 0, 0.062, -0.462);
  b.anchor('eject', 0.022, 0.056, 0.010);
  b.anchor('sight', 0, 0.086, -0.446);
  b.anchor('optic', 0, 0.080, 0.020);
  b.anchor('magazine', 0, 0.03, -0.230);
  return b;
}

/* ================================================================== *
 *  光学サイト（アタッチメント）
 * ================================================================== */

/** レッドドットサイト */
export function buildRedDot() {
  const b = new GunBuilder();
  // 筐体
  b.add('optic', roundedBox(0.034, 0.036, 0.062, 0.006, 0.0025), { y: 0.020 });
  // 前後の開口
  b.add('optic', tubeZ(0.0148, 0.0148, 0.058, 20, true), { y: 0.022 });
  // レンズ
  b.add('lens', new THREE.CircleGeometry(0.0138, 24), { y: 0.022, z: -0.027, ry: Math.PI });
  b.add('lens', new THREE.CircleGeometry(0.0138, 24), { y: 0.022, z: 0.027 });
  // マウント
  b.add('optic', roundedBox(0.026, 0.014, 0.036, 0.003, 0.0015), { y: -0.002 });
  b.add('optic', roundedBox(0.030, 0.008, 0.020, 0.002, 0.001), { x: 0.014, y: 0.004, z: 0.006 });
  // 調整ノブ
  b.add('optic', tubeY(0.0072, 0.0072, 0.010, 12), { y: 0.040, z: 0.014 });
  b.add('optic', tubeX(0.0072, 0.010), { x: 0.019, y: 0.020, z: 0.014 });
  b.anchor('lens', 0, 0.022, -0.027);
  return b;
}

/** 倍率スコープ */
export function buildScope(magnification = 4) {
  const b = new GunBuilder();
  const len = 0.20 + magnification * 0.012;
  // 本体チューブ
  b.add('optic', tubeZ(0.0155, 0.0155, len, 24), { y: 0.030 });
  // 対物レンズ側のベル
  b.add('optic', tubeZ(0.0248, 0.0175, 0.050, 24), { y: 0.030, z: -len / 2 - 0.018 });
  b.add('lens', new THREE.CircleGeometry(0.0235, 28), { y: 0.030, z: -len / 2 - 0.042, ry: Math.PI });
  // 接眼側
  b.add('optic', tubeZ(0.0195, 0.0165, 0.044, 24), { y: 0.030, z: len / 2 + 0.016 });
  b.add('lens', new THREE.CircleGeometry(0.0182, 28), { y: 0.030, z: len / 2 + 0.037 });
  // 倍率リング
  b.add('optic', tubeZ(0.0185, 0.0185, 0.026, 24), { y: 0.030, z: len / 2 - 0.014 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add('optic', roundedBox(0.0022, 0.0022, 0.022, 0.0005, 0.0003), {
      x: Math.cos(a) * 0.0186, y: 0.030 + Math.sin(a) * 0.0186, z: len / 2 - 0.014,
    });
  }
  // タレット
  b.add('optic', tubeY(0.0105, 0.0105, 0.020, 16), { y: 0.048, z: -0.010 });
  b.add('optic', tubeX(0.0105, 0.020), { x: 0.020, y: 0.030, z: -0.010 });
  // マウントリング
  for (const z of [-0.052, 0.048]) {
    b.add('optic', tubeZ(0.0195, 0.0195, 0.016, 20, true), { y: 0.030, z });
    b.add('optic', roundedBox(0.024, 0.026, 0.016, 0.003, 0.0012), { y: 0.010, z });
  }
  b.anchor('lens', 0, 0.030, len / 2 + 0.037);
  b.anchor('objective', 0, 0.030, -len / 2 - 0.042);
  return b;
}

export const MODEL_BUILDERS = {
  ak47: buildAK47,
  m4a1: buildM4A1,
  mp5: buildMP5,
  pistol: buildPistol,
  sniper: buildSniper,
  shotgun: buildShotgun,
};

export const ATTACHMENT_BUILDERS = {
  redDot: buildRedDot,
  scope4x: () => buildScope(4),
  scope8x: () => buildScope(8),
  suppressor: () => {
    const b = new GunBuilder();
    b.add('darkMetal', suppressor(0.019, 0.185), {});
    b.anchor('muzzle', 0, 0, -0.100);
    return b;
  },
};
