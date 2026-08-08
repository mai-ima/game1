import * as THREE from 'three';
import { SURFACE } from '../Physics.js';
import * as P from '../Props.js';

/**
 * マップ 0: TESTBED（テストベッド）
 *
 * 遊ぶためではなく、確かめるための場所。
 * 対戦にも使えるが、本来の役目は次の 2 つ。
 *
 *   1. アセットの出来を目で見る
 *      小物・建材・マテリアルを、同じ光の下に同じ間隔で並べる。
 *      マップの中に散らばっていると、隣と比べられないので
 *      「これだけ質感が浮いている」に気付けない。
 *
 *   2. 動作の数値を測る
 *      何 cm の段差まで乗れるか、何度の斜面を登れるか、
 *      どの厚さの壁を弾が抜けるか、何 m の落下で死ぬか。
 *      目盛の付いた構造物を置いて、遊びながら読み取れるようにする。
 *
 * 区画は西から東へ並べ、名札を付けてある。
 *   西  … 基準寸法 / 移動の検証
 *   中央… 射撃と貫通の検証
 *   東  … 小物と建材の展示、マテリアル見本
 *   北  … 屋内棟（照明と閉所の検証）
 *
 * 検証用なので、意図的に「作り込みすぎない」場所がある。
 * 地面はグリッドを敷いた平面のままにしてあり、
 * 展示物の輪郭が背景に紛れないようにしている。
 */

export const MAP_INFO = {
  id: 'testbed',
  name: 'TESTBED',
  nameJa: 'テストベッド',
  desc: '検証用の平坦地。小物と建材を並べた展示区画、段差・斜面・貫通の計測台、距離標を備える。対戦もできる。',
  size: '検証用',
  players: '2〜8人',
  sun: { elevation: 52, azimuth: 145 },
  fog: { color: 0xc9c4bb, near: 90, far: 320, density: 0.0009 },
  bounds: { min: { x: -66, z: -42 }, max: { x: 66, z: 42 } },
  /** 一覧で「これは検証用」と分かるようにする印 */
  utility: true,
};

const HALF_Z = 40;
const WEST = -64;
const EAST = 64;

/* 区画の色帯（名札の左端に入る） */
const HUE = {
  base: '#8b9299',      // 基準寸法
  move: '#4a90d9',      // 移動
  fire: '#d9482f',      // 射撃・貫通
  asset: '#c8783c',     // 展示
  mat: '#6f9e6a',       // マテリアル
  light: '#c9a227',     // 照明
};

export function buildTestbed(b) {
  const rand = mulberry32(20250808);

  ground(b);
  sectionBase(b, -56);
  sectionMovement(b, -34);
  sectionBallistics(b, -4);
  sectionAssets(b, 20, rand);
  // 見本は 10 列 × 1.5m = 15m 使う。東の外周（x=63）に収まる位置に置く
  sectionMaterials(b, 45);
  indoorBlock(b, 0, -30);

  /* ---- スポーンと目標（対戦にも使えるように） ---- */
  spawnPad(b, -60, 30, 'B');
  spawnPad(b, 60, -30, 'A');
  b.objective('A', -34, 0, 12, 4.0);
  b.objective('B', 0, 0, 0, 4.0);
  b.objective('C', 34, 0, -12, 4.0);
}

/* ================================================================= *
 *  地面と外周
 * ================================================================= */

function ground(b) {
  const w = EAST - WEST, cx = (EAST + WEST) / 2;
  /*
   * 下地はコンクリート。
   * 土や草にすると模様が主張して、展示物の質感を見るときに邪魔になる。
   */
  b.floor({ x: cx, y: 0, z: 0, w, d: HALF_Z * 2, mat: 'concreteFloor', surface: SURFACE.CONCRETE });

  /*
   * 5m ごとの目盛線。
   * 「あの箱まで何 m か」を目分量で言えるようにしておくと、
   * 射程やダメージ減衰の確認が一気に楽になる。
   */
  for (let x = WEST + 4; x <= EAST - 4; x += 5) {
    const major = Math.abs(x % 25) < 0.01;
    b.box({
      x, y: 0.011, z: 0, w: major ? 0.10 : 0.045, h: 0.02, d: HALF_Z * 2 - 6,
      mat: major ? 'lineWhite' : 'lineYellow', surface: SURFACE.CONCRETE, collide: false,
    });
  }
  for (let z = -HALF_Z + 6; z <= HALF_Z - 6; z += 5) {
    const major = Math.abs(z % 25) < 0.01;
    b.box({
      x: cx, y: 0.011, z, w: w - 8, h: 0.02, d: major ? 0.10 : 0.045,
      mat: major ? 'lineWhite' : 'lineYellow', surface: SURFACE.CONCRETE, collide: false,
    });
  }

  // 外周のフェンス（落ちない・迷わない）
  for (const [x1, z1, x2, z2] of [
    [WEST + 1, -HALF_Z + 1, EAST - 1, -HALF_Z + 1],
    [WEST + 1, HALF_Z - 1, EAST - 1, HALF_Z - 1],
    [WEST + 1, -HALF_Z + 1, WEST + 1, HALF_Z - 1],
    [EAST - 1, -HALF_Z + 1, EAST - 1, HALF_Z - 1],
  ]) {
    P.chainFence(b, { x1, z1, x2, z2, h: 3.0 });
  }
}

/**
 * 名札。
 * 板は光の影響を受けない材質にしてあるので、日陰でも読める。
 */
