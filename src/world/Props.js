import * as THREE from 'three';
import { SURFACE } from './Physics.js';

/**
 * レベルを彩る小物（プロップ）のライブラリ。
 * すべて MapBuilder のバッチに積むため、ドローコールは増えない。
 *
 * 各関数は (b: MapBuilder, o: {x,y,z,yaw,...}) を受け取る。
 */

const R = (min, max) => min + Math.random() * (max - min);
const PICK = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ================= 収納・資材 ================= */

/** 木箱（板の隙間・補強材まで作る） */
export function woodCrate(b, o) {
  const { x, y = 0, z, yaw = 0, size = 0.78, mat = 'plywood' } = o;
  const s = size, h = size * 0.92, t = 0.035;

  // 4 面の板
  const half = s / 2;
  for (const [dx, dz, ry] of [[0, -half, 0], [0, half, 0], [-half, 0, Math.PI / 2], [half, 0, Math.PI / 2]]) {
    const rx = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    const rz = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    // 板を 3 枚に分けて隙間を作る
    for (let i = 0; i < 3; i++) {
      const py = y + h * (0.17 + i * 0.33);
      b.box({
        x: x + rx, y: py, z: z + rz, w: s * 0.98, h: h * 0.28, d: t,
        yaw: yaw + ry, mat, surface: SURFACE.WOOD, collide: false,
      });
    }
  }
  // 天板・底板
  b.box({ x, y: y + h - t / 2, z, w: s, h: t, d: s, yaw, mat, surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + t / 2, z, w: s, h: t, d: s, yaw, mat, surface: SURFACE.WOOD, collide: false });
  // 角の補強材
  for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
    const rx = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    const rz = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    b.box({ x: x + rx, y: y + h / 2, z: z + rz, w: 0.05, h, d: 0.05, yaw, mat: 'wood', surface: SURFACE.WOOD, collide: false });
  }
  // 当たり判定は 1 個の箱でまとめる
  b.physics.addBox(x, y + h / 2, z, s / 2, h / 2, s / 2, yaw, { surface: SURFACE.WOOD, penetration: 0.55 });
  return b;
}

