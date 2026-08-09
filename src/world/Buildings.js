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
    mat = 'woodDark', frame = 'plaster', open = 0,
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
  const cx2 = hingeX + Math.cos(a) * (w / 2), cz2 = hingeZ - Math.sin(a) * (w / 2);
  b.box({ x: cx2, y: y + h / 2, z: cz2, w, h, d: 0.045, yaw: a, mat, surface: SURFACE.WOOD, collide: false });
  // 鏡板の見切り
  for (const py of [h * 0.28, h * 0.72]) {
    b.box({ x: cx2, y: y + py, z: cz2, w: w - 0.16, h: h * 0.30, d: 0.012, yaw: a,
      mat, surface: SURFACE.WOOD, collide: false });
  }
  // レバーハンドル
  const hx = cx2 + Math.cos(a) * (w / 2 - 0.09) + Math.sin(a) * 0.035;
  const hz = cz2 - Math.sin(a) * (w / 2 - 0.09) + Math.cos(a) * 0.035;
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
      door(b, { x: dx, y: fy, z: dz, yaw: yaw + Math.PI, w: 0.95, h: 2.05, mat: 'paintedMetal', frame: mat });
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

export const BUILDINGS = {
  windowUnit, door, parapet, gableRoof, wallSign,
  houseSmall, shopFront, apartment, warehouse, kiosk, vendingMachine,
};
