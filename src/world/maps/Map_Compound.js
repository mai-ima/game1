import * as THREE from 'three';
import { SURFACE } from '../Physics.js';
import * as P from '../Props.js';

/**
 * マップ 1: COMPOUND（コンパウンド）
 *
 * 設計方針 — 古典的な 3 レーン構造:
 *   西レーン … コンテナ置き場。遮蔽が多く近距離戦向き
 *   中央   … 2 階建ての主屋。高所取りが強いが左右から挟まれる
 *   東レーン … 市場通り。中距離の撃ち合いと側面攻撃の起点
 *
 * 南（Z+）が チームA、北（Z-）が チームB のスポーン。
 * 概ね 74m 四方。目標地点は中央広場と東西の要所に配置。
 */

export const MAP_INFO = {
  id: 'compound',
  name: 'COMPOUND',
  nameJa: 'コンパウンド',
  desc: '砂漠地帯の廃棄されたコンパウンド。中央の主屋を巡る攻防が勝敗を分ける。',
  size: '中規模',
  players: '6〜12人',
  sun: { elevation: 42, azimuth: 132 },
  fog: { color: 0xc8b898, near: 55, far: 210, density: 0.0016 },
};

const HALF = 37;

export function buildCompound(b) {
  const rand = mulberry32(20250807);
  const R = (a, c) => a + rand() * (c - a);

  /* ============ 地面 ============ */
  b.floor({ x: 0, y: 0, z: 0, w: HALF * 2, d: HALF * 2, mat: 'dirt', surface: SURFACE.DIRT });

  // 舗装路（中央十字）
  b.box({ x: 0, y: 0.012, z: 0, w: 9.5, h: 0.03, d: HALF * 2, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  b.box({ x: 0, y: 0.014, z: 0, w: HALF * 2, h: 0.03, d: 8.0, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  // 石畳の広場
  b.box({ x: 0, y: 0.02, z: 0, w: 22, h: 0.03, d: 18, mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
  // 砂利の路肩
  b.box({ x: -19, y: 0.01, z: 8, w: 13, h: 0.02, d: 22, mat: 'gravel', surface: SURFACE.GRAVEL, collide: false });
  b.box({ x: 20, y: 0.01, z: -10, w: 12, h: 0.02, d: 20, mat: 'gravel', surface: SURFACE.GRAVEL, collide: false });

  /* ============ 外周壁 ============ */
  const W = HALF - 1;
  for (const [x1, z1, x2, z2] of [
    [-W, -W, W, -W], [-W, W, W, W], [-W, -W, -W, W], [W, -W, W, W],
  ]) {
    b.wall({ x1, z1, x2, z2, h: 5.2, thickness: 0.6, mat: 'plaster', surface: SURFACE.CONCRETE });
  }
  // 壁の笠木と控え壁（外周を単調にしない）
  for (let i = -6; i <= 6; i++) {
    const t = i * 5.6;
    b.box({ x: -W + 0.5, y: 1.6, z: t, w: 0.7, h: 3.2, d: 0.8, mat: 'plaster', surface: SURFACE.CONCRETE });
    b.box({ x: W - 0.5, y: 1.6, z: t, w: 0.7, h: 3.2, d: 0.8, mat: 'plaster', surface: SURFACE.CONCRETE });
  }

  /* ============ 中央: 主屋（2階建て） ============ */
  mainBuilding(b, 0, 0);

  /* ============ 西レーン: コンテナ置き場 ============ */
  containerYard(b, rand);

  /* ============ 東レーン: 市場通り ============ */
  marketStreet(b, rand);

  /* ============ 南北のスポーン建物 ============ */
  spawnStructure(b, 0, 27, 0, 'A');
  spawnStructure(b, 0, -27, Math.PI, 'B');

  /* ============ 散在プロップ ============ */
  scatter(b, rand);

  /* ============ スポーン地点 ============ */
  for (let i = 0; i < 6; i++) {
    b.spawn('A', -6 + i * 2.4, 0, 29 + (i % 2) * 2.0, Math.PI);
    b.spawn('B', -6 + i * 2.4, 0, -29 - (i % 2) * 2.0, 0);
  }

  /* ============ 目標地点 ============ */
  b.objective('A', -14.5, 0, -2.0, 4.0);   // コンテナ置き場
  b.objective('B', 15.5, 0, 3.0, 4.0);     // 市場
  b.objective('C', 0, 0, 0, 4.5);          // 中央広場

  return b;
}

/* ================================================================= */

/** 中央の主屋 */
function mainBuilding(b, ox, oz) {
  const W = 15.5, D = 12.0, H1 = 3.5, H2 = 3.2;
  const hw = W / 2, hd = D / 2;
  const wallMat = 'plaster';

  // --- 1 階の床 ---
  b.floor({ x: ox, y: 0.06, z: oz, w: W, d: D, mat: 'tile', surface: SURFACE.CONCRETE });

  // --- 1 階の壁（4 面に開口） ---
  // 南面（正面・大きな入口）
  b.wallWithGap({
    x1: ox - hw, z1: oz + hd, x2: ox + hw, z2: oz + hd, h: H1,
    gapStart: W / 2 - 1.6, gapWidth: 3.2, gapTop: 2.4,
    mat: wallMat, surface: SURFACE.CONCRETE, thickness: 0.34,
  });
  // 北面（裏口）
  b.wallWithGap({
    x1: ox - hw, z1: oz - hd, x2: ox + hw, z2: oz - hd, h: H1,
    gapStart: W / 2 - 1.1, gapWidth: 2.2, gapTop: 2.3,
    mat: wallMat, surface: SURFACE.CONCRETE, thickness: 0.34,
  });
  // 西面（窓 2 つ）
  b.wallWithGap({
    x1: ox - hw, z1: oz - hd, x2: ox - hw, z2: oz + hd, h: H1,
    gapStart: 2.2, gapWidth: 2.0, gapBottom: 1.0, gapTop: 2.5,
    mat: wallMat, surface: SURFACE.CONCRETE, thickness: 0.34,
  });
  b.wallWithGap({
    x1: ox - hw, z1: oz + 1.0, x2: ox - hw, z2: oz + hd, h: H1,
    gapStart: 1.4, gapWidth: 2.0, gapBottom: 1.0, gapTop: 2.5,
    mat: wallMat, surface: SURFACE.CONCRETE, thickness: 0.34,
  });
  // 東面（大開口 = 市場側への抜け）
  b.wallWithGap({
    x1: ox + hw, z1: oz - hd, x2: ox + hw, z2: oz + hd, h: H1,
    gapStart: 3.6, gapWidth: 4.4, gapTop: 2.5,
    mat: wallMat, surface: SURFACE.CONCRETE, thickness: 0.34,
  });

  // --- 内部の仕切り（部屋を作る） ---
  b.wallWithGap({
    x1: ox - 2.0, z1: oz - hd + 0.3, x2: ox - 2.0, z2: oz + hd - 0.3, h: H1,
    gapStart: 6.0, gapWidth: 1.5, gapTop: 2.2,
    mat: 'paintedWall', surface: SURFACE.CONCRETE, thickness: 0.22,
  });
  b.wallWithGap({
    x1: ox - 2.0, z1: oz - 2.6, x2: ox + hw - 0.3, z2: oz - 2.6, h: H1,
    gapStart: 5.2, gapWidth: 1.6, gapTop: 2.2,
    mat: 'paintedWall', surface: SURFACE.CONCRETE, thickness: 0.22,
  });

  // --- 2 階の床（吹き抜けを残す） ---
  b.box({ x: ox - 4.2, y: H1 + 0.15, z: oz, w: 7.1, h: 0.3, d: D, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
  b.box({ x: ox + 5.0, y: H1 + 0.15, z: oz - 3.4, w: 5.5, h: 0.3, d: 5.2, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
  b.box({ x: ox + 5.0, y: H1 + 0.15, z: oz + 4.2, w: 5.5, h: 0.3, d: 3.6, mat: 'concreteFloor', surface: SURFACE.CONCRETE });

  // --- 階段（1階→2階） ---
  b.stairs({ x: ox + 1.4, y: 0.06, z: oz + hd - 0.6, width: 1.5, rise: 0.212, run: 0.30, steps: 17, yaw: 0, mat: 'concrete' });
  P.railing(b, { x1: ox + 2.25, z1: oz + hd - 0.6, x2: ox + 2.25, z2: oz + hd - 5.7, y: 0.06, height: 1.0 });

  // --- 2 階の壁（低い胸壁 + 一部フル） ---
  b.wall({ x1: ox - hw, z1: oz + hd, x2: ox + hw, z2: oz + hd, h: 1.15, y: H1 + 0.3, mat: wallMat, thickness: 0.30, surface: SURFACE.CONCRETE });
  b.wall({ x1: ox - hw, z1: oz - hd, x2: ox + hw, z2: oz - hd, h: 1.15, y: H1 + 0.3, mat: wallMat, thickness: 0.30, surface: SURFACE.CONCRETE });
  b.wallWithGap({
    x1: ox - hw, z1: oz - hd, x2: ox - hw, z2: oz + hd, h: H2, y: H1 + 0.3,
    gapStart: 4.0, gapWidth: 3.0, gapBottom: 0.9, gapTop: 2.3,
    mat: wallMat, surface: SURFACE.CONCRETE, thickness: 0.30,
  });
  b.wall({ x1: ox + hw, z1: oz - hd, x2: ox + hw, z2: oz - 1.0, h: 1.15, y: H1 + 0.3, mat: wallMat, thickness: 0.30, surface: SURFACE.CONCRETE });

  // 吹き抜けの手すり
  P.railing(b, { x1: ox - 0.6, z1: oz - hd + 0.4, x2: ox - 0.6, z2: oz + hd - 0.4, y: H1 + 0.3, height: 1.05 });

  // --- 屋根 ---
  b.box({ x: ox - 4.2, y: H1 + H2 + 0.5, z: oz, w: 7.1, h: 0.28, d: D, mat: 'concrete', surface: SURFACE.CONCRETE });
  // 屋上へのはしご代わりの箱段
  b.box({ x: ox - 7.0, y: H1 + 0.9, z: oz - 4.6, w: 1.0, h: 1.0, d: 1.0, mat: 'plywood', surface: SURFACE.WOOD });

  // --- 柱（構造感） ---
  for (const cx of [-hw + 0.5, hw - 0.5]) {
    for (const cz of [-hd + 0.5, hd - 0.5]) {
      b.box({ x: ox + cx, y: (H1 + H2) / 2, z: oz + cz, w: 0.5, h: H1 + H2 + 0.6, d: 0.5, mat: 'concrete', surface: SURFACE.CONCRETE });
    }
  }

  // --- 屋内の小物 ---
  P.woodCrate(b, { x: ox - 5.4, y: 0.06, z: oz + 3.6, yaw: 0.3 });
  P.woodCrate(b, { x: ox - 5.4, y: 0.78, z: oz + 3.6, yaw: -0.15, size: 0.7 });
  P.woodCrate(b, { x: ox - 4.3, y: 0.06, z: oz + 4.2, yaw: 0.9 });
  P.ammoCrate(b, { x: ox - 6.0, y: 0.06, z: oz - 2.4, yaw: 0.2 });
  P.ammoCrate(b, { x: ox - 6.0, y: 0.40, z: oz - 2.4, yaw: -0.3 });
  P.cardboardStack(b, { x: ox + 5.6, y: 0.06, z: oz + 4.4, yaw: 0.4, count: 3 });
  P.barrel(b, { x: ox + 6.2, y: 0.06, z: oz - 4.4, mat: 'rustedMetal' });
  P.barrel(b, { x: ox + 5.4, y: 0.06, z: oz - 5.0, mat: 'paintedMetal' });
  P.pallet(b, { x: ox - 1.0, y: 0.06, z: oz - 4.6, yaw: 0.15 });

  // 2 階の小物
  P.sandbagStack(b, { x: ox - 4.2, y: H1 + 0.3, z: oz - 4.6, yaw: 0, rows: 3, perRow: 5, length: 2.8 });
  P.woodCrate(b, { x: ox - 6.4, y: H1 + 0.3, z: oz + 3.0, yaw: 0.5, size: 0.72 });
  P.ammoCrate(b, { x: ox + 5.2, y: H1 + 0.3, z: oz - 3.0, yaw: -0.4 });

  // --- 屋内照明 ---
  b.light({ x: ox - 4.0, y: H1 - 0.4, z: oz + 2.0, color: 0xffd9a0, intensity: 7, distance: 9 });
  b.light({ x: ox + 4.0, y: H1 - 0.4, z: oz - 3.0, color: 0xffd0a0, intensity: 6, distance: 8 });
  b.light({ x: ox - 4.0, y: H1 + H2 - 0.3, z: oz - 1.0, color: 0xffe0b0, intensity: 5, distance: 8 });

  // 照明器具
  for (const [lx, lz, ly] of [[-4.0, 2.0, H1 - 0.25], [4.0, -3.0, H1 - 0.25]]) {
    const geo = new THREE.BoxGeometry(0.5, 0.05, 0.5);
    const m = new THREE.Mesh(geo, b.mats.emissive(0xffdca8, 5));
    m.position.set(ox + lx, ly, oz + lz);
    b.addExtra(m);
  }

  // 屋上設備
  P.waterTank(b, { x: ox - 5.6, y: H1 + H2 + 1.14, z: oz + 3.2 });
  P.rooftopClutter(b, { x: ox - 2.6, y: H1 + H2 + 0.64, z: oz - 3.0, yaw: 0.6 });
  P.acUnit(b, { x: ox + 7.4, y: H1 + 0.3, z: oz + 1.2, yaw: -Math.PI / 2 });
}

/** 西レーン: コンテナ置き場 */
function containerYard(b, rand) {
  const R = (a, c) => a + rand() * (c - a);

  // 積み上げたコンテナ（高低差と通路を作る）
  P.container(b, { x: -15, y: 0, z: -8, yaw: 0 });
  P.container(b, { x: -15, y: 2.59, z: -8, yaw: 0.04 });
  P.container(b, { x: -21, y: 0, z: -6, yaw: 0.5 });
  P.container(b, { x: -13.5, y: 0, z: 4, yaw: Math.PI / 2 });
  P.container(b, { x: -20, y: 0, z: 9, yaw: Math.PI / 2 + 0.06 });
  P.container(b, { x: -20, y: 2.59, z: 9, yaw: Math.PI / 2 - 0.03 });
  P.container(b, { x: -25, y: 0, z: -14, yaw: 0.2 });
  P.container(b, { x: -16, y: 0, z: 15, yaw: -0.35 });

  // コンテナ上に登るための階段状の箱
  b.box({ x: -18.4, y: 0.45, z: -8, w: 1.6, h: 0.9, d: 1.6, mat: 'plywood', surface: SURFACE.WOOD });
  b.box({ x: -18.4, y: 1.35, z: -9.6, w: 1.6, h: 2.7, d: 1.6, mat: 'plywood', surface: SURFACE.WOOD });

  // クレーンの脚（垂直方向の情報量）
  for (const cz of [-18, 2]) {
    b.box({ x: -29, y: 4.0, z: cz, w: 0.7, h: 8.0, d: 0.7, mat: 'hazardStripe', surface: SURFACE.METAL });
  }
  b.box({ x: -29, y: 8.2, z: -8, w: 1.0, h: 0.6, d: 21, mat: 'hazardStripe', surface: SURFACE.METAL });

  // 小物
  P.barrel(b, { x: -11.5, y: 0, z: -12.5 });
  P.barrel(b, { x: -12.2, y: 0, z: -13.1, mat: 'paintedMetal' });
  P.barrel(b, { x: -11.0, y: 0, z: -13.4 });
  P.tireStack(b, { x: -23, y: 0, z: 2, count: 4 });
  P.tireStack(b, { x: -24.2, y: 0, z: 2.9, count: 2 });
  P.pallet(b, { x: -17.5, y: 0, z: 11.5, yaw: 0.3 });
  P.pallet(b, { x: -17.5, y: 0.13, z: 11.5, yaw: 0.9 });
  P.woodCrate(b, { x: -17.5, y: 0.26, z: 11.5, yaw: 0.2 });
  P.sandbagStack(b, { x: -9.5, y: 0, z: 6.5, yaw: Math.PI / 2, rows: 3, perRow: 5, length: 3.0 });
  P.sandbagStack(b, { x: -24, y: 0, z: -3, yaw: 0.2, rows: 2, perRow: 4, length: 2.4 });
  P.jerryCan(b, { x: -12.8, y: 0, z: -11.2, yaw: 0.7 });
  P.jerryCan(b, { x: -13.1, y: 0, z: -11.6, yaw: -0.4 });
  P.rubble(b, { x: -27, z: 12, radius: 2.6, count: 18 });
  P.vehicle(b, { x: -25.5, y: 0, z: 18, yaw: 0.6, type: 'truck', mat: 'paintedMetal' });
  P.streetLight(b, { x: -10.5, y: 0, z: -2, yaw: -Math.PI / 2 });
  P.utilityPole(b, { x: -22, y: 0, z: 22, yaw: 0.2 });
  P.litter(b, { x: -15, z: 0, radius: 6, count: 26 });
  P.litter(b, { x: -22, z: -10, radius: 5, count: 18 });
}

/** 東レーン: 市場通り */
function marketStreet(b, rand) {
  const R = (a, c) => a + rand() * (c - a);

  // 通り沿いの建物（低層・屋上に上がれる）
  const shops = [
    { x: 24, z: -14, w: 9, d: 8, h: 3.4, mat: 'brick' },
    { x: 24, z: -2, w: 9, d: 10, h: 4.2, mat: 'brickPale' },
    { x: 24, z: 12, w: 9, d: 9, h: 3.6, mat: 'plaster' },
    { x: 13, z: -20, w: 8, d: 7, h: 3.4, mat: 'plaster' },
  ];
  for (const s of shops) {
    // 外壁（通り側に開口）
    const hw = s.w / 2, hd = s.d / 2;
    b.wallWithGap({
      x1: s.x - hw, z1: s.z + hd, x2: s.x - hw, z2: s.z - hd, h: s.h,
      gapStart: hd - 1.1, gapWidth: 2.2, gapTop: 2.4,
      mat: s.mat, surface: SURFACE.CONCRETE, thickness: 0.34,
    });
    b.wall({ x1: s.x + hw, z1: s.z - hd, x2: s.x + hw, z2: s.z + hd, h: s.h, mat: s.mat, thickness: 0.34, surface: SURFACE.CONCRETE });
    b.wallWithGap({
      x1: s.x - hw, z1: s.z - hd, x2: s.x + hw, z2: s.z - hd, h: s.h,
      gapStart: hw - 0.9, gapWidth: 1.8, gapBottom: 1.05, gapTop: 2.5,
      mat: s.mat, surface: SURFACE.CONCRETE, thickness: 0.34,
    });
    b.wall({ x1: s.x - hw, z1: s.z + hd, x2: s.x + hw, z2: s.z + hd, h: s.h, mat: s.mat, thickness: 0.34, surface: SURFACE.CONCRETE });
    // 床と屋根
    b.floor({ x: s.x, y: 0.05, z: s.z, w: s.w, d: s.d, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
    b.box({ x: s.x, y: s.h + 0.15, z: s.z, w: s.w + 0.5, h: 0.3, d: s.d + 0.5, mat: 'concrete', surface: SURFACE.CONCRETE });
    // 屋上の胸壁
    for (const [x1, z1, x2, z2] of [
      [s.x - hw, s.z - hd, s.x + hw, s.z - hd], [s.x - hw, s.z + hd, s.x + hw, s.z + hd],
      [s.x - hw, s.z - hd, s.x - hw, s.z + hd], [s.x + hw, s.z - hd, s.x + hw, s.z + hd],
    ]) {
      b.wall({ x1, z1, x2, z2, h: 0.95, y: s.h + 0.3, mat: s.mat, thickness: 0.26, surface: SURFACE.CONCRETE });
    }
    // 屋内照明
    b.light({ x: s.x, y: s.h - 0.5, z: s.z, color: 0xffcf90, intensity: 5, distance: 8 });
    // 屋上設備
    P.rooftopClutter(b, { x: s.x + 1.5, y: s.h + 0.3, z: s.z - 1.5, yaw: R(0, 3) });
    P.acUnit(b, { x: s.x - hw + 0.6, y: s.h + 0.3, z: s.z + 1.0, yaw: -Math.PI / 2 });
  }

  // 屋上へ上がる外階段
  b.stairs({ x: 18.6, y: 0, z: -6.4, width: 1.5, rise: 0.21, run: 0.29, steps: 17, yaw: 0, mat: 'concrete' });
  P.railing(b, { x1: 19.4, z1: -6.4, x2: 19.4, z2: -11.4, y: 0, height: 1.0 });
  b.box({ x: 19.6, y: 3.65, z: -12.0, w: 3.0, h: 0.3, d: 2.4, mat: 'concrete', surface: SURFACE.CONCRETE });

  // 屋台の列
  for (let i = 0; i < 5; i++) {
    const z = -12 + i * 6.2;
    P.marketStall(b, { x: 15.5, y: 0, z, yaw: -Math.PI / 2, cloth: i % 2 ? 'fabric' : 'camo' });
  }
  // 反対側にもいくつか
  P.marketStall(b, { x: 10.5, y: 0, z: -4, yaw: Math.PI / 2 });
  P.marketStall(b, { x: 10.5, y: 0, z: 8, yaw: Math.PI / 2, cloth: 'camo' });

  // 洗濯物（生活感）
  P.clothesline(b, { x1: 12.5, y: 3.2, z1: -18, x2: 19.5, z2: -18, count: 5 });
  P.clothesline(b, { x1: 12.0, y: 3.6, z1: 6, x2: 19.5, z2: 6, count: 6 });

  // 通りの小物
  P.vehicle(b, { x: 12.0, y: 0, z: 18.5, yaw: -0.25, type: 'car', mat: 'paintedMetalTan' });
  P.vehicle(b, { x: 19.0, y: 0, z: 24.0, yaw: 1.4, type: 'truck' });
  P.barrel(b, { x: 11.2, y: 0, z: -9.5 });
  P.barrel(b, { x: 11.9, y: 0, z: -10.1, mat: 'paintedMetal' });
  P.cardboardStack(b, { x: 18.0, y: 0, z: 2.5, yaw: 0.3, count: 4 });
  P.cardboardStack(b, { x: 18.8, y: 0, z: 3.4, yaw: -0.6, count: 2 });
  P.tireStack(b, { x: 20.5, y: 0, z: 19, count: 3 });
  P.woodCrate(b, { x: 13.6, y: 0, z: 13.0, yaw: 0.4 });
  P.woodCrate(b, { x: 13.6, y: 0.72, z: 13.0, yaw: -0.2, size: 0.7 });
  P.woodCrate(b, { x: 14.5, y: 0, z: 13.6, yaw: 0.9 });
  P.sandbagStack(b, { x: 8.5, y: 0, z: -14, yaw: 0, rows: 3, perRow: 5, length: 3.0 });
  P.streetLight(b, { x: 10.0, y: 0, z: 0, yaw: Math.PI / 2 });
  P.streetLight(b, { x: 10.0, y: 0, z: 14, yaw: Math.PI / 2 });
  P.utilityPole(b, { x: 21, y: 0, z: 6, yaw: -0.3 });
  P.sign(b, { x: 18.9, y: 2.6, z: -2, yaw: -Math.PI / 2, w: 1.8, h: 0.7, mat: 'hazardStripe' });
  P.rubble(b, { x: 26, z: 4, radius: 2.2, count: 12 });
  P.litter(b, { x: 15, z: 0, radius: 8, count: 34 });
  P.litter(b, { x: 22, z: 16, radius: 5, count: 16 });
}

/** 南北のスポーン構造物 */
function spawnStructure(b, ox, oz, yaw, team) {
  const W = 17, D = 7, H = 3.6;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const tx = (lx, lz) => ox + c * lx + s * lz;
  const tz = (lx, lz) => oz - s * lx + c * lz;

  // 屋根付きの車庫状構造
  b.floor({ x: ox, y: 0.05, z: oz, w: W, d: D, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
  b.box({ x: ox, y: H + 0.2, z: oz, w: W + 1.0, h: 0.35, d: D + 1.0, yaw, mat: 'corrugated', surface: SURFACE.METAL });
  // 柱
  for (const lx of [-W / 2 + 0.5, 0, W / 2 - 0.5]) {
    for (const lz of [-D / 2 + 0.5, D / 2 - 0.5]) {
      b.box({ x: tx(lx, lz), y: H / 2, z: tz(lx, lz), w: 0.4, h: H, d: 0.4, yaw, mat: 'concrete', surface: SURFACE.CONCRETE });
    }
  }
  // 奥の壁
  b.wall({
    x1: tx(-W / 2, -D / 2), z1: tz(-W / 2, -D / 2), x2: tx(W / 2, -D / 2), z2: tz(W / 2, -D / 2),
    h: H, mat: 'corrugated', thickness: 0.24, surface: SURFACE.METAL,
  });

  // 遮蔽
  P.sandbagStack(b, { x: tx(-5.5, D / 2 + 1.6), y: 0, z: tz(-5.5, D / 2 + 1.6), yaw, rows: 3, perRow: 5, length: 3.2 });
  P.sandbagStack(b, { x: tx(5.5, D / 2 + 1.6), y: 0, z: tz(5.5, D / 2 + 1.6), yaw, rows: 3, perRow: 5, length: 3.2 });
  P.container(b, { x: tx(-11, D / 2 + 3.0), y: 0, z: tz(-11, D / 2 + 3.0), yaw: yaw + Math.PI / 2 });
  P.container(b, { x: tx(11, D / 2 + 3.0), y: 0, z: tz(11, D / 2 + 3.0), yaw: yaw + Math.PI / 2 });

  // 補給物資
  P.ammoCrate(b, { x: tx(-2.0, 0), y: 0.05, z: tz(-2.0, 0), yaw });
  P.ammoCrate(b, { x: tx(-1.3, 0), y: 0.05, z: tz(-1.3, 0), yaw: yaw + 0.2 });
  P.ammoCrate(b, { x: tx(-1.65, 0), y: 0.39, z: tz(-1.65, 0), yaw: yaw - 0.1 });
  P.woodCrate(b, { x: tx(3.0, -1.0), y: 0.05, z: tz(3.0, -1.0), yaw });
  P.barrel(b, { x: tx(6.5, -1.5), y: 0.05, z: tz(6.5, -1.5) });
  P.jerryCan(b, { x: tx(5.6, -2.0), y: 0.05, z: tz(5.6, -2.0), yaw });
  P.vehicle(b, { x: tx(-7.5, -0.5), y: 0.05, z: tz(-7.5, -0.5), yaw: yaw + Math.PI / 2, type: 'truck' });

  // 照明
  b.light({ x: ox, y: H - 0.5, z: oz, color: 0xffd0a0, intensity: 9, distance: 13 });
  const geo = new THREE.BoxGeometry(1.2, 0.06, 0.4);
  const lamp = new THREE.Mesh(geo, b.mats.emissive(0xffe0b0, 4));
  lamp.position.set(ox, H - 0.12, oz);
  lamp.rotation.y = yaw;
  b.addExtra(lamp);

  P.litter(b, { x: ox, z: oz, radius: 7, count: 20 });
}

/** マップ全体に散らす追加プロップ */
function scatter(b, rand) {
  const R = (a, c) => a + rand() * (c - a);

  // 四隅の瓦礫と残骸
  P.rubble(b, { x: -30, z: -28, radius: 3.5, count: 22 });
  P.rubble(b, { x: 30, z: -30, radius: 3.0, count: 18 });
  P.rubble(b, { x: -31, z: 30, radius: 3.2, count: 20 });
  P.rubble(b, { x: 31, z: 31, radius: 2.8, count: 16 });

  // 中央広場の遮蔽
  P.sandbagStack(b, { x: -5.0, y: 0, z: 9.5, yaw: 0.15, rows: 3, perRow: 6, length: 3.6 });
  P.sandbagStack(b, { x: 5.0, y: 0, z: -9.5, yaw: -0.2, rows: 3, perRow: 6, length: 3.6 });
  P.barrel(b, { x: -8.6, y: 0, z: -6.4 });
  P.barrel(b, { x: -9.3, y: 0, z: -7.0, mat: 'paintedMetal' });
  P.barrel(b, { x: 8.6, y: 0, z: 6.4 });
  P.woodCrate(b, { x: 7.4, y: 0, z: -6.0, yaw: 0.5 });
  P.pallet(b, { x: -7.0, y: 0, z: 12.0, yaw: 0.8 });

  // 外周沿いの電柱と街灯
  P.utilityPole(b, { x: -33, y: 0, z: -4, yaw: 1.5 });
  P.utilityPole(b, { x: 33, y: 0, z: -22, yaw: -1.5 });
  P.streetLight(b, { x: 0, y: 0, z: 17, yaw: 0 });
  P.streetLight(b, { x: 0, y: 0, z: -17, yaw: Math.PI });

  // 破損した車両
  P.vehicle(b, { x: -3.5, y: 0, z: -22, yaw: 0.9, type: 'car', mat: 'rustedMetal' });
  P.vehicle(b, { x: 4.0, y: 0, z: 22, yaw: -1.2, type: 'car', mat: 'paintedMetal' });

  P.litter(b, { x: 0, z: 0, radius: 10, count: 40 });
  P.litter(b, { x: 0, z: -20, radius: 8, count: 22 });
  P.litter(b, { x: 0, z: 20, radius: 8, count: 22 });
}

/** 決定的な乱数（同じマップが毎回同じ配置になるように） */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
