import * as THREE from 'three';
import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import * as B from '../../Buildings.js';
import { label, plate, floorPlate, HUE, FACE_S, FACE_N, mulberry32 } from './common.js';
import { sectionMuseum } from './s_museum.js';
import { sectionLab } from './s_lab.js';
import { sectionRange } from './s_range.js';
import { sectionTown } from './s_town.js';
import { sectionYard, sectionMaterials } from './s_yard.js';
import { sectionGizmos } from './s_gizmos.js';
import { sectionSandbox } from './s_sandbox.js';
import { sectionEdge } from './s_edge.js';
import { sectionTerrain } from './s_terrain.js';
import { sectionBuildLab } from './s_build.js';

/**
 * マップ 0: TESTBED（テストベッド）
 *
 * 遊ぶための場所ではなく、作ったものを確かめるための施設。
 * 次の役目をひとつの敷地に同居させてある。
 *
 *   博物館   … 均一な室内照明で 1 点ずつ丁寧に見る
 *   資材置き場… まとめて置いて量と嵩を見る。新しい物の仮置き場も兼ねる
 *   建物街   … 建物を街並みとして並べ、道からの見え方を確かめる
 *   実験場   … 段差・斜面・隙間・落下の限界値を歩いて測る
 *   射撃場   … 距離ごとの減衰と、材質ごとの貫通を撃って確かめる
 *   ギミック試験場… 動く仕掛けを置いて、乗ったり潜ったりする
 *   試作場   … 何も置いていない平地。思い付いたものをまず組む場所
 *   地形試験場… 斜面・掘り込み・盛土・地面の材質を歩いて確かめる
 *   建築試作場… 建物を 1 棟ずつ台に載せ、四周と屋上から作りを詰める
 *
 * 作りの原則は 3 つ。
 *   1. 十字の通路から、すべての区画へ行けること
 *   2. 区画の入口に必ず門標があり、順路が読めること
 *   3. 展示物と銘板は、見る側（通路や順路）を向いていること
 */

export const MAP_INFO = {
  id: 'testbed',
  name: 'TESTBED',
  nameJa: 'テストベッド',
  desc: '検証用の施設。博物館・資材置き場・建物街・建築試作場・実験場・射撃場・ギミック試験場・試作場を十字の通路でつないである。対戦もできる。',
  size: '検証用（184 × 226m）',
  players: '2〜12人',

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
  /*
   * 検証の場なので空気は澄ませる。
   * 砂塵をほとんど混ぜず、見通しも 520m まで伸ばして、
   * 材質の色が霞で狂わないようにする。
   */
  fog: {
    color: 0xd3d0c9, near: 150, far: 460,
    dust: 0xdcd6c8, dustMix: 0.16, hazeGain: 1.04,
    distance: 520, scaleHeight: 130, max: 0.92,
  },
  bounds: { min: { x: -94, z: -144 }, max: { x: 94, z: 86 } },
  viewDistance: 460,
  /** 一覧で「これは検証用」と分かるようにする印 */
  utility: true,
};

/* 敷地 */
const WEST = -92, EAST = 92;
/*
 * 北へ 62m 広げてある。
 * 建築試作場は 1 棟ごとに 24m 角の台を要るので、
 * 既存の区画の隙間には入らない。
 */
const NORTH = -142, SOUTH = 84;

/* 十字の通路 */
const AISLE_HW = 3.0;        // 東西通路の半幅
const AVE_HW = 3.0;          // 南北通路の半幅
const AVE_N = -84;           // 南北通路の北端（この先は建築試作場）

/**
 * 区画の一覧。
 * 位置・大きさ・門標をここで一元管理する。
 * 新しい区画を足すときはこの表に 1 行足す。
 *
 *   gate … 門標を立てる位置と向き（通路のどこから入るか）
 */
