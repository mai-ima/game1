import * as THREE from 'three';
import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import * as B from '../../Buildings.js';
import { MATERIAL_JA } from '../../../render/MaterialNamesJa.js';
import { label, plate, floorPlate, apron, displayRow, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 資材置き場。
 *
 * 博物館が「1 点ずつ丁寧に見る」場所なら、こちらは
 * 「まとめて置いて、量と嵩を見る」場所。
 * 実際のマップに置くときと同じように地面へ直に積み、
 * 隣り合ったときの馴染み方を確かめる。
 *
 * 手前に整列した見本、奥に雑多な山、という並びにしてある。
 * 新しく作った物はまず奥の空き枠に置けばよい。
 */
export function sectionYard(b, cx, cz) {
  const W = 50, D = 42;
  apron(b, { x: cx, z: cz, w: W, d: D, mat: 'gravel' });
  label(b, { x: cx, y: 2.8, z: cz - D / 2 - 0.6, yaw: FACE_S,
    text: '資材置き場', sub: 'ASSET YARD', accent: HUE.yard, w: 4.6 });

  /* ---- 手前: 整列した見本（台に載せる） ---- */
  displayRow(b, [
    ['木箱', (x, z, y) => P.woodCrate(b, { x, y, z, yaw: FACE_N + 0.3 })],
    ['弾薬箱', (x, z, y) => P.ammoCrate(b, { x, y, z, yaw: FACE_N - 0.2 })],
    ['ドラム缶', (x, z, y) => P.barrel(b, { x, y, z })],
    ['土嚢', (x, z, y) => P.sandbagStack(b, { x, y, z, yaw: FACE_N, rows: 3, perRow: 4, length: 1.5 })],
    ['パレット', (x, z, y) => P.pallet(b, { x, y, z, yaw: FACE_N + 0.15 })],
    ['タイヤ', (x, z, y) => P.tireStack(b, { x, y, z, count: 3 })],
    ['段ボール', (x, z, y) => P.cardboardStack(b, { x, y, z, count: 3 })],
    ['携行缶', (x, z, y) => P.jerryCan(b, { x, y, z, yaw: FACE_N + 0.4 })],
  ], { x0: cx - 22, z: cz - 11.5, pitch: 2.7, accent: HUE.yard, yaw: FACE_N });

  displayRow(b, [
    ['鉄筋束', (x, z, y) => P.rebarBundle(b, { x, y, z, yaw: FACE_N + 0.2, count: 10, length: 2.4 })],
    ['型枠合板', (x, z, y) => P.formworkStack(b, { x, y, z, yaw: FACE_N + 0.1, count: 7 })],
    ['ブロック', (x, z, y) => P.blockPallet(b, { x, y, z, yaw: FACE_N, rows: 3 })],
    ['骨材の山', (x, z, y) => P.aggregatePile(b, { x, y, z, radius: 1.1, height: 0.8, mat: 'gravel' })],
    ['砂の山', (x, z, y) => P.aggregatePile(b, { x, y, z, radius: 1.1, height: 0.7, mat: 'sand' })],
    ['瓦礫', (x, z, y) => P.rubble(b, { x, y, z, radius: 1.2, count: 12 })],
    ['足場板', (x, z, y) => {
      for (let k = 0; k < 3; k++) {
        b.box({ x, y: y + 0.03 + k * 0.06, z, w: 1.5, h: 0.05, d: 0.5, yaw: FACE_N + k * 0.04,
          mat: 'scaffoldPlank', surface: SURFACE.WOOD, collide: false });
      }
    }],
    ['単管', (x, z, y) => {
      for (let k = 0; k < 5; k++) {
        b.cylinder({ x: x - 0.3 + k * 0.15, y: y + 0.06, z, radius: 0.06, height: 1.6,
          segments: 8, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
      }
    }],
  ], { x0: cx - 22, z: cz - 7.0, pitch: 2.7, accent: HUE.yard, yaw: FACE_N });

  /* ---- 中ほど: 街の設備（実寸で床置き） ---- */
  const util = [
    ['街灯', (x, z) => P.streetLight(b, { x, y: 0, z, yaw: FACE_N })],
    ['電柱', (x, z) => P.utilityPole(b, { x, y: 0, z })],
    ['貯水タンク', (x, z) => P.waterTank(b, { x, y: 0.55, z })],
    ['室外機', (x, z) => P.acUnit(b, { x, y: 0, z, yaw: FACE_N })],
    ['看板', (x, z) => P.sign(b, { x, y: 2.2, z, yaw: FACE_N, w: 2.0, h: 0.7, mat: 'plasticGlossRed', text: '関係者以外立入禁止', sub: 'NO ENTRY', posts: 2 })],
    ['屋上機器', (x, z) => P.rooftopClutter(b, { x, y: 0, z, yaw: FACE_N })],
    ['自販機', (x, z) => B.vendingMachine(b, { x, y: 0, z, yaw: FACE_N, name: 'つめたい' })],
    ['ごみ箱', (x, z) => P.trashBin(b, { x, y: 0, z })],
  ];
  for (let i = 0; i < util.length; i++) {
    const x = cx - 22 + i * 2.7;
    const z = cz - 2.0;
    b.box({ x, y: 0.016, z, w: 2.45, h: 0.03, d: 2.4, mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false });
    util[i][1](x, z);
    floorPlate(b, { x, z: z - 1.45, text: util[i][0], accent: HUE.yard, w: 2.2 });
  }

  /* ---- 遮蔽（横から効きを見る） ---- */
  const zC = cz + 3.5;
  P.chainFence(b, { x1: cx - 22, z1: zC, x2: cx - 17, z2: zC, h: 2.1 });
  floorPlate(b, { x: cx - 19.5, z: zC - 1.3, text: '金網', sub: '体は止まる / 弾は抜ける', accent: HUE.yard, w: 3.6 });
  P.chainFence(b, { x1: cx - 15, z1: zC, x2: cx - 10, z2: zC, h: 2.1, tarp: 'tarp' });
  floorPlate(b, { x: cx - 12.5, z: zC - 1.3, text: '養生シート付き', accent: HUE.yard, w: 3.0 });
  P.railing(b, { x1: cx - 8, z1: zC, x2: cx - 3, z2: zC, y: 0, height: 1.1 });
  floorPlate(b, { x: cx - 5.5, z: zC - 1.3, text: '手すり', accent: HUE.yard, w: 2.2 });
  P.siteBarrier(b, { x1: cx - 1, z1: zC, x2: cx + 6, z2: zC });
  floorPlate(b, { x: cx + 2.5, z: zC - 1.3, text: '単管バリケード', accent: HUE.yard, w: 3.0 });

  /* ---- 奥: 大物と雑多な山 ---- */
  const zB = cz + 7.0;
  P.container(b, { x: cx - 20, y: 0, z: zB, yaw: FACE_N });
  P.container(b, { x: cx - 20, y: 2.59, z: zB, yaw: FACE_N, mat: 'paintedMetalTan' });
  P.container(b, { x: cx - 13, y: 0, z: zB, yaw: FACE_N + 0.08, mat: 'rustedMetal' });
  floorPlate(b, { x: cx - 16.5, z: zB - 2.2, text: 'コンテナ 20ft', sub: '6.06 × 2.44 × 2.59', accent: HUE.yard, w: 3.6 });

  P.vehicle(b, { x: cx - 5, y: 0, z: zB, yaw: FACE_S + Math.PI / 2, type: 'truck' });
  P.vehicle(b, { x: cx + 1.5, y: 0, z: zB, yaw: FACE_S + Math.PI / 2, type: 'car', mat: 'rustedMetal' });
  floorPlate(b, { x: cx - 2, z: zB - 2.6, text: '車両', accent: HUE.yard, w: 2.4 });

  P.scaffold(b, { x: cx + 9, y: 0, z: zB + 1.0, yaw: FACE_N, length: 8.0, levels: 3, levelH: 2.2, depth: 1.3 });
  floorPlate(b, { x: cx + 9, z: zB - 2.2, text: '足場 3 層', accent: HUE.yard, w: 2.8 });
  P.siteOffice(b, { x: cx + 18, y: 0, z: zB + 1.0, yaw: FACE_N });
  floorPlate(b, { x: cx + 18, z: zB - 2.4, text: '現場事務所', accent: HUE.yard, w: 3.0 });

  /* ---- 街路の小物（仕上がったものを名前付きで並べる） ---- */
  /*
   * 市街地を歩いて視界に入る順に数えると、建物より先に目へ入るのは
   * 「地面から 1m まで」の物ばかりになる。
   * ここに並べておけば、マップを組むときに何が使えるか一目で分かる。
   */
  const zS = cz + 11.5;
  const street = [
    ['側溝と蓋', 'GUTTER', (x, z) => P.gutter(b, { x1: x, z1: z - 1.1, x2: x, z2: z + 1.1 })],
    ['マンホール', 'MANHOLE', (x, z) => P.manhole(b, { x, z })],
    ['車止め', 'BOLLARD', (x, z) => { for (const i of [-1, 0, 1]) P.bollard(b, { x: x + i * 0.8, z }); }],
    ['道路標識', 'ROAD SIGN', (x, z) => P.roadSign(b, { x, z, yaw: FACE_N, kind: 'triangle', text: '徐行', bg: '#c8a21e', fg: '#20242a' })],
    ['カーブミラー', 'MIRROR', (x, z) => P.curveMirror(b, { x, z, yaw: FACE_N })],
    ['ガードレール', 'GUARDRAIL', (x, z) => P.guardrail(b, { x1: x - 1.2, z1: z, x2: x + 1.2, z2: z })],
    ['消火栓', 'HYDRANT', (x, z) => P.hydrant(b, { x, z, yaw: FACE_N })],
    ['郵便ポスト', 'POST BOX', (x, z) => P.postBox(b, { x, z, yaw: FACE_N })],
    ['街路樹', 'STREET TREE', (x, z) => P.streetTree(b, { x, z, seed: 5 })],
    ['ゴミ集積所', 'GARBAGE', (x, z) => P.garbagePoint(b, { x, z, yaw: FACE_N })],
    ['自転車', 'BICYCLE', (x, z) => P.bicycle(b, { x, z, yaw: FACE_N + 0.4 })],
  ];
  for (let i = 0; i < street.length; i++) {
    const x = cx - 22 + i * 4.1;
    /*
     * 台は周囲より 1 段暗くする。
     * 舗装と同じ色にしたら、上から見たとき台が見えず、
     * 小物が地面にばらまかれているようにしか見えなかった。
     */
    b.box({ x, y: 0.018, z: zS, w: 3.6, h: 0.03, d: 3.6,
      mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
    for (const [ox, oz, ww, dd] of [[0, -1.8, 3.6, 0.09], [0, 1.8, 3.6, 0.09], [-1.8, 0, 0.09, 3.6], [1.8, 0, 0.09, 3.6]]) {
      b.box({ x: x + ox, y: 0.021, z: zS + oz, w: ww, h: 0.03, d: dd,
        mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
    }
    street[i][2](x, zS);
    plate(b, { x, y: 0.42, z: zS + 1.95, yaw: FACE_N,
      text: street[i][0], sub: street[i][1], accent: HUE.yard, w: 3.2 });
  }
  label(b, { x: cx - 26, y: 2.1, z: zS, yaw: Math.PI / 2,
    text: '街路の小物', sub: 'STREET PROPS', accent: HUE.yard, w: 3.4 });

  /* ---- いちばん奥: 新しい物の置き枠 ---- */
  for (let i = 0; i < 5; i++) {
    const x = cx - 20 + i * 5.2;
    const z = cz + D / 2 - 3.5;
    b.box({ x, y: 0.016, z, w: 4.6, h: 0.03, d: 4.6, mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false });
    for (const [ox, oz, ww, dd] of [[0, -2.3, 4.6, 0.12], [0, 2.3, 4.6, 0.12], [-2.3, 0, 0.12, 4.6], [2.3, 0, 0.12, 4.6]]) {
      b.box({ x: x + ox, y: 0.019, z: z + oz, w: ww, h: 0.03, d: dd,
        mat: 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
    }
    floorPlate(b, { x, z, text: `空き枠 ${i + 1}`, accent: HUE.yard, w: 2.4 });
  }
  /*
   * 空き枠の案内。
   * 枠の手前（通路側）に立てる。列の脇へ置くと、
   * 足場や事務所の陰に入って読めなくなる。
   */
  label(b, { x: cx - 10, y: 2.1, z: cz + D / 2 - 6.4, yaw: FACE_N,
    text: '新しいアセットはここへ', accent: HUE.yard, w: 4.4 });
}

/**
 * マテリアル見本（屋外）。
 *
 * 博物館の第 3 室は均一な室内照明で「素の色」を見るための場所。
 * こちらは屋外の直射と影の下で、実戦での見え方を確かめる。
 * 同じ材質を両方で見比べられるようにしてある。
 */
export function sectionMaterials(b, cx, cz) {
  const groups = [
    ['建材', ['concrete', 'concreteRaw', 'plaster', 'paintedWall', 'brick', 'brickPale', 'concreteBlock', 'rock', 'tile', 'paving']],
    ['地面', ['asphalt', 'dirt', 'mud', 'sand', 'gravel', 'grass', 'grassDry', 'tactilePaving', 'ballast', 'oilStain']],
    ['金属', ['rustedMetal', 'paintedMetal', 'brushedMetal', 'galvanized', 'corrugated', 'diamondPlate', 'expandedMetal', 'castIron', 'sidingMetal', 'shutter']],
    ['木・布', ['wood', 'woodFloor', 'plywood', 'osb', 'formPly', 'scaffoldPlank', 'fabric', 'camo', 'sandbag', 'tarp']],
    ['屋内', ['marble', 'terrazzo', 'granite', 'carpet', 'wallpaper', 'ceramicTile', 'ceilingPanel', 'velvet', 'brassPolished', 'woodFloorDark']],
    ['武器', ['parkerized', 'anodizedBlack', 'cerakoteFDE', 'bluedSteel', 'nitride', 'stampedSteel', 'woodStock', 'polymer', 'kevlarWeave', 'cordura']],
  ];
  const PITCH = 1.7;
  const W = PITCH * 10 + 4, D = groups.length * 3.8 + 2;
  apron(b, { x: cx, z: cz, w: W, d: D, mat: 'concreteFloor' });
  label(b, { x: cx, y: 2.8, z: cz - D / 2 - 0.6, yaw: FACE_S,
    text: 'マテリアル見本（屋外）', sub: 'MATERIALS / OUTDOOR', accent: HUE.mat, w: 5.4 });

  for (let gi = 0; gi < groups.length; gi++) {
    const [gname, list] = groups[gi];
    const z = cz - D / 2 + 2.6 + gi * 3.8;
    label(b, { x: cx - W / 2 + 1.4, y: 1.7, z, yaw: FACE_S, text: gname, accent: HUE.mat, w: 2.0 });
    for (let i = 0; i < list.length; i++) {
      const name = list[i];
      const x = cx - W / 2 + 3.4 + i * PITCH;
      b.box({ x, y: 0.19, z, w: PITCH - 0.16, h: 0.38, d: 1.5, yaw: FACE_S, mat: 'concreteFloor', surface: SURFACE.CONCRETE });
      b.box({ x, y: 1.05, z, w: PITCH - 0.32, h: 1.3, d: 0.1, yaw: FACE_S, mat: name, surface: SURFACE.CONCRETE });
      // 曲面（法線とハイライトの癖は平板では判らない）
      b.cylinder({ x: x - 0.36, y: 0.38, z: z - 0.46, radius: 0.16, height: 0.48, segments: 14,
        mat: name, surface: SURFACE.CONCRETE, collide: false });
      const sph = new THREE.SphereGeometry(0.2, 18, 12);
      b.mesh(name, sph, { x: x + 0.34, y: 0.59, z: z - 0.46 });
      plate(b, { x, y: 0.22, z: z - 0.76, yaw: FACE_S,
        text: MATERIAL_JA[name] || name, sub: name, accent: HUE.mat, w: PITCH - 0.24 });
    }
  }
}