/** 金属製の弾薬箱 */
export function ammoCrate(b, o) {
  const { x, y = 0, z, yaw = 0, w = 0.62, h = 0.34, d = 0.34 } = o;
  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  // 蓋のリップ
  b.box({ x, y: y + h + 0.018, z, w: w * 1.04, h: 0.036, d: d * 1.04, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  // ハンドル
  for (const s of [-1, 1]) {
    const dx = Math.cos(yaw) * (w / 2 + 0.02) * s;
    const dz = Math.sin(yaw) * (w / 2 + 0.02) * s;
    b.box({ x: x + dx, y: y + h * 0.62, z: z + dz, w: 0.03, h: 0.10, d: 0.14, yaw, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  }
  // ラッチ
  b.box({ x: x + Math.sin(yaw) * (d / 2), y: y + h * 0.8, z: z + Math.cos(yaw) * (d / 2), w: 0.09, h: 0.06, d: 0.02, yaw, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.METAL, penetration: 0.3 });
  return b;
}

/** ドラム缶 */
export function barrel(b, o) {
  const { x, y = 0, z, mat = 'rustedMetal', height = 0.88, radius = 0.29 } = o;
  b.cylinder({ x, y, z, radius, height, segments: 16, mat, surface: SURFACE.METAL, collide: false });
  // 補強リブ（3 本）
  for (const t of [0.22, 0.5, 0.78]) {
    b.cylinder({ x, y: y + height * t - 0.02, z, radius: radius * 1.05, height: 0.045, segments: 16, mat, surface: SURFACE.METAL, collide: false });
  }
  // 天面のリング・注入口
  b.cylinder({ x, y: y + height - 0.02, z, radius: radius * 1.03, height: 0.03, segments: 16, mat, surface: SURFACE.METAL, collide: false });
  b.cylinder({ x: x + radius * 0.5, y: y + height, z, radius: 0.045, height: 0.02, segments: 10, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  b.physics.addCylinder(x, y + height / 2, z, radius, height / 2, { surface: SURFACE.METAL, penetration: 0.4 });
  return b;
}

/** 土嚢の山 */
export function sandbagStack(b, o) {
  const { x, y = 0, z, yaw = 0, rows = 3, perRow = 4, length = 2.2 } = o;
  const bagW = length / perRow, bagH = 0.24, bagD = 0.42;
  for (let r = 0; r < rows; r++) {
    const n = perRow - (r % 2 === 1 ? 1 : 0);
    const off = (r % 2 === 1) ? bagW / 2 : 0;
    for (let i = 0; i < n; i++) {
      const lx = -length / 2 + bagW * (i + 0.5) + off;
      const rx = Math.cos(yaw) * lx;
      const rz = Math.sin(yaw) * lx;
      // 袋は少し潰れた形にして硬さを消す
      b.box({
        x: x + rx + R(-0.02, 0.02), y: y + bagH * (r + 0.5), z: z + rz + R(-0.02, 0.02),
        w: bagW * 0.96, h: bagH * 0.94, d: bagD, yaw: yaw + R(-0.07, 0.07),
        mat: 'sandbag', surface: SURFACE.FABRIC, collide: false,
      });
    }
  }
  b.physics.addBox(x, y + (rows * bagH) / 2, z, length / 2, (rows * bagH) / 2, bagD / 2, yaw,
    { surface: SURFACE.FABRIC, penetration: 0.12 });
  return b;
}

/** 木製パレット */
export function pallet(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.15, d = 0.95 } = o;
  const t = 0.022;
  // 上面の板 6 枚
  for (let i = 0; i < 6; i++) {
    const lz = -d / 2 + (d / 5) * i;
    b.box({ x: x + Math.sin(yaw) * lz, y: y + 0.115, z: z + Math.cos(yaw) * lz, w, h: t, d: d / 8, yaw, mat: 'wood', surface: SURFACE.WOOD, collide: false });
  }
  // 桁 3 本
  for (const lx of [-w / 2 + 0.07, 0, w / 2 - 0.07]) {
    b.box({ x: x + Math.cos(yaw) * lx, y: y + 0.055, z: z - Math.sin(yaw) * lx, w: 0.09, h: 0.09, d, yaw, mat: 'wood', surface: SURFACE.WOOD, collide: false });
  }
  b.physics.addBox(x, y + 0.065, z, w / 2, 0.065, d / 2, yaw, { surface: SURFACE.WOOD, penetration: 0.7 });
  return b;
}

/** 積み上げたタイヤ */
export function tireStack(b, o) {
  const { x, y = 0, z, count = 3 } = o;
  for (let i = 0; i < count; i++) {
    const yy = y + 0.10 + i * 0.19;
    const geo = new THREE.TorusGeometry(0.32, 0.105, 10, 22);
    geo.rotateX(Math.PI / 2);
    b.mesh('tireTread', geo, { x, y: yy, z, ry: R(0, 3.14) });
  }
  b.physics.addCylinder(x, y + count * 0.095, z, 0.44, count * 0.095, { surface: SURFACE.RUBBER, penetration: 0.35 });
  return b;
}

/** 段ボール箱の山 */
export function cardboardStack(b, o) {
  const { x, y = 0, z, yaw = 0, count = 3 } = o;
  let yy = y;
  for (let i = 0; i < count; i++) {
    const w = R(0.42, 0.58), h = R(0.28, 0.40), d = R(0.40, 0.54);
    b.box({
      x: x + R(-0.06, 0.06), y: yy + h / 2, z: z + R(-0.06, 0.06),
      w, h, d, yaw: yaw + R(-0.25, 0.25), mat: 'cardboard', surface: SURFACE.FABRIC, collide: false,
    });
    yy += h;
  }
  b.physics.addBox(x, y + (yy - y) / 2, z, 0.30, (yy - y) / 2, 0.30, yaw, { surface: SURFACE.FABRIC, penetration: 0.85 });
  return b;
}

/* ================= 建築付帯物 ================= */

/** 輸送コンテナ（波板・扉・コーナーキャスティング） */
export function container(b, o) {
  const { x, y = 0, z, yaw = 0, length = 6.06, width = 2.44, height = 2.59, mat = 'corrugated' } = o;
  const t = 0.06;
  const hl = length / 2, hw = width / 2;

  // 側面 2 枚（波板）
  for (const s of [-1, 1]) {
    const dx = Math.cos(yaw) * hw * s;
    const dz = -Math.sin(yaw) * hw * s;
    b.box({ x: x + dx, y: y + height / 2, z: z + dz, w: t, h: height, d: length, yaw, mat, surface: SURFACE.METAL, collide: false });
  }
  // 前面（扉側）
  const fx = Math.sin(yaw) * hl, fz = Math.cos(yaw) * hl;
  b.box({ x: x - fx, y: y + height / 2, z: z - fz, w: width, h: height, d: t, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  // 扉の枠と縦リブ
  for (const dsx of [-0.55, 0.55]) {
    b.box({
      x: x + fx + Math.cos(yaw) * width * dsx, y: y + height / 2, z: z + fz - Math.sin(yaw) * width * dsx,
      w: 0.08, h: height * 0.94, d: 0.05, yaw, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  b.box({ x: x + fx, y: y + height / 2, z: z + fz, w: width, h: height, d: t, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  // 扉のロッキングバー 4 本
  for (const dsx of [-0.34, -0.12, 0.12, 0.34]) {
    b.cylinder({
      x: x + fx + Math.cos(yaw) * width * dsx + Math.sin(yaw) * 0.04,
      y: y + 0.12, z: z + fz - Math.sin(yaw) * width * dsx + Math.cos(yaw) * 0.04,
      radius: 0.022, height: height * 0.86, segments: 8, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  // 屋根
  b.box({ x, y: y + height - t / 2, z, w: width, h: t, d: length, yaw, mat: 'corrugated', surface: SURFACE.METAL, collide: false });
  // 床
  b.box({ x, y: y + t / 2, z, w: width, h: t, d: length, yaw, mat: 'plywood', surface: SURFACE.WOOD, collide: false });
  // コーナーキャスティング（8 隅）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, 1]) {
    const lx = hw * sx * 0.94, lz = hl * sz * 0.97;
    b.box({
      x: x + Math.cos(yaw) * lx + Math.sin(yaw) * lz,
      y: y + (sy ? height - 0.09 : 0.09), z: z - Math.sin(yaw) * lx + Math.cos(yaw) * lz,
      w: 0.17, h: 0.18, d: 0.17, yaw, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  // 当たり判定
  b.physics.addBox(x, y + height / 2, z, width / 2, height / 2, length / 2, yaw, { surface: SURFACE.METAL, penetration: 0.2 });
  return b;
}

/** 空調室外機 */
export function acUnit(b, o) {
  const { x, y, z, yaw = 0, w = 0.86, h = 0.66, d = 0.34 } = o;
  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  // ファングリル
  const grill = new THREE.TorusGeometry(w * 0.29, 0.02, 8, 20);
  b.mesh('rustedMetal', grill, { x: x + Math.sin(yaw) * (d / 2 + 0.01), y: y + h * 0.55, z: z + Math.cos(yaw) * (d / 2 + 0.01), ry: yaw });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    b.box({
      x: x + Math.sin(yaw) * (d / 2 + 0.01), y: y + h * 0.55, z: z + Math.cos(yaw) * (d / 2 + 0.01),
      w: w * 0.56, h: 0.014, d: 0.014, yaw, rz: a, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  // 配管
  b.cylinder({ x: x - w * 0.36, y: y + h, z, radius: 0.032, height: 0.42, segments: 8, mat: 'copper', surface: SURFACE.METAL, collide: false });
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.METAL, penetration: 0.5 });
  return b;
}

/** 屋外階段の手すり */
export function railing(b, o) {
  const { x1, z1, x2, z2, y = 0, height = 1.05, mat = 'rustedMetal' } = o;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const posts = Math.max(2, Math.round(len / 1.35));

  // 手すり本体（上・中の 2 本）
  for (const hy of [height, height * 0.55]) {
    b.box({
      x: (x1 + x2) / 2, y: y + hy, z: (z1 + z2) / 2,
      w: 0.045, h: 0.045, d: len, yaw, mat, surface: SURFACE.METAL, collide: false,
    });
  }
  // 支柱
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    b.cylinder({
      x: x1 + dx * t, y, z: z1 + dz * t,
      radius: 0.026, height, segments: 8, mat, surface: SURFACE.METAL, collide: false,
    });
  }
  // 手すりは弾を通すが移動は阻む
  b.physics.addBox((x1 + x2) / 2, y + height / 2, (z1 + z2) / 2, 0.08, height / 2, len / 2, yaw,
    { surface: SURFACE.METAL, blocksBullets: false });
  return b;
}

/** 配管の束（壁沿い） */
export function pipeRun(b, o) {
  const { x1, z1, x2, z2, y, count = 3, radius = 0.055, mat = 'rustedMetal' } = o;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * radius * 2.6;
    const geo = new THREE.CylinderGeometry(radius, radius, len, 10);
    geo.rotateX(Math.PI / 2);
    b.mesh(mat, geo, {
      x: (x1 + x2) / 2 + Math.cos(yaw) * off, y: y + (i % 2) * 0.02,
      z: (z1 + z2) / 2 - Math.sin(yaw) * off, ry: yaw,
    });
  }
  // 固定金具
  const clamps = Math.max(2, Math.round(len / 2.2));
  for (let i = 0; i <= clamps; i++) {
    const t = i / clamps;
    b.box({
      x: x1 + dx * t, y, z: z1 + dz * t,
      w: count * radius * 2.8, h: 0.05, d: 0.05, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  return b;
}

/* ================= 市場・生活感 ================= */

/** 屋台（骨組み + 布の日除け + 台） */
export function marketStall(b, o) {
  // 日除けは縞のテント地。fabric（迷彩混じりの布）だと市場ではなく野営に見える
  const { x, y = 0, z, yaw = 0, w = 2.6, d = 1.7, h = 2.25, cloth = 'awningFabric' } = o;
  // 支柱 4 本
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = (w / 2 - 0.08) * sx, lz = (d / 2 - 0.08) * sz;
    b.cylinder({
      x: x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, y,
      z: z - Math.sin(yaw) * lx + Math.cos(yaw) * lz,
      radius: 0.038, height: h, segments: 8, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  // 日除け（前へ傾斜）
  b.box({ x, y: y + h + 0.03, z, w, h: 0.05, d, yaw, mat: cloth, surface: SURFACE.FABRIC, collide: false });
  b.box({
    x: x + Math.sin(yaw) * (d / 2 + 0.32), y: y + h - 0.16, z: z + Math.cos(yaw) * (d / 2 + 0.32),
    w, h: 0.05, d: 0.75, yaw, mat: cloth, surface: SURFACE.FABRIC, collide: false, rx: 0.42,
  });
  // 陳列台
  b.box({ x, y: y + 0.86, z, w: w * 0.92, h: 0.06, d: d * 0.75, yaw, mat: 'scaffoldPlank', surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + 0.43, z, w: w * 0.88, h: 0.05, d: d * 0.7, yaw, mat: 'plywood', surface: SURFACE.WOOD, collide: false });
  // 台に置く木箱
  for (let i = 0; i < 3; i++) {
    const lx = -w * 0.3 + i * w * 0.3;
    b.box({
      x: x + Math.cos(yaw) * lx, y: y + 1.02, z: z - Math.sin(yaw) * lx,
      w: 0.32, h: 0.26, d: 0.32, yaw: yaw + R(-0.2, 0.2), mat: 'plywood', surface: SURFACE.WOOD, collide: false,
    });
  }
  b.physics.addBox(x, y + 0.46, z, w / 2 * 0.92, 0.46, d / 2 * 0.75, yaw, { surface: SURFACE.WOOD, penetration: 0.6 });
  return b;
}

/** 洗濯物のロープ（生活感） */
export function clothesline(b, o) {
  const { x1, y, z1, x2, z2, count = 5 } = o;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  // ロープ（たるみは中央を下げて表現）
  const SEG = 6;
  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG, t1 = (i + 1) / SEG;
    const tm = (t0 + t1) / 2;
    const sag = Math.sin(tm * Math.PI) * 0.22;
    b.box({
      x: x1 + dx * tm, y: y - sag, z: z1 + dz * tm,
      w: 0.012, h: 0.012, d: len / SEG * 1.05, yaw, mat: 'fabric', surface: SURFACE.FABRIC, collide: false,
    });
  }
  // 布
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const sag = Math.sin(t * Math.PI) * 0.22;
    const cw = R(0.34, 0.56), ch = R(0.5, 0.85);
    b.box({
      x: x1 + dx * t, y: y - sag - ch / 2, z: z1 + dz * t,
      w: cw, h: ch, d: 0.012, yaw: yaw + R(-0.12, 0.12),
      mat: PICK(['fabric', 'camo', 'fabric']), surface: SURFACE.FABRIC, collide: false,
    });
  }
  return b;
}

/** 瓦礫・砕けたコンクリート */
export function rubble(b, o) {
  const { x, y = 0, z, radius = 1.6, count = 14 } = o;
  for (let i = 0; i < count; i++) {
    const a = R(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * radius;
    const s = R(0.10, 0.34);
    b.box({
      x: x + Math.cos(a) * r, y: y + s * 0.35, z: z + Math.sin(a) * r,
      w: s, h: s * R(0.4, 0.8), d: s * R(0.7, 1.3), yaw: R(0, 3.14),
      mat: PICK(['concrete', 'rock', 'brick']), surface: SURFACE.CONCRETE, collide: false,
    });
  }
  return b;
}

/** 街灯 */
export function streetLight(b, o) {
  const { x, y = 0, z, yaw = 0, height = 4.6, withLight = true } = o;
  /*
   * 支柱は亜鉛メッキ。
   * 以前は砂色の塗装（paintedMetalTan）にしていたが、
   * 日向で黄土色に光り、金属の柱というより真鍮の棒に見えていた。
   */
  b.cylinder({ x, y, z, radius: 0.075, height, segments: 10, mat: 'galvanized', surface: SURFACE.METAL });
  // 根元のベースプレートとアンカーボルト（柱が地面から生えて見えるのを防ぐ）
  b.cylinder({ x, y, z, radius: 0.17, height: 0.06, segments: 10, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.79;
    b.cylinder({
      x: x + Math.cos(a) * 0.125, y: y + 0.06, z: z + Math.sin(a) * 0.125,
      radius: 0.014, height: 0.05, segments: 5, mat: 'gunMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  // アーム
  const armLen = 1.1;
  b.box({
    x: x + Math.sin(yaw) * armLen / 2, y: y + height - 0.06, z: z + Math.cos(yaw) * armLen / 2,
    w: 0.07, h: 0.07, d: armLen, yaw, mat: 'galvanized', surface: SURFACE.METAL, collide: false,
  });
  // 灯体
  const lx = x + Math.sin(yaw) * armLen, lz = z + Math.cos(yaw) * armLen;
  b.box({ x: lx, y: y + height - 0.14, z: lz, w: 0.28, h: 0.14, d: 0.52, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  if (withLight) {
    const lampGeo = new THREE.BoxGeometry(0.22, 0.03, 0.44);
    const lamp = new THREE.Mesh(lampGeo, b.mats.emissive(0xffe0a8, 6));
    lamp.position.set(lx, y + height - 0.215, lz);
    lamp.rotation.y = yaw;
    b.addExtra(lamp);
    b.light({ x: lx, y: y + height - 0.4, z: lz, color: 0xffd9a0, intensity: 12, distance: 11 });
  }
  return b;
}

/** 電柱 + 電線 */
export function utilityPole(b, o) {
  const { x, y = 0, z, yaw = 0, height = 6.2 } = o;
  b.cylinder({ x, y, z, radius: 0.13, height, segments: 8, mat: 'wood', surface: SURFACE.WOOD });
  // 腕木
  for (const hy of [height - 0.5, height - 1.15]) {
    b.box({ x, y: y + hy, z, w: 1.7, h: 0.09, d: 0.09, yaw, mat: 'wood', surface: SURFACE.WOOD, collide: false });
    // 碍子
    for (const lx of [-0.72, -0.24, 0.24, 0.72]) {
      b.cylinder({
        x: x + Math.cos(yaw) * lx, y: y + hy + 0.05, z: z - Math.sin(yaw) * lx,
        radius: 0.035, height: 0.10, segments: 8, mat: 'tile', surface: SURFACE.CONCRETE, collide: false,
      });
    }
  }
  // 変圧器
  b.cylinder({ x: x + 0.28, y: y + height - 2.3, z, radius: 0.22, height: 0.62, segments: 12, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  return b;
}

/** 車両（ピックアップトラック / セダン） */
export function vehicle(b, o) {
  const { x, y = 0, z, yaw = 0, type = 'truck', mat = 'paintedMetalTan' } = o;
  const isTruck = type === 'truck';
  const L = isTruck ? 5.1 : 4.3, W = 1.92, H = isTruck ? 0.92 : 0.78;
  const wheelR = 0.36;

  // シャシー
  b.box({ x, y: y + wheelR + H / 2, z, w: W, h: H, d: L, yaw, mat, surface: SURFACE.METAL, collide: false });
  // キャビン
  const cabZ = isTruck ? -L * 0.10 : 0;
  b.box({
    x: x + Math.sin(yaw) * cabZ, y: y + wheelR + H + 0.34, z: z + Math.cos(yaw) * cabZ,
    w: W * 0.92, h: 0.68, d: isTruck ? L * 0.34 : L * 0.46, yaw, mat, surface: SURFACE.METAL, collide: false,
  });
  // 窓（ガラス）
  const glassGeo = new THREE.BoxGeometry(W * 0.86, 0.44, (isTruck ? L * 0.34 : L * 0.46) * 0.96);
  const glass = new THREE.Mesh(glassGeo, b.mats.glass({ opacity: 0.55, transmission: 0.7 }));
  glass.position.set(x + Math.sin(yaw) * cabZ, y + wheelR + H + 0.46, z + Math.cos(yaw) * cabZ);
  glass.rotation.y = yaw;
  b.addExtra(glass);

  // 荷台（トラックのみ）
  if (isTruck) {
    const bedZ = L * 0.26;
    for (const s of [-1, 1]) {
      b.box({
        x: x + Math.sin(yaw) * bedZ + Math.cos(yaw) * (W / 2 - 0.06) * s,
        y: y + wheelR + H + 0.20, z: z + Math.cos(yaw) * bedZ - Math.sin(yaw) * (W / 2 - 0.06) * s,
        w: 0.10, h: 0.40, d: L * 0.44, yaw, mat, surface: SURFACE.METAL, collide: false,
      });
    }
    b.box({
      x: x + Math.sin(yaw) * (L * 0.48), y: y + wheelR + H + 0.20, z: z + Math.cos(yaw) * (L * 0.48),
      w: W * 0.94, h: 0.40, d: 0.09, yaw, mat, surface: SURFACE.METAL, collide: false,
    });
    // 荷台のあおりは見えている以上、身を隠せるようにしておく（薄いので貫通はする）
    for (const s of [-1, 1]) {
      b.physics.addBox(
        x + Math.sin(yaw) * bedZ + Math.cos(yaw) * (W / 2 - 0.06) * s,
        y + wheelR + H + 0.20,
        z + Math.cos(yaw) * bedZ - Math.sin(yaw) * (W / 2 - 0.06) * s,
        0.05, 0.20, L * 0.22, yaw, { surface: SURFACE.METAL, penetration: 0.8 }
      );
    }
  }

  // タイヤ 4 本
  const wz = L * 0.32;
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const lx = (W / 2 - 0.06) * sx, lz = wz * sz;
    const wx = x + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
    const wzz = z - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
    const geo = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 16);
    geo.rotateZ(Math.PI / 2);
    b.mesh('tireTread', geo, { x: wx, y: y + wheelR, z: wzz, ry: yaw });
    // ホイール
    const hub = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.26, 12);
    hub.rotateZ(Math.PI / 2);
    b.mesh('brushedMetal', hub, { x: wx, y: y + wheelR, z: wzz, ry: yaw });
  }

  // バンパー・ライト
  for (const sz of [-1, 1]) {
    b.box({
      x: x + Math.sin(yaw) * (L / 2 - 0.05) * sz, y: y + wheelR + 0.18, z: z + Math.cos(yaw) * (L / 2 - 0.05) * sz,
      w: W * 1.02, h: 0.16, d: 0.12, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  const headGeo = new THREE.BoxGeometry(0.26, 0.14, 0.05);
  for (const sx of [-1, 1]) {
    const lx = (W * 0.32) * sx, lz = -L / 2;
    const hl = new THREE.Mesh(headGeo, b.mats.emissive(0xfff2d0, 0.6));
    hl.position.set(x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, y + wheelR + H * 0.75, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz);
    hl.rotation.y = yaw;
    b.addExtra(hl);
  }

  /*
   * 車体の判定は「地面からシャシー上面まで」。
   * 以前は中心を wheelR + H/2 に置きながら半径に (wheelR+H)/2 + 0.1 を
   * 使っていたため、上端が実際の車体より 28cm 高く、下端は地面から
   * 浮いていた。荷台の上が開いているのに弾が止まる原因になっていた。
   */
  b.physics.addBox(x, y + (wheelR + H) / 2, z, W / 2, (wheelR + H) / 2, L / 2, yaw,
    { surface: SURFACE.METAL, penetration: 0.25 });
  // キャビン上部も乗れるように
  b.physics.addBox(x + Math.sin(yaw) * cabZ, y + wheelR + H + 0.34, z + Math.cos(yaw) * cabZ,
    W * 0.46, 0.34, (isTruck ? L * 0.17 : L * 0.23), yaw, { surface: SURFACE.METAL, penetration: 0.3 });
  return b;
}

/** 看板 */
export function sign(b, o) {
  const { x, y, z, yaw = 0, w = 1.5, h = 0.6, mat = 'hazardStripe' } = o;
  b.box({ x, y, z, w, h, d: 0.04, yaw, mat, surface: SURFACE.METAL, collide: false });
  b.box({ x, y, z, w: w * 1.04, h: 0.035, d: 0.05, yaw, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  return b;
}

/** 給水タンク（屋上） */
export function waterTank(b, o) {
  const { x, y, z, radius = 0.95, height = 1.5 } = o;
  b.cylinder({ x, y, z, radius, height, segments: 16, mat: 'corrugated', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: y + height, z, radius: radius * 1.04, height: 0.08, segments: 16, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  // 脚
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    b.cylinder({
      x: x + Math.cos(a) * radius * 0.75, y: y - 0.5, z: z + Math.sin(a) * radius * 0.75,
      radius: 0.05, height: 0.52, segments: 6, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  b.physics.addCylinder(x, y + height / 2, z, radius, height / 2, { surface: SURFACE.METAL, penetration: 0.4 });
  return b;
}

/** アンテナ / 衛星皿（屋上の情報量を上げる） */
export function rooftopClutter(b, o) {
  const { x, y, z, yaw = 0 } = o;
  // パラボラ
  const dish = new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
  b.mesh('plaster', dish, { x, y: y + 0.62, z, rx: -0.9, ry: yaw });
  b.cylinder({ x, y, z, radius: 0.045, height: 0.62, segments: 8, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  // アンテナポール
  b.cylinder({ x: x + 0.7, y, z: z + 0.3, radius: 0.022, height: 1.9, segments: 6, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  for (let i = 0; i < 4; i++) {
    b.box({
      x: x + 0.7, y: y + 0.9 + i * 0.24, z: z + 0.3,
      w: 0.5 - i * 0.08, h: 0.012, d: 0.012, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  return b;
}

/** ジェリカン */
export function jerryCan(b, o) {
  const { x, y = 0, z, yaw = 0 } = o;
  b.box({ x, y: y + 0.235, z, w: 0.17, h: 0.47, d: 0.34, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  // 特徴的な X の凹み
  for (const a of [0.72, -0.72]) {
    b.box({ x: x + Math.cos(yaw) * 0.088, y: y + 0.24, z: z - Math.sin(yaw) * 0.088, w: 0.012, h: 0.30, d: 0.03, yaw, rz: a, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  }
  // ハンドル
  b.box({ x, y: y + 0.49, z, w: 0.16, h: 0.035, d: 0.05, yaw, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  b.physics.addBox(x, y + 0.235, z, 0.09, 0.235, 0.17, yaw, { surface: SURFACE.METAL, penetration: 0.6 });
  return b;
}

/** 散らばった小物（薬莢・紙・小石）を一括配置して密度を上げる */
export function litter(b, o) {
  const { x, z, radius = 3.0, count = 22, y = 0.012 } = o;
  for (let i = 0; i < count; i++) {
    const a = R(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * radius;
    const kind = Math.random();
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (kind < 0.45) {
      b.box({ x: px, y, z: pz, w: R(0.06, 0.16), h: 0.004, d: R(0.06, 0.14), yaw: R(0, 3.14), mat: 'cardboard', surface: SURFACE.CONCRETE, collide: false });
    } else if (kind < 0.75) {
      b.box({ x: px, y, z: pz, w: R(0.04, 0.10), h: R(0.02, 0.05), d: R(0.04, 0.10), yaw: R(0, 3.14), mat: 'rock', surface: SURFACE.GRAVEL, collide: false });
    } else {
      b.box({ x: px, y: y + 0.004, z: pz, w: 0.010, h: 0.010, d: 0.038, yaw: R(0, 3.14), mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    }
  }
  return b;
}


/* ================= 工事現場 ================= */

/**
 * 金網フェンス（仮囲い）。
 * 支柱は実体、網は薄いので弾は抜けるが体は止まる。
 * 「見えているのに素通りできる」より「撃てるが通れない」ほうが
 * 遮蔽としての読みが素直になる。
 */
export function chainFence(b, o) {
  const {
    x1, z1, x2, z2, y = 0, h = 2.0, panel = 2.4,
    mat = 'chainlink', post = 'galvanized', tarp = null,
  } = o;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return b;
  const yaw = Math.atan2(dx, dz);
  const n = Math.max(1, Math.round(len / panel));

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.cylinder({
      x: x1 + dx * t, y, z: z1 + dz * t,
      radius: 0.032, height: h + 0.08, segments: 8,
      mat: post, surface: SURFACE.METAL, collide: false,
    });
  }
  for (const hy of [h - 0.04, 0.12]) {
    b.box({
      x: (x1 + x2) / 2, y: y + hy, z: (z1 + z2) / 2,
      w: 0.036, h: 0.036, d: len, yaw, mat: post, surface: SURFACE.METAL, collide: false,
    });
  }
  b.box({
    x: (x1 + x2) / 2, y: y + h / 2, z: (z1 + z2) / 2,
    w: 0.012, h: h - 0.1, d: len, yaw, mat, surface: SURFACE.METAL, collide: false,
  });
  if (tarp) {
    b.box({
      x: (x1 + x2) / 2, y: y + h * 0.56, z: (z1 + z2) / 2,
      w: 0.02, h: h * 0.82, d: len * 0.98, yaw, mat: tarp, surface: SURFACE.FABRIC, collide: false,
    });
  }
  b.physics.addBox((x1 + x2) / 2, y + h / 2, (z1 + z2) / 2, 0.07, h / 2, len / 2, yaw,
    { surface: SURFACE.METAL, blocksBullets: false });
  return b;
}

/**
 * 単管足場。
 * 建物の外周に沿って組む。踏板は乗れる床、手すりは腰の高さ。
 */
export function scaffold(b, o) {
  const {
    x, y = 0, z, yaw = 0, length = 6.0, levels = 2, levelH = 2.0,
    depth = 1.2, net = true,
  } = o;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const tx = (lx, lz) => x + c * lx + s * lz;
  const tz = (lx, lz) => z - s * lx + c * lz;
  const bays = Math.max(1, Math.round(length / 1.8));

  for (let i = 0; i <= bays; i++) {
    const lz = -length / 2 + (length / bays) * i;
    for (const lx of [-depth / 2, depth / 2]) {
      b.cylinder({
        x: tx(lx, lz), y, z: tz(lx, lz),
        radius: 0.024, height: levels * levelH + 1.1, segments: 8,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false,
      });
    }
  }

  for (let L = 1; L <= levels; L++) {
    const ly = y + L * levelH;
    b.box({
      x: tx(0, 0), y: ly, z: tz(0, 0),
      w: depth, h: 0.05, d: length, yaw, mat: 'scaffoldPlank', surface: SURFACE.WOOD,
    });
    for (const hy of [0.5, 1.0]) {
      b.box({
        x: tx(depth / 2, 0), y: ly + hy, z: tz(depth / 2, 0),
        w: 0.05, h: 0.05, d: length, yaw, mat: 'galvanized', surface: SURFACE.METAL, collide: false,
      });
    }
    b.box({
      x: tx(depth / 2, 0), y: ly + 0.13, z: tz(depth / 2, 0),
      w: 0.03, h: 0.20, d: length, yaw, mat: 'scaffoldPlank', surface: SURFACE.WOOD, collide: false,
    });
    if (net) {
      b.box({
        x: tx(depth / 2 + 0.04, 0), y: ly + 0.62, z: tz(depth / 2 + 0.04, 0),
        w: 0.012, h: 1.15, d: length, yaw, mat: 'meshScreen', surface: SURFACE.FABRIC, collide: false,
      });
    }
    // 段差を上がるための足がかり
    b.box({
      x: tx(-depth / 2 + 0.1, -length / 2 + 0.5), y: ly - levelH / 2, z: tz(-depth / 2 + 0.1, -length / 2 + 0.5),
      w: 0.5, h: 0.06, d: 0.9, yaw, mat: 'scaffoldPlank', surface: SURFACE.WOOD,
    });
  }
  return b;
}

/** 鉄筋の束（寝かせて置く） */
export function rebarBundle(b, o) {
  const { x, y = 0, z, yaw = 0, count = 9, length = 4.0 } = o;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 3), col = i % 3;
    const lx = (col - 1) * 0.05, ly = 0.02 + row * 0.045;
    const geo = new THREE.CylinderGeometry(0.016, 0.016, length, 6);
    geo.rotateX(Math.PI / 2);
    b.mesh('rebar', geo, {
      x: x + Math.cos(yaw) * lx, y: y + ly, z: z - Math.sin(yaw) * lx, ry: yaw,
    });
  }
  b.physics.addBox(x, y + 0.08, z, 0.10, 0.08, length / 2, yaw, { surface: SURFACE.METAL, penetration: 0.5 });
  return b;
}

/** 型枠合板の山 */
export function formworkStack(b, o) {
  const { x, y = 0, z, yaw = 0, count = 7 } = o;
  const W = 0.9, D = 1.8, T = 0.024;
  for (let i = 0; i < count; i++) {
    b.box({
      x: x + R(-0.03, 0.03), y: y + T / 2 + i * T, z: z + R(-0.04, 0.04),
      w: W, h: T, d: D, yaw: yaw + R(-0.03, 0.03),
      mat: 'formPly', surface: SURFACE.WOOD, collide: false,
    });
  }
  b.physics.addBox(x, y + count * T / 2, z, W / 2, count * T / 2, D / 2, yaw,
    { surface: SURFACE.WOOD, penetration: 0.3 });
  return b;
}

/** コンクリートブロックのパレット積み */
export function blockPallet(b, o) {
  const { x, y = 0, z, yaw = 0, rows = 4 } = o;
  pallet(b, { x, y, z, yaw });
  const BW = 0.39, BH = 0.19, BD = 0.19;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        const lx = -BW + i * BW;
        const lz = -0.42 + j * (BD + 0.02);
        b.box({
          x: x + Math.cos(yaw) * lx + Math.sin(yaw) * lz,
          y: y + 0.14 + BH / 2 + r * BH,
          z: z - Math.sin(yaw) * lx + Math.cos(yaw) * lz,
          w: BW, h: BH, d: BD, yaw: yaw + (r % 2 ? 0.02 : -0.02),
          mat: 'concreteBlock', surface: SURFACE.CONCRETE, collide: false,
        });
      }
    }
  }
  b.physics.addBox(x, y + 0.14 + rows * BH / 2, z, 0.62, rows * BH / 2 + 0.07, 0.52, yaw,
    { surface: SURFACE.CONCRETE });
  return b;
}

/** 砂・砕石の山（登れる） */
export function aggregatePile(b, o) {
  const { x, y = 0, z, radius = 2.2, height = 1.3, mat = 'gravel' } = o;
  const geo = new THREE.ConeGeometry(radius, height, 14, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    if (py < height / 2 - 0.01) {
      pos.setX(i, px * R(0.92, 1.08));
      pos.setZ(i, pz * R(0.92, 1.08));
    }
    pos.setY(i, py + R(-0.04, 0.04));
  }
  geo.computeVertexNormals();
  b.mesh(mat, geo, { x, y: y + height / 2, z });
  /*
   * 山なので登れる。段状の判定で近似する。
   *
   * 箱は円に外接するので、角が √2 倍だけ外へ出る。
   * 以前は段の「下端」の半径をそのまま使っていたため、
   * 最上段の角が頂点のはるか外側に張り出し、
   * 何も無い空中で弾が止まる見えない壁になっていた。
   * 段の中央の半径を採り、角が下端の円周に収まるよう 0.8 を掛ける。
   */
  const steps = 4;
  const hy = height / (steps * 2);
  for (let i = 0; i < steps; i++) {
    const r = radius * (1 - (i + 0.5) / steps) * 0.8;
    if (r < 0.12) continue;
    b.physics.addCylinder(x, y + height * (i + 0.5) / steps, z, r, hy, { surface: SURFACE.GRAVEL });
  }
  return b;
}

/** 三角コーンと単管バリケード */
export function siteBarrier(b, o) {
  const { x1, z1, x2, z2, y = 0, cones = true } = o;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  for (const hy of [0.55, 0.95]) {
    b.box({
      x: (x1 + x2) / 2, y: y + hy, z: (z1 + z2) / 2,
      w: 0.05, h: 0.14, d: len, yaw, mat: 'hazardStripe', surface: SURFACE.METAL, collide: false,
    });
  }
  for (const t of [0.04, 0.96]) {
    for (const s of [-1, 1]) {
      b.box({
        x: x1 + dx * t + Math.cos(yaw) * 0.22 * s, y: y + 0.5, z: z1 + dz * t - Math.sin(yaw) * 0.22 * s,
        w: 0.05, h: 1.0, d: 0.05, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false,
      });
    }
  }
  if (cones) {
    const n = Math.max(2, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const cx = x1 + dx * t + Math.cos(yaw) * 0.5, cz = z1 + dz * t - Math.sin(yaw) * 0.5;
      const cone = new THREE.ConeGeometry(0.16, 0.62, 10, 1);
      b.mesh('plasticGlossRed', cone, { x: cx, y: y + 0.31, z: cz });
      b.box({ x: cx, y: y + 0.02, z: cz, w: 0.34, h: 0.04, d: 0.34, mat: 'plasticBlack', surface: SURFACE.RUBBER, collide: false });
      b.cylinder({ x: cx, y: y + 0.26, z: cz, radius: 0.105, height: 0.09, segments: 10, mat: 'plasticGloss', surface: SURFACE.RUBBER, collide: false });
    }
  }
  b.physics.addBox((x1 + x2) / 2, y + 0.55, (z1 + z2) / 2, 0.28, 0.55, len / 2, yaw,
    { surface: SURFACE.METAL, penetration: 0.7 });
  return b;
}

/** 現場事務所（プレハブ）。屋根に登れる */
export function siteOffice(b, o) {
  const { x, y = 0, z, yaw = 0, w = 5.4, d = 2.6, h = 2.5 } = o;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const tx = (lx, lz) => x + c * lx + s * lz;
  const tz = (lx, lz) => z - s * lx + c * lz;

  for (const lx of [-w / 2 + 0.4, 0, w / 2 - 0.4]) {
    for (const lz of [-d / 2 + 0.3, d / 2 - 0.3]) {
      b.box({ x: tx(lx, lz), y: y + 0.12, z: tz(lx, lz), w: 0.4, h: 0.24, d: 0.4, yaw, mat: 'concreteBlock', surface: SURFACE.CONCRETE, collide: false });
    }
  }
  const fy = y + 0.24;
  b.box({ x, y: fy + h / 2, z, w, h, d, yaw, mat: 'sidingMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x, y: fy + h + 0.06, z, w: w + 0.24, h: 0.12, d: d + 0.24, yaw, mat: 'metalRoof', surface: SURFACE.METAL, collide: false });
  for (const lx of [-w * 0.28, w * 0.10]) {
    b.box({ x: tx(lx, d / 2 + 0.01), y: fy + 1.55, z: tz(lx, d / 2 + 0.01), w: 1.1, h: 0.75, d: 0.04, yaw, mat: 'anodized', surface: SURFACE.METAL, collide: false });
    const g = new THREE.BoxGeometry(1.0, 0.66, 0.02);
    const gm = new THREE.Mesh(g, b.mats.glass({ opacity: 0.4, transmission: 0.8 }));
    gm.position.set(tx(lx, d / 2 + 0.04), fy + 1.55, tz(lx, d / 2 + 0.04));
    gm.rotation.y = yaw;
    b.addExtra(gm);
  }
  b.box({ x: tx(w * 0.36, d / 2 + 0.02), y: fy + 1.0, z: tz(w * 0.36, d / 2 + 0.02), w: 0.85, h: 2.0, d: 0.06, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: tx(w * 0.36, d / 2 + 0.45), y: y + 0.12, z: tz(w * 0.36, d / 2 + 0.45), w: 1.0, h: 0.24, d: 0.7, yaw, mat: 'expandedMetal', surface: SURFACE.METAL });
  b.box({ x: tx(-w * 0.42, d / 2 + 0.03), y: fy + 1.35, z: tz(-w * 0.42, d / 2 + 0.03), w: 0.9, h: 0.7, d: 0.05, yaw, mat: 'paperPrint', surface: SURFACE.WOOD, collide: false });
  acUnit(b, { x: tx(w * 0.3, 0), y: fy + h + 0.12, z: tz(w * 0.3, 0), yaw });
  b.box({ x: tx(-w * 0.2, 0), y: fy + h + 0.22, z: tz(-w * 0.2, 0), w: 1.6, h: 0.06, d: 1.0, yaw, mat: 'solarPanel', surface: SURFACE.GLASS, collide: false });

  b.physics.addBox(x, fy + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.METAL });
  return b;
}

/* ================= 家具・屋内什器 ================= *
 *
 * マンション・博物館・駅・事務所の内装を組むための部品。
 * 屋内は視線が近く、細部がそのまま目に入る。
 * 脚・引き出し・取っ手・座面のたわみまで作らないと、
 * 「箱に色を塗っただけ」に見えてしまう。
 */

/** 事務机（天板・幕板・引き出し・脚） */
export function desk(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.4, d = 0.7, h = 0.72, mat = 'woodFloor' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  // 天板（縁を少し出す）
  b.box({ x, y: y + h - 0.018, z, w, h: 0.036, d, yaw, mat, surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + h - 0.048, z, w: w - 0.05, h: 0.026, d: d - 0.05, yaw, mat: 'plasticMatte', surface: SURFACE.WOOD, collide: false });
  // 幕板
  const [bx, bz] = at(0, -d / 2 + 0.05);
  b.box({ x: bx, y: y + h - 0.20, z: bz, w: w - 0.1, h: 0.26, d: 0.03, yaw, mat: 'plasticMatte', surface: SURFACE.WOOD, collide: false });
  // 脚（角パイプ）
  for (const lx of [-w / 2 + 0.06, w / 2 - 0.06]) {
    for (const lz of [-d / 2 + 0.06, d / 2 - 0.06]) {
      const [px, pz] = at(lx, lz);
      b.box({ x: px, y: y + (h - 0.05) / 2, z: pz, w: 0.045, h: h - 0.05, d: 0.045, yaw,
        mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
    }
  }
  // 引き出し 3 段（右袖）
  const dw = 0.36;
  for (let i = 0; i < 3; i++) {
    const dy = y + 0.16 + i * 0.18;
    const [px, pz] = at(w / 2 - dw / 2 - 0.05, 0);
    b.box({ x: px, y: dy, z: pz, w: dw, h: 0.165, d: d - 0.08, yaw, mat: 'plasticMatte', surface: SURFACE.WOOD, collide: false });
    // 取っ手
    const [hx, hz] = at(w / 2 - dw / 2 - 0.05, d / 2 - 0.03);
    b.box({ x: hx, y: dy + 0.04, z: hz, w: dw * 0.5, h: 0.018, d: 0.03, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.WOOD, penetration: 0.55 });
  return b;
}

/** 事務椅子（座面・背もたれ・ガスシリンダ・5 本脚とキャスタ） */
export function officeChair(b, o) {
  const { x, y = 0, z, yaw = 0, mat = 'fabric' } = o;
  const seatY = y + 0.45;
  // 座面（前縁を落として、板ではなくクッションに見せる）
  b.box({ x, y: seatY, z, w: 0.46, h: 0.07, d: 0.44, yaw, mat, surface: SURFACE.FABRIC, collide: false });
  b.box({ x, y: seatY - 0.045, z, w: 0.40, h: 0.03, d: 0.38, yaw, mat: 'plasticBlack', surface: SURFACE.FABRIC, collide: false });
  // 背もたれ（少し倒す）
  const bz = z - Math.cos(yaw) * 0.20, bx = x - Math.sin(yaw) * 0.20;
  b.box({ x: bx, y: seatY + 0.30, z: bz, w: 0.44, h: 0.46, d: 0.07, yaw, rx: 0.14, mat, surface: SURFACE.FABRIC, collide: false });
  // 支柱
  b.cylinder({ x, y: y + 0.10, z, radius: 0.032, height: 0.36, segments: 10, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: y + 0.06, z, radius: 0.055, height: 0.06, segments: 10, mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  // 5 本脚
  for (let i = 0; i < 5; i++) {
    const a = yaw + (i / 5) * Math.PI * 2;
    const lx = x + Math.sin(a) * 0.14, lz = z + Math.cos(a) * 0.14;
    b.box({ x: lx, y: y + 0.075, z: lz, w: 0.05, h: 0.035, d: 0.30, yaw: a, mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
    const wx = x + Math.sin(a) * 0.27, wz = z + Math.cos(a) * 0.27;
    b.cylinder({ x: wx, y: y + 0.005, z: wz, radius: 0.028, height: 0.055, segments: 8, mat: 'rubber', surface: SURFACE.RUBBER, collide: false });
  }
  b.physics.addCylinder(x, y + 0.42, z, 0.30, 0.42, { surface: SURFACE.FABRIC, penetration: 0.8 });
  return b;
}

/** スチール棚（棚板・支柱・筋交い・載っている箱） */
export function shelfUnit(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.8, d = 0.5, h = 2.0, tiers = 4, loaded = true } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  // 支柱（アングル材）
  for (const lx of [-w / 2 + 0.03, w / 2 - 0.03]) {
    for (const lz of [-d / 2 + 0.03, d / 2 - 0.03]) {
      const [px, pz] = at(lx, lz);
      b.box({ x: px, y: y + h / 2, z: pz, w: 0.05, h, d: 0.05, yaw, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
  }
  // 棚板
  for (let i = 0; i < tiers; i++) {
    const sy = y + 0.08 + (h - 0.2) * (i / (tiers - 1));
    b.box({ x, y: sy, z, w: w - 0.02, h: 0.028, d, yaw, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    // 棚板の折り返し（薄板が薄板に見えないように）
    const [fx, fz] = at(0, d / 2 - 0.012);
    b.box({ x: fx, y: sy - 0.022, z: fz, w: w - 0.02, h: 0.03, d: 0.022, yaw, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    if (!loaded || i === tiers - 1) continue;
    // 載っている物（段ごとに中身を変える）
    const n = 2 + Math.floor(R(0, 2.4));
    for (let k = 0; k < n; k++) {
      const lx = -w / 2 + 0.25 + k * (w - 0.5) / Math.max(1, n - 1) + R(-0.05, 0.05);
      const [px, pz] = at(lx, R(-0.06, 0.06));
      const bw = R(0.22, 0.36), bh = R(0.18, 0.30);
      b.box({ x: px, y: sy + 0.015 + bh / 2, z: pz, w: bw, h: bh, d: R(0.24, 0.36),
        yaw: yaw + R(-0.12, 0.12), mat: PICK(['cardboard', 'plywood', 'plasticMatte']),
        surface: SURFACE.FABRIC, collide: false });
    }
  }
  // 背面の筋交い
  const [b1x, b1z] = at(0, -d / 2 + 0.02);
  b.box({ x: b1x, y: y + h / 2, z: b1z, w: Math.hypot(w, h) - 0.2, h: 0.03, d: 0.02,
    yaw, rz: Math.atan2(h, w), mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.METAL, penetration: 0.35 });
  return b;
}

/** ロッカー（扉・ルーバー・取っ手・南京錠の掛け金） */
export function lockerBank(b, o) {
  const { x, y = 0, z, yaw = 0, doors = 4, h = 1.8, d = 0.5, mat = 'paintedMetal' } = o;
  const dw = 0.32, w = dw * doors;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat, surface: SURFACE.METAL, collide: false });
  // 台輪
  b.box({ x, y: y + 0.05, z, w: w + 0.02, h: 0.1, d: d + 0.02, yaw, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  for (let i = 0; i < doors; i++) {
    const lx = -w / 2 + dw * (i + 0.5);
    const [fx, fz] = at(lx, d / 2 + 0.012);
    // 扉
    b.box({ x: fx, y: y + h / 2 + 0.05, z: fz, w: dw - 0.03, h: h - 0.16, d: 0.02, yaw, mat, surface: SURFACE.METAL, collide: false });
    // ルーバー（通気口）
    for (let k = 0; k < 4; k++) {
      const [vx, vz] = at(lx, d / 2 + 0.02);
      b.box({ x: vx, y: y + h - 0.22 - k * 0.055, z: vz, w: dw - 0.13, h: 0.016, d: 0.012,
        yaw, rx: 0.4, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    }
    // 取っ手と掛け金
    const [hx, hz] = at(lx + dw * 0.28, d / 2 + 0.03);
    b.box({ x: hx, y: y + h * 0.52, z: hz, w: 0.03, h: 0.11, d: 0.025, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
    b.box({ x: hx, y: y + h * 0.52 - 0.09, z: hz, w: 0.05, h: 0.035, d: 0.02, yaw, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.METAL, penetration: 0.3 });
  return b;
}

/** ソファ（座面・背・肘掛け・脚。クッションの割れ目まで） */
export function sofa(b, o) {
  const { x, y = 0, z, yaw = 0, seats = 3, mat = 'fabric' } = o;
  const sw = 0.62, w = sw * seats + 0.3, d = 0.86;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  // 台座
  b.box({ x, y: y + 0.20, z, w, h: 0.24, d, yaw, mat, surface: SURFACE.FABRIC, collide: false });
  // 座クッション（1 人ぶんずつ。間に隙間を空ける）
  for (let i = 0; i < seats; i++) {
    const lx = -w / 2 + 0.15 + sw * (i + 0.5);
    const [px, pz] = at(lx, 0.04);
    b.box({ x: px, y: y + 0.38, z: pz, w: sw - 0.035, h: 0.14, d: d - 0.22, yaw, mat, surface: SURFACE.FABRIC, collide: false });
    // 背クッション
    const [bx2, bz2] = at(lx, -d / 2 + 0.16);
    b.box({ x: bx2, y: y + 0.60, z: bz2, w: sw - 0.045, h: 0.34, d: 0.20, yaw, rx: 0.10, mat, surface: SURFACE.FABRIC, collide: false });
  }
  // 背板
  const [rx2, rz2] = at(0, -d / 2 + 0.07);
  b.box({ x: rx2, y: y + 0.50, z: rz2, w, h: 0.60, d: 0.14, yaw, mat, surface: SURFACE.FABRIC, collide: false });
  // 肘掛け
  for (const sx of [-1, 1]) {
    const [ax, az] = at(sx * (w / 2 - 0.075), 0);
    b.box({ x: ax, y: y + 0.42, z: az, w: 0.15, h: 0.44, d, yaw, mat, surface: SURFACE.FABRIC, collide: false });
  }
  // 脚
  for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) {
    for (const lz of [-d / 2 + 0.1, d / 2 - 0.1]) {
      const [px, pz] = at(lx, lz);
      b.cylinder({ x: px, y, z: pz, radius: 0.026, height: 0.08, segments: 8, mat: 'wood', surface: SURFACE.WOOD, collide: false });
    }
  }
  b.physics.addBox(x, y + 0.34, z, w / 2, 0.34, d / 2, yaw, { surface: SURFACE.FABRIC, penetration: 0.7 });
  return b;
}

/** 食卓（天板・幕板・4 本脚） */
export function diningTable(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.5, d = 0.85, h = 0.72, mat = 'woodFloorDark' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  b.box({ x, y: y + h - 0.02, z, w, h: 0.04, d, yaw, mat, surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + h - 0.055, z, w: w - 0.08, h: 0.03, d: d - 0.08, yaw, mat, surface: SURFACE.WOOD, collide: false });
  for (const lx of [-w / 2 + 0.09, w / 2 - 0.09]) {
    for (const lz of [-d / 2 + 0.09, d / 2 - 0.09]) {
      const [px, pz] = at(lx, lz);
      b.box({ x: px, y: y + (h - 0.07) / 2, z: pz, w: 0.06, h: h - 0.07, d: 0.06, yaw, mat, surface: SURFACE.WOOD, collide: false });
    }
  }
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.WOOD, penetration: 0.6 });
  return b;
}

/** 木の椅子（座面・背もたれの桟・4 本脚・貫） */
export function woodChair(b, o) {
  const { x, y = 0, z, yaw = 0, mat = 'wood' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const sh = 0.45;
  b.box({ x, y: y + sh, z, w: 0.42, h: 0.035, d: 0.40, yaw, mat, surface: SURFACE.WOOD, collide: false });
  // 背もたれ（縦framework + 横桟 2 本）
  for (const sx of [-0.17, 0.17]) {
    const [px, pz] = at(sx, -0.18);
    b.box({ x: px, y: y + sh + 0.23, z: pz, w: 0.035, h: 0.46, d: 0.035, yaw, mat, surface: SURFACE.WOOD, collide: false });
  }
  for (const by of [0.28, 0.42]) {
    const [px, pz] = at(0, -0.18);
    b.box({ x: px, y: y + sh + by, z: pz, w: 0.37, h: 0.055, d: 0.025, yaw, mat, surface: SURFACE.WOOD, collide: false });
  }
  // 脚と貫
  for (const lx of [-0.17, 0.17]) {
    for (const lz of [-0.17, 0.17]) {
      const [px, pz] = at(lx, lz);
      b.box({ x: px, y: y + sh / 2, z: pz, w: 0.035, h: sh, d: 0.035, yaw, mat, surface: SURFACE.WOOD, collide: false });
    }
  }
  for (const lz of [-0.17, 0.17]) {
    const [px, pz] = at(0, lz);
    b.box({ x: px, y: y + 0.16, z: pz, w: 0.34, h: 0.025, d: 0.02, yaw, mat, surface: SURFACE.WOOD, collide: false });
  }
  b.physics.addBox(x, y + 0.35, z, 0.22, 0.35, 0.21, yaw, { surface: SURFACE.WOOD, penetration: 0.7 });
  return b;
}

/** ベッド（フレーム・マットレス・掛け布団・枕） */
export function bed(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.0, d = 2.0, mat = 'fabric' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  // フレーム
  b.box({ x, y: y + 0.14, z, w: w + 0.06, h: 0.28, d: d + 0.06, yaw, mat: 'woodDark', surface: SURFACE.WOOD, collide: false });
  // ヘッドボード
  const [hx, hz] = at(0, -d / 2 - 0.02);
  b.box({ x: hx, y: y + 0.55, z: hz, w: w + 0.06, h: 0.62, d: 0.06, yaw, mat: 'woodDark', surface: SURFACE.WOOD, collide: false });
  // マットレス
  b.box({ x, y: y + 0.39, z, w, h: 0.22, d, yaw, mat: 'fabric', surface: SURFACE.FABRIC, collide: false });
  // 掛け布団（足元側だけ厚く、めくれた感じに）
  const [qx, qz] = at(0, 0.28);
  b.box({ x: qx, y: y + 0.52, z: qz, w: w + 0.04, h: 0.10, d: d * 0.66, yaw, mat, surface: SURFACE.FABRIC, collide: false });
  const [q2x, q2z] = at(0, d / 2 - 0.16);
  b.box({ x: q2x, y: y + 0.55, z: q2z, w: w + 0.04, h: 0.14, d: 0.34, yaw, rx: -0.12, mat, surface: SURFACE.FABRIC, collide: false });
  // 枕
  const [px, pz] = at(0, -d / 2 + 0.24);
  b.box({ x: px, y: y + 0.56, z: pz, w: w - 0.22, h: 0.11, d: 0.34, yaw, rx: 0.08, mat: 'fabric', surface: SURFACE.FABRIC, collide: false });
  b.physics.addBox(x, y + 0.28, z, (w + 0.06) / 2, 0.28, (d + 0.06) / 2, yaw, { surface: SURFACE.FABRIC, penetration: 0.5 });
  return b;
}

/** 洋服だんす／収納棚（両開きの扉・取っ手・台輪） */
export function wardrobe(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.1, d = 0.58, h = 1.9, mat = 'woodFloor' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat, surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + 0.04, z, w: w - 0.06, h: 0.08, d: d - 0.06, yaw, mat: 'woodDark', surface: SURFACE.WOOD, collide: false });
  // 天板の縁
  b.box({ x, y: y + h + 0.015, z, w: w + 0.04, h: 0.03, d: d + 0.04, yaw, mat, surface: SURFACE.WOOD, collide: false });
  // 扉 2 枚
  for (const sx of [-1, 1]) {
    const [dx, dz] = at(sx * w / 4, d / 2 + 0.012);
    b.box({ x: dx, y: y + h / 2 + 0.04, z: dz, w: w / 2 - 0.02, h: h - 0.14, d: 0.02, yaw, mat, surface: SURFACE.WOOD, collide: false });
    const [gx, gz] = at(sx * 0.05, d / 2 + 0.03);
    b.box({ x: gx, y: y + h * 0.5, z: gz, w: 0.02, h: 0.16, d: 0.022, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.WOOD, penetration: 0.45 });
  return b;
}

/** 冷蔵庫（本体・上下の扉・ハンドル・放熱の隙間） */
export function fridge(b, o) {
  const { x, y = 0, z, yaw = 0, w = 0.6, d = 0.65, h = 1.75, mat = 'stainless' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat, surface: SURFACE.METAL, collide: false });
  // 上（冷凍）と下（冷蔵）の扉
  for (const [dy, dh] of [[h * 0.78, h * 0.38], [h * 0.30, h * 0.55]]) {
    const [fx, fz] = at(0, d / 2 + 0.012);
    b.box({ x: fx, y: y + dy, z: fz, w: w - 0.02, h: dh - 0.02, d: 0.02, yaw, mat, surface: SURFACE.METAL, collide: false });
    const [hx, hz] = at(w / 2 - 0.08, d / 2 + 0.035);
    b.box({ x: hx, y: y + dy, z: hz, w: 0.028, h: dh * 0.55, d: 0.028, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  // 台輪の通気
  b.box({ x, y: y + 0.035, z, w: w - 0.05, h: 0.05, d: d - 0.04, yaw, mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.METAL, penetration: 0.3 });
  return b;
}

/** 流し台（天板・シンク・水栓・扉） */
export function kitchenUnit(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.8, d = 0.62, h = 0.85 } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat: 'plasticMatte', surface: SURFACE.WOOD, collide: false });
  // ステンレスの天板
  b.box({ x, y: y + h + 0.02, z, w: w + 0.03, h: 0.04, d: d + 0.03, yaw, mat: 'stainless', surface: SURFACE.METAL, collide: false });
  // シンク（縁を残して窪ませる）
  const [sx2, sz2] = at(-w / 4, 0);
  b.box({ x: sx2, y: y + h - 0.10, z: sz2, w: 0.46, h: 0.2, d: 0.38, yaw, mat: 'stainless', surface: SURFACE.METAL, collide: false });
  b.box({ x: sx2, y: y + h - 0.02, z: sz2, w: 0.40, h: 0.05, d: 0.32, yaw, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  // 水栓
  const [tx, tz] = at(-w / 4, -d / 2 + 0.10);
  b.cylinder({ x: tx, y: y + h + 0.04, z: tz, radius: 0.022, height: 0.26, segments: 10, mat: 'chrome', surface: SURFACE.METAL, collide: false });
  b.box({ x: tx, y: y + h + 0.29, z: tz + 0.09, w: 0.03, h: 0.03, d: 0.20, yaw, mat: 'chrome', surface: SURFACE.METAL, collide: false });
  // 扉と引き出し
  for (let i = 0; i < 3; i++) {
    const lx = -w / 2 + w / 3 * (i + 0.5);
    const [dx, dz] = at(lx, d / 2 + 0.012);
    b.box({ x: dx, y: y + h * 0.48, z: dz, w: w / 3 - 0.03, h: h - 0.18, d: 0.02, yaw, mat: 'plasticMatte', surface: SURFACE.WOOD, collide: false });
    const [gx, gz] = at(lx, d / 2 + 0.03);
    b.box({ x: gx, y: y + h - 0.16, z: gz, w: w / 3 * 0.5, h: 0.02, d: 0.025, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.WOOD, penetration: 0.5 });
  return b;
}

/** テレビと台 */
export function tvSet(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.2, screen = 1.0 } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  // 台
  b.box({ x, y: y + 0.22, z, w, h: 0.44, d: 0.40, yaw, mat: 'woodFloorDark', surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + 0.45, z, w: w + 0.04, h: 0.03, d: 0.44, yaw, mat: 'woodFloorDark', surface: SURFACE.WOOD, collide: false });
  // スタンド
  b.box({ x, y: y + 0.51, z, w: 0.3, h: 0.09, d: 0.16, yaw, mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  // 画面（枠 + 黒い面）
  b.box({ x, y: y + 0.85, z, w: screen + 0.03, h: screen * 0.60 + 0.03, d: 0.05, yaw, mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  const [fx, fz] = at(0, 0.028);
  b.box({ x: fx, y: y + 0.85, z: fz, w: screen, h: screen * 0.60, d: 0.008, yaw, mat: 'acrylic', surface: SURFACE.GLASS, collide: false });
  b.physics.addBox(x, y + 0.24, z, w / 2, 0.24, 0.22, yaw, { surface: SURFACE.WOOD, penetration: 0.6 });
  return b;
}

/** 本棚（側板・棚板・並んだ本） */
export function bookshelf(b, o) {
  const { x, y = 0, z, yaw = 0, w = 0.9, d = 0.30, h = 1.85, tiers = 5, mat = 'woodFloor' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (w / 2 - 0.01), 0);
    b.box({ x: px, y: y + h / 2, z: pz, w: 0.02, h, d, yaw, mat, surface: SURFACE.WOOD, collide: false });
  }
  const [bx, bz] = at(0, -d / 2 + 0.006);
  b.box({ x: bx, y: y + h / 2, z: bz, w, h, d: 0.012, yaw, mat: 'plywood', surface: SURFACE.WOOD, collide: false });
  for (let i = 0; i <= tiers; i++) {
    const sy = y + 0.03 + (h - 0.06) * (i / tiers);
    b.box({ x, y: sy, z, w: w - 0.04, h: 0.02, d, yaw, mat, surface: SURFACE.WOOD, collide: false });
    if (i === tiers) continue;
    // 本を並べる（高さと厚みをばらす。傾いた 1 冊を混ぜる）
    let lx = -w / 2 + 0.05;
    while (lx < w / 2 - 0.08) {
      const t = R(0.018, 0.045);
      const bh = R(0.20, 0.28);
      const [px, pz] = at(lx + t / 2, 0.01);
      b.box({ x: px, y: sy + 0.01 + bh / 2, z: pz, w: t, h: bh, d: d - 0.06,
        yaw, rz: Math.random() < 0.08 ? R(0.10, 0.22) : 0,
        mat: PICK(['paperPrint', 'leather', 'cardboard', 'plasticMatte']),
        surface: SURFACE.FABRIC, collide: false });
      lx += t + 0.004;
    }
  }
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.WOOD, penetration: 0.45 });
  return b;
}

/** ベンチ（駅・公園。座面の板と鋳物の脚） */
export function bench(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.8, back = true } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  // 座面の板 4 枚（隙間を空ける）
  for (let i = 0; i < 4; i++) {
    const [px, pz] = at(0, -0.18 + i * 0.11);
    b.box({ x: px, y: y + 0.44, z: pz, w, h: 0.035, d: 0.09, yaw, mat: 'woodDark', surface: SURFACE.WOOD, collide: false });
  }
  if (back) {
    for (let i = 0; i < 3; i++) {
      const [px, pz] = at(0, -0.22);
      b.box({ x: px, y: y + 0.60 + i * 0.12, z: pz, w, h: 0.035, d: 0.09, yaw, rx: 0.16,
        mat: 'woodDark', surface: SURFACE.WOOD, collide: false });
    }
  }
  // 脚（鋳物）
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (w / 2 - 0.16), 0);
    b.box({ x: px, y: y + 0.22, z: pz, w: 0.05, h: 0.44, d: 0.44, yaw, mat: 'castIron', surface: SURFACE.METAL, collide: false });
    b.box({ x: px, y: y + 0.02, z: pz, w: 0.09, h: 0.04, d: 0.52, yaw, mat: 'castIron', surface: SURFACE.METAL, collide: false });
    if (back) {
      const [bx2, bz2] = at(sx * (w / 2 - 0.16), -0.20);
      b.box({ x: bx2, y: y + 0.62, z: bz2, w: 0.05, h: 0.45, d: 0.05, yaw, rx: 0.16, mat: 'castIron', surface: SURFACE.METAL, collide: false });
    }
  }
  b.physics.addBox(x, y + 0.24, z, w / 2, 0.24, 0.26, yaw, { surface: SURFACE.WOOD, penetration: 0.55 });
  return b;
}

/** 受付・売店のカウンター */
export function counter(b, o) {
  const { x, y = 0, z, yaw = 0, w = 2.4, d = 0.7, h = 1.05, mat = 'woodFloorDark' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat, surface: SURFACE.WOOD });
  // 天板（前へ張り出す）
  const [tx, tz] = at(0, 0.06);
  b.box({ x: tx, y: y + h + 0.02, z: tz, w: w + 0.1, h: 0.05, d: d + 0.16, yaw, mat: 'marbleDark', surface: SURFACE.CONCRETE, collide: false });
  // 幕板の見切り
  const [ax, az] = at(0, d / 2 + 0.012);
  b.box({ x: ax, y: y + h - 0.14, z: az, w: w - 0.06, h: 0.03, d: 0.02, yaw, mat: 'brassPolished', surface: SURFACE.METAL, collide: false });
  b.box({ x: ax, y: y + 0.09, z: az, w: w - 0.06, h: 0.10, d: 0.02, yaw, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  return b;
}

/** 観葉植物（鉢・土・葉） */
export function potPlant(b, o) {
  const { x, y = 0, z, height = 1.1 } = o;
  b.cylinder({ x, y, z, radius: 0.20, height: 0.30, segments: 12, mat: 'ceramicTile', surface: SURFACE.CONCRETE, collide: false });
  b.cylinder({ x, y: y + 0.30, z, radius: 0.215, height: 0.04, segments: 12, mat: 'ceramicTile', surface: SURFACE.CONCRETE, collide: false });
  b.cylinder({ x, y: y + 0.28, z, radius: 0.18, height: 0.04, segments: 12, mat: 'mud', surface: SURFACE.DIRT, collide: false });
  // 幹
  b.cylinder({ x, y: y + 0.30, z, radius: 0.028, height: height * 0.45, segments: 6, mat: 'bark', surface: SURFACE.WOOD, collide: false });
  // 葉（板を放射状に）
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R(-0.2, 0.2);
    const r = R(0.16, 0.34);
    const ly = y + 0.30 + height * R(0.35, 0.95);
    b.box({
      x: x + Math.cos(a) * r * 0.5, y: ly, z: z + Math.sin(a) * r * 0.5,
      w: r * 1.5, h: 0.012, d: 0.16, yaw: a, rz: R(-0.5, -0.15),
      mat: 'foliage', surface: SURFACE.FABRIC, collide: false,
    });
  }
  b.physics.addCylinder(x, y + 0.16, z, 0.21, 0.16, { surface: SURFACE.CONCRETE, penetration: 0.6 });
  return b;
}

/** ごみ箱（屋内用） */
export function trashBin(b, o) {
  const { x, y = 0, z, mat = 'brushedMetal', height = 0.62 } = o;
  b.cylinder({ x, y, z, radius: 0.17, height, segments: 14, mat, surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: y + height, z, radius: 0.185, height: 0.03, segments: 14, mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: y + height - 0.02, z, radius: 0.145, height: 0.02, segments: 14, mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  b.physics.addCylinder(x, y + height / 2, z, 0.18, height / 2, { surface: SURFACE.METAL, penetration: 0.7 });
  return b;
}

export const PROPS = {
  woodCrate, ammoCrate, barrel, sandbagStack, pallet, tireStack, cardboardStack,
  container, acUnit, railing, pipeRun, marketStall, clothesline, rubble,
  streetLight, utilityPole, vehicle, sign, waterTank, rooftopClutter, jerryCan, litter,
  chainFence, scaffold, rebarBundle, formworkStack, blockPallet, aggregatePile,
  siteBarrier, siteOffice,
  desk, officeChair, shelfUnit, lockerBank, sofa, diningTable, woodChair,
  bed, wardrobe, fridge, kitchenUnit, tvSet, bookshelf, bench, counter,
  potPlant, trashBin,
};
