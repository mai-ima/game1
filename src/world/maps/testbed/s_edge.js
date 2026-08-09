import * as THREE from 'three';
import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import { mulberry32 } from './common.js';

/**
 * 敷地の境界と、その外側。
 *
 * これまで外周は金網を一周させただけで、二つの問題があった。
 *
 *  1. 金網は斜めから見ると 1 画素に何本もの線が入る。
 *     敷地をぐるりと囲むと、どこを向いても必ず視界の端に
 *     グレージング角の網が入り、ちらつき続ける。
 *  2. 網の向こうに何も無いので、世界が 94m で終わっているのが
 *     はっきり見えてしまう。外を見せる囲いなら、
 *     外に何か無ければならない。
 *
 * ここでは
 *   ・大半をコンクリート塀と仮囲いにして、視線を止める
 *   ・要所だけ金網（正門・見通しの要る所）にする
 *   ・塀の外へ、近景・中景・遠景の 3 段で街を置く
 * という作りにする。
 */

/** 塀の高さ */
const WALL_H = 3.4;

/**
 * 敷地境界。
 * @param {object} o {west, east, north, south}
 */
export function sectionEdge(b, o) {
  const { west, east, north, south } = o;
  const rand = mulberry32(90210);

  /* ================= 境界の構成 =================
   * 辺ごとに、区間を切って作りを変える。
   * 一種類で回すと「囲われている」以上の情報が出ない。
   */
  const runs = [
    // 北辺（実験場・博物館の裏。閉じた塀）
    { a: [west, north], b: [east, north], kind: 'wall' },
    // 南辺（射撃場の背後。土手を兼ねた高い塀）
    { a: [west, south], b: [east, south], kind: 'berm' },
    // 西辺（建物街の裏。仮囲い）
    { a: [west, north], b: [west, south], kind: 'hoarding' },
    // 東辺（資材の搬入路。金網と正門）
    { a: [east, north], b: [east, south], kind: 'fence' },
  ];

  for (const r of runs) {
    const [x1, z1] = r.a, [x2, z2] = r.b;
    if (r.kind === 'wall') concreteWall(b, x1, z1, x2, z2, rand);
    else if (r.kind === 'berm') bermWall(b, x1, z1, x2, z2, rand);
    else if (r.kind === 'hoarding') hoarding(b, x1, z1, x2, z2, rand);
    else fenceRun(b, x1, z1, x2, z2, rand);
  }

  skyline(b, { west, east, north, south }, rand);
}

/* ================================================================= *
 *  塀の種類
 * ================================================================= */

/** 向きと長さを求める */
function axis(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  return { len, yaw: Math.atan2(dx, dz), ux: dx / len, uz: dz / len, nx: -dz / len, nz: dx / len };
}

/**
 * コンクリート塀（プレキャストの板をH鋼の柱で挟む、いわゆる万年塀）。
 * 日本の敷地境界でいちばん見かける形。
 */
