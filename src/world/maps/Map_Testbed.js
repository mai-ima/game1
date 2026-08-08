import * as THREE from 'three';
import { SURFACE } from '../Physics.js';
import * as P from '../Props.js';
import * as B from '../Buildings.js';
import { MATERIAL_JA } from '../../render/MaterialNamesJa.js';

/**
 * マップ 0: TESTBED（テストベッド）
 *
 * 遊ぶためではなく、確かめるための場所。
 * 対戦にも使えるが、本来の役目は次の 2 つ。
 *
 *   1. アセットの出来を目で見る
 *      小物・家具・建物・マテリアルを、同じ光の下に同じ間隔で並べる。
 *      マップの中に散らばっていると隣と比べられないので、
 *      「これだけ質感が浮いている」に気付けない。
 *
 *   2. 動作の数値を測る
 *      何 cm の段差まで乗れるか、何度の斜面を登れるか、
 *      どの厚さの壁を弾が抜けるか、何 m の落下で死ぬか。
 *      目盛の付いた構造物を置いて、歩きながら読み取れるようにする。
 *
 * 作りの原則は「歩いて回れること」。
 * 東西に 1 本の通路を通し、区画はすべてその通路に面させる。
 * 展示物も銘板も例外なく通路側を向くので、
 * 端から端まで歩けば全部が視界に入る。
 */

export const MAP_INFO = {
  id: 'testbed',
  name: 'TESTBED',
  nameJa: 'テストベッド',
  desc: '検証用の平坦地。通路の両側に小物・家具・建物・マテリアルの見本を並べ、段差や貫通の計測台と射撃場を備える。対戦もできる。',
  size: '検証用',
  players: '2〜8人',

  /*
   * 光は「色を読み違えないこと」を最優先にする。
   *
   * 対戦マップは夕方寄りの暖色が似合うが、ここで同じ光を当てると
   * 灰色のコンクリートが黄土色に、白い漆喰がクリーム色に見えてしまい、
   * 材質の色が合っているのか光のせいなのか判らなくなる。
   * 太陽を高く上げてほぼ白にし、影の中も半球光で持ち上げて
   * 陰になった面の質感まで読めるようにする。
   */
  sun: { elevation: 66, azimuth: 152 },
  light: {
    sun: 0xfff6ea, sunIntensity: 3.1,
    hemiSky: 0xd2dae2, hemiGround: 0xaba69e, hemiIntensity: 0.78,
    fillColor: 0xc6ced6, fillIntensity: 0.46,
    env: 0.34,
  },
  fog: { color: 0xd3d0c9, near: 130, far: 400, density: 0.0006 },
  bounds: { min: { x: -66, z: -42 }, max: { x: 66, z: 42 } },
  /** 一覧で「これは検証用」と分かるようにする印 */
  utility: true,
};

const HALF_Z = 40;
const WEST = -64;
const EAST = 64;

/** 主通路の中心と幅 */
const AISLE_Z = 0;
const AISLE_HW = 2.6;
/** 通路の北側に置く物の向き（南＝通路を向く） */
const FACE_S = 0;
/** 通路の南側に置く物の向き（北＝通路を向く） */
const FACE_N = Math.PI;

/* 区画の色帯（銘板の左端に入る） */
const HUE = {
  base: '#8b9299',
  move: '#4a90d9',
  fire: '#d9482f',
  asset: '#c8783c',
  furn: '#a8783c',
  bldg: '#7b8fa8',
  mat: '#6f9e6a',
  light: '#c9a227',
};

/* 区画の並び。順路の番号と、通路のどちら側かをここで一元管理する */
const SECTIONS = [
  { no: '01', name: '基準寸法', en: 'SCALE', hue: HUE.base, x: -62.5, side: -1 },
  { no: '02', name: '移動の検証', en: 'MOVEMENT', hue: HUE.move, x: -43, side: -1 },
  { no: '03', name: '小物と建材', en: 'PROPS', hue: HUE.asset, x: -61, side: 1 },
  { no: '04', name: '家具・什器', en: 'FURNITURE', hue: HUE.furn, x: -21, side: -1 },
  { no: '05', name: '遮蔽と大物', en: 'COVER', hue: HUE.asset, x: -26, side: 1 },
  { no: '06', name: '建物の見本', en: 'BUILDINGS', hue: HUE.bldg, x: 7.5, side: -1 },
  { no: '07', name: 'マテリアル見本', en: 'MATERIALS', hue: HUE.mat, x: 10.5, side: 1 },
  { no: '08', name: '射撃場', en: 'RANGE', hue: HUE.fire, x: 46, side: 1 },
];

export function buildTestbed(b) {
  const rand = mulberry32(20250808);

  ground(b);
  aisle(b);

  sectionBase(b, -54);
  sectionMovement(b, -30);
  sectionProps(b, -40);
  sectionFurniture(b, -6);
  sectionCover(b, -8);
  sectionBuildings(b, 32);
  sectionMaterials(b, 22);
  sectionBallistics(b);

  /* ---- スポーンと目標（対戦にも使えるように） ---- */
  spawnPad(b, -60, -34, 'B');
  spawnPad(b, 60, 34, 'A');
  b.objective('A', -30, 0, AISLE_Z, 4.0);
  b.objective('B', 0, 0, AISLE_Z, 4.0);
  b.objective('C', 34, 0, AISLE_Z, 4.0);
}

/* ================================================================= *
 *  地面・通路
 * ================================================================= */

