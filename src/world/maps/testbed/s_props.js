import * as P from '../../Props.js';
import { SURFACE } from '../../Physics.js';
import { plate, label, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 小物試作場。
 *
 * 資材置き場は「まとめて置いて、量と嵩を見る」場所で、
 * 1 点の作りを詰めるには向かない。隣の物が視界に入るし、
 * 裏へ回れず、寸法の当たりも取れない。
 *
 * ここは 1 点ずつ独立した台に載せ、四周から寄れるようにしてある。
 * 台の手前の縁に 10cm 刻みの目盛を打ってあるので、
 * 「この物が実際に何 cm なのか」を目で読める。
 * 寸法が狂った小物は、それだけで街全体の縮尺を壊す。
 *
 * 列は系統で分ける。同じ系統を並べると、作りの深さの差が並んで見える。
 */

/** 台の間隔と大きさ */
const PITCH = 3.4;
const PAD = 2.9;

/**
 * 1 台ぶん。
 * @param {function} place (x, y, z) => void
 */
function stand(b, x, z, name, sub, place, accent, opt = {}) {
  // 台（周囲より 10cm 上げ、縁を白く）
  b.box({ x, y: 0.05, z, w: PAD, h: 0.10, d: PAD,
    mat: 'concreteFloor', surface: SURFACE.CONCRETE });

  /*
   * 壁に付く物のための壁片。
   *
   * スイッチもレンジフードも額縁も、宙に浮かせて眺めても
   * 高さが合っているのか判らない。壁と天井を出すと、
   * 「腰の高さ」「目の高さ」との関係がその場で読める。
   */
  if (opt.wall) {
    b.box({ x, y: 0.10 + 1.25, z: z - PAD / 2 + 0.07, w: PAD, h: 2.5, d: 0.14,
      mat: 'wallpaper', surface: SURFACE.CONCRETE });
    // 巾木（壁だけだと板を立てたようにしか見えない）
    b.box({ x, y: 0.15, z: z - PAD / 2 + 0.16, w: PAD, h: 0.10, d: 0.03,
      mat: 'melamineDark', surface: SURFACE.WOOD, collide: false });
    if (opt.ceiling) {
      b.box({ x, y: 0.10 + 2.56, z: z - PAD / 2 + 0.8, w: PAD, h: 0.12, d: 1.6,
        mat: 'ceilingPanel', surface: SURFACE.CONCRETE, collide: false });
    }
  }
  b.box({ x, y: 0.101, z, w: PAD + 0.16, h: 0.02, d: PAD + 0.16,
    mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });

  /*
   * 手前の縁の目盛。10cm ごとに刻み、50cm ごとに長くする。
   * 物の隣に基準が無いと、大きすぎても小さすぎても気付けない。
   */
  for (let i = 0; i <= Math.round(PAD / 0.1); i++) {
    const t = -PAD / 2 + i * 0.1;
    const long = i % 5 === 0;
    b.box({ x: x + t, y: 0.106, z: z + PAD / 2 - (long ? 0.10 : 0.055),
      w: 0.012, h: 0.02, d: long ? 0.20 : 0.11,
      mat: long ? 'lineYellow' : 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }

  place(x, 0.10, z);
  /*
   * 見る人は台の南側（前面の通路）に立つ。
   * 目盛も南の縁に打ってあるので、小物と銘板の正面も南へそろえる。
   */
  plate(b, { x, y: 0.62, z, offset: PAD / 2 + 0.30, yaw: FACE_S, text: name, sub, accent, w: 2.5 });
  return b;
}

export function sectionProps(b, cx, cz) {
  /*
   * 系統ごとの列。
   * 1 列 8 台。列の間は 5m 空けて、隣の列が視界に入りにくくする。
   */
  const rows = [
    {
      name: '街路', sub: 'STREET', accent: HUE.yard, items: [
        ['側溝と蓋', 'GUTTER', (x, y, z) => P.gutter(b, { x1: x, z1: z - 1.2, x2: x, z2: z + 1.2, y })],
        ['マンホール', 'MANHOLE', (x, y, z) => P.manhole(b, { x, y, z })],
        ['車止め', 'BOLLARD', (x, y, z) => {
          for (const i of [-1, 0, 1]) P.bollard(b, { x: x + i * 0.85, y, z });
        }],
        ['道路標識', 'ROAD SIGN', (x, y, z) => P.roadSign(b, { x, y, z, yaw: FACE_S, kind: 'triangle', text: '徐行', bg: '#c8a21e', fg: '#20242a' })],
        ['カーブミラー', 'CURVE MIRROR', (x, y, z) => P.curveMirror(b, { x, y, z, yaw: FACE_S })],
        ['ガードレール', 'GUARDRAIL', (x, y, z) => P.guardrail(b, { x1: x - 1.3, z1: z, x2: x + 1.3, z2: z, y })],
        ['消火栓', 'HYDRANT', (x, y, z) => P.hydrant(b, { x, y, z, yaw: FACE_S })],
        ['郵便ポスト', 'POST BOX', (x, y, z) => P.postBox(b, { x, y, z, yaw: FACE_S })],
      ],
    },
    {
      name: '街路（大物）', sub: 'STREET LARGE', accent: HUE.yard, items: [
        ['街路樹', 'STREET TREE', (x, y, z) => P.streetTree(b, { x, y, z, seed: 5 })],
        ['ゴミ集積所', 'GARBAGE', (x, y, z) => P.garbagePoint(b, { x, y, z, yaw: FACE_S })],
        ['自転車', 'BICYCLE', (x, y, z) => P.bicycle(b, { x, y, z, yaw: FACE_S + 0.4 })],
        ['街灯', 'STREET LIGHT', (x, y, z) => P.streetLight(b, { x, y, z, yaw: FACE_S })],
        ['電柱', 'UTILITY POLE', (x, y, z) => P.utilityPole(b, { x, y, z })],
        ['自動販売機', 'VENDING', (x, y, z) => {
          b.box({ x, y: y + 0.9, z, w: 1.1, h: 1.8, d: 0.7, yaw: FACE_S,
            mat: 'applianceWhite', surface: SURFACE.METAL });
        }],
        ['ごみ箱', 'TRASH BIN', (x, y, z) => P.trashBin(b, { x, y, z })],
        ['ベンチ', 'BENCH', (x, y, z) => P.bench(b, { x, y, z, yaw: FACE_S })],
      ],
    },
    {
      name: '家具', sub: 'FURNITURE', accent: HUE.mat, items: [
        ['座卓', 'LOW TABLE', (x, y, z) => {
          P.lowTable(b, { x, y, z, yaw: FACE_S });
          for (const s of [-1, 1]) P.floorCushion(b, { x: x + s * 0.85, y, z, yaw: FACE_S });
        }],
        ['こたつ', 'KOTATSU', (x, y, z) => P.lowTable(b, { x, y, z, yaw: FACE_S, kotatsu: true })],
        ['カラーボックス', 'CUBE SHELF', (x, y, z) => {
          P.cubeShelf(b, { x: x - 0.24, y, z, yaw: FACE_S, tiers: 3, seed: 4 });
          P.cubeShelf(b, { x: x + 0.24, y, z, yaw: FACE_S, tiers: 3, seed: 9 });
        }],
        ['衣装ケース', 'STORAGE BINS', (x, y, z) => P.storageBins(b, { x, y, z, yaw: FACE_S })],
        ['ハンガーラック', 'CLOTHES RACK', (x, y, z) => P.clothesRack(b, { x, y, z, yaw: FACE_S })],
        ['姿見', 'MIRROR', (x, y, z) => P.standingMirror(b, { x, y, z, yaw: FACE_S })],
        ['フロアランプ', 'FLOOR LAMP', (x, y, z) => P.floorLamp(b, { x, y, z })],
        ['本の積み', 'BOOK STACK', (x, y, z) => {
          P.bookStack(b, { x: x - 0.3, y, z, yaw: 0.3, count: 8, seed: 3 });
          P.bookStack(b, { x: x + 0.28, y, z: z + 0.2, yaw: -0.5, count: 5, seed: 12 });
        }],
      ],
    },
    {
      name: '和室', sub: 'TATAMI ROOM', accent: HUE.mat, items: [
        ['畳（2 枚）', 'TATAMI', (x, y, z) => P.tatamiArea(b, { x, z, y, w: 1.86, d: 1.86 })],
        ['襖', 'FUSUMA', (x, y, z) => P.slidingDoor(b, { x, y, z, yaw: FACE_S, kind: 'fusuma', open: 0.0 })],
        ['障子', 'SHOJI', (x, y, z) => P.slidingDoor(b, { x, y, z, yaw: FACE_S, kind: 'shoji', open: 0.45 })],
        ['額縁', 'PICTURE', (x, y, z) => {
          P.framedPicture(b, { x: x - 0.5, y: y + 1.55, z: z - PAD / 2 + 0.15, yaw: FACE_S, w: 0.46, h: 0.6 });
          P.framedPicture(b, { x: x + 0.5, y: y + 1.5, z: z - PAD / 2 + 0.15, yaw: FACE_S, w: 0.34, h: 0.95 });
        }, { wall: true }],
        ['壁の棚', 'WALL SHELF', (x, y, z) => {
          P.wallShelf(b, { x, y: y + 1.35, z: z - PAD / 2 + 0.15, yaw: FACE_S, w: 1.1 });
          P.bookStack(b, { x: x - 0.3, y: y + 1.37, z: z - PAD / 2 + 0.26, count: 3, seed: 7 });
        }, { wall: true }],
        ['スイッチ / コンセント', 'SWITCH', (x, y, z) => {
          P.switchPlate(b, { x: x - 0.4, y: y + 1.2, z: z - PAD / 2 + 0.15, yaw: FACE_S, kind: 'switch', gangs: 3 });
          P.switchPlate(b, { x: x + 0.4, y: y + 0.25, z: z - PAD / 2 + 0.15, yaw: FACE_S, kind: 'outlet' });
        }, { wall: true }],
        ['火災警報器', 'SMOKE ALARM', (x, y, z) => P.smokeAlarm(b, { x, y: y + 2.5, z: z - PAD / 2 + 0.8 }),
          { wall: true, ceiling: true }],
        ['扇風機', 'ELECTRIC FAN', (x, y, z) => P.electricFan(b, { x, y, z, yaw: FACE_S })],
      ],
    },
    {
      name: '台所・家電', sub: 'KITCHEN', accent: HUE.mat, items: [
        ['ガスコンロ', 'GAS STOVE', (x, y, z) => {
          b.box({ x, y: y + 0.42, z, w: 0.9, h: 0.84, d: 0.62, yaw: FACE_S,
            mat: 'melaminePale', surface: SURFACE.WOOD });
          P.gasStove(b, { x, y: y + 0.84, z, yaw: FACE_S });
        }],
        ['レンジフード', 'RANGE HOOD', (x, y, z) => P.rangeHood(b, { x, y: y + 1.55, z: z - PAD / 2 + 0.5, yaw: FACE_S, ceiling: y + 2.5 }),
          { wall: true, ceiling: true }],
        ['炊飯器と電気ポット', 'RICE / KETTLE', (x, y, z) => {
          b.box({ x, y: y + 0.42, z, w: 1.1, h: 0.84, d: 0.55, yaw: FACE_S,
            mat: 'melaminePale', surface: SURFACE.WOOD });
          P.riceCooker(b, { x: x - 0.26, y: y + 0.84, z, yaw: FACE_S });
          P.kettlePot(b, { x: x + 0.3, y: y + 0.84, z, yaw: FACE_S });
        }],
        ['流し台', 'KITCHEN SINK', (x, y, z) => P.kitchenSink(b, { x, y, z, yaw: FACE_S, w: 1.8, upper: false })],
        ['食器棚', 'DISH CABINET', (x, y, z) => P.dishCabinet(b, { x, y, z, yaw: FACE_S })],
        ['電子レンジ', 'MICROWAVE', (x, y, z) => {
          b.box({ x, y: y + 0.42, z, w: 0.7, h: 0.84, d: 0.5, yaw: FACE_S,
            mat: 'melaminePale', surface: SURFACE.WOOD });
          P.microwave(b, { x, y: y + 0.84, z, yaw: FACE_S });
        }],
        ['冷蔵庫', 'FRIDGE', (x, y, z) => P.fridge(b, { x, y, z, yaw: FACE_S })],
        ['机まわり', 'DESK', (x, y, z) => {
          P.desk(b, { x, y, z: z - 0.1, yaw: FACE_S });
          P.deskSetup(b, { x, y: y + 0.72, z: z - 0.1, yaw: FACE_S, floorY: y });
          P.officeChair(b, { x, y, z: z + 0.75, yaw: FACE_N });
        }],
      ],
    },
    {
      name: '水回り', sub: 'SANITARY', accent: HUE.mat, items: [
        ['洗濯機', 'WASHER', (x, y, z) => P.washingMachine(b, { x, y, z, yaw: FACE_S })],
        ['便器', 'TOILET', (x, y, z) => P.toilet(b, { x, y, z, yaw: FACE_S })],
        ['洗面台', 'WASH BASIN', (x, y, z) => P.washBasin(b, { x, y, z: z - 0.4, yaw: FACE_S, w: 0.75 })],
        ['浴槽', 'BATHTUB', (x, y, z) => P.bathtub(b, { x, y, z, yaw: FACE_S, w: 1.4, d: 0.78 })],
        ['下駄箱', 'SHOE CABINET', (x, y, z) => P.shoeCabinet(b, { x, y, z, yaw: FACE_S, umbrella: true })],
        ['掛け時計', 'WALL CLOCK', (x, y, z) => P.wallClock(b, { x, y: y + 1.95, z: z - PAD / 2 + 0.15, yaw: FACE_S }),
          { wall: true }],
        ['カーテン', 'CURTAIN', (x, y, z) => P.curtain(b, { x, y: y + 1.0, z: z - PAD / 2 + 0.3, yaw: FACE_S, w: 2.0, h: 1.4, open: 0.35 }),
          { wall: true }],
        ['天井灯', 'CEILING LIGHT', (x, y, z) => {
          P.ceilingLight(b, { x, y: y + 2.48, z: z - PAD / 2 + 0.8 });
          b.light({ x, y: y + 2.1, z: z - PAD / 2 + 0.8, color: 0xf4efe2, intensity: 0.7, distance: 5 });
        }, { wall: true, ceiling: true }],
      ],
    },
  ];

  const W = PITCH * 8 + 4;
  const D = rows.length * 8 + 10;

  // 敷地
  b.box({ x: cx, y: 0.014, z: cz, w: W + 4, h: 0.03, d: D,
    mat: 'paving', surface: SURFACE.CONCRETE, collide: false });

  /*
   * 西側の縦通路。
   *
   * 列を 2 から 5 に増やしたとき、通路は前面の 1 本のままだった。
   * いちばん奥の列は入口から 41m あり、そこまでは台の間を
   * すり抜けて行くことになる。順路が読めない場所は使われなくなる。
   * 列の西端に縦の通路を通し、そこから各列へ入る形にする。
   */
  const aisleX = cx - W / 2 - 3.2;
  b.box({ x: aisleX, y: 0.02, z: cz, w: 4.0, h: 0.03, d: D - 2,
    mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });

  let rz = cz - D / 2 + 6;
  for (const row of rows) {
    for (let i = 0; i < row.items.length; i++) {
      const [nm, sub, place] = row.items[i];
      const x = cx - (PITCH * (row.items.length - 1)) / 2 + PITCH * i;
      stand(b, x, rz, nm, sub, place, row.accent);
    }
    // 縦通路から列へ入る枝道
    b.box({ x: cx - 1.0, y: 0.019, z: rz + PAD / 2 + 1.4, w: W + 6, h: 0.03, d: 2.6,
      mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
    /*
     * 列の名前は縦通路を向ける。
     * yaw −π/2 の法線は (−1, 0, 0) なので西を向く。
     * 歩いてくる人の正面に文字が来る。
     */
    label(b, { x: cx - W / 2 - 1.6, y: 1.9, z: rz, yaw: -Math.PI / 2,
      text: row.name, sub: row.sub, accent: row.accent, w: 3.0 });
    rz += 8;
  }

  // 前面の通路
  b.box({ x: cx, y: 0.02, z: cz + D / 2 - 2.5, w: W + 2, h: 0.03, d: 4,
    mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  label(b, { x: cx, y: 2.9, z: cz + D / 2 + 0.6, yaw: FACE_S,
    text: '小物試作場', sub: 'PROP LAB', accent: HUE.yard, w: 5.0 });
  return b;
}
