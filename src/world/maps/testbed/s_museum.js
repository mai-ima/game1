import * as THREE from 'three';
import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import * as B from '../../Buildings.js';
import { MATERIAL_JA } from '../../../render/MaterialNamesJa.js';
import { label, plate, floorPlate, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 博物館棟。
 *
 * 屋外に並べるだけでは、日向と日陰で同じ物が別物に見えてしまう。
 * 均一な照明の室内に、白い台と黒い背板で並べると、
 * 形と質感だけを比べられる。
 *
 * 3 室構成で、順路は西の入口から入って東の出口へ抜ける。
 *   第 1 室 … 小物と資材
 *   第 2 室 … 家具と什器
 *   第 3 室 … マテリアル（壁面ギャラリー）
 */

const H = 4.6;                 // 天井高
const WALL = 'paintedWall';

/** 展示ケース（台 + ガラス + キャプション） */
function showcase(b, o) {
  const { x, z, yaw = 0, name, sub = '', place, w = 1.9, d = 1.5, h = 0.62, glass = true } = o;
  b.box({ x, y: h / 2, z, w, h, d, yaw, mat: 'marbleDark', surface: SURFACE.CONCRETE });
  b.box({ x, y: h + 0.02, z, w: w + 0.08, h: 0.05, d: d + 0.08, yaw,
    mat: 'marble', surface: SURFACE.CONCRETE, collide: false });
  place?.(x, z, h + 0.045);
  if (glass) {
    // 4 面のガラスと天板（触れない展示に見せる）
    const gm = b.mats.glass({ opacity: 0.10, transmission: 0.95 });
    for (const [ox, oz, gw, gd] of [
      [0, -d / 2, w, 0.02], [0, d / 2, w, 0.02], [-w / 2, 0, 0.02, d], [w / 2, 0, 0.02, d],
    ]) {
      const g = new THREE.BoxGeometry(gw, 1.0, gd);
      g.rotateY(yaw);
      g.translate(x + Math.cos(yaw) * ox + Math.sin(yaw) * oz, h + 0.55, z - Math.sin(yaw) * ox + Math.cos(yaw) * oz);
      b.addExtra(new THREE.Mesh(g, gm));
    }
    const top = new THREE.BoxGeometry(w, 0.02, d);
    top.rotateY(yaw);
    top.translate(x, h + 1.06, z);
    b.addExtra(new THREE.Mesh(top, gm));
  }
  // キャプション（台の前面を斜めに切った所に貼る）
  const front = Math.cos(yaw) < 0 ? -1 : 1;
  plate(b, { x: x + Math.sin(yaw) * 0.01, y: h - 0.16, z: z + Math.cos(yaw) * (d / 2 + 0.01) * front,
    yaw: front > 0 ? yaw : yaw + Math.PI, text: name, sub, accent: HUE.museum, w: w - 0.3 });
  return b;
}

export function sectionMuseum(b, cx, cz) {
  const W = 54, D = 26;
  const hw = W / 2, hd = D / 2;

  /* ---- 外殻 ---- */
  b.box({ x: cx, y: 0.05, z: cz, w: W + 1.2, h: 0.1, d: D + 1.2, mat: 'granite', surface: SURFACE.CONCRETE });
  b.box({ x: cx, y: 0.11, z: cz, w: W - 0.4, h: 0.03, d: D - 0.4, mat: 'terrazzo', surface: SURFACE.CONCRETE, collide: false });
  b.box({ x: cx, y: H + 0.25, z: cz, w: W + 1.0, h: 0.5, d: D + 1.0, mat: 'concrete', surface: SURFACE.CONCRETE });
  b.box({ x: cx, y: H - 0.04, z: cz, w: W - 0.6, h: 0.08, d: D - 0.6, mat: 'ceilingPanel', surface: SURFACE.CONCRETE, collide: false });
  B.parapet(b, { x: cx, y: H + 0.5, z: cz, w: W + 1.0, d: D + 1.0, h: 0.7, mat: 'stuccoWhite' });

  // 南面（通路側）: 中央に大きな入口、両脇に高窓
  b.wallWithGap({ x1: cx - hw, z1: cz + hd, x2: cx + hw, z2: cz + hd, h: H, thickness: 0.32,
    gapStart: W / 2 - 2.0, gapWidth: 4.0, gapTop: 3.2, mat: 'stuccoWhite', surface: SURFACE.CONCRETE });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = cx + sx * (5.5 + i * 4.4);
      B.windowUnit(b, { x, y: 3.1, z: cz + hd, yaw: FACE_N, w: 2.4, h: 1.5, bars: 2, sill: true });
    }
  }
  // 北面・東西面
  b.wall({ x1: cx - hw, z1: cz - hd, x2: cx + hw, z2: cz - hd, h: H, thickness: 0.32, mat: 'stuccoWhite', surface: SURFACE.CONCRETE });
  b.wall({ x1: cx - hw, z1: cz - hd, x2: cx - hw, z2: cz + hd, h: H, thickness: 0.32, mat: 'stuccoWhite', surface: SURFACE.CONCRETE });
  b.wallWithGap({ x1: cx + hw, z1: cz - hd, x2: cx + hw, z2: cz + hd, h: H, thickness: 0.32,
    gapStart: D / 2 - 1.2, gapWidth: 2.4, gapTop: 2.6, mat: 'stuccoWhite', surface: SURFACE.CONCRETE });

  /* ---- 正面の顔つき（柱廊と看板） ---- */
  for (let i = 0; i < 7; i++) {
    const x = cx - 13.5 + i * 4.5;
    b.cylinder({ x, y: 0.1, z: cz + hd + 2.6, radius: 0.34, height: H + 0.4, segments: 16,
      mat: 'stuccoWhite', surface: SURFACE.CONCRETE });
    b.cylinder({ x, y: 0.1, z: cz + hd + 2.6, radius: 0.42, height: 0.24, segments: 16,
      mat: 'granite', surface: SURFACE.CONCRETE, collide: false });
    b.cylinder({ x, y: H + 0.28, z: cz + hd + 2.6, radius: 0.42, height: 0.22, segments: 16,
      mat: 'stuccoWhite', surface: SURFACE.CONCRETE, collide: false });
  }
  b.box({ x: cx, y: H + 0.72, z: cz + hd + 2.6, w: 32, h: 0.7, d: 1.8,
    mat: 'stuccoWhite', surface: SURFACE.CONCRETE });
  B.wallSign(b, { x: cx, y: H + 0.75, z: cz + hd + 3.55, yaw: FACE_N, w: 12, h: 1.1,
    text: 'アセット博物館', sub: 'ASSET MUSEUM', bg: '#1b2028', fg: '#f2efe9', accent: HUE.museum });
  // 階段と手すり
  b.stairs({ x: cx, y: 0, z: cz + hd + 5.2, width: 8.0, rise: 0.05, run: 0.42, steps: 2, yaw: FACE_N, mat: 'granite' });

  /* ---- 室内の照明（均一に）---- */
  for (let i = 0; i < 6; i++) {
    const x = cx - 21 + i * 8.5;
    for (const sz of [-1, 1]) {
      const g = new THREE.BoxGeometry(3.2, 0.06, 0.34);
      const m = new THREE.Mesh(g, b.mats.emissive(0xf0f4fa, 4));
      m.position.set(x, H - 0.16, cz + sz * 6.2);
      b.addExtra(m);
    }
    b.light({ x, y: H - 0.6, z: cz, color: 0xf2f6fd, intensity: 9, distance: 16 });
  }

  /* ---- 間仕切り（3 室に分ける。順路は西→東） ---- */
  for (const px of [cx - 8, cx + 10]) {
    b.wallWithGap({ x1: px, z1: cz - hd, x2: px, z2: cz + hd, h: H, thickness: 0.24,
      gapStart: D / 2 - 1.6, gapWidth: 3.2, gapTop: 3.0, mat: WALL, surface: SURFACE.CONCRETE });
  }

  /* ================= 第 1 室: 小物と資材 ================= */
  const r1 = cx - 17;
  label(b, { x: r1, y: 3.3, z: cz - hd + 0.3, yaw: FACE_S, post: false,
    text: '第 1 室　小物と資材', sub: 'PROPS', accent: HUE.museum, w: 5.0 });
  const props1 = [
    ['木箱', (x, z, y) => P.woodCrate(b, { x, y, z, yaw: 0.3, size: 0.62 })],
    ['弾薬箱', (x, z, y) => P.ammoCrate(b, { x, y, z, yaw: -0.2 })],
    ['ドラム缶', (x, z, y) => P.barrel(b, { x, y, z, height: 0.66, radius: 0.22 })],
    ['携行缶', (x, z, y) => P.jerryCan(b, { x, y, z, yaw: 0.4 })],
    ['タイヤ', (x, z, y) => P.tireStack(b, { x, y, z, count: 2 })],
    ['段ボール', (x, z, y) => P.cardboardStack(b, { x, y, z, count: 3 })],
  ];
  for (let i = 0; i < props1.length; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    showcase(b, {
      x: r1 - 4.4 + col * 4.4, z: cz - 4.0 + row * 7.0, yaw: row ? FACE_N : FACE_S,
      name: props1[i][0], place: props1[i][1],
    });
  }

  /* ================= 第 2 室: 家具と什器 ================= */
  const r2 = cx + 1;
  label(b, { x: r2, y: 3.3, z: cz - hd + 0.3, yaw: FACE_S, post: false,
    text: '第 2 室　家具と什器', sub: 'FURNITURE', accent: HUE.museum, w: 5.0 });
  /*
   * 家具は床からの高さが要なので、ケースに入れず床に直接置く。
   * 代わりに床へ枠を描いて、展示だと分かるようにする。
   */
  const furn = [
    ['事務机と椅子', (x, z) => {
      P.desk(b, { x, y: 0.13, z, yaw: FACE_S });
      P.officeChair(b, { x, y: 0.13, z: z + 0.95, yaw: FACE_N });
    }],
    ['ソファ', (x, z) => P.sofa(b, { x, y: 0.13, z, yaw: FACE_S, seats: 2 })],
    ['食卓と椅子', (x, z) => {
      P.diningTable(b, { x, y: 0.13, z, yaw: FACE_S, w: 1.3, d: 0.8 });
      P.woodChair(b, { x, y: 0.13, z: z + 0.8, yaw: FACE_N });
    }],
    ['本棚', (x, z) => P.bookshelf(b, { x, y: 0.13, z, yaw: FACE_S })],
    ['流し台', (x, z) => P.kitchenUnit(b, { x, y: 0.13, z, yaw: FACE_S, w: 1.6 })],
    ['寝台', (x, z) => P.bed(b, { x, y: 0.13, z, yaw: FACE_S, w: 0.95, d: 1.9 })],
  ];
  for (let i = 0; i < furn.length; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const x = r2 - 5.2 + col * 5.2, z = cz - 5.0 + row * 8.4;
    b.box({ x, y: 0.125, z, w: 3.4, h: 0.03, d: 3.0, mat: 'carpetRed', surface: SURFACE.CONCRETE, collide: false });
    furn[i][1](x, z);
    floorPlate(b, { x, z: z + 1.75, text: furn[i][0], accent: HUE.museum, w: 2.4 });
  }

  /* ================= 第 3 室: マテリアルの壁面 ================= */
  const r3 = cx + 19;
  label(b, { x: r3, y: 3.3, z: cz - hd + 0.3, yaw: FACE_S, post: false,
    text: '第 3 室　マテリアル', sub: 'MATERIALS', accent: HUE.museum, w: 5.0 });
  /*
   * 壁に沿って板を並べる。屋外の見本と違い、
   * ここは均一な照明なので「素の色」が読める。
   */
  const wallSets = [
    ['建材', ['concrete', 'concreteRaw', 'plaster', 'brick', 'concreteBlock', 'tile'], cz - hd + 0.5, FACE_S],
    ['金属', ['rustedMetal', 'galvanized', 'brushedMetal', 'corrugated', 'castIron', 'stainless'], cz + hd - 0.5, FACE_N],
  ];
  for (const [gname, list, wz, yaw] of wallSets) {
    for (let i = 0; i < list.length; i++) {
      const name = list[i];
      const x = r3 - 7.0 + i * 2.8;
      const off = Math.cos(yaw) > 0 ? 0.2 : -0.2;
      b.box({ x, y: 1.9, z: wz + off, w: 2.3, h: 2.3, d: 0.1, yaw, mat: name, surface: SURFACE.CONCRETE });
      // 額縁
      for (const [oy, hh] of [[3.1, 0.09], [0.7, 0.09]]) {
        b.box({ x, y: oy, z: wz + off * 1.3, w: 2.5, h: hh, d: 0.06, yaw,
          mat: 'brassPolished', surface: SURFACE.METAL, collide: false });
      }
      plate(b, { x, y: 0.5, z: wz + off * 1.6, yaw,
        text: MATERIAL_JA[name] || name, sub: name, accent: HUE.museum, w: 2.3 });
    }
    label(b, { x: r3 + 8.4, y: 2.4, z: wz + (Math.cos(yaw) > 0 ? 0.3 : -0.3), yaw, post: false,
      text: gname, accent: HUE.museum, w: 1.8 });
  }
  // 中央に立体の見本（曲面での見え方）
  for (let i = 0; i < 4; i++) {
    const name = ['marble', 'brassPolished', 'woodFloor', 'carpet'][i];
    const x = r3 - 4.2 + i * 2.8;
    showcase(b, {
      x, z: cz, yaw: FACE_N, w: 1.6, d: 1.4, name: MATERIAL_JA[name] || name, sub: name,
      place: (px, pz, py) => {
        const sph = new THREE.SphereGeometry(0.26, 20, 14);
        b.mesh(name, sph, { x: px, y: py + 0.3, z: pz });
        b.cylinder({ x: px - 0.45, y: py, z: pz, radius: 0.17, height: 0.5, segments: 16,
          mat: name, surface: SURFACE.CONCRETE, collide: false });
        b.box({ x: px + 0.45, y: py + 0.22, z: pz, w: 0.36, h: 0.44, d: 0.36,
          mat: name, surface: SURFACE.CONCRETE, collide: false });
      },
    });
  }

  /* ---- 受付とベンチ（入ってすぐ） ---- */
  P.counter(b, { x: cx - hw + 4.5, y: 0.13, z: cz + hd - 2.4, yaw: FACE_N, w: 3.0 });
  plate(b, { x: cx - hw + 4.5, y: 0.75, z: cz + hd - 2.05, yaw: FACE_N, text: '受付', accent: HUE.museum, w: 1.6 });
  for (const s of [-1, 1]) {
    P.bench(b, { x: cx + s * 6, y: 0.13, z: cz + hd - 2.6, yaw: FACE_N, w: 2.0, back: false });
  }
  P.potPlant(b, { x: cx - hw + 1.8, y: 0.13, z: cz + hd - 1.8, height: 1.3 });
  P.potPlant(b, { x: cx + hw - 1.8, y: 0.13, z: cz + hd - 1.8, height: 1.3 });
}
