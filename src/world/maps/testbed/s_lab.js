import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import * as B from '../../Buildings.js';
import { label, plate, floorPlate, apron, measurePole, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 実験場。
 *
 * 動きの限界値を、歩きながら読み取れるようにした場所。
 * 何 cm の段差まで乗れるか、何度の斜面を登れるか、
 * どこまで跳べるか、何 m の落下で死ぬか。
 *
 * 並べ方の原則は「入口から見て、低い方から高い方へ」。
 * 手前から順に試していけば、越えられなくなった所が限界値になる。
 */
export function sectionLab(b, cx, cz) {
  apron(b, { x: cx, z: cz, w: 44, d: 38, mat: 'concreteRaw' });
  label(b, { x: cx, y: 2.8, z: cz + 19.6, yaw: FACE_N,
    text: '実験場', sub: 'MOVEMENT LAB', accent: HUE.lab, w: 4.4 });

  /* ---- 基準寸法（入口すぐ。他を測る物差しになる） ---- */
  const zBase = cz + 15;
  measurePole(b, { x: cx - 19, z: zBase, height: 5 });
  const stands = [[1.70, '立位の背丈', 'paintedMetalTan'], [1.30, '中腰の目線', 'paintedMetal'], [0.80, '伏せの目線', 'paintedMetal']];
  for (let i = 0; i < stands.length; i++) {
    const [hgt, name, mat] = stands[i];
    const x = cx - 17.4 + i * 1.7;
    b.box({ x, y: hgt / 2, z: zBase, w: 0.5, h: hgt, d: 0.22, yaw: FACE_N, mat, surface: SURFACE.METAL });
    plate(b, { x, y: hgt - 0.22, z: zBase + 0.12, yaw: FACE_N, text: `${hgt.toFixed(2)} m`, sub: name, accent: HUE.lab, w: 1.4 });
  }
  b.box({ x: cx - 11.5, y: 0.5, z: zBase, w: 1, h: 1, d: 1, mat: 'hazardStripe', surface: SURFACE.METAL });
  floorPlate(b, { x: cx - 11.5, z: zBase + 1.1, text: '1 m³', accent: HUE.lab, w: 1.5 });

  // 標準の建具（寸法の基準）
  b.wallWithGap({ x1: cx - 8, z1: zBase, x2: cx - 2, z2: zBase, h: 3.0, thickness: 0.24,
    gapStart: 2.5, gapWidth: 0.9, gapTop: 2.0, mat: 'plaster', surface: SURFACE.CONCRETE });
  B.door(b, { x: cx - 5.05, y: 0, z: zBase, yaw: FACE_N, w: 0.9, h: 2.0, frame: 'plaster' });
  plate(b, { x: cx - 5.05, y: 2.55, z: zBase - 0.14, yaw: FACE_N, text: '出入口', sub: 'H2.00 × W0.90', accent: HUE.lab, w: 2.0 });
  b.wallWithGap({ x1: cx - 1.5, z1: zBase, x2: cx + 3.5, z2: zBase, h: 3.0, thickness: 0.24,
    gapStart: 1.7, gapWidth: 1.5, gapBottom: 0.9, gapTop: 2.1, mat: 'plaster', surface: SURFACE.CONCRETE });
  B.windowUnit(b, { x: cx + 0.95, y: 1.5, z: zBase, yaw: FACE_N, w: 1.5, h: 1.2 });
  plate(b, { x: cx + 0.95, y: 2.55, z: zBase - 0.14, yaw: FACE_N, text: '窓', sub: '腰 0.90 / H1.20', accent: HUE.lab, w: 2.2 });

  // 標準階段
  b.stairs({ x: cx + 9, y: 0, z: zBase + 1.4, width: 1.5, rise: 0.18, run: 0.28, steps: 12, yaw: FACE_S, mat: 'concrete' });
  b.box({ x: cx + 9, y: 1.08, z: zBase - 2.7, w: 1.5, h: 2.16, d: 1.6, mat: 'concrete', surface: SURFACE.CONCRETE });
  P.railing(b, { x1: cx + 9.8, z1: zBase + 1.2, x2: cx + 9.8, z2: zBase - 2.0, y: 1.1, height: 1.1 });
  floorPlate(b, { x: cx + 9, z: zBase + 2.6, text: '階段 蹴上 0.18 / 踏面 0.28', accent: HUE.lab, w: 3.6 });

  /* ---- 段差: どこまで乗れるか ---- */
  const zStep = cz + 8;
  for (let i = 0; i < 7; i++) {
    const hgt = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.75][i];
    const x = cx - 18 + i * 3.0;
    b.box({ x, y: hgt / 2, z: zStep, w: 2.0, h: hgt, d: 2.6, mat: 'concrete', surface: SURFACE.CONCRETE });
    b.box({ x, y: hgt + 0.011, z: zStep, w: 2.0, h: 0.02, d: 2.6,
      mat: hgt <= 0.45 ? 'lineWhite' : 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
    floorPlate(b, { x, z: zStep + 1.9, text: `${(hgt * 100).toFixed(0)} cm`, accent: HUE.lab, w: 1.9 });
  }
  label(b, { x: cx + 8, y: 1.7, z: zStep + 1.6, yaw: FACE_N, text: '段差 — 乗り越えの限界', accent: HUE.lab, w: 4.2 });

  /* ---- 斜面: 何度まで登れるか ---- */
  const zRamp = cz + 1;
  for (let i = 0; i < 5; i++) {
    const deg = [10, 20, 30, 40, 50][i];
    const x = cx - 16 + i * 5.2;
    const len = 5.4;
    const hgt = len * Math.tan(deg * Math.PI / 180);
    b.ramp({ x, y: 0, z: zRamp, width: 3.0, length: len, height: hgt, yaw: FACE_S, steps: 22, mat: 'asphalt' });
    b.box({ x, y: hgt / 2, z: zRamp - len - 0.9, w: 3.0, h: hgt, d: 1.8, mat: 'concrete', surface: SURFACE.CONCRETE });
    floorPlate(b, { x, z: zRamp + 1.4, text: `${deg}°`, accent: HUE.lab, w: 1.8 });
  }
  label(b, { x: cx + 13, y: 1.7, z: zRamp + 1.2, yaw: FACE_N, text: '斜面 — 登坂の限界', accent: HUE.lab, w: 3.8 });

  /* ---- 隙間: 跳べる距離 ---- */
  const zGap = cz - 9;
  for (let i = 0; i < 6; i++) {
    const gap = 1.0 + i * 0.5;
    const x = cx - 17 + i * 6.4;
    for (const s of [-1, 1]) {
      b.box({ x, y: 0.6, z: zGap + s * (gap / 2 + 1.1), w: 3.0, h: 1.2, d: 2.2,
        mat: 'concrete', surface: SURFACE.CONCRETE });
    }
    floorPlate(b, { x, z: zGap + gap / 2 + 2.8, text: `${gap.toFixed(1)} m`, accent: HUE.lab, w: 2.0 });
  }
  label(b, { x: cx + 15, y: 1.7, z: zGap + 3.4, yaw: FACE_N, text: '隙間 — 跳べる距離', accent: HUE.lab, w: 3.8 });

  /* ---- よじ登りと落下 ---- */
  const zBack = cz - 15.5;
  for (let i = 0; i < 5; i++) {
    const hgt = [1.0, 1.4, 1.8, 2.2, 2.6][i];
    const x = cx - 18 + i * 3.0;
    b.box({ x, y: hgt / 2, z: zBack, w: 2.4, h: hgt, d: 1.2, mat: 'brickPale', surface: SURFACE.CONCRETE });
    plate(b, { x, y: Math.min(hgt - 0.24, 1.15), z: zBack + 0.63, yaw: FACE_S,
      text: `${hgt.toFixed(1)} m`, accent: HUE.lab, w: 2.0 });
  }
  floorPlate(b, { x: cx - 12, z: zBack + 1.8, text: 'よじ登り', accent: HUE.lab, w: 2.6 });

  for (let i = 0; i < 5; i++) {
    const hgt = [2, 4, 6, 9, 13][i];
    const x = cx + 2 + i * 3.2;
    b.box({ x, y: hgt / 2, z: zBack - 1.5, w: 2.8, h: hgt, d: 2.8, mat: 'concrete', surface: SURFACE.CONCRETE });
    plate(b, { x, y: 1.2, z: zBack - 0.09, yaw: FACE_S, text: `${hgt} m`, accent: HUE.lab, w: 2.3 });
    if (i > 0) {
      b.box({ x: x - 1.6, y: ([2, 4, 6, 9, 13][i - 1] + hgt) / 2 - 0.15, z: zBack - 1.5, w: 0.9, h: 0.3, d: 2.8,
        mat: 'diamondPlate', surface: SURFACE.METAL });
    }
  }
  b.stairs({ x: cx + 2, y: 0, z: zBack + 0.6, width: 1.8, rise: 0.2, run: 0.3, steps: 10, yaw: FACE_S, mat: 'concrete' });
  floorPlate(b, { x: cx + 9, z: zBack + 1.8, text: '落下 — 高さと被害', accent: HUE.lab, w: 3.6 });
}
