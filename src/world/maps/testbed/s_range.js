import * as THREE from 'three';
import { SURFACE } from '../../Physics.js';
import { label, plate, floorPlate, apron, measurePole, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 射撃場。
 *
 * 射座から東へ延びる直線。距離ごとに的を置き、
 * 減衰と拡散の効き方を見比べられるようにする。
 *
 * ここは一度、区画ごと 90 度ずれた向きで組まれていた。
 * 射線は X 方向（LEN が X）なのに、的は
 *
 *   b.box({ x, y: 1.15, z: cz - 2.0, w: 0.7, h: 1.5, d: 0.05 })
 *
 * と置かれていて、厚み 0.05m が Z 方向。つまり板の法線は ±Z で、
 * 射座から東を向くと、幅 5cm の板を真横から見る形になっていた。
 * 的の輪も中心も同じ向き。距離標は的の後ろに立っていて、的の陰で読めない。
 * 射座の台（w 8.0 × d 0.5）も南北の射撃を前提にした形だった。
 *
 * 形は的に見えるので、真横から撮らないかぎり気付けない類の間違い。
 * 向きを持つものは、射線からどう見えるかで決める。
 */

/** 射線に対する正面。射座は西端にあるので、的は西（−X）を向く */
const FACE_W = -Math.PI / 2;

export function sectionRange(b, x0, cz) {
  const LEN = 78;                       // 射座から的止めまで
  const HALF_W = 11;                    // 射線の半幅

  apron(b, { x: x0 + LEN / 2 - 2, z: cz, w: LEN + 8, d: HALF_W * 2, mat: 'asphalt', border: false });

  /* ================= 射座 ================= */
  /*
   * 射線に直交して置く。8m の幅は Z 方向。
   * 台の向こう（東）が射線なので、台は射手の腰を支える形になる。
   */
  b.box({ x: x0, y: 0.55, z: cz, w: 0.5, h: 1.1, d: 8.0,
    mat: 'concrete', surface: SURFACE.CONCRETE });
  b.box({ x: x0 - 2.5, y: 0.02, z: cz, w: 5, h: 0.03, d: 9,
    mat: 'paving', surface: SURFACE.CONCRETE, collide: false });
  // 射座の屋根（日陰で銃を見る）
  for (const s of [-1, 1]) {
    b.cylinder({ x: x0 - 3.4, y: 0, z: cz + s * 3.6, radius: 0.07, height: 3.0, segments: 8,
      mat: 'galvanized', surface: SURFACE.METAL });
  }
  b.box({ x: x0 - 2.2, y: 3.1, z: cz, w: 4.0, h: 0.12, d: 8.4,
    mat: 'metalRoof', surface: SURFACE.METAL });
  // 名札は射座へ入ってくる側（西）へ向ける
  label(b, { x: x0 - 5.2, y: 2.4, z: cz, yaw: FACE_W,
    text: '射座', sub: 'FIRING LINE', accent: HUE.range, w: 3.0 });

  /* ================= 距離ごとの的 ================= */
  /*
   * 距離ごとにレーンを分ける。
   *
   * 5 枚を射線の中心に一列で置いたら、遠い的が手前の的の陰に入った。
   * 正対はしているのに撃てない。実測でも 5m の的以外は
   * すべて「途中で遮られる」と出た。
   * 実際の射撃場も距離ごとにレーンを切ってあるので、それに倣う。
   */
  const DIST = [5, 10, 25, 50, 75];
  const LANE = 2.2;
  const laneZ = (i) => cz + (i - (DIST.length - 1) / 2) * LANE;

  for (let i = 0; i < DIST.length; i++) {
    const m = DIST[i];
    const x = x0 + m;
    const lz = laneZ(i);                 // このレーンの中心

    /*
     * 的。厚みを X に取り、幅を Z に取る。
     * 輪と中心は射座側（西）へ 2〜5cm せり出させて、
     * 板の面と Z ファイティングを起こさないようにする。
     */
    b.box({ x, y: 1.15, z: lz, w: 0.05, h: 1.5, d: 0.7,
      mat: 'plywood', surface: SURFACE.WOOD, penetration: 0.6 });
    b.box({ x: x - 0.032, y: 1.35, z: lz, w: 0.02, h: 0.44, d: 0.44,
      mat: 'lineWhite', surface: SURFACE.WOOD, collide: false });

    /*
     * 中心の赤。ここだけ独立したメッシュにして印を付ける。
     * tools/aimcheck.mjs が印を拾い、射座からのレイと板の法線の
     * 成す角、および射線が通っているかを測る。
     */
    {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.17), b.mats.get('plasticGlossRed'));
      mesh.position.set(x - 0.052, 1.35, lz);
      /*
       * 狙う点と、そのレーンの射座を userData に書く。
       *
       * 座標を書くのは、ジオメトリ側へ平行移動を焼くと
       * メッシュの position が原点のままになり、
       * getWorldPosition では狙う点が取れないから。
       * 実際それで 5 枚とも「距離 64.5m・97 度ずれ」と同じ値が出て、
       * 検査そのものが役に立っていなかった。
       */
      mesh.userData.aimTarget = {
        name: `${m} m`, x: x - 0.052, y: 1.35, z: lz, nx: -1, nz: 0,
        from: [x0 - 2, 1.5, lz],
      };
      b.addExtra(mesh);
    }

    // 的枠（左右の柱）
    for (const s of [-1, 1]) {
      b.box({ x, y: 0.7, z: lz + s * 0.4, w: 0.07, h: 1.4, d: 0.07,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }

    /*
     * 距離標。的の手前 2m、レーンの境（中心から 1.05m）に立てて射座を向ける。
     * 以前は的の 2.6m 奥に立てていたので、的の陰に入って読めなかった。
     * レーンの中に入れると自分の射線を塞ぐ。
     */
    const poleZ = lz - LANE / 2 + 0.05;
    measurePole(b, { x: x - 2.0, z: poleZ, height: 3 });
    plate(b, { x: x - 2.0, y: 2.5, z: poleZ, offset: 0.12, yaw: FACE_W,
      text: `${m} m`, accent: HUE.range, w: 2.0 });

    // 足元の距離帯（そのレーンだけを横切る白線）
    b.box({ x, y: 0.02, z: lz, w: 0.7, h: 0.03, d: LANE - 0.2,
      mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
    // 床の銘板は射線に沿って歩く向きに寝かせる
    floorPlate(b, { x: x - 1.2, z: lz, text: `${m} m`, accent: HUE.range, w: 1.8, yaw: Math.PI / 2 });

    /* レーンの境の破線（どのレーンがどの距離か、足元で判る） */
    for (let t = 1; t < m; t += 4) {
      b.box({ x: x0 + t, y: 0.021, z: lz - LANE / 2, w: 1.6, h: 0.03, d: 0.10,
        mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
    }
  }

  /* ================= 貫通の壁 ================= */
  /*
   * こちらは射線と直交する向き（板の法線が ±Z）に並べる。
   * 主レーンとは撃つ向きが 90 度違うので、専用の射座を床に描く。
   * 印が無いと、どこから撃つ物なのか判らない。
   */
  const PEN_Z = cz + 9.6;
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
    b.box({ x, y: 1.1, z: PEN_Z, w: 2.2, h: 2.2, d: th, mat, surface: surf, penetration: pen });
    for (const s of [-1, 1]) {
      b.box({ x: x + s * 1.16, y: 1.1, z: PEN_Z, w: 0.09, h: 2.3, d: 0.09,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    plate(b, { x, y: 2.5, z: PEN_Z, offset: th / 2 + 0.1, yaw: FACE_N,
      text: name, sub: `貫通 ${(pen * 100).toFixed(0)}%`, accent: HUE.range, w: 2.4 });
    // 撃つ位置（板の正面 6m）
    b.box({ x, y: 0.024, z: PEN_Z - 6, w: 1.6, h: 0.03, d: 0.14,
      mat: 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
  }
  b.box({ x: x0 + 22, y: 0.022, z: PEN_Z - 6, w: 28, h: 0.03, d: 0.10,
    mat: 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
  floorPlate(b, { x: x0 + 22, z: PEN_Z - 7.0, text: '貫通の射座', accent: HUE.range, w: 3.0 });
  label(b, { x: x0 + 22, y: 3.6, z: PEN_Z + 2.0, yaw: FACE_N,
    text: '貫通の検証', sub: 'PENETRATION', accent: HUE.range, w: 4.2 });

  /* ================= 着弾痕を見る板 ================= */
  for (let i = 0; i < 3; i++) {
    const [mat, name] = [['concrete', 'コンクリート'], ['sidingMetal', '鋼板'], ['wood', '木']][i];
    const x = x0 + 48 + i * 7.5;
    b.box({ x, y: 1.6, z: PEN_Z, w: 6.4, h: 3.2, d: 0.3, mat, surface: SURFACE.CONCRETE });
    plate(b, { x, y: 3.5, z: PEN_Z, offset: 0.16, yaw: FACE_N, text: name, sub: '着弾痕', accent: HUE.range, w: 2.8 });
  }

  /* ================= 流れ弾を止める ================= */
  /*
   * 的の先（東）に土手を置く。ここが本来の的止め。
   * 以前は射線の向きを取り違えていたため、土手が射線の真横にあり、
   * 撃った弾は 100m 先の塀まで飛んでいた。
   */
  /*
   * 土手は 1 枚の箱にしない。
   *
   * 高さ 4.4m の板を 1 枚立てただけだと、正面から見ても横から見ても
   * 「緑がかった塀」にしか見えず、土を盛った物には見えなかった。
   * 手前を低く、奥を高くした 3 段の台形で法面を作る。
   * 段の色も砂利→土→草と変えて、盛土の断面らしくする。
   */
  const bermSteps = [
    [0.0, 1.4, 0.0, 'gravel', SURFACE.GRAVEL],
    [1.2, 1.6, 1.1, 'dirt', SURFACE.DIRT],
    [2.4, 1.5, 2.2, 'sand', SURFACE.DIRT],
  ];
  // 的の先（東）— 本来の的止め
  for (const [rise, half, back, mat, surf] of bermSteps) {
    b.box({ x: x0 + LEN + 0.6 + back, y: rise + 0.75, z: cz, w: half * 2, h: 1.5, d: HALF_W * 2,
      mat, surface: surf });
  }
  b.box({ x: x0 + LEN + 3.4, y: 3.95, z: cz, w: 2.2, h: 0.4, d: HALF_W * 2,
    mat: 'sandbag', surface: SURFACE.FABRIC, collide: false });

  // 北側の側壁（横へ逸れた弾を止める）。こちらも法面にする
  for (const [rise, half, back, mat, surf] of bermSteps) {
    b.box({ x: x0 + LEN / 2 - 2, y: rise + 0.75, z: cz - HALF_W + 0.6 - back,
      w: LEN + 8, h: 1.5, d: half * 2, mat, surface: surf });
  }
}
