import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import * as B from '../../Buildings.js';
import { label, plate, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 建築試作場。
 *
 * ここは「作りかけの建物を置いて、良し悪しを決める場所」。
 *
 * 建物街（s_town）は街並みとして見るための区画で、
 * 一棟の作りを詰めるには向かない。隣の建物が視界に入るし、
 * 背面や屋上を見に回れない。
 *
 * こちらは 1 棟ずつ独立した台に載せて、
 *   ・正面 / 背面 / 側面 / 見上げ / 屋上
 * のどこからでも寄れるようにしてある。
 * 台の四隅に高さの目盛を立ててあるので、寸法の当たりも取れる。
 *
 * 併せて、ファサードの付帯物（竪樋・室外機・引込盤・避難階段）を
 * 原寸で 1 列に並べてある。壁が「ただの面」で終わっているかどうかは、
 * 結局この手の物が付いているかで決まる。
 */

/** 試作台の間隔 */
const PAD = 30;

export function sectionBuildLab(b, cx, cz) {
  const W = PAD * 5 + 12, D = 58;

  /* ---- 敷地 ---- */
  b.box({ x: cx, y: 0.014, z: cz, w: W, h: 0.03, d: D,
    mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
  // 前面の通路（ここを歩いて 1 棟ずつ見る）。南北通路の受け口になる
  const roadZ = cz + D / 2 - 2;
  b.box({ x: cx, y: 0.02, z: roadZ, w: W - 4, h: 0.03, d: 7,
    mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  for (let x = cx - W / 2 + 4; x < cx + W / 2 - 6; x += 9) {
    b.box({ x: x + 2.5, y: 0.028, z: roadZ, w: 5, h: 0.03, d: 0.15,
      mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }

  label(b, { x: cx - 8.5, y: 2.9, z: roadZ + 5.2, yaw: FACE_N,
    text: '建築試作場', sub: 'BUILDING LAB', accent: HUE.town, w: 5.0 });

  /* ---- 試作台 ---- */
  /*
   * 台は 24m 角。中層ビル（14×11）を置いても四周に 5m 残るので、
   * 壁に寄って見上げることができる。
   */
  const pads = [
    ['01 中層ビル', 'MID-RISE'],
    ['02 雑居ビル', 'TENANT BLOCK'],
    ['03 集合住宅', 'APARTMENT'],
    ['04 店舗', 'SHOP FRONT'],
    ['05 倉庫', 'WAREHOUSE'],
  ];
  const padX = (i) => cx - PAD * 2 + PAD * i;
  const padZ = cz + 12;

  for (let i = 0; i < pads.length; i++) {
    const x = padX(i);
    // 台。周囲より 12cm 上げて、建物の足元が地面と溶けないようにする
    b.box({ x, y: 0.06, z: padZ, w: 24, h: 0.12, d: 24,
      mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false });
    b.box({ x, y: 0.075, z: padZ, w: 24.4, h: 0.03, d: 24.4,
      mat: 'hazardStripe', surface: SURFACE.CONCRETE, collide: false });
    // 建物はどれも南（FACE_S）を向けてあるので、見る人は台の南側に立つ
    plate(b, { x, y: 0.9, z: padZ, offset: 12.4, yaw: FACE_S,
      text: pads[i][0], sub: pads[i][1], accent: HUE.town, w: 2.6 });
  }

  const PY = 0.12;      // 台の天端

  /* 01 中層ビル: いちばん作り込む型。市街地の絵の大半はこれ */
  B.midRise(b, {
    x: padX(0), y: PY, z: padZ, yaw: FACE_S, w: 14, d: 11, floors: 5,
    mat: 'concreteRaw', trim: 'concrete',
    name: '協和ビル', sub: 'KYOWA BLDG', signBg: '#20303f', signFg: '#eef1f4',
  });

  /* 02 雑居ビル: 低くて幅がある型。1 階が店、上が事務所 */
  B.midRise(b, {
    x: padX(1), y: PY, z: padZ, yaw: FACE_S, w: 16, d: 9, floors: 3,
    fh: 3.15, groundH: 3.9, mat: 'tile', trim: 'concreteRaw',
    name: '東雲会館', sub: 'SHINONOME', signBg: '#5a2a24', signFg: '#f2ece0',
    escape: true,
  });

  /* 03 集合住宅 */
  B.apartment(b, { x: padX(2), y: PY, z: padZ, yaw: FACE_S, units: 5, d: 8 });

  /* 04 店舗 */
  B.shopFront(b, {
    x: padX(3), y: PY, z: padZ, yaw: FACE_S, w: 10, d: 9, floors: 2,
    name: '山下屋', sub: 'YAMASHITAYA', signBg: '#7a2b22', signFg: '#f4ece0',
  });

  /* 05 倉庫 */
  B.warehouse(b, { x: padX(4), y: PY, z: padZ, yaw: FACE_S, w: 18, d: 14 });

  /* ---- 後列: 中に入れる建物 ---- */
  /*
   * 前列は「外から見る型」、後列は「中に入る型」。
   * 外観だけの棟と、床・階段・間仕切りまである棟とでは
   * 確かめることがまるで違う。並べずに列を分ける。
   */
  const backZ = cz - 17;
  const backs = [
    [-48, 32, 22, '06 事務所ビル', 'OFFICE BLOCK'],
    [-6, 30, 22, '07 予備', 'RESERVED'],
    [30, 24, 22, '08 予備', 'RESERVED'],
  ];
  for (const [bx, bw, bd, nm, en] of backs) {
    b.box({ x: cx + bx, y: 0.06, z: backZ, w: bw, h: 0.12, d: bd,
      mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false });
    b.box({ x: cx + bx, y: 0.075, z: backZ, w: bw + 0.4, h: 0.03, d: bd + 0.4,
      mat: 'hazardStripe', surface: SURFACE.CONCRETE, collide: false });
    plate(b, { x: cx + bx, y: 0.9, z: backZ, offset: bd / 2 + 0.4, yaw: FACE_S,
      text: nm, sub: en, accent: HUE.lab, w: 2.6 });
  }

  /* 06 事務所ビル: 中廊下・居室・階段室・屋上まで通しで入れる */
  B.officeBlock(b, {
    x: cx - 48, y: PY, z: backZ, yaw: FACE_S, w: 22, d: 13, floors: 3,
    name: '第二中央ビル', sub: 'CHUO 2', signBg: '#243b4a', signFg: '#eef1f4',
  });

  /* ---- ファサード付帯物の原寸見本 ---- */
  /*
   * 壁を 1 枚立てて、そこに付く物を並べる。
   * 建物に組み込む前に、単体の作りと寸法をここで決める。
   */
  detailWall(b, cx + 66, backZ + 2);

  return b;
}

/**
 * ファサード付帯物の見本壁。
 * 通路（+Z）を向く 1 枚の壁に、部品を等間隔で取り付ける。
 */
function detailWall(b, cx, cz) {
  const W = 17, H = 7.2;
  b.box({ x: cx, y: 0.09, z: cz, w: W + 1.2, h: 0.18, d: 1.6,
    mat: 'concrete', surface: SURFACE.CONCRETE });
  /*
   * 壁は開口付きで作る。
   *
   * 中身の詰まった 1 枚板にしていたら、引込み窓を取り付けても
   * ガラスも室内も壁の中に埋まり、四角い枠が浮き出るだけだった。
   * 見本にならないので、窓と扉の位置は最初から抜いておく。
   *
   * 開口の位置は下の items と合わせてある（4 番目が窓、5 番目が扉）。
   */
  const pitch = W / 6;
  const winX = -W / 2 + pitch * 3.5;
  const doorX = -W / 2 + pitch * 4.5;
  b.wallWithGaps({
    x1: cx - W / 2, z1: cz, x2: cx + W / 2, z2: cz, y: 0.18, h: H, thickness: 0.4,
    gaps: [
      { start: W / 2 + winX - 0.85, width: 1.7, bottom: 1.4, top: 3.4 },
      { start: W / 2 + doorX - 0.6, width: 1.2, bottom: 0, top: 2.2 },
    ],
    mat: 'concreteRaw', surface: SURFACE.CONCRETE,
  });
  // 開口の奥に室内相当の面を置く（外から覗いたときに抜けて見えないように）
  b.box({ x: cx + winX, y: 0.18 + 2.4, z: cz - 0.45, w: 2.2, h: 2.4, d: 0.2,
    mat: 'roomDark', surface: SURFACE.CONCRETE, collide: false });
  b.box({ x: cx + doorX, y: 0.18 + 1.2, z: cz - 0.45, w: 1.8, h: 2.4, d: 0.2,
    mat: 'roomDark', surface: SURFACE.CONCRETE, collide: false });
  // 天端の笠木
  b.box({ x: cx, y: 0.18 + H + 0.04, z: cz, w: W + 0.16, h: 0.08, d: 0.56,
    mat: 'galvanized', surface: SURFACE.METAL, collide: false });

  const items = [
    ['竪樋', 'DOWNPIPE', (x) => B.downpipe(b, { x, y: 0, z: cz + 0.2, yaw: FACE_S, height: H + 0.18 })],
    ['壁付け室外機', 'WALL AC', (x) => B.wallAc(b, { x, y: 1.35, z: cz + 0.2, yaw: FACE_S })],
    ['引込盤', 'METER PANEL', (x) => B.meterPanel(b, { x, y: 0.18, z: cz + 0.2, yaw: FACE_S })],
    ['引込み窓', 'RECESSED WINDOW', (x) => B.recessedWindow(b, { x, y: 2.58, z: cz + 0.2, yaw: FACE_S, w: 1.7, h: 2.0 })],
    ['建具（扉）', 'DOOR', (x) => B.door(b, { x, y: 0.18, z: cz + 0.2, yaw: FACE_S, w: 1.1, h: 2.2, mat: 'paintedMetal', frame: 'galvanized' })],
    ['避難階段', 'FIRE ESCAPE', (x) => B.fireEscape(b, { x, y: 0.18, z: cz + 0.6, yaw: FACE_S, floors: 2, fh: 3.3 })],
  ];
  for (let i = 0; i < items.length; i++) {
    const x = cx - W / 2 + pitch * (i + 0.5);
    items[i][2](x);
    // 部品はすべて南を向けてあるので、銘板も南側で南を向ける
    plate(b, { x, y: 0.42, z: cz, offset: 1.4, yaw: FACE_S,
      text: items[i][0], sub: items[i][1], accent: HUE.mat, w: Math.min(2.4, pitch - 0.6) });
  }
  label(b, { x: cx - W / 2 - 2.4, y: 2.4, z: cz + 2.6, yaw: FACE_N,
    text: 'ファサード部品', sub: 'FACADE PARTS', accent: HUE.mat, w: 3.6 });
  return b;
}