function label(b, o) {
  const { x, y = 1.5, z, yaw = 0, text, sub = '', accent = '#c8783c', w = 2.6 } = o;
  const h = w * 0.25;
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, b.mats.label(text, { sub, accent }));
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  b.addExtra(mesh);
  // 裏から見ても板があると分かるように、背板と支柱を付ける
  b.box({ x, y, z: z - Math.cos(yaw) * 0.02, w: w + 0.08, h: h + 0.08, d: 0.04, yaw,
    mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  for (const s of [-1, 1]) {
    b.cylinder({
      x: x + Math.cos(yaw) * (w / 2 - 0.15) * s, y: 0, z: z - Math.sin(yaw) * (w / 2 - 0.15) * s,
      radius: 0.035, height: y - h / 2, segments: 6, mat: 'galvanized', surface: SURFACE.METAL, collide: false,
    });
  }
  return b;
}

/**
 * 展示台の前面に貼る銘板。
 *
 * 自立する名札を展示物の手前に立てると、肝心の展示物が隠れてしまう。
 * 博物館の展示と同じで、台の前面に貼るのが読みやすく邪魔にならない。
 */
function plate(b, o) {
  const { x, y = 0.26, z, yaw = 0, text, sub = '', accent = '#c8783c', w = 1.3 } = o;
  const h = w * 0.25;
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, b.mats.label(text, { sub, accent }));
  mesh.position.set(x + Math.sin(yaw) * 0.012, y, z + Math.cos(yaw) * 0.012);
  mesh.rotation.y = yaw;
  b.addExtra(mesh);
  return b;
}

/**
 * 床に寝かせて置く銘板。
 * 段差の並びのように、上から見下ろしながら歩く場所で読ませる。
 * 立てると視線を遮るし、低い段では貼る面が無い。
 */
function floorPlate(b, o) {
  const { x, z, text, sub = '', accent = '#c8783c', w = 1.5, yaw = 0 } = o;
  const geo = new THREE.PlaneGeometry(w, w * 0.25);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, b.mats.label(text, { sub, accent }));
  mesh.position.set(x, 0.035, z);
  mesh.rotation.y = yaw;
  b.addExtra(mesh);
  return b;
}