function concreteWall(b, x1, z1, x2, z2, rand) {
  const A = axis(x1, z1, x2, z2);
  const PITCH = 2.0;                       // 柱の間隔
  const n = Math.max(1, Math.round(A.len / PITCH));
  const step = A.len / n;

  for (let i = 0; i <= n; i++) {
    const t = i * step;
    const px = x1 + A.ux * t, pz = z1 + A.uz * t;
    // H 鋼の柱
    b.box({ x: px, y: WALL_H / 2, z: pz, w: 0.22, h: WALL_H, d: 0.16, yaw: A.yaw,
      mat: 'concreteRaw', surface: SURFACE.CONCRETE });
    b.box({ x: px, y: WALL_H + 0.04, z: pz, w: 0.26, h: 0.08, d: 0.20, yaw: A.yaw,
      mat: 'concrete', surface: SURFACE.CONCRETE, collide: false });
  }
  // 板（1 枚ずつ高さと汚れが違う）
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * step;
    const px = x1 + A.ux * t, pz = z1 + A.uz * t;
    const boards = 5;
    for (let k = 0; k < boards; k++) {
      const by = 0.15 + k * ((WALL_H - 0.2) / boards);
      b.box({
        x: px, y: by + (WALL_H - 0.2) / boards / 2, z: pz,
        w: 0.09, h: (WALL_H - 0.2) / boards - 0.02, d: step - 0.14, yaw: A.yaw,
        mat: k === boards - 1 ? 'concrete' : 'concreteRaw', surface: SURFACE.CONCRETE, collide: false,
      });
    }
    // 基礎の立ち上がり
    b.box({ x: px, y: 0.09, z: pz, w: 0.20, h: 0.18, d: step + 0.06, yaw: A.yaw,
      mat: 'concrete', surface: SURFACE.CONCRETE });
    // 汚れ（雨だれと苔）。板を貼っただけでは新品の塀にしか見えない
    if (rand() < 0.55) {
      const off = (rand() - 0.5) * (step - 0.6);
      b.box({
        x: px + A.ux * off + A.nx * 0.055, y: WALL_H * 0.55, z: pz + A.uz * off + A.nz * 0.055,
        w: 0.012, h: WALL_H * (0.30 + rand() * 0.35), d: 0.07 + rand() * 0.14, yaw: A.yaw,
        mat: 'sootFaint', surface: SURFACE.CONCRETE, collide: false,
      });
    }
    if (rand() < 0.35) {
      b.box({
        x: px + A.nx * 0.055, y: 0.28 + rand() * 0.2, z: pz + A.nz * 0.055,
        w: 0.012, h: 0.16, d: step * (0.3 + rand() * 0.4), yaw: A.yaw,
        mat: 'mossFaint', surface: SURFACE.CONCRETE, collide: false,
      });
    }
  }
  // 天端の忍び返し（有刺鉄線を張る腕木）
  for (let i = 0; i <= n; i += 2) {
    const t = i * step;
    b.box({
      x: x1 + A.ux * t - A.nx * 0.12, y: WALL_H + 0.22, z: z1 + A.uz * t - A.nz * 0.12,
      w: 0.035, h: 0.42, d: 0.035, yaw: A.yaw, rz: 0.5,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false,
    });
  }
  for (const hy of [WALL_H + 0.26, WALL_H + 0.40]) {
    b.box({
      x: (x1 + x2) / 2 - A.nx * 0.24, y: hy, z: (z1 + z2) / 2 - A.nz * 0.24,
      w: 0.018, h: 0.018, d: A.len, yaw: A.yaw,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false, blocksBullets: false,
    });
  }
}

/**
 * 土手を背負った塀。
 * 射撃場の背後に置く。跳弾を止める盛土と、その上の低い塀。
 */
function bermWall(b, x1, z1, x2, z2, rand) {
  const A = axis(x1, z1, x2, z2);
  // 盛土（3 段の台形で近似。1 枚の斜面だと板に見える）
  const steps = [[0, 3.4, 0.0], [1.1, 2.4, 0.9], [2.0, 1.5, 1.6]];
  for (const [rise, half, back] of steps) {
    b.box({
      x: (x1 + x2) / 2 - A.nx * back, y: rise + 0.55, z: (z1 + z2) / 2 - A.nz * back,
      w: half * 2, h: 1.1, d: A.len, yaw: A.yaw,
      mat: rise === 0 ? 'gravel' : 'dirt', surface: rise === 0 ? SURFACE.GRAVEL : SURFACE.DIRT,
    });
  }
  // 天端の擁壁
  b.box({
    x: (x1 + x2) / 2 - A.nx * 1.6, y: 3.9, z: (z1 + z2) / 2 - A.nz * 1.6,
    w: 0.35, h: 1.2, d: A.len, yaw: A.yaw, mat: 'concreteRaw', surface: SURFACE.CONCRETE,
  });
  // 法面の草
  const n = Math.round(A.len / 3.2);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * (A.len / n);
    for (const [back, ry] of [[0.7, 1.15], [1.5, 2.1]]) {
      if (rand() < 0.4) continue;
      b.box({
        x: x1 + A.ux * t - A.nx * back + (rand() - 0.5) * 1.6,
        y: ry, z: z1 + A.uz * t - A.nz * back + (rand() - 0.5) * 1.6,
        w: 0.8 + rand() * 1.4, h: 0.05, d: 0.7 + rand(), yaw: A.yaw + rand(),
        mat: rand() < 0.5 ? 'grass' : 'grassDry', surface: SURFACE.DIRT, collide: false,
      });
    }
  }
}

