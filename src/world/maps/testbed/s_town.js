import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import * as B from '../../Buildings.js';
import { label, plate, floorPlate, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 建物街。
 *
 * 建物は 1 棟ずつ離して置いても、良し悪しの半分しか判らない。
 * 街並みとして並べて初めて、
 *   隣と高さが揃っているか、道からの見え方はどうか、
 *   建物と建物の隙間はどう見えるか
 * が見えてくる。
 *
 * 道を 1 本通し、その両側に建てる。中にも入れる。
 */
export function sectionTown(b, cx, cz) {
  const W = 62, D = 34;

  /* ---- 敷地と街路 ---- */
  b.box({ x: cx, y: 0.014, z: cz, w: W, h: 0.03, d: D, mat: 'dirt', surface: SURFACE.DIRT, collide: false });
  // 街路（東西）
  b.box({ x: cx, y: 0.018, z: cz, w: W - 2, h: 0.03, d: 7.0, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  for (let x = cx - W / 2 + 3; x < cx + W / 2 - 5; x += 8) {
    b.box({ x: x + 2, y: 0.026, z: cz, w: 4, h: 0.03, d: 0.14, mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }
  // 縁石と歩道
  for (const s of [-1, 1]) {
    b.box({ x: cx, y: 0.09, z: cz + s * 3.6, w: W - 2, h: 0.18, d: 0.18, mat: 'concrete', surface: SURFACE.CONCRETE });
    b.box({ x: cx, y: 0.10, z: cz + s * 4.9, w: W - 2, h: 0.03, d: 2.4, mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
    b.box({ x: cx, y: 0.115, z: cz + s * 3.95, w: W - 2, h: 0.02, d: 0.3, mat: 'tactilePaving', surface: SURFACE.CONCRETE, collide: false });
  }

  label(b, { x: cx, y: 2.9, z: cz + D / 2 + 0.6, yaw: FACE_N,
    text: '建物街', sub: 'TOWN BLOCK', accent: HUE.town, w: 4.4 });

  /* ---- 北側の街区 ---- */
  const zN = cz - 11;
  B.shopFront(b, {
    x: cx - 22, y: 0, z: zN, yaw: FACE_S, w: 9, d: 8, floors: 2,
    name: '丸屋商店', sub: 'MARUYA STORE', signBg: '#7a2b22', signFg: '#f4ece0',
  });
  B.shopFront(b, {
    x: cx - 12, y: 0, z: zN, yaw: FACE_S, w: 8, d: 8, floors: 3, mat: 'brickOld',
    name: '梅乃湯', sub: 'UMENOYU', signBg: '#25406a', signFg: '#eef2f6',
  });
  B.apartment(b, { x: cx + 2, y: 0, z: zN + 0.5, yaw: FACE_S, units: 4, d: 8 });
  B.shopFront(b, {
    x: cx + 20, y: 0, z: zN, yaw: FACE_S, w: 8, d: 8, floors: 2, mat: 'stuccoRough',
    name: '中村電気', sub: 'NAKAMURA', signBg: '#2c5b3a', signFg: '#f2efe9',
  });
  // 店先の設え
  B.vendingMachine(b, { x: cx - 17.2, y: 0, z: cz - 5.6, yaw: FACE_S, color: '#b8352c', name: 'つめたい' });
  B.vendingMachine(b, { x: cx - 16.0, y: 0, z: cz - 5.6, yaw: FACE_S, color: '#1f5fa8', name: 'あたたかい' });
  P.trashBin(b, { x: cx - 14.9, y: 0, z: cz - 5.6 });
  P.marketStall(b, { x: cx - 6.5, y: 0, z: cz - 5.4, yaw: FACE_S });
  P.potPlant(b, { x: cx + 15.5, y: 0, z: cz - 5.4 });

  /* ---- 南側の街区 ---- */
  const zS = cz + 12;
  B.houseSmall(b, { x: cx - 22, y: 0, z: zS, yaw: FACE_N, w: 7.5, d: 6.5 });
  B.houseSmall(b, { x: cx - 12, y: 0, z: zS, yaw: FACE_N, w: 7.0, d: 6.5, mat: 'woodSidingWhite' });
  B.kiosk(b, { x: cx - 3, y: 0, z: cz + 8.5, yaw: FACE_N, name: '案内所' });
  P.bench(b, { x: cx + 1, y: 0, z: cz + 7.0, yaw: FACE_N });
  B.warehouse(b, { x: cx + 14, y: 0, z: zS + 1.5, yaw: FACE_N, w: 15, d: 11, h: 5.6 });
  // 倉庫の中身
  for (let i = 0; i < 3; i++) {
    P.shelfUnit(b, { x: cx + 9.5 + i * 4.5, y: 0.31, z: zS + 4.5, yaw: FACE_N, w: 2.4, h: 2.2, tiers: 4 });
  }
  P.pallet(b, { x: cx + 11, y: 0.31, z: zS - 2.0, yaw: 0.2 });
  P.woodCrate(b, { x: cx + 11, y: 0.45, z: zS - 2.0, size: 0.9 });

  /* ---- 街の設備 ---- */
  for (let i = 0; i < 4; i++) {
    const x = cx - 24 + i * 16;
    P.streetLight(b, { x, y: 0, z: cz - 4.6, yaw: FACE_S });
  }
  P.utilityPole(b, { x: cx - 26, y: 0, z: cz + 5.4 });
  P.utilityPole(b, { x: cx + 6, y: 0, z: cz + 5.4 });
  P.utilityPole(b, { x: cx + 26, y: 0, z: cz + 5.4 });
  P.vehicle(b, { x: cx - 8, y: 0, z: cz - 1.6, yaw: Math.PI / 2, type: 'car', mat: 'paintedMetalTan' });
  P.vehicle(b, { x: cx + 9, y: 0, z: cz + 1.6, yaw: -Math.PI / 2, type: 'truck' });
  P.litter(b, { x: cx - 2, y: 0, z: cz + 5.2, radius: 2.0, count: 10 });

  /* ---- 銘板（歩道に伏せて置く。建物を隠さない） ---- */
  const marks = [
    [cx - 22, cz - 5.2, '店舗 2 階建て', '9.0 × 8.0'],
    [cx - 12, cz - 5.2, '店舗 3 階建て', '煉瓦 / 8.0 × 8.0'],
    [cx + 2, cz - 5.2, '集合住宅', '4 戸 × 2 層'],
    [cx + 20, cz - 5.2, '店舗（別仕様）', 'モルタル'],
    [cx - 22, cz + 5.2, '平屋', '7.5 × 6.5 / 切妻'],
    [cx - 12, cz + 5.2, '平屋（下見板）', '7.0 × 6.5'],
    [cx - 3, cz + 5.2, '小屋', '売店・詰所'],
    [cx + 14, cz + 5.2, '倉庫', '15 × 11 / 折板'],
  ];
  for (const [x, z, name, sub] of marks) {
    floorPlate(b, { x, z, text: name, sub, accent: HUE.town, w: 3.0 });
  }
}
