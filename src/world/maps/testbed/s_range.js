import { SURFACE } from '../../Physics.js';
import { label, plate, floorPlate, apron, measurePole, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 射撃場。
 *
 * 射座から東へ 100m の直線。距離ごとに的を置き、
 * 減衰と拡散の効き方を見比べられるようにする。
 * 貫通の壁は射座のすぐ先に並べ、撃ってすぐ結果が判るようにした。
 */
export function sectionRange(b, x0, cz) {
  const LEN = 91;
  apron(b, { x: x0 + LEN / 2 - 6, z: cz, w: LEN, d: 22, mat: 'asphalt', border: false });

  /* ---- 射座 ---- */
  b.box({ x: x0, y: 0.55, z: cz + 4.0, w: 8.0, h: 1.1, d: 0.5, mat: 'concrete', surface: SURFACE.CONCRETE });
  b.box({ x: x0, y: 0.02, z: cz + 6.5, w: 9, h: 0.03, d: 5, mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
  label(b, { x: x0, y: 2.4, z: cz + 5.2, yaw: FACE_N, text: '射座', sub: 'FIRING LINE', accent: HUE.range, w: 3.0 });
  // 射座の屋根（日陰で銃を見る）
  for (const s of [-1, 1]) {
    b.cylinder({ x: x0 + s * 3.6, y: 0, z: cz + 7.4, radius: 0.07, height: 3.0, segments: 8,
      mat: 'galvanized', surface: SURFACE.METAL });
  }
  b.box({ x: x0, y: 3.1, z: cz + 6.2, w: 8.4, h: 0.12, d: 4.0, mat: 'metalRoof', surface: SURFACE.METAL });

  /* ---- 距離標と的 ---- */
  for (const m of [5, 10, 25, 50, 75]) {
    const x = x0 + m;
    measurePole(b, { x, z: cz - 4.6, height: 3 });
    plate(b, { x, y: 2.5, z: cz - 4.5, yaw: FACE_N, text: `${m} m`, accent: HUE.range, w: 2.0 });
    // 的（人の胸の高さ）
    b.box({ x, y: 1.15, z: cz - 2.0, w: 0.7, h: 1.5, d: 0.05, mat: 'plywood', surface: SURFACE.WOOD, penetration: 0.6 });
    b.box({ x, y: 1.35, z: cz - 1.97, w: 0.44, h: 0.44, d: 0.02, mat: 'lineWhite', surface: SURFACE.WOOD, collide: false });
    b.box({ x, y: 1.35, z: cz - 1.95, w: 0.17, h: 0.17, d: 0.02, mat: 'plasticGlossRed', surface: SURFACE.WOOD, collide: false });
    for (const s of [-1, 1]) {
      b.box({ x: x + s * 0.4, y: 0.7, z: cz - 2.0, w: 0.07, h: 1.4, d: 0.07, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    // 足元の距離帯（走りながらでも読める）
    b.box({ x, y: 0.02, z: cz + 0.4, w: 0.7, h: 0.03, d: 4.0, mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
    floorPlate(b, { x, z: cz + 2.8, text: `${m} m`, accent: HUE.range, w: 2.0 });
  }

  /* ---- 貫通の壁 ---- */
  const panels = [
    ['plywood', 0.02, '合板 20mm', SURFACE.WOOD, 0.75],
    ['wood', 0.06, '板 60mm', SURFACE.WOOD, 0.55],
    ['sidingMetal', 0.01, '鋼板 1mm', SURFACE.METAL, 0.5],
    ['corrugated', 0.02, '波板 2mm', SURFACE.METAL, 0.55],
    ['concreteBlock', 0.19, 'ブロック 190mm', SURFACE.CONCRETE, 0.12],
    ['brick', 0.21, '煉瓦 210mm', SURFACE.CONCRETE, 0.15],
    ['sandbag', 0.42, '土嚢 420mm', SURFACE.FABRIC, 0.1],
    ['concrete', 0.30, 'コンクリ 300mm', SURFACE.CONCRETE, 0],
  ];
  for (let i = 0; i < panels.length; i++) {
    const [mat, th, name, surf, pen] = panels[i];
    const x = x0 + 10 + i * 3.6;
    b.box({ x, y: 1.1, z: cz + 9.6, w: 2.2, h: 2.2, d: th, mat, surface: surf, penetration: pen });
    for (const s of [-1, 1]) {
      b.box({ x: x + s * 1.16, y: 1.1, z: cz + 9.6, w: 0.09, h: 2.3, d: 0.09, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    plate(b, { x, y: 2.5, z: cz + 9.5, yaw: FACE_N, text: name, sub: `貫通 ${(pen * 100).toFixed(0)}%`, accent: HUE.range, w: 2.4 });
  }
  label(b, { x: x0 + 22, y: 3.6, z: cz + 11.6, yaw: FACE_N, text: '貫通の検証', sub: 'PENETRATION', accent: HUE.range, w: 4.2 });

  /* ---- 着弾痕を見る板 ---- */
  for (let i = 0; i < 3; i++) {
    const [mat, name] = [['concrete', 'コンクリート'], ['sidingMetal', '鋼板'], ['wood', '木']][i];
    const x = x0 + 48 + i * 7.5;
    b.box({ x, y: 1.6, z: cz + 9.6, w: 6.4, h: 3.2, d: 0.3, mat, surface: SURFACE.CONCRETE });
    plate(b, { x, y: 3.5, z: cz + 9.44, yaw: FACE_N, text: name, sub: '着弾痕', accent: HUE.range, w: 2.8 });
  }

  /* ---- 背後の土手（流れ弾を止める） ---- */
  b.box({ x: x0 + LEN / 2 - 6, y: 2.2, z: cz - 8.5, w: LEN, h: 4.4, d: 2.0, mat: 'sand', surface: SURFACE.DIRT });
  b.box({ x: x0 + LEN / 2 - 6, y: 4.5, z: cz - 8.5, w: LEN, h: 0.3, d: 2.6, mat: 'sandbag', surface: SURFACE.FABRIC, collide: false });
}
