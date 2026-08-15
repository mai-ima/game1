import * as THREE from 'three';
import { SURFACE } from './Physics.js';

/*
 * 系統ごとに分けたファイルを、ここから再輸出する。
 *
 * このファイルは既に 2400 行あり、街路・室内・工業の小物を
 * 足していくと 1 ファイルで手に負えなくなる。
 * 呼び出し側は `import * as P from '../Props.js'` のままでよいよう、
 * 名前空間はここに集約しておく。
 */
export * from './props/street.js';
export * from './props/interior.js';

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
  const { x, y = 0, z, yaw = 0, w = 0.62, h = 0.34, d = 0.34, mat = 'paintedMetal' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  /** ローカル (右, 前) → ワールド */
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  const bodyH = h * 0.80;
  // 箱本体（下すぼまりの箱ではなく、実物どおりの箱形）
  b.box({ x, y: y + bodyH / 2, z, w, h: bodyH, d, yaw, mat, surface: SURFACE.METAL, collide: false });

  /*
   * 補強のプレス。
   * 平らな鉄板の箱は、どれだけ材質を良くしても
   * 「緑に塗った直方体」から抜け出せない。
   * 実物にある縦のリブと天地の折り返しを入れると、
   * 光の当たり方が段になって一気に金属の箱に見える。
   */
  for (const lx of [-w * 0.28, 0, w * 0.28]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = at(lx, sz * (d / 2 + 0.006));
      b.box({ x: px, y: y + bodyH / 2, z: pz, w: 0.055, h: bodyH * 0.86, d: 0.014, yaw,
        mat, surface: SURFACE.METAL, collide: false });
    }
  }
  // 天地の折り返し
  for (const ly of [0.022, bodyH - 0.022]) {
    b.box({ x, y: y + ly, z, w: w * 1.015, h: 0.022, d: d * 1.015, yaw, mat, surface: SURFACE.METAL, collide: false });
  }

  // 蓋（本体よりわずかに大きく、隙間が影になる）
  b.box({ x, y: y + bodyH + 0.030, z, w: w * 1.035, h: 0.060, d: d * 1.035, yaw, mat, surface: SURFACE.METAL, collide: false });
  b.box({ x, y: y + bodyH + 0.066, z, w: w * 0.90, h: 0.014, d: d * 0.90, yaw, mat, surface: SURFACE.METAL, collide: false });

  // 蝶番（背面 2 個）
  for (const lx of [-w * 0.26, w * 0.26]) {
    const [px, pz] = at(lx, -(d / 2 + 0.014));
    b.box({ x: px, y: y + bodyH + 0.012, z: pz, w: 0.075, h: 0.030, d: 0.028, yaw,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }

  // 掛け金（前面 2 個。ハンドルと爪）
  for (const lx of [-w * 0.24, w * 0.24]) {
    const [px, pz] = at(lx, d / 2 + 0.016);
    b.box({ x: px, y: y + bodyH - 0.010, z: pz, w: 0.070, h: 0.070, d: 0.020, yaw,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    b.box({ x: px, y: y + bodyH + 0.030, z: pz, w: 0.048, h: 0.048, d: 0.014, yaw,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }

  /*
   * 提げ手。
   * 実物は金具に通したロープか、折り畳みの鉄把手。
   * ここでは鉄把手にして、使わないときに寝る角度で付ける。
   */
  for (const sx of [-1, 1]) {
    const [bx, bz] = at(sx * (w / 2 + 0.010), 0);
    b.box({ x: bx, y: y + bodyH * 0.62, z: bz, w: 0.018, h: 0.075, d: 0.150, yaw,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    // 把手そのもの（軽く外へ倒れる）
    const [hx, hz] = at(sx * (w / 2 + 0.038), 0);
    b.box({ x: hx, y: y + bodyH * 0.50, z: hz, w: 0.014, h: 0.115, d: 0.115, yaw, rz: sx * 0.28,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }

  // 脚（床から浮かせる。これが無いと地面に埋まって見える）
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (w / 2 - 0.055), 0);
    b.box({ x: px, y: y + 0.008, z: pz, w: 0.045, h: 0.016, d: d * 0.9, yaw,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }

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

/**
 * 土嚢の山。
 *
 * 直方体を積むと必ず「緑のレンガ」に見える。
 * 土嚢は中身の重さで潰れ、上に載った袋の形にへこみ、
 * 端が耳のように余る。角を丸めるだけでは足りず、
 * 「上面が沈み、腹が張り出す」形にする必要がある。
 */
export function sandbagStack(b, o) {
  const { x, y = 0, z, yaw = 0, rows = 3, perRow = 4, length = 2.2, mat = 'sandbag' } = o;
  const bagW = length / perRow, bagH = 0.22, bagD = 0.44;

  /** 潰れた袋 1 個。上が沈み、腹が出た塊 */
  const bag = (px, py, pz, byaw, w, h, d, squash) => {
    const g = new THREE.SphereGeometry(0.5, 9, 7);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      // 上半分を押し潰す（載っている重みで凹む）
      const top = Math.max(0, vy) * squash;
      // 腹を張らせる（中身が横へ逃げる）
      const belly = 1 + (0.5 - Math.abs(vy)) * 0.34;
      // 縫い目のある短辺だけ耳を残す
      const ear = 1 + Math.max(0, Math.abs(vx) - 0.34) * 0.6;
      pos.setXYZ(i,
        vx * w * belly * ear,
        (vy - top) * h + (Math.abs(vx) > 0.4 ? 0.012 : 0),
        vz * d * belly);
    }
    // 面ごとのしわ
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) + Math.sin(pos.getX(i) * 34 + pos.getZ(i) * 21) * h * 0.045);
    }
    g.computeVertexNormals();
    b.mesh(mat, g, { ry: byaw, x: px, y: py, z: pz });
  };

  for (let r = 0; r < rows; r++) {
    const n = perRow - (r % 2 === 1 ? 1 : 0);
    const off = (r % 2 === 1) ? bagW / 2 : 0;
    // 上の段ほど強く潰れる（下は載られていない）
    const squash = 0.30 + (rows - 1 - r) / Math.max(1, rows - 1) * 0.34;
    for (let i = 0; i < n; i++) {
      const lx = -length / 2 + bagW * (i + 0.5) + off;
      const rx = Math.cos(yaw) * lx;
      const rz = Math.sin(yaw) * lx;
      bag(
        x + rx + R(-0.02, 0.02),
        y + bagH * (r + 0.46),
        z + rz + R(-0.02, 0.02),
        yaw + R(-0.09, 0.09),
        bagW * 1.02, bagH * 1.30, bagD, squash
      );
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
    const byaw = yaw + R(-0.25, 0.25);
    const px = x + R(-0.06, 0.06), pz = z + R(-0.06, 0.06);
    const c = Math.cos(byaw), s = Math.sin(byaw);
    const at = (lx, lz) => [px + c * lx + s * lz, pz - s * lx + c * lz];

    b.box({ x: px, y: yy + h / 2, z: pz, w, h, d, yaw: byaw,
      mat: 'cardboard', surface: SURFACE.FABRIC, collide: false });

    /*
     * 無地の直方体だと、いくら材質を段ボールにしても
     * 「茶色い箱」で止まってしまう。
     * 段ボール箱を段ボール箱に見せているのは
     *   ・上面で合わさるフラップの継ぎ目
     *   ・そこを塞ぐ粘着テープ
     *   ・角の潰れ
     * の 3 つなので、そこだけ入れる。
     */
    // 上面のフラップ（左右から寄せて中央でわずかに浮く）
    for (const sx of [-1, 1]) {
      const [fx, fz] = at(sx * w * 0.245, 0);
      b.box({ x: fx, y: yy + h + 0.004, z: fz, w: w * 0.49, h: 0.008, d: d * 0.98, yaw: byaw,
        rz: sx * 0.02, mat: 'cardboard', surface: SURFACE.FABRIC, collide: false });
    }
    // 封緘テープ（継ぎ目に沿って 1 本、側面へ折り返す分も）
    b.box({ x: px, y: yy + h + 0.010, z: pz, w: 0.055, h: 0.004, d: d * 1.01, yaw: byaw,
      mat: 'plasticMatte', surface: SURFACE.FABRIC, collide: false });
    for (const sz of [-1, 1]) {
      const [tx, tz] = at(0, sz * (d / 2 + 0.003));
      b.box({ x: tx, y: yy + h - 0.035, z: tz, w: 0.055, h: 0.070, d: 0.006, yaw: byaw,
        mat: 'plasticMatte', surface: SURFACE.FABRIC, collide: false });
    }
    // 角の潰れ（下の箱ほど強く）
    if (i < count - 1) {
      const [cx2, cz2] = at(-w * 0.5 + 0.03, d * 0.5 - 0.03);
      b.box({ x: cx2, y: yy + 0.035, z: cz2, w: 0.075, h: 0.055, d: 0.075, yaw: byaw + 0.5, rz: 0.22,
        mat: 'cardboard', surface: SURFACE.FABRIC, collide: false });
    }
    yy += h + 0.012;
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

  /*
   * 側面。
   *
   * 波板をテクスチャだけで表現すると、遠目には平らな板にしか見えない。
   * コンテナの側面は深さ 25mm ほどの縦の谷が 30cm 間隔で入っていて、
   * その陰影が「コンテナらしさ」のほとんどを作っている。
   * 谷を実体のリブとして並べる。
   */
  const RIB = 0.30;
  const ribs = Math.max(2, Math.round(length / RIB));
  for (const s of [-1, 1]) {
    const dx = Math.cos(yaw) * hw * s;
    const dz = -Math.sin(yaw) * hw * s;
    b.box({ x: x + dx, y: y + height / 2, z: z + dz, w: t, h: height, d: length, yaw, mat, surface: SURFACE.METAL, collide: false });
    for (let i = 0; i < ribs; i++) {
      const lz = -hl + length * (i + 0.5) / ribs;
      b.box({
        x: x + dx + Math.sin(yaw) * lz + Math.cos(yaw) * 0.026 * s,
        y: y + height * 0.51,
        z: z + dz + Math.cos(yaw) * lz - Math.sin(yaw) * 0.026 * s,
        w: 0.026, h: height * 0.90, d: RIB * 0.52, yaw, mat, surface: SURFACE.METAL, collide: false,
      });
    }
    // 上下のサイドレール（波板の端をくわえる形材）
    for (const ly of [height - 0.075, 0.075]) {
      b.box({ x: x + dx, y: y + ly, z: z + dz, w: 0.115, h: 0.15, d: length,
        yaw, mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
    }
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
/**
 * 室外機。
 *
 * 以前は太い輪と 4 本のスポークを前面に貼っていたため、
 * 荷車の車輪が付いた箱に見えていた。
 * 実物のグリルは
 *   ・細い線が同心円状に何十本も並ぶ
 *   ・そのうしろにファンの羽根が透けて見える
 *   ・開口部が本体より一段くぼんでいる
 * この 3 つで、輪ではなく網に見える。
 */
export function acUnit(b, o) {
  const { x, y, z, yaw = 0, w = 0.86, h = 0.66, d = 0.34, mat = 'applianceGrey' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  /** ローカル (右, 手前) → ワールド */
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  // 筐体（前面は一段くぼませる）
  b.box({ x, y: y + h / 2, z, w, h, d: d * 0.86, yaw, mat, surface: SURFACE.METAL, collide: false });
  // 側面と天面の枠（くぼみの縁になる）
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (w / 2 - 0.022), d * 0.04);
    b.box({ x: px, y: y + h / 2, z: pz, w: 0.044, h, d, yaw, mat, surface: SURFACE.METAL, collide: false });
  }
  for (const ly of [h - 0.020, 0.020]) {
    b.box({ x, y: y + ly, z, w, h: 0.040, d, yaw, mat, surface: SURFACE.METAL, collide: false });
  }

  /* ---- グリル ---- */
  const gx = w * 0.20, gy = h * 0.52, gr = Math.min(w * 0.30, h * 0.36);
  const [fx, fz] = at(gx, d / 2 + 0.004);
  // 開口の縁（丸いベルマウス）
  b.mesh('gunMetal', new THREE.TorusGeometry(gr * 1.06, 0.020, 6, 24),
    { ry: yaw, x: fx, y: y + gy, z: fz });
  // 同心円の線 5 本
  for (let i = 1; i <= 5; i++) {
    b.mesh('gunMetal', new THREE.TorusGeometry(gr * (i / 5.6), 0.0055, 4, 20),
      { ry: yaw, x: fx, y: y + gy, z: fz });
  }
  // 放射の線 12 本
  for (let i = 0; i < 12; i++) {
    b.box({ x: fx, y: y + gy, z: fz, w: gr * 2, h: 0.006, d: 0.006, yaw,
      rz: (i / 12) * Math.PI, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }
  // 奥のファン（羽根 4 枚が網ごしに見える）
  const [bx2, bz2] = at(gx, d * 0.34);
  b.cylinder({ x: bx2, y: y + gy, z: bz2, radius: 0.035, height: 0.05, segments: 8,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  for (let i = 0; i < 4; i++) {
    b.box({ x: bx2, y: y + gy, z: bz2, w: gr * 1.5, h: 0.055, d: 0.010, yaw,
      rz: (i / 4) * Math.PI * 2, rx: 0.35, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }

  /* ---- 右側の点検パネルと配管 ---- */
  const [px2, pz2] = at(-w * 0.34, d / 2 + 0.006);
  b.box({ x: px2, y: y + h * 0.52, z: pz2, w: w * 0.24, h: h * 0.72, d: 0.012, yaw,
    mat, surface: SURFACE.METAL, collide: false });
  // ビス 4 本
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const [sx2, sz2] = at(-w * 0.34 + sx * w * 0.09, d / 2 + 0.012);
      b.cylinder({ x: sx2, y: y + h * 0.52 + sy * h * 0.30, z: sz2, radius: 0.008, height: 0.006,
        segments: 6, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    }
  }
  // 冷媒配管（保温材を巻いた 2 本と、束ねるテープ）
  const [cx2, cz2] = at(-w * 0.40, -d * 0.28);
  for (const off of [-0.035, 0.035]) {
    b.cylinder({ x: cx2 + c * off, y: y + h * 0.18, z: cz2 - s * off, radius: 0.022, height: 0.52,
      segments: 8, mat: 'plasticMatte', surface: SURFACE.METAL, collide: false });
  }
  b.box({ x: cx2, y: y + h * 0.42, z: cz2, w: 0.10, h: 0.05, d: 0.055, yaw,
    mat: 'plasticMatte', surface: SURFACE.METAL, collide: false });
  // ドレンホース
  b.cylinder({ x: cx2, y: y - 0.02, z: cz2, radius: 0.011, height: 0.22, segments: 6,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });

  // 防振ゴムを噛ませた脚
  for (const sx of [-1, 1]) {
    const [lx2, lz2] = at(sx * (w / 2 - 0.07), 0);
    b.box({ x: lx2, y: y - 0.020, z: lz2, w: 0.06, h: 0.040, d: d * 0.9, yaw,
      mat: 'rubber', surface: SURFACE.RUBBER, collide: false });
  }

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
/**
 * 瓦礫。
 *
 * 立方体をばら撒くと、色違いのサイコロが転がっているようにしか見えない。
 * 壊れたコンクリートは
 *   ・板が割れるので、厚みに対して面が広い破片になる
 *   ・鉄筋が折れずに残って飛び出す
 *   ・細かい粉と小片が下に溜まる
 * この 3 つを入れると「壊れた物」に見え始める。
 */
export function rubble(b, o) {
  const { x, y = 0, z, radius = 1.6, count = 14 } = o;
  const MATS = ['concreteRaw', 'concrete', 'rock', 'brickOld'];

  for (let i = 0; i < count; i++) {
    const a = R(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * radius;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const m = PICK(MATS);
    // 板状の破片。厚みは幅の 1/3 以下
    const w = R(0.16, 0.44), d = w * R(0.55, 1.1), h = w * R(0.14, 0.30);
    const tilt = R(-0.5, 0.5);
    b.box({
      x: px, y: y + h * 0.5 + Math.abs(tilt) * w * 0.2, z: pz,
      w, h, d, yaw: R(0, 3.14), rz: tilt, rx: R(-0.3, 0.3),
      mat: m, surface: SURFACE.CONCRETE, collide: false,
    });
    // 折れた破片が重なる
    if (Math.random() < 0.45) {
      b.box({
        x: px + R(-0.10, 0.10), y: y + h * 1.3, z: pz + R(-0.10, 0.10),
        w: w * R(0.4, 0.7), h: h * R(0.6, 1.0), d: d * R(0.4, 0.8),
        yaw: R(0, 3.14), rz: R(-0.7, 0.7),
        mat: m, surface: SURFACE.CONCRETE, collide: false,
      });
    }
    // 露出した鉄筋（コンクリート片の 3 割ほどから出る）
    if (m !== 'rock' && Math.random() < 0.32) {
      const ra = R(0, Math.PI * 2);
      b.cylinder({
        x: px + Math.cos(ra) * w * 0.3, y: y + h, z: pz + Math.sin(ra) * w * 0.3,
        radius: 0.009, height: R(0.18, 0.44), segments: 5,
        mat: 'rustedMetal', surface: SURFACE.METAL, collide: false,
      });
    }
  }

  // 細かい小片と粉（山の足元を埋めて「積もった」感じを出す）
  const fines = count * 3;
  for (let i = 0; i < fines; i++) {
    const a = R(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * radius * 1.15;
    const s = R(0.030, 0.085);
    b.box({
      x: x + Math.cos(a) * r, y: y + s * 0.2, z: z + Math.sin(a) * r,
      w: s, h: s * R(0.3, 0.6), d: s * R(0.6, 1.2), yaw: R(0, 3.14),
      mat: PICK(['concreteRaw', 'rock']), surface: SURFACE.GRAVEL, collide: false,
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
  /*
   * 灯体。
   *
   * 箱を 1 個吊るだけだと、棒の先に何か付いている以上には見えない。
   * 道路灯は
   *   ・後ろが厚く前が薄い、涙滴形のケース
   *   ・下面に嵌まった乳白のカバー
   *   ・アームとの取り合いの座
   * この 3 つで灯具の形になる。
   */
  const lx = x + Math.sin(yaw) * armLen, lz = z + Math.cos(yaw) * armLen;
  // 取り合いの座
  b.box({ x: x + Math.sin(yaw) * (armLen - 0.28), y: y + height - 0.09, z: z + Math.cos(yaw) * (armLen - 0.28),
    w: 0.13, h: 0.13, d: 0.16, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  // ケース（後ろ厚 → 前薄の 3 段）
  const caseSeg = [[-0.16, 0.19, 0.20], [0.02, 0.155, 0.24], [0.19, 0.115, 0.20]];
  for (const [off, hh, dd] of caseSeg) {
    b.box({ x: lx + Math.sin(yaw) * off, y: y + height - 0.09 - (0.19 - hh) / 2, z: lz + Math.cos(yaw) * off,
      w: 0.30, h: hh, d: dd, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  }
  // 下面のカバー
  b.box({ x: lx, y: y + height - 0.205, z: lz, w: 0.255, h: 0.030, d: 0.46, yaw,
    mat: 'acrylic', surface: SURFACE.METAL, collide: false });
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
/**
 * 電柱（コンクリート柱）。
 *
 * 以前は wood を貼っていたため、明るいタンの地に暗い輪が並び、
 * どう見ても竹だった。日本の電柱はほぼコンクリート柱で、
 * 灰色・上細りのテーパー・足元の根巻きが特徴。
 *
 * @param {number} o.arms   腕木の段数
 * @param {boolean} o.trans 変圧器を載せるか
 */
export function utilityPole(b, o) {
  const { x, y = 0, z, yaw = 0, height = 11.0, arms = 2, trans = true } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz = 0) => [x + c * lx + s * lz, z - s * lx + c * lz];

  /*
   * 柱。上へ細る（末口 19cm / 元口 30cm 相当）。
   * 円柱を 3 段に分けて近似する。1 本の円柱だと寸胴に見える。
   */
  const segs = [[0.00, 0.34, 0.150], [0.34, 0.70, 0.128], [0.70, 1.00, 0.104]];
  for (const [t0, t1, r] of segs) {
    b.cylinder({ x, y: y + height * t0, z, radius: r, height: height * (t1 - t0),
      segments: 10, mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
  }
  // 根巻き（地際のコンクリート）
  b.cylinder({ x, y, z, radius: 0.215, height: 0.28, segments: 10,
    mat: 'concrete', surface: SURFACE.CONCRETE, collide: false });
  // 昇柱用の足場ボルト（互い違いに出る。これがあるだけで一気に電柱になる）
  for (let i = 0; i < 9; i++) {
    const sx = i % 2 ? 1 : -1;
    const [px, pz] = at(sx * 0.16);
    b.cylinder({ x: px, y: y + 2.4 + i * 0.45, z: pz, radius: 0.014, height: 0.17,
      segments: 5, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }
  b.physics.addCylinder(x, y + height / 2, z, 0.15, height / 2, { surface: SURFACE.CONCRETE });

  /* ---- 腕金と碍子 ---- */
  for (let a = 0; a < arms; a++) {
    const hy = height - 0.45 - a * 0.95;
    const halfW = 0.85 - a * 0.06;
    // 腕金（山形鋼）
    b.box({ x, y: y + hy, z, w: halfW * 2, h: 0.065, d: 0.075, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    b.box({ x, y: y + hy - 0.032, z, w: halfW * 2, h: 0.075, d: 0.012, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    // 振れ止めの腕金バンド
    for (const sx of [-1, 1]) {
      const [px, pz] = at(sx * halfW * 0.55);
      b.box({ x: px, y: y + hy - 0.20, z: pz, w: halfW * 0.62, h: 0.030, d: 0.030, yaw, rz: sx * 0.62,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    /*
     * 碍子。
     * 単なる円柱ではなく、笠が 2〜3 段重なった形。
     * 遠目にも「白くてくびれた粒」に見えることが大事。
     */
    for (const lx of [-halfW * 0.82, -halfW * 0.30, halfW * 0.30, halfW * 0.82]) {
      const [px, pz] = at(lx);
      b.cylinder({ x: px, y: y + hy + 0.033, z: pz, radius: 0.016, height: 0.055,
        segments: 6, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
      for (let k = 0; k < 3; k++) {
        b.cylinder({ x: px, y: y + hy + 0.085 + k * 0.052, z: pz,
          radius: 0.048 - k * 0.006, height: 0.024, segments: 10,
          mat: 'porcelain', surface: SURFACE.CONCRETE, collide: false });
        b.cylinder({ x: px, y: y + hy + 0.109 + k * 0.052, z: pz,
          radius: 0.026, height: 0.030, segments: 8,
          mat: 'porcelain', surface: SURFACE.CONCRETE, collide: false });
      }
    }
  }

  /* ---- 変圧器（柱上トランス）と、そこへ下りる引き下げ線 ---- */
  if (trans) {
    const ty = y + height - 2.9;
    const [px, pz] = at(0.36);
    b.cylinder({ x: px, y: ty, z: pz, radius: 0.235, height: 0.72, segments: 14,
      mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
    b.cylinder({ x: px, y: ty + 0.72, z: pz, radius: 0.255, height: 0.055, segments: 14,
      mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
    // 吊り金具
    for (const sy of [0.10, 0.60]) {
      b.box({ x: px, y: ty + sy, z: pz, w: 0.42, h: 0.050, d: 0.050, yaw,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    // ブッシング 2 本
    for (const sx of [-1, 1]) {
      const [bx2, bz2] = at(0.36, sx * 0.12);
      b.cylinder({ x: bx2, y: ty + 0.775, z: bz2, radius: 0.038, height: 0.12, segments: 8,
        mat: 'porcelain', surface: SURFACE.CONCRETE, collide: false });
    }
  }

  // 上部の架線を支える先端キャップ
  b.cylinder({ x, y: y + height, z, radius: 0.108, height: 0.05, segments: 10,
    mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 電線。
 *
 * 電柱を並べても、線が張られていないと「腕木の付いた棒」でしかない。
 * 街の空をいちばん強く特徴づけるのは、たわんで連なるこの線。
 *
 * @param {Array<[number,number]>} o.poles 電柱の位置（順に結ぶ）
 * @param {number[]} o.heights   線を張る高さ（複数本）
 * @param {number} o.sag         中央のたるみ (m)
 */
export function powerLine(b, o) {
  const { poles, heights = [10.5, 10.05, 7.6], sag = 0.55, spread = 0.8, mat = 'gunMetal' } = o;
  if (!poles || poles.length < 2) return b;

  for (let i = 0; i < poles.length - 1; i++) {
    const [x1, z1] = poles[i], [x2, z2] = poles[i + 1];
    const span = Math.hypot(x2 - x1, z2 - z1);
    if (span < 0.5) continue;
    // 径間に直交する向き（腕金の左右へ振り分けるため）
    const nx = -(z2 - z1) / span, nz = (x2 - x1) / span;
    // たるみは径間の長さに比例する
    const dip = sag * (span / 30);
    // 1 径間を 6 本の直線で折る（放物線の近似）
    const STEP = 6;
    for (const hy of heights) {
      // 同じ高さに左右へ振り分けて 2 本ずつ
      for (const off of [-spread / 2, spread / 2]) {
        for (let k = 0; k < STEP; k++) {
          const t0 = k / STEP, t1 = (k + 1) / STEP;
          const p0 = { x: x1 + (x2 - x1) * t0, z: z1 + (z2 - z1) * t0, y: hy - dip * 4 * t0 * (1 - t0) };
          const p1 = { x: x1 + (x2 - x1) * t1, z: z1 + (z2 - z1) * t1, y: hy - dip * 4 * t1 * (1 - t1) };
          const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
          const len = Math.hypot(dx, dy, dz);
          b.box({
            x: (p0.x + p1.x) / 2 + nx * off, y: (p0.y + p1.y) / 2, z: (p0.z + p1.z) / 2 + nz * off,
            w: 0.022, h: 0.022, d: len,
            yaw: Math.atan2(dx, dz), rx: -Math.asin(dy / len),
            mat, surface: SURFACE.METAL, collide: false, blocksBullets: false,
          });
        }
      }
    }
  }
  return b;
}

/** 車両（ピックアップトラック / セダン） */
export function vehicle(b, o) {
  const { x, y = 0, z, yaw = 0, type = 'truck', mat = 'paintedMetalTan' } = o;
  const isTruck = type === 'truck';
  const L = isTruck ? 5.1 : 4.3, W = 1.92, H = isTruck ? 0.92 : 0.78;
  const wheelR = 0.36;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  /*
   * ローカル座標。
   *   lx = 右（+ が運転席から見て右）
   *   lz = 前（+ が車の前方）
   */
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const TRIM = 'gunMetal';

  // シャシー
  b.box({ x, y: y + wheelR + H / 2, z, w: W, h: H, d: L, yaw, mat, surface: SURFACE.METAL, collide: false });
  // キャビン
  const cabZ = isTruck ? L * 0.10 : 0;
  const cabD = isTruck ? L * 0.34 : L * 0.46;
  const [cx, cz] = at(0, cabZ);
  b.box({ x: cx, y: y + wheelR + H + 0.34, z: cz,
    w: W * 0.92, h: 0.68, d: cabD, yaw, mat, surface: SURFACE.METAL, collide: false });
  // 窓（ガラス）
  const glassGeo = new THREE.BoxGeometry(W * 0.86, 0.44, cabD * 0.96);
  const glass = new THREE.Mesh(glassGeo, b.mats.glass({ opacity: 0.55, transmission: 0.7 }));
  glass.position.set(cx, y + wheelR + H + 0.46, cz);
  glass.rotation.y = yaw;
  b.addExtra(glass);

  /*
   * 窓枠（ピラー）。
   * ガラスの箱をそのまま置くと「水槽を載せた箱」になる。
   * A/B/C ピラーを立てて窓を割ると、一気に車の顔になる。
   */
  for (const sx of [-1, 1]) {
    for (const lz of [cabD / 2 - 0.045, -cabD / 2 + 0.045, 0]) {
      if (lz === 0 && !isTruck) continue;
      const [px, pz] = at(sx * W * 0.455, cabZ + lz);
      b.box({ x: px, y: y + wheelR + H + 0.46, z: pz, w: 0.055, h: 0.46, d: 0.075, yaw,
        mat, surface: SURFACE.METAL, collide: false });
    }
    // 窓下の見切り
    const [px, pz] = at(sx * W * 0.462, cabZ);
    b.box({ x: px, y: y + wheelR + H + 0.225, z: pz, w: 0.030, h: 0.045, d: cabD * 0.94, yaw,
      mat: TRIM, surface: SURFACE.METAL, collide: false });
  }
  // ルーフの縁
  b.box({ x: cx, y: y + wheelR + H + 0.685, z: cz, w: W * 0.94, h: 0.035, d: cabD * 1.01, yaw,
    mat, surface: SURFACE.METAL, collide: false });

  // ドアの合わせ目とハンドル
  for (const sx of [-1, 1]) {
    const doors = isTruck ? [cabZ] : [cabZ + L * 0.10, cabZ - L * 0.10];
    for (const dz of doors) {
      const [px, pz] = at(sx * (W / 2 + 0.004), dz + 0.42);
      b.box({ x: px, y: y + wheelR + H * 0.55, z: pz, w: 0.010, h: H * 0.86, d: 0.014, yaw,
        mat: TRIM, surface: SURFACE.METAL, collide: false });
      const [hx, hz] = at(sx * (W / 2 + 0.014), dz);
      b.box({ x: hx, y: y + wheelR + H * 0.80, z: hz, w: 0.022, h: 0.038, d: 0.135, yaw,
        mat: TRIM, surface: SURFACE.METAL, collide: false });
    }
  }

  // ドアミラー
  for (const sx of [-1, 1]) {
    const [ax, az] = at(sx * (W / 2 + 0.055), cabZ + cabD / 2 - 0.02);
    b.box({ x: ax, y: y + wheelR + H + 0.34, z: az, w: 0.11, h: 0.028, d: 0.028, yaw,
      mat: TRIM, surface: SURFACE.METAL, collide: false });
    const [mx, mz] = at(sx * (W / 2 + 0.115), cabZ + cabD / 2 - 0.02);
    b.box({ x: mx, y: y + wheelR + H + 0.345, z: mz, w: 0.045, h: 0.135, d: 0.095, yaw, rz: sx * 0.12,
      mat: TRIM, surface: SURFACE.METAL, collide: false });
  }

  // 荷台（トラックのみ）
  if (isTruck) {
    const bedZ = -L * 0.26;
    for (const sx of [-1, 1]) {
      const [px, pz] = at(sx * (W / 2 - 0.06), bedZ);
      b.box({ x: px, y: y + wheelR + H + 0.20, z: pz,
        w: 0.10, h: 0.40, d: L * 0.44, yaw, mat, surface: SURFACE.METAL, collide: false });
      // あおりの上端（丸い縁）
      b.box({ x: px, y: y + wheelR + H + 0.415, z: pz,
        w: 0.135, h: 0.045, d: L * 0.44, yaw, mat, surface: SURFACE.METAL, collide: false });
    }
    const [tx, tz] = at(0, -L * 0.48);
    b.box({ x: tx, y: y + wheelR + H + 0.20, z: tz,
      w: W * 0.94, h: 0.40, d: 0.09, yaw, mat, surface: SURFACE.METAL, collide: false });
    // 荷台の床（波板）
    b.box({ x: at(0, bedZ)[0], y: y + wheelR + H + 0.015, z: at(0, bedZ)[1],
      w: W * 0.88, h: 0.03, d: L * 0.44, yaw, mat: 'corrugated', surface: SURFACE.METAL, collide: false });
    // 荷台のあおりは見えている以上、身を隠せるようにしておく（薄いので貫通はする）
    for (const sx of [-1, 1]) {
      const [px, pz] = at(sx * (W / 2 - 0.06), bedZ);
      b.physics.addBox(px, y + wheelR + H + 0.20, pz,
        0.05, 0.20, L * 0.22, yaw, { surface: SURFACE.METAL, penetration: 0.8 });
    }
  }

  /* ---- ホイールアーチとタイヤ ---- */
  const wz = L * 0.32;
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const [wx, wzz] = at((W / 2 - 0.06) * sx, wz * sz);

    /*
     * ホイールアーチ。
     * これが無いと、車体の平らな側面にタイヤが貼り付いているだけに見える。
     * 半円を 5 枚の板で近似して、タイヤの上に回す。
     */
    for (let k = 0; k < 5; k++) {
      const a = Math.PI * (0.10 + k * 0.20);
      const [ax, az] = at((W / 2 - 0.02) * sx, wz * sz + Math.cos(a) * wheelR * 1.24);
      b.box({ x: ax, y: y + Math.sin(a) * wheelR * 1.24, z: az,
        w: 0.075, h: 0.10, d: wheelR * 0.82, yaw, rx: a - Math.PI / 2,
        mat, surface: SURFACE.METAL, collide: false });
    }

    // タイヤ
    const geo = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 18);
    geo.rotateZ(Math.PI / 2);
    b.mesh('tireTread', geo, { x: wx, y: y + wheelR, z: wzz, ry: yaw });
    // 側面（トレッドと別材質にして、丸い黒の塊に見せない）
    const wall = new THREE.CylinderGeometry(wheelR * 0.99, wheelR * 0.99, 0.245, 18);
    wall.rotateZ(Math.PI / 2);
    b.mesh('rubber', wall, { x: wx, y: y + wheelR, z: wzz, ry: yaw });
    // リム
    const hub = new THREE.CylinderGeometry(wheelR * 0.60, wheelR * 0.60, 0.255, 14);
    hub.rotateZ(Math.PI / 2);
    b.mesh('brushedMetal', hub, { x: wx, y: y + wheelR, z: wzz, ry: yaw });
    // ハブとボルト
    const [hx2] = at((W / 2 + 0.055) * sx, wz * sz);
    const [, hz2] = at((W / 2 + 0.055) * sx, wz * sz);
    const cap = new THREE.CylinderGeometry(wheelR * 0.22, wheelR * 0.22, 0.03, 10);
    cap.rotateZ(Math.PI / 2);
    b.mesh('gunMetal', cap, { x: hx2, y: y + wheelR, z: hz2, ry: yaw });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const [bx3, bz3] = at((W / 2 + 0.052) * sx, wz * sz + Math.sin(a) * wheelR * 0.38);
      b.box({ x: bx3, y: y + wheelR + Math.cos(a) * wheelR * 0.38, z: bz3,
        w: 0.018, h: 0.030, d: 0.030, yaw, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    }
  }

  /* ---- 前後の顔 ---- */
  const noseZ = L / 2, tailZ = -L / 2;
  // バンパー（上下 2 段にして厚みを出す）
  for (const [lz, bmat] of [[noseZ - 0.045, TRIM], [tailZ + 0.045, TRIM]]) {
    const [px, pz] = at(0, lz);
    b.box({ x: px, y: y + wheelR + 0.10, z: pz, w: W * 1.02, h: 0.20, d: 0.13, yaw,
      mat: bmat, surface: SURFACE.METAL, collide: false });
    b.box({ x: px, y: y + wheelR - 0.06, z: pz, w: W * 0.86, h: 0.10, d: 0.10, yaw,
      mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  }

  // グリル（横桟 4 本＋外枠）
  {
    const [gx, gz] = at(0, noseZ - 0.005);
    b.box({ x: gx, y: y + wheelR + H * 0.62, z: gz, w: W * 0.62, h: 0.26, d: 0.05, yaw,
      mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
    for (let k = 0; k < 4; k++) {
      b.box({ x: gx, y: y + wheelR + H * 0.62 - 0.09 + k * 0.06, z: gz,
        w: W * 0.60, h: 0.022, d: 0.062, yaw, mat: TRIM, surface: SURFACE.METAL, collide: false });
    }
  }

  // ヘッドライト（ケース＋レンズ）とウインカー
  for (const sx of [-1, 1]) {
    const [lx2, lz2] = at(W * 0.34 * sx, noseZ - 0.02);
    b.box({ x: lx2, y: y + wheelR + H * 0.66, z: lz2, w: 0.30, h: 0.19, d: 0.07, yaw,
      mat: TRIM, surface: SURFACE.METAL, collide: false });
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.145, 0.035),
      b.mats.glass({ opacity: 0.5, transmission: 0.75 }));
    const [gx2, gz2] = at(W * 0.34 * sx, noseZ + 0.012);
    hl.position.set(gx2, y + wheelR + H * 0.66, gz2);
    hl.rotation.y = yaw;
    b.addExtra(hl);
    // ウインカー（琥珀）
    const [ax2, az2] = at(W * 0.34 * sx, noseZ + 0.010);
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.025), b.mats.emissive(0xc47a20, 0.25));
    ind.position.set(ax2, y + wheelR + H * 0.66 - 0.115, az2);
    ind.rotation.y = yaw;
    b.addExtra(ind);
  }

  // テールランプ
  for (const sx of [-1, 1]) {
    const [tx2, tz2] = at(W * 0.36 * sx, tailZ + 0.012);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.03), b.mats.emissive(0x8c1f18, 0.22));
    tl.position.set(tx2, y + wheelR + H * 0.72, tz2);
    tl.rotation.y = yaw;
    b.addExtra(tl);
  }

  // ナンバープレートと排気管
  {
    const [nx, nz] = at(0, tailZ + 0.012);
    b.box({ x: nx, y: y + wheelR + 0.24, z: nz, w: 0.33, h: 0.16, d: 0.012, yaw,
      mat: 'paperPrint', surface: SURFACE.METAL, collide: false });
    const [ex, ez] = at(W * 0.30, tailZ + 0.06);
    b.cylinder({ x: ex, y: y + wheelR - 0.12, z: ez, radius: 0.032, height: 0.14, segments: 8,
      mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
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
  b.physics.addBox(cx, y + wheelR + H + 0.34, cz,
    W * 0.46, 0.34, cabD / 2, yaw, { surface: SURFACE.METAL, penetration: 0.3 });
  return b;
}

/** 看板 */
/**
 * 看板。
 *
 * 以前は色板 1 枚だけで、文字も枠も取り付けも無かった。
 * 「板が浮いている」以上には決して見えない。
 *
 * @param {string} o.text  入れる文字（省略すると無地のまま）
 * @param {number} o.posts 支柱の本数（0 で壁付け）
 */
export function sign(b, o) {
  const {
    x, y, z, yaw = 0, w = 1.5, h = 0.6, mat = 'hazardStripe',
    text = '', sub = '', accent = '#d97757', posts = 0, ground = 0,
  } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz = 0) => [x + c * lx + s * lz, z - s * lx + c * lz];

  // 板
  b.box({ x, y, z, w, h, d: 0.035, yaw, mat, surface: SURFACE.METAL, collide: false });
  // 枠（四周に回すアングル）
  for (const sy of [-1, 1]) {
    b.box({ x, y: y + sy * (h / 2 + 0.018), z, w: w + 0.072, h: 0.036, d: 0.055, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (w / 2 + 0.018));
    b.box({ x: px, y, z: pz, w: 0.036, h: h + 0.072, d: 0.055, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }

  // 文字（両面。裏から来ても読めるようにする）
  if (text) {
    const geo = new THREE.PlaneGeometry(w * 0.94, h * 0.86);
    for (const f of [1, -1]) {
      const fy = f > 0 ? yaw : yaw + Math.PI;
      const m = new THREE.Mesh(geo, b.mats.label(text, { sub, accent }));
      m.position.set(x + Math.sin(fy) * 0.024, y, z + Math.cos(fy) * 0.024);
      m.rotation.y = fy;
      m.userData.signText = text;
      m.userData.signKind = 'label';
      b.addExtra(m);
    }
  }

  // 支柱（地面まで下ろす）
  if (posts > 0 && y - h / 2 > ground + 0.2) {
    for (let i = 0; i < posts; i++) {
      const lx = posts === 1 ? 0 : (-0.5 + i / (posts - 1)) * (w - 0.3);
      const [px, pz] = at(lx);
      b.cylinder({ x: px, y: ground, z: pz, radius: 0.042, height: y - h / 2 - ground,
        segments: 8, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
      b.cylinder({ x: px, y: ground, z: pz, radius: 0.095, height: 0.10,
        segments: 8, mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
    }
  }
  return b;
}

/** 給水タンク（屋上） */
/**
 * 屋上の貯水タンク。
 *
 * 以前は天面に木目のフタが載っていて、樽のように見えていた。
 * 実際の高置水槽は
 *   ・鋼板をボルトで継いだパネル構造（升目の継ぎ目）
 *   ・天端の点検マンホール
 *   ・脇を上下する給水管とオーバーフロー管
 *   ・架台に載って浮いている
 * これらが揃って初めて「水を溜める設備」に見える。
 */
export function waterTank(b, o) {
  const { x, y, z, radius = 0.95, height = 1.5, mat = 'galvanized', legs = 0.52 } = o;
  b.cylinder({ x, y, z, radius, height, segments: 18, mat, surface: SURFACE.METAL, collide: false });
  // パネルの継ぎ目（横 2 段・縦 8 本）
  for (const ly of [height * 0.34, height * 0.68]) {
    b.cylinder({ x, y: y + ly - 0.018, z, radius: radius * 1.015, height: 0.036, segments: 18,
      mat, surface: SURFACE.METAL, collide: false });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box({ x: x + Math.cos(a) * radius, y: y + height / 2, z: z + Math.sin(a) * radius,
      w: 0.030, h: height * 0.96, d: 0.030, yaw: -a, mat, surface: SURFACE.METAL, collide: false });
  }
  // 天板（わずかに勾配を持つ鋼板）と点検口
  b.cylinder({ x, y: y + height, z, radius: radius * 1.03, height: 0.05, segments: 18,
    mat, surface: SURFACE.METAL, collide: false });
  b.cylinder({ x: x + radius * 0.34, y: y + height + 0.05, z, radius: 0.20, height: 0.055, segments: 12,
    mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: x + radius * 0.34, y: y + height + 0.10, z: z + 0.20, w: 0.10, h: 0.030, d: 0.055,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  // 通気筒
  b.cylinder({ x: x - radius * 0.40, y: y + height + 0.05, z, radius: 0.045, height: 0.24, segments: 8,
    mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x: x - radius * 0.40, y: y + height + 0.27, z, radius: 0.075, height: 0.045, segments: 8,
    mat: 'galvanized', surface: SURFACE.METAL, collide: false });

  // 給水管とオーバーフロー管（タンクの脇を通って下へ）
  for (const [ang, r] of [[0.5, 0.038], [2.4, 0.028]]) {
    const px = x + Math.cos(ang) * radius * 1.10, pz = z + Math.sin(ang) * radius * 1.10;
    b.cylinder({ x: px, y: y - legs, z: pz, radius: r, height: height + legs * 0.9, segments: 8,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    // タンクへ入る取り合い
    b.box({ x: (px + x) / 2, y: y + height * 0.82, z: (pz + z) / 2,
      w: r * 2.4, h: r * 2.4, d: radius * 0.30, yaw: -ang + Math.PI / 2,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }

  // 架台（脚と、脚をつなぐ振れ止め）
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    const px = x + Math.cos(a) * radius * 0.75, pz = z + Math.sin(a) * radius * 0.75;
    b.box({ x: px, y: y - legs / 2, z: pz, w: 0.075, h: legs, d: 0.075, yaw: -a,
      mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
    b.box({ x: px, y: y - legs - 0.015, z: pz, w: 0.17, h: 0.030, d: 0.17, yaw: -a,
      mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  }
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2 + 0.78, a1 = ((i + 1) / 4) * Math.PI * 2 + 0.78;
    const x0 = x + Math.cos(a0) * radius * 0.75, z0 = z + Math.sin(a0) * radius * 0.75;
    const x1 = x + Math.cos(a1) * radius * 0.75, z1 = z + Math.sin(a1) * radius * 0.75;
    const len = Math.hypot(x1 - x0, z1 - z0);
    b.box({ x: (x0 + x1) / 2, y: y - legs * 0.35, z: (z0 + z1) / 2,
      w: 0.035, h: 0.035, d: len, yaw: Math.atan2(x1 - x0, z1 - z0),
      mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
  }

  b.physics.addCylinder(x, y + height / 2, z, radius, height / 2, { surface: SURFACE.METAL, penetration: 0.4 });
  return b;
}

/** アンテナ / 衛星皿（屋上の情報量を上げる） */
/**
 * 屋上のごちゃごちゃ。
 *
 * 屋上を屋上らしく見せているのは、大きな 1 個の機器ではなく
 * 「用途の違う小さな物が雑然と並んでいること」。
 * 皿・アンテナ・架台・配管・ダクト・室外機を寄せて置く。
 */
export function rooftopClutter(b, o) {
  const { x, y, z, yaw = 0 } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  /* --- 衛星放送のパラボラ（架台に載って傾く） --- */
  {
    const [px, pz] = at(-0.15, 0);
    b.cylinder({ x: px, y, z: pz, radius: 0.055, height: 0.72, segments: 8,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    // 基礎ブロック（屋上は穴を開けないので置き基礎になる）
    b.box({ x: px, y: y + 0.045, z: pz, w: 0.42, h: 0.09, d: 0.42, yaw,
      mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
    const dish = new THREE.SphereGeometry(0.42, 18, 11, 0, Math.PI * 2, 0, Math.PI * 0.40);
    b.mesh('applianceWhite', dish, { x: px, y: y + 0.80, z: pz, rx: -1.05, ry: yaw });
    // リムと、皿の焦点に伸びる支持腕・コンバータ
    b.mesh('applianceWhite', new THREE.TorusGeometry(0.415, 0.016, 5, 22),
      { x: px, y: y + 0.80, z: pz, rx: -1.05 + Math.PI / 2, ry: yaw });
    const [fx, fz] = at(-0.15 + Math.sin(yaw) * 0, 0.34);
    b.box({ x: fx, y: y + 0.95, z: fz, w: 0.028, h: 0.028, d: 0.36, yaw, rx: 0.5,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    b.cylinder({ x: fx, y: y + 1.06, z: fz, radius: 0.038, height: 0.10, segments: 8,
      mat: 'plasticMatte', surface: SURFACE.METAL, collide: false });
  }

  /* --- 八木アンテナ（素子が並んだ棒） --- */
  {
    const [px, pz] = at(0.78, 0.30);
    b.cylinder({ x: px, y, z: pz, radius: 0.026, height: 2.3, segments: 6,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    // 支線（3 方向）
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const gx = px + Math.cos(a) * 0.62, gz = pz + Math.sin(a) * 0.62;
      const len = Math.hypot(0.62, 1.5);
      b.box({ x: (px + gx) / 2, y: y + 1.55 / 2 + 0.35, z: (pz + gz) / 2,
        w: 0.010, h: 0.010, d: len, yaw: Math.atan2(gx - px, gz - pz), rx: -Math.atan2(1.5, 0.62),
        mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    }
    // 素子（前に行くほど短い）
    b.box({ x: px, y: y + 2.0, z: pz, w: 0.020, h: 0.020, d: 1.05, yaw,
      mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
    for (let i = 0; i < 7; i++) {
      const [ex, ez] = at(0.78, 0.30 - 0.48 + i * 0.155);
      b.box({ x: ex, y: y + 2.0, z: ez, w: 0.60 - i * 0.055, h: 0.011, d: 0.011, yaw,
        mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
    }
  }

  /* --- 換気ダクトとフード --- */
  {
    const [px, pz] = at(-0.95, -0.55);
    b.box({ x: px, y: y + 0.30, z: pz, w: 0.40, h: 0.60, d: 0.40, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    // ガラリ（羽根 4 枚）
    for (let i = 0; i < 4; i++) {
      const [gx, gz] = at(-0.95, -0.55 + 0.205);
      b.box({ x: gx, y: y + 0.16 + i * 0.10, z: gz, w: 0.34, h: 0.035, d: 0.045, yaw, rx: 0.5,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    // ベントキャップ
    b.cylinder({ x: px, y: y + 0.60, z: pz, radius: 0.13, height: 0.22, segments: 10,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    b.cylinder({ x: px, y: y + 0.80, z: pz, radius: 0.21, height: 0.045, segments: 10,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }

  /* --- 這わせた配管（架台の上を通る） --- */
  {
    for (let i = 0; i < 3; i++) {
      const [sx2, sz2] = at(-1.3 + i * 1.2, -1.15);
      b.box({ x: sx2, y: y + 0.09, z: sz2, w: 0.30, h: 0.18, d: 0.10, yaw,
        mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
    }
    const [rx2, rz2] = at(0, -1.15);
    for (const off of [-0.06, 0.06]) {
      b.box({ x: rx2 + c * 0, y: y + 0.22 + off * 0.6, z: rz2 - s * 0,
        w: 2.9, h: 0.055, d: 0.055, yaw, mat: 'plasticMatte', surface: SURFACE.METAL, collide: false });
    }
  }
  return b;
}

/** ジェリカン */
/**
 * 携行缶（20L の NATO 缶）。
 *
 * 実寸は 470 × 345 × 165mm。
 * この缶を一目で「携行缶」と判らせているのは
 *   ・両面の X 字プレス
 *   ・並んだ 3 本の提げ手
 *   ・肩から斜めに出る注ぎ口
 *   ・上下の巻き締め（半割の缶を溶接した継ぎ目）
 * の 4 つで、どれが欠けても金属の板になる。
 */
export function jerryCan(b, o) {
  const { x, y = 0, z, yaw = 0, mat = 'paintedMetal' } = o;
  const W = 0.165, H = 0.470, D = 0.345;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  /** ローカル (厚み方向, 幅方向) → ワールド */
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  // 胴。上へわずかに絞る
  b.box({ x, y: y + H * 0.48, z, w: W, h: H * 0.90, d: D, yaw, mat, surface: SURFACE.METAL, collide: false });
  b.box({ x, y: y + H * 0.945, z, w: W * 0.92, h: H * 0.10, d: D * 0.94, yaw, mat, surface: SURFACE.METAL, collide: false });

  // 中央の溶接継ぎ目（半割の缶を合わせた線）
  b.box({ x, y: y + H * 0.48, z, w: W * 1.03, h: H * 0.90, d: 0.010, yaw,
    mat, surface: SURFACE.METAL, collide: false });

  // 両面の X 字プレス。缶がへこまないための補強
  for (const sx of [-1, 1]) {
    for (const a of [0.86, -0.86]) {
      const [px, pz] = at(sx * (W / 2 + 0.004), 0);
      b.box({ x: px, y: y + H * 0.50, z: pz, w: 0.010, h: 0.030, d: D * 0.86, yaw, rz: 0, rx: a,
        mat, surface: SURFACE.METAL, collide: false });
    }
    // 縁の立ち上がり（X の外側を四角く囲む）
    for (const sz of [-1, 1]) {
      const [px, pz] = at(sx * (W / 2 + 0.003), sz * D * 0.42);
      b.box({ x: px, y: y + H * 0.50, z: pz, w: 0.008, h: H * 0.70, d: 0.022, yaw,
        mat, surface: SURFACE.METAL, collide: false });
    }
  }

  // 上下の巻き締め
  for (const ly of [0.030, H * 0.90]) {
    b.box({ x, y: y + ly, z, w: W * 1.05, h: 0.020, d: D * 1.02, yaw, mat, surface: SURFACE.METAL, collide: false });
  }

  /*
   * 提げ手 3 本。
   * 真ん中を持てば 1 人で、両端を持てば 2 人で運べる。
   * この 3 本並びが缶の顔になる。
   */
  for (const lz of [-D * 0.30, 0, D * 0.30]) {
    const [hx, hz] = at(0, lz);
    b.box({ x: hx, y: y + H + 0.020, z: hz, w: W * 0.62, h: 0.026, d: 0.052, yaw,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }
  // 提げ手を載せる梁
  b.box({ x, y: y + H + 0.006, z, w: W * 0.72, h: 0.016, d: D * 0.80, yaw,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });

  // 注ぎ口（肩から斜めに出る）とキャップ、通気
  const [sx2, sz2] = at(0, D * 0.34);
  b.cylinder({ x: sx2, y: y + H * 0.93, z: sz2, radius: 0.030, height: 0.055, segments: 10,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x: sx2, y: y + H * 0.955, z: sz2, radius: 0.038, height: 0.028, segments: 10,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  const [bx2, bz2] = at(0, -D * 0.32);
  b.cylinder({ x: bx2, y: y + H * 0.95, z: bz2, radius: 0.011, height: 0.020, segments: 8,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });

  // 底の脚（4 隅がわずかに出る）
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = at(sx * W * 0.36, sz * D * 0.42);
      b.box({ x: px, y: y + 0.006, z: pz, w: W * 0.26, h: 0.012, d: 0.030, yaw,
        mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    }
  }

  b.physics.addBox(x, y + H / 2, z, W / 2 + 0.01, H / 2, D / 2, yaw, { surface: SURFACE.METAL, penetration: 0.6 });
  return b;
}

/** 散らばった小物（薬莢・紙・小石）を一括配置して密度を上げる */
/**
 * 散らばった小物。
 *
 * 以前は厚さ 4mm の板を撒いていたため、真上から見ないと存在が判らず、
 * 一覧で撮ると「何も無い」写真になっていた。
 * 実際に地面を汚しているのは、潰れた缶・ペットボトル・
 * ちぎれた袋・落ち葉・砂利といった「立体」なので、
 * 高さのある形にして、寄り集まるように撒く。
 */
export function litter(b, o) {
  const { x, z, radius = 3.0, count = 22, y = 0.0 } = o;
  /*
   * 一様に撒くと均等に見えて不自然。
   * 風で吹き寄せられるので、いくつかの溜まりへ偏らせる。
   */
  const pockets = Math.max(1, Math.round(count / 6));
  const centres = [];
  for (let i = 0; i < pockets; i++) {
    const a = R(0, Math.PI * 2), r = Math.sqrt(Math.random()) * radius * 0.8;
    centres.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }

  for (let i = 0; i < count; i++) {
    const [cx2, cz2] = PICK(centres);
    const a = R(0, Math.PI * 2);
    const r = Math.abs(R(-1, 1)) * radius * 0.45;
    const px = cx2 + Math.cos(a) * r, pz = cz2 + Math.sin(a) * r;
    const kind = Math.random();
    const yaw = R(0, 3.14);

    if (kind < 0.20) {
      // 潰れた空き缶（横倒しの短い円柱）
      const g = new THREE.CylinderGeometry(0.033, 0.031, R(0.09, 0.12), 9);
      g.rotateZ(Math.PI / 2);
      b.mesh(PICK(['brushedMetal', 'paintedMetal']), g,
        { ry: yaw, rz: R(-0.15, 0.15), x: px, y: y + 0.032, z: pz });
    } else if (kind < 0.36) {
      // ペットボトル（胴・肩・キャップ）
      const h = R(0.16, 0.21);
      const g = new THREE.CylinderGeometry(0.034, 0.034, h, 9);
      g.rotateZ(Math.PI / 2);
      b.mesh('acrylic', g, { ry: yaw, x: px, y: y + 0.034, z: pz });
      b.cylinder({ x: px + Math.sin(yaw) * (h / 2 + 0.012), y: y + 0.022, z: pz + Math.cos(yaw) * (h / 2 + 0.012),
        radius: 0.017, height: 0.024, segments: 8, mat: 'plasticGlossRed', surface: SURFACE.CONCRETE, collide: false });
    } else if (kind < 0.52) {
      // ちぎれた袋・紙（くしゃっと折れた 2 枚）
      for (let k = 0; k < 2; k++) {
        b.box({ x: px + R(-0.04, 0.04), y: y + 0.008 + k * 0.010, z: pz + R(-0.04, 0.04),
          w: R(0.07, 0.15), h: 0.006, d: R(0.06, 0.13), yaw: R(0, 3.14), rz: R(-0.4, 0.4), rx: R(-0.4, 0.4),
          mat: PICK(['paperPrint', 'cardboard', 'plasticMatte']), surface: SURFACE.CONCRETE, collide: false });
      }
    } else if (kind < 0.72) {
      // 落ち葉
      b.box({ x: px, y: y + 0.006, z: pz, w: R(0.05, 0.10), h: 0.004, d: R(0.03, 0.07),
        yaw, rz: R(-0.25, 0.25), mat: 'leafCardDry', surface: SURFACE.CONCRETE, collide: false });
    } else if (kind < 0.90) {
      // 小石
      b.box({ x: px, y: y + 0.018, z: pz, w: R(0.04, 0.09), h: R(0.025, 0.05), d: R(0.04, 0.09),
        yaw, rz: R(-0.3, 0.3), mat: PICK(['rock', 'concreteRaw']), surface: SURFACE.GRAVEL, collide: false });
    } else {
      // 薬莢
      const g = new THREE.CylinderGeometry(0.0055, 0.0050, 0.039, 7);
      g.rotateZ(Math.PI / 2);
      b.mesh('brassPolished', g, { ry: yaw, x: px, y: y + 0.0055, z: pz });
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

  const topY = levels * levelH + 1.1;
  for (let i = 0; i <= bays; i++) {
    const lz = -length / 2 + (length / bays) * i;
    for (const lx of [-depth / 2, depth / 2]) {
      b.cylinder({
        x: tx(lx, lz), y, z: tz(lx, lz),
        radius: 0.024, height: topY, segments: 8,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false,
      });
      // ジャッキベース（支柱が地面に刺さって見えるのを防ぐ）
      b.box({ x: tx(lx, lz), y: y + 0.012, z: tz(lx, lz), w: 0.14, h: 0.024, d: 0.14, yaw,
        mat: 'rustedMetal', surface: SURFACE.METAL, collide: false });
      // クランプ（各段で横材をくわえる金具）
      for (let L = 1; L <= levels; L++) {
        b.cylinder({ x: tx(lx, lz), y: y + L * levelH - 0.05, z: tz(lx, lz),
          radius: 0.042, height: 0.10, segments: 8,
          mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
      }
    }
    // 妻側のつなぎ（前後の支柱を結ぶ）
    for (let L = 1; L <= levels; L++) {
      b.box({ x: tx(0, lz), y: y + L * levelH - 0.05, z: tz(0, lz),
        w: depth, h: 0.048, d: 0.048, yaw, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
  }

  /*
   * 筋交い。
   * これが無い足場は、風で倒れる格子でしかなく、
   * 見た目にも「組んである」感じが出ない。
   * 一つ飛ばしのスパンに、外側だけ斜材を入れる。
   */
  for (let i = 0; i < bays; i += 2) {
    const z0 = -length / 2 + (length / bays) * i;
    const z1 = -length / 2 + (length / bays) * (i + 1);
    const span = z1 - z0;
    for (let L = 0; L < levels; L++) {
      const y0 = y + L * levelH + 0.1, y1 = y + (L + 1) * levelH - 0.1;
      const dy = y1 - y0;
      const len = Math.hypot(span, dy);
      b.box({
        x: tx(depth / 2 + 0.03, (z0 + z1) / 2), y: (y0 + y1) / 2, z: tz(depth / 2 + 0.03, (z0 + z1) / 2),
        w: 0.038, h: 0.038, d: len, yaw, rx: -Math.atan2(dy, span),
        mat: 'galvanized', surface: SURFACE.METAL, collide: false,
      });
    }
  }

  for (let L = 1; L <= levels; L++) {
    const ly = y + L * levelH;
    /*
     * 踏板。
     * 1 枚の板で表すと、のっぺりした床になってしまう。
     * 実際は幅 24cm の足場板を並べたもので、
     * 板と板の隙間から下が見えるのが特徴。
     */
    const PW = 0.24;
    const planks = Math.max(1, Math.floor(depth / (PW + 0.02)));
    for (let k = 0; k < planks; k++) {
      const lx = -depth / 2 + (depth / planks) * (k + 0.5);
      b.box({
        x: tx(lx, 0), y: ly, z: tz(lx, 0),
        w: PW, h: 0.045, d: length * 0.995, yaw,
        mat: 'scaffoldPlank', surface: SURFACE.WOOD, collide: false,
      });
    }
    // 乗れる床としての判定は 1 枚でまとめる
    b.physics.addBox(tx(0, 0), ly, tz(0, 0), depth / 2, 0.025, length / 2, yaw,
      { surface: SURFACE.WOOD, penetration: 0.5 });
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
  /*
   * 円錐をわずかに揺らしただけでは、砂利の山ではなく
   * 「灰色のコーン」にしかならない（実際そう見えていた）。
   *
   * 山らしさは 3 つで決まる。
   *   ・安息角までしか積めないので、裾が広く頂が丸い
   *   ・重機で足された跡が筋になって残る
   *   ・裾に粒が転げ落ちて散らばる
   * 面数を増やして輪郭を崩し、裾に実際の石を置く。
   */
  const RS = 26, HS = 7;
  const geo = new THREE.ConeGeometry(radius, height, RS, HS);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // 0 = 頂点, 1 = 裾
    const t = 0.5 - v.y / height;
    if (t > 0.02) {
      const a = Math.atan2(v.z, v.x);
      // 大きなうねり（積んだ跡）＋ 中くらいの凹凸 ＋ 粒
      const lump = Math.sin(a * 3.1 + t * 5.2) * 0.055
                 + Math.sin(a * 5.7 - t * 3.1) * 0.035
                 + Math.sin(a * 11.3 + t * 9.4) * 0.018;
      // 頂は丸く、裾は広く（安息角のカーブ）
      const shape = Math.pow(t, 0.78);
      const r = radius * shape * (1 + lump);
      pos.setX(i, Math.cos(a) * r);
      pos.setZ(i, Math.sin(a) * r);
      pos.setY(i, v.y + Math.sin(a * 7.3 + t * 13) * height * 0.022);
    } else {
      // 頂点は 1 点に尖らせない
      pos.setY(i, v.y - height * 0.06);
    }
  }
  geo.computeVertexNormals();
  b.mesh(mat, geo, { x, y: y + height / 2, z });

  // 裾に転げ落ちた粒
  const stones = Math.round(radius * 9);
  for (let i = 0; i < stones; i++) {
    const a = R(0, Math.PI * 2);
    const r = radius * R(0.88, 1.28);
    const s = R(0.035, 0.10) * (radius / 2.2);
    b.box({
      x: x + Math.cos(a) * r, y: y + s * 0.35, z: z + Math.sin(a) * r,
      w: s, h: s * R(0.5, 0.9), d: s * R(0.7, 1.2), yaw: R(0, 3.14), rz: R(-0.4, 0.4),
      mat, surface: SURFACE.GRAVEL, collide: false,
    });
  }
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
  const { x, y = 0, z, yaw = 0, mat = 'upholsteryBlue' } = o;
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
  const { x, y = 0, z, yaw = 0, seats = 3, mat = 'upholstery' } = o;
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
  const { x, y = 0, z, yaw = 0, w = 1.5, d = 0.85, h = 0.72, mat = 'woodFineDark' } = o;
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
  const { x, y = 0, z, yaw = 0, mat = 'woodFine' } = o;
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
  const { x, y = 0, z, yaw = 0, w = 1.0, d = 2.0, mat = 'bedding' } = o;
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
  const { x, y = 0, z, yaw = 0, w = 1.1, d = 0.58, h = 1.9, mat = 'melamine' } = o;
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
  const { x, y = 0, z, yaw = 0, w = 0.6, d = 0.65, h = 1.75, mat = 'applianceWhite' } = o;
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
  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat: 'melaminePale', surface: SURFACE.WOOD, collide: false });
  // ステンレスの天板
  // 天板はシンクの右側だけ（左半分は下のシンク回りで作る）
  b.box({ x: at(w / 4, 0)[0], y: y + h + 0.02, z: at(w / 4, 0)[1],
    w: w / 2 + 0.015, h: 0.04, d: d + 0.03, yaw, mat: 'stainless', surface: SURFACE.METAL, collide: false });
  // 立ち上がり（壁との取り合い）
  b.box({ x: at(0, -d / 2 - 0.005)[0], y: y + h + 0.075, z: at(0, -d / 2 - 0.005)[1],
    w: w + 0.03, h: 0.11, d: 0.025, yaw, mat: 'stainless', surface: SURFACE.METAL, collide: false });
  /*
   * シンク。
   *
   * 以前は天板の上に箱を 2 つ載せていたため、
   * 窪みではなく「天板に置かれた台」になっていた。
   * 槽は天板より下に無ければならない。
   * 天板を槽のまわりの 4 枚に分けて、真ん中を開ける。
   */
  const [sx2, sz2] = at(-w / 4, 0);
  const BW = 0.46, BD = 0.38, BH = 0.19;
  // 槽の内壁 4 枚と底
  for (const sgn of [-1, 1]) {
    const [wx2, wz2] = at(-w / 4 + sgn * (BW / 2 - 0.012), 0);
    b.box({ x: wx2, y: y + h - BH / 2, z: wz2, w: 0.024, h: BH, d: BD, yaw,
      mat: 'stainless', surface: SURFACE.METAL, collide: false });
    const [dx2, dz2] = at(-w / 4, sgn * (BD / 2 - 0.012));
    b.box({ x: dx2, y: y + h - BH / 2, z: dz2, w: BW, h: BH, d: 0.024, yaw,
      mat: 'stainless', surface: SURFACE.METAL, collide: false });
  }
  b.box({ x: sx2, y: y + h - BH, z: sz2, w: BW, h: 0.024, d: BD, yaw,
    mat: 'stainless', surface: SURFACE.METAL, collide: false });
  // 排水口
  b.cylinder({ x: sx2, y: y + h - BH + 0.012, z: sz2, radius: 0.055, height: 0.012, segments: 12,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  // 槽のまわりだけ天板を残す（中央は開ける）
  const railW = (w - BW) / 2;
  for (const sgn of [-1, 1]) {
    const [tx2, tz2] = at(-w / 4 + sgn * (BW / 2 + railW / 2), 0);
    b.box({ x: tx2, y: y + h + 0.02, z: tz2, w: railW, h: 0.04, d: d + 0.03, yaw,
      mat: 'stainless', surface: SURFACE.METAL, collide: false });
    const [ty2, tz3] = at(-w / 4, sgn * (BD / 2 + (d - BD) / 4));
    b.box({ x: ty2, y: y + h + 0.02, z: tz3, w: BW, h: 0.04, d: (d + 0.03 - BD) / 2, yaw,
      mat: 'stainless', surface: SURFACE.METAL, collide: false });
  }
  // 水栓
  const [tx, tz] = at(-w / 4, -d / 2 + 0.10);
  b.cylinder({ x: tx, y: y + h + 0.04, z: tz, radius: 0.022, height: 0.26, segments: 10, mat: 'chrome', surface: SURFACE.METAL, collide: false });
  b.box({ x: tx, y: y + h + 0.29, z: tz + 0.09, w: 0.03, h: 0.03, d: 0.20, yaw, mat: 'chrome', surface: SURFACE.METAL, collide: false });
  // 扉と引き出し
  for (let i = 0; i < 3; i++) {
    const lx = -w / 2 + w / 3 * (i + 0.5);
    const [dx, dz] = at(lx, d / 2 + 0.012);
    b.box({ x: dx, y: y + h * 0.48, z: dz, w: w / 3 - 0.03, h: h - 0.18, d: 0.02, yaw, mat: 'melaminePale', surface: SURFACE.WOOD, collide: false });
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
  b.box({ x, y: y + 0.22, z, w, h: 0.44, d: 0.40, yaw, mat: 'melamineDark', surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + 0.45, z, w: w + 0.04, h: 0.03, d: 0.44, yaw, mat: 'melamineDark', surface: SURFACE.WOOD, collide: false });
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
  const { x, y = 0, z, yaw = 0, w = 0.9, d = 0.30, h = 1.85, tiers = 5, mat = 'melaminePale' } = o;
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
  const { x, y = 0, z, yaw = 0, w = 2.4, d = 0.7, h = 1.05, mat = 'melamineDark', top = 'laminateGrey' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat, surface: SURFACE.WOOD });
  // 天板（前へ張り出す）
  const [tx, tz] = at(0, 0.06);
  b.box({ x: tx, y: y + h + 0.02, z: tz, w: w + 0.1, h: 0.05, d: d + 0.16, yaw, mat: top, surface: SURFACE.CONCRETE, collide: false });
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
  /*
   * 幹。
   * 1 本の棒だと造花に見えるので、根元から数本に分かれさせる。
   */
  b.cylinder({ x, y: y + 0.28, z, radius: 0.030, height: height * 0.34, segments: 6,
    mat: 'bark', surface: SURFACE.WOOD, collide: false });
  const stems = 3;
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * Math.PI * 2 + R(-0.3, 0.3);
    const lean = R(0.10, 0.24);
    b.box({
      x: x + Math.cos(a) * height * lean * 0.5, y: y + 0.28 + height * 0.52,
      z: z + Math.sin(a) * height * lean * 0.5,
      w: 0.022, h: height * 0.46, d: 0.022,
      yaw: -a, rz: lean * 1.6, mat: 'bark', surface: SURFACE.WOOD, collide: false,
    });
  }

  /*
   * 葉。
   *
   * 以前は緑色の薄い箱を放射状に並べていて、
   * 「割れた緑のガラス」にしか見えなかった。
   * 抜きのある葉テクスチャを、交差させた 2 枚の板に貼る。
   * 板の交差は、どの角度から見ても厚みが感じられる古典的な手で、
   * 1 房あたり 4 面しか使わない。
   */
  const leafGeo = new THREE.PlaneGeometry(1, 1);
  const clusters = 7;
  for (let i = 0; i < clusters; i++) {
    const a = (i / clusters) * Math.PI * 2 + R(-0.25, 0.25);
    const r = R(0.10, 0.26) * (height / 1.1);
    const ly = y + 0.30 + height * (0.30 + (i / clusters) * 0.62) + R(-0.06, 0.06);
    const size = R(0.34, 0.52) * (height / 1.1);
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(leafGeo, b.mats.get('leafCard', { repeat: [1, 1] }));
      m.position.set(x + Math.cos(a) * r, ly, z + Math.sin(a) * r);
      m.rotation.set(R(-0.35, 0.35), a + k * Math.PI / 2, R(-0.3, 0.3));
      m.scale.set(size, size, 1);
      m.castShadow = true;
      m.receiveShadow = true;
      b.addExtra(m);
    }
  }
  b.physics.addCylinder(x, y + 0.16, z, 0.21, 0.16, { surface: SURFACE.CONCRETE, penetration: 0.6 });
  return b;
}

/** ごみ箱（屋内用） */
/**
 * 街路のごみ箱。
 *
 * 円筒に平らなフタを載せただけでは紙コップにしか見えない。
 * 実際に置かれているのは、脚のある枠に丸い受けが載り、
 * 上に投入口の空いたフタが付いた形。
 */
export function trashBin(b, o) {
  const { x, y = 0, z, yaw = 0, mat = 'galvanized', height = 0.78 } = o;
  const R0 = 0.185;
  const legs = 0.10;
  const bodyH = height - legs - 0.10;

  // 胴（下すぼまり）
  b.cylinder({ x, y: y + legs, z, radius: R0 * 0.86, height: bodyH * 0.30, segments: 16,
    mat, surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: y + legs + bodyH * 0.28, z, radius: R0, height: bodyH * 0.74, segments: 16,
    mat, surface: SURFACE.METAL, collide: false });
  // 縦のリブ（凹凸が無いと寸胴の筒になる）
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.box({ x: x + Math.cos(a) * R0, y: y + legs + bodyH * 0.60, z: z + Math.sin(a) * R0,
      w: 0.016, h: bodyH * 0.66, d: 0.016, yaw: -a, mat, surface: SURFACE.METAL, collide: false });
  }
  // 補強のたが
  for (const t of [0.30, 0.92]) {
    b.cylinder({ x, y: y + legs + bodyH * t, z, radius: R0 * 1.035, height: 0.026, segments: 16,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }

  // フタ（投入口が開いた笠）
  const lidY = y + legs + bodyH;
  b.cylinder({ x, y: lidY, z, radius: R0 * 1.10, height: 0.035, segments: 16,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: lidY + 0.035, z, radius: R0 * 0.95, height: 0.045, segments: 16,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  // 投入口（フタの手前を欠いた形。板 3 枚で囲う）
  for (let i = 0; i < 3; i++) {
    const a = yaw + Math.PI + (i - 1) * 0.95;
    b.box({ x: x + Math.sin(a) * R0 * 0.72, y: lidY + 0.075, z: z + Math.cos(a) * R0 * 0.72,
      w: R0 * 0.95, h: 0.055, d: 0.024, yaw: a, mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  }

  // 中の袋の口が縁からのぞく
  b.cylinder({ x, y: lidY - 0.055, z, radius: R0 * 0.93, height: 0.06, segments: 14,
    mat: 'plasticMatte', surface: SURFACE.FABRIC, collide: false });

  // 脚（3 本）と接地の輪
  for (let i = 0; i < 3; i++) {
    const a = yaw + (i / 3) * Math.PI * 2;
    b.box({ x: x + Math.cos(a) * R0 * 0.78, y: y + legs / 2, z: z + Math.sin(a) * R0 * 0.78,
      w: 0.028, h: legs, d: 0.028, yaw: -a, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }
  b.cylinder({ x, y, z, radius: R0 * 0.90, height: 0.020, segments: 14,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });

  b.physics.addCylinder(x, y + height / 2, z, R0 + 0.02, height / 2, { surface: SURFACE.METAL, penetration: 0.7 });
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

/**
 * 消火器（箱入り・壁掛け）。
 *
 * 事務所や集合住宅の廊下を歩いたとき、
 * 壁が延々と続くだけだと「通路の書き割り」に見える。
 * 実際の廊下には必ず、消火器・掲示板・分電盤・非常灯が付いている。
 * 赤は視界の中で強く効くので、置くだけで場所の記憶にもなる。
 */
export function fireExtinguisher(b, o) {
  const { x, y = 0, z, yaw = 0, box = true } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);

  if (box) {
    // 収納箱（壁付け）
    b.box({ x: x + nx * 0.16, y: y + 0.42, z: z + nz * 0.16, w: 0.30, h: 0.72, d: 0.26, yaw,
      mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
    // 扉のガラス窓
    b.box({ x: x + nx * 0.29, y: y + 0.46, z: z + nz * 0.29, w: 0.20, h: 0.44, d: 0.02, yaw,
      mat: 'acrylic', surface: SURFACE.GLASS, collide: false });
    // 「消火器」の赤帯
    b.box({ x: x + nx * 0.30, y: y + 0.13, z: z + nz * 0.30, w: 0.30, h: 0.10, d: 0.02, yaw,
      mat: 'plasticGlossRed', surface: SURFACE.METAL, collide: false });
  }
  // 本体
  b.cylinder({ x: x + nx * 0.16, y: y + 0.14, z: z + nz * 0.16, radius: 0.075, height: 0.42, segments: 10,
    mat: 'plasticGlossRed', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x: x + nx * 0.16, y: y + 0.56, z: z + nz * 0.16, radius: 0.028, height: 0.07, segments: 8,
    mat: 'brass', surface: SURFACE.METAL, collide: false });
  // ホース
  b.box({ x: x + nx * 0.24, y: y + 0.34, z: z + nz * 0.24, w: 0.03, h: 0.24, d: 0.03, yaw,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 掲示板。
 * 廊下の壁に貼る。紙の枚数がまちまちだと「使われている場所」に見える。
 */
export function noticeBoard(b, o) {
  const { x, y = 1.5, z, yaw = 0, w = 1.6, h = 0.9, seed = 3 } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  const tx = Math.cos(yaw), tz = -Math.sin(yaw);
  // 枠と下地
  b.box({ x: x + nx * 0.035, y, z: z + nz * 0.035, w, h, d: 0.05, yaw,
    mat: 'feltGreen', surface: SURFACE.CONCRETE, collide: false });
  for (const [ox, oy, ww, hh] of [
    [0, h / 2 + 0.03, w + 0.06, 0.06], [0, -h / 2 - 0.03, w + 0.06, 0.06],
    [-w / 2 - 0.03, 0, 0.06, h + 0.12], [w / 2 + 0.03, 0, 0.06, h + 0.12],
  ]) {
    b.box({ x: x + tx * ox + nx * 0.04, y: y + oy, z: z + tz * ox + nz * 0.04,
      w: ww, h: hh, d: 0.06, yaw, mat: 'aluminum', surface: SURFACE.METAL, collide: false });
  }
  // 貼り紙
  let r = seed;
  const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return (r / 0x7fffffff); };
  for (let i = 0; i < 5; i++) {
    const pw = 0.20 + rnd() * 0.10, ph = 0.28 + rnd() * 0.08;
    const ox = -w / 2 + 0.16 + (w - 0.32) * (i / 4);
    const oy = (rnd() - 0.5) * (h - ph - 0.1);
    b.box({ x: x + tx * ox + nx * 0.062, y: y + oy, z: z + tz * ox + nz * 0.062,
      w: pw, h: ph, d: 0.004, yaw, rz: (rnd() - 0.5) * 0.05,
      mat: 'paperPrint', surface: SURFACE.CONCRETE, collide: false });
  }
  return b;
}