const SECTIONS = [
  { no: '01', name: '中央広場', en: 'HUB', hue: HUE.hub, gate: null },
  { no: '02', name: '博物館', en: 'MUSEUM', hue: HUE.museum, gate: [0, -14, FACE_S] },
  { no: '03', name: '実験場', en: 'MOVEMENT LAB', hue: HUE.lab, gate: [-44, -4.6, FACE_S] },
  { no: '04', name: 'ギミック試験場', en: 'MOVING PARTS', hue: HUE.gizmo, gate: [44, -4.6, FACE_S] },
  { no: '05', name: 'マテリアル見本', en: 'MATERIALS', hue: HUE.mat, gate: [-20, -4.6, FACE_S] },
  { no: '06', name: '建物街', en: 'TOWN BLOCK', hue: HUE.town, gate: [-40, 4.6, FACE_N] },
  { no: '07', name: '資材置き場', en: 'ASSET YARD', hue: HUE.yard, gate: [34, 4.6, FACE_N] },
  { no: '08', name: '試作場', en: 'SANDBOX', hue: HUE.sandbox, gate: [-6.4, 60, Math.PI / 2] },
  { no: '09', name: '射撃場', en: 'RANGE', hue: HUE.range, gate: [6.4, 52, -Math.PI / 2] },
  { no: '10', name: '地形試験場', en: 'TERRAIN', hue: HUE.lab, gate: [64, 4.6, FACE_N] },
  { no: '11', name: '建築試作場', en: 'BUILDING LAB', hue: HUE.town, gate: [-6.4, -78, -Math.PI / 2] },
];

export function buildTestbed(b) {
  const rand = mulberry32(20250808);

  ground(b);
  avenues(b);
  hub(b, 0, 0);

  /*
   * 区画の配置。
   * 各区画の実寸（下のコメント）が重ならないよう、余白 4m 以上を空けてある。
   *   博物館     54 × 26      実験場     44 × 38
   *   ギミック   46 × 34      建物街     62 × 34
   *   資材置き場 50 × 30      マテリアル 21 × 25
   *   試作場     40 × 30      射撃場     91 × 22
   */
  sectionMuseum(b, 0, -46);          // x -27..27   z -59..-33
  sectionLab(b, -58, -34);           // x -80..-36  z -53..-15
  sectionGizmos(b, 58, -34);         // x  35..81   z -51..-17
  sectionMaterials(b, -20, -17);     // x -30..-9   z -29..-4
  sectionTown(b, -52, 26);           // x -83..-21  z   9..43
  sectionYard(b, 34, 24);            // x   9..59   z   9..39
  sectionSandbox(b, -50, 64);        // x -70..-30  z  49..79
  sectionRange(b, -12, 64);          // x -12..79   z  53..75
  sectionTerrain(b, 74, 34);         // x  61..87   z  19..49
  sectionBuildLab(b, 0, -112);       // x -84..84  z -140..-84

  /* ---- スポーンと目標（対戦にも使えるように） ---- */
  spawnPad(b, -84, -66, 'B');
  spawnPad(b, 84, -66, 'A');
  b.objective('A', -50, 0, 8, 5.0);
  b.objective('B', 0, 0, 0, 5.0);
  b.objective('C', 54, 0, -8, 5.0);
}

/* ================================================================= *
 *  地面・外周
 * ================================================================= */

function ground(b) {
  const w = EAST - WEST, d = SOUTH - NORTH;
  const cx = (EAST + WEST) / 2, cz = (SOUTH + NORTH) / 2;
  /*
   * 下地はコンクリート。
   * 土や草にすると模様が主張して、展示物の質感を見るときに邪魔になる。
   */
  b.floor({ x: cx, y: 0, z: cz, w, d, mat: 'concreteFloor', surface: SURFACE.CONCRETE });

  /*
   * 境界と、その外の街。
   * 金網を一周させると、どこを向いても斜めの網が視界に入って
   * ちらつき続ける。塀・仮囲い・土手を混ぜ、金網は要所だけにする。
   */
  sectionEdge(b, { west: WEST + 1, east: EAST - 1, north: NORTH + 1, south: SOUTH - 1 });
}

