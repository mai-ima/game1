import * as THREE from 'three';
import { SURFACE } from '../Physics.js';

/**
 * 室内の小物。
 *
 * 建物に入れるようにしても、中が空なら「箱の内側」でしかない。
 * 人が住んでいる／働いている部屋には、必ず
 *   ・水回りの設備（動かせない）
 *   ・収納（壁に沿って立つ）
 *   ・小さな家電（面に置かれる）
 *   ・布（硬い面ばかりの部屋を柔らかくする）
 * の 4 種類がある。どれか一つでも欠けると、まだ引っ越していない部屋に見える。
 *
 * 座標の規約は Props.js と同じ。
 *   at(lx, lz) はローカル（右, 手前）→ ワールド
 *   yaw は「その物の正面が向く向き」で、法線は (sin yaw, 0, cos yaw)
 */

const local = (x, z, yaw) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
};

/**
 * 洗濯機（縦型）。
 * 蓋・操作盤・給水と排水のホースまで作る。
 * 白い箱だけだと冷蔵庫と区別が付かない。
 */
export function washingMachine(b, o) {
  const { x, y = 0, z, yaw = 0 } = o;
  const at = local(x, z, yaw);
  const W = 0.60, D = 0.60, H = 1.02;

  // 本体（脚で 4cm 浮く）
  b.box({ x, y: y + 0.04 + (H - 0.04) / 2, z, w: W, h: H - 0.04, d: D, yaw,
    mat: 'applianceWhite', surface: SURFACE.METAL });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = at(sx * (W / 2 - 0.06), sz * (D / 2 - 0.06));
      b.cylinder({ x: px, y, z: pz, radius: 0.022, height: 0.04, segments: 6,
        mat: 'plasticBlack', surface: SURFACE.RUBBER, collide: false });
    }
  }
  // 天板（一段細く、縁が立つ）
  b.box({ x, y: y + H + 0.01, z, w: W - 0.02, h: 0.03, d: D - 0.02, yaw,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  // 蓋（天板に彫り込まれた丸）
  b.cylinder({ x, y: y + H + 0.022, z, radius: 0.20, height: 0.014, segments: 18,
    mat: 'plasticGloss', surface: SURFACE.METAL, collide: false });
  b.mesh('plasticBlack', new THREE.TorusGeometry(0.205, 0.008, 4, 20),
    { x, y: y + H + 0.024, z, rx: Math.PI / 2 });
  // 操作盤（背面が立ち上がる）
  const [bx, bz] = at(0, -D / 2 + 0.05);
  b.box({ x: bx, y: y + H + 0.09, z: bz, w: W, h: 0.14, d: 0.10, yaw, rx: -0.22,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  const [fx, fz] = at(0, -D / 2 + 0.10);
  b.box({ x: fx, y: y + H + 0.10, z: fz, w: W - 0.10, h: 0.07, d: 0.02, yaw, rx: -0.22,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  // つまみ
  const [kx, kz] = at(W / 2 - 0.10, -D / 2 + 0.10);
  b.cylinder({ x: kx, y: y + H + 0.115, z: kz, radius: 0.026, height: 0.02, segments: 10,
    mat: 'plasticGloss', surface: SURFACE.METAL, collide: false });
  // 排水ホース（背面から床へ）
  const [hx, hz] = at(W / 2 - 0.08, -D / 2 - 0.03);
  b.cylinder({ x: hx, y, z: hz, radius: 0.018, height: 0.55, segments: 7,
    mat: 'plasticGrey', surface: SURFACE.RUBBER, collide: false });
  return b;
}

/**
 * 便器（タンク式）。
 * 陶器の丸みは球と円柱で近似する。角ばった箱にすると設備機器に見えない。
 */
export function toilet(b, o) {
  const { x, y = 0, z, yaw = 0 } = o;
  const at = local(x, z, yaw);

  // 便器の脚（床へ広がる）
  b.mesh('porcelain', new THREE.CylinderGeometry(0.16, 0.20, 0.30, 14),
    { x, y: y + 0.15, z });
  // 鉢（前へ張り出す）
  const [bx, bz] = at(0, 0.10);
  b.mesh('porcelain', new THREE.SphereGeometry(0.20, 14, 10),
    { x: bx, y: y + 0.36, z: bz, sy: 0.62, sz: 1.25 });
  // 便座
  b.mesh('plasticGloss', new THREE.TorusGeometry(0.175, 0.028, 6, 20),
    { x: bx, y: y + 0.40, z: bz, rx: Math.PI / 2, sz: 1.2 });
  // 蓋（開いて立っている）
  const [lx, lz] = at(0, -0.10);
  b.box({ x: lx, y: y + 0.58, z: lz, w: 0.36, h: 0.34, d: 0.03, yaw, rx: 0.12,
    mat: 'plasticGloss', surface: SURFACE.METAL, collide: false });
  // タンク
  const [tx, tz] = at(0, -0.22);
  b.box({ x: tx, y: y + 0.58, z: tz, w: 0.40, h: 0.36, d: 0.19, yaw,
    mat: 'porcelain', surface: SURFACE.CONCRETE });
  b.box({ x: tx, y: y + 0.77, z: tz, w: 0.42, h: 0.03, d: 0.21, yaw,
    mat: 'porcelain', surface: SURFACE.CONCRETE, collide: false });
  // 手洗い（タンクの上）と蛇口
  b.cylinder({ x: tx, y: y + 0.785, z: tz, radius: 0.09, height: 0.02, segments: 14,
    mat: 'porcelain', surface: SURFACE.CONCRETE, collide: false });
  const [sx2, sz2] = at(0, -0.30);
  b.cylinder({ x: sx2, y: y + 0.79, z: sz2, radius: 0.014, height: 0.10, segments: 8,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  b.box({ x: sx2, y: y + 0.885, z: sz2, w: 0.022, h: 0.022, d: 0.10, yaw, rx: 0.45,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  // レバーと給水管
  const [vx, vz] = at(0.20, -0.22);
  b.box({ x: vx, y: y + 0.68, z: vz, w: 0.08, h: 0.02, d: 0.02, yaw,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  const [px2, pz2] = at(-0.16, -0.30);
  b.cylinder({ x: px2, y, z: pz2, radius: 0.010, height: 0.46, segments: 6,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 洗面台。
 * カウンター・鉢・蛇口・鏡・下の収納。
 * 鏡は空ではなく部屋を映すので、粗さを少し残す。
 */
export function washBasin(b, o) {
  const { x, y = 0, z, yaw = 0, w = 0.75, mirror = true } = o;
  const at = local(x, z, yaw);
  const D = 0.50, H = 0.80;

  // 下の収納（扉 2 枚）
  b.box({ x, y: y + H / 2, z, w, h: H, d: D, yaw,
    mat: 'melaminePale', surface: SURFACE.WOOD });
  for (const s of [-1, 1]) {
    const [dx, dz] = at(s * w / 4, D / 2 + 0.008);
    b.box({ x: dx, y: y + H / 2, z: dz, w: w / 2 - 0.02, h: H - 0.06, d: 0.016, yaw,
      mat: 'melaminePale', surface: SURFACE.WOOD, collide: false });
    b.box({ x: dx + Math.cos(yaw) * (-s * (w / 4 - 0.05)), y: y + H / 2,
      z: dz - Math.sin(yaw) * (-s * (w / 4 - 0.05)),
      w: 0.02, h: 0.10, d: 0.025, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  // カウンター
  b.box({ x, y: y + H + 0.02, z, w: w + 0.03, h: 0.04, d: D + 0.03, yaw,
    mat: 'porcelain', surface: SURFACE.CONCRETE, collide: false });
  // 鉢（カウンターに彫り込む）
  b.mesh('porcelain', new THREE.SphereGeometry(0.17, 14, 9, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    { x, y: y + H + 0.03, z, sy: 0.55 });
  // 蛇口
  const [fx, fz] = at(0, -D / 2 + 0.09);
  b.cylinder({ x: fx, y: y + H + 0.04, z: fz, radius: 0.018, height: 0.15, segments: 10,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  b.box({ x: fx, y: y + H + 0.185, z: fz, w: 0.026, h: 0.026, d: 0.14, yaw, rx: 0.35,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  b.box({ x: fx, y: y + H + 0.215, z: fz, w: 0.09, h: 0.018, d: 0.018, yaw,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });

  if (!mirror) return b;
  // 鏡と枠
  const [mx, mz] = at(0, -D / 2 + 0.02);
  b.box({ x: mx, y: y + H + 0.55, z: mz, w: w + 0.02, h: 0.72, d: 0.06, yaw,
    mat: 'melaminePale', surface: SURFACE.WOOD, collide: false });
  {
    const g = new THREE.BoxGeometry(w - 0.06, 0.64, 0.02);
    g.rotateY(yaw);
    const [gx, gz] = at(0, -D / 2 + 0.06);
    g.translate(gx, y + H + 0.55, gz);
    b.addExtra(new THREE.Mesh(g, b.mats.solid('chrome', { roughness: 0.05 })));
  }
  return b;
}

/**
 * 浴槽。
 * エプロン（側面の板）・湯面・混合栓・シャワー。
 * 内側を彫らないと「風呂の形をした塊」になるので、
 * 底と 4 面を別に置いて中を空ける。
 */
export function bathtub(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.40, d = 0.78, h = 0.58, water = true } = o;
  const at = local(x, z, yaw);
  const T = 0.06;

  // 底
  b.box({ x, y: y + T / 2, z, w, h: T, d, yaw, mat: 'porcelain', surface: SURFACE.CONCRETE });
  // 4 面
  for (const [ox, oz, ww, dd] of [
    [0, -d / 2 + T / 2, w, T], [0, d / 2 - T / 2, w, T],
    [-w / 2 + T / 2, 0, T, d - T * 2], [w / 2 - T / 2, 0, T, d - T * 2],
  ]) {
    const [px, pz] = at(ox, oz);
    b.box({ x: px, y: y + h / 2, z: pz, w: ww, h, d: dd, yaw,
      mat: 'porcelain', surface: SURFACE.CONCRETE });
  }
  // 天端の縁（丸みの代わりに一段出す）
  b.box({ x, y: y + h + 0.015, z, w: w + 0.04, h: 0.03, d: d + 0.04, yaw,
    mat: 'porcelain', surface: SURFACE.CONCRETE, collide: false });
  if (water) {
    const g = new THREE.BoxGeometry(w - T * 2 - 0.02, 0.02, d - T * 2 - 0.02);
    g.rotateY(yaw);
    g.translate(x, y + h - 0.12, z);
    b.addExtra(new THREE.Mesh(g, b.mats.glass({ color: 0xa8c4c8, opacity: 0.55, transmission: 0.5 })));
  }
  // 混合栓とシャワー（背面の壁側）
  const [fx, fz] = at(0, -d / 2 - 0.04);
  b.box({ x: fx, y: y + h + 0.22, z: fz, w: 0.22, h: 0.07, d: 0.07, yaw,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  b.box({ x: fx, y: y + h + 0.16, z: fz, w: 0.03, h: 0.10, d: 0.09, yaw, rx: -0.5,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  const [sx2, sz2] = at(-0.42, -d / 2 - 0.03);
  b.cylinder({ x: sx2, y: y + h + 0.10, z: sz2, radius: 0.016, height: 0.85, segments: 8,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  b.mesh('chrome', new THREE.CylinderGeometry(0.055, 0.038, 0.05, 12),
    { x: sx2, y: y + h + 0.86, z: sz2, rx: 0.7, ry: yaw });
  return b;
}

/**
 * カーテンとレール。
 *
 * 硬い面ばかりの部屋に布が一枚入るだけで、
 * 光の受け方が変わって空気が動いて見える。
 *
 * ドレープ（ひだ）は板を交互にずらして作る。
 * 平らな 1 枚だと、窓に紙を貼ったようにしか見えない。
 */
export function curtain(b, o) {
  const {
    x, y, z, yaw = 0, w = 1.8, h = 1.9, open = 0.35,
    mat = 'curtainFabric', rail = true,
  } = o;
  const at = local(x, z, yaw);

  if (rail) {
    b.box({ x, y: y + h + 0.05, z, w: w + 0.26, h: 0.035, d: 0.05, yaw,
      mat: 'aluminum', surface: SURFACE.METAL, collide: false });
    for (const s of [-1, 1]) {
      const [px, pz] = at(s * (w / 2 + 0.13), 0);
      b.box({ x: px, y: y + h + 0.10, z: pz, w: 0.03, h: 0.09, d: 0.03, yaw,
        mat: 'aluminum', surface: SURFACE.METAL, collide: false });
    }
  }

  /*
   * 左右に寄せた 2 枚。
   * 1 枚あたり 5 枚の板を、前後に交互へずらして立てる。
   * 隣どうしが 3cm 前後するだけで、縦の陰影が出てひだに見える。
   */
  const panelW = (w / 2) * (1 - open);
  for (const side of [-1, 1]) {
    const cx = side * (w / 2 - panelW / 2);
    const N = 5;
    for (let i = 0; i < N; i++) {
      const t = cx - panelW / 2 + (panelW / N) * (i + 0.5);
      const depth = (i % 2 === 0 ? 0.030 : -0.012);
      const [px, pz] = at(t, depth);
      b.box({
        x: px, y: y + h / 2, z: pz,
        w: (panelW / N) * 1.15, h, d: 0.022, yaw,
        mat, surface: SURFACE.FABRIC, collide: false,
      });
    }
  }
  return b;
}

/**
 * 天井の照明器具（丸いシーリングライト）。
 *
 * 光源だけ置くと「天井に何も無いのに明るい」絵になる。
 * 乳白のカバーを自発光にして、見上げたときに光って見えるようにする。
 */
export function ceilingLight(b, o) {
  const { x, y, z, radius = 0.24, warm = true } = o;
  // 取り付け座
  b.cylinder({ x, y: y - 0.02, z, radius: radius * 0.34, height: 0.04, segments: 12,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  // カバー（下面が光る）
  const g = new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  g.scale(1, 0.42, 1);
  g.translate(x, y - 0.03, z);
  b.addExtra(new THREE.Mesh(g, b.mats.emissive(warm ? 0xf6efdc : 0xeef4f8, 2.4)));
  // 縁のリング
  b.mesh('applianceWhite', new THREE.TorusGeometry(radius, 0.012, 4, 18),
    { x, y: y - 0.03, z, rx: Math.PI / 2 });
  return b;
}

/**
 * エアコンの室内機（壁掛け）。
 * ルーバーと吸込みのスリットまで入れる。
 */
export function acIndoor(b, o) {
  const { x, y, z, yaw = 0, w = 0.82 } = o;
  const at = local(x, z, yaw);
  const H = 0.29, D = 0.22;

  // 本体（前面が丸く張り出す）
  b.box({ x: x + Math.sin(yaw) * D / 2, y, z: z + Math.cos(yaw) * D / 2,
    w, h: H, d: D, yaw, mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  b.mesh('applianceWhite', new THREE.CylinderGeometry(H / 2, H / 2, w, 12, 1, false, -Math.PI / 2, Math.PI),
    { x: x + Math.sin(yaw) * D, y, z: z + Math.cos(yaw) * D, rz: Math.PI / 2, ry: yaw });
  // 吸込みのスリット（上面）
  for (let i = 0; i < 7; i++) {
    const [px, pz] = at(0, D * 0.32 + i * 0.016);
    b.box({ x: px, y: y + H / 2 - 0.004, z: pz, w: w - 0.08, h: 0.006, d: 0.006, yaw,
      mat: 'plasticGrey', surface: SURFACE.METAL, collide: false });
  }
  // 吹出し口のルーバー（下向きに開く）
  const [lx, lz] = at(0, D * 0.72);
  b.box({ x: lx, y: y - H / 2 + 0.03, z: lz, w: w - 0.10, h: 0.03, d: 0.10, yaw, rx: 0.55,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  // 表示部
  const [dx, dz] = at(w / 2 - 0.12, D * 0.78);
  b.box({ x: dx, y: y - H / 2 + 0.055, z: dz, w: 0.10, h: 0.022, d: 0.008, yaw,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  // 配管（壁へ抜ける）
  const [px2, pz2] = at(-w / 2 + 0.06, 0.02);
  b.cylinder({ x: px2, y: y - H / 2 - 0.06, z: pz2, radius: 0.028, height: 0.12, segments: 8,
    mat: 'plasticMatte', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 食器棚。
 * 上はガラス戸、下は引き出し。中に器を並べる。
 */
export function dishCabinet(b, o) {
  const { x, y = 0, z, yaw = 0, w = 0.90, d = 0.42, h = 1.85 } = o;
  const at = local(x, z, yaw);
  const T = 0.02;

  // 側板・天板・地板・背板
  for (const s of [-1, 1]) {
    const [px, pz] = at(s * (w / 2 - T / 2), 0);
    b.box({ x: px, y: y + h / 2, z: pz, w: T, h, d, yaw, mat: 'melamine', surface: SURFACE.WOOD });
  }
  b.box({ x, y: y + h - T / 2, z, w, h: T, d, yaw, mat: 'melamine', surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + 0.05, z, w, h: 0.10, d: d - 0.04, yaw, mat: 'melamineDark', surface: SURFACE.WOOD });
  const [bx, bz] = at(0, -d / 2 + T / 2);
  b.box({ x: bx, y: y + h / 2, z: bz, w: w - T * 2, h, d: T, yaw, mat: 'melamine', surface: SURFACE.WOOD, collide: false });

  // 下段の引き出し 2 段
  for (let i = 0; i < 2; i++) {
    const dy = y + 0.22 + i * 0.24;
    const [fx, fz] = at(0, d / 2 - 0.005);
    b.box({ x: fx, y: dy, z: fz, w: w - 0.04, h: 0.22, d: 0.018, yaw,
      mat: 'melamine', surface: SURFACE.WOOD, collide: false });
    b.box({ x: fx + Math.sin(yaw) * 0.012, y: dy + 0.06, z: fz + Math.cos(yaw) * 0.012,
      w: w * 0.5, h: 0.016, d: 0.02, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  // 中段の棚板と器
  for (let i = 0; i < 3; i++) {
    const sy = y + 0.78 + i * 0.32;
    b.box({ x, y: sy, z, w: w - T * 2, h: 0.018, d: d - 0.03, yaw,
      mat: 'melamine', surface: SURFACE.WOOD, collide: false });
    // 皿を重ねた山と、伏せたコップ
    for (let k = 0; k < 3; k++) {
      const [px, pz] = at(-w / 2 + 0.14 + k * (w - 0.28) / 2, 0);
      if ((i + k) % 2 === 0) {
        b.cylinder({ x: px, y: sy + 0.01, z: pz, radius: 0.085, height: 0.055, segments: 12,
          mat: 'porcelain', surface: SURFACE.CONCRETE, collide: false });
      } else {
        for (let m = 0; m < 2; m++) {
          b.cylinder({ x: px + m * 0.07 - 0.035, y: sy + 0.01, z: pz, radius: 0.035, height: 0.085, segments: 10,
            mat: 'porcelain', surface: SURFACE.CONCRETE, collide: false });
        }
      }
    }
  }
  // 上段のガラス戸（2 枚）
  for (const s of [-1, 1]) {
    const [gx, gz] = at(s * w / 4, d / 2 - 0.006);
    const g = new THREE.BoxGeometry(w / 2 - 0.03, h - 0.82, 0.014);
    g.rotateY(yaw);
    g.translate(gx, y + 0.78 + (h - 0.82) / 2, gz);
    b.addExtra(new THREE.Mesh(g, b.mats.glass({ opacity: 0.18, transmission: 0.92 })));
    // 框
    for (const [ox, oy, ww, hh] of [
      [0, (h - 0.82) / 2 - 0.02, w / 2 - 0.03, 0.03],
      [0, -(h - 0.82) / 2 + 0.02, w / 2 - 0.03, 0.03],
      [-(w / 4 - 0.02), 0, 0.03, h - 0.82],
      [(w / 4 - 0.02), 0, 0.03, h - 0.82],
    ]) {
      const [fx2, fz2] = at(s * w / 4 + ox, d / 2 - 0.006);
      b.box({ x: fx2, y: y + 0.78 + (h - 0.82) / 2 + oy, z: fz2, w: ww, h: hh, d: 0.018, yaw,
        mat: 'melamine', surface: SURFACE.WOOD, collide: false });
    }
  }
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.WOOD, penetration: 0.5 });
  return b;
}

/**
 * 電子レンジ。
 * 扉のガラス・取っ手・操作盤・通気口。
 */
export function microwave(b, o) {
  const { x, y = 0, z, yaw = 0 } = o;
  const at = local(x, z, yaw);
  const W = 0.48, D = 0.36, H = 0.28;

  b.box({ x, y: y + H / 2, z, w: W, h: H, d: D, yaw,
    mat: 'applianceGrey', surface: SURFACE.METAL, collide: false });
  // 扉（左 3/4）とガラス
  const [dx, dz] = at(-W * 0.12, D / 2 + 0.008);
  b.box({ x: dx, y: y + H / 2, z: dz, w: W * 0.70, h: H - 0.03, d: 0.016, yaw,
    mat: 'applianceGrey', surface: SURFACE.METAL, collide: false });
  {
    const g = new THREE.BoxGeometry(W * 0.56, H - 0.09, 0.01);
    g.rotateY(yaw);
    const [gx, gz] = at(-W * 0.12, D / 2 + 0.016);
    g.translate(gx, y + H / 2, gz);
    b.addExtra(new THREE.Mesh(g, b.mats.glass({ color: 0x2a2e30, opacity: 0.62, transmission: 0.3 })));
  }
  // 取っ手
  const [hx, hz] = at(W * 0.22, D / 2 + 0.022);
  b.box({ x: hx, y: y + H / 2, z: hz, w: 0.022, h: H - 0.09, d: 0.022, yaw,
    mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  // 操作盤
  const [px, pz] = at(W * 0.35, D / 2 + 0.009);
  b.box({ x: px, y: y + H / 2, z: pz, w: W * 0.22, h: H - 0.03, d: 0.014, yaw,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  b.box({ x: px, y: y + H - 0.07, z: pz + Math.cos(yaw) * 0.008, w: W * 0.16, h: 0.03, d: 0.006, yaw,
    mat: 'screenPanel', surface: SURFACE.GLASS, collide: false });
  // 通気口（側面）
  for (let i = 0; i < 5; i++) {
    const [vx, vz] = at(-W / 2 - 0.002, -D * 0.2 + i * 0.03);
    b.box({ x: vx, y: y + H - 0.06, z: vz, w: 0.006, h: 0.10, d: 0.008, yaw,
      mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  }
  b.physics.addBox(x, y + H / 2, z, W / 2, H / 2, D / 2, yaw, { surface: SURFACE.METAL, penetration: 0.7 });
  return b;
}

/**
 * 靴箱（玄関）。
 * 上に小物を置く天板と、傘立て。
 */
export function shoeCabinet(b, o) {
  const { x, y = 0, z, yaw = 0, w = 0.90, d = 0.36, h = 1.05, umbrella = true } = o;
  const at = local(x, z, yaw);

  b.box({ x, y: y + h / 2, z, w, h, d, yaw, mat: 'melaminePale', surface: SURFACE.WOOD });
  // 天板（少し出す）
  b.box({ x, y: y + h + 0.015, z, w: w + 0.04, h: 0.03, d: d + 0.04, yaw,
    mat: 'woodFine', surface: SURFACE.WOOD, collide: false });
  // 扉 2 枚と取っ手
  for (const s of [-1, 1]) {
    const [dx, dz] = at(s * w / 4, d / 2 + 0.008);
    b.box({ x: dx, y: y + h / 2, z: dz, w: w / 2 - 0.02, h: h - 0.06, d: 0.016, yaw,
      mat: 'melaminePale', surface: SURFACE.WOOD, collide: false });
    const [gx, gz] = at(s * (w / 4 - s * (w / 4 - 0.06)), d / 2 + 0.020);
    b.box({ x: gx, y: y + h / 2, z: gz, w: 0.018, h: 0.14, d: 0.018, yaw,
      mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  // 巾木の逃げ
  b.box({ x, y: y + 0.03, z, w: w - 0.06, h: 0.06, d: d - 0.04, yaw,
    mat: 'melamineDark', surface: SURFACE.WOOD, collide: false });

  if (!umbrella) return b;
  // 傘立てと傘
  const [ux, uz] = at(w / 2 + 0.20, 0);
  b.cylinder({ x: ux, y, z: uz, radius: 0.115, height: 0.46, segments: 12,
    mat: 'plasticGrey', surface: SURFACE.METAL });
  b.mesh('plasticGrey', new THREE.TorusGeometry(0.115, 0.012, 4, 14),
    { x: ux, y: y + 0.45, z: uz, rx: Math.PI / 2 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05;
    b.cylinder({ x: ux + ox, y: y + 0.05, z: uz + oz, radius: 0.016, height: 0.86, segments: 6,
      mat: i === 1 ? 'plasticGlossRed' : 'plasticBlack', surface: SURFACE.METAL, collide: false });
    // 持ち手（J 字の代わりに短い横棒）
    b.box({ x: ux + ox, y: y + 0.93, z: uz + oz, w: 0.07, h: 0.016, d: 0.016, yaw: a,
      mat: i === 1 ? 'plasticGlossRed' : 'plasticBlack', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/**
 * 掛け時計。
 * 壁の高い位置にひとつあるだけで、部屋の「時間が流れている感じ」が出る。
 */
export function wallClock(b, o) {
  const { x, y, z, yaw = 0, radius = 0.16 } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  // 枠
  b.mesh('plasticMatte', new THREE.CylinderGeometry(radius, radius, 0.045, 20),
    { x: x + nx * 0.022, y, z: z + nz * 0.022, rx: Math.PI / 2, ry: yaw });
  // 文字盤
  b.mesh('paperPrint', new THREE.CylinderGeometry(radius - 0.016, radius - 0.016, 0.01, 20),
    { x: x + nx * 0.046, y, z: z + nz * 0.046, rx: Math.PI / 2, ry: yaw });
  // 目盛（12 本。3 の倍数だけ長い）
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const long = i % 3 === 0;
    const r = radius - 0.030;
    b.box({
      x: x + nx * 0.052 + Math.cos(yaw) * Math.sin(a) * r,
      y: y + Math.cos(a) * r,
      z: z + nz * 0.052 - Math.sin(yaw) * Math.sin(a) * r,
      w: long ? 0.014 : 0.008, h: long ? 0.030 : 0.016, d: 0.004,
      yaw, rz: -a, mat: 'plasticBlack', surface: SURFACE.METAL, collide: false,
    });
  }
  // 針（短針・長針）
  for (const [len, wdt, ang] of [[radius * 0.52, 0.012, 1.1], [radius * 0.76, 0.008, 3.4]]) {
    b.box({
      x: x + nx * 0.056 + Math.cos(yaw) * Math.sin(ang) * len / 2,
      y: y + Math.cos(ang) * len / 2,
      z: z + nz * 0.056 - Math.sin(yaw) * Math.sin(ang) * len / 2,
      w: wdt, h: len, d: 0.004, yaw, rz: -ang,
      mat: 'plasticBlack', surface: SURFACE.METAL, collide: false,
    });
  }
  b.cylinder({ x: x + nx * 0.058, y, z: z + nz * 0.058, radius: 0.010, height: 0.008, segments: 8,
    mat: 'brass', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 布団（敷いた状態）。
 * 敷布団・掛布団・枕。掛布団は端を折り返して厚みを見せる。
 */
export function futon(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.00, d = 2.00 } = o;
  const at = local(x, z, yaw);
  // 敷布団
  b.box({ x, y: y + 0.055, z, w, h: 0.11, d, yaw, mat: 'bedding', surface: SURFACE.FABRIC, collide: false });
  // 掛布団（足元 2/3 を覆う。少し盛り上げる）
  const [cx, cz] = at(0, -d * 0.16);
  b.box({ x: cx, y: y + 0.19, z: cz, w: w + 0.08, h: 0.16, d: d * 0.68, yaw,
    mat: 'beddingBlue', surface: SURFACE.FABRIC, collide: false });
  // 折り返し（衿）
  const [fx, fz] = at(0, d * 0.18);
  b.box({ x: fx, y: y + 0.22, z: fz, w: w + 0.08, h: 0.09, d: 0.22, yaw, rx: -0.25,
    mat: 'bedding', surface: SURFACE.FABRIC, collide: false });
  // 枕
  const [px, pz] = at(0, d / 2 - 0.24);
  b.box({ x: px, y: y + 0.16, z: pz, w: 0.56, h: 0.10, d: 0.34, yaw,
    mat: 'bedding', surface: SURFACE.FABRIC, collide: false });
  return b;
}

/**
 * 流し台（システムキッチンの一区画）。
 *
 * 既存の kitchenUnit は台と扉だけなので、
 * シンク・水切り・混合栓・コンロ・吊戸棚まで一式にした版を用意する。
 */
export function kitchenSink(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.80, d = 0.65, stove = true, upper = true } = o;
  const at = local(x, z, yaw);
  const H = 0.85;

  // 台輪と本体
  b.box({ x, y: y + 0.05, z, w: w - 0.06, h: 0.10, d: d - 0.08, yaw,
    mat: 'melamineDark', surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + 0.10 + (H - 0.10) / 2, z, w, h: H - 0.10, d, yaw,
    mat: 'melaminePale', surface: SURFACE.WOOD });
  // 天板（ステンレス。前縁が立つ）
  b.box({ x, y: y + H + 0.02, z, w: w + 0.03, h: 0.04, d: d + 0.03, yaw,
    mat: 'stainless', surface: SURFACE.METAL, collide: false });
  const [ex, ez] = at(0, d / 2 + 0.015);
  b.box({ x: ex, y: y + H + 0.05, z: ez, w: w + 0.03, h: 0.03, d: 0.02, yaw,
    mat: 'stainless', surface: SURFACE.METAL, collide: false });

  // シンク（左寄り。内側を彫る）
  const SW = 0.60, SD = 0.42, SH = 0.18;
  const [skx, skz] = at(-w * 0.22, 0);
  for (const [ox, oz, ww, dd] of [
    [0, -SD / 2, SW, 0.02], [0, SD / 2, SW, 0.02],
    [-SW / 2, 0, 0.02, SD], [SW / 2, 0, 0.02, SD],
  ]) {
    const [px, pz] = at(-w * 0.22 + ox, oz);
    b.box({ x: px, y: y + H - SH / 2, z: pz, w: ww, h: SH, d: dd, yaw,
      mat: 'stainless', surface: SURFACE.METAL, collide: false });
  }
  b.box({ x: skx, y: y + H - SH, z: skz, w: SW, h: 0.02, d: SD, yaw,
    mat: 'stainless', surface: SURFACE.METAL, collide: false });
  // 排水口
  b.cylinder({ x: skx, y: y + H - SH + 0.005, z: skz, radius: 0.055, height: 0.012, segments: 12,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  // 混合栓
  const [fx, fz] = at(-w * 0.22, -d / 2 + 0.10);
  b.cylinder({ x: fx, y: y + H + 0.04, z: fz, radius: 0.020, height: 0.24, segments: 10,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  b.box({ x: fx, y: y + H + 0.28, z: fz, w: 0.028, h: 0.028, d: 0.22, yaw, rx: 0.9,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });
  b.box({ x: fx, y: y + H + 0.20, z: fz, w: 0.10, h: 0.024, d: 0.024, yaw, rz: 0.3,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });

  if (stove) {
    // コンロ（右寄り。五徳と天板）
    const [gx, gz] = at(w * 0.26, 0);
    b.box({ x: gx, y: y + H + 0.045, z: gz, w: 0.58, h: 0.012, d: 0.46, yaw,
      mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
    for (const s of [-1, 1]) {
      const [bx2, bz2] = at(w * 0.26 + s * 0.15, 0);
      b.cylinder({ x: bx2, y: y + H + 0.05, z: bz2, radius: 0.055, height: 0.02, segments: 12,
        mat: 'castIron', surface: SURFACE.METAL, collide: false });
      // 五徳（4 本の爪）
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        b.box({ x: bx2 + Math.cos(a) * 0.075, y: y + H + 0.075, z: bz2 + Math.sin(a) * 0.075,
          w: 0.075, h: 0.014, d: 0.014, yaw: -a, mat: 'castIron', surface: SURFACE.METAL, collide: false });
      }
    }
    // つまみ
    for (const s of [-1, 1]) {
      const [kx, kz] = at(w * 0.26 + s * 0.13, d / 2 + 0.012);
      b.cylinder({ x: kx, y: y + H - 0.12, z: kz, radius: 0.028, height: 0.03, segments: 10,
        rx: Math.PI / 2, mat: 'plasticGloss', surface: SURFACE.METAL, collide: false });
    }
  }

  // 扉と引き出し
  for (let i = 0; i < 3; i++) {
    const [dx, dz] = at(-w / 2 + w * (i + 0.5) / 3, d / 2 + 0.008);
    b.box({ x: dx, y: y + 0.44, z: dz, w: w / 3 - 0.03, h: 0.62, d: 0.016, yaw,
      mat: 'melaminePale', surface: SURFACE.WOOD, collide: false });
    b.box({ x: dx, y: y + 0.72, z: dz + Math.cos(yaw) * 0.012, w: w / 3 * 0.6, h: 0.018, d: 0.022, yaw,
      mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }

  if (upper) {
    // 吊戸棚
    const [ux, uz] = at(0, -d / 2 + 0.18);
    b.box({ x: ux, y: y + 1.72, z: uz, w, h: 0.60, d: 0.36, yaw,
      mat: 'melaminePale', surface: SURFACE.WOOD });
    for (let i = 0; i < 2; i++) {
      const [ddx, ddz] = at(-w / 4 + i * (w / 2), -d / 2 + 0.18 + 0.185);
      b.box({ x: ddx, y: y + 1.72, z: ddz, w: w / 2 - 0.03, h: 0.56, d: 0.016, yaw,
        mat: 'melaminePale', surface: SURFACE.WOOD, collide: false });
      b.box({ x: ddx, y: y + 1.46, z: ddz + Math.cos(yaw) * 0.012, w: w / 2 * 0.5, h: 0.016, d: 0.02, yaw,
        mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
    }
    // 手元灯
    const [lx, lz] = at(0, -d / 2 + 0.30);
    b.box({ x: lx, y: y + 1.40, z: lz, w: w - 0.30, h: 0.04, d: 0.10, yaw,
      mat: 'aluminum', surface: SURFACE.METAL, collide: false });
  }
  return b;
}