/**
 * 仮囲い（工事現場のガルバリウム鋼板）。
 * 実際の街でいちばん多い「向こうが見えない境界」。
 */
function hoarding(b, x1, z1, x2, z2, rand) {
  const A = axis(x1, z1, x2, z2);
  const H = 3.0;
  const PITCH = 1.8;
  const n = Math.max(1, Math.round(A.len / PITCH));
  const step = A.len / n;

  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * step;
    const px = x1 + A.ux * t, pz = z1 + A.uz * t;
    // 鋼板（わずかに傾いて継ぎ目に段差ができる）
    const tilt = (rand() - 0.5) * 0.012;
    b.box({ x: px, y: H / 2, z: pz, w: 0.05, h: H, d: step - 0.02, yaw: A.yaw + tilt,
      mat: 'sidingMetal', surface: SURFACE.METAL });
    // 継ぎ目の縦桟
    b.box({ x: x1 + A.ux * (i * step), y: H / 2, z: z1 + A.uz * (i * step),
      w: 0.09, h: H, d: 0.07, yaw: A.yaw, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    // 単管の控え（裏側へ斜めに突っ張る）
    if (i % 2 === 0) {
      const len = Math.hypot(1.4, 2.2);
      b.box({
        x: px + A.nx * 0.75, y: 1.25, z: pz + A.nz * 0.75,
        w: 0.05, h: 0.05, d: len, yaw: A.yaw + Math.PI / 2, rx: Math.atan2(2.2, 1.4) - Math.PI / 2,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false,
      });
      b.box({ x: px + A.nx * 1.45, y: 0.05, z: pz + A.nz * 1.45, w: 0.30, h: 0.10, d: 0.30, yaw: A.yaw,
        mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
    }
    // 上下の胴縁
    for (const hy of [0.55, H - 0.55]) {
      b.box({ x: px + A.nx * 0.045, y: hy, z: pz + A.nz * 0.045, w: 0.05, h: 0.06, d: step, yaw: A.yaw,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    // 汚れと貼り紙
    if (rand() < 0.3) {
      b.box({
        x: px - A.nx * 0.030, y: 0.6 + rand() * 1.6, z: pz - A.nz * 0.030,
        w: 0.008, h: 0.45 + rand() * 0.4, d: 0.35 + rand() * 0.5, yaw: A.yaw,
        mat: 'posterWall', surface: SURFACE.CONCRETE, collide: false,
      });
    }
    if (rand() < 0.4) {
      b.box({
        x: px - A.nx * 0.030, y: 0.35, z: pz - A.nz * 0.030,
        w: 0.008, h: 0.45, d: step * 0.7, yaw: A.yaw,
        mat: 'sootFaint', surface: SURFACE.CONCRETE, collide: false,
      });
    }
  }
}

/**
 * 金網の区間。
 * 「向こうを見せたい」所にだけ使う。
 * 一周させると、どこを向いても斜めの網が視界に入ってちらつく。
 */
function fenceRun(b, x1, z1, x2, z2, rand) {
  const A = axis(x1, z1, x2, z2);
  // 中央 1/3 を正門、その両脇だけ金網、残りは塀
  const g0 = A.len * 0.40, g1 = A.len * 0.60;
  concreteWall(b, x1, z1, x1 + A.ux * (g0 - 8), z1 + A.uz * (g0 - 8), rand);
  concreteWall(b, x1 + A.ux * (g1 + 8), z1 + A.uz * (g1 + 8), x2, z2, rand);

  P.chainFence(b, {
    x1: x1 + A.ux * (g0 - 8), z1: z1 + A.uz * (g0 - 8),
    x2: x1 + A.ux * g0, z2: z1 + A.uz * g0, h: 2.6,
  });
  P.chainFence(b, {
    x1: x1 + A.ux * g1, z1: z1 + A.uz * g1,
    x2: x1 + A.ux * (g1 + 8), z2: z1 + A.uz * (g1 + 8), h: 2.6,
  });

  /* ---- 正門 ---- */
  const mx = x1 + A.ux * ((g0 + g1) / 2), mz = z1 + A.uz * ((g0 + g1) / 2);
  // 門柱
  for (const s of [-1, 1]) {
    const px = mx + A.ux * s * ((g1 - g0) / 2), pz = mz + A.uz * s * ((g1 - g0) / 2);
    b.box({ x: px, y: 2.1, z: pz, w: 0.55, h: 4.2, d: 0.55, yaw: A.yaw,
      mat: 'concrete', surface: SURFACE.CONCRETE });
    b.box({ x: px, y: 4.28, z: pz, w: 0.70, h: 0.16, d: 0.70, yaw: A.yaw,
      mat: 'granite', surface: SURFACE.CONCRETE, collide: false });
  }
  // 引き戸（半分開いている）
  const gateW = (g1 - g0) * 0.55;
  P.chainFence(b, {
    x1: mx - A.ux * ((g1 - g0) / 2 - 0.3), z1: mz - A.uz * ((g1 - g0) / 2 - 0.3),
    x2: mx - A.ux * ((g1 - g0) / 2 - 0.3 - gateW), z2: mz - A.uz * ((g1 - g0) / 2 - 0.3 - gateW),
    h: 2.4, panel: gateW,
  });
  // レールと戸当たり
  b.box({ x: mx, y: 0.02, z: mz, w: 0.10, h: 0.04, d: (g1 - g0), yaw: A.yaw,
    mat: 'railSteel', surface: SURFACE.METAL, collide: false });
  // 門札
  P.sign(b, {
    x: mx + A.ux * ((g1 - g0) / 2) - A.nx * 0.32, y: 2.4,
    z: mz + A.uz * ((g1 - g0) / 2) - A.nz * 0.32,
    yaw: A.yaw + Math.PI / 2, w: 1.6, h: 0.55, mat: 'paintedMetal',
    text: 'テストベッド 正門', sub: 'MAIN GATE',
  });
}

/* ================================================================= *
 *  外の街
 * ================================================================= */

/**
 * 塀の外の街並み。
 *
 * 近景（塀のすぐ外）・中景・遠景の 3 段で置く。
 * 遠景だけ置いても「絵が貼ってある」ようにしか見えない。
 * 段が重なって初めて、街が奥へ続いているように見える。
 *
 * どれも当たり判定を持たず、影も落とさない。
 * 見えるためだけの物なので、負荷はほぼ描画分だけ。
 */
function skyline(b, bounds, rand) {
  const { west, east, north, south } = bounds;
  const cx = (west + east) / 2, cz = (north + south) / 2;

  /*
   * 外の地面。
   *
   * これを忘れると、塀の向こうのビルが宙に浮く。
   * 敷地の床は 184×164m しか無いので、その外側は
   * 「何も無い＝空が見える」になり、街が空中に立っているように見えた。
   *
   * 敷地より 6cm 低くしてある。同じ高さにすると、
   * どちらの面が手前か決まらず、境目がちらつく。
   */
  b.box({ x: cx, y: -0.10, z: cz, w: 1400, h: 0.2, d: 1400,
    mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  // 敷地のまわりだけ舗装を変えて、外周道路に見せる
  for (const [ox, oz, w, d] of [
    [0, north - 14, (east - west) + 80, 16],
    [0, south + 14, (east - west) + 80, 16],
    [west - 14, 0, 16, (south - north) + 80],
    [east + 14, 0, 16, (south - north) + 80],
  ]) {
    b.box({ x: cx + ox, y: -0.06, z: cz + oz, w, h: 0.1, d,
      mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
    // 中央線
    const horiz = w > d;
    b.box({ x: cx + ox, y: -0.005, z: cz + oz, w: horiz ? w : 0.14, h: 0.1, d: horiz ? 0.14 : d,
      mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }

  /** 1 棟。窓の帯・屋上の設備・パラペットまで入れる */
  const block = (x, z, w, d, h, yaw, mat, detail) => {
    b.box({ x, y: h / 2, z, w, h, d, yaw, mat, surface: SURFACE.CONCRETE, collide: false });
    // パラペット
    b.box({ x, y: h + 0.35, z, w: w + 0.25, h: 0.7, d: d + 0.25, yaw,
      mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
    if (!detail) return;
    // 窓の帯（階ごとに 1 本。1 枚ずつ置くと遠景で潰れるだけ）
    const floors = Math.max(2, Math.floor(h / 3.2));
    for (let f = 1; f <= floors; f++) {
      const fy = (h / (floors + 1)) * f;
      for (const s of [-1, 1]) {
        b.box({ x: x + Math.sin(yaw) * s * (d / 2 + 0.03), y: fy, z: z + Math.cos(yaw) * s * (d / 2 + 0.03),
          w: w * 0.86, h: 1.5, d: 0.06, yaw, mat: 'screenPanel', surface: SURFACE.GLASS, collide: false });
      }
      for (const s of [-1, 1]) {
        b.box({ x: x + Math.cos(yaw) * s * (w / 2 + 0.03), y: fy, z: z - Math.sin(yaw) * s * (w / 2 + 0.03),
          w: 0.06, h: 1.5, d: d * 0.86, yaw, mat: 'screenPanel', surface: SURFACE.GLASS, collide: false });
      }
    }
    // 屋上の塔屋と設備
    b.box({ x: x + w * 0.2, y: h + 1.5, z: z - d * 0.15, w: w * 0.3, h: 2.2, d: d * 0.35, yaw,
      mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
    if (rand() < 0.6) {
      P.waterTank(b, { x: x - w * 0.22, y: h + 1.4, z: z + d * 0.18, radius: Math.min(1.4, w * 0.16), height: 1.6, legs: 0.7 });
    }
  };

  const MATS = ['concreteRaw', 'plaster', 'brickOldGrey', 'paintedWall', 'tile', 'brickOld'];

  /* --- 近景: 塀のすぐ外。低層が肩を並べる --- */
  for (const [sx, sz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const along = sx === 0 ? east - west : south - north;
    const n = Math.round(along / 13);
    for (let i = 0; i < n; i++) {
      const t = -along / 2 + along * (i + 0.5) / n + (rand() - 0.5) * 3;
      /*
       * 近景は「塀の上に頭が出る」程度に抑える。
       * 高い建物を境界のすぐ外へ並べると、敷地が井戸の底になり、
       * 空がまったく見えなくなる。外周道路の向こう側へ下げる。
       */
      const w = 9 + rand() * 7, d = 9 + rand() * 8, h = 6 + rand() * 7;
      const off = 26 + rand() * 10;
      const x = sx === 0 ? cx + t : (sx < 0 ? west : east) + sx * off;
      const z = sz === 0 ? cz + t : (sz < 0 ? north : south) + sz * off;
      block(x, z, w, d, h, (rand() - 0.5) * 0.3, MATS[Math.floor(rand() * MATS.length)], true);
    }
  }

  /* --- 中景: 30〜70m 外。中高層が重なる --- */
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rand() * 0.1;
    const r = 118 + rand() * 62;
    const x = cx + Math.cos(a) * r * 1.18;
    const z = cz + Math.sin(a) * r;
    const w = 11 + rand() * 16, d = 11 + rand() * 16, h = 12 + rand() * 26;
    block(x, z, w, d, h, rand() * 0.6, MATS[Math.floor(rand() * MATS.length)], rand() < 0.55);
  }

  /* --- 遠景: 200m 超。塊だけ。窓も設備も入れない --- */
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + rand() * 0.08;
    const r = 215 + rand() * 150;
    const x = cx + Math.cos(a) * r * 1.25;
    const z = cz + Math.sin(a) * r;
    const w = 14 + rand() * 26, d = 14 + rand() * 26, h = 16 + rand() * 52;
    b.box({ x, y: h / 2, z, w, h, d, yaw: rand() * 0.8,
      mat: rand() < 0.5 ? 'concreteRaw' : 'plaster', surface: SURFACE.CONCRETE, collide: false });
  }

  /* --- 稜線: 400m 超の山。空と地面の境目を埋める --- */
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 430 + rand() * 90;
    const x = cx + Math.cos(a) * r * 1.2, z = cz + Math.sin(a) * r;
    const w = 150 + rand() * 200, h = 40 + rand() * 55;
    const g = new THREE.ConeGeometry(w / 2, h, 7, 1);
    // 山は左右非対称に潰す
    g.scale(1, 1, 0.55 + rand() * 0.5);
    g.rotateY(rand() * 3.14);
    b.mesh('rock', g, { x, y: h / 2 - 6, z });
  }
}
