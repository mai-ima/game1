import * as THREE from 'three';
import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import * as B from '../../Buildings.js';
import { label, plate, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 室内試作場。
 *
 * 家具や住宅設備は、部屋の中に入れないと良し悪しが決まらない。
 * 明るい屋外の台に載せると、どれも白飛びして形しか見えないし、
 * そもそも「部屋に置いたときの大きさ」が分からない。
 *
 * ここは壁・床・天井・窓のある部屋を並べた区画。
 * 廊下から扉を開けて入り、実際に立って見る。
 * 天井の高さ 2.5m、開口 0.9×2.0m は実物どおりにしてあるので、
 * 家具の寸法が狂っていればその場で分かる。
 *
 * 以前ここには博物館（均一な照明の展示室）があったが、
 * 「1 点ずつ台に載せて眺める」用途は小物試作場と重なる。
 * 検証の場としては「使われている状態を作る」ほうが要る。
 */

const WALL = 0.14;      // 間仕切りの厚み
const CH = 2.5;         // 天井の高さ

/**
 * 1 室ぶんの箱を作る。
 * 廊下側（+Z）に扉、外壁側（-Z）に窓を開ける。
 */
function room(b, cx, cz, w, d, opt = {}) {
  const {
    floor = 'woodFloor', wallMat = 'wallpaper', ceil = 'ceilingPanel',
    door = true, window: hasWindow = true, name = '', sub = '', accent = HUE.mat,
  } = opt;

  // 床（一段上げて、廊下との段差を作らない）
  b.box({ x: cx, y: -0.05, z: cz, w, h: 0.10, d,
    mat: floor, surface: SURFACE.WOOD, collide: false });

  // 廊下側の壁（扉の開口）
  const doorW = 0.92;
  b.wallWithGaps({
    x1: cx - w / 2, z1: cz + d / 2, x2: cx + w / 2, z2: cz + d / 2,
    y: 0, h: CH, thickness: WALL,
    gaps: door ? [{ start: w / 2 - doorW / 2, width: doorW, bottom: 0, top: 2.02 }] : [],
    mat: wallMat, surface: SURFACE.CONCRETE,
  });
  // 外壁側（窓の開口）
  const winW = Math.min(1.7, w * 0.55);
  b.wallWithGaps({
    x1: cx - w / 2, z1: cz - d / 2, x2: cx + w / 2, z2: cz - d / 2,
    y: 0, h: CH, thickness: WALL,
    gaps: hasWindow ? [{ start: w / 2 - winW / 2, width: winW, bottom: 0.95, top: 2.15 }] : [],
    mat: wallMat, surface: SURFACE.CONCRETE,
  });
  // 左右の間仕切り
  for (const s of [-1, 1]) {
    b.wall({ x1: cx + s * w / 2, z1: cz - d / 2, x2: cx + s * w / 2, z2: cz + d / 2,
      y: 0, h: CH, thickness: WALL, mat: wallMat, surface: SURFACE.CONCRETE });
  }
  // 天井
  b.box({ x: cx, y: CH + 0.06, z: cz, w, h: 0.12, d,
    mat: ceil, surface: SURFACE.CONCRETE, collide: false });
  // 巾木と回り縁
  for (const [oz, dd] of [[-d / 2 + 0.02, 0.03], [d / 2 - 0.02, 0.03]]) {
    b.box({ x: cx, y: 0.05, z: cz + oz, w: w - WALL, h: 0.10, d: dd,
      mat: 'melamineDark', surface: SURFACE.WOOD, collide: false });
  }
  for (const s of [-1, 1]) {
    b.box({ x: cx + s * (w / 2 - 0.02), y: 0.05, z: cz, w: 0.03, h: 0.10, d: d - WALL,
      mat: 'melamineDark', surface: SURFACE.WOOD, collide: false });
  }

  // 建具
  if (door) {
    B.door(b, { x: cx, y: 0, z: cz + d / 2, yaw: FACE_S, w: doorW, h: 2.02,
      mat: 'woodFineDark', frame: 'aluminum', open: 0.9 });
  }
  if (hasWindow) {
    // 窓（引き違い。外は空が見える）
    const g = new THREE.BoxGeometry(winW - 0.06, 1.14, 0.03);
    g.translate(cx, 1.55, cz - d / 2);
    b.addExtra(new THREE.Mesh(g, b.mats.windowGlass({ opacity: 0.5 })));
    // 方立と窓枠
    b.box({ x: cx, y: 1.55, z: cz - d / 2, w: 0.05, h: 1.18, d: 0.06,
      mat: 'anodized', surface: SURFACE.METAL, collide: false });
    for (const [oy, hh] of [[0.95, 0.06], [2.15, 0.06]]) {
      b.box({ x: cx, y: oy, z: cz - d / 2, w: winW + 0.10, h: hh, d: 0.09,
        mat: 'anodized', surface: SURFACE.METAL, collide: false });
    }
    // 窓台
    b.box({ x: cx, y: 0.92, z: cz - d / 2 + 0.06, w: winW + 0.16, h: 0.04, d: 0.16,
      mat: 'woodFine', surface: SURFACE.WOOD, collide: false });
    // カーテン
    P.curtain(b, { x: cx, y: 0.92, z: cz - d / 2 + 0.16, yaw: FACE_S, w: winW + 0.5, h: 1.35, open: 0.4 });
  }

  // 照明
  P.ceilingLight(b, { x: cx, y: CH - 0.02, z: cz });
  b.light({ x: cx, y: CH - 0.45, z: cz, color: 0xf4efe2, intensity: 0.9, distance: 8 });

  if (name) {
    plate(b, { x: cx, y: 2.28, z: cz + d / 2 + 0.09, yaw: FACE_S, text: name, sub, accent, w: 2.4 });
  }
  return b;
}

export function sectionRoom(b, cx, cz) {
  const RW = 4.4, RD = 4.6;      // 1 室の内法
  const N = 4;
  const W = RW * N + WALL * (N + 1);
  const D = RD + 6;

  // 敷地
  b.box({ x: cx, y: 0.008, z: cz, w: W + 6, h: 0.03, d: D + 2,
    mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
  // 廊下（部屋の南側）
  b.box({ x: cx, y: 0.012, z: cz + RD / 2 + 1.6, w: W + 2, h: 0.03, d: 3.0,
    mat: 'floorVinyl', surface: SURFACE.CONCRETE, collide: false });

  const rx = (i) => cx - W / 2 + WALL + RW / 2 + i * (RW + WALL);
  const rz = cz - 1.0;

  /* 01 台所 */
  room(b, rx(0), rz, RW, RD, { name: '台所', sub: 'KITCHEN', accent: HUE.mat, floor: 'ceramicTile' });
  P.kitchenSink(b, { x: rx(0), y: 0, z: rz - RD / 2 + 0.36, yaw: FACE_S, w: 2.6, upper: true });
  P.dishCabinet(b, { x: rx(0) - RW / 2 + 0.55, y: 0, z: rz + 0.6, yaw: Math.PI / 2 });
  P.microwave(b, { x: rx(0) + RW / 2 - 0.6, y: 0.85, z: rz - 0.4, yaw: -Math.PI / 2 });
  P.fridge(b, { x: rx(0) + RW / 2 - 0.5, y: 0, z: rz + 1.1, yaw: -Math.PI / 2 });
  P.diningTable(b, { x: rx(0), y: 0, z: rz + 1.3, yaw: 0 });
  for (const s of [-1, 1]) {
    P.woodChair(b, { x: rx(0) + s * 0.85, y: 0, z: rz + 1.3, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }

  /* 02 水回り */
  room(b, rx(1), rz, RW, RD, { name: '水回り', sub: 'BATH / WC', accent: HUE.mat, floor: 'ceramicTile', wallMat: 'ceramicTile' });
  P.bathtub(b, { x: rx(1) - RW / 2 + 0.85, y: 0, z: rz - RD / 2 + 1.1, yaw: FACE_S, w: 1.4, d: 0.78 });
  P.toilet(b, { x: rx(1) + RW / 2 - 0.75, y: 0, z: rz - RD / 2 + 0.7, yaw: FACE_S });
  P.washBasin(b, { x: rx(1) + RW / 2 - 0.7, y: 0, z: rz + 1.3, yaw: -Math.PI / 2, w: 0.75 });
  P.washingMachine(b, { x: rx(1) - RW / 2 + 0.5, y: 0, z: rz + 1.4, yaw: Math.PI / 2 });

  /* 03 居室 */
  room(b, rx(2), rz, RW, RD, { name: '居室', sub: 'LIVING', accent: HUE.mat, floor: 'woodFloor' });
  P.futon(b, { x: rx(2) - 0.7, y: 0, z: rz, yaw: 0, w: 1.0, d: 2.0 });
  P.wardrobe(b, { x: rx(2) + RW / 2 - 0.35, y: 0, z: rz - 0.8, yaw: -Math.PI / 2 });
  P.tvSet(b, { x: rx(2) + 0.9, y: 0, z: rz + RD / 2 - 0.5, yaw: FACE_N });
  P.acIndoor(b, { x: rx(2), y: 2.15, z: rz - RD / 2 + WALL, yaw: FACE_S });
  P.wallClock(b, { x: rx(2) + RW / 2 - WALL, y: 1.95, z: rz + 0.6, yaw: -Math.PI / 2 });
  P.potPlant(b, { x: rx(2) - RW / 2 + 0.5, y: 0, z: rz + RD / 2 - 0.7 });

  /* 04 玄関 */
  room(b, rx(3), rz, RW, RD, { name: '玄関', sub: 'ENTRANCE', accent: HUE.mat, floor: 'ceramicTile' });
  P.shoeCabinet(b, { x: rx(3) - RW / 2 + 0.6, y: 0, z: rz - 0.5, yaw: Math.PI / 2, umbrella: true });
  P.wallClock(b, { x: rx(3), y: 2.0, z: rz - RD / 2 + WALL, yaw: FACE_S, radius: 0.14 });
  P.bench(b, { x: rx(3) + RW / 2 - 0.5, y: 0, z: rz + 0.8, yaw: -Math.PI / 2 });
  // 上がり框（玄関の段差）
  b.box({ x: rx(3), y: 0.09, z: rz + RD / 2 - 1.2, w: RW - WALL, h: 0.18, d: 2.2,
    mat: 'woodFine', surface: SURFACE.WOOD });

  label(b, { x: cx, y: 2.9, z: cz + D / 2 + 0.4, yaw: FACE_S,
    text: '室内試作場', sub: 'INTERIOR LAB', accent: HUE.mat, w: 5.0 });
  return b;
}