/** 高さの目盛が付いた棒（1m ごとに帯） */
function measurePole(b, o) {
  const { x, z, height = 4, mat = 'galvanized' } = o;
  b.cylinder({ x, y: 0, z, radius: 0.045, height, segments: 8, mat, surface: SURFACE.METAL, collide: false });
  for (let m = 1; m <= Math.floor(height); m++) {
    b.cylinder({ x, y: m - 0.03, z, radius: 0.075, height: 0.06, segments: 8,
      mat: m % 2 ? 'lineWhite' : 'hazardStripe', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/* ================================================================= *
 *  区画 1: 基準寸法
 * ================================================================= */

function sectionBase(b, cx) {
  label(b, { x: cx, y: 2.6, z: 16, text: '基準寸法', sub: 'SCALE REFERENCE', accent: HUE.base, w: 3.4 });

  // 舗装で区画を仕切る
  b.box({ x: cx, y: 0.014, z: 4, w: 18, h: 0.03, d: 22, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });

  /*
   * 人の背丈と目の高さ。
   * モデルや建具の寸法が合っているかは、隣に基準が無いと判らない。
   */
  measurePole(b, { x: cx - 7, z: 12, height: 5 });
  b.box({ x: cx - 6.2, y: 0.85, z: 12, w: 0.5, h: 1.70, d: 0.22, mat: 'paintedMetalTan', surface: SURFACE.METAL });
  label(b, { x: cx - 6.2, y: 2.15, z: 12, text: '1.70 m', sub: '立位の背丈', accent: HUE.base, w: 1.5 });
  b.box({ x: cx - 4.8, y: 0.65, z: 12, w: 0.5, h: 1.30, d: 0.22, mat: 'paintedMetal', surface: SURFACE.METAL });
  label(b, { x: cx - 4.8, y: 1.75, z: 12, text: '1.30 m', sub: '中腰の目線', accent: HUE.base, w: 1.5 });
  b.box({ x: cx - 3.4, y: 0.4, z: 12, w: 0.5, h: 0.80, d: 0.22, mat: 'paintedMetal', surface: SURFACE.METAL });
  label(b, { x: cx - 3.4, y: 1.25, z: 12, text: '0.80 m', sub: '伏せの目線', accent: HUE.base, w: 1.5 });

  /* ---- 標準的な建具 ---- */
  // 出入口（2.0 × 0.9）
  b.wallWithGap({ x1: cx - 1, z1: 6, x2: cx + 4, z2: 6, h: 3.0, thickness: 0.24,
    gapStart: 2.0, gapWidth: 0.9, gapTop: 2.0, mat: 'plaster', surface: SURFACE.CONCRETE });
  label(b, { x: cx + 1.5, y: 3.4, z: 6, text: '出入口', sub: 'H2.00 × W0.90', accent: HUE.base, w: 2.2 });
  // 窓（腰高 0.9・高さ 1.2）
  b.wallWithGap({ x1: cx - 1, z1: 1, x2: cx + 4, z2: 1, h: 3.0, thickness: 0.24,
    gapStart: 1.8, gapWidth: 1.5, gapBottom: 0.9, gapTop: 2.1, mat: 'plaster', surface: SURFACE.CONCRETE });
  label(b, { x: cx + 1.5, y: 3.4, z: 1, text: '窓', sub: '腰 0.90 / H1.20 × W1.50', accent: HUE.base, w: 2.6 });

  // 標準階段（蹴上 0.18 / 踏面 0.28）と手すり
  b.stairs({ x: cx - 5, y: 0, z: -2, width: 1.4, rise: 0.18, run: 0.28, steps: 12, yaw: 0, mat: 'concrete' });
  b.box({ x: cx - 5, y: 1.08, z: -6.1, w: 1.4, h: 2.16, d: 1.6, mat: 'concrete', surface: SURFACE.CONCRETE });
  P.railing(b, { x1: cx - 5.7, z1: -2.2, x2: cx - 5.7, z2: -5.4, y: 1.1, height: 1.1 });
  label(b, { x: cx - 5, y: 2.9, z: -1.4, text: '階段', sub: '蹴上 0.18 / 踏面 0.28', accent: HUE.base, w: 2.6 });

  // 1m 立方（体積の基準）
  b.box({ x: cx + 3, y: 0.5, z: -3, w: 1, h: 1, d: 1, mat: 'hazardStripe', surface: SURFACE.METAL });
  label(b, { x: cx + 3, y: 1.55, z: -3, text: '1 m³', accent: HUE.base, w: 1.2 });
}

/* ================================================================= *
 *  区画 2: 移動の検証
 * ================================================================= */

function sectionMovement(b, cx) {
  label(b, { x: cx, y: 2.6, z: 16, text: '移動の検証', sub: 'MOVEMENT', accent: HUE.move, w: 3.4 });
  b.box({ x: cx, y: 0.014, z: 2, w: 26, h: 0.03, d: 30, mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });

  /* ---- 段差の階段: どこまで乗れるか ---- */
  const steps = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.75];
  for (let i = 0; i < steps.length; i++) {
    const hgt = steps[i];
    const x = cx - 12 + i * 2.5;
    b.box({ x, y: hgt / 2, z: 11, w: 1.5, h: hgt, d: 2.6, mat: 'concrete', surface: SURFACE.CONCRETE });
    // 段の色を高さで変え、遠目にも順序が読めるようにする
    b.box({ x, y: hgt + 0.011, z: 11, w: 1.5, h: 0.02, d: 2.6,
      mat: hgt <= 0.45 ? 'lineWhite' : 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
    floorPlate(b, { x, z: 13.0, text: `${(hgt * 100).toFixed(0)} cm`, accent: HUE.move, w: 1.6 });
  }
  label(b, { x: cx - 9.5, y: 2.2, z: 14.8, text: '段差 — 乗り越えの上限', accent: HUE.move, w: 4.6 });

  /* ---- 斜面: 何度まで登れるか ---- */
  const slopes = [10, 20, 30, 40, 50];
  for (let i = 0; i < slopes.length; i++) {
    const deg = slopes[i];
    const x = cx - 10 + i * 4.4;
    const len = 5.0;
    const hgt = len * Math.tan(deg * Math.PI / 180);
    b.ramp({ x, y: 0, z: 4.6, width: 2.6, length: len, height: hgt, yaw: Math.PI, steps: 20, mat: 'asphalt' });
    b.box({ x, y: hgt / 2, z: 4.6 + len + 0.9, w: 2.6, h: hgt, d: 1.8, mat: 'concrete', surface: SURFACE.CONCRETE });
    floorPlate(b, { x, z: 3.6, text: `${deg}°`, accent: HUE.move, w: 1.5 });
  }
  label(b, { x: cx, y: 2.2, z: 2.2, text: '斜面 — 登坂の上限', accent: HUE.move, w: 4.2 });

  /* ---- 隙間: 跳べる距離 ---- */
  const gaps = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5];
  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i];
    const z = -3 - i * 2.4;
    b.box({ x: cx - 5, y: 0.6, z, w: 3.4, h: 1.2, d: 1.9, mat: 'concrete', surface: SURFACE.CONCRETE });
    b.box({ x: cx - 5 + 3.4 / 2 + gap + 1.7, y: 0.6, z, w: 3.4, h: 1.2, d: 1.9, mat: 'concrete', surface: SURFACE.CONCRETE });
    floorPlate(b, { x: cx - 8.6, z, yaw: Math.PI / 2, text: `${gap.toFixed(1)} m`, accent: HUE.move, w: 1.6 });
  }
  label(b, { x: cx - 2, y: 2.6, z: -1.4, text: '隙間 — 跳べる距離', accent: HUE.move, w: 4.0 });

  /* ---- よじ登り: 何 m まで手が掛かるか ---- */
  const mantle = [1.0, 1.4, 1.8, 2.2, 2.6];
  for (let i = 0; i < mantle.length; i++) {
    const hgt = mantle[i];
    const x = cx + 5 + i * 2.4;
    b.box({ x, y: hgt / 2, z: -8, w: 2.0, h: hgt, d: 1.0, mat: 'brickPale', surface: SURFACE.CONCRETE });
    plate(b, { x, y: hgt * 0.5, z: -7.48, text: `${hgt.toFixed(1)} m`, accent: HUE.move, w: 1.7 });
  }
  label(b, { x: cx + 9.8, y: 3.4, z: -8, text: 'よじ登り', accent: HUE.move, w: 2.6 });

  /* ---- 落下: 高さとダメージ ---- */
  const drops = [2, 4, 6, 9, 13];
  let tx = cx + 5;
  for (let i = 0; i < drops.length; i++) {
    const hgt = drops[i];
    b.box({ x: tx, y: hgt / 2, z: -14, w: 2.4, h: hgt, d: 2.4, mat: 'concrete', surface: SURFACE.CONCRETE });
    plate(b, { x: tx, y: 1.1, z: -12.78, text: `${hgt} m`, accent: HUE.move, w: 2.0 });
    // 上へ行ける梯子代わりの段
    if (i > 0) {
      const prev = drops[i - 1];
      b.box({ x: tx - 1.35, y: (prev + hgt) / 2 - 0.15, z: -14, w: 0.7, h: 0.3, d: 2.4, mat: 'diamondPlate', surface: SURFACE.METAL });
    }
    tx += 2.7;
  }
  b.stairs({ x: cx + 5, y: 0, z: -11.6, width: 1.6, rise: 0.2, run: 0.3, steps: 10, yaw: 0, mat: 'concrete' });
  label(b, { x: cx + 10, y: 1.4, z: -17, text: '落下 — 高さと被害', accent: HUE.move, w: 4.2 });
}

/* ================================================================= *
 *  区画 3: 射撃と貫通
 * ================================================================= */

function sectionBallistics(b, cx) {
  label(b, { x: cx, y: 2.6, z: 16, text: '射撃と貫通', sub: 'BALLISTICS', accent: HUE.fire, w: 3.4 });

  /* ---- 射座 ---- */
  b.box({ x: cx - 12, y: 0.014, z: 0, w: 8, h: 0.03, d: 12, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  b.box({ x: cx - 12, y: 0.55, z: 3.4, w: 7.0, h: 1.1, d: 0.45, mat: 'concrete', surface: SURFACE.CONCRETE });
  label(b, { x: cx - 12, y: 1.55, z: 3.4, text: '射座', sub: 'FIRING LINE', accent: HUE.fire, w: 2.2 });

  /*
   * 距離標と的。
   * 射座から真東へ 5 / 10 / 25 / 50 / 75 / 100m。
   * 減衰と拡散の効き方を、距離ごとに見比べられる。
   */
  const marks = [5, 10, 25, 50, 75, 100];
  for (const m of marks) {
    const x = cx - 12 + m;
    if (x > EAST - 4) continue;
    measurePole(b, { x, z: -3.2, height: 3 });
    label(b, { x, y: 3.3, z: -3.2, text: `${m} m`, accent: HUE.fire, w: 1.5 });
    // 的（人の胸の高さ）
    b.box({ x, y: 1.15, z: -1.2, w: 0.05, h: 1.5, d: 0.5, mat: 'plywood', surface: SURFACE.WOOD, penetration: 0.6 });
    b.box({ x: x - 0.03, y: 1.35, z: -1.2, w: 0.02, h: 0.4, d: 0.4, mat: 'lineWhite', surface: SURFACE.WOOD, collide: false });
    b.box({ x: x - 0.035, y: 1.35, z: -1.2, w: 0.02, h: 0.16, d: 0.16, mat: 'plasticGlossRed', surface: SURFACE.WOOD, collide: false });
    // 足元に距離を書いた床の帯
    b.box({ x, y: 0.013, z: 0.6, w: 0.6, h: 0.02, d: 3.2, mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }

  /* ---- 貫通の壁 ---- */
  /*
   * 素材と厚みを変えた板を並べる。
   * 「この壁は抜けるのか」を撃って確かめられるようにするのが目的なので、
   * 名札には素材名と厚みを入れる。
   */
  const panels = [
    ['plywood', 0.02, '合板 20mm', SURFACE.WOOD, 0.75],
    ['wood', 0.06, '板 60mm', SURFACE.WOOD, 0.55],
    ['sidingMetal', 0.01, '鋼板 1mm', SURFACE.METAL, 0.5],
    ['corrugated', 0.02, '波板 2mm', SURFACE.METAL, 0.55],
    ['concreteBlock', 0.19, 'コンクリブロック 190mm', SURFACE.CONCRETE, 0.12],
    ['concrete', 0.30, 'コンクリート 300mm', SURFACE.CONCRETE, 0],
    ['sandbag', 0.42, '土嚢 420mm', SURFACE.FABRIC, 0.1],
    ['brick', 0.21, '煉瓦 210mm', SURFACE.CONCRETE, 0.15],
  ];
  for (let i = 0; i < panels.length; i++) {
    const [mat, th, name, surf, pen] = panels[i];
    const z = 6.5 + i * 2.4;
    b.box({ x: cx + 6, y: 1.1, z, w: th, h: 2.2, d: 2.0, mat, surface: surf, penetration: pen });
    // 支持枠（板が宙に浮いて見えないように）
    for (const s of [-1, 1]) {
      b.box({ x: cx + 6, y: 1.1, z: z + s * 1.05, w: 0.09, h: 2.3, d: 0.09, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    label(b, { x: cx + 4.6, y: 2.55, z, yaw: -Math.PI / 2, text: name, sub: `貫通 ${(pen * 100).toFixed(0)}%`, accent: HUE.fire, w: 2.8 });
  }
  label(b, { x: cx + 6, y: 3.4, z: 5.0, yaw: -Math.PI / 2, text: '貫通の検証', accent: HUE.fire, w: 3.2 });

  /* ---- 弾痕を見る板（広い面） ---- */
  b.box({ x: cx - 4, y: 1.6, z: 9, w: 6.0, h: 3.2, d: 0.3, mat: 'concrete', surface: SURFACE.CONCRETE });
  b.box({ x: cx - 4, y: 1.6, z: 12, w: 6.0, h: 3.2, d: 0.3, mat: 'sidingMetal', surface: SURFACE.METAL });
  b.box({ x: cx - 4, y: 1.6, z: 15, w: 6.0, h: 3.2, d: 0.3, mat: 'wood', surface: SURFACE.WOOD });
  label(b, { x: cx - 7.4, y: 2.4, z: 12, yaw: Math.PI / 2, text: '着弾痕', sub: 'コンクリ / 鋼板 / 木', accent: HUE.fire, w: 3.0 });
}

/* ================================================================= *
 *  区画 4: 小物と建材の展示
 * ================================================================= */

function sectionAssets(b, cx, rand) {
  label(b, { x: cx, y: 2.6, z: 16, text: '小物と建材の展示', sub: 'ASSET GALLERY', accent: HUE.asset, w: 4.4 });

  /*
   * 展示台。
   * 台に載せると背景から浮いて、輪郭とシルエットが読める。
   * 直に地面へ置くと、影と地面の模様に紛れて形が判らない。
   */
  const PED_H = 0.52, PED_D = 1.7;
  const pedestal = (x, z, w = 1.7, d = PED_D, h = PED_H) => {
    b.box({ x, y: h / 2, z, w, h, d, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
    // 天端に一段の水切り。台がただの箱に見えないようにする
    b.box({ x, y: h + 0.02, z, w: w + 0.07, h: 0.04, d: d + 0.07, mat: 'concrete', surface: SURFACE.CONCRETE, collide: false });
    return h + 0.04;
  };

  /* ---- 列 1: 収納・資材 ---- */
  const row1 = [
    ['木箱', (x, z, y) => P.woodCrate(b, { x, y, z, yaw: 0.3 })],
    ['弾薬箱', (x, z, y) => P.ammoCrate(b, { x, y, z, yaw: -0.2 })],
    ['ドラム缶', (x, z, y) => P.barrel(b, { x, y, z })],
    ['土嚢', (x, z, y) => P.sandbagStack(b, { x, y, z, rows: 3, perRow: 4, length: 1.5 })],
    ['パレット', (x, z, y) => P.pallet(b, { x, y, z, yaw: 0.15 })],
    ['タイヤ', (x, z, y) => P.tireStack(b, { x, y, z, count: 3 })],
    ['段ボール', (x, z, y) => P.cardboardStack(b, { x, y, z, count: 3 })],
    ['携行缶', (x, z, y) => P.jerryCan(b, { x, y, z, yaw: 0.4 })],
  ];
  layoutRow(b, row1, cx - 9, 12, 2.6, pedestal, HUE.asset);
  label(b, { x: cx - 9 - 2.0, y: 1.6, z: 12, yaw: Math.PI / 2, text: '収納・資材', accent: HUE.asset, w: 2.6 });

  /* ---- 列 2: 工事現場 ---- */
  const row2 = [
    ['鉄筋束', (x, z, y) => P.rebarBundle(b, { x, y, z, yaw: 0.2, count: 10, length: 2.4 })],
    ['型枠合板', (x, z, y) => P.formworkStack(b, { x, y, z, yaw: 0.1, count: 7 })],
    ['ブロック', (x, z, y) => P.blockPallet(b, { x, y, z, rows: 3 })],
    ['骨材の山', (x, z, y) => P.aggregatePile(b, { x, y, z, radius: 1.1, height: 0.8, mat: 'gravel' })],
    ['砂の山', (x, z, y) => P.aggregatePile(b, { x, y, z, radius: 1.1, height: 0.7, mat: 'sand' })],
    ['瓦礫', (x, z, y) => P.rubble(b, { x, y, z, radius: 1.2, count: 12 })],
  ];
  layoutRow(b, row2, cx - 9, 7.5, 2.6, pedestal, HUE.asset);
  label(b, { x: cx - 9 - 2.0, y: 1.6, z: 7.5, yaw: Math.PI / 2, text: '工事現場', accent: HUE.asset, w: 2.6 });

  /* ---- 列 3: 街の設備（台なしの実寸配置） ---- */
  P.streetLight(b, { x: cx - 8, y: 0, z: 2, yaw: -Math.PI / 2 });
  label(b, { x: cx - 8, y: 1.4, z: 3.4, text: '街灯', accent: HUE.asset, w: 1.6 });
  P.utilityPole(b, { x: cx - 4, y: 0, z: 2 });
  label(b, { x: cx - 4, y: 1.4, z: 3.4, text: '電柱', accent: HUE.asset, w: 1.6 });
  P.waterTank(b, { x: cx, y: 0.55, z: 2 });
  label(b, { x: cx, y: 2.6, z: 3.4, text: '貯水タンク', accent: HUE.asset, w: 2.2 });
  P.acUnit(b, { x: cx + 3.6, y: 0, z: 2, yaw: 0.2 });
  label(b, { x: cx + 3.6, y: 1.4, z: 3.4, text: '室外機', accent: HUE.asset, w: 1.8 });
  P.sign(b, { x: cx + 7, y: 2.2, z: 2, yaw: 0, w: 2.0, h: 0.7, mat: 'plasticGlossRed' });
  label(b, { x: cx + 7, y: 1.2, z: 3.4, text: '看板', accent: HUE.asset, w: 1.6 });
  P.rooftopClutter(b, { x: cx + 10, y: 0, z: 2, yaw: 0.5 });
  label(b, { x: cx + 10, y: 1.4, z: 3.4, text: '屋上機器', accent: HUE.asset, w: 2.0 });

  /* ---- 列 4: 遮蔽と仕切り ---- */
  P.chainFence(b, { x1: cx - 9, z1: -3, x2: cx - 4, z2: -3, h: 2.1 });
  label(b, { x: cx - 6.5, y: 2.5, z: -3, text: '金網', sub: '体は止まる / 弾は抜ける', accent: HUE.asset, w: 3.2 });
  P.chainFence(b, { x1: cx - 2, z1: -3, x2: cx + 3, z2: -3, h: 2.1, tarp: 'tarp' });
  label(b, { x: cx + 0.5, y: 2.5, z: -3, text: '養生シート付き', accent: HUE.asset, w: 3.0 });
  P.railing(b, { x1: cx + 5, z1: -3, x2: cx + 10, z2: -3, y: 0, height: 1.1 });
  label(b, { x: cx + 7.5, y: 1.7, z: -3, text: '手すり', accent: HUE.asset, w: 2.0 });
  P.siteBarrier(b, { x1: cx - 9, z1: -6, x2: cx - 2, z2: -6 });
  label(b, { x: cx - 5.5, y: 1.5, z: -6.9, text: '単管バリケード', accent: HUE.asset, w: 3.0 });
  P.marketStall(b, { x: cx + 3, y: 0, z: -6.5, yaw: 0 });
  label(b, { x: cx + 3, y: 2.9, z: -8.2, text: '屋台', accent: HUE.asset, w: 1.8 });

  /* ---- 列 5: 大物（コンテナ・車両・足場・クレーン） ---- */
  P.container(b, { x: cx - 8, y: 0, z: -12, yaw: 0 });
  label(b, { x: cx - 8, y: 3.1, z: -14.0, text: 'コンテナ', sub: '20ft / 6.06 × 2.44 × 2.59', accent: HUE.asset, w: 3.6 });
  P.container(b, { x: cx - 8, y: 2.59, z: -12, yaw: 0, mat: 'paintedMetalTan' });

  P.vehicle(b, { x: cx, y: 0, z: -12, yaw: Math.PI / 2, type: 'truck' });
  label(b, { x: cx, y: 3.0, z: -14.6, text: 'トラック', accent: HUE.asset, w: 2.2 });
  P.vehicle(b, { x: cx + 6, y: 0, z: -12, yaw: Math.PI / 2, type: 'car', mat: 'rustedMetal' });
  label(b, { x: cx + 6, y: 2.1, z: -14.0, text: '乗用車', accent: HUE.asset, w: 2.0 });

  P.scaffold(b, { x: cx + 11, y: 0, z: -14, yaw: 0, length: 8.0, levels: 3, levelH: 2.2, depth: 1.3 });
  label(b, { x: cx + 11, y: 7.2, z: -15.6, text: '足場', sub: '3 層 / 2.2m ピッチ', accent: HUE.asset, w: 3.0 });

  towerCrane(b, cx - 14, -18);
  label(b, { x: cx - 14, y: 1.6, z: -14.6, text: 'タワークレーン', sub: '基部 + 塔体 + ジブ', accent: HUE.asset, w: 3.6 });

  P.siteOffice(b, { x: cx + 16, y: 0, z: -8, yaw: -Math.PI / 2 });
  label(b, { x: cx + 16, y: 3.4, z: -11.0, text: '現場事務所', accent: HUE.asset, w: 2.6 });

  /* ---- 生活感の小物 ---- */
  P.clothesline(b, { x1: cx - 13, z1: 2, x2: cx - 13, z2: 8, y: 2.6, count: 5 });
  label(b, { x: cx - 13, y: 3.4, z: 5, yaw: Math.PI / 2, text: '洗濯物', accent: HUE.asset, w: 2.0 });
  P.litter(b, { x: cx + 13, y: 0, z: 6, radius: 2.4, count: 16 });
  label(b, { x: cx + 13, y: 1.2, z: 3.4, text: 'ごみ・落ち葉', accent: HUE.asset, w: 2.6 });
  P.pipeRun(b, { x1: cx + 13, z1: -1, x2: cx + 18, z2: -1, y: 2.6, count: 3, radius: 0.09, mat: 'rustedMetal' });
  label(b, { x: cx + 15.5, y: 1.5, z: -1, text: '配管', accent: HUE.asset, w: 1.8 });
}

/** 展示台に載せて 1 列に並べる */
function layoutRow(b, items, x0, z, pitch, pedestal, accent) {
  for (let i = 0; i < items.length; i++) {
    const [name, place] = items[i];
    const x = x0 + i * pitch;
    const h = pedestal(x, z);
    place(x, z, h);
    plate(b, { x, y: 0.3, z: z + 0.9, text: name, accent, w: 1.45 });
  }
}

/** 展示用のタワークレーン（本編のものより小ぶり） */
function towerCrane(b, x, z) {
  b.box({ x, y: 0.3, z, w: 3.2, h: 0.6, d: 3.2, mat: 'concreteRaw', surface: SURFACE.CONCRETE });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box({ x: x + sx * 0.62, y: 5.0, z: z + sz * 0.62, w: 0.14, h: 9.0, d: 0.14,
      mat: 'hazardStripe', surface: SURFACE.METAL });
  }
  // ラチス
  for (let i = 0; i < 7; i++) {
    const ly = 1.1 + i * 1.2;
    for (const [ax, az, dxs, dzs] of [
      [0, -0.62, 1.24, 0.055], [0, 0.62, 1.24, 0.055],
      [-0.62, 0, 0.055, 1.24], [0.62, 0, 0.055, 1.24],
    ]) {
      b.box({ x: x + ax, y: ly, z: z + az, w: dxs, h: 0.055, d: dzs,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    const tilt = (i % 2 ? 1 : -1) * 0.69;
    for (const sz of [-0.62, 0.62]) {
      b.box({ x, y: ly + 0.6, z: z + sz, w: 1.36, h: 0.045, d: 0.045, rz: tilt,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    for (const sx of [-0.62, 0.62]) {
      b.box({ x: x + sx, y: ly + 0.6, z, w: 0.045, h: 0.045, d: 1.36, rx: -tilt,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
  }
  // 運転室・ジブ・カウンタージブ
  b.box({ x, y: 9.9, z: z + 0.9, w: 1.1, h: 1.0, d: 1.3, mat: 'paintedMetal', surface: SURFACE.METAL });
  b.box({ x: x + 4.6, y: 10.3, z, w: 10.0, h: 0.42, d: 0.42, mat: 'hazardStripe', surface: SURFACE.METAL });
  b.box({ x: x - 3.0, y: 10.3, z, w: 4.2, h: 0.36, d: 0.36, mat: 'hazardStripe', surface: SURFACE.METAL });
  b.box({ x: x - 4.6, y: 10.3, z, w: 1.2, h: 0.9, d: 1.0, mat: 'concreteRaw', surface: SURFACE.CONCRETE });
  b.box({ x, y: 11.4, z, w: 0.26, h: 1.8, d: 0.26, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  // 吊りワイヤとフック
  b.box({ x: x + 6.5, y: 8.0, z, w: 0.045, h: 4.4, d: 0.045, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: x + 6.5, y: 5.6, z, w: 0.3, h: 0.44, d: 0.3, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
}

/* ================================================================= *
 *  区画 5: マテリアル見本
 * ================================================================= */

function sectionMaterials(b, cx) {
  label(b, { x: cx, y: 2.6, z: 16, text: 'マテリアル見本', sub: 'MATERIAL SWATCHES', accent: HUE.mat, w: 4.0 });

  /*
   * 同じ光・同じ大きさ・同じ間隔で並べる。
   * 平板だけだと曲面での見え方（法線とハイライトの出方）が判らないので、
   * 板・円柱・球の 3 つを組にする。
   */
  const groups = [
    ['建材', ['concrete', 'concreteRaw', 'plaster', 'paintedWall', 'brick', 'brickPale', 'concreteBlock', 'rock', 'tile', 'paving']],
    ['地面', ['asphalt', 'dirt', 'mud', 'sand', 'gravel', 'grass', 'grassDry', 'tactilePaving']],
    ['金属', ['rustedMetal', 'paintedMetal', 'brushedMetal', 'galvanized', 'corrugated', 'diamondPlate', 'expandedMetal', 'castIron', 'sidingMetal', 'shutter']],
    ['木・布', ['wood', 'woodFloor', 'plywood', 'osb', 'formPly', 'scaffoldPlank', 'fabric', 'camo', 'sandbag', 'tarp']],
    ['屋内', ['marble', 'terrazzo', 'granite', 'carpet', 'wallpaper', 'ceramicTile', 'ceilingPanel', 'velvet', 'brassPolished']],
    ['武器', ['parkerized', 'anodizedBlack', 'cerakoteFDE', 'bluedSteel', 'nitride', 'stampedSteel', 'woodStock', 'polymer']],
  ];

  const PITCH = 1.5;
  let z = 12;
  for (const [gname, list] of groups) {
    label(b, { x: cx - 1.7, y: 1.9, z, yaw: Math.PI / 2, text: gname, accent: HUE.mat, w: 1.9 });
    for (let i = 0; i < list.length; i++) {
      const name = list[i];
      const x = cx + 0.8 + i * PITCH;
      // 台
      b.box({ x, y: 0.19, z, w: PITCH - 0.14, h: 0.38, d: 1.3, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
      // 板（正面向き）
      b.box({ x, y: 1.0, z, w: PITCH - 0.3, h: 1.2, d: 0.09, mat: name, surface: SURFACE.CONCRETE });
      // 円柱と球（曲面での出方。平板だけだと法線とハイライトの癖が判らない）
      b.cylinder({ x: x - 0.32, y: 0.38, z: z - 0.42, radius: 0.15, height: 0.44, segments: 14, mat: name, surface: SURFACE.CONCRETE, collide: false });
      const sph = new THREE.SphereGeometry(0.19, 18, 12);
      b.mesh(name, sph, { x: x + 0.3, y: 0.57, z: z - 0.42 });
      plate(b, { x, y: 0.22, z: z + 0.66, text: name, accent: HUE.mat, w: PITCH - 0.22 });
    }
    z -= 3.1;
  }
}

/* ================================================================= *
 *  区画 6: 屋内棟（照明と閉所）
 * ================================================================= */

function indoorBlock(b, cx, cz) {
  const W = 24, D = 12, H = 3.4;
  const hw = W / 2, hd = D / 2;

  // 床・天井
  b.box({ x: cx, y: 0.02, z: cz, w: W, h: 0.04, d: D, mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false });
  b.box({ x: cx, y: H + 0.15, z: cz, w: W + 0.6, h: 0.3, d: D + 0.6, mat: 'concrete', surface: SURFACE.CONCRETE });
  b.box({ x: cx, y: H - 0.03, z: cz, w: W - 0.3, h: 0.06, d: D - 0.3, mat: 'ceilingPanel', surface: SURFACE.CONCRETE, collide: false });

  // 壁（南面に 2 か所の出入口）
  b.wall({ x1: cx - hw, z1: cz - hd, x2: cx + hw, z2: cz - hd, h: H, thickness: 0.26, mat: 'paintedWall', surface: SURFACE.CONCRETE });
  b.wallWithGap({ x1: cx - hw, z1: cz + hd, x2: cx + hw, z2: cz + hd, h: H, thickness: 0.26,
    gapStart: 5.0, gapWidth: 1.6, gapTop: 2.2, mat: 'paintedWall', surface: SURFACE.CONCRETE });
  b.wallWithGap({ x1: cx - hw, z1: cz + hd, x2: cx + hw, z2: cz + hd, h: H, thickness: 0.26,
    gapStart: 17.0, gapWidth: 1.6, gapTop: 2.2, mat: 'paintedWall', surface: SURFACE.CONCRETE });
  b.wall({ x1: cx - hw, z1: cz - hd, x2: cx - hw, z2: cz + hd, h: H, thickness: 0.26, mat: 'paintedWall', surface: SURFACE.CONCRETE });
  b.wall({ x1: cx + hw, z1: cz - hd, x2: cx + hw, z2: cz + hd, h: H, thickness: 0.26, mat: 'paintedWall', surface: SURFACE.CONCRETE });

  /*
   * 内部を 4 室に仕切る。
   * 光源の色と強さを部屋ごとに変え、
   * 同じ材質が照明でどこまで表情を変えるかを見る。
   */
  const rooms = [
    ['蛍光灯 4000K', 0xdfe8f2, 9, 'ceramicTile'],
    ['白熱 2700K', 0xffcf96, 8, 'wallpaperWarm'],
    ['作業灯 5000K', 0xf2f6ff, 12, 'concreteRaw'],
    ['暗所（光源なし）', null, 0, 'paintedWallBlue'],
  ];
  const rw = W / rooms.length;
  for (let i = 0; i < rooms.length; i++) {
    const [name, col, inten, floorMat] = rooms[i];
    const rx = cx - hw + rw * (i + 0.5);
    if (i > 0) {
      b.wallWithGap({
        x1: cx - hw + rw * i, z1: cz - hd, x2: cx - hw + rw * i, z2: cz + hd,
        h: H, thickness: 0.18, gapStart: 4.2, gapWidth: 1.5, gapTop: 2.2,
        mat: 'paintedWall', surface: SURFACE.CONCRETE,
      });
    }
    b.box({ x: rx, y: 0.03, z: cz, w: rw - 0.4, h: 0.03, d: D - 0.6, mat: floorMat, surface: SURFACE.CONCRETE, collide: false });
    if (col) {
      // 天井の器具
      const g = new THREE.BoxGeometry(1.3, 0.05, 0.28);
      const m = new THREE.Mesh(g, b.mats.emissive(col, 5));
      m.position.set(rx, H - 0.14, cz);
      b.addExtra(m);
      b.light({ x: rx, y: H - 0.4, z: cz, color: col, intensity: inten, distance: 12 });
    }
    label(b, { x: rx, y: 2.5, z: cz - hd + 0.2, text: name, accent: HUE.light, w: rw - 0.8 });
    // 見比べ用に、同じ小物を各室へ 1 つずつ
    P.woodCrate(b, { x: rx - 1.2, y: 0, z: cz + 2.2, yaw: 0.2 });
    P.barrel(b, { x: rx + 1.2, y: 0, z: cz + 2.2 });
  }

  label(b, { x: cx, y: 3.9, z: cz + hd + 0.4, text: '屋内棟 — 照明の検証', sub: 'INDOOR / LIGHTING', accent: HUE.light, w: 5.0 });
}

/* ================================================================= *
 *  スポーン
 * ================================================================= */

function spawnPad(b, x, z, team) {
  b.box({ x, y: 0.015, z, w: 7, h: 0.03, d: 7,
    mat: team === 'A' ? 'paintedMetal' : 'paintedMetalTan', surface: SURFACE.CONCRETE, collide: false });
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    b.cylinder({ x: x + dx, y: 0, z: z + dz, radius: 0.07, height: 1.4, segments: 6,
      mat: 'hazardStripe', surface: SURFACE.METAL, collide: false });
  }
  const yaw = Math.atan2(-x, -z);
  for (let i = 0; i < 4; i++) {
    b.spawn(team, x + (i % 2 ? 1.6 : -1.6), 0, z + (i < 2 ? 1.6 : -1.6), yaw);
  }
  label(b, { x, y: 1.8, z, text: team === 'A' ? 'A 出撃' : 'B 出撃', accent: team === 'A' ? '#4a90d9' : '#d9482f', w: 2.2 });
}

/* ---- 乱数（マップごとに固定して再現性を保つ） ---- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
