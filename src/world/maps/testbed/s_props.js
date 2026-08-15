import * as P from '../../Props.js';
import { SURFACE } from '../../Physics.js';
import { plate, label, HUE, FACE_N } from './common.js';

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
function stand(b, x, z, name, sub, place, accent) {
  // 台（周囲より 10cm 上げ、縁を白く）
  b.box({ x, y: 0.05, z, w: PAD, h: 0.10, d: PAD,
    mat: 'concreteFloor', surface: SURFACE.CONCRETE });
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
  plate(b, { x, y: 0.62, z: z + PAD / 2 + 0.30, yaw: FACE_N, text: name, sub, accent, w: 2.5 });
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
        ['道路標識', 'ROAD SIGN', (x, y, z) => P.roadSign(b, { x, y, z, yaw: FACE_N, kind: 'triangle', text: '徐行', bg: '#c8a21e', fg: '#20242a' })],
        ['カーブミラー', 'CURVE MIRROR', (x, y, z) => P.curveMirror(b, { x, y, z, yaw: FACE_N })],
        ['ガードレール', 'GUARDRAIL', (x, y, z) => P.guardrail(b, { x1: x - 1.3, z1: z, x2: x + 1.3, z2: z, y })],
        ['消火栓', 'HYDRANT', (x, y, z) => P.hydrant(b, { x, y, z, yaw: FACE_N })],
        ['郵便ポスト', 'POST BOX', (x, y, z) => P.postBox(b, { x, y, z, yaw: FACE_N })],
      ],
    },
    {
      name: '街路（大物）', sub: 'STREET LARGE', accent: HUE.yard, items: [
        ['街路樹', 'STREET TREE', (x, y, z) => P.streetTree(b, { x, y, z, seed: 5 })],
        ['ゴミ集積所', 'GARBAGE', (x, y, z) => P.garbagePoint(b, { x, y, z, yaw: FACE_N })],
        ['自転車', 'BICYCLE', (x, y, z) => P.bicycle(b, { x, y, z, yaw: FACE_N + 0.4 })],
        ['街灯', 'STREET LIGHT', (x, y, z) => P.streetLight(b, { x, y, z, yaw: FACE_N })],
        ['電柱', 'UTILITY POLE', (x, y, z) => P.utilityPole(b, { x, y, z })],
        ['自動販売機', 'VENDING', (x, y, z) => {
          b.box({ x, y: y + 0.9, z, w: 1.1, h: 1.8, d: 0.7, yaw: FACE_N,
            mat: 'applianceWhite', surface: SURFACE.METAL });
        }],
        ['ごみ箱', 'TRASH BIN', (x, y, z) => P.trashBin(b, { x, y, z })],
        ['ベンチ', 'BENCH', (x, y, z) => P.bench(b, { x, y, z, yaw: FACE_N })],
      ],
    },
  ];

  const W = PITCH * 8 + 4;
  const D = rows.length * 8 + 10;

  // 敷地
  b.box({ x: cx, y: 0.014, z: cz, w: W + 4, h: 0.03, d: D,
    mat: 'paving', surface: SURFACE.CONCRETE, collide: false });

  let rz = cz - D / 2 + 6;
  for (const row of rows) {
    for (let i = 0; i < row.items.length; i++) {
      const [nm, sub, place] = row.items[i];
      const x = cx - (PITCH * (row.items.length - 1)) / 2 + PITCH * i;
      stand(b, x, rz, nm, sub, place, row.accent);
    }
    // 列の名前
    label(b, { x: cx - W / 2 - 1.6, y: 1.9, z: rz, yaw: -Math.PI / 2,
      text: row.name, sub: row.sub, accent: row.accent, w: 3.0 });
    rz += 8;
  }

  // 前面の通路
  b.box({ x: cx, y: 0.02, z: cz + D / 2 - 2.5, w: W + 2, h: 0.03, d: 4,
    mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  label(b, { x: cx, y: 2.9, z: cz + D / 2 + 0.6, yaw: FACE_N,
    text: '小物試作場', sub: 'PROP LAB', accent: HUE.yard, w: 5.0 });
  return b;
}
