import * as THREE from 'three';
import { SURFACE } from './Physics.js';
import * as P from './Props.js';

/**
 * 建物の組み立て部品。
 *
 * 小物（Props.js）が「置くもの」なら、こちらは「入れるもの」。
 * 外殻・開口・屋根・付帯（雨樋・水切り・室外機・看板）まで一式で作る。
 *
 * 建物が書き割りに見えてしまう原因は、たいてい形ではなく
 * 「面が一枚で終わっていること」にある。
 * 実際の建物は、壁の面から必ず何かが出入りしている——
 * 基礎の水切り、窓の額縁、庇、笠木、雨樋、配管、換気口。
 * ここではその出入りを必ず作る。
 */

/* ================================================================= *
 *  共通の部品
 * ================================================================= */

/**
 * 窓。額縁・水切り・ガラス・桟までを一組で作る。
 * 壁に穴を開けるのは呼び出し側（wallWithGap）の役目で、
 * ここは開口に嵌める建具だけを受け持つ。
 */
export function windowUnit(b, o) {
  const {
    x, y, z, yaw = 0, w = 1.4, h = 1.2, depth = 0.24,
    frame = 'anodized', bars = 2, glass = true, sill = true,
  } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);      // 壁の法線
  const tx = Math.cos(yaw), tz = -Math.sin(yaw);     // 壁に沿う向き

  // 額縁（四周）
  const F = 0.055;
  for (const [ox, oy, ww, hh] of [
    [0, h / 2 - F / 2, w, F], [0, -h / 2 + F / 2, w, F],
    [-w / 2 + F / 2, 0, F, h - F * 2], [w / 2 - F / 2, 0, F, h - F * 2],
  ]) {
    b.box({
      x: x + tx * ox, y: y + oy, z: z + tz * ox,
      w: ww, h: hh, d: depth * 0.55, yaw, mat: frame, surface: SURFACE.METAL, collide: false,
    });
  }
  // 縦桟
  for (let i = 1; i <= bars; i++) {
    const ox = -w / 2 + (w * i) / (bars + 1);
    b.box({
      x: x + tx * ox, y, z: z + tz * ox,
      w: 0.035, h: h - F * 2, d: depth * 0.5, yaw, mat: frame, surface: SURFACE.METAL, collide: false,
    });
  }
  // ガラス
  if (glass) {
    const geo = new THREE.BoxGeometry(w - F * 2, h - F * 2, 0.02);
    geo.rotateY(yaw);
    geo.translate(x, y, z);
    const mesh = new THREE.Mesh(geo, b.mats.glass({ opacity: 0.28, transmission: 0.86 }));
    b.addExtra(mesh);
  }
  // 水切り（下端が壁から出る。これが無いと窓が壁に描いた絵に見える）
  if (sill) {
    b.box({
      x: x + nx * (depth * 0.32), y: y - h / 2 - 0.03, z: z + nz * (depth * 0.32),
      w: w + 0.14, h: 0.05, d: depth * 0.9, yaw, rx: 0.06,
      mat: 'concrete', surface: SURFACE.CONCRETE, collide: false,
    });
  }
  return b;
}

