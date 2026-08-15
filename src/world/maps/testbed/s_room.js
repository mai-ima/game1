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
  /*
   * 開口の高さ。
   *
   * 2.02m にしていたら、玄関で上がり框（高さ 18cm）に乗ろうとした
   * ときに通れなくなった。段差を越えるには一度 24cm 持ち上がるので、
   * 身長 1.8m と合わせて頭が 2.04m まで上がり、まぐさに当たる。
   * 段差のある部屋では、開口の高さに余裕が要る。
   */
  b.wallWithGaps({
    x1: cx - w / 2, z1: cz + d / 2, x2: cx + w / 2, z2: cz + d / 2,
    y: 0, h: CH, thickness: WALL,
    gaps: door ? [{ start: w / 2 - doorW / 2, width: doorW, bottom: 0, top: 2.18 }] : [],
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
    B.door(b, { x: cx, y: 0, z: cz + d / 2, yaw: FACE_S, w: doorW, h: 2.16,
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
    plate(b, { x: cx, y: 2.28, z: cz, offset: d / 2 + 0.09, yaw: FACE_S, text: name, sub, accent, w: 2.4 });
  }
  return b;
}

/**
 * どの部屋にも付くもの。
 *
 * 大物を並べても部屋が「模型」に見えるのは、たいていこれが無いから。
 * 実際の部屋には必ず、扉の脇にスイッチ、壁の下端 25cm にコンセント、
 * 天井に火災警報器がある。1 点 3〜10cm の物だが、
 * 有無で「人が住んでいる部屋」に見えるかどうかが変わる。
 *
 * 置く位置は扉と窓から決める。壁の真ん中に付けると
 * 家具の裏へ隠れるか、開口に掛かる。
 */
function fittings(b, cx, cz, w, d, opt = {}) {
  const { outlet = true, alarm = true } = opt;
  const southWall = cz + d / 2 - WALL / 2;      // 廊下側の壁の内面
  const doorHalf = 0.46;

  // スイッチは扉の引き手側（東）の脇、高さ 1.2m
  P.switchPlate(b, {
    x: cx + doorHalf + 0.22, y: 1.2, z: southWall, yaw: FACE_N, kind: 'switch', gangs: 2,
  });
  if (outlet) {
    // コンセントは壁の下端 25cm。2 面に振る
    P.switchPlate(b, { x: cx - w / 2 + 0.55, y: 0.25, z: southWall, yaw: FACE_N, kind: 'outlet' });
    P.switchPlate(b, {
      x: cx + w / 2 - WALL / 2, y: 0.25, z: cz + 0.9, yaw: -Math.PI / 2, kind: 'outlet',
    });
  }
  if (alarm) P.smokeAlarm(b, { x: cx - 0.7, y: CH, z: cz - 0.6 });
  return b;
}

export function sectionRoom(b, cx, cz) {
  /*
   * 1 室の内法。
   * 4.0 × 4.6m は 6 畳（2.73 × 3.64m）よりやや広い、住戸の主室くらい。
   * 5 室に増やしたぶん 4.4 → 4.0 に詰めた。
   * 区画の外形を広げるとギミック試験場に当たる。
   */
  const RW = 4.0, RD = 4.6;
  const N = 5;
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
  /*
   * 冷蔵庫は奥行 0.65m。yaw −π/2 で置くと奥行がワールド X に伸びるので、
   * 壁の内側の面（rx + RW/2 − WALL/2）から半分ぶん離す。
   * 以前は 0.5m しか離しておらず、壁へ 0.5m めり込んでいた。
   */
  P.fridge(b, { x: rx(0) + RW / 2 - WALL / 2 - 0.34, y: 0, z: rz + 1.35, yaw: -Math.PI / 2 });
  /*
   * 扉の正面 1.5m には物を置かない。
   *
   * 食卓を扉の真正面へ置いたら、部屋に一歩も入れなくなった
   * （実測: 360 フレーム中 333 が停止）。
   * 実際の部屋も、扉の正面は通り道として空けてある。
   */
  /*
   * 食卓は壁際へ寄せ、椅子は長手の両端（南北）に置く。
   *
   * 卓の左右に椅子を置いていたら、東側の 1 脚が扉の開口
   * （中心 ±0.46m）に掛かって、まっすぐ入ると 1 歩で止まった。
   * 迂回すれば入れるので画面では気付かない。
   * walkmap で扉の正面 1.2m 幅を空けてあることを確かめている。
   */
  const tx = rx(0) - 1.15;
  P.diningTable(b, { x: tx, y: 0, z: rz + 0.9, yaw: 0, w: 1.0, d: 0.72 });
  for (const s of [-1, 1]) {
    P.woodChair(b, { x: tx, y: 0, z: rz + 0.9 + s * 0.70, yaw: s > 0 ? Math.PI : 0 });
  }
  P.gasStove(b, { x: rx(0) - 0.7, y: 0.86, z: rz - RD / 2 + 0.36, yaw: FACE_S, w: 0.56, d: 0.44 });
  P.rangeHood(b, { x: rx(0) - 0.7, y: 1.58, z: rz - RD / 2 + 0.42, yaw: FACE_S, w: 0.72, d: 0.56, ceiling: CH });
  P.riceCooker(b, { x: rx(0) + 0.55, y: 0.90, z: rz - RD / 2 + 0.42, yaw: FACE_S });
  P.kettlePot(b, { x: rx(0) + 1.05, y: 0.90, z: rz - RD / 2 + 0.42, yaw: FACE_S });
  fittings(b, rx(0), rz, RW, RD, { outlet: true });

  /* 02 水回り */
  room(b, rx(1), rz, RW, RD, { name: '水回り', sub: 'BATH / WC', accent: HUE.mat, floor: 'ceramicTile', wallMat: 'ceramicTile' });
  P.bathtub(b, { x: rx(1) - RW / 2 + 0.85, y: 0, z: rz - RD / 2 + 1.1, yaw: FACE_S, w: 1.4, d: 0.78 });
  P.toilet(b, { x: rx(1) + RW / 2 - 0.75, y: 0, z: rz - RD / 2 + 0.7, yaw: FACE_S });
  P.washBasin(b, { x: rx(1) + RW / 2 - 0.7, y: 0, z: rz + 1.3, yaw: -Math.PI / 2, w: 0.75 });
  P.washingMachine(b, { x: rx(1) - RW / 2 + 0.5, y: 0, z: rz + 1.4, yaw: Math.PI / 2 });
  fittings(b, rx(1), rz, RW, RD, {});

  /* 03 洋室 */
  room(b, rx(2), rz, RW, RD, { name: '洋室', sub: 'BEDROOM', accent: HUE.mat, floor: 'woodFloor' });
  P.bed(b, { x: rx(2) - 0.85, y: 0, z: rz - 0.35, yaw: 0, w: 1.0, d: 2.0 });
  P.wardrobe(b, { x: rx(2) + RW / 2 - WALL / 2 - 0.30, y: 0, z: rz - 1.0, yaw: -Math.PI / 2 });
  P.cubeShelf(b, { x: rx(2) - RW / 2 + 0.35, y: 0, z: rz + 1.35, yaw: Math.PI / 2, tiers: 3, seed: 6 });
  P.acIndoor(b, { x: rx(2), y: 2.15, z: rz - RD / 2 + WALL, yaw: FACE_S });
  P.floorLamp(b, { x: rx(2) + 0.9, y: 0, z: rz + 1.4, h: 1.5 });
  P.framedPicture(b, { x: rx(2) + 0.7, y: 1.6, z: rz - RD / 2 + WALL / 2, yaw: FACE_S, w: 0.5, h: 0.66 });
  P.bookStack(b, { x: rx(2) + 0.9, y: 0, z: rz + 1.05, yaw: 0.4, count: 6, seed: 5 });
  fittings(b, rx(2), rz, RW, RD, {});

  /* 04 和室 */
  room(b, rx(3), rz, RW, RD, { name: '和室', sub: 'TATAMI ROOM', accent: HUE.mat, floor: 'woodDark' });
  /*
   * 畳は床いっぱいに敷く。
   * 部屋の内法（RW − WALL × RD − WALL）に合わせると、
   * 巾木の下へ 2cm 潜って納まりが付く。
   */
  P.tatamiArea(b, { x: rx(3), z: rz, y: 0, w: RW - WALL - 0.04, d: RD - WALL - 0.04 });
  P.lowTable(b, { x: rx(3), y: 0.075, z: rz - 0.35, yaw: 0, w: 1.05, d: 0.75, kotatsu: true });
  for (const [dx, dz, yw] of [[-0.95, -0.35, Math.PI / 2], [0.95, -0.35, -Math.PI / 2], [0, -1.35, 0]]) {
    P.floorCushion(b, { x: rx(3) + dx, y: 0.075, z: rz + dz, yaw: yw });
  }
  // 押入れ（襖 2 枚。西の壁いっぱい）
  P.slidingDoor(b, { x: rx(3) - RW / 2 + WALL / 2 + 0.06, y: 0.075, z: rz - 0.9,
    yaw: Math.PI / 2, w: 1.7, h: 1.95, kind: 'fusuma', open: 0.0 });
  // 障子（外壁の窓の内側）
  P.slidingDoor(b, { x: rx(3), y: 0.90, z: rz - RD / 2 + WALL / 2 + 0.10,
    yaw: FACE_S, w: 1.7, h: 1.25, kind: 'shoji', open: 0.4 });
  P.framedPicture(b, { x: rx(3) + 1.1, y: 1.55, z: rz - RD / 2 + WALL / 2, yaw: FACE_S, w: 0.30, h: 0.92 });
  P.electricFan(b, { x: rx(3) + RW / 2 - 0.5, y: 0.075, z: rz + 1.2, yaw: -Math.PI / 2 });
  P.wallClock(b, { x: rx(3) + RW / 2 - WALL / 2, y: 1.95, z: rz + 0.4, yaw: -Math.PI / 2 });
  fittings(b, rx(3), rz, RW, RD, {});

  /* 05 玄関 */
  room(b, rx(4), rz, RW, RD, { name: '玄関', sub: 'ENTRANCE', accent: HUE.mat, floor: 'ceramicTile' });
  P.shoeCabinet(b, { x: rx(4) - RW / 2 + 0.6, y: 0, z: rz - 0.5, yaw: Math.PI / 2, umbrella: true });
  P.standingMirror(b, { x: rx(4) - RW / 2 + 0.42, y: 0, z: rz + 1.3, yaw: Math.PI / 2, w: 0.4, h: 1.4 });
  P.bench(b, { x: rx(4) + RW / 2 - 0.5, y: 0.18, z: rz - 0.6, yaw: -Math.PI / 2 });
  P.wallShelf(b, { x: rx(4) + 0.6, y: 1.45, z: rz - RD / 2 + WALL / 2, yaw: FACE_S, w: 0.7 });
  /*
   * 上がり框。
   *
   * 扉のすぐ内側（開口から 0.1m）に置いていたので、
   * 扉をくぐった瞬間に段へ乗る形になり、持ち上がった頭が
   * まぐさに当たって入れなかった。
   * 実際の玄関も、土間を 1m ほど取ってから框が来る。
   */
  b.box({ x: rx(4), y: 0.09, z: rz - 0.45, w: RW - WALL, h: 0.18, d: 2.6,
    mat: 'woodFine', surface: SURFACE.WOOD });
  fittings(b, rx(4), rz, RW, RD, { clock: false });

  label(b, { x: cx, y: 2.9, z: cz + D / 2 + 0.4, yaw: FACE_S,
    text: '室内試作場', sub: 'INTERIOR LAB', accent: HUE.mat, w: 5.0 });
  return b;
}