function ground(b) {
  const w = EAST - WEST, cx = (EAST + WEST) / 2;
  /*
   * 下地はコンクリート。
   * 土や草にすると模様が主張して、展示物の質感を見るときに邪魔になる。
   */
  b.floor({ x: cx, y: 0, z: 0, w, d: HALF_Z * 2, mat: 'concreteFloor', surface: SURFACE.CONCRETE });

  /*
   * 5m ごとの目盛。
   * 「あの箱まで何 m か」を目分量で言えるようにしておくと、
   * 射程やダメージ減衰の確認が一気に楽になる。
   * 通路を横切ると煩いので、通路の外側だけに引く。
   */
  for (let x = WEST + 4; x <= EAST - 4; x += 5) {
    const major = Math.abs(x % 25) < 0.01;
    for (const s of [-1, 1]) {
      const z0 = AISLE_Z + s * (AISLE_HW + 0.6), z1 = s > 0 ? HALF_Z - 3 : -HALF_Z + 3;
      b.box({
        x, y: 0.011, z: (z0 + z1) / 2, w: major ? 0.09 : 0.04, h: 0.02, d: Math.abs(z1 - z0),
        mat: major ? 'lineWhite' : 'lineYellow', surface: SURFACE.CONCRETE, collide: false,
      });
    }
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
 * 主通路。
 * 舗装を変えて縁石を立て、「ここを歩く」と一目で分かるようにする。
 * 区画の入口には順路の門標を立てる。
 */
function aisle(b) {
  const w = EAST - WEST - 6, cx = (EAST + WEST) / 2;
  b.box({ x: cx, y: 0.018, z: AISLE_Z, w, h: 0.03, d: AISLE_HW * 2,
    mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  // 中心線
  for (let x = WEST + 4; x < EAST - 6; x += 6) {
    b.box({ x: x + 1.5, y: 0.026, z: AISLE_Z, w: 3, h: 0.03, d: 0.12,
      mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }
  // 縁石と、その外の歩道帯
  for (const s of [-1, 1]) {
    b.box({ x: cx, y: 0.09, z: AISLE_Z + s * (AISLE_HW + 0.09), w, h: 0.18, d: 0.18,
      mat: 'concrete', surface: SURFACE.CONCRETE });
    b.box({ x: cx, y: 0.10, z: AISLE_Z + s * (AISLE_HW + 1.3), w, h: 0.03, d: 2.2,
      mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
  }

  // 区画の門標（通路から見て、その区画がどちら側にあるかを示す）
  for (const s of SECTIONS) {
    const z = AISLE_Z + s.side * (AISLE_HW + 1.1);
    gateSign(b, s.x, z, s.side > 0 ? FACE_N : FACE_S, s);
  }

  /*
   * 通路沿いの街灯。
   * 柱が等間隔に並ぶだけで、そこが「通路」だと目が理解する。
   * 昼なので消灯させる（点灯した街灯は「街の設備」の区画にある）。
   */
  for (let x = WEST + 14; x <= EAST - 14; x += 20) {
    P.streetLight(b, { x, y: 0, z: AISLE_Z - AISLE_HW - 2.1, yaw: FACE_S, withLight: false });
  }
}

/** 順路の門標（番号 + 区画名） */
function gateSign(b, x, z, yaw, sec) {
  label(b, {
    x, y: 2.05, z, yaw,
    text: `${sec.no}　${sec.name}`, sub: sec.en, accent: sec.hue, w: 3.4,
  });
  // 足元に方向を示す矢羽根
  const s = Math.cos(yaw) > 0 ? 1 : -1;
  b.box({ x, y: 0.028, z: z + s * 1.5, w: 3.0, h: 0.02, d: 0.5,
    mat: 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
}

/* ================================================================= *
 *  銘板の 3 種
 * ================================================================= */

/** 自立の看板（区画名） */
function label(b, o) {
  const { x, y = 1.5, z, yaw = 0, text, sub = '', accent = '#c8783c', w = 2.6 } = o;
  const h = w * 0.25;
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, b.mats.label(text, { sub, accent }));
  mesh.position.set(x + Math.sin(yaw) * 0.03, y, z + Math.cos(yaw) * 0.03);
  mesh.rotation.y = yaw;
  b.addExtra(mesh);
  // 背板と支柱（裏から見ても板があると分かる）
  b.box({ x, y, z, w: w + 0.08, h: h + 0.08, d: 0.05, yaw,
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
 * 自立の名札を展示物の手前に立てると、肝心の展示物が隠れてしまう。
 * 博物館の展示と同じで、台の前面に貼るのが読みやすく邪魔にならない。
 */
function plate(b, o) {
  const { x, y = 0.26, z, yaw = 0, text, sub = '', accent = '#c8783c', w = 1.3 } = o;
  const geo = new THREE.PlaneGeometry(w, w * 0.25);
  const mesh = new THREE.Mesh(geo, b.mats.label(text, { sub, accent }));
  mesh.position.set(x + Math.sin(yaw) * 0.014, y, z + Math.cos(yaw) * 0.014);
  mesh.rotation.y = yaw;
  b.addExtra(mesh);
  return b;
}

/**
 * 床に寝かせて置く銘板。
 * 段差の並びのように、見下ろしながら歩く場所で読ませる。
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

/** 区画の敷地。通路の外側 4.2m から奥へ */
function pad(b, cx, side, w, depth, mat = 'concreteRaw') {
  const z0 = AISLE_Z + side * 4.2;
  const zc = z0 + side * depth / 2;
  b.box({ x: cx, y: 0.014, z: zc, w, h: 0.03, d: depth, mat, surface: SURFACE.CONCRETE, collide: false });
  return z0;
}

/* ================================================================= *
 *  01 基準寸法（通路の北側）
 * ================================================================= */

function sectionBase(b, cx) {
  const side = -1;
  const z0 = pad(b, cx, side, 20, 16, 'asphalt');
  const F = FACE_S;

  /*
   * 人の背丈と目の高さ。
   * モデルや建具の寸法が合っているかは、隣に基準が無いと判らない。
   * 通路から見て手前に並べる。
   */
  const zRow = z0 - 2.4;
  measurePole(b, { x: cx - 8.4, z: zRow, height: 5 });
  const stands = [
    [1.70, '立位の背丈', 'paintedMetalTan'],
    [1.30, '中腰の目線', 'paintedMetal'],
    [0.80, '伏せの目線', 'paintedMetal'],
  ];
  for (let i = 0; i < stands.length; i++) {
    const [hgt, name, mat] = stands[i];
    const x = cx - 7.0 + i * 1.6;
    b.box({ x, y: hgt / 2, z: zRow, w: 0.5, h: hgt, d: 0.22, yaw: F, mat, surface: SURFACE.METAL });
    plate(b, { x, y: hgt - 0.22, z: zRow + 0.12, yaw: F, text: `${hgt.toFixed(2)} m`, sub: name, accent: HUE.base, w: 1.3 });
  }

  // 1m 立方
  b.box({ x: cx - 1.6, y: 0.5, z: zRow, w: 1, h: 1, d: 1, yaw: F, mat: 'hazardStripe', surface: SURFACE.METAL });
  floorPlate(b, { x: cx - 1.6, z: zRow + 1.1, text: '1 m³', accent: HUE.base, w: 1.4 });

  /* ---- 標準的な建具（通路を向いた壁に嵌める） ---- */
  const zWall = z0 - 7.0;
  b.wallWithGap({ x1: cx - 0.5, z1: zWall, x2: cx + 5.5, z2: zWall, h: 3.0, thickness: 0.24,
    gapStart: 2.5, gapWidth: 0.9, gapTop: 2.0, mat: 'plaster', surface: SURFACE.CONCRETE });
  B.door(b, { x: cx + 2.45, y: 0, z: zWall, yaw: F, w: 0.9, h: 2.0, frame: 'plaster' });
  plate(b, { x: cx + 2.45, y: 2.55, z: zWall + 0.14, yaw: F, text: '出入口', sub: 'H2.00 × W0.90', accent: HUE.base, w: 2.0 });

  b.wallWithGap({ x1: cx + 6.0, z1: zWall, x2: cx + 11.0, z2: zWall, h: 3.0, thickness: 0.24,
    gapStart: 1.7, gapWidth: 1.5, gapBottom: 0.9, gapTop: 2.1, mat: 'plaster', surface: SURFACE.CONCRETE });
  B.windowUnit(b, { x: cx + 8.45, y: 1.5, z: zWall, yaw: F, w: 1.5, h: 1.2 });
  plate(b, { x: cx + 8.45, y: 2.55, z: zWall + 0.14, yaw: F, text: '窓', sub: '腰 0.90 / H1.20 × W1.50', accent: HUE.base, w: 2.4 });

  // 標準階段（通路と平行に上る。踏面が見える向き）
  b.stairs({ x: cx - 6.5, y: 0, z: z0 - 12.6, width: 1.4, rise: 0.18, run: 0.28, steps: 12, yaw: Math.PI / 2, mat: 'concrete' });
  b.box({ x: cx - 9.9, y: 1.08, z: z0 - 12.6, w: 1.6, h: 2.16, d: 1.4, mat: 'concrete', surface: SURFACE.CONCRETE });
  P.railing(b, { x1: cx - 6.4, z1: z0 - 13.3, x2: cx - 9.6, z2: z0 - 13.3, y: 1.1, height: 1.1 });
  floorPlate(b, { x: cx - 6.5, z: z0 - 11.2, text: '階段 蹴上 0.18 / 踏面 0.28', accent: HUE.base, w: 3.4 });
}

/* ================================================================= *
 *  02 移動の検証（通路の北側）
 * ================================================================= */

function sectionMovement(b, cx) {
  const side = -1;
  const z0 = pad(b, cx, side, 26, 28);

  /* ---- 段差: どこまで乗れるか（通路と平行に並べる） ---- */
  const steps = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.75];
  for (let i = 0; i < steps.length; i++) {
    const hgt = steps[i];
    const x = cx - 11 + i * 2.5;
    b.box({ x, y: hgt / 2, z: z0 - 2.6, w: 1.6, h: hgt, d: 2.4, mat: 'concrete', surface: SURFACE.CONCRETE });
    b.box({ x, y: hgt + 0.011, z: z0 - 2.6, w: 1.6, h: 0.02, d: 2.4,
      mat: hgt <= 0.45 ? 'lineWhite' : 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
    floorPlate(b, { x, z: z0 - 0.9, text: `${(hgt * 100).toFixed(0)} cm`, accent: HUE.move, w: 1.7 });
  }

  /* ---- 斜面: 何度まで登れるか（通路から奥へ上る） ---- */
  const slopes = [10, 20, 30, 40, 50];
  for (let i = 0; i < slopes.length; i++) {
    const deg = slopes[i];
    const x = cx - 9.5 + i * 4.6;
    const len = 5.0;
    const hgt = len * Math.tan(deg * Math.PI / 180);
    // 通路側から奥へ向かって上る
    b.ramp({ x, y: 0, z: z0 - 6.4, width: 2.8, length: len, height: hgt, yaw: FACE_S, steps: 20, mat: 'asphalt' });
    b.box({ x, y: hgt / 2, z: z0 - 6.4 - len - 0.9, w: 2.8, h: hgt, d: 1.8, mat: 'concrete', surface: SURFACE.CONCRETE });
    floorPlate(b, { x, z: z0 - 5.2, text: `${deg}°`, accent: HUE.move, w: 1.6 });
  }

  /* ---- 隙間: 跳べる距離（通路と平行に並べる） ---- */
  for (let i = 0; i < 6; i++) {
    const gap = 1.0 + i * 0.5;
    const x = cx - 10 + i * 4.0;
    for (const s of [-1, 1]) {
      b.box({ x, y: 0.6, z: z0 - 16 + s * (gap / 2 + 0.95), w: 2.6, h: 1.2, d: 1.9,
        mat: 'concrete', surface: SURFACE.CONCRETE });
    }
    floorPlate(b, { x, z: z0 - 13.4, text: `${gap.toFixed(1)} m`, accent: HUE.move, w: 1.7 });
  }

  /* ---- よじ登り（通路を向いた壁の列） ---- */
  const mantle = [1.0, 1.4, 1.8, 2.2, 2.6];
  for (let i = 0; i < mantle.length; i++) {
    const hgt = mantle[i];
    const x = cx - 10 + i * 2.6;
    b.box({ x, y: hgt / 2, z: z0 - 20.5, w: 2.2, h: hgt, d: 1.0, mat: 'brickPale', surface: SURFACE.CONCRETE });
    plate(b, { x, y: Math.min(hgt - 0.22, 1.1), z: z0 - 20.0, yaw: FACE_S,
      text: `${hgt.toFixed(1)} m`, accent: HUE.move, w: 1.8 });
  }

  /* ---- 落下: 高さとダメージ（階段で上れる塔） ---- */
  const drops = [2, 4, 6, 9, 13];
  for (let i = 0; i < drops.length; i++) {
    const hgt = drops[i];
    const x = cx + 3.5 + i * 2.8;
    b.box({ x, y: hgt / 2, z: z0 - 24, w: 2.5, h: hgt, d: 2.5, mat: 'concrete', surface: SURFACE.CONCRETE });
    plate(b, { x, y: 1.15, z: z0 - 22.74, yaw: FACE_S, text: `${hgt} m`, accent: HUE.move, w: 2.1 });
    if (i > 0) {
      b.box({ x: x - 1.4, y: (drops[i - 1] + hgt) / 2 - 0.15, z: z0 - 24, w: 0.8, h: 0.3, d: 2.5,
        mat: 'diamondPlate', surface: SURFACE.METAL });
    }
  }
  b.stairs({ x: cx + 3.5, y: 0, z: z0 - 21.6, width: 1.7, rise: 0.2, run: 0.3, steps: 10, yaw: FACE_S, mat: 'concrete' });
}

/* ================================================================= *
 *  03 小物と建材（通路の南側）
 * ================================================================= */

/**
 * 展示台に載せて 1 列に並べる。
 * すべて通路側を向き、銘板は台の前面（通路側）に貼る。
 */
function displayRow(b, items, x0, z, pitch, accent, faceN) {
  const yaw = faceN ? FACE_N : FACE_S;
  const front = faceN ? 1 : -1;      // 通路のある向き
  const H = 0.52, D = 1.7;
  for (let i = 0; i < items.length; i++) {
    const [name, place] = items[i];
    const x = x0 + i * pitch;
    b.box({ x, y: H / 2, z, w: pitch - 0.5, h: H, d: D, yaw, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
    b.box({ x, y: H + 0.02, z, w: pitch - 0.43, h: 0.04, d: D + 0.07, yaw, mat: 'concrete', surface: SURFACE.CONCRETE, collide: false });
    place(x, z, H + 0.04);
    plate(b, { x, y: 0.3, z: z + front * (D / 2 + 0.02), yaw, text: name, accent, w: pitch - 0.85 });
  }
}

function sectionProps(b, cx) {
  const side = 1;
  const z0 = pad(b, cx, side, 44, 14);

  /* ---- 列 1: 収納・資材（通路寄り） ---- */
  displayRow(b, [
    ['木箱', (x, z, y) => P.woodCrate(b, { x, y, z, yaw: FACE_N + 0.3 })],
    ['弾薬箱', (x, z, y) => P.ammoCrate(b, { x, y, z, yaw: FACE_N - 0.2 })],
    ['ドラム缶', (x, z, y) => P.barrel(b, { x, y, z })],
    ['土嚢', (x, z, y) => P.sandbagStack(b, { x, y, z, yaw: FACE_N, rows: 3, perRow: 4, length: 1.5 })],
    ['パレット', (x, z, y) => P.pallet(b, { x, y, z, yaw: FACE_N + 0.15 })],
    ['タイヤ', (x, z, y) => P.tireStack(b, { x, y, z, count: 3 })],
    ['段ボール', (x, z, y) => P.cardboardStack(b, { x, y, z, count: 3 })],
    ['携行缶', (x, z, y) => P.jerryCan(b, { x, y, z, yaw: FACE_N + 0.4 })],
  ], cx - 19, z0 + 1.6, 2.6, HUE.asset, true);

  /* ---- 列 2: 工事現場 ---- */
  displayRow(b, [
    ['鉄筋束', (x, z, y) => P.rebarBundle(b, { x, y, z, yaw: FACE_N + 0.2, count: 10, length: 2.4 })],
    ['型枠合板', (x, z, y) => P.formworkStack(b, { x, y, z, yaw: FACE_N + 0.1, count: 7 })],
    ['ブロック', (x, z, y) => P.blockPallet(b, { x, y, z, yaw: FACE_N, rows: 3 })],
    ['骨材の山', (x, z, y) => P.aggregatePile(b, { x, y, z, radius: 1.1, height: 0.8, mat: 'gravel' })],
    ['砂の山', (x, z, y) => P.aggregatePile(b, { x, y, z, radius: 1.1, height: 0.7, mat: 'sand' })],
    ['瓦礫', (x, z, y) => P.rubble(b, { x, y, z, radius: 1.2, count: 12 })],
    ['足場板', (x, z, y) => {
      for (let k = 0; k < 3; k++) {
        b.box({ x, y: y + 0.03 + k * 0.06, z, w: 1.4, h: 0.05, d: 0.5, yaw: FACE_N + k * 0.04,
          mat: 'scaffoldPlank', surface: SURFACE.WOOD, collide: false });
      }
    }],
    ['単管', (x, z, y) => {
      for (let k = 0; k < 5; k++) {
        b.cylinder({ x: x - 0.3 + k * 0.15, y: y + 0.06, z, radius: 0.06, height: 1.6,
          segments: 8, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
      }
    }],
  ], cx - 19, z0 + 5.6, 2.6, HUE.asset, true);

  /* ---- 列 3: 街の設備（実寸で床置き。台に載せると背が合わない） ---- */
  const util = [
    ['街灯', (x, z) => P.streetLight(b, { x, y: 0, z, yaw: FACE_N })],
    ['電柱', (x, z) => P.utilityPole(b, { x, y: 0, z })],
    ['貯水タンク', (x, z) => P.waterTank(b, { x, y: 0.55, z })],
    ['室外機', (x, z) => P.acUnit(b, { x, y: 0, z, yaw: FACE_N })],
    ['看板', (x, z) => P.sign(b, { x, y: 2.2, z, yaw: FACE_N, w: 2.0, h: 0.7, mat: 'plasticGlossRed' })],
    ['屋上機器', (x, z) => P.rooftopClutter(b, { x, y: 0, z, yaw: FACE_N })],
    ['自販機', (x, z) => B.vendingMachine(b, { x, y: 0, z, yaw: FACE_N, name: 'つめたい' })],
    ['ごみ箱', (x, z) => P.trashBin(b, { x, y: 0, z })],
  ];
  for (let i = 0; i < util.length; i++) {
    const x = cx - 19 + i * 2.6;
    const z = z0 + 10.2;
    b.box({ x, y: 0.016, z, w: 2.35, h: 0.03, d: 2.2, mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
    util[i][1](x, z);
    floorPlate(b, { x, z: z - 1.35, text: util[i][0], accent: HUE.asset, w: 2.0 });
  }
}

/* ================================================================= *
 *  04 家具・什器（通路の北側）
 * ================================================================= */

function sectionFurniture(b, cx) {
  const side = -1;
  const z0 = pad(b, cx, side, 21, 26, 'concreteFloor');

  /*
   * 家具は床からの高さがそのまま使い勝手になるので、台に載せない。
   * 床に区画枠を敷いて、通路側を向けて置く。
   */
  const furn = [
    ['事務机', (x, z) => P.desk(b, { x, y: 0, z, yaw: FACE_S })],
    ['事務椅子', (x, z) => P.officeChair(b, { x, y: 0, z, yaw: FACE_S + 0.3 })],
    ['スチール棚', (x, z) => P.shelfUnit(b, { x, y: 0, z, yaw: FACE_S, w: 1.6, h: 1.9, tiers: 4 })],
    ['ロッカー', (x, z) => P.lockerBank(b, { x, y: 0, z, yaw: FACE_S, doors: 3 })],
    ['ソファ', (x, z) => P.sofa(b, { x, y: 0, z, yaw: FACE_S, seats: 2 })],
    ['食卓', (x, z) => P.diningTable(b, { x, y: 0, z, yaw: FACE_S, w: 1.3, d: 0.8 })],
    ['椅子', (x, z) => P.woodChair(b, { x, y: 0, z, yaw: FACE_S })],
    ['寝台', (x, z) => P.bed(b, { x, y: 0, z, yaw: Math.PI / 2, w: 0.95, d: 1.9 })],
    ['収納棚', (x, z) => P.wardrobe(b, { x, y: 0, z, yaw: FACE_S })],
    ['冷蔵庫', (x, z) => P.fridge(b, { x, y: 0, z, yaw: FACE_S })],
    ['流し台', (x, z) => P.kitchenUnit(b, { x, y: 0, z, yaw: FACE_S, w: 1.6 })],
    ['テレビ', (x, z) => P.tvSet(b, { x, y: 0, z, yaw: FACE_S })],
    ['本棚', (x, z) => P.bookshelf(b, { x, y: 0, z, yaw: FACE_S })],
    ['ベンチ', (x, z) => P.bench(b, { x, y: 0, z, yaw: FACE_S, w: 1.6 })],
    ['カウンター', (x, z) => P.counter(b, { x, y: 0, z, yaw: FACE_S, w: 1.8 })],
    ['観葉植物', (x, z) => P.potPlant(b, { x, y: 0, z })],
  ];
  const PITCH = 2.5;
  for (let i = 0; i < furn.length; i++) {
    const col = i % 8, row = Math.floor(i / 8);
    const x = cx - 9 + col * PITCH;
    const z = z0 - 1.6 - row * 3.4;
    b.box({ x, y: 0.016, z, w: PITCH - 0.22, h: 0.03, d: 2.5,
      mat: 'woodFloor', surface: SURFACE.CONCRETE, collide: false });
    furn[i][1](x, z);
    floorPlate(b, { x, z: z + 1.62, text: furn[i][0], accent: HUE.furn, w: PITCH - 0.15 });
  }

  /* ---- 屋内棟（家具を部屋に収めた状態で見る） ---- */
  indoorBlock(b, cx, z0 - 17);
}

/* ================================================================= *
 *  05 遮蔽と大物（通路の南側）
 * ================================================================= */

function sectionCover(b, cx) {
  const side = 1;
  const z0 = pad(b, cx, side, 32, 22);

  /* ---- 遮蔽（通路と平行に置いて、横から効きを見る） ---- */
  P.chainFence(b, { x1: cx - 15, z1: z0 + 2.2, x2: cx - 10, z2: z0 + 2.2, h: 2.1 });
  floorPlate(b, { x: cx - 12.5, z: z0 + 1.0, text: '金網（体は止まる/弾は抜ける）', accent: HUE.asset, w: 4.2 });
  P.chainFence(b, { x1: cx - 8, z1: z0 + 2.2, x2: cx - 3, z2: z0 + 2.2, h: 2.1, tarp: 'tarp' });
  floorPlate(b, { x: cx - 5.5, z: z0 + 1.0, text: '養生シート付き', accent: HUE.asset, w: 3.0 });
  P.railing(b, { x1: cx - 1, z1: z0 + 2.2, x2: cx + 4, z2: z0 + 2.2, y: 0, height: 1.1 });
  floorPlate(b, { x: cx + 1.5, z: z0 + 1.0, text: '手すり', accent: HUE.asset, w: 2.2 });
  P.siteBarrier(b, { x1: cx + 6, z1: z0 + 2.2, x2: cx + 13, z2: z0 + 2.2 });
  floorPlate(b, { x: cx + 9.5, z: z0 + 1.0, text: '単管バリケード', accent: HUE.asset, w: 3.0 });

  /* ---- 大物 ---- */
  P.container(b, { x: cx - 13, y: 0, z: z0 + 7.5, yaw: FACE_N });
  P.container(b, { x: cx - 13, y: 2.59, z: z0 + 7.5, yaw: FACE_N, mat: 'paintedMetalTan' });
  floorPlate(b, { x: cx - 13, z: z0 + 5.2, text: 'コンテナ 20ft', sub: '6.06 × 2.44 × 2.59', accent: HUE.asset, w: 3.4 });

  P.vehicle(b, { x: cx - 5, y: 0, z: z0 + 7.5, yaw: FACE_N + Math.PI / 2, type: 'truck' });
  floorPlate(b, { x: cx - 5, z: z0 + 5.2, text: 'トラック', accent: HUE.asset, w: 2.6 });
  P.vehicle(b, { x: cx + 1.5, y: 0, z: z0 + 7.5, yaw: FACE_N + Math.PI / 2, type: 'car', mat: 'rustedMetal' });
  floorPlate(b, { x: cx + 1.5, z: z0 + 5.2, text: '乗用車', accent: HUE.asset, w: 2.4 });

  P.marketStall(b, { x: cx + 8, y: 0, z: z0 + 7.0, yaw: FACE_N });
  floorPlate(b, { x: cx + 8, z: z0 + 5.2, text: '屋台', accent: HUE.asset, w: 2.2 });

  P.scaffold(b, { x: cx + 14, y: 0, z: z0 + 8.5, yaw: FACE_N, length: 8.0, levels: 3, levelH: 2.2, depth: 1.3 });
  floorPlate(b, { x: cx + 14, z: z0 + 5.2, text: '足場 3 層', accent: HUE.asset, w: 2.8 });

  towerCrane(b, cx - 15, z0 + 15);
  floorPlate(b, { x: cx - 15, z: z0 + 11.6, text: 'タワークレーン', accent: HUE.asset, w: 3.4 });
  P.siteOffice(b, { x: cx + 3, y: 0, z: z0 + 14, yaw: FACE_N });
  floorPlate(b, { x: cx + 3, z: z0 + 11.4, text: '現場事務所', accent: HUE.asset, w: 3.0 });
  P.clothesline(b, { x1: cx + 11, z1: z0 + 12, x2: cx + 16, z2: z0 + 12, y: 2.6, count: 5 });
  P.litter(b, { x: cx + 13.5, y: 0, z: z0 + 15, radius: 2.2, count: 14 });
  floorPlate(b, { x: cx + 13.5, z: z0 + 12.6, text: 'ごみ・落ち葉', accent: HUE.asset, w: 2.8 });
}

/** 展示用のタワークレーン（本編のものより小ぶり） */
function towerCrane(b, x, z) {
  b.box({ x, y: 0.3, z, w: 3.2, h: 0.6, d: 3.2, mat: 'concreteRaw', surface: SURFACE.CONCRETE });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box({ x: x + sx * 0.62, y: 5.0, z: z + sz * 0.62, w: 0.14, h: 9.0, d: 0.14,
      mat: 'hazardStripe', surface: SURFACE.METAL });
  }
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
  b.box({ x, y: 9.9, z: z + 0.9, w: 1.1, h: 1.0, d: 1.3, mat: 'paintedMetal', surface: SURFACE.METAL });
  b.box({ x: x + 4.6, y: 10.3, z, w: 10.0, h: 0.42, d: 0.42, mat: 'hazardStripe', surface: SURFACE.METAL });
  b.box({ x: x - 3.0, y: 10.3, z, w: 4.2, h: 0.36, d: 0.36, mat: 'hazardStripe', surface: SURFACE.METAL });
  b.box({ x: x - 4.6, y: 10.3, z, w: 1.2, h: 0.9, d: 1.0, mat: 'concreteRaw', surface: SURFACE.CONCRETE });
  b.box({ x, y: 11.4, z, w: 0.26, h: 1.8, d: 0.26, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  b.box({ x: x + 6.5, y: 8.0, z, w: 0.045, h: 4.4, d: 0.045, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: x + 6.5, y: 5.6, z, w: 0.3, h: 0.44, d: 0.3, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
}

/* ================================================================= *
 *  06 建物の見本（通路の北側）
 * ================================================================= */

function sectionBuildings(b, cx) {
  const side = -1;
  const z0 = pad(b, cx, side, 54, 24, 'asphalt');
  // 建物の前を通る歩道
  b.box({ x: cx, y: 0.02, z: z0 - 1.4, w: 54, h: 0.03, d: 2.6, mat: 'paving', surface: SURFACE.CONCRETE, collide: false });

  const zB = z0 - 9.5;      // 建物の中心線
  const zP = z0 - 2.9;      // 銘板の位置（歩道の奥側）

  const put = (x, name, sub, place) => {
    place(x);
    b.box({ x, y: 0.35, z: zP, w: 3.0, h: 0.7, d: 0.16, yaw: FACE_S, mat: 'concrete', surface: SURFACE.CONCRETE });
    plate(b, { x, y: 0.4, z: zP + 0.09, yaw: FACE_S, text: name, sub, accent: HUE.bldg, w: 2.7 });
  };

  put(cx - 21, '平屋', '7.0 × 6.0 / 切妻', (x) => {
    B.houseSmall(b, { x, y: 0, z: zB, yaw: FACE_S });
    P.potPlant(b, { x: x - 3.0, y: 0, z: zB + 4.2 });
    P.potPlant(b, { x: x + 3.0, y: 0, z: zB + 4.2, height: 0.8 });
  });

  put(cx - 10, '店舗', '9.0 × 7.0 / 2 階建て', (x) => {
    B.shopFront(b, {
      x, y: 0, z: zB, yaw: FACE_S, w: 9, d: 7, floors: 2,
      name: '丸屋商店', sub: 'MARUYA STORE', signBg: '#7a2b22', signFg: '#f4ece0',
    });
    B.vendingMachine(b, { x: x + 5.4, y: 0, z: zB + 3.9, yaw: FACE_S, color: '#b8352c', name: 'つめたい' });
    B.vendingMachine(b, { x: x + 6.6, y: 0, z: zB + 3.9, yaw: FACE_S, color: '#1f5fa8', name: 'あたたかい' });
  });

  put(cx + 2, '集合住宅', '3 戸 × 2 層 / 外廊下', (x) => {
    B.apartment(b, { x, y: 0, z: zB, yaw: FACE_S, units: 3, d: 7 });
  });

  put(cx + 12, '小屋', '3.2 × 2.6 / 売店・詰所', (x) => {
    B.kiosk(b, { x, y: 0, z: zB + 2.0, yaw: FACE_S, name: '案内所' });
    P.bench(b, { x: x + 3.6, y: 0, z: zB + 3.4, yaw: FACE_S });
  });

  put(cx + 21, '倉庫', '14 × 11 / 折板屋根', (x) => {
    B.warehouse(b, { x, y: 0, z: zB - 1.5, yaw: FACE_S, w: 14, d: 11, h: 5.4 });
    for (let i = 0; i < 3; i++) {
      P.shelfUnit(b, { x: x - 4.4 + i * 4.4, y: 0.31, z: zB - 4.5, yaw: FACE_S, w: 2.4, h: 2.2, tiers: 4 });
    }
    P.pallet(b, { x: x - 3, y: 0.31, z: zB + 1.5, yaw: FACE_S + 0.2 });
    P.woodCrate(b, { x: x - 3, y: 0.45, z: zB + 1.5, size: 0.9 });
    P.blockPallet(b, { x: x + 3, y: 0.31, z: zB + 1.2, yaw: FACE_S, rows: 3 });
  });
}

/* ================================================================= *
 *  07 マテリアル見本（通路の南側）
 * ================================================================= */

function sectionMaterials(b, cx) {
  const side = 1;
  const z0 = pad(b, cx, side, 22, 24, 'concreteFloor');

  /*
   * 同じ光・同じ大きさ・同じ間隔で並べる。
   * 平板だけだと曲面での見え方（法線とハイライトの出方）が判らないので、
   * 板・円柱・球の 3 つを組にする。
   * 銘板は日本語名を主、英語のキーを副に出す。
   */
  const groups = [
    ['建材', ['concrete', 'concreteRaw', 'plaster', 'paintedWall', 'brick', 'brickPale', 'concreteBlock', 'rock', 'tile', 'paving']],
    ['地面', ['asphalt', 'dirt', 'mud', 'sand', 'gravel', 'grass', 'grassDry', 'tactilePaving', 'ballast', 'oilStain']],
    ['金属', ['rustedMetal', 'paintedMetal', 'brushedMetal', 'galvanized', 'corrugated', 'diamondPlate', 'expandedMetal', 'castIron', 'sidingMetal', 'shutter']],
    ['木・布', ['wood', 'woodFloor', 'plywood', 'osb', 'formPly', 'scaffoldPlank', 'fabric', 'camo', 'sandbag', 'tarp']],
    ['屋内', ['marble', 'terrazzo', 'granite', 'carpet', 'wallpaper', 'ceramicTile', 'ceilingPanel', 'velvet', 'brassPolished', 'woodFloorDark']],
    ['武器', ['parkerized', 'anodizedBlack', 'cerakoteFDE', 'bluedSteel', 'nitride', 'stampedSteel', 'woodStock', 'polymer', 'kevlarWeave', 'cordura']],
  ];

  const PITCH = 1.6;
  for (let gi = 0; gi < groups.length; gi++) {
    const [gname, list] = groups[gi];
    const z = z0 + 2.0 + gi * 3.6;
    label(b, { x: cx - 9.6, y: 1.7, z, yaw: FACE_N, text: gname, accent: HUE.mat, w: 2.0 });
    for (let i = 0; i < list.length; i++) {
      const name = list[i];
      const x = cx - 8.0 + i * PITCH;
      // 台
      b.box({ x, y: 0.19, z, w: PITCH - 0.16, h: 0.38, d: 1.4, yaw: FACE_N, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
      // 板（通路側を向く）
      b.box({ x, y: 1.02, z, w: PITCH - 0.32, h: 1.25, d: 0.09, yaw: FACE_N, mat: name, surface: SURFACE.CONCRETE });
      // 曲面（法線とハイライトの癖は平板では判らない）
      b.cylinder({ x: x - 0.34, y: 0.38, z: z + 0.44, radius: 0.15, height: 0.46, segments: 14, mat: name, surface: SURFACE.CONCRETE, collide: false });
      const sph = new THREE.SphereGeometry(0.19, 18, 12);
      b.mesh(name, sph, { x: x + 0.32, y: 0.58, z: z + 0.44 });
      plate(b, { x, y: 0.22, z: z + 0.71, yaw: FACE_N,
        text: MATERIAL_JA[name] || name, sub: name, accent: HUE.mat, w: PITCH - 0.24 });
    }
  }
}

/* ================================================================= *
 *  08 射撃と貫通（通路の南、奥の一直線）
 * ================================================================= */

function sectionBallistics(b) {
  const zR = 30;             // 射線の z
  const x0 = -52;            // 射座

  b.box({ x: 4, y: 0.014, z: zR, w: 116, h: 0.03, d: 10, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });

  // 射座（通路から降りてくる導線）
  b.box({ x: x0, y: 0.55, z: zR + 3.2, w: 7.0, h: 1.1, d: 0.45, mat: 'concrete', surface: SURFACE.CONCRETE });
  label(b, { x: x0, y: 2.2, z: zR + 3.6, yaw: FACE_N, text: '射座', sub: 'FIRING LINE', accent: HUE.fire, w: 2.6 });
  b.box({ x: x0, y: 0.02, z: zR + 7.5, w: 4, h: 0.03, d: 9, mat: 'paving', surface: SURFACE.CONCRETE, collide: false });

  /*
   * 距離標と的。射座から東へ 5 / 10 / 25 / 50 / 75 / 100m。
   * 減衰と拡散の効き方を、距離ごとに見比べられる。
   */
  for (const m of [5, 10, 25, 50, 75, 100]) {
    const x = x0 + m;
    measurePole(b, { x, z: zR - 3.6, height: 3 });
    plate(b, { x, y: 2.5, z: zR - 3.5, yaw: FACE_N, text: `${m} m`, accent: HUE.fire, w: 1.8 });
    // 的（人の胸の高さ）
    b.box({ x, y: 1.15, z: zR - 1.4, w: 0.7, h: 1.5, d: 0.05, mat: 'plywood', surface: SURFACE.WOOD, penetration: 0.6 });
    b.box({ x, y: 1.35, z: zR - 1.37, w: 0.44, h: 0.44, d: 0.02, mat: 'lineWhite', surface: SURFACE.WOOD, collide: false });
    b.box({ x, y: 1.35, z: zR - 1.35, w: 0.17, h: 0.17, d: 0.02, mat: 'plasticGlossRed', surface: SURFACE.WOOD, collide: false });
    for (const s of [-1, 1]) {
      b.box({ x: x + s * 0.4, y: 0.7, z: zR - 1.4, w: 0.07, h: 1.4, d: 0.07, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    floorPlate(b, { x, z: zR + 1.4, text: `${m} m`, accent: HUE.fire, w: 1.8 });
  }

  /*
   * 貫通の壁。射座の正面ではなく、射線の手前側に並べる。
   * 撃って確かめるものなので、素材名と厚みを銘板に入れる。
   */
  const panels = [
    ['plywood', 0.02, '合板 20mm', SURFACE.WOOD, 0.75],
    ['wood', 0.06, '板 60mm', SURFACE.WOOD, 0.55],
    ['sidingMetal', 0.01, '鋼板 1mm', SURFACE.METAL, 0.5],
    ['corrugated', 0.02, '波板 2mm', SURFACE.METAL, 0.55],
    ['concreteBlock', 0.19, 'ブロック 190mm', SURFACE.CONCRETE, 0.12],
    ['brick', 0.21, '煉瓦 210mm', SURFACE.CONCRETE, 0.15],
    ['sandbag', 0.42, '土嚢 420mm', SURFACE.FABRIC, 0.1],
    ['concrete', 0.30, 'コンクリ 300mm', SURFACE.CONCRETE, 0],
  ];
  for (let i = 0; i < panels.length; i++) {
    const [mat, th, name, surf, pen] = panels[i];
    const x = x0 + 8 + i * 3.4;
    b.box({ x, y: 1.1, z: zR + 8.5, w: 2.0, h: 2.2, d: th, mat, surface: surf, penetration: pen });
    for (const s of [-1, 1]) {
      b.box({ x: x + s * 1.05, y: 1.1, z: zR + 8.5, w: 0.09, h: 2.3, d: 0.09, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    plate(b, { x, y: 2.5, z: zR + 8.4, yaw: FACE_N, text: name, sub: `貫通 ${(pen * 100).toFixed(0)}%`, accent: HUE.fire, w: 2.2 });
  }
  label(b, { x: x0 + 20, y: 3.6, z: zR + 10.6, yaw: FACE_N, text: '貫通の検証', sub: 'PENETRATION', accent: HUE.fire, w: 4.0 });

  // 着弾痕を見る広い板
  const walls = [['concrete', 'コンクリート'], ['sidingMetal', '鋼板'], ['wood', '木']];
  for (let i = 0; i < walls.length; i++) {
    const x = x0 + 42 + i * 7;
    b.box({ x, y: 1.6, z: zR + 8.5, w: 6.0, h: 3.2, d: 0.3, mat: walls[i][0], surface: SURFACE.CONCRETE });
    plate(b, { x, y: 3.5, z: zR + 8.34, yaw: FACE_N, text: walls[i][1], sub: '着弾痕', accent: HUE.fire, w: 2.6 });
  }
}

/* ================================================================= *
 *  屋内棟（照明と家具）
 * ================================================================= */

function indoorBlock(b, cx, cz) {
  const W = 26, D = 11, H = 3.4;
  const hw = W / 2, hd = D / 2;

  b.box({ x: cx, y: 0.02, z: cz, w: W, h: 0.04, d: D, mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false });
  b.box({ x: cx, y: H + 0.15, z: cz, w: W + 0.6, h: 0.3, d: D + 0.6, mat: 'concrete', surface: SURFACE.CONCRETE });
  b.box({ x: cx, y: H - 0.03, z: cz, w: W - 0.3, h: 0.06, d: D - 0.3, mat: 'ceilingPanel', surface: SURFACE.CONCRETE, collide: false });

  const rooms = [
    ['蛍光灯 4000K', 0xdfe8f2, 10, 'ceramicTile'],
    ['白熱 2700K', 0xffcf96, 9, 'wallpaperWarm'],
    ['作業灯 5000K', 0xf2f6ff, 13, 'concreteRaw'],
    ['暗所（光源なし）', null, 0, 'paintedWallBlue'],
  ];
  const rw = W / rooms.length;

  // 通路側（南）の壁に、各室の入口を 1 つずつ開ける
  for (let i = 0; i < rooms.length; i++) {
    const x0 = cx - hw + rw * i;
    b.wallWithGap({
      x1: x0, z1: cz + hd, x2: x0 + rw, z2: cz + hd, h: H, thickness: 0.24,
      gapStart: rw / 2 - 0.8, gapWidth: 1.6, gapTop: 2.2,
      mat: 'paintedWall', surface: SURFACE.CONCRETE,
    });
  }
  b.wall({ x1: cx - hw, z1: cz - hd, x2: cx + hw, z2: cz - hd, h: H, thickness: 0.24, mat: 'paintedWall', surface: SURFACE.CONCRETE });
  b.wall({ x1: cx - hw, z1: cz - hd, x2: cx - hw, z2: cz + hd, h: H, thickness: 0.24, mat: 'paintedWall', surface: SURFACE.CONCRETE });
  b.wall({ x1: cx + hw, z1: cz - hd, x2: cx + hw, z2: cz + hd, h: H, thickness: 0.24, mat: 'paintedWall', surface: SURFACE.CONCRETE });

  for (let i = 0; i < rooms.length; i++) {
    const [name, col, inten, floorMat] = rooms[i];
    const rx = cx - hw + rw * (i + 0.5);
    if (i > 0) {
      b.wallWithGap({
        x1: cx - hw + rw * i, z1: cz - hd, x2: cx - hw + rw * i, z2: cz + hd,
        h: H, thickness: 0.18, gapStart: 3.6, gapWidth: 1.5, gapTop: 2.2,
        mat: 'paintedWall', surface: SURFACE.CONCRETE,
      });
    }
    b.box({ x: rx, y: 0.03, z: cz, w: rw - 0.4, h: 0.03, d: D - 0.6, mat: floorMat, surface: SURFACE.CONCRETE, collide: false });
    if (col) {
      const g = new THREE.BoxGeometry(1.4, 0.05, 0.3);
      const m = new THREE.Mesh(g, b.mats.emissive(col, 5));
      m.position.set(rx, H - 0.14, cz);
      b.addExtra(m);
      b.light({ x: rx, y: H - 0.4, z: cz, color: col, intensity: inten, distance: 13 });
    }
    // 部屋名は入口の上（通路側）に
    plate(b, { x: rx, y: 2.62, z: cz + hd + 0.14, yaw: FACE_N, text: name, accent: HUE.light, w: rw - 1.4 });
    furnishRoom(b, i, rx, cz);
  }

  label(b, { x: cx, y: 3.95, z: cz + hd + 0.3, yaw: FACE_N,
    text: '屋内棟 — 照明と家具', sub: 'INDOOR / LIGHTING', accent: HUE.light, w: 5.4 });
}

/**
 * 各室に別々の用途の家具を入れる。
 *
 * 家具は単体で眺めても良し悪しが判らない。部屋に収めて、
 * 床からの高さ・隣との間合い・視線の抜け方まで込みで見て初めて、
 * 寸法が合っているかが分かる。
 */
function furnishRoom(b, i, rx, cz) {
  if (i === 0) {
    for (const s of [-1, 1]) {
      P.desk(b, { x: rx + s * 1.6, y: 0, z: cz - 1.6, yaw: FACE_S });
      P.officeChair(b, { x: rx + s * 1.6, y: 0, z: cz - 0.7, yaw: FACE_N });
    }
    P.shelfUnit(b, { x: rx - 1.2, y: 0, z: cz - 4.2, yaw: FACE_S, w: 2.2, h: 1.9, tiers: 4 });
    P.lockerBank(b, { x: rx + 1.9, y: 0, z: cz - 4.2, yaw: FACE_S, doors: 3 });
    P.trashBin(b, { x: rx - 2.6, y: 0, z: cz + 1.4 });
  } else if (i === 1) {
    P.sofa(b, { x: rx - 0.6, y: 0, z: cz - 2.8, yaw: FACE_S, seats: 3 });
    P.tvSet(b, { x: rx - 0.6, y: 0, z: cz + 0.8, yaw: FACE_N });
    P.diningTable(b, { x: rx + 2.2, y: 0, z: cz - 1.2, yaw: FACE_S, w: 1.3, d: 0.8 });
    for (const s of [-1, 1]) {
      P.woodChair(b, { x: rx + 2.2, y: 0, z: cz - 1.2 + s * 0.78, yaw: s > 0 ? FACE_N : FACE_S });
    }
    P.bookshelf(b, { x: rx - 2.6, y: 0, z: cz - 4.3, yaw: FACE_S });
    P.potPlant(b, { x: rx + 2.6, y: 0, z: cz - 4.2, height: 1.0 });
  } else if (i === 2) {
    P.kitchenUnit(b, { x: rx - 1.4, y: 0, z: cz - 4.2, yaw: FACE_S, w: 2.0 });
    P.fridge(b, { x: rx + 1.5, y: 0, z: cz - 4.2, yaw: FACE_S });
    P.bed(b, { x: rx + 1.4, y: 0, z: cz + 0.6, yaw: Math.PI / 2 });
    P.wardrobe(b, { x: rx - 2.1, y: 0, z: cz - 0.6, yaw: Math.PI / 2 });
  } else {
    P.shelfUnit(b, { x: rx, y: 0, z: cz - 4.2, yaw: FACE_S, w: 2.2, h: 2.0, tiers: 4 });
    P.desk(b, { x: rx - 1.5, y: 0, z: cz - 1.2, yaw: FACE_S });
    P.officeChair(b, { x: rx - 1.5, y: 0, z: cz - 0.3, yaw: FACE_N });
    P.sofa(b, { x: rx + 1.7, y: 0, z: cz + 1.0, yaw: FACE_N, seats: 2 });
  }
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
  // 通路の中心を向いて湧く
  const yaw = Math.atan2(-x, AISLE_Z - z);
  for (let i = 0; i < 4; i++) {
    b.spawn(team, x + (i % 2 ? 1.6 : -1.6), 0, z + (i < 2 ? 1.6 : -1.6), yaw);
  }
  label(b, { x, y: 1.9, z, yaw, text: team === 'A' ? 'A 出撃' : 'B 出撃',
    accent: team === 'A' ? '#4a90d9' : '#d9482f', w: 2.4 });
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