/** 扉。枠・戸・取っ手・蝶番・沓摺まで */
export function door(b, o) {
  const {
    x, y, z, yaw = 0, w = 0.9, h = 2.0, depth = 0.24,
    mat = 'woodFineDark', frame = 'plaster', open = 0,
  } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  const tx = Math.cos(yaw), tz = -Math.sin(yaw);

  // 三方枠
  const F = 0.07;
  for (const [ox, oy, ww, hh] of [
    [0, h - F / 2, w + F * 2, F],
    [-w / 2 - F / 2, h / 2, F, h], [w / 2 + F / 2, h / 2, F, h],
  ]) {
    b.box({
      x: x + tx * ox, y: y + oy, z: z + tz * ox,
      w: ww, h: hh, d: depth * 0.7, yaw, mat: frame, surface: SURFACE.CONCRETE, collide: false,
    });
  }
  // 戸（開き角を付けられる）
  const hingeX = x + tx * (-w / 2), hingeZ = z + tz * (-w / 2);
  const a = yaw + open;
  const anx = Math.sin(a), anz = Math.cos(a);
  const cx2 = hingeX + Math.cos(a) * (w / 2), cz2 = hingeZ - Math.sin(a) * (w / 2);
  const LEAF = 0.045;
  b.box({ x: cx2, y: y + h / 2, z: cz2, w, h, d: LEAF, yaw: a, mat, surface: SURFACE.WOOD, collide: false });
  /*
   * 鏡板の見切り。
   *
   * 以前は戸と同じ位置に厚さ 12mm の板を置いていた。
   * 戸の厚みが 45mm あるので、板はまるごと戸の内側に埋まって
   * どちらの面からも見えず、扉が「のっぺりした一枚板」に見えていた。
   * 表側の面から 8mm 持ち出す。
   */
  for (const py of [h * 0.28, h * 0.72]) {
    b.box({
      x: cx2 + anx * (LEAF / 2 + 0.004), y: y + py, z: cz2 + anz * (LEAF / 2 + 0.004),
      w: w - 0.16, h: h * 0.30, d: 0.016, yaw: a, mat, surface: SURFACE.WOOD, collide: false,
    });
  }
  // レバーハンドル（表側へ確実に出す）
  const hx = cx2 + Math.cos(a) * (w / 2 - 0.09) + anx * (LEAF / 2 + 0.03);
  const hz = cz2 - Math.sin(a) * (w / 2 - 0.09) + anz * (LEAF / 2 + 0.03);
  b.box({ x: hx, y: y + 1.02, z: hz, w: 0.11, h: 0.022, d: 0.022, yaw: a, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x: hx, y: y + 0.97, z: hz, radius: 0.028, height: 0.05, segments: 8, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  // 蝶番
  for (const py of [0.28, h - 0.28]) {
    b.box({ x: hingeX, y: y + py, z: hingeZ, w: 0.03, h: 0.09, d: 0.05, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  // 沓摺
  b.box({ x: x + nx * 0.01, y: y + 0.008, z: z + nz * 0.01, w: w + 0.1, h: 0.016, d: depth * 0.8, yaw,
    mat: 'stainless', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 陸屋根のパラペットと笠木。
 * 屋上が「板が浮いている」ように見えるのは、たいていこれが無いため。
 */
export function parapet(b, o) {
  const { x, y, z, w, d, yaw = 0, h = 0.85, mat = 'plaster' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  for (const [ox, oz, ww, dd] of [
    [0, -d / 2 + 0.1, w, 0.2], [0, d / 2 - 0.1, w, 0.2],
    [-w / 2 + 0.1, 0, 0.2, d - 0.4], [w / 2 - 0.1, 0, 0.2, d - 0.4],
  ]) {
    const [px, pz] = at(ox, oz);
    b.box({ x: px, y: y + h / 2, z: pz, w: ww, h, d: dd, yaw, mat, surface: SURFACE.CONCRETE });
    // 笠木（天端に載る金属の帽子）
    b.box({ x: px, y: y + h + 0.025, z: pz, w: ww + 0.08, h: 0.05, d: dd + 0.08, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/** 切妻屋根（垂木・野地板・棟・軒の出） */
export function gableRoof(b, o) {
  const { x, y, z, w, d, yaw = 0, pitch = 0.42, eave = 0.35, mat = 'roofTileRed' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const rise = (d / 2 + eave) * pitch;
  const slope = Math.hypot(d / 2 + eave, rise);

  for (const sz of [-1, 1]) {
    const mz = sz * (d / 4 + eave / 2);
    const px = x + s * mz, pz = z + c * mz;
    b.box({
      x: px, y: y + rise / 2, z: pz, w: w + eave * 2, h: 0.09, d: slope,
      yaw, rx: sz * Math.atan2(rise, d / 2 + eave),
      mat, surface: SURFACE.CONCRETE, collide: false,
    });
  }
  // 棟
  b.box({ x, y: y + rise + 0.03, z, w: w + eave * 2, h: 0.09, d: 0.16, yaw, mat, surface: SURFACE.CONCRETE, collide: false });
  // 妻壁（三角）
  for (const sx of [-1, 1]) {
    const gx = x + c * (sx * w / 2), gz = z - s * (sx * w / 2);
    const tri = new THREE.BufferGeometry();
    const hw = d / 2;
    tri.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -hw, 0, 0, hw, 0, rise, 0,
    ], 3));
    tri.computeVertexNormals();
    tri.rotateY(yaw);
    tri.translate(gx, y, gz);
    b.mesh('plaster', tri);
  }
  // 破風と軒樋
  for (const sz of [-1, 1]) {
    const gz2 = sz * (d / 2 + eave);
    const px = x + s * gz2, pz = z + c * gz2;
    b.box({ x: px, y: y + 0.02, z: pz, w: w + eave * 2, h: 0.14, d: 0.05, yaw,
      mat: 'woodDark', surface: SURFACE.WOOD, collide: false });
    b.cylinder({ x: px + c * (-w / 2 - eave), y: y - 0.06, z: pz + s * (w / 2 + eave),
      radius: 0.055, height: w + eave * 2, segments: 8, mat: 'plasticMatte', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/** 壁に付ける看板（文字入り。袖看板にもできる） */
export function wallSign(b, o) {
  const {
    x, y, z, yaw = 0, w = 2.2, h = 0.7, text = '', sub = '',
    bg = '#1d2530', fg = '#f2efe9', accent = '', vertical = false, blade = false,
  } = o;
  const mat = b.mats.signboard(text, {
    bg, fg, sub, accent, vertical,
    w: vertical ? 192 : 512, h: vertical ? 512 : 160,
  });
  const geo = new THREE.BoxGeometry(w, h, 0.07);
  geo.rotateY(yaw);
  geo.translate(x, y, z);
  const mesh = new THREE.Mesh(geo, mat);
  b.addExtra(mesh);
  // 取り付け金具
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  for (const s of [-1, 1]) {
    b.box({
      x: x - nx * 0.06 + Math.cos(yaw) * (w / 2 - 0.12) * s,
      y, z: z - nz * 0.06 - Math.sin(yaw) * (w / 2 - 0.12) * s,
      w: 0.035, h: h * 0.8, d: 0.05, yaw, mat: 'gunMetal', surface: SURFACE.METAL, collide: false,
    });
  }
  if (blade) {
    // 袖看板の腕
    b.box({ x: x - nx * 0.16, y, z: z - nz * 0.16, w: 0.05, h: 0.05, d: 0.3, yaw: yaw + Math.PI / 2,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/* ================================================================= *
 *  建物
 * ================================================================= */

/**
 * 平屋の家。
 * 玄関・窓 3 面・切妻屋根・基礎の水切り・室外機・雨樋。
 */
export function houseSmall(b, o) {
  const { x, y = 0, z, yaw = 0, w = 7.0, d = 6.0, h = 2.7, mat = 'stuccoWhite' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const hw = w / 2, hd = d / 2;

  // 基礎（壁より少し外へ出す）
  b.box({ x, y: y + 0.18, z, w: w + 0.16, h: 0.36, d: d + 0.16, yaw, mat: 'concrete', surface: SURFACE.CONCRETE });
  b.box({ x, y: y + 0.38, z, w: w + 0.22, h: 0.05, d: d + 0.22, yaw, mat: 'concrete', surface: SURFACE.CONCRETE, collide: false });

  // 4 面の壁（南面に玄関）
  const [s1x, s1z] = at(-hw, hd), [s2x, s2z] = at(hw, hd);
  b.wallWithGap({ x1: s1x, z1: s1z, x2: s2x, z2: s2z, y: y + 0.36, h, thickness: 0.24,
    gapStart: w * 0.5 - 0.45, gapWidth: 0.9, gapTop: 2.05, mat, surface: SURFACE.CONCRETE });
  const [n1x, n1z] = at(-hw, -hd), [n2x, n2z] = at(hw, -hd);
  b.wallWithGap({ x1: n1x, z1: n1z, x2: n2x, z2: n2z, y: y + 0.36, h, thickness: 0.24,
    gapStart: w * 0.34, gapWidth: 1.4, gapBottom: 0.95, gapTop: 2.15, mat, surface: SURFACE.CONCRETE });
  b.wallWithGap({ x1: n1x, z1: n1z, x2: s1x, z2: s1z, y: y + 0.36, h, thickness: 0.24,
    gapStart: d * 0.36, gapWidth: 1.3, gapBottom: 0.95, gapTop: 2.15, mat, surface: SURFACE.CONCRETE });
  b.wallWithGap({ x1: n2x, z1: n2z, x2: s2x, z2: s2z, y: y + 0.36, h, thickness: 0.24,
    gapStart: d * 0.36, gapWidth: 1.3, gapBottom: 0.95, gapTop: 2.15, mat, surface: SURFACE.CONCRETE });

  // 建具
  const [dx, dz] = at(0, hd);
  door(b, { x: dx, y: y + 0.36, z: dz, yaw, w: 0.9, h: 2.05, mat: 'woodDark', frame: mat });
  const [w1x, w1z] = at(w * 0.34 - hw + 0.7, -hd);
  windowUnit(b, { x: w1x, y: y + 0.36 + 1.55, z: w1z, yaw, w: 1.4, h: 1.2 });
  const [w2x, w2z] = at(-hw, d * 0.36 - hd + 0.65);
  windowUnit(b, { x: w2x, y: y + 0.36 + 1.55, z: w2z, yaw: yaw + Math.PI / 2, w: 1.3, h: 1.2 });
  const [w3x, w3z] = at(hw, d * 0.36 - hd + 0.65);
  windowUnit(b, { x: w3x, y: y + 0.36 + 1.55, z: w3z, yaw: yaw + Math.PI / 2, w: 1.3, h: 1.2 });

  // 屋根
  gableRoof(b, { x, y: y + 0.36 + h, z, w, d, yaw, pitch: 0.45, eave: 0.4 });

  // 付帯
  const [acx, acz] = at(hw + 0.35, -hd + 1.2);
  P.acUnit(b, { x: acx, y: y + 0.36, z: acz, yaw: yaw + Math.PI / 2 });
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (hw + 0.1), hd - 0.2);
    b.cylinder({ x: px, y: y + 0.36, z: pz, radius: 0.05, height: h - 0.1, segments: 8,
      mat: 'plasticMatte', surface: SURFACE.METAL, collide: false });
  }
  // 玄関の踏み段
  const [stx, stz] = at(0, hd + 0.5);
  b.box({ x: stx, y: y + 0.12, z: stz, w: 1.5, h: 0.24, d: 0.9, yaw, mat: 'concrete', surface: SURFACE.CONCRETE });
  return b;
}

/**
 * 店舗。1 階が店で、シャッター・庇・看板が付く。
 * 上階は住居という、市街地でいちばん多い形。
 */
export function shopFront(b, o) {
  const {
    x, y = 0, z, yaw = 0, w = 8.0, d = 7.0, floors = 2, mat = 'stuccoRough',
    name = '', sub = '', signBg = '#7a2b22', signFg = '#f4ece0',
  } = o;
  const FH = 3.1;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const hw = w / 2, hd = d / 2;
  const H = FH * floors;

  b.box({ x, y: y + 0.12, z, w: w + 0.14, h: 0.24, d: d + 0.14, yaw, mat: 'concrete', surface: SURFACE.CONCRETE });

  // 正面（南）: 1 階は開口、上階は窓
  const [f1x, f1z] = at(-hw, hd), [f2x, f2z] = at(hw, hd);
  b.wallWithGap({ x1: f1x, z1: f1z, x2: f2x, z2: f2z, y: y + 0.24, h: FH, thickness: 0.26,
    gapStart: 1.0, gapWidth: w - 2.0, gapTop: 2.5, mat, surface: SURFACE.CONCRETE });
  for (let f = 1; f < floors; f++) {
    b.wallWithGap({ x1: f1x, z1: f1z, x2: f2x, z2: f2z, y: y + 0.24 + FH * f, h: FH, thickness: 0.26,
      gapStart: w * 0.22, gapWidth: w * 0.56, gapBottom: 0.95, gapTop: 2.35, mat, surface: SURFACE.CONCRETE });
  }
  // 他の 3 面
  const [b1x, b1z] = at(-hw, -hd), [b2x, b2z] = at(hw, -hd);
  for (let f = 0; f < floors; f++) {
    const fy = y + 0.24 + FH * f;
    b.wall({ x1: b1x, z1: b1z, x2: b2x, z2: b2z, y: fy, h: FH, thickness: 0.26, mat, surface: SURFACE.CONCRETE });
    b.wall({ x1: b1x, z1: b1z, x2: f1x, z2: f1z, y: fy, h: FH, thickness: 0.26, mat, surface: SURFACE.CONCRETE });
    b.wall({ x1: b2x, z1: b2z, x2: f2x, z2: f2z, y: fy, h: FH, thickness: 0.26, mat, surface: SURFACE.CONCRETE });
  }
  // 床（各階）
  for (let f = 0; f <= floors; f++) {
    b.box({ x, y: y + 0.24 + FH * f, z, w, h: 0.24, d, yaw, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
  }

  // 1 階の店先: 半分をシャッター、半分をガラス
  const [shx, shz] = at(-w * 0.24, hd + 0.02);
  b.box({ x: shx, y: y + 0.24 + 1.55, z: shz, w: w * 0.4, h: 2.4, d: 0.05, yaw,
    mat: 'shutter', surface: SURFACE.METAL });
  const [gx, gz] = at(w * 0.22, hd + 0.02);
  windowUnit(b, { x: gx, y: y + 0.24 + 1.35, z: gz, yaw, w: w * 0.42, h: 2.1, bars: 3, sill: false });

  // 庇（前へ出て、下に影を落とす）
  const [awx, awz] = at(0, hd + 0.75);
  b.box({ x: awx, y: y + 0.24 + FH - 0.35, z: awz, w: w + 0.3, h: 0.10, d: 1.6, yaw, rx: 0.10,
    mat: 'metalRoofGreen', surface: SURFACE.METAL, collide: false });
  for (const sx of [-1, 1]) {
    const [bx2, bz2] = at(sx * (hw - 0.3), hd + 0.4);
    b.box({ x: bx2, y: y + 0.24 + FH - 0.62, z: bz2, w: 0.05, h: 0.62, d: 0.05, yaw, rx: -0.5,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }

  // 看板（庇の上と袖看板）
  if (name) {
    const [sx2, sz2] = at(0, hd + 0.12);
    wallSign(b, { x: sx2, y: y + 0.24 + FH + 0.42, z: sz2, yaw, w: w * 0.8, h: 0.85,
      text: name, sub, bg: signBg, fg: signFg, accent: '#c8783c' });
    const [bx3, bz3] = at(hw + 0.42, hd - 1.2);
    wallSign(b, { x: bx3, y: y + 0.24 + FH * 0.72, z: bz3, yaw: yaw + Math.PI / 2,
      w: 0.55, h: 1.7, text: name, bg: signBg, fg: signFg, vertical: true, blade: true });
  }

  // 屋上
  parapet(b, { x, y: y + 0.24 + FH * floors, z, w, d, yaw, h: 0.8, mat });
  const [acx, acz] = at(-hw + 1.4, -hd + 1.4);
  P.acUnit(b, { x: acx, y: y + 0.24 + FH * floors, z: acz, yaw });
  P.waterTank(b, { x: x + c * (hw - 1.5), y: y + 0.24 + FH * floors + 0.5, z: z - s * (hw - 1.5) });
  return b;
}

/**
 * 2 階建てアパート。
 * 外廊下と外階段が付き、戸口が等間隔に並ぶ。
 * 屋外から中へ入れる導線が多いので、対戦マップの部品として使いやすい。
 */
export function apartment(b, o) {
  const { x, y = 0, z, yaw = 0, units = 4, d = 7.0, mat = 'concreteBlock' } = o;
  const UW = 3.4, FH = 2.9;
  const w = UW * units;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const hw = w / 2, hd = d / 2;

  b.box({ x, y: y + 0.14, z, w: w + 0.16, h: 0.28, d: d + 0.16, yaw, mat: 'concrete', surface: SURFACE.CONCRETE });
  for (let f = 0; f <= 2; f++) {
    b.box({ x, y: y + 0.28 + FH * f, z, w, h: 0.26, d, yaw, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
  }

  for (let f = 0; f < 2; f++) {
    const fy = y + 0.28 + FH * f;
    // 背面（バルコニー側）: 掃き出し窓
    const [b1x, b1z] = at(-hw, -hd), [b2x, b2z] = at(hw, -hd);
    for (let u = 0; u < units; u++) {
      const x0 = -hw + UW * u;
      const [p1x, p1z] = at(x0, -hd), [p2x, p2z] = at(x0 + UW, -hd);
      b.wallWithGap({ x1: p1x, z1: p1z, x2: p2x, z2: p2z, y: fy, h: FH, thickness: 0.22,
        gapStart: 0.9, gapWidth: 1.6, gapTop: 2.2, mat, surface: SURFACE.CONCRETE });
      const [gx, gz] = at(x0 + 1.7, -hd);
      windowUnit(b, { x: gx, y: fy + 1.1, z: gz, yaw, w: 1.6, h: 2.1, bars: 1, sill: false });
    }
    // 正面（廊下側）: 玄関扉 + 小窓
    for (let u = 0; u < units; u++) {
      const x0 = -hw + UW * u;
      const [p1x, p1z] = at(x0, hd), [p2x, p2z] = at(x0 + UW, hd);
      b.wallWithGap({ x1: p1x, z1: p1z, x2: p2x, z2: p2z, y: fy, h: FH, thickness: 0.22,
        gapStart: 0.7, gapWidth: 0.95, gapTop: 2.05, mat, surface: SURFACE.CONCRETE });
      const [dx, dz] = at(x0 + 1.18, hd);
      /*
       * 廊下側の面の外向きは +z（ローカル）＝ yaw の向き。
       * ここを yaw+π にしていたため、玄関扉が室内を向いていた。
       * 取っ手も鏡板も裏に回り、廊下からは真っ平らな板に見えていた。
       */
      door(b, { x: dx, y: fy, z: dz, yaw, w: 0.95, h: 2.05, mat: 'paintedMetal', frame: mat });
      const [wx, wz] = at(x0 + 2.6, hd);
      windowUnit(b, { x: wx, y: fy + 1.75, z: wz, yaw, w: 0.7, h: 0.7, bars: 0 });
      // 部屋番号
      const [nx2, nz2] = at(x0 + 1.18, hd + 0.13);
      wallSign(b, { x: nx2, y: fy + 2.28, z: nz2, yaw, w: 0.44, h: 0.24,
        text: `${f + 1}0${u + 1}`, bg: '#20262e', fg: '#e8e2d6' });
    }
    // 妻面
    const [e1x, e1z] = at(-hw, -hd), [e2x, e2z] = at(-hw, hd);
    b.wall({ x1: e1x, z1: e1z, x2: e2x, z2: e2z, y: fy, h: FH, thickness: 0.24, mat, surface: SURFACE.CONCRETE });
    const [e3x, e3z] = at(hw, -hd), [e4x, e4z] = at(hw, hd);
    b.wall({ x1: e3x, z1: e3z, x2: e4x, z2: e4z, y: fy, h: FH, thickness: 0.24, mat, surface: SURFACE.CONCRETE });
  }

  // 外廊下（2 階）と手すり
  const [cwx, cwz] = at(0, hd + 0.85);
  b.box({ x: cwx, y: y + 0.28 + FH, z: cwz, w, h: 0.22, d: 1.7, yaw, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
  const [r1x, r1z] = at(-hw, hd + 1.66), [r2x, r2z] = at(hw, hd + 1.66);
  P.railing(b, { x1: r1x, z1: r1z, x2: r2x, z2: r2z, y: y + 0.28 + FH + 0.22, height: 1.1 });
  // 1 階の庇
  b.box({ x: cwx, y: y + 0.28 + FH - 0.02, z: cwz, w, h: 0.14, d: 1.7, yaw, mat: 'concrete', surface: SURFACE.CONCRETE, collide: false });

  // 外階段
  const [stx, stz] = at(hw + 1.3, hd + 0.9);
  b.stairs({ x: stx, y, z: stz, width: 1.2, rise: 0.185, run: 0.28, steps: 17, yaw: yaw + Math.PI, mat: 'concrete' });
  const [ldx, ldz] = at(hw + 1.3, hd + 1.9);
  P.railing(b, { x1: ldx, z1: ldz, x2: ldx + c * 0, z2: ldz - 4.6, y: y + 1.6, height: 1.0 });

  // 屋上
  parapet(b, { x, y: y + 0.28 + FH * 2, z, w, d, yaw, h: 0.75, mat });
  for (let u = 0; u < units; u++) {
    const [acx, acz] = at(-hw + UW * (u + 0.5), -hd + 1.0);
    P.acUnit(b, { x: acx, y: y + 0.28 + FH * 2, z: acz, yaw });
  }
  P.waterTank(b, { x: x + c * (hw - 1.6), y: y + 0.28 + FH * 2 + 0.5, z: z - s * (hw - 1.6) });
  return b;
}

/**
 * 倉庫。折板の大屋根と大扉。
 * 内部に柱が少ないので、屋内戦の広い場を作れる。
 */
export function warehouse(b, o) {
  const { x, y = 0, z, yaw = 0, w = 16, d = 12, h = 6.0, mat = 'sidingMetal' } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const hw = w / 2, hd = d / 2;

  b.box({ x, y: y + 0.15, z, w: w + 0.3, h: 0.3, d: d + 0.3, yaw, mat: 'concrete', surface: SURFACE.CONCRETE });
  b.box({ x, y: y + 0.31, z, w, h: 0.03, d, yaw, mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false });

  // 妻面（大扉）
  const [f1x, f1z] = at(-hw, hd), [f2x, f2z] = at(hw, hd);
  b.wallWithGap({ x1: f1x, z1: f1z, x2: f2x, z2: f2z, y: y + 0.3, h, thickness: 0.22,
    gapStart: w * 0.5 - 2.4, gapWidth: 4.8, gapTop: 4.4, mat, surface: SURFACE.METAL });
  const [sdx, sdz] = at(0, hd + 0.03);
  b.box({ x: sdx, y: y + 0.3 + 2.2, z: sdz, w: 4.8, h: 4.4, d: 0.06, yaw, mat: 'shutter', surface: SURFACE.METAL });
  // 反対の妻面（人用の扉）
  const [b1x, b1z] = at(-hw, -hd), [b2x, b2z] = at(hw, -hd);
  b.wallWithGap({ x1: b1x, z1: b1z, x2: b2x, z2: b2z, y: y + 0.3, h, thickness: 0.22,
    gapStart: w * 0.5 - 0.5, gapWidth: 1.0, gapTop: 2.1, mat, surface: SURFACE.METAL });
  // 側面（高窓）
  for (const sx of [-1, 1]) {
    const [p1x, p1z] = at(sx * hw, -hd), [p2x, p2z] = at(sx * hw, hd);
    b.wall({ x1: p1x, z1: p1z, x2: p2x, z2: p2z, y: y + 0.3, h, thickness: 0.22, mat, surface: SURFACE.METAL });
    for (let i = 0; i < 4; i++) {
      const [wx, wz] = at(sx * hw, -hd + d * (i + 0.5) / 4);
      windowUnit(b, { x: wx, y: y + 0.3 + h - 1.1, z: wz, yaw: yaw + Math.PI / 2, w: 1.6, h: 1.0, bars: 2, sill: false });
    }
  }

  // 折板の大屋根（緩い勾配）
  const rise = 1.2;
  for (const sz of [-1, 1]) {
    const mz = sz * d / 4;
    const [px, pz] = at(0, mz);
    b.box({
      x: px, y: y + 0.3 + h + rise / 2, z: pz, w: w + 0.5, h: 0.12, d: Math.hypot(d / 2, rise),
      yaw, rx: sz * Math.atan2(rise, d / 2), mat: 'metalRoof', surface: SURFACE.METAL,
    });
  }
  b.box({ x, y: y + 0.3 + h + rise + 0.04, z, w: w + 0.5, h: 0.1, d: 0.3, yaw, mat: 'metalRoof', surface: SURFACE.METAL, collide: false });
  // 鉄骨の柱と梁（内部）
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const [px, pz] = at(sx * (hw - 0.5), -hd + d * (i + 0.5) / 3);
      b.box({ x: px, y: y + 0.3 + h / 2, z: pz, w: 0.18, h, d: 0.22, yaw, mat: 'galvanized', surface: SURFACE.METAL });
    }
  }

  /*
   * ここまでだと、遠目には「青灰色の箱に緩い屋根が載っただけ」で、
   * 実際そう見えていた。倉庫を倉庫らしくしているのは
   *   ・外壁を縦に走る胴縁の陰
   *   ・軒先の樋と、隅を下りる竪樋
   *   ・妻面の換気ガラリ
   *   ・搬入口の庇と車止め
   *   ・基礎の立ち上がり
   * といった、外側に付いている物の方。
   */

  // 胴縁（1.2m ごとの縦の見切り）
  const RIBS = Math.max(2, Math.round(d / 1.2));
  for (const sx of [-1, 1]) {
    for (let i = 0; i < RIBS; i++) {
      const [px, pz] = at(sx * (hw + 0.115), -hd + d * (i + 0.5) / RIBS);
      b.box({ x: px, y: y + 0.3 + h / 2, z: pz, w: 0.030, h: h - 0.2, d: 0.10, yaw,
        mat, surface: SURFACE.METAL, collide: false });
    }
  }

  // 軒樋（両側）と竪樋（4 隅）
  for (const sx of [-1, 1]) {
    const [gx, gz] = at(sx * (hw + 0.22), 0);
    b.box({ x: gx, y: y + 0.3 + h + 0.06, z: gz, w: 0.14, h: 0.14, d: d + 0.4, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    for (const sz of [-1, 1]) {
      const [dx2, dz2] = at(sx * (hw + 0.20), sz * (hd - 0.3));
      b.cylinder({ x: dx2, y, z: dz2, radius: 0.055, height: h + 0.3, segments: 8,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
      // 呼び樋の曲がり
      b.box({ x: dx2, y: y + 0.20, z: dz2, w: 0.11, h: 0.11, d: 0.28, yaw,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
  }

  // 妻面の換気ガラリ（高い位置に 2 台）
  for (const sz of [-1, 1]) {
    for (const lx of [-w * 0.28, w * 0.28]) {
      const [vx, vz] = at(lx, sz * (hd + 0.12));
      b.box({ x: vx, y: y + 0.3 + h - 0.75, z: vz, w: 1.0, h: 0.70, d: 0.10, yaw,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
      for (let i = 0; i < 5; i++) {
        b.box({ x: vx, y: y + 0.3 + h - 1.02 + i * 0.13, z: vz, w: 0.94, h: 0.045, d: 0.14, yaw, rx: 0.5,
          mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
      }
    }
  }

  // 搬入口の庇と車止め
  {
    const [cx2, cz2] = at(0, hd + 0.75);
    b.box({ x: cx2, y: y + 0.3 + 4.75, z: cz2, w: 6.0, h: 0.14, d: 1.6, yaw, rx: 0.09,
      mat: 'metalRoof', surface: SURFACE.METAL, collide: false });
    for (const sx of [-1, 1]) {
      const [bx2, bz2] = at(sx * 2.7, hd + 1.35);
      const len = Math.hypot(1.35, 1.1);
      b.box({ x: bx2, y: y + 0.3 + 4.20, z: bz2, w: 0.075, h: 0.075, d: len, yaw,
        rx: -Math.atan2(1.1, 1.35), mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    // 車止め（縁に打った鉄パイプ）
    for (const sx of [-1, 1]) {
      const [px, pz] = at(sx * 3.1, hd + 0.35);
      b.cylinder({ x: px, y, z: pz, radius: 0.065, height: 0.72, segments: 8,
        mat: 'hazardStripe', surface: SURFACE.METAL, collide: false });
      b.cylinder({ x: px, y: y + 0.72, z: pz, radius: 0.065, height: 0.055, segments: 8,
        mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    }
    // 荷捌きの床（水勾配のついた土間）
    b.box({ x: cx2, y: y + 0.015, z: cz2, w: 6.6, h: 0.03, d: 2.2, yaw,
      mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
  }

  // 外壁の下端（基礎の立ち上がりと水切り）
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (hw + 0.06), 0);
    b.box({ x: px, y: y + 0.42, z: pz, w: 0.14, h: 0.24, d: d + 0.3, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }
  for (const sz of [-1, 1]) {
    const [px, pz] = at(0, sz * (hd + 0.06));
    b.box({ x: px, y: y + 0.42, z: pz, w: w + 0.3, h: 0.24, d: 0.14, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/**
 * 小屋（売店・詰所・変電小屋）。
 * 単体で置いても様になる最小の建物。
 */
export function kiosk(b, o) {
  const {
    x, y = 0, z, yaw = 0, w = 3.2, d = 2.6, h = 2.5, mat = 'paintedMetalTan',
    name = '', signBg = '#20303c',
  } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const hw = w / 2, hd = d / 2;

  b.box({ x, y: y + 0.09, z, w: w + 0.12, h: 0.18, d: d + 0.12, yaw, mat: 'concrete', surface: SURFACE.CONCRETE });
  // 正面: カウンターの開口
  const [f1x, f1z] = at(-hw, hd), [f2x, f2z] = at(hw, hd);
  b.wallWithGap({ x1: f1x, z1: f1z, x2: f2x, z2: f2z, y: y + 0.18, h, thickness: 0.16,
    gapStart: 0.5, gapWidth: w - 1.0, gapBottom: 1.0, gapTop: 2.15, mat, surface: SURFACE.METAL });
  // カウンター板
  const [cx2, cz2] = at(0, hd + 0.14);
  b.box({ x: cx2, y: y + 0.18 + 1.0, z: cz2, w: w - 1.0, h: 0.06, d: 0.44, yaw, mat: 'stainless', surface: SURFACE.METAL, collide: false });
  // 他の 3 面
  const [b1x, b1z] = at(-hw, -hd), [b2x, b2z] = at(hw, -hd);
  b.wallWithGap({ x1: b1x, z1: b1z, x2: b2x, z2: b2z, y: y + 0.18, h, thickness: 0.16,
    gapStart: w * 0.5 - 0.42, gapWidth: 0.85, gapTop: 2.0, mat, surface: SURFACE.METAL });
  b.wall({ x1: b1x, z1: b1z, x2: f1x, z2: f1z, y: y + 0.18, h, thickness: 0.16, mat, surface: SURFACE.METAL });
  b.wall({ x1: b2x, z1: b2z, x2: f2x, z2: f2z, y: y + 0.18, h, thickness: 0.16, mat, surface: SURFACE.METAL });
  // 屋根（前へ大きく出す）
  const [rx2, rz2] = at(0, 0.5);
  b.box({ x: rx2, y: y + 0.18 + h + 0.06, z: rz2, w: w + 0.5, h: 0.12, d: d + 1.3, yaw, rx: 0.06,
    mat: 'metalRoofGreen', surface: SURFACE.METAL });
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (hw - 0.1), hd + 1.0);
    b.cylinder({ x: px, y: y + 0.18, z: pz, radius: 0.045, height: h, segments: 8, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }
  if (name) {
    const [sx2, sz2] = at(0, hd + 0.1);
    wallSign(b, { x: sx2, y: y + 0.18 + h - 0.28, z: sz2, yaw, w: w - 0.5, h: 0.5,
      text: name, bg: signBg, fg: '#f2efe9' });
  }
  return b;
}

/** 自動販売機（日本の街角で最も目に付く箱） */
export function vendingMachine(b, o) {
  const { x, y = 0, z, yaw = 0, color = '#b8352c', name = '' } = o;
  const w = 1.1, d = 0.75, h = 1.9;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  /*
   * 筐体。
   *
   * 前面をそのまま塞ぐと、陳列を作っても本体の面に隠れて見えない。
   * 実物どおり、正面に奥行き 16cm の窪みを彫る形で組む。
   * 胴は後ろ寄りに置き、その手前に左右の柱と天板だけを立てる。
   */
  const CAVE = 0.17;                       // 窪みの深さ
  b.box({ x: at(0, -CAVE / 2)[0], y: y + h / 2, z: at(0, -CAVE / 2)[1],
    w, h, d: d - CAVE, yaw, mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  // 窪みの左右の柱と、上下の見切り
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (w / 2 - 0.035), d / 2 - CAVE / 2);
    b.box({ x: px, y: y + h / 2, z: pz, w: 0.070, h, d: CAVE, yaw,
      mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  }
  for (const [ly, lh] of [[h - 0.12, 0.24], [0.44, 0.88]]) {
    const [px, pz] = at(0, d / 2 - CAVE / 2);
    b.box({ x: px, y: y + ly, z: pz, w, h: lh, d: CAVE, yaw,
      mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  }

  /*
   * 商品見本の窓。
   *
   * ここが自販機の顔で、無いと「前面に紙を貼った冷蔵庫」にしかならない。
   * 実際に見えているのは
   *   ・上端の光る社名帯
   *   ・その下の、ガラス越しに並ぶ商品見本
   *   ・見本を載せる棚板と、値段の札
   * の 3 層。
   */
  const [fx, fz] = at(0, d / 2 + 0.012);

  // 上端の光る帯
  const bannerH = 0.24;
  const banner = b.mats.signboard(name || '飲料', {
    bg: color, fg: '#ffffff', w: 512, h: 120, worn: 0.08,
  });
  {
    const g = new THREE.BoxGeometry(w - 0.05, bannerH, 0.022);
    g.rotateY(yaw);
    g.translate(fx, y + h - 0.16, fz);
    const m = new THREE.Mesh(g, banner);
    m.userData.signText = name || '飲料';
    m.userData.signKind = 'label';
    b.addExtra(m);
  }

  /* ---- 見本の陳列（棚 2 段 × 5 本） ---- */
  const winY0 = y + 0.86, winH = h - 0.36 - 0.86;
  // 奥の内壁（暗い）
  const [wx, wz] = at(0, d / 2 - CAVE + 0.02);
  b.box({ x: wx, y: winY0 + winH / 2, z: wz, w: w - 0.10, h: winH, d: 0.03, yaw,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  for (let r = 0; r < 2; r++) {
    const sy = winY0 + 0.045 + r * (winH / 2);
    // 棚板
    const [shx, shz] = at(0, d / 2 - CAVE * 0.55);
    b.box({ x: shx, y: sy, z: shz, w: w - 0.12, h: 0.018, d: 0.13, yaw,
      mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
    // 缶とペットボトルを並べる
    for (let i = 0; i < 5; i++) {
      const lx = -w / 2 + 0.14 + i * ((w - 0.28) / 4);
      const [bx2, bz2] = at(lx, d / 2 - CAVE * 0.55);
      const tall = (i + r) % 3 === 0;
      b.cylinder({ x: bx2, y: sy + 0.018, z: bz2,
        radius: tall ? 0.032 : 0.033, height: tall ? 0.185 : 0.125, segments: 9,
        mat: tall ? 'acrylic' : (i % 2 ? 'plasticGlossRed' : 'brushedMetal'),
        surface: SURFACE.METAL, collide: false });
      // 値段の札
      b.box({ x: bx2, y: sy - 0.022, z: bz2, w: 0.070, h: 0.028, d: 0.008, yaw,
        mat: 'paperPrint', surface: SURFACE.METAL, collide: false });
    }
  }
  // ガラス（陳列の手前）
  {
    const g = new THREE.BoxGeometry(w - 0.10, winH, 0.014);
    g.rotateY(yaw);
    g.translate(fx, winY0 + winH / 2, fz);
    b.addExtra(new THREE.Mesh(g, b.mats.glass({ opacity: 0.30, transmission: 0.9 })));
  }
  // 窓の枠
  for (const sy of [-1, 1]) {
    b.box({ x: fx, y: winY0 + winH / 2 + sy * (winH / 2 + 0.020), z: fz,
      w: w - 0.05, h: 0.040, d: 0.030, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }

  /* ---- 操作まわり ---- */
  // ボタンの列（見本の下、それぞれの商品の真下に来るよう 5 個）
  for (let i = 0; i < 5; i++) {
    const lx = -w / 2 + 0.14 + i * ((w - 0.28) / 4);
    const [bx2, bz2] = at(lx, d / 2 + 0.022);
    b.box({ x: bx2, y: y + 0.80, z: bz2, w: 0.115, h: 0.048, d: 0.024, yaw,
      mat: i % 2 ? 'plasticGlossRed' : 'plasticGloss', surface: SURFACE.METAL, collide: false });
  }
  // 硬貨投入口・紙幣挿入口・返却レバー・釣銭受け
  const [cx2, cz2] = at(w / 2 - 0.16, d / 2 + 0.020);
  b.box({ x: cx2, y: y + 0.70, z: cz2, w: 0.055, h: 0.020, d: 0.020, yaw,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: cx2, y: y + 0.62, z: cz2, w: 0.100, h: 0.030, d: 0.018, yaw,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  b.box({ x: cx2, y: y + 0.53, z: cz2, w: 0.035, h: 0.055, d: 0.030, yaw,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  // 金額表示
  const [dx2, dz2] = at(-w / 2 + 0.20, d / 2 + 0.020);
  b.box({ x: dx2, y: y + 0.70, z: dz2, w: 0.150, h: 0.060, d: 0.016, yaw,
    mat: 'screenPanel', surface: SURFACE.METAL, collide: false });

  // 取り出し口（奥まった箱＋跳ね上げ扉）
  const [gx, gz] = at(0, d / 2 - 0.02);
  b.box({ x: gx, y: y + 0.28, z: gz, w: w - 0.24, h: 0.26, d: 0.10, yaw,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  const [fgx, fgz] = at(0, d / 2 + 0.012);
  b.box({ x: fgx, y: y + 0.34, z: fgz, w: w - 0.26, h: 0.17, d: 0.020, yaw, rx: -0.32,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  b.box({ x: fgx, y: y + 0.44, z: fgz, w: w - 0.22, h: 0.035, d: 0.045, yaw,
    mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });

  // 台輪とアジャスタ
  b.box({ x, y: y + 0.05, z, w: w - 0.04, h: 0.10, d: d - 0.04, yaw,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  for (const sx of [-1, 1]) {
    const [lx2, lz2] = at(sx * (w / 2 - 0.09), 0);
    b.cylinder({ x: lx2, y, z: lz2, radius: 0.022, height: 0.035, segments: 6,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }
  // 側面の通気口
  for (const sx of [-1, 1]) {
    const [vx, vz] = at(sx * (w / 2 + 0.004), -d * 0.22);
    for (let i = 0; i < 5; i++) {
      b.box({ x: vx, y: y + 0.30 + i * 0.045, z: vz, w: 0.014, h: 0.020, d: 0.22, yaw,
        mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    }
  }
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, d / 2, yaw, { surface: SURFACE.METAL, penetration: 0.25 });
  return b;
}

/* ================================================================= *
 *  ファサードの付帯物
 *
 *  建物が書き割りに見える最大の理由は、壁が「ただの面」で
 *  終わっていること。実際の建物の壁からは必ず何かが出ている。
 *  ここはその「出ているもの」を集めた場所。
 * ================================================================= */

/**
 * 竪樋（たてどい）。
 * 壁に沿って落ちる雨樋。上端の呼び樋、途中の控え金物、
 * 下端の曲がりまで入れる。これ 1 本で壁の縦の間延びが切れる。
 *
 * @param {object} o {x, y, z, yaw, height, radius, mat}
 *   yaw は壁の外向き。樋はその面に張り付く。
 */
export function downpipe(b, o) {
  const { x, y = 0, z, yaw = 0, height = 6, radius = 0.062, mat = 'plasticMatte', head = true } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  const px = x + nx * (radius + 0.02), pz = z + nz * (radius + 0.02);

  b.cylinder({ x: px, y: y + 0.06, z: pz, radius, height: height - 0.06, segments: 8,
    mat, surface: SURFACE.METAL, collide: false });
  // 控え金物。1.5m ごと。これが無いと棒が浮いているように見える
  for (let hy = 0.9; hy < height - 0.3; hy += 1.4) {
    b.box({ x: x + nx * (radius * 0.55), y: y + hy, z: z + nz * (radius * 0.55),
      w: radius * 3.4, h: 0.03, d: radius * 2.4, yaw, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }
  // 下端の曲がり（地面へ向けて折れる）
  b.cylinder({ x: px, y: y + 0.02, z: pz, radius: radius * 1.12, height: 0.16, segments: 8,
    mat, surface: SURFACE.METAL, collide: false });
  b.box({ x: px + nx * 0.10, y: y + 0.055, z: pz + nz * 0.10, w: radius * 2.1, h: radius * 2.1, d: 0.22,
    yaw: yaw + Math.PI / 2, mat, surface: SURFACE.METAL, collide: false });
  // 上端の集水器
  if (head) {
    b.box({ x: px, y: y + height + 0.09, z: pz, w: radius * 3.4, h: 0.20, d: radius * 3.0, yaw,
      mat, surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/**
 * 壁付けの室外機。架台に載せて、冷媒管を壁へ引き込む。
 * 集合住宅やビルの側面が単調になるのを防ぐ。
 */
export function wallAc(b, o) {
  const { x, y, z, yaw = 0 } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  // 架台（アングル 2 本と方杖）
  for (const s of [-1, 1]) {
    const ax = x + Math.cos(yaw) * s * 0.34, az = z - Math.sin(yaw) * s * 0.34;
    b.box({ x: ax + nx * 0.20, y, z: az + nz * 0.20, w: 0.035, h: 0.035, d: 0.42,
      yaw: yaw + Math.PI / 2, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    b.box({ x: ax + nx * 0.12, y: y - 0.16, z: az + nz * 0.12, w: 0.03, h: 0.34, d: 0.03,
      yaw, rx: 0.62, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }
  P.acUnit(b, { x: x + nx * 0.22, y: y + 0.02, z: z + nz * 0.22, yaw });
  // 冷媒管（テープ巻き）が壁へ入る
  b.box({ x: x + nx * 0.09, y: y + 0.44, z: z + nz * 0.09, w: 0.075, h: 0.075, d: 0.30,
    yaw: yaw + Math.PI / 2, mat: 'plasticMatte', surface: SURFACE.METAL, collide: false });
  b.box({ x: x - Math.cos(yaw) * 0.30 + nx * 0.05, y: y + 0.72, z: z + Math.sin(yaw) * 0.30 + nz * 0.05,
    w: 0.075, h: 0.62, d: 0.075, yaw, mat: 'plasticMatte', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 引込盤・量水器の類。
 * 建物の足元に必ず付いていて、視線の高さにあるので効きが大きい。
 */
export function meterPanel(b, o) {
  const { x, y = 0, z, yaw = 0, w = 0.62, h = 0.78, mat = 'paintedMetal' } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  b.box({ x: x + nx * 0.075, y: y + h / 2, z: z + nz * 0.075, w, h, d: 0.15, yaw,
    mat, surface: SURFACE.METAL, collide: false });
  // 扉の縁と丁番
  b.box({ x: x + nx * 0.155, y: y + h / 2, z: z + nz * 0.155, w: w - 0.06, h: h - 0.06, d: 0.02, yaw,
    mat, surface: SURFACE.METAL, collide: false });
  for (const s of [-1, 1]) {
    b.box({ x: x + nx * 0.15 + Math.cos(yaw) * (w / 2 - 0.03), y: y + h / 2 + s * (h / 2 - 0.12),
      z: z + nz * 0.15 - Math.sin(yaw) * (w / 2 - 0.03),
      w: 0.03, h: 0.06, d: 0.04, yaw, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  // 引込管
  b.cylinder({ x: x + nx * 0.06 - Math.cos(yaw) * (w / 2 + 0.06), y, z: z + nz * 0.06 + Math.sin(yaw) * (w / 2 + 0.06),
    radius: 0.03, height: h + 0.5, segments: 6, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 外部避難階段。
 * 中層ビルの側面や背面に付く。踊り場が段になるので、
 * 遠目でも「階数のある建物」に見える。上れるように当たりも付ける。
 */
export function fireEscape(b, o) {
  const {
    x, y = 0, z, yaw = 0, floors = 3, fh = 3.4, width = 1.1,
    mat = 'diamondPlate', rail = 'gunMetal',
  } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  /** ローカル (壁沿い右, 壁から外) → ワールド */
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  /*
   * 折り返し階段。
   *
   * 最初の版は、どの階も同じ位置から同じ向きに段を出していた。
   * 段は上り切っても次の踊り場に届かず、宙に浮いた斜めの板が
   * 何枚も重なるだけになっていた（実際その絵が撮れた）。
   *
   * 正しくは、踊り場を階ごとに左右へ振り、
   * その間を 1 flight で結ぶ。行って戻るので、
   * 壁沿いに必要な幅は踊り場 2 つぶんで済む。
   */
  const HALF = 2.3;                  // 踊り場の中心が中心から離れる距離
  const OUT = 0.42 + width / 2;      // 壁からの持ち出し（寄せないと仮設足場に見える）
  const LAND_W = 2.2;
  const STEPS = 16;
  const rise = fh / STEPS;
  const run = (HALF * 2) / STEPS;

  for (let f = 0; f <= floors; f++) {
    const side = f % 2 === 0 ? -1 : 1;
    const ly = y + fh * f;
    const [lx, lz] = at(side * HALF, OUT);

    // 踊り場
    b.box({ x: lx, y: ly - 0.06, z: lz, w: LAND_W, h: 0.12, d: width + 0.6, yaw,
      mat, surface: SURFACE.METAL });
    // 踊り場を壁へ受ける方杖
    for (const e of [-1, 1]) {
      const [gx, gz] = at(side * HALF + e * (LAND_W / 2 - 0.15), 0.28);
      b.box({ x: gx, y: ly - 0.55, z: gz, w: 0.05, h: 0.95, d: 0.05, yaw, rx: 0.72,
        mat: rail, surface: SURFACE.METAL, collide: false });
    }
    // 外側の手すり
    const [q1x, q1z] = at(side * HALF - LAND_W / 2, OUT + width / 2 + 0.28);
    const [q2x, q2z] = at(side * HALF + LAND_W / 2, OUT + width / 2 + 0.28);
    P.railing(b, { x1: q1x, z1: q1z, x2: q2x, z2: q2z, y: ly, height: 1.08, mat: rail });

    if (f === floors) break;

    /*
     * 上りの段。
     * side から -side へ渡る。b.stairs は yaw の逆向き
     * （-sin, -cos）へ登るので、壁沿い右へ登らせたいときは
     * yaw - π/2 を渡す。
     */
    /*
     * 段板。
     *
     * b.stairs は段を「高さ = 蹴上げ」の箱で積むので、
     * 鉄骨階段に使うと厚さ 21cm の塊が並び、
     * 縞鋼板の凹凸と相まってトゲの束に見えた。
     * 鉄骨の段板は 4cm ほどで、蹴込みは開いている。板だけを並べる。
     */
    for (let i = 0; i < STEPS; i++) {
      const t = side * (HALF - LAND_W / 2 + 0.1) - side * run * (i + 0.5);
      const [tx2, tz2] = at(t, OUT);
      b.box({ x: tx2, y: ly + rise * (i + 1) - 0.02, z: tz2,
        w: run + 0.02, h: 0.04, d: width, yaw, mat, surface: SURFACE.METAL });
    }
    // ささら桁（段板を受ける斜めの桁）
    for (const e of [-1, 1]) {
      const [g1x, g1z] = at(side * (HALF - LAND_W / 2 + 0.1), OUT + e * (width / 2 + 0.04));
      const [g2x, g2z] = at(-side * (HALF - LAND_W / 2 + 0.1), OUT + e * (width / 2 + 0.04));
      const gl = Math.hypot(g2x - g1x, g2z - g1z);
      b.box({
        x: (g1x + g2x) / 2, y: ly + fh / 2 - 0.14, z: (g1z + g2z) / 2,
        w: 0.045, h: 0.17, d: Math.hypot(gl, fh),
        yaw: Math.atan2(g2x - g1x, g2z - g1z), rx: -Math.atan2(fh, gl),
        mat, surface: SURFACE.METAL, collide: false,
      });
    }
    // 斜めの手すり（段の外側）
    const [h1x, h1z] = at(side * (HALF - LAND_W / 2 + 0.1), OUT + width / 2 + 0.06);
    const [h2x, h2z] = at(-side * (HALF - LAND_W / 2 + 0.1), OUT + width / 2 + 0.06);
    for (const t of [0.18, 0.5, 0.82]) {
      const px = h1x + (h2x - h1x) * t, pz = h1z + (h2z - h1z) * t;
      b.cylinder({ x: px, y: ly + fh * t, z: pz, radius: 0.028, height: 1.0, segments: 6,
        mat: rail, surface: SURFACE.METAL, collide: false });
    }
    // 段の手すり本体（傾いた 1 本）
    {
      const dx = h2x - h1x, dz = h2z - h1z;
      const len = Math.hypot(dx, dz);
      const slope = Math.atan2(fh, len);
      b.box({
        x: (h1x + h2x) / 2, y: ly + fh / 2 + 1.0, z: (h1z + h2z) / 2,
        w: 0.045, h: 0.045, d: Math.hypot(len, fh),
        yaw: Math.atan2(dx, dz), rx: -slope,
        mat: rail, surface: SURFACE.METAL, collide: false,
      });
    }
  }

  // 通し支柱（踊り場の外側の角）
  for (const side of [-1, 1]) {
    for (const e of [-1, 1]) {
      const [px, pz] = at(side * HALF + e * (LAND_W / 2), OUT + width / 2 + 0.28);
      b.cylinder({ x: px, y, z: pz, radius: 0.038, height: fh * floors + 1.1,
        segments: 8, mat: rail, surface: SURFACE.METAL, collide: false });
    }
  }
  return b;
}

/**
 * 中層ビル（3〜9 階の雑居ビル・事務所ビル）。
 *
 * 市街地の絵をいちばん多く占めるのはこの型なのに、
 * 部品が無かったので、遠景では窓の帯を巻いただけの箱を使っていた。
 * 近づくと嘘が判る。
 *
 * 押さえどころは 4 つ。
 *   ・階の境に水平の見切り（スパンドレル）を入れる
 *   ・窓は面より奥に引っ込める（額縁の影が階調を作る）
 *   ・1 階だけ階高を上げて、店舗かエントランスにする
 *   ・屋上に必ず物を載せる（塔屋・水槽・手すり・ダクト）
 */
export function midRise(b, o) {
  const {
    x, y = 0, z, yaw = 0, w = 14, d = 11, floors = 5,
    fh = 3.35, groundH = 4.1, mat = 'concreteRaw', trim = 'concrete',
    name = '', sub = '', signBg = '#1d2530', signFg = '#eef1f4',
    escape = true, entrance = true,
  } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const hw = w / 2, hd = d / 2;
  const H = groundH + fh * (floors - 1);

  /* ---- 躯体 ---- */
  /*
   * 壁は「殻」として作る。
   *
   * 最初は中身の詰まった箱を 1 つ置き、その面に窓を貼っていた。
   * ところが窓のガラスも室内の面も、箱の前面より内側に来るので
   * まるごと箱に隠れ、外からは額縁の出っ張りしか見えなかった。
   * 5 階建てを正面から撮ったら、目地の入った一枚のスラブだった。
   *
   * 内側に一回り小さい暗い塊（＝室内）を置き、
   * その外側に厚さ T の壁を、窓の位置を抜いて回す。
   * こうすると開口が本当に開くので、
   *   ・上枠が落とす影
   *   ・見込み（開口の側面）の陰
   *   ・奥のガラスの映り込み
   * が全部そろう。壁の面が一段深くなる。
   */
  const T = 0.26;

  // 基礎の水切り。壁より外へ出して、足元に影の線を作る
  b.box({ x, y: y + 0.22, z, w: w + 0.20, h: 0.44, d: d + 0.20, yaw,
    mat: trim, surface: SURFACE.CONCRETE });
  b.box({ x, y: y + 0.46, z, w: w + 0.26, h: 0.05, d: d + 0.26, yaw,
    mat: trim, surface: SURFACE.CONCRETE, collide: false });

  const base = y + 0.44;
  // 室内に相当する塊。窓の奥はここが見える
  b.box({ x, y: base + H / 2, z, w: w - T * 2, h: H, d: d - T * 2, yaw,
    mat: 'roomDark', surface: SURFACE.CONCRETE });

  /* ---- 窓割り ---- */
  const cols = Math.max(2, Math.round(w / 2.7));
  const colsD = Math.max(2, Math.round(d / 2.7));
  const winW = (w / cols) * 0.74;
  const winWD = (d / colsD) * 0.74;

  /*
   * どの窓にブラインドが下りているか。
   *
   * 全部を暗くすると廃ビルに、全部を明るくすると
   * 判で押したような CG に見える。位置から決まる擬似乱数で
   * 3 割ほどを明るくすると、面に不揃いのリズムが出る。
   * 建物の座標を種に混ぜてあるので、隣の棟とは並びが変わる。
   */
  const seed = Math.abs(Math.round(x * 31.7 + z * 17.3));
  const blindAt = (i, f, s2) => {
    const n = Math.sin(i * 12.9898 + f * 78.233 + s2 * 37.719 + seed) * 43758.5453;
    return (n - Math.floor(n)) < 0.32;
  };

  /** 面ごとの壁芯（外面から T/2 内側） */
  const faces = [
    { n: 0, len: w, half: hw, other: hd - T / 2, cols, ww: winW },        // +Z
    { n: 1, len: w, half: hw, other: -(hd - T / 2), cols, ww: winW },     // -Z
    { n: 2, len: d, half: hd, other: hw - T / 2, cols: colsD, ww: winWD },  // +X
    { n: 3, len: d, half: hd, other: -(hw - T / 2), cols: colsD, ww: winWD },// -X
  ];
  /** 面 n の線分の両端（ローカル） */
  const faceEnds = (fc) => (fc.n < 2
    ? [[-fc.half, fc.other], [fc.half, fc.other]]
    : [[fc.other, -fc.half], [fc.other, fc.half]]);
  /** 面 n の外向き yaw */
  const faceYaw = (fc) => yaw + [0, Math.PI, Math.PI / 2, -Math.PI / 2][fc.n];

  for (let f = 0; f < floors; f++) {
    const fy = f === 0 ? base : base + groundH + fh * (f - 1);
    const fHeight = f === 0 ? groundH : fh;
    // 開口（1 階は正面だけ大きく開ける）
    /*
     * 窓の割り。
     *
     * 幅 1.7 × 高さ 2.0 の縦長にしていたら、事務所ビルというより
     * 集合住宅の掃き出し窓が並んでいるように見えた。
     * 腰を 1m 取り、窓高を 1.5m に抑えると横長になり、
     * 事務所らしい水平の連なりが出る。
     */
    const winH = fHeight * 0.46;
    const sill = fHeight * 0.30;

    for (const fc of faces) {
      const [[ax, az], [bx2, bz2]] = faceEnds(fc);
      const [w1x, w1z] = at(ax, az), [w2x, w2z] = at(bx2, bz2);
      const gaps = [];
      if (f === 0) {
        if (entrance && fc.n === 0) {
          gaps.push({ start: fc.len / 2 - (w * 0.31), width: w * 0.62, bottom: 0, top: groundH - 1.1 });
        } else if (fc.n === 1) {
          // 背面は通用口
          gaps.push({ start: fc.len * 0.62, width: 1.15, bottom: 0, top: 2.15 });
        }
      } else {
        for (let i = 0; i < fc.cols; i++) {
          const step = fc.len / fc.cols;
          gaps.push({ start: step * i + (step - fc.ww) / 2, width: fc.ww, bottom: sill, top: sill + winH });
        }
      }
      b.wallWithGaps({
        x1: w1x, z1: w1z, x2: w2x, z2: w2z, y: fy, h: fHeight, thickness: T,
        gaps, mat, surface: SURFACE.CONCRETE,
      });

      // 建具
      const fyaw = faceYaw(fc);
      const nx3 = Math.sin(fyaw), nz3 = Math.cos(fyaw);
      for (let gi = 0; gi < gaps.length; gi++) {
        const g = gaps[gi];
        const t = g.start + g.width / 2 - fc.len / 2;
        const [lx, lz] = fc.n < 2
          ? [fc.n === 0 ? t : -t, fc.other]
          : [fc.other, fc.n === 2 ? -t : t];
        const [gx2, gz2] = at(lx, lz);
        const cy = fy + (g.bottom + g.top) / 2;
        const gh = g.top - g.bottom;
        // ガラス（壁芯より少し内側）
        const geo = new THREE.BoxGeometry(g.width - 0.06, gh - 0.06, 0.03);
        geo.rotateY(fyaw);
        geo.translate(gx2 - nx3 * (T * 0.18), cy, gz2 - nz3 * (T * 0.18));
        b.addExtra(new THREE.Mesh(geo,
          f === 0 ? b.mats.glass({ opacity: 0.26, transmission: 0.86 }) : b.mats.windowGlass()));
        // 方立
        b.box({ x: gx2 - nx3 * (T * 0.18), y: cy, z: gz2 - nz3 * (T * 0.18),
          w: 0.055, h: gh, d: 0.055, yaw: fyaw, mat: 'anodized', surface: SURFACE.METAL, collide: false });
        // 額縁（開口の四周を外へ出す）
        for (const [ox2, oy2, ww2, hh2] of [
          [0, gh / 2 + 0.06, g.width + 0.24, 0.12],
          [0, -gh / 2 - 0.06, g.width + 0.24, 0.12],
          [-g.width / 2 - 0.06, 0, 0.12, gh],
          [g.width / 2 + 0.06, 0, 0.12, gh],
        ]) {
          b.box({
            x: gx2 + Math.cos(fyaw) * ox2 + nx3 * (T / 2 + 0.03),
            y: cy + oy2,
            z: gz2 - Math.sin(fyaw) * ox2 + nz3 * (T / 2 + 0.03),
            w: ww2, h: hh2, d: 0.12, yaw: fyaw,
            mat: trim, surface: SURFACE.CONCRETE, collide: false,
          });
        }
        // ブラインド（開口の奥に紙 1 枚）
        if (f > 0 && blindAt(gi, f, fc.n)) {
          b.box({ x: gx2 - nx3 * (T * 0.42), y: cy + gh * 0.08, z: gz2 - nz3 * (T * 0.42),
            w: g.width - 0.10, h: gh * 0.84, d: 0.03, yaw: fyaw,
            mat: 'blindPale', surface: SURFACE.CONCRETE, collide: false });
        }
      }
    }

    // 階の境の見切り（スパンドレル）。これで横のラインが通る
    if (f > 0) {
      b.box({ x, y: fy + 0.10, z, w: w + 0.10, h: 0.20, d: d + 0.10, yaw,
        mat: trim, surface: SURFACE.CONCRETE, collide: false });
    }
    // 床スラブ（内部が見えたときに階が判る）
    b.box({ x, y: fy - 0.09, z, w: w - T * 2 + 0.02, h: 0.18, d: d - T * 2 + 0.02, yaw,
      mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false });
  }

  /* ---- 1 階 ---- */
  if (entrance) {
    // 正面（+z 側）を店舗・エントランスにする
    const [gx, gz] = at(0, hd);
    // 大判のガラス。方立で 3 枚に割る
    const gw = w * 0.62;
    windowUnit(b, { x: gx, y: y + 0.44 + groundH * 0.5, z: gz, yaw, w: gw, h: groundH - 1.3, bars: 3, sill: false });
    // 入口の庇（キャンチ）
    const [ax2, az2] = at(0, hd + 0.85);
    b.box({ x: ax2, y: y + 0.44 + groundH - 0.55, z: az2, w: gw + 1.6, h: 0.22, d: 1.8, yaw,
      mat: trim, surface: SURFACE.CONCRETE, collide: false });
    // 御影石の腰。ビルの足元は必ず一段違う材で巻いてある
    for (const sz of [-1, 1]) {
      const [kx, kz] = at(0, sz * (hd + 0.06));
      b.box({ x: kx, y: y + 0.44 + 0.5, z: kz, w: w * 0.99, h: 1.0, d: 0.12, yaw,
        mat: 'granite', surface: SURFACE.CONCRETE, collide: false });
    }
    // 段
    const [stx, stz] = at(0, hd + 0.7);
    b.box({ x: stx, y: y + 0.30, z: stz, w: gw + 0.8, h: 0.28, d: 1.3, yaw,
      mat: trim, surface: SURFACE.CONCRETE });
  }

  /* ---- 付帯 ---- */
  // 竪樋（角に 2 本）
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (hw - 0.35), -hd);
    downpipe(b, { x: px, y, z: pz, yaw: yaw + Math.PI, height: 0.44 + H - 0.2 });
  }
  // 引込盤と量水器
  const [mx, mz] = at(-hw + 1.1, hd);
  meterPanel(b, { x: mx, y: y + 0.5, z: mz, yaw });
  // 側面の室外機（階ごと）
  for (let f = 1; f < floors; f++) {
    const fy = y + 0.44 + groundH + fh * (f - 1);
    const [ax3, az3] = at(hw, -hd + d * 0.3);
    wallAc(b, { x: ax3, y: fy + 0.9, z: az3, yaw: yaw + Math.PI / 2 });
  }
  // 外部避難階段（背面）
  if (escape) {
    const [ex, ez] = at(hw - 3.2, -hd);
    fireEscape(b, { x: ex, y: y + 0.44, z: ez, yaw: yaw + Math.PI, floors: floors - 1, fh });
  }
  // 袖看板
  if (name) {
    const [bx, bz] = at(hw + 0.45, hd - 1.4);
    wallSign(b, { x: bx, y: y + 0.44 + groundH + fh * 0.9, z: bz, yaw: yaw + Math.PI / 2,
      w: 0.62, h: 2.2, text: name, bg: signBg, fg: signFg, vertical: true, blade: true });
    const [nx2, nz2] = at(0, hd + 0.1);
    wallSign(b, { x: nx2, y: y + 0.44 + groundH + 0.55, z: nz2, yaw,
      w: w * 0.5, h: 0.6, text: name, sub, bg: signBg, fg: signFg });
  }

  /* ---- 屋上 ---- */
  const top = y + 0.44 + H;
  parapet(b, { x, y: top, z, w, d, yaw, h: 1.05, mat: trim });
  P.rooftopClutter(b, { x, y: top, z, yaw });
  // 塔屋（階段室）。屋上の輪郭に高さの差を作る
  const [px2, pz2] = at(-hw + 2.6, -hd + 2.4);
  b.box({ x: px2, y: top + 1.35, z: pz2, w: 3.2, h: 2.7, d: 3.0, yaw, mat: trim, surface: SURFACE.CONCRETE });
  b.box({ x: px2, y: top + 2.76, z: pz2, w: 3.5, h: 0.12, d: 3.3, yaw, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  P.waterTank(b, { x: x + c * (hw - 2.2), y: top + 0.6, z: z - s * (hw - 2.2), radius: 1.1, height: 1.8, legs: 0.9 });
  return b;
}

/**
 * 面より奥へ引っ込めた窓。
 * 額縁を外へ、ガラスを奥へ置くだけだが、
 * これがあるかないかで壁の階調がまるで変わる。
 */
export function recessedWindow(b, o) {
  const {
    x, y, z, yaw = 0, w = 1.6, h = 2.0, depth = 0.20, trim = 'concrete',
    blind = 0,
  } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  const tx = Math.cos(yaw), tz = -Math.sin(yaw);

  /*
   * 窓の奥。
   *
   * 躯体は中身の詰まった箱なので、ガラスの向こうには
   * 壁と同じコンクリートが見えていた。透過を上げても
   * 「壁と同じ色の板」が見えるだけで、窓がまったく窓に見えない。
   * 実際、5 階建てを撮ったら、のっぺりした一枚のスラブになっていた。
   *
   * 室内に相当する面を 1 枚入れる。
   * すべて暗くすると死んだビルになるので、
   * 何割かはブラインドを下ろした明るい面にする。
   */
  b.box({
    x: x - nx * (depth + 0.05), y, z: z - nz * (depth + 0.05),
    w: w + 0.06, h: h + 0.06, d: 0.08, yaw,
    mat: blind > 0.5 ? 'blindPale' : 'roomDark', surface: SURFACE.CONCRETE, collide: false,
  });

  // 開口の四周（外へ 5cm 出す）
  const F = 0.13;
  for (const [ox, oy, ww, hh] of [
    [0, h / 2 + F / 2, w + F * 2, F], [0, -h / 2 - F / 2, w + F * 2, F],
    [-w / 2 - F / 2, 0, F, h], [w / 2 + F / 2, 0, F, h],
  ]) {
    b.box({
      x: x + tx * ox + nx * 0.03, y: y + oy, z: z + tz * ox + nz * 0.03,
      w: ww, h: hh, d: 0.10, yaw, mat: trim, surface: SURFACE.CONCRETE, collide: false,
    });
  }
  // 内側の見込み（穴の壁）。ここが影になる
  for (const [ox, oy, ww, hh] of [
    [0, h / 2, w, 0.04], [0, -h / 2, w, 0.04],
    [-w / 2, 0, 0.04, h], [w / 2, 0, 0.04, h],
  ]) {
    b.box({
      x: x + tx * ox - nx * depth / 2, y: y + oy, z: z + tz * ox - nz * depth / 2,
      w: ww, h: hh, d: depth, yaw, mat: trim, surface: SURFACE.CONCRETE, collide: false,
    });
  }
  // ガラス（奥へ）
  const geo = new THREE.BoxGeometry(w, h, 0.03);
  geo.rotateY(yaw);
  geo.translate(x - nx * depth, y, z - nz * depth);
  b.addExtra(new THREE.Mesh(geo, b.mats.glass({ opacity: 0.34, transmission: 0.72 })));
  // 方立
  b.box({ x: x - nx * (depth - 0.02), y, z: z - nz * (depth - 0.02),
    w: 0.05, h, d: 0.05, yaw, mat: 'anodized', surface: SURFACE.METAL, collide: false });
  return b;
}



/* ================================================================= *
 *  中に入れる建物
 *
 *  外観だけの棟と違い、こちらは
 *    ・各階に歩ける床がある
 *    ・階段で上下できる
 *    ・部屋と廊下に仕切られている
 *    ・屋上まで出られる
 *  ところまで作る。対戦の舞台になるのはこの型。
 * ================================================================= */

/**
 * 階段室。
 *
 * 1 階ぶんを 2 flight（折り返し）で上がる。
 * 直通の 1 flight にすると、階高 3.4m を 45 度近い勾配で
 * 一気に登ることになり、走ると引っかかる。
 *
 * b.stairs は yaw の逆向き（-sin, -cos）へ登るので、
 *   +Z へ登らせたい → yaw = π
 *   -Z へ登らせたい → yaw = 0
 * を渡す。ここを取り違えると段が壁へ突っ込む。
 *
 * @param {object} o {x, y, z, yaw, fh, width, depth, mat}
 *   x, z は階段室の中心。yaw は建物のローカル軸。
 */
export function stairFlight(b, o) {
  const {
    x, y = 0, z, yaw = 0, fh = 3.5, width = 1.35, run = 0.28,
    mat = 'concreteFloor', rail = 'gunMetal', core = 'paintedWall',
  } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  /** ローカル (右, 奥=乗り口から離れる向きが -Z) → ワールド */
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];

  /*
   * 折り返し階段。
   *
   * (x, z) は「乗り口」＝下の階の床から段が始まる所。
   * そこから -Z へ上り、折り返して +Z へ戻り、
   * 乗り口より踊り場 1 つぶん手前（-Z 側）で上の階の床に着く。
   *
   *      上階の床 ─┐            ┌─ 乗り口（下階の床）
   *                ▼            ▼
   *   -Z  ┌──踊り場──┐          │
   *       │  ↑上り2  └──────────┘
   *       └──↓上り1 ────────────
   *
   * 以前は上り 2 の終点が上階の床から 1.2m 手前で終わっており、
   * 上り切っても床が無く、そこから先へ進めなかった。
   * 上の階へ出られない階段は、階段の形をした行き止まりでしかない。
   */
  const STEPS = Math.max(7, Math.round(fh / 0.36));
  const rise = fh / (STEPS * 2);
  const runLen = run * STEPS;
  const LAND = 1.25;
  const CORE = 0.16;
  const lx1 = -(width + CORE) / 2;      // 上り 1（-Z へ）
  const lx2 = +(width + CORE) / 2;      // 上り 2（+Z へ）

  // 上り 1
  const [a1x, a1z] = at(lx1, 0);
  b.stairs({ x: a1x, y, z: a1z, width, rise, run, steps: STEPS, yaw, mat, surface: SURFACE.CONCRETE });
  // 中間の踊り場
  const [mlx, mlz] = at(0, -runLen - LAND / 2);
  b.box({ x: mlx, y: y + fh / 2 - 0.09, z: mlz, w: width * 2 + CORE, h: 0.18, d: LAND, yaw,
    mat, surface: SURFACE.CONCRETE });
  /*
   * 上り 2。
   *
   * 起点は踊り場の +Z 端（-runLen）。ここを踊り場の -Z 端に
   * していたら、最初の 4 段が踊り場の板の中に埋まり、
   * 踊り場に立った時点でプレイヤーが段と重なって
   * どの方向へも動けなくなっていた（実測 420 フレーム全停止）。
   *
   * 上り 1 と上り 2 は同じ z 範囲を、左右に分かれて占める。
   * 上り切る位置は乗り口の真上になり、そこに上階の床が来る。
   * 実際の折り返し階段もこの平面。
   */
  const [a2x, a2z] = at(lx2, -runLen);
  b.stairs({ x: a2x, y: y + fh / 2, z: a2z, width, rise, run, steps: STEPS,
    yaw: yaw + Math.PI, mat, surface: SURFACE.CONCRETE });

  // 折り返しの芯壁
  const [cwx, cwz] = at(0, -(runLen + LAND) / 2);
  b.box({ x: cwx, y: y + fh / 2, z: cwz, w: CORE, h: fh, d: runLen + LAND, yaw,
    mat: core, surface: SURFACE.CONCRETE });
  // 手すり（芯壁の両側を、勾配に沿って）
  for (const [lx, dir] of [[lx1, -1], [lx2, 1]]) {
    const off = dir > 0 ? -width / 2 - 0.02 : width / 2 + 0.02;
    const [h1x, h1z] = at(lx + off, dir > 0 ? -runLen : 0);
    const [h2x, h2z] = at(lx + off, dir > 0 ? 0 : -runLen);
    const y0 = dir > 0 ? y + fh / 2 : y;
    const len = Math.hypot(h2x - h1x, h2z - h1z);
    b.box({
      x: (h1x + h2x) / 2, y: y0 + fh / 4 + 0.95, z: (h1z + h2z) / 2,
      w: 0.045, h: 0.045, d: Math.hypot(len, fh / 2),
      yaw: Math.atan2(h2x - h1x, h2z - h1z), rx: -Math.atan2(fh / 2, len),
      mat: rail, surface: SURFACE.METAL, collide: false,
    });
    for (const t of [0.2, 0.5, 0.8]) {
      b.cylinder({
        x: h1x + (h2x - h1x) * t, y: y0 + (fh / 2) * t, z: h1z + (h2z - h1z) * t,
        radius: 0.022, height: 0.95, segments: 6, mat: rail, surface: SURFACE.METAL, collide: false,
      });
    }
  }
  /*
   * 踊り場の外周には手すりを置かない。
   *
   * 折り返しの先は建物の外壁で、実物でも手すりは付かない。
   * 置いてみたところ、踊り場に降りた足元へ当たり判定が立ち、
   * そこに立つとどの方向へも動けなくなった
   * （実測: 360 フレーム全部が停止）。
   * 手すりが要るのは芯壁側と、吹き抜けに面した側だけ。
   */
  return b;
}

/**
 * stairFlight が占める奥行きと段数。
 *
 * 上階の床は「乗り口の z から +Z 側」に張る。
 * 上り 2 は乗り口の真上で終わるので、そこが着地点になる。
 */
export function stairFlightSpan(fh = 3.5, run = 0.28) {
  const STEPS = Math.max(7, Math.round(fh / 0.36));
  const LAND = 1.25;
  return { depth: run * STEPS + LAND, landing: LAND, steps: STEPS };
}

/**
 * 事務所ビル（中に入れる）。
 *
 * 平面は「片端に階段室、残りを中廊下と両側の居室」。
 * 実在の雑居ビルでいちばん多い形で、対戦の場としても素直に働く——
 * 廊下が主動線、居室が待ち伏せ、階段が上下の抜け道になる。
 *
 * 各階に床を張り、屋上まで出られるようにしてある。
 */
export function officeBlock(b, o) {
  const {
    x, y = 0, z, yaw = 0, w = 22, d = 13, floors = 3, fh = 3.5,
    ext = 'concreteRaw', trim = 'concrete', inner = 'paintedWall',
    name = '', sub = '', signBg = '#1d2530', signFg = '#eef1f4',
    escape = true,
  } = o;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const hw = w / 2, hd = d / 2;
  const T = 0.28;                 // 外壁の厚み
  const H = fh * floors;
  const base = y + 0.30;

  const STAIR_W = 5.6;            // 階段室の幅（+X 側）
  const stairCx = hw - STAIR_W / 2 - T;
  const roomX0 = -hw + T;         // 居室ゾーンの西端
  const roomX1 = hw - STAIR_W - T;
  const CORR = 2.5;               // 中廊下の幅

  /* ---- 基礎 ---- */
  b.box({ x, y: y + 0.15, z, w: w + 0.24, h: 0.30, d: d + 0.24, yaw,
    mat: trim, surface: SURFACE.CONCRETE });

  /* ---- 各階 ---- */
  for (let f = 0; f < floors; f++) {
    const fy = base + fh * f;

    // 床（居室ゾーンのみ。階段室は吹き抜けにして段だけを通す）
    b.box({ x: at((roomX0 + roomX1) / 2, 0)[0], y: fy - 0.09, z: at((roomX0 + roomX1) / 2, 0)[1],
      w: roomX1 - roomX0, h: 0.18, d: d - T * 2, yaw,
      mat: f === 0 ? 'floorStone' : 'floorVinyl', surface: SURFACE.CONCRETE });

    /* -- 外壁 4 面 -- */
    // 窓は横長に。縦長にすると事務所ではなく集合住宅の掃き出し窓に見える
    const winH = fh * 0.46, sill = fh * 0.30;
    const cols = Math.max(3, Math.round(w / 3.0));
    const colsD = Math.max(2, Math.round(d / 3.0));

    for (const face of [0, 1, 2, 3]) {
      const isLong = face < 2;
      const len = isLong ? w : d;
      const nCol = isLong ? cols : colsD;
      const ww = (len / nCol) * 0.74;
      const other = isLong ? (face === 0 ? hd - T / 2 : -(hd - T / 2)) : (face === 2 ? hw - T / 2 : -(hw - T / 2));
      const ends = isLong ? [[-hw, other], [hw, other]] : [[other, -hd], [other, hd]];
      const [[ax, az], [bx2, bz2]] = ends;
      const [p1x, p1z] = at(ax, az), [p2x, p2z] = at(bx2, bz2);

      const gaps = [];
      if (f === 0 && face === 0) {
        // 正面の入口（階段室の前に取る）
        gaps.push({ start: len / 2 + stairCx - 1.3, width: 2.6, bottom: 0, top: 2.4 });
        for (let i = 0; i < nCol - 2; i++) {
          const step = len / nCol;
          gaps.push({ start: step * i + (step - ww) / 2, width: ww, bottom: sill, top: sill + winH });
        }
      } else if (f === 0 && face === 1) {
        gaps.push({ start: len * 0.24, width: 1.2, bottom: 0, top: 2.2 });
        for (let i = 2; i < nCol; i++) {
          const step = len / nCol;
          gaps.push({ start: step * i + (step - ww) / 2, width: ww, bottom: sill, top: sill + winH });
        }
      } else {
        for (let i = 0; i < nCol; i++) {
          const step = len / nCol;
          gaps.push({ start: step * i + (step - ww) / 2, width: ww, bottom: sill, top: sill + winH });
        }
      }

      b.wallWithGaps({ x1: p1x, z1: p1z, x2: p2x, z2: p2z, y: fy, h: fh, thickness: T,
        gaps, mat: ext, surface: SURFACE.CONCRETE });

      // 建具
      const fyaw = yaw + [0, Math.PI, Math.PI / 2, -Math.PI / 2][face];
      const nx3 = Math.sin(fyaw), nz3 = Math.cos(fyaw);
      for (const g of gaps) {
        const t = g.start + g.width / 2 - len / 2;
        const [lx, lz] = isLong ? [face === 0 ? t : -t, other] : [other, face === 2 ? -t : t];
        const [gx2, gz2] = at(lx, lz);
        const cy = fy + (g.bottom + g.top) / 2;
        const gh = g.top - g.bottom;
        if (g.bottom < 0.05) {
          // 出入口。ガラス扉にして、中が見えるようにする
          const geo = new THREE.BoxGeometry(g.width - 0.14, gh - 0.12, 0.03);
          geo.rotateY(fyaw);
          geo.translate(gx2, cy, gz2);
          b.addExtra(new THREE.Mesh(geo, b.mats.glass({ opacity: 0.22, transmission: 0.9 })));
          b.box({ x: gx2, y: cy, z: gz2, w: 0.06, h: gh, d: 0.07, yaw: fyaw,
            mat: 'anodized', surface: SURFACE.METAL, collide: false });
        } else {
          const geo = new THREE.BoxGeometry(g.width - 0.06, gh - 0.06, 0.03);
          geo.rotateY(fyaw);
          geo.translate(gx2 - nx3 * 0.05, cy, gz2 - nz3 * 0.05);
          b.addExtra(new THREE.Mesh(geo, b.mats.windowGlass()));
          // 窓台（外へ出す）
          b.box({ x: gx2 + nx3 * (T / 2 + 0.04), y: fy + g.bottom - 0.04, z: gz2 + nz3 * (T / 2 + 0.04),
            w: g.width + 0.22, h: 0.08, d: 0.18, yaw: fyaw, rx: 0.05,
            mat: trim, surface: SURFACE.CONCRETE, collide: false });
          /*
           * 額縁。
           * 開口をベタで抜いただけだと、壁に四角い穴が並ぶ絵になる。
           * 四周を外へ 3cm 出すと、上枠の影が窓の中へ落ちて奥行きが出る。
           */
          for (const [ox2, oy2, ww2, hh2] of [
            [0, gh / 2 + 0.055, g.width + 0.22, 0.11],
            [-g.width / 2 - 0.055, 0, 0.11, gh + 0.11],
            [g.width / 2 + 0.055, 0, 0.11, gh + 0.11],
          ]) {
            b.box({
              x: gx2 + Math.cos(fyaw) * ox2 + nx3 * (T / 2 + 0.03),
              y: cy + oy2,
              z: gz2 - Math.sin(fyaw) * ox2 + nz3 * (T / 2 + 0.03),
              w: ww2, h: hh2, d: 0.11, yaw: fyaw,
              mat: trim, surface: SURFACE.CONCRETE, collide: false,
            });
          }
          b.box({ x: gx2 - nx3 * 0.05, y: cy, z: gz2 - nz3 * 0.05, w: 0.05, h: gh, d: 0.05,
            yaw: fyaw, mat: 'anodized', surface: SURFACE.METAL, collide: false });
        }
      }
    }

    /* -- 中廊下と居室 -- */
    // 廊下の両側の間仕切り
    for (const sz of [-1, 1]) {
      const zw = sz * CORR / 2;
      const rooms = 3;
      const seg = (roomX1 - roomX0) / rooms;
      const gaps = [];
      for (let i = 0; i < rooms; i++) {
        gaps.push({ start: seg * i + seg / 2 - 0.5, width: 1.0, bottom: 0, top: 2.1 });
      }
      const [q1x, q1z] = at(roomX0, zw), [q2x, q2z] = at(roomX1, zw);
      b.wallWithGaps({ x1: q1x, z1: q1z, x2: q2x, z2: q2z, y: fy, h: fh, thickness: 0.14,
        gaps, mat: inner, surface: SURFACE.CONCRETE });
      // 各室の扉
      for (let i = 0; i < rooms; i++) {
        const lx = roomX0 + seg * i + seg / 2;
        const [dx2, dz2] = at(lx, zw);
        door(b, { x: dx2, y: fy, z: dz2, yaw: yaw + (sz > 0 ? 0 : Math.PI),
          w: 1.0, h: 2.1, mat: 'woodFineDark', frame: 'aluminum' });
      }
      // 室と室の間仕切り
      for (let i = 1; i < rooms; i++) {
        const lx = roomX0 + seg * i;
        const [e1x, e1z] = at(lx, zw), [e2x, e2z] = at(lx, sz * (hd - T));
        b.wall({ x1: e1x, z1: e1z, x2: e2x, z2: e2z, y: fy, h: fh, thickness: 0.12,
          mat: inner, surface: SURFACE.CONCRETE });
      }
    }
    // 廊下の西端の壁
    {
      const [c1x, c1z] = at(roomX0, -CORR / 2), [c2x, c2z] = at(roomX0, CORR / 2);
      b.wall({ x1: c1x, z1: c1z, x2: c2x, z2: c2z, y: fy, h: fh, thickness: 0.14,
        mat: inner, surface: SURFACE.CONCRETE });
    }
    // 廊下と階段室の間仕切り（開口 1 つ）
    {
      const [s1x, s1z] = at(roomX1, -hd + T), [s2x, s2z] = at(roomX1, hd - T);
      b.wallWithGaps({ x1: s1x, z1: s1z, x2: s2x, z2: s2z, y: fy, h: fh, thickness: 0.16,
        gaps: [{ start: (d - T * 2) / 2 - 0.65, width: 1.3, bottom: 0, top: 2.15 }],
        mat: inner, surface: SURFACE.CONCRETE });
    }

    /*
     * 天井。
     *
     * 上階の床スラブがそのまま天井になると、見上げたときに
     * 床材（塩ビタイル）の裏面が見える。各階に天井板を 1 枚張る。
     */
    b.box({ x: at((roomX0 + roomX1) / 2, 0)[0], y: fy + fh - 0.14,
      z: at((roomX0 + roomX1) / 2, 0)[1], w: roomX1 - roomX0 - 0.02, h: 0.1, d: d - T * 2 - 0.02, yaw,
      mat: 'ceilingPanel', surface: SURFACE.CONCRETE, collide: false });

    /* -- 階段 -- */
    /*
     * 乗り口を階段室の -Z 寄りに取り、そこから折り返して
     * 「上り切った位置」に上階の床が来るようにする。
     *
     * 以前は階段室の中心に階段を置き、上階の床は +Z 端の帯だけだった。
     * 上り切った所には床が無く、上の階へ出られなかった。
     * 加えて、廊下から階段室へ入る開口（z=0）の足元にも床が無かった。
     */
    const span = stairFlightSpan(fh);
    const stairEntry = -(d - T * 2) / 2 + span.depth;
    const [scx, scz] = at(stairCx, stairEntry);
    stairFlight(b, { x: scx, y: fy, z: scz, yaw, fh, width: 1.35 });
    // 階段室の床。1 階は全面、上階は「上り切る位置」から +Z 側
    {
      const fz0 = f === 0 ? -(d - T * 2) / 2 : stairEntry;
      const fz1 = (d - T * 2) / 2;
      const [lpx, lpz] = at(stairCx, (fz0 + fz1) / 2);
      b.box({ x: lpx, y: fy - 0.09, z: lpz, w: STAIR_W - 0.2, h: 0.18, d: fz1 - fz0, yaw,
        mat: 'floorStone', surface: SURFACE.CONCRETE });
    }

    /* -- 室内の設え -- */
    const rooms = 3;
    const seg = (roomX1 - roomX0) / rooms;
    for (const sz of [-1, 1]) {
      for (let i = 0; i < rooms; i++) {
        const rx = roomX0 + seg * (i + 0.5);
        const rz = sz * (CORR / 2 + (hd - T - CORR / 2) / 2);
        const kind = (i + (sz > 0 ? 0 : 1) + f) % 3;
        if (kind === 0) {
          for (const dxi of [-1, 1]) {
            const [px, pz] = at(rx + dxi * 1.5, rz - sz * 0.6);
            /*
             * 天板はメラミン化粧板。
             * 既定の woodFloor は 1 タイル 1.18m の床材なので、
             * 1.4m の天板に貼ると木目が 1 本しか通らず、
             * 板を切り出したというより丸太の断面に見える。
             */
            P.desk(b, { x: px, y: fy, z: pz, yaw: yaw + (sz > 0 ? Math.PI : 0), mat: 'melaminePale' });
            const [qx, qz] = at(rx + dxi * 1.5, rz + sz * 0.25);
            P.officeChair(b, { x: qx, y: fy, z: qz, yaw: yaw + (sz > 0 ? 0 : Math.PI) });
          }
          const [shx, shz] = at(rx + seg * 0.3, sz * (hd - T - 0.35));
          P.shelfUnit(b, { x: shx, y: fy, z: shz, yaw: yaw + (sz > 0 ? Math.PI : 0), w: 1.8 });
        } else if (kind === 1) {
          const [lkx, lkz] = at(rx, sz * (hd - T - 0.32));
          P.lockerBank(b, { x: lkx, y: fy, z: lkz, yaw: yaw + (sz > 0 ? Math.PI : 0), doors: 4 });
          const [tbx, tbz] = at(rx, rz);
          P.diningTable(b, { x: tbx, y: fy, z: tbz, yaw });
        } else {
          const [sfx, sfz] = at(rx, sz * (hd - T - 0.6));
          P.sofa(b, { x: sfx, y: fy, z: sfz, yaw: yaw + (sz > 0 ? Math.PI : 0), seats: 2 });
          const [ppx, ppz] = at(rx + seg * 0.32, rz);
          P.potPlant(b, { x: ppx, y: fy, z: ppz });
        }
        // 室内灯
        /*
         * 室内灯。
         * 2.2cd / 7.5m だと天井の 2m 下で床が真っ白に飛んだ。
         * 蛍光灯 1 本ぶんの照度に落とし、届く範囲を広げる。
         */
        b.light({ x: at(rx, rz)[0], y: fy + fh - 0.60, z: at(rx, rz)[1],
          color: 0xf2f0e6, intensity: 0.78, distance: 10 });
      }
    }
    // 廊下の灯り
    for (let i = 0; i < 2; i++) {
      const lx = roomX0 + (roomX1 - roomX0) * (i + 0.5) / 2;
      const [lpx2, lpz2] = at(lx, 0);
      /*
       * 光源は天井から 55cm 下げる。
       * 天井に貼り付けると上向きの光が一切出ず、
       * 見上げたとき天井だけが真っ暗な絵になる。
       */
      b.light({ x: lpx2, y: fy + fh - 0.55, z: lpz2, color: 0xe8eef2, intensity: 0.62, distance: 12 });
      /*
       * 器具。
       * 光源だけ置くと「天井に何も無いのに明るい」絵になる。
       * 乳白のカバーは自発光にして、見上げたときに光って見えるようにする。
       */
      {
        const g = new THREE.BoxGeometry(1.25, 0.08, 0.3);
        g.rotateY(yaw);
        g.translate(lpx2, fy + fh - 0.22, lpz2);
        b.addExtra(new THREE.Mesh(g, b.mats.emissive(0xf4f2e8, 2.6)));
      }
      b.box({ x: lpx2, y: fy + fh - 0.15, z: lpz2, w: 1.35, h: 0.06, d: 0.38, yaw,
        mat: 'aluminum', surface: SURFACE.METAL, collide: false });
    }

    /*
     * 巾木。
     * 壁と床が直接ぶつかると、面の切り替わりに線が出ず、
     * 紙を折って作ったような角になる。
     */
    for (const sz of [-1, 1]) {
      // 廊下側
      const [k1x, k1z] = at(roomX0, sz * (CORR / 2 - 0.075));
      const [k2x, k2z] = at(roomX1, sz * (CORR / 2 - 0.075));
      b.box({ x: (k1x + k2x) / 2, y: fy + 0.05, z: (k1z + k2z) / 2,
        w: roomX1 - roomX0, h: 0.10, d: 0.03, yaw,
        mat: 'melamineDark', surface: SURFACE.CONCRETE, collide: false });
      // 居室の外壁側
      const [k3x, k3z] = at(roomX0, sz * (hd - T - 0.02));
      const [k4x, k4z] = at(roomX1, sz * (hd - T - 0.02));
      b.box({ x: (k3x + k4x) / 2, y: fy + 0.05, z: (k3z + k4z) / 2,
        w: roomX1 - roomX0, h: 0.10, d: 0.03, yaw,
        mat: 'melamineDark', surface: SURFACE.CONCRETE, collide: false });
    }

    /*
     * 廊下の設え。
     *
     * 壁と扉だけの廊下は、長さのぶんだけ書き割りに見える。
     * 消火器・掲示板・分電盤は実際どの建物の廊下にもあり、
     * 赤や緑が入るだけで「使われている場所」に変わる。
     */
    {
      const [fex, fez] = at(roomX0 + 1.1, -CORR / 2 + 0.09);
      P.fireExtinguisher(b, { x: fex, y: fy, z: fez, yaw });
      const [nbx, nbz] = at(roomX0 + (roomX1 - roomX0) * 0.42, -CORR / 2 + 0.09);
      P.noticeBoard(b, { x: nbx, y: fy + 1.5, z: nbz, yaw, seed: 7 + f * 3 });
      const [pnx, pnz] = at(roomX1 - 1.4, CORR / 2 - 0.09);
      meterPanel(b, { x: pnx, y: fy + 0.9, z: pnz, yaw: yaw + Math.PI, w: 0.5, h: 0.66, mat: 'aluminum' });
      // 階数の表示
      const [flx, flz] = at(roomX1 - 0.35, CORR / 2 - 0.09);
      wallSign(b, { x: flx, y: fy + 2.05, z: flz, yaw: yaw + Math.PI,
        w: 0.5, h: 0.36, text: `${f + 1}F`, bg: '#243b4a', fg: '#eef1f4' });
    }
  }

  /* ---- 屋上 ---- */
  const top = base + H;
  parapet(b, { x, y: top, z, w, d, yaw, h: 1.05, mat: trim });

  /*
   * 屋上レベルの階段室の床。
   *
   * これが無いと、最上階から階段を上り切った瞬間に落ちる。
   * 実測でも、塔屋の中に立たせて前へ歩かせたら
   * 11.1m から 0m まで落下していた。
   * 階段は各階ぶん置いてあるのに、着地する床だけ
   * 居室ゾーンの上にしか張っていなかった。
   */
  {
    const spanTop = stairFlightSpan(fh);
    const fz0 = -(d - T * 2) / 2 + spanTop.depth;
    const fz1 = (d - T * 2) / 2;
    const [rpx, rpz] = at(stairCx, (fz0 + fz1) / 2);
    b.box({ x: rpx, y: top - 0.09, z: rpz, w: STAIR_W - 0.2, h: 0.18, d: fz1 - fz0, yaw,
      mat: 'floorStone', surface: SURFACE.CONCRETE });
  }

  // 塔屋（階段室の上）と屋上への扉
  const [pcx, pcz] = at(stairCx, 0);
  const PH = 2.6;
  for (const face of [0, 1, 2, 3]) {
    const isLong = face < 2;
    const len = isLong ? STAIR_W : d - T * 2;
    const other = isLong ? (face === 0 ? (d - T * 2) / 2 : -(d - T * 2) / 2) : (face === 2 ? STAIR_W / 2 : -STAIR_W / 2);
    const ends = isLong
      ? [[stairCx - STAIR_W / 2, other], [stairCx + STAIR_W / 2, other]]
      : [[stairCx + other, -(d - T * 2) / 2], [stairCx + other, (d - T * 2) / 2]];
    const [[ax, az], [bx2, bz2]] = ends;
    const [p1x, p1z] = at(ax, az), [p2x, p2z] = at(bx2, bz2);
    /*
     * 屋上への扉は居室ゾーン側（-X）に開ける。
     * 以前は +Z 面に開けていたが、その先は屋上の床の外だった。
     * 扉を出たとたんに落ちる。
     */
    const gaps = face === 3 ? [{ start: len / 2 - 0.6, width: 1.2, bottom: 0, top: 2.15 }] : [];
    b.wallWithGaps({ x1: p1x, z1: p1z, x2: p2x, z2: p2z, y: top, h: PH, thickness: 0.2,
      gaps, mat: trim, surface: SURFACE.CONCRETE });
  }
  // 塔屋の扉
  {
    const [dx4, dz4] = at(stairCx - STAIR_W / 2, 0);
    door(b, { x: dx4, y: top, z: dz4, yaw: yaw - Math.PI / 2,
      w: 1.1, h: 2.15, mat: 'paintedMetal', frame: 'aluminum' });
  }
  b.box({ x: pcx, y: top + PH + 0.08, z: pcz, w: STAIR_W + 0.3, h: 0.16, d: d - T * 2 + 0.3, yaw,
    mat: 'galvanized', surface: SURFACE.METAL });
  // 屋上の床（居室ゾーンの上に張る）
  b.box({ x: at((roomX0 + roomX1) / 2, 0)[0], y: top - 0.09, z: at((roomX0 + roomX1) / 2, 0)[1],
    w: roomX1 - roomX0, h: 0.18, d: d - T * 2, yaw,
    mat: 'roofMembrane', surface: SURFACE.CONCRETE });
  /*
   * 防水の立ち上がり。
   * パラペットの内側は、床のシートがそのまま 30cm ほど巻き上がる。
   * これが無いと、屋上が「床板を落とし込んだ箱」に見える。
   */
  for (const [ox, oz, ww, dd] of [
    [(roomX0 + roomX1) / 2, -(d - T * 2) / 2 + 0.08, roomX1 - roomX0, 0.16],
    [(roomX0 + roomX1) / 2, (d - T * 2) / 2 - 0.08, roomX1 - roomX0, 0.16],
    [roomX0 + 0.08, 0, 0.16, d - T * 2],
  ]) {
    const [wx, wz] = at(ox, oz);
    b.box({ x: wx, y: top + 0.16, z: wz, w: ww, h: 0.32, d: dd, yaw,
      mat: 'roofMembrane', surface: SURFACE.CONCRETE, collide: false });
  }
  // 排水のドレンと、屋上へのタラップ
  {
    const [dx3, dz3] = at(roomX0 + 1.2, -(d - T * 2) / 2 + 1.0);
    b.cylinder({ x: dx3, y: top - 0.02, z: dz3, radius: 0.14, height: 0.06, segments: 10,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }
  P.rooftopClutter(b, { x: at(roomX0 + 3.5, 0)[0], y: top, z: at(roomX0 + 3.5, 0)[1], yaw });
  P.waterTank(b, { x: at(roomX0 + (roomX1 - roomX0) * 0.7, -hd + 2.4)[0], y: top + 0.6,
    z: at(roomX0 + (roomX1 - roomX0) * 0.7, -hd + 2.4)[1], radius: 1.1, height: 1.8, legs: 0.9 });

  /* ---- 外部の付帯 ---- */
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (hw - 0.4), -hd);
    downpipe(b, { x: px, y, z: pz, yaw: yaw + Math.PI, height: 0.30 + H - 0.2 });
  }
  const [mx, mz] = at(-hw + 1.2, hd);
  meterPanel(b, { x: mx, y: y + 0.5, z: mz, yaw });
  for (let f = 1; f < floors; f++) {
    const [ax3, az3] = at(hw, -hd + d * 0.32);
    wallAc(b, { x: ax3, y: base + fh * f + 0.9, z: az3, yaw: yaw + Math.PI / 2 });
  }
  if (escape) {
    /*
     * 壁面に付ける。
     * 以前は壁から 1.6m 外へ出した点を基準にしていたので、
     * 踊り場の持ち出しと合わせて 2.5m 浮き、
     * 建物と繋がっていない仮設足場に見えていた。
     */
    const [ex, ez] = at(-hw + 4.0, -hd);
    fireEscape(b, { x: ex, y: base, z: ez, yaw: yaw + Math.PI, floors, fh });
  }
  if (name) {
    const [nx2, nz2] = at(0, hd + 0.12);
    wallSign(b, { x: nx2, y: base + fh - 0.6, z: nz2, yaw,
      w: w * 0.42, h: 0.7, text: name, sub, bg: signBg, fg: signFg });
    const [bx3, bz3] = at(hw + 0.45, hd - 1.6);
    wallSign(b, { x: bx3, y: base + fh * 1.6, z: bz3, yaw: yaw + Math.PI / 2,
      w: 0.62, h: 2.2, text: name, bg: signBg, fg: signFg, vertical: true, blade: true });
  }
  return b;
}

export const BUILDINGS = {
  windowUnit, recessedWindow, door, parapet, gableRoof, wallSign,
  downpipe, wallAc, meterPanel, fireEscape, stairFlight,
  houseSmall, shopFront, apartment, warehouse, kiosk, vendingMachine,
  midRise, officeBlock,
};
