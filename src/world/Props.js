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
  b.physics.addBox(x, y + height / 2, z, radius * 0.9, height / 2, radius * 0.9, 0, { surface: SURFACE.METAL, penetration: 0.4 });
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
  b.physics.addBox(x, y + count * 0.095, z, 0.40, count * 0.095, 0.40, 0, { surface: SURFACE.RUBBER, penetration: 0.35 });
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
  const { x, y = 0, z, yaw = 0, w = 2.6, d = 1.7, h = 2.25, cloth = 'fabric' } = o;
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
  b.box({ x, y: y + 0.86, z, w: w * 0.92, h: 0.06, d: d * 0.75, yaw, mat: 'plywood', surface: SURFACE.WOOD, collide: false });
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
  b.cylinder({ x, y, z, radius: 0.075, height, segments: 10, mat: 'paintedMetalTan', surface: SURFACE.METAL });
  // アーム
  const armLen = 1.1;
  b.box({
    x: x + Math.sin(yaw) * armLen / 2, y: y + height - 0.06, z: z + Math.cos(yaw) * armLen / 2,
    w: 0.07, h: 0.07, d: armLen, yaw, mat: 'paintedMetalTan', surface: SURFACE.METAL, collide: false,
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

  b.physics.addBox(x, y + wheelR + H / 2, z, W / 2, (wheelR + H) / 2 + 0.1, L / 2, yaw, { surface: SURFACE.METAL, penetration: 0.25 });
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
  b.physics.addBox(x, y + height / 2, z, radius * 0.9, height / 2, radius * 0.9, 0, { surface: SURFACE.METAL, penetration: 0.4 });
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

export const PROPS = {
  woodCrate, ammoCrate, barrel, sandbagStack, pallet, tireStack, cardboardStack,
  container, acUnit, railing, pipeRun, marketStall, clothesline, rubble,
  streetLight, utilityPole, vehicle, sign, waterTank, rooftopClutter, jerryCan, litter,
};
