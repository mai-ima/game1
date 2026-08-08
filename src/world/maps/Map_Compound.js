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
  /*
   * 遊べる範囲。ミニマップの焼き込みなど、
   * 「マップがどこまであるか」を要る側がここを見る。
   * 以前は呼び出し側が ±38 と直書きしており、
   * 東西に伸ばしたぶんがミニマップから丸ごと欠けていた。
   */
  bounds: { min: { x: -66, z: -39 }, max: { x: 66, z: 39 } },
};

/*
 * マップの範囲。
 *
 * 元は 74m 四方だったが、東西に伸ばして 128×74m の横長にした。
 *
 * 縦長・正方形のままでは、端に足したエリアが動線から外れて
 * 誰も足を運ばない。横長にして west → east の一本道に
 *   工事現場 → コンテナ置き場 → 主屋 → 市場 → 車両基地
 * を並べ、両陣営が east / west の端から攻め上がる形にすると、
 * すべてのエリアが必ず戦闘に絡む。
 */
const HALF = 37;          // 南北の半径
const EAST = 64;          // 東の端
const WEST = -64;         // 西の端

export function buildCompound(b) {
  const rand = mulberry32(20250807);
  const R = (a, c) => a + rand() * (c - a);

  /* ============ 地面 ============ */
  const gw = EAST - WEST, gcx = (EAST + WEST) / 2;
  b.floor({ x: gcx, y: 0, z: 0, w: gw, d: HALF * 2, mat: 'dirt', surface: SURFACE.DIRT });

  /* ---- 舗装路（中央十字） ----
   * 車道・縁石・歩道・点字ブロックを積む。
   * 以前はアスファルトの帯を 2 本置いただけで、
   * 「道」というより色の違う地面にしか見えなかった。
   */
  const ROAD_NS = 9.5, ROAD_EW = 8.0;
  // 車道（白線入り）
  b.box({ x: 0, y: 0.012, z: 0, w: ROAD_NS, h: 0.03, d: HALF * 2, mat: 'roadMarking', surface: SURFACE.CONCRETE, collide: false });
  b.box({ x: gcx, y: 0.014, z: 0, w: gw, h: 0.03, d: ROAD_EW, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  // 交差点は白線を消す（南北の破線が交差点を突っ切ると不自然）
  b.box({ x: 0, y: 0.016, z: 0, w: ROAD_NS, h: 0.03, d: ROAD_EW, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });

  // 縁石と歩道（南北の道に沿って）
  for (const sx of [-1, 1]) {
    const cx = sx * (ROAD_NS / 2 + 0.09);
    for (const [z0, z1] of [[-HALF, -ROAD_EW / 2 - 0.6], [ROAD_EW / 2 + 0.6, HALF]]) {
      const zc = (z0 + z1) / 2, zd = z1 - z0;
      b.box({ x: cx, y: 0.10, z: zc, w: 0.18, h: 0.20, d: zd, mat: 'concrete', surface: SURFACE.CONCRETE });
      b.box({ x: sx * (ROAD_NS / 2 + 1.35), y: 0.11, z: zc, w: 2.4, h: 0.03, d: zd, mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
      // 点字ブロック（縁石の内側 30cm）
      b.box({ x: sx * (ROAD_NS / 2 + 0.55), y: 0.125, z: zc, w: 0.3, h: 0.02, d: zd, mat: 'tactilePaving', surface: SURFACE.CONCRETE, collide: false });
    }
  }
  // 東西の道の縁石
  for (const sz of [-1, 1]) {
    const cz = sz * (ROAD_EW / 2 + 0.09);
    for (const [x0, x1] of [[WEST + 2, -ROAD_NS / 2 - 0.6], [ROAD_NS / 2 + 0.6, EAST - 2]]) {
      const xc = (x0 + x1) / 2, xd = x1 - x0;
      b.box({ x: xc, y: 0.10, z: cz, w: xd, h: 0.20, d: 0.18, mat: 'concrete', surface: SURFACE.CONCRETE });
    }
  }
  // 横断歩道（交差点の 4 方向）
  for (const [ax, az, aw, ad] of [
    [0, ROAD_EW / 2 + 1.6, ROAD_NS - 0.6, 2.6], [0, -ROAD_EW / 2 - 1.6, ROAD_NS - 0.6, 2.6],
  ]) {
    for (let i = 0; i < 7; i++) {
      b.box({
        x: ax - aw / 2 + 0.45 + i * (aw / 7), y: 0.018, z: az,
        w: 0.42, h: 0.03, d: ad, mat: 'plasticGloss', surface: SURFACE.CONCRETE, collide: false,
      });
    }
  }
  // マンホールと側溝
  for (const [mx, mz] of [[3.2, -14], [-3.4, 9], [3.0, 24], [-3.2, -26]]) {
    b.cylinder({ x: mx, y: 0.018, z: mz, radius: 0.32, height: 0.03, segments: 14, mat: 'castIron', surface: SURFACE.METAL, collide: false });
  }
  for (const sx of [-1, 1]) {
    b.box({ x: sx * (ROAD_NS / 2 - 0.25), y: 0.017, z: 0, w: 0.3, h: 0.03, d: HALF * 2, mat: 'expandedMetal', surface: SURFACE.METAL, collide: false });
  }

  // 石畳の広場
  b.box({ x: 0, y: 0.02, z: 0, w: 22, h: 0.03, d: 18, mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
  // 砂利の路肩
  b.box({ x: -19, y: 0.01, z: 8, w: 13, h: 0.02, d: 22, mat: 'gravel', surface: SURFACE.GRAVEL, collide: false });
  b.box({ x: 20, y: 0.01, z: -10, w: 12, h: 0.02, d: 20, mat: 'gravel', surface: SURFACE.GRAVEL, collide: false });
  // 中央広場の脇に草地（一面が土だけだと単調になる）
  b.box({ x: -13.5, y: 0.016, z: -20, w: 11, h: 0.03, d: 12, mat: 'grass', surface: SURFACE.DIRT, collide: false });
  b.box({ x: 26, y: 0.016, z: -24, w: 14, h: 0.03, d: 12, mat: 'grassDry', surface: SURFACE.DIRT, collide: false });

  /* ============ 外周壁 ============ */
  const W = HALF - 1, WX = WEST + 1, EX = EAST - 1;
  for (const [x1, z1, x2, z2] of [
    [WX, -W, EX, -W], [WX, W, EX, W], [WX, -W, WX, W], [EX, -W, EX, W],
  ]) {
    b.wall({ x1, z1, x2, z2, h: 5.2, thickness: 0.6, mat: 'plaster', surface: SURFACE.CONCRETE });
  }
  // 壁の笠木と控え壁（外周を単調にしない）
  for (let i = -6; i <= 6; i++) {
    const t = i * 5.6;
    b.box({ x: WX + 0.5, y: 1.6, z: t, w: 0.7, h: 3.2, d: 0.8, mat: 'plaster', surface: SURFACE.CONCRETE });
    b.box({ x: EX - 0.5, y: 1.6, z: t, w: 0.7, h: 3.2, d: 0.8, mat: 'plaster', surface: SURFACE.CONCRETE });
  }
  // 南北の壁も、伸ばしたぶん控え壁を足す
  for (let i = -9; i <= 6; i++) {
    const t = i * 5.6;
    if (t > EX - 2) continue;
    b.box({ x: t, y: 1.6, z: -W + 0.5, w: 0.8, h: 3.2, d: 0.7, mat: 'plaster', surface: SURFACE.CONCRETE });
    b.box({ x: t, y: 1.6, z: W - 0.5, w: 0.8, h: 3.2, d: 0.7, mat: 'plaster', surface: SURFACE.CONCRETE });
  }

  /* ============ 中央: 主屋（2階建て） ============ */
  mainBuilding(b, 0, 0);

  /* ============ 西レーン: コンテナ置き場 ============ */
  containerYard(b, rand);

  /* ============ 東レーン: 市場通り ============ */
  marketStreet(b, rand);

  /* ============ 西の増築: 工事現場 ============ */
  constructionSite(b, rand);

  /* ============ 東西のスポーン建物 ============ */
  // A は東端、B は西端。互いに向かい合う
  spawnStructure(b, 52, 0, -Math.PI / 2, 'A');
  spawnStructure(b, -52, 0, Math.PI / 2, 'B');

  /* ============ 東の増築: 車両基地 ============ */
  motorPool(b, rand);

  /* ============ 南北に中立の構造物（横長の間延びを防ぐ） ============ */
  outpost(b, -22, 28, 0.15);
  outpost(b, 8, -29, -0.2);

  /* ============ 散在プロップ ============ */
  scatter(b, rand);

  /* ============ スポーン地点 ============ */
  // A は東端で西を向き、B は西端で東を向く
  for (let i = 0; i < 6; i++) {
    const dz = -6 + i * 2.4;
    b.spawn('A', 55 + (i % 2) * 2.0, 0, dz, -Math.PI / 2);
    b.spawn('B', -55 - (i % 2) * 2.0, 0, dz, Math.PI / 2);
  }

  /* ============ 目標地点 ============ */
  b.objective('A', -18.0, 0, -2.0, 4.2);   // コンテナ置き場（西寄り）
  b.objective('B', 0, 0, 0, 4.5);          // 中央広場
  b.objective('C', 20.0, 0, 3.0, 4.2);     // 市場（東寄り）
  b.objective('D', -46, 0, -6.0, 4.2);     // 工事現場の躯体
  b.objective('E', 42, 0, 2.0, 4.2);       // 車両基地

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

  // --- 屋内の床（部屋ごとに変える） ---
  b.box({ x: ox - 5.6, y: 0.075, z: oz + 3.2, w: 8.0, h: 0.03, d: 5.0, mat: 'woodFloor', surface: SURFACE.WOOD, collide: false });
  b.box({ x: ox + 4.8, y: 0.075, z: oz - 4.2, w: 5.4, h: 0.03, d: 3.4, mat: 'ceramicTile', surface: SURFACE.CONCRETE, collide: false });

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

  /* --- 外装のディテール ---
   * 漆喰の面だけだと、どこを見ても同じ壁に見えて位置が覚えられない。
   * 面ごとに「目印になるもの」を貼って、方角が分かるようにする。
   */
  // 南面: 貼り紙と落書き
  b.box({ x: ox - 5.0, y: 1.9, z: oz + hd + 0.18, w: 3.2, h: 2.2, d: 0.04, mat: 'posterWall', surface: SURFACE.CONCRETE, collide: false });
  // 塗り替えの跡（下地が出た部分）と、その上の看板
  b.box({ x: ox + 4.6, y: 1.5, z: oz + hd + 0.18, w: 3.6, h: 2.4, d: 0.04, mat: 'plasterCracked', surface: SURFACE.CONCRETE, collide: false });
  P.sign(b, { x: ox + 4.6, y: 2.95, z: oz + hd + 0.26, yaw: 0, w: 3.0, h: 0.8, mat: 'paintedMetalTan' });
  // 庇と物干し（生活感）
  b.box({ x: ox + 4.6, y: 3.45, z: oz + hd + 0.75, w: 3.8, h: 0.06, d: 1.3, rx: -0.16, mat: 'corrugated', surface: SURFACE.METAL, collide: false });
  for (const bx of [-1.6, 1.6]) {
    b.box({ x: ox + 4.6 + bx, y: 3.15, z: oz + hd + 0.45, w: 0.05, h: 0.05, d: 0.9, rx: 0.5, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  }
  P.clothesline(b, { x1: ox + 2.0, y: 4.9, z1: oz + hd + 0.4, x2: ox + 7.2, z2: oz + hd + 0.4, count: 4 });
  // 西面: 剥落した漆喰と配管
  b.box({ x: ox - hw - 0.18, y: 2.2, z: oz - 3.4, w: 0.04, h: 3.0, d: 5.0, mat: 'plasterCracked', surface: SURFACE.CONCRETE, collide: false });
  // 縦の配管（pipeRun は水平用なので、縦は円柱を直に積む）
  for (const py of [0.1]) {
    b.cylinder({ x: ox - hw - 0.28, y: py, z: oz + 4.6, radius: 0.075, height: H1 + H2 + 0.3, segments: 10, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  }
  for (const cy of [1.2, 3.4, 5.6]) {
    b.box({ x: ox - hw - 0.20, y: cy, z: oz + 4.6, w: 0.16, h: 0.1, d: 0.22, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }
  // 北面: 古レンガの補修跡
  b.box({ x: ox + 3.0, y: 1.6, z: oz - hd - 0.18, w: 4.2, h: 2.6, d: 0.04, mat: 'brickOld', surface: SURFACE.CONCRETE, collide: false });
  // 東面: 錆びた庇と看板
  b.box({ x: ox + hw + 0.5, y: 2.9, z: oz + 1.5, w: 1.1, h: 0.08, d: 5.0, mat: 'corrugated', surface: SURFACE.METAL, collide: false });
  for (const bz of [-0.6, 3.6]) {
    b.box({ x: ox + hw + 0.95, y: 2.5, z: oz + bz, w: 0.06, h: 0.85, d: 0.06, rz: 0.4, mat: 'rustHeavy', surface: SURFACE.METAL, collide: false });
  }
  P.sign(b, { x: ox + hw + 0.22, y: 3.4, z: oz - 3.5, yaw: Math.PI / 2, w: 2.6, h: 0.9, mat: 'paintedMetalTan' });
  // 屋上パラペットの水切り
  for (const [wx, wz, ww, wd] of [[ox - 4.2, oz, 7.4, 0.12]]) {
    b.box({ x: wx, y: H1 + H2 + 0.68, z: wz - D / 2 + 0.06, w: ww, h: 0.10, d: wd, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
    b.box({ x: wx, y: H1 + H2 + 0.68, z: wz + D / 2 - 0.06, w: ww, h: 0.10, d: wd, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  }
  // 雨樋（縦）
  for (const [gx, gz] of [[ox - hw + 0.35, oz + hd - 0.35], [ox + hw - 0.35, oz - hd + 0.35]]) {
    b.cylinder({ x: gx, y: 0.06, z: gz, radius: 0.06, height: H1 + H2 + 0.5, segments: 8, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
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

/**
 * 西の増築: 工事現場。
 *
 * 3 層まで組み上がった躯体を中心に据える。
 * 各層は柱と梁だけで壁が無いので、どの階にいても外から見え、
 * 高さを取る代わりに身を晒す、という選択になる。
 * 足場と資材の山が上り口を兼ねていて、階段以外の経路も残してある。
 */
function constructionSite(b, rand) {
  const R = (a, c) => a + rand() * (c - a);
  const CX = -46;                    // 躯体の中心
  const CZ = -6;

  /* ---- 造成された地面 ---- */
  b.box({ x: CX, y: 0.018, z: CZ, w: 26, h: 0.03, d: 40, mat: 'mud', surface: SURFACE.DIRT, collide: false });
  b.box({ x: CX + 8, y: 0.022, z: CZ + 14, w: 10, h: 0.03, d: 12, mat: 'gravel', surface: SURFACE.GRAVEL, collide: false });
  b.box({ x: CX - 6, y: 0.022, z: CZ - 17, w: 14, h: 0.03, d: 10, mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });

  /* ---- 仮囲い（既存エリアとの境。2 か所だけ開ける） ---- */
  P.chainFence(b, { x1: -33, z1: -35, x2: -33, z2: -14, h: 2.1, tarp: 'tarp' });
  P.chainFence(b, { x1: -33, z1: -8, x2: -33, z2: 6, h: 2.1, tarp: 'tarpGreen' });
  P.chainFence(b, { x1: -33, z1: 12, x2: -33, z2: 35, h: 2.1, tarp: 'tarp' });
  // 入口のゲート柱
  for (const gz of [-14, -8, 6, 12]) {
    b.box({ x: -33, y: 1.4, z: gz, w: 0.34, h: 2.8, d: 0.34, mat: 'galvanized', surface: SURFACE.METAL });
  }

  /* ================= 建設中の躯体 ================= */
  const BW = 15.0, BD = 18.0;        // 平面寸法
  const FH = 3.4;                    // 階高
  const hw = BW / 2, hd = BD / 2;
  const colXs = [-hw + 0.6, -hw / 3, hw / 3, hw - 0.6];
  const colZs = [-hd + 0.6, -hd / 3, hd / 3, hd - 0.6];

  // 基礎スラブ
  b.box({ x: CX, y: 0.12, z: CZ, w: BW + 1.2, h: 0.24, d: BD + 1.2, mat: 'concreteRaw', surface: SURFACE.CONCRETE });

  for (let f = 0; f < 3; f++) {
    const fy = 0.24 + f * FH;

    // 柱
    for (const lx of colXs) {
      for (const lz of colZs) {
        b.box({
          x: CX + lx, y: fy + FH / 2, z: CZ + lz,
          w: 0.52, h: FH, d: 0.52, mat: 'concreteRaw', surface: SURFACE.CONCRETE,
        });
      }
    }

    /*
     * 上階の床。
     * 最上階は打設途中ということにして、床を半分だけ張る。
     * 抜けている側は下の階が見えるので、上下の撃ち合いが生まれる。
     */
    const slabY = fy + FH;
    /*
     * 床は concreteFloor を使う。
     * concreteRaw は型枠の継ぎ目と P コン跡が入った「壁用」なので、
     * 水平面に貼ると床一面に穴が空いているように見えてしまう。
     */
    if (f < 2) {
      b.box({ x: CX, y: slabY + 0.11, z: CZ, w: BW, h: 0.22, d: BD, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
    } else {
      b.box({ x: CX - 3.6, y: slabY + 0.11, z: CZ, w: BW - 7.2, h: 0.22, d: BD, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
      // 打ちかけの型枠と支保工
      for (let i = 0; i < 5; i++) {
        const px = CX + 4.0 + (i % 3) * 2.2, pz = CZ - 6 + Math.floor(i / 3) * 6;
        b.cylinder({ x: px, y: fy, z: pz, radius: 0.045, height: FH, segments: 8, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
      }
      b.box({ x: CX + 5.2, y: slabY + 0.06, z: CZ - 3, w: 5.0, h: 0.06, d: 7.0, mat: 'formPly', surface: SURFACE.WOOD });
      // 配筋（打設前の鉄筋メッシュ）
      for (let i = 0; i < 9; i++) {
        b.box({ x: CX + 3.0 + i * 0.55, y: slabY + 0.14, z: CZ - 3, w: 0.018, h: 0.018, d: 6.8, mat: 'rebar', surface: SURFACE.METAL, collide: false });
      }
      for (let i = 0; i < 12; i++) {
        b.box({ x: CX + 5.2, y: slabY + 0.17, z: CZ - 6.2 + i * 0.55, w: 4.9, h: 0.018, d: 0.018, mat: 'rebar', surface: SURFACE.METAL, collide: false });
      }
    }

    // 外周の梁（腰高の遮蔽になる）
    for (const [x1, z1, x2, z2] of [
      [CX - hw, CZ - hd, CX + hw, CZ - hd], [CX - hw, CZ + hd, CX + hw, CZ + hd],
      [CX - hw, CZ - hd, CX - hw, CZ + hd], [CX + hw, CZ - hd, CX + hw, CZ + hd],
    ]) {
      b.wall({ x1, z1, x2, z2, h: 1.05, y: fy, thickness: 0.30, mat: 'concreteRaw', surface: SURFACE.CONCRETE });
    }

    // 階段（各階の南東角）
    b.stairs({
      x: CX + hw - 2.2, y: fy, z: CZ + hd - 1.0,
      width: 1.5, rise: FH / 16, run: 0.30, steps: 16, yaw: 0, mat: 'concreteRaw',
    });
    P.railing(b, {
      x1: CX + hw - 1.35, z1: CZ + hd - 1.0, x2: CX + hw - 1.35, z2: CZ + hd - 5.8,
      y: fy, height: 1.0,
    });

    // 開口部に張った養生シートと注意表示
    if (f > 0) {
      b.box({ x: CX - hw + 0.2, y: fy + 1.7, z: CZ + 3, w: 0.03, h: 1.5, d: 6.0, mat: 'tarp', surface: SURFACE.FABRIC, collide: false });
      b.box({ x: CX + 2, y: fy + 1.2, z: CZ - hd + 0.2, w: 1.2, h: 0.8, d: 0.04, mat: 'hazardStripe', surface: SURFACE.METAL, collide: false });
    }

    // 照明（仮設投光器）
    if (f < 2) {
      b.light({ x: CX - 4, y: fy + FH - 0.5, z: CZ - 4, color: 0xfff0cc, intensity: 6, distance: 11 });
    }

    /*
     * 各階の遮蔽。
     * 柱だけだとどの階も同じ見え方になり、上を取る意味しか残らない。
     * 階ごとに置くものを変えて、階段を上がるたびに景色が変わるようにする。
     */
    const fl = fy + (f < 2 ? 0.0 : 0.0);
    if (f === 0) {
      P.blockPallet(b, { x: CX - 4.5, y: fl, z: CZ - 5.0, yaw: 0.1, rows: 5 });
      P.formworkStack(b, { x: CX + 2.0, y: fl, z: CZ + 4.5, yaw: 1.2, count: 8 });
      P.woodCrate(b, { x: CX - 1.0, y: fl, z: CZ + 6.5, yaw: 0.4 });
      P.woodCrate(b, { x: CX - 1.6, y: fl + 0.72, z: CZ + 6.2, yaw: -0.2, size: 0.7 });
      P.barrel(b, { x: CX + 5.4, y: fl, z: CZ - 6.5, mat: 'rustedMetal' });
      P.barrel(b, { x: CX + 4.6, y: fl, z: CZ - 7.1, mat: 'paintedMetal' });
    } else if (f === 1) {
      P.sandbagStack(b, { x: CX - 3.0, y: fl, z: CZ - 6.5, yaw: 0, rows: 3, perRow: 5, length: 3.0 });
      P.formworkStack(b, { x: CX + 3.5, y: fl, z: CZ + 2.0, yaw: 0.3, count: 5 });
      P.rebarBundle(b, { x: CX - 5.0, y: fl, z: CZ + 5.0, yaw: 1.4, count: 6, length: 3.6 });
      P.cardboardStack(b, { x: CX + 1.0, y: fl, z: CZ - 2.0, yaw: 0.6, count: 3 });
      // 仕切りの単管とシート（視線を切る）
      b.box({ x: CX - 1.0, y: fl + 1.1, z: CZ + 0.5, w: 0.04, h: 2.2, d: 5.0, mat: 'tarpGreen', surface: SURFACE.FABRIC, collide: false });
      b.cylinder({ x: CX - 1.0, y: fl, z: CZ - 2.0, radius: 0.03, height: 2.3, segments: 8, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
      b.cylinder({ x: CX - 1.0, y: fl, z: CZ + 3.0, radius: 0.03, height: 2.3, segments: 8, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    } else {
      P.blockPallet(b, { x: CX - 6.0, y: fl, z: CZ + 6.0, yaw: 0.2, rows: 3 });
      P.woodCrate(b, { x: CX - 7.5, y: fl, z: CZ - 4.0, yaw: 0.15 });
      P.barrel(b, { x: CX - 4.0, y: fl, z: CZ - 7.0, mat: 'plasticYellow' });
      P.tireStack(b, { x: CX - 8.0, y: fl, z: CZ + 1.5, count: 2 });
    }
  }

  /* ---- 外部足場（北面と西面） ---- */
  P.scaffold(b, { x: CX, y: 0.24, z: CZ - hd - 1.1, yaw: Math.PI / 2, length: 14.0, levels: 3, levelH: 3.4, depth: 1.3 });
  P.scaffold(b, { x: CX - hw - 1.1, y: 0.24, z: CZ + 2, yaw: 0, length: 12.0, levels: 2, levelH: 3.4, depth: 1.3 });

  /* ---- タワークレーンの基部 ---- */
  b.box({ x: CX + 11.5, y: 0.35, z: CZ - 12, w: 4.2, h: 0.7, d: 4.2, mat: 'concreteRaw', surface: SURFACE.CONCRETE });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box({
      x: CX + 11.5 + sx * 0.75, y: 6.0, z: CZ - 12 + sz * 0.75,
      w: 0.16, h: 11.0, d: 0.16, mat: 'hazardStripe', surface: SURFACE.METAL,
    });
  }
  /*
   * ラチス。
   * 水平材だけでなく、面ごとに向きを互い違いにした斜材を入れる。
   * これが無いとただの四角い枠が積み上がっているだけに見える。
   */
  for (let i = 0; i < 9; i++) {
    const ly = 1.2 + i * 1.2;
    // 水平材
    for (const [ax, az, dxs, dzs] of [
      [0, -0.75, 1.5, 0.06], [0, 0.75, 1.5, 0.06],
      [-0.75, 0, 0.06, 1.5], [0.75, 0, 0.06, 1.5],
    ]) {
      b.box({
        x: CX + 11.5 + ax, y: ly, z: CZ - 12 + az,
        w: dxs, h: 0.06, d: dzs, mat: 'galvanized', surface: SURFACE.METAL, collide: false,
      });
    }
    // 斜材（1 段ごとに傾きを反転させる）
    const tilt = (i % 2 ? 1 : -1) * 0.675;
    for (const [sx, sz] of [[0, -0.75], [0, 0.75]]) {
      b.box({
        x: CX + 11.5 + sx, y: ly + 0.6, z: CZ - 12 + sz,
        w: 1.62, h: 0.05, d: 0.05, rz: tilt, mat: 'galvanized', surface: SURFACE.METAL, collide: false,
      });
    }
    for (const [sx, sz] of [[-0.75, 0], [0.75, 0]]) {
      b.box({
        x: CX + 11.5 + sx, y: ly + 0.6, z: CZ - 12 + sz,
        w: 0.05, h: 0.05, d: 1.62, rx: -tilt, mat: 'galvanized', surface: SURFACE.METAL, collide: false,
      });
    }
  }
  /*
   * ジブ（腕）を伸ばして、遠目にもクレーンだと分かるようにする。
   * 判定を持たせるのは、鉄骨の腕を弾がすり抜けるのは不自然なため。
   * 高さ 12.4m なので歩行の妨げにはならない。
   */
  b.box({ x: CX + 5.0, y: 12.4, z: CZ - 12, w: 13.5, h: 0.5, d: 0.5, mat: 'hazardStripe', surface: SURFACE.METAL });
  b.box({ x: CX + 15.5, y: 12.4, z: CZ - 12, w: 5.0, h: 0.4, d: 0.4, mat: 'hazardStripe', surface: SURFACE.METAL });
  b.box({ x: CX + 11.5, y: 13.6, z: CZ - 12, w: 0.3, h: 2.0, d: 0.3, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  // 吊りワイヤとフック
  b.box({ x: CX + 1.5, y: 9.6, z: CZ - 12, w: 0.05, h: 5.2, d: 0.05, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: CX + 1.5, y: 7.0, z: CZ - 12, w: 0.34, h: 0.5, d: 0.34, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });

  /* ---- 資材置き場 ---- */
  P.formworkStack(b, { x: CX - 10, y: 0, z: CZ + 12, yaw: 0.2, count: 9 });
  P.formworkStack(b, { x: CX - 8.2, y: 0, z: CZ + 13.4, yaw: -0.15, count: 6 });
  P.blockPallet(b, { x: CX - 4.5, y: 0, z: CZ + 12.5, yaw: 0.1, rows: 4 });
  P.blockPallet(b, { x: CX - 2.8, y: 0, z: CZ + 13.8, yaw: 0.5, rows: 2 });
  P.rebarBundle(b, { x: CX - 12, y: 0, z: CZ + 6, yaw: 0.15, count: 12, length: 5.0 });
  P.rebarBundle(b, { x: CX - 12.6, y: 0.14, z: CZ + 6.4, yaw: 0.1, count: 9, length: 4.4 });
  P.aggregatePile(b, { x: CX + 9, y: 0, z: CZ + 13, radius: 2.6, height: 1.5, mat: 'gravel' });
  P.aggregatePile(b, { x: CX + 13, y: 0, z: CZ + 9.5, radius: 2.2, height: 1.2, mat: 'sand' });

  /* ---- 現場事務所と付帯 ---- */
  P.siteOffice(b, { x: CX + 10.5, y: 0, z: CZ + 2.5, yaw: -Math.PI / 2 });
  P.container(b, { x: CX + 10.0, y: 0, z: CZ + 7.5, yaw: Math.PI / 2 + 0.05, mat: 'paintedMetalTan' });
  P.barrel(b, { x: CX + 6.8, y: 0, z: CZ + 9.0, mat: 'rustedMetal' });
  P.barrel(b, { x: CX + 7.4, y: 0, z: CZ + 9.6, mat: 'paintedMetal' });
  P.jerryCan(b, { x: CX + 6.2, y: 0, z: CZ + 8.4, yaw: 0.4 });

  /* ---- 南の進入路。遮蔽が無いと現場へ近づけない ---- */
  // 正面を塞がないよう、進入路の左右へ振り分ける
  P.container(b, { x: CX - 9.5, y: 0, z: CZ + 18.5, yaw: 0.12, mat: 'corrugated' });
  P.container(b, { x: CX + 7.5, y: 0, z: CZ + 21.0, yaw: Math.PI / 2 + 0.08, mat: 'paintedMetalTan' });
  P.container(b, { x: CX - 7.0, y: 2.59, z: CZ + 18.5, yaw: -0.06, mat: 'paintedMetalTan' });
  P.sandbagStack(b, { x: CX + 5.0, y: 0, z: CZ + 18.0, yaw: 0.1, rows: 3, perRow: 6, length: 3.6 });
  P.aggregatePile(b, { x: CX - 13.0, y: 0, z: CZ + 16.0, radius: 2.4, height: 1.4, mat: 'dirt' });
  P.formworkStack(b, { x: CX + 9.5, y: 0, z: CZ + 17.5, yaw: 1.1, count: 10 });
  P.rubble(b, { x: CX - 6, y: 0, z: CZ + 16, radius: 2.6, count: 10 });
  P.tireStack(b, { x: CX + 2.5, y: 0, z: CZ + 15.0, count: 4 });

  /* ---- バリケードとコーン（動線を作る） ---- */
  P.siteBarrier(b, { x1: CX - 2, z1: CZ + 16.5, x2: CX + 6, z2: CZ + 16.5 });
  P.siteBarrier(b, { x1: CX + 15.5, z1: CZ - 4, x2: CX + 15.5, z2: CZ + 4, cones: false });

  /* ---- 重機（トラックを流用した資材運搬車） ---- */
  P.vehicle(b, { x: CX + 6.5, y: 0, z: CZ - 14.5, yaw: 0.35, type: 'truck', mat: 'plasticYellow' });

  /* ---- 端の詰め物 ---- */
  P.tireStack(b, { x: CX - 13.5, y: 0, z: CZ - 12, count: 3 });
  P.cardboardStack(b, { x: CX + 12.5, y: 0, z: CZ - 2.0, yaw: 0.3, count: 2 });
  P.rubble(b, { x: CX - 9, y: 0, z: CZ - 15, radius: 3.0, count: 12 });
  P.rubble(b, { x: CX + 2, y: 0, z: CZ + 17, radius: 2.4, count: 8 });
  for (let i = 0; i < 7; i++) {
    P.litter(b, { x: CX + R(-12, 12), y: 0, z: CZ + R(-17, 17), count: 4 });
  }

  /* ---- 投光器（夜間工事の名残） ---- */
  for (const [lx, lz] of [[-13, -8], [12, -8], [0, 16]]) {
    b.cylinder({ x: CX + lx, y: 0, z: CZ + lz, radius: 0.07, height: 5.2, segments: 8, mat: 'galvanized', surface: SURFACE.METAL });
    const head = new THREE.BoxGeometry(0.6, 0.34, 0.22);
    const m = new THREE.Mesh(head, b.mats.emissive(0xfff4d4, 3.2));
    m.position.set(CX + lx, 5.3, CZ + lz);
    b.addExtra(m);
    b.light({ x: CX + lx, y: 5.0, z: CZ + lz, color: 0xfff2d8, intensity: 8, distance: 16 });
  }

}

/**
 * 東の増築: 車両基地。
 *
 * 工事現場（西）と釣り合う規模の拠点を東に置く。
 * 整備場の大屋根・給油所・給水塔の 3 つで高さを作り、
 * どれも上に登れるようにして、東側にも高所の取り合いを用意する。
 */
function motorPool(b, rand) {
  const R = (a, c) => a + rand() * (c - a);
  const CX = 44, CZ = 0;

  /* ---- 舗装 ---- */
  b.box({ x: CX, y: 0.018, z: CZ, w: 30, h: 0.03, d: 44, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  b.box({ x: CX - 8, y: 0.022, z: CZ - 16, w: 12, h: 0.03, d: 10, mat: 'gravel', surface: SURFACE.GRAVEL, collide: false });
  // 油染みは車が停まる場所だけ。全面に敷くと路面が濡れているように光る
  for (const [ox2, oz2, ow, od] of [[-1.5, -3.2, 4.0, 6.0], [1.0, 6.5, 3.4, 4.6], [-13, 5.5, 3.0, 5.0], [-13, 11.5, 3.4, 5.6]]) {
    b.box({ x: CX + ox2, y: 0.024, z: CZ + oz2, w: ow, h: 0.03, d: od, mat: 'oilStain', surface: SURFACE.CONCRETE, collide: false });
  }

  /* ---- 整備場（柱と大屋根。壁は 2 面だけ） ---- */
  const GW = 16, GD = 13, GH = 5.0;
  b.floor({ x: CX, y: 0.06, z: CZ, w: GW, d: GD, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
  for (const lx of [-GW / 2 + 0.6, 0, GW / 2 - 0.6]) {
    for (const lz of [-GD / 2 + 0.6, GD / 2 - 0.6]) {
      b.box({ x: CX + lx, y: GH / 2, z: CZ + lz, w: 0.5, h: GH, d: 0.5, mat: 'concrete', surface: SURFACE.CONCRETE });
    }
  }
  // 折板の大屋根（登れる）
  b.box({ x: CX, y: GH + 0.22, z: CZ, w: GW + 1.6, h: 0.44, d: GD + 1.6, mat: 'metalRoof', surface: SURFACE.METAL });
  // 東と北の壁（西と南は開けて通り抜けられる）
  b.wallWithGap({
    x1: CX + GW / 2, z1: CZ - GD / 2, x2: CX + GW / 2, z2: CZ + GD / 2, h: GH,
    gapStart: GD / 2 - 1.6, gapWidth: 3.2, gapTop: 3.4,
    mat: 'sidingMetal', surface: SURFACE.METAL, thickness: 0.3,
  });
  b.wall({ x1: CX - GW / 2, z1: CZ - GD / 2, x2: CX + GW / 2, z2: CZ - GD / 2, h: GH, mat: 'sidingMetal', thickness: 0.3, surface: SURFACE.METAL });
  // 屋上の胸壁と設備
  for (const [x1, z1, x2, z2] of [
    [CX - GW / 2, CZ - GD / 2, CX + GW / 2, CZ - GD / 2],
    [CX - GW / 2, CZ + GD / 2, CX + GW / 2, CZ + GD / 2],
  ]) {
    b.wall({ x1, z1, x2, z2, h: 0.9, y: GH + 0.44, mat: 'corrugated', thickness: 0.22, surface: SURFACE.METAL });
  }
  P.acUnit(b, { x: CX + 4.5, y: GH + 0.44, z: CZ - 3.0, yaw: 0.2 });
  b.box({ x: CX - 3.5, y: GH + 0.60, z: CZ + 2.0, w: 3.4, h: 0.08, d: 2.2, rx: -0.18, mat: 'solarPanel', surface: SURFACE.GLASS, collide: false });
  // 屋根に上がる外階段
  b.stairs({ x: CX - GW / 2 - 1.3, y: 0, z: CZ + 4.0, width: 1.2, rise: 0.24, run: 0.28, steps: 23, yaw: 0, mat: 'expandedMetal', surface: SURFACE.METAL });
  P.railing(b, { x1: CX - GW / 2 - 0.65, z1: CZ + 4.0, x2: CX - GW / 2 - 0.65, z2: CZ - 2.5, y: 0, height: 1.0 });

  // 整備場の中身
  b.box({ x: CX + 2.0, y: 0.55, z: CZ + 3.0, w: 3.2, h: 1.0, d: 1.0, mat: 'stainless', surface: SURFACE.METAL });   // 作業台
  b.box({ x: CX + 2.0, y: 1.12, z: CZ + 3.0, w: 3.0, h: 0.14, d: 0.9, mat: 'perforatedMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: CX + 5.5, y: 1.4, z: CZ - 2.0, w: 0.3, h: 2.6, d: 3.0, mat: 'perforatedMetal', surface: SURFACE.METAL, collide: false });  // 工具板
  P.barrel(b, { x: CX - 5.0, y: 0.06, z: CZ - 4.0, mat: 'rustedMetal' });
  P.barrel(b, { x: CX - 5.8, y: 0.06, z: CZ - 4.6, mat: 'paintedMetal' });
  P.tireStack(b, { x: CX - 6.2, y: 0.06, z: CZ + 3.5, count: 4 });
  P.tireStack(b, { x: CX - 5.0, y: 0.06, z: CZ + 4.6, count: 2 });
  P.woodCrate(b, { x: CX + 6.0, y: 0.06, z: CZ + 4.5, yaw: 0.3 });
  P.pallet(b, { x: CX + 4.4, y: 0.06, z: CZ + 5.2, yaw: 0.8 });
  b.light({ x: CX, y: GH - 0.6, z: CZ, color: 0xfff0d0, intensity: 9, distance: 15 });
  b.light({ x: CX + 5, y: GH - 0.8, z: CZ + 4, color: 0xffe8c0, intensity: 5, distance: 9 });

  // 整備中の車両（片側を持ち上げてある）
  P.vehicle(b, { x: CX - 1.5, y: 0, z: CZ - 3.2, yaw: 0.06, type: 'truck', mat: 'paintedMetalTan' });
  P.vehicle(b, { x: CX + 1.0, y: 0, z: CZ + 6.5, yaw: -1.55, type: 'car', mat: 'plasticGlossRed' });

  /* ---- 給油所 ---- */
  const FX = CX - 11, FZ = CZ - 13;
  b.box({ x: FX, y: 0.09, z: FZ, w: 9, h: 0.18, d: 7, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
  for (const sx of [-1, 1]) {
    b.cylinder({ x: FX + sx * 3.4, y: 0.18, z: FZ - 2.4, radius: 0.16, height: 3.6, segments: 10, mat: 'paintedMetal', surface: SURFACE.METAL });
    b.cylinder({ x: FX + sx * 3.4, y: 0.18, z: FZ + 2.4, radius: 0.16, height: 3.6, segments: 10, mat: 'paintedMetal', surface: SURFACE.METAL });
  }
  b.box({ x: FX, y: 3.95, z: FZ, w: 8.4, h: 0.35, d: 6.4, mat: 'metalRoof', surface: SURFACE.METAL });
  b.box({ x: FX, y: 4.25, z: FZ - 3.3, w: 8.4, h: 0.5, d: 0.2, mat: 'plasticGlossRed', surface: SURFACE.METAL, collide: false });
  // 計量機
  for (const sx of [-1, 1]) {
    b.box({ x: FX + sx * 1.6, y: 0.75, z: FZ, w: 0.7, h: 1.3, d: 1.1, mat: 'plasticGloss', surface: SURFACE.METAL });
    b.box({ x: FX + sx * 1.6, y: 1.25, z: FZ + 0.58, w: 0.45, h: 0.35, d: 0.05, mat: 'screenPanel', surface: SURFACE.GLASS, collide: false });
  }
  P.jerryCan(b, { x: FX + 3.0, y: 0.18, z: FZ + 2.0, yaw: 0.5 });
  P.jerryCan(b, { x: FX + 3.4, y: 0.18, z: FZ + 2.5, yaw: -0.3 });
  b.light({ x: FX, y: 3.7, z: FZ, color: 0xe8f4ff, intensity: 7, distance: 12 });

  /* ---- 給水塔（東側の高所） ---- */
  const TX = CX + 11, TZ = CZ + 13;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box({ x: TX + sx * 1.6, y: 3.4, z: TZ + sz * 1.6, w: 0.24, h: 6.8, d: 0.24, mat: 'galvanized', surface: SURFACE.METAL });
  }
  for (const ly of [2.2, 4.6]) {
    for (const [ax, az, ww, dd] of [[0, -1.6, 3.2, 0.1], [0, 1.6, 3.2, 0.1], [-1.6, 0, 0.1, 3.2], [1.6, 0, 0.1, 3.2]]) {
      b.box({ x: TX + ax, y: ly, z: TZ + az, w: ww, h: 0.1, d: dd, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
  }
  b.box({ x: TX, y: 6.95, z: TZ, w: 4.6, h: 0.3, d: 4.6, mat: 'expandedMetal', surface: SURFACE.METAL });
  b.cylinder({ x: TX, y: 7.1, z: TZ, radius: 1.9, height: 3.2, segments: 16, mat: 'rustHeavy', surface: SURFACE.METAL });
  b.cylinder({ x: TX, y: 10.3, z: TZ, radius: 1.95, height: 0.2, segments: 16, mat: 'corrugated', surface: SURFACE.METAL, collide: false });
  P.railing(b, { x1: TX - 2.3, z1: TZ - 2.3, x2: TX + 2.3, z2: TZ - 2.3, y: 7.25, height: 1.0 });
  P.railing(b, { x1: TX - 2.3, z1: TZ + 2.3, x2: TX + 2.3, z2: TZ + 2.3, y: 7.25, height: 1.0 });
  // 昇降ばしご代わりの箱段
  b.box({ x: TX - 3.2, y: 0.7, z: TZ - 1.0, w: 1.4, h: 1.4, d: 1.4, mat: 'concreteBlock', surface: SURFACE.CONCRETE });
  b.box({ x: TX - 3.2, y: 2.2, z: TZ + 0.6, w: 1.4, h: 4.4, d: 1.4, mat: 'concreteBlock', surface: SURFACE.CONCRETE });
  b.box({ x: TX - 1.6, y: 4.9, z: TZ + 1.4, w: 1.6, h: 0.2, d: 2.0, mat: 'expandedMetal', surface: SURFACE.METAL });
  b.stairs({ x: TX - 1.0, y: 5.0, z: TZ + 2.2, width: 1.2, rise: 0.25, run: 0.28, steps: 8, yaw: 0, mat: 'expandedMetal', surface: SURFACE.METAL });

  /* ---- 駐車帯と遮蔽 ---- */
  for (let i = 0; i < 4; i++) {
    b.box({ x: CX - 13, y: 0.019, z: CZ + 4 + i * 3.0, w: 5.5, h: 0.03, d: 0.12, mat: 'plasticGloss', surface: SURFACE.CONCRETE, collide: false });
  }
  P.vehicle(b, { x: CX - 13, y: 0, z: CZ + 5.5, yaw: Math.PI / 2 + 0.04, type: 'car', mat: 'paintedMetal' });
  P.vehicle(b, { x: CX - 13, y: 0, z: CZ + 11.5, yaw: Math.PI / 2 - 0.03, type: 'truck', mat: 'rustedMetal' });
  P.container(b, { x: CX + 12, y: 0, z: CZ - 8, yaw: 0.05, mat: 'paintedMetalTan' });
  P.container(b, { x: CX + 12, y: 2.59, z: CZ - 8, yaw: -0.04, mat: 'corrugated' });
  P.sandbagStack(b, { x: CX - 2, y: 0, z: CZ + 16, yaw: 0, rows: 3, perRow: 6, length: 3.6 });
  P.chainFence(b, { x1: CX + 15.5, z1: CZ - 20, x2: CX + 15.5, z2: CZ + 20, h: 2.2 });
  P.rubble(b, { x: CX - 9, y: 0, z: CZ + 17, radius: 2.6, count: 9 });
  for (let i = 0; i < 6; i++) P.litter(b, { x: CX + R(-13, 13), y: 0, z: CZ + R(-19, 19), count: 4 });
  P.streetLight(b, { x: CX - 14, y: 0, z: CZ - 6, yaw: 0.2 });
  P.streetLight(b, { x: CX + 8, y: 0, z: CZ + 18, yaw: -1.4 });
}

/**
 * 中立の小拠点。
 * 横長にしたぶん南北が間延びするので、通り道に小さな足場を置く。
 * 屋根に上がれば隣のレーンが見渡せる、程度の高さに留める。
 */
function outpost(b, ox, oz, yaw) {
  const W = 7.5, D = 6.0, H = 3.0;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const tx = (lx, lz) => ox + c * lx + s * lz;
  const tz = (lx, lz) => oz - s * lx + c * lz;

  b.floor({ x: ox, y: 0.05, z: oz, w: W, d: D, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
  // 3 面の壁（1 面は開口）
  b.wallWithGap({
    x1: tx(-W / 2, -D / 2), z1: tz(-W / 2, -D / 2), x2: tx(W / 2, -D / 2), z2: tz(W / 2, -D / 2), h: H,
    gapStart: W / 2 - 1.0, gapWidth: 2.0, gapTop: 2.3,
    mat: 'concreteBlock', surface: SURFACE.CONCRETE, thickness: 0.3,
  });
  b.wallWithGap({
    x1: tx(-W / 2, D / 2), z1: tz(-W / 2, D / 2), x2: tx(W / 2, D / 2), z2: tz(W / 2, D / 2), h: H,
    gapStart: 1.2, gapWidth: 1.6, gapBottom: 1.0, gapTop: 2.4,
    mat: 'concreteBlock', surface: SURFACE.CONCRETE, thickness: 0.3,
  });
  b.wall({ x1: tx(-W / 2, -D / 2), z1: tz(-W / 2, -D / 2), x2: tx(-W / 2, D / 2), z2: tz(-W / 2, D / 2), h: H, mat: 'concreteBlock', thickness: 0.3, surface: SURFACE.CONCRETE });
  // 屋根（登れる）と胸壁
  b.box({ x: ox, y: H + 0.15, z: oz, w: W + 0.6, h: 0.3, d: D + 0.6, yaw, mat: 'concrete', surface: SURFACE.CONCRETE });
  for (const [x1, z1, x2, z2] of [
    [tx(-W / 2, -D / 2), tz(-W / 2, -D / 2), tx(W / 2, -D / 2), tz(W / 2, -D / 2)],
    [tx(-W / 2, D / 2), tz(-W / 2, D / 2), tx(W / 2, D / 2), tz(W / 2, D / 2)],
  ]) {
    b.wall({ x1, z1, x2, z2, h: 0.85, y: H + 0.3, mat: 'concreteBlock', thickness: 0.24, surface: SURFACE.CONCRETE });
  }
  // 上がるための土嚢と箱
  P.sandbagStack(b, { x: tx(W / 2 + 1.2, -1.0), y: 0, z: tz(W / 2 + 1.2, -1.0), yaw, rows: 4, perRow: 4, length: 2.4 });
  b.box({ x: tx(W / 2 + 1.2, 1.6), y: 1.35, z: tz(W / 2 + 1.2, 1.6), w: 1.4, h: 2.7, d: 1.4, yaw, mat: 'plywood', surface: SURFACE.WOOD });
  // 中身
  P.ammoCrate(b, { x: tx(-1.5, 0), y: 0.05, z: tz(-1.5, 0), yaw });
  P.barrel(b, { x: tx(2.2, -1.4), y: 0.05, z: tz(2.2, -1.4), mat: 'rustedMetal' });
  b.light({ x: ox, y: H - 0.5, z: oz, color: 0xffd8a8, intensity: 5, distance: 8 });
  P.rooftopClutter(b, { x: tx(1.8, 1.2), y: H + 0.3, z: tz(1.8, 1.2), yaw });
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
  /*
   * 通り沿いの店舗。
   * 4 棟すべてが同じ作りだと、通りのどこにいるのか分からなくなる。
   * 外壁・庇・1 階の顔（シャッター / 開口 / 貼り紙）を棟ごとに変えて、
   * 遠目でも「何番目の建物か」が読めるようにする。
   */
  const shops = [
    { x: 24, z: -14, w: 9, d: 8, h: 3.4, mat: 'brickOld', face: 'shutter', awn: 'awningFabric' },
    { x: 24, z: -2, w: 9, d: 10, h: 4.2, mat: 'brickOldGrey', face: 'poster', awn: 'awningGreen' },
    { x: 24, z: 12, w: 9, d: 9, h: 3.6, mat: 'stuccoRough', face: 'window', awn: 'awningFabric' },
    { x: 13, z: -20, w: 8, d: 7, h: 3.4, mat: 'plasterCracked', face: 'shutter', awn: 'awningGreen' },
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

    /* ---- 通り側（西面）の顔つき ---- */
    const fx = s.x - hw - 0.19;
    // 庇
    b.box({ x: fx - 0.75, y: 2.75, z: s.z, w: 1.6, h: 0.06, d: s.d * 0.9, rz: 0.14, mat: s.awn, surface: SURFACE.FABRIC, collide: false });
    for (const bz of [-s.d * 0.38, s.d * 0.38]) {
      b.box({ x: fx - 1.45, y: 2.2, z: s.z + bz, w: 0.05, h: 1.15, d: 0.05, rz: -0.3, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    // 1 階の顔
    if (s.face === 'shutter') {
      b.box({ x: fx, y: 1.25, z: s.z - s.d * 0.26, w: 0.05, h: 2.45, d: s.d * 0.4, mat: 'shutter', surface: SURFACE.METAL, collide: false });
    } else if (s.face === 'poster') {
      b.box({ x: fx, y: 1.6, z: s.z - s.d * 0.28, w: 0.05, h: 2.2, d: s.d * 0.36, mat: 'posterWall', surface: SURFACE.CONCRETE, collide: false });
    } else {
      // ショーウィンドウ（枠 + ガラス + 中の棚）
      b.box({ x: fx, y: 1.55, z: s.z - s.d * 0.26, w: 0.06, h: 2.1, d: s.d * 0.42, mat: 'anodized', surface: SURFACE.METAL, collide: false });
      const wg = new THREE.BoxGeometry(0.03, 1.85, s.d * 0.36);
      const wm = new THREE.Mesh(wg, b.mats.glass({ opacity: 0.3, transmission: 0.88 }));
      wm.position.set(fx - 0.02, 1.6, s.z - s.d * 0.26);
      b.addExtra(wm);
      for (const shy of [1.05, 1.75]) {
        b.box({ x: fx + 0.34, y: shy, z: s.z - s.d * 0.26, w: 0.55, h: 0.04, d: s.d * 0.34, mat: 'scaffoldPlank', surface: SURFACE.WOOD, collide: false });
      }
    }
    // 看板（軒下に吊る）
    P.sign(b, { x: fx - 0.35, y: 3.15, z: s.z + s.d * 0.2, yaw: Math.PI / 2, w: 2.2, h: 0.7, mat: 'plasticGlossRed' });
    // 空調の室外機と配管（外壁の情報量）
    b.box({ x: s.x + hw + 0.22, y: 1.5, z: s.z - s.d * 0.3, w: 0.06, h: 0.9, d: 0.7, mat: 'anodized', surface: SURFACE.METAL, collide: false });
    b.cylinder({ x: s.x + hw + 0.26, y: 0.05, z: s.z + s.d * 0.32, radius: 0.06, height: s.h, segments: 8, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
    // 窓（東面）にガラス
    const gg = new THREE.BoxGeometry(0.03, 1.0, 1.5);
    const gm = new THREE.Mesh(gg, b.mats.glass({ opacity: 0.35, transmission: 0.85 }));
    gm.position.set(s.x + hw - 0.02, 1.9, s.z + s.d * 0.1);
    b.addExtra(gm);
  }

  // 屋上へ上がる外階段
  b.stairs({ x: 18.6, y: 0, z: -6.4, width: 1.5, rise: 0.21, run: 0.29, steps: 17, yaw: 0, mat: 'concrete' });
  P.railing(b, { x1: 19.4, z1: -6.4, x2: 19.4, z2: -11.4, y: 0, height: 1.0 });
  b.box({ x: 19.6, y: 3.65, z: -12.0, w: 3.0, h: 0.3, d: 2.4, mat: 'concrete', surface: SURFACE.CONCRETE });

  // 屋台の列
  for (let i = 0; i < 5; i++) {
    const z = -12 + i * 6.2;
    P.marketStall(b, { x: 15.5, y: 0, z, yaw: -Math.PI / 2, cloth: i % 2 ? 'awningFabric' : 'awningGreen' });
  }
  // 反対側にもいくつか
  P.marketStall(b, { x: 10.5, y: 0, z: -4, yaw: Math.PI / 2 });
  P.marketStall(b, { x: 10.5, y: 0, z: 8, yaw: Math.PI / 2, cloth: 'awningGreen' });

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

  /* ---- 拠点らしい造作 ----
   * 以前は「柱と屋根と奥の壁」だけで、どちらのスポーンも
   * 見分けが付かなかった。運用の跡を足して陣地に見せる。
   */
  // 屋根の上（登れる高所。両脇のコンテナから上がる）
  b.box({ x: tx(0, -D / 2 - 0.9), y: H + 0.95, z: tz(0, -D / 2 - 0.9), w: W + 1.0, h: 1.1, d: 0.3, yaw, mat: 'corrugated', surface: SURFACE.METAL });
  P.sandbagStack(b, { x: tx(-4.0, -D / 2 + 0.6), y: H + 0.38, z: tz(-4.0, -D / 2 + 0.6), yaw, rows: 2, perRow: 5, length: 3.0 });
  P.sandbagStack(b, { x: tx(4.0, -D / 2 + 0.6), y: H + 0.38, z: tz(4.0, -D / 2 + 0.6), yaw, rows: 2, perRow: 5, length: 3.0 });
  P.rooftopClutter(b, { x: tx(7.0, 1.0), y: H + 0.38, z: tz(7.0, 1.0), yaw });
  // 屋根に上がる外階段
  b.stairs({ x: tx(W / 2 + 1.2, 2.4), y: 0, z: tz(W / 2 + 1.2, 2.4), width: 1.2, rise: 0.22, run: 0.28, steps: 18, yaw: yaw + Math.PI, mat: 'expandedMetal', surface: SURFACE.METAL });
  P.railing(b, { x1: tx(W / 2 + 1.85, 2.4), z1: tz(W / 2 + 1.85, 2.4), x2: tx(W / 2 + 1.85, -2.6), z2: tz(W / 2 + 1.85, -2.6), y: 0, height: 1.0 });

  // 奥の壁に地図と装備棚
  b.box({ x: tx(-4.5, -D / 2 + 0.2), y: 1.9, z: tz(-4.5, -D / 2 + 0.2), w: 2.4, h: 1.5, d: 0.05, yaw, mat: 'paperPrint', surface: SURFACE.WOOD, collide: false });
  b.box({ x: tx(1.5, -D / 2 + 0.35), y: 1.05, z: tz(1.5, -D / 2 + 0.35), w: 3.2, h: 0.06, d: 0.5, yaw, mat: 'expandedMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: tx(1.5, -D / 2 + 0.35), y: 1.75, z: tz(1.5, -D / 2 + 0.35), w: 3.2, h: 0.06, d: 0.5, yaw, mat: 'expandedMetal', surface: SURFACE.METAL, collide: false });
  for (let i = 0; i < 4; i++) {
    b.box({ x: tx(0.3 + i * 0.8, -D / 2 + 0.35), y: 1.35, z: tz(0.3 + i * 0.8, -D / 2 + 0.35), w: 0.5, h: 0.5, d: 0.4, yaw, mat: 'cordura', surface: SURFACE.FABRIC, collide: false });
  }
  // 発電機と配線
  b.box({ x: tx(-8.0, -1.8), y: 0.45, z: tz(-8.0, -1.8), w: 1.5, h: 0.8, d: 0.9, yaw, mat: 'plasticYellow', surface: SURFACE.METAL });
  b.cylinder({ x: tx(-8.4, -1.8), y: 0.85, z: tz(-8.4, -1.8), radius: 0.055, height: 0.7, segments: 8, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: tx(-6.0, -1.6), y: 0.04, z: tz(-6.0, -1.6), w: 4.0, h: 0.03, d: 0.06, yaw, mat: 'rubber', surface: SURFACE.RUBBER, collide: false });

  // 天井から下がる配線と裸電球
  for (const lx of [-5.5, 0, 5.5]) {
    b.box({ x: tx(lx, 0), y: H - 0.35, z: tz(lx, 0), w: 0.02, h: 0.5, d: 0.02, yaw, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }

  // 陣営色の旗
  b.cylinder({ x: tx(-W / 2 - 0.8, -D / 2 - 0.6), y: 0, z: tz(-W / 2 - 0.8, -D / 2 - 0.6), radius: 0.06, height: 5.4, segments: 8, mat: 'galvanized', surface: SURFACE.METAL });
  b.box({
    x: tx(-W / 2 - 0.8 + 0.75, -D / 2 - 0.6), y: 4.6, z: tz(-W / 2 - 0.8 + 0.75, -D / 2 - 0.6),
    w: 1.5, h: 0.9, d: 0.02, yaw, mat: team === 'A' ? 'plasticGloss' : 'plasticGlossRed',
    surface: SURFACE.FABRIC, collide: false,
  });
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