/**
 * 十字の通路。
 * 舗装を変えて縁石を立て、「ここを歩く」と一目で分かるようにする。
 */
function avenues(b) {
  /* ---- 東西の主通路 ---- */
  const aw = EAST - WEST - 6;
  b.box({ x: 0, y: 0.018, z: 0, w: aw, h: 0.03, d: AISLE_HW * 2, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  for (let x = WEST + 5; x < EAST - 7; x += 7) {
    if (Math.abs(x) < AVE_HW + 3) continue;
    b.box({ x: x + 1.75, y: 0.026, z: 0, w: 3.5, h: 0.03, d: 0.13, mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }
  for (const s of [-1, 1]) {
    // 交差点で縁石を切る
    for (const [x0, x1] of [[WEST + 3, -AVE_HW - 1.2], [AVE_HW + 1.2, EAST - 3]]) {
      b.box({ x: (x0 + x1) / 2, y: 0.09, z: s * (AISLE_HW + 0.09), w: x1 - x0, h: 0.18, d: 0.18,
        mat: 'concrete', surface: SURFACE.CONCRETE });
      b.box({ x: (x0 + x1) / 2, y: 0.10, z: s * (AISLE_HW + 1.4), w: x1 - x0, h: 0.03, d: 2.4,
        mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
    }
  }

  /* ---- 南北の通路 ---- */
  /*
   * 北の端は建築試作場の前で止める。
   * 敷地を北へ広げたときに通路もそのまま伸ばしたら、
   * 試作台のまん中を舗装路が突き抜けた。
   * 試作場の前面通路（東西）が、そこから先の受け口になる。
   */
  const ad = SOUTH - AVE_N - 3;
  b.box({ x: 0, y: 0.018, z: (SOUTH - 3 + AVE_N) / 2, w: AVE_HW * 2, h: 0.03, d: ad,
    mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  for (let z = AVE_N + 2; z < SOUTH - 7; z += 7) {
    if (Math.abs(z) < AISLE_HW + 3) continue;
    b.box({ x: 0, y: 0.026, z: z + 1.75, w: 0.13, h: 0.03, d: 3.5, mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[AVE_N, -AISLE_HW - 1.2], [AISLE_HW + 1.2, SOUTH - 3]]) {
      b.box({ x: s * (AVE_HW + 0.09), y: 0.09, z: (z0 + z1) / 2, w: 0.18, h: 0.18, d: z1 - z0,
        mat: 'concrete', surface: SURFACE.CONCRETE });
      b.box({ x: s * (AVE_HW + 1.4), y: 0.10, z: (z0 + z1) / 2, w: 2.4, h: 0.03, d: z1 - z0,
        mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
    }
  }

  /* ---- 枝道（南北通路から西の試作場へ） ---- */
  {
    const z = 60, x0 = -30, x1 = -AVE_HW;
    b.box({ x: (x0 + x1) / 2, y: 0.018, z, w: x1 - x0, h: 0.03, d: 4.4,
      mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
    for (const s2 of [-1, 1]) {
      b.box({ x: (x0 + x1) / 2, y: 0.09, z: z + s2 * 2.29, w: x1 - x0, h: 0.18, d: 0.18,
        mat: 'concrete', surface: SURFACE.CONCRETE });
    }
  }

  /* ---- 区画の門標 ---- */
  for (const s of SECTIONS) {
    if (!s.gate) continue;
    const [x, z, yaw] = s.gate;
    label(b, { x, y: 2.15, z, yaw, text: `${s.no}　${s.name}`, sub: s.en, accent: s.hue, w: 3.6 });
    // 足元の矢羽根（進む向き）
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    b.box({ x: x - dx * 1.6, y: 0.028, z: z - dz * 1.6, w: Math.abs(dz) * 2.8 + 0.5, h: 0.02,
      d: Math.abs(dx) * 2.8 + 0.5, mat: 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
  }

  /*
   * 通路沿いの街灯。
   * 柱が等間隔に並ぶだけで、そこが「通路」だと目が理解する。
   * 昼なので消灯させる（点灯した街灯は資材置き場と建物街にある）。
   */
  for (let x = WEST + 16; x <= EAST - 16; x += 22) {
    if (Math.abs(x) < 12) continue;
    P.streetLight(b, { x, y: 0, z: -AISLE_HW - 2.2, yaw: FACE_S, withLight: false });
  }
  for (let z = NORTH + 18; z <= SOUTH - 18; z += 22) {
    if (Math.abs(z) < 12) continue;
    P.streetLight(b, { x: -AVE_HW - 2.2, y: 0, z, yaw: Math.PI / 2, withLight: false });
  }
}

/* ================================================================= *
 *  中央広場（総合案内）
 * ================================================================= */

/**
 * 十字路の中心。
 *
 * 施設の全体像がここで掴めるようにする。
 * 中央に方位盤、周りに各区画への道標。
 * どこから来ても「次にどこへ行くか」が決められる。
 */
function hub(b, cx, cz) {
  const R = 13;

  // 円形の舗装（八角形で近似）
  const seg = 8;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    b.box({
      x: cx + Math.cos(a) * R * 0.62, y: 0.016, z: cz + Math.sin(a) * R * 0.62,
      w: R * 0.86, h: 0.03, d: R * 0.86, yaw: -a,
      mat: 'paving', surface: SURFACE.CONCRETE, collide: false,
    });
  }
  // 内側の円（御影石）
  b.cylinder({ x: cx, y: 0.018, z: cz, radius: 5.0, height: 0.03, segments: 24,
    mat: 'granite', surface: SURFACE.CONCRETE, collide: false });

  /* ---- 方位盤と塔 ---- */
  b.cylinder({ x: cx, y: 0, z: cz, radius: 1.5, height: 0.55, segments: 20, mat: 'granite', surface: SURFACE.CONCRETE });
  b.cylinder({ x: cx, y: 0.55, z: cz, radius: 1.62, height: 0.09, segments: 20, mat: 'marble', surface: SURFACE.CONCRETE, collide: false });
  // 塔（遠くからでも中心が判る目印）
  b.box({ x: cx, y: 3.4, z: cz, w: 0.9, h: 5.6, d: 0.9, mat: 'stuccoWhite', surface: SURFACE.CONCRETE });
  b.box({ x: cx, y: 6.35, z: cz, w: 1.3, h: 0.3, d: 1.3, mat: 'granite', surface: SURFACE.CONCRETE, collide: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    // 4 面の時計盤に見立てた円板
    b.cylinder({
      x: cx + Math.sin(a) * 0.48, y: 5.5, z: cz + Math.cos(a) * 0.48,
      radius: 0.34, height: 0.06, segments: 16, mat: 'brassPolished', surface: SURFACE.METAL, collide: false,
    });
  }
  b.box({ x: cx, y: 6.8, z: cz, w: 0.18, h: 0.6, d: 0.18, mat: 'brassPolished', surface: SURFACE.METAL, collide: false });

  /*
   * 総合案内板。
   * 広場へ入ってくる人に向けるので、4 方向とも「外向き」に立てる。
   * 中を向けると、通路から歩いてきた人には背中しか見えない。
   */
  for (const [ox, oz, yaw] of [
    [0, 7.2, FACE_S], [0, -7.2, FACE_N],
    [7.2, 0, Math.PI / 2], [-7.2, 0, -Math.PI / 2],
  ]) {
    label(b, {
      x: cx + ox, y: 2.5, z: cz + oz, yaw, w: 6.0,
      text: 'テストベッド　総合案内', sub: 'TESTBED / FACILITY MAP', accent: HUE.hub,
    });
  }

  /*
   * 各区画への道標。
   * 十字路の四隅に立て、その方角に何があるかを並べる。
   */
  /*
   * 方角の道標。
   * 十字路の四隅に立て、その先に何があるかを並べる。
   * 腕木は柱の片側へ張り出し、進む方向を指す形にする。
   */
  const posts = [
    [-8.5, -8.5, -Math.PI / 2, [['02 博物館', '北へ 20m'], ['03 実験場', '北西へ 45m'], ['05 マテリアル見本', '北へ 12m']]],
    [8.5, -8.5, Math.PI / 2, [['04 ギミック試験場', '北東へ 45m'], ['02 博物館', '北へ 20m']]],
    [-8.5, 8.5, -Math.PI / 2, [['06 建物街', '南西へ 30m'], ['08 試作場', '南へ 55m']]],
    [8.5, 8.5, Math.PI / 2, [['07 資材置き場', '南東へ 25m'], ['09 射撃場', '南へ 50m']]],
  ];
  for (const [ox, oz, yaw, lines] of posts) {
    const x = cx + ox, z = cz + oz;
    b.cylinder({ x, y: 0, z, radius: 0.08, height: 3.6, segments: 10, mat: 'galvanized', surface: SURFACE.METAL });
    b.cylinder({ x, y: 3.6, z, radius: 0.13, height: 0.12, segments: 10, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    const dirX = Math.cos(yaw), dirZ = -Math.sin(yaw);
    for (let i = 0; i < lines.length; i++) {
      const y = 3.05 - i * 0.62;
      const w = 3.6, h = w * 0.22;
      // 柱から片側へ張り出す
      const px = x + dirX * (w / 2 + 0.12), pz = z + dirZ * (w / 2 + 0.12);
      b.box({ x: px, y, z: pz, w, h, d: 0.06, yaw,
        mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
      const geo = new THREE.PlaneGeometry(w - 0.04, h - 0.04);
      for (const face of [1, -1]) {
        // 両面に貼る（どちら側から来ても読める）
        const m = new THREE.Mesh(geo, b.mats.label(lines[i][0], { sub: lines[i][1], accent: HUE.hub }));
        m.position.set(px + Math.sin(yaw) * 0.04 * face, y, pz + Math.cos(yaw) * 0.04 * face);
        m.rotation.y = face > 0 ? yaw : yaw + Math.PI;
        b.addExtra(m);
      }
    }
  }

  /* ---- 休憩の設え ---- */
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P.bench(b, {
      x: cx + Math.cos(a) * 9.5, y: 0, z: cz + Math.sin(a) * 9.5,
      yaw: -a + Math.PI / 2, w: 2.0,
    });
    P.potPlant(b, { x: cx + Math.cos(a + 0.42) * 10.5, y: 0, z: cz + Math.sin(a + 0.42) * 10.5, height: 1.2 });
  }
  P.trashBin(b, { x: cx + 7.2, y: 0, z: cz - 2.0 });
  P.trashBin(b, { x: cx - 7.2, y: 0, z: cz + 2.0 });
}

/* ================================================================= *
 *  スポーン
 * ================================================================= */

function spawnPad(b, x, z, team) {
  b.box({ x, y: 0.015, z, w: 8, h: 0.03, d: 8,
    mat: team === 'A' ? 'paintedMetal' : 'paintedMetalTan', surface: SURFACE.CONCRETE, collide: false });
  for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
    b.cylinder({ x: x + dx, y: 0, z: z + dz, radius: 0.07, height: 1.5, segments: 6,
      mat: 'hazardStripe', surface: SURFACE.METAL, collide: false });
  }
  // 施設の中心を向いて湧く
  const yaw = Math.atan2(-x, -z);
  for (let i = 0; i < 4; i++) {
    b.spawn(team, x + (i % 2 ? 1.8 : -1.8), 0, z + (i < 2 ? 1.8 : -1.8), yaw);
  }
  label(b, { x, y: 2.0, z, yaw, text: team === 'A' ? 'A 出撃' : 'B 出撃',
    accent: team === 'A' ? '#4a90d9' : '#d9482f', w: 2.6 });
}
