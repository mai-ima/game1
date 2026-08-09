import * as THREE from 'three';
import { SURFACE } from './Physics.js';
import * as P from './Props.js';

/**
 * 敷地の外。
 *
 * どのマップも、塀の向こうに何も無かった。
 * 上から見ると世界が 66m で終わっているのがはっきり見え、
 * 塀の外へビルを置いても地面が無いので宙に浮く。
 *
 * ここは「見えるためだけの物」を置く場所。
 * 当たり判定を持たせない。負荷はほぼ描画分だけ。
 *
 * ■ 同心円をやめて街区にした理由
 *
 * 最初の版は中心から半径を振ってビルを撒いていた。
 * 上から見ると、敷地を囲む輪の上にビルが等間隔で並ぶ。
 * 街には見えない。人が作った街は必ず道路の格子から始まり、
 * 建物はその区画の中に収まる。だから
 *
 *   ・道路の格子を先に引く
 *   ・区画の内側にだけ建てる
 *   ・区画ごとに階数の傾向を変える（低い住宅街と、高い中心街）
 *
 * の順で作る。同じ棟数でも、こちらは「街」に見える。
 *
 * ■ 遠さで作りを落とす
 *
 * 窓の帯まで入れた棟を 300 も置くと、頂点数が跳ね上がるうえに
 * 200m 先では 1 画素に潰れて見えない。距離で 3 段に分ける。
 */

/** 街区の間隔（道路の中心から中心まで）と、道路の幅 */
const PITCH = 76;
const ROAD = 17;
/** 街の広がり（中心からの距離。カメラの遠クリップ面は 460〜800m） */
const REACH = 620;

const CITY_MATS = [
  'cityCream', 'citySand', 'cityGrey', 'cityWarmGrey',
  'cityRust', 'citySlate', 'cityBone', 'plaster', 'concreteRaw',
];

/**
 * 敷地の外に街を置く。
 *
 * @param {import('./MapBuilder.js').MapBuilder} b
 * @param {object} bounds {west, east, north, south} 敷地の外周
 * @param {function} rand 0..1 の乱数（マップごとに固定したものを渡す）
 * @param {object} opt {ground} 外の地面の材質
 */
export function surroundings(b, bounds, rand = Math.random, opt = {}) {
  const { west, east, north, south } = bounds;
  const { ground = 'dirt' } = opt;
  const cx = (west + east) / 2, cz = (north + south) / 2;

  /*
   * 外の地面。
   *
   * これを忘れると、塀の向こうのビルが宙に浮く。
   * 敷地の床は数十 m 四方しか無いので、その外側は
   * 「何も無い＝空が見える」になり、街が空中に立っているように見えた。
   *
   * 敷地の床より 10cm 下げる。
   * 以前は上面をちょうど y=0 に置いていたが、敷地の床も上面が y=0 で、
   * 2 枚が完全に重なっていた。どちらが手前か決まらないので、
   * 敷地の中の舗装路が外の土に上書きされ、道路が土色になっていた。
   * 段差は塀の内側に隠れるので見えない。
   *
   * 一面をアスファルトで敷いたこともあるが、上から見ると
   * 敷地のまわりに黒い堀ができたようにしか見えなかった。
   * 素地は敷地の床と同じ土にして、舗装は道路にだけ置く。
   */
  const BASE = -0.10;
  const FIELD = 2600;
  b.box({ x: cx, y: BASE - 0.3, z: cz, w: FIELD, h: 0.6, d: FIELD,
    mat: ground, surface: SURFACE.DIRT, collide: false });

  /* ============ 道路の格子 ============ */
  /*
   * 敷地は格子の 1 区画ぶんを占めているものとして、
   * その外周に沿って道路を通す。
   * 格子の原点を敷地の中心に合わせると、敷地が区画の真ん中に
   * 収まって「街の中に埋まっている」ように見える。
   */
  const siteHalfX = (east - west) / 2 + 12;
  const siteHalfZ = (south - north) / 2 + 12;
  const nx = Math.ceil((REACH - siteHalfX) / PITCH);
  const nz = Math.ceil((REACH - siteHalfZ) / PITCH);

  /** 道路の中心線の座標（敷地の外側だけ） */
  const linesX = [cx - siteHalfX, cx + siteHalfX];
  for (let i = 1; i <= nx; i++) {
    linesX.push(cx - siteHalfX - PITCH * i, cx + siteHalfX + PITCH * i);
  }
  const linesZ = [cz - siteHalfZ, cz + siteHalfZ];
  for (let i = 1; i <= nz; i++) {
    linesZ.push(cz - siteHalfZ - PITCH * i, cz + siteHalfZ + PITCH * i);
  }
  linesX.sort((a, c) => a - c);
  linesZ.sort((a, c) => a - c);

  /**
   * 道路を 1 本引く。
   * horiz なら x 方向、そうでなければ z 方向へ延びる。
   */
  const road = (fixed, t0, t1, horiz) => {
    const len = t1 - t0;
    if (len < 8) return;
    const mid = (t0 + t1) / 2;
    const x = horiz ? mid : fixed, z = horiz ? fixed : mid;
    b.box({ x, y: BASE - 0.05, z, w: horiz ? len : ROAD, h: 0.12, d: horiz ? ROAD : len,
      mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
    // 歩道。縁石の高さぶんだけ持ち上げると、道路が地面に彫られて見える
    for (const s of [-1, 1]) {
      b.box({
        x: horiz ? mid : fixed + s * (ROAD / 2 + 1.7), y: BASE + 0.03,
        z: horiz ? fixed + s * (ROAD / 2 + 1.7) : mid,
        w: horiz ? len : 3.4, h: 0.2, d: horiz ? 3.4 : len,
        mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false,
      });
    }
    // 破線の中央線。1 本の実線にすると滑走路に見える
    const seg = 7, gap = 6;
    for (let t = t0 + 4; t < t1 - 4; t += seg + gap) {
      const l = Math.min(seg, t1 - 4 - t);
      b.box({
        x: horiz ? t + l / 2 : fixed, y: BASE + 0.015, z: horiz ? fixed : t + l / 2,
        w: horiz ? l : 0.16, h: 0.1, d: horiz ? 0.16 : l,
        mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false,
      });
    }
  };

  /*
   * 敷地を跨ぐ道路は、敷地の手前で切って先へ繋ぐ。
   * 切らずに通すと、コンパウンドの中を舗装路が突き抜ける。
   */
  const FAR = REACH + PITCH;
  const clipX = [west - 3, east + 3], clipZ = [north - 3, south + 3];
  for (const x of linesX) {
    if (x > clipX[0] && x < clipX[1]) {
      road(x, cz - FAR, clipZ[0], false);
      road(x, clipZ[1], cz + FAR, false);
    } else {
      road(x, cz - FAR, cz + FAR, false);
    }
  }
  for (const z of linesZ) {
    if (z > clipZ[0] && z < clipZ[1]) {
      road(z, cx - FAR, clipX[0], true);
      road(z, clipX[1], cx + FAR, true);
    } else {
      road(z, cx - FAR, cx + FAR, true);
    }
  }

  /* ============ 建物 ============ */

  /*
   * 階数の傾向。
   *
   * どこも同じ高さだと、地平線が定規で引いたようにまっすぐになる。
   * 実際の街には中心街があって、そこだけ背が高い。
   * 山を 2 つ置いて、そこからの距離で階数を決める。
   * 山の位置はマップごとの乱数で決まるので、方角によって
   * 空の見え方が変わる。
   */
  const hubs = [];
  for (let i = 0; i < 2; i++) {
    const a = rand() * Math.PI * 2;
    const r = 200 + rand() * 240;
    hubs.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, s: 170 + rand() * 120, w: 0.65 + rand() * 0.45 });
  }
  const skyline = (x, z) => {
    let m = 0;
    for (const h of hubs) {
      const d2 = (x - h.x) ** 2 + (z - h.z) ** 2;
      m = Math.max(m, h.w * Math.exp(-d2 / (2 * h.s * h.s)));
    }
    return m;
  };

  /** 1 棟。lod 2=窓と屋上設備 / 1=パラペットと塔屋 / 0=塊だけ */
  const block = (x, z, w, d, h, yaw, mat, lod) => {
    // 基準面まで下げる。地面より上に浮かせると足元に隙間ができる
    b.box({ x, y: BASE + h / 2, z, w, h, d, yaw, mat, surface: SURFACE.CONCRETE, collide: false });
    if (lod < 1) return;
    const top = BASE + h;
    // パラペット。屋根の縁に影が落ちて、箱が建物に見え始める
    b.box({ x, y: top + 0.35, z, w: w + 0.25, h: 0.7, d: d + 0.25, yaw,
      mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
    // 屋上の塔屋
    b.box({ x: x + Math.cos(yaw) * w * 0.2, y: top + 1.5, z: z - Math.sin(yaw) * w * 0.2,
      w: w * 0.3, h: 2.2, d: d * 0.35, yaw,
      mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
    if (lod < 2) return;

    // 窓の帯（階ごとに 1 本。1 枚ずつ置いても遠景では潰れるだけ）
    const floors = Math.max(2, Math.min(24, Math.floor(h / 3.4)));
    for (let f = 1; f <= floors; f++) {
      const fy = BASE + (h / (floors + 1)) * f;
      for (const s of [-1, 1]) {
        b.box({ x: x + Math.sin(yaw) * s * (d / 2 + 0.03), y: fy, z: z + Math.cos(yaw) * s * (d / 2 + 0.03),
          w: w * 0.86, h: 1.5, d: 0.06, yaw, mat: 'screenPanel', surface: SURFACE.GLASS, collide: false });
      }
      for (const s of [-1, 1]) {
        b.box({ x: x + Math.cos(yaw) * s * (w / 2 + 0.03), y: fy, z: z - Math.sin(yaw) * s * (w / 2 + 0.03),
          w: 0.06, h: 1.5, d: d * 0.86, yaw, mat: 'screenPanel', surface: SURFACE.GLASS, collide: false });
      }
    }
    if (rand() < 0.55) {
      P.waterTank(b, { x: x - Math.cos(yaw) * w * 0.22, y: top + 1.4, z: z + Math.sin(yaw) * w * 0.22,
        radius: Math.min(1.4, w * 0.16), height: 1.6, legs: 0.7 });
    }
  };

  /*
   * 区画を埋める。
   *
   * 区画いっぱいの箱を 1 つ置くと、道路に面した壁が
   * どこまでも続く長い壁になってしまう。
   * 60m 程度の区画へ割って、いくつか間引き、それぞれに前庭を残す。
   */
  let placed = 0;
  const fillRect = (x0, z0, x1, z1) => {
    const w0 = x1 - x0, d0 = z1 - z0;
    if (w0 < 12 || d0 < 12) return;
    const bx = (x0 + x1) / 2, bz = (z0 + z1) / 2;
    const r = Math.hypot(bx - cx, bz - cz);
    const lod = r < 210 ? 2 : r < 400 ? 1 : 0;

    /*
     * 敷地の南北にできる区画は東西に長い。
     * 1 棟で埋めると 130m の壁になるので、辺の長さで割り数を決める。
     * 近いところは細かく、遠いところは粗く。
     * 全域を細かく割ると棟数が 700 を超え、読み込みが目に見えて重くなる。
     */
    const target = r < 150 ? 34 : r < 260 ? 44 : 70;
    const nu = Math.max(1, Math.round(w0 / target));
    const nv = Math.max(1, Math.round(d0 / target));
    const cw = w0 / nu, cd = d0 / nv;
    const vacancy = r > 420 ? 0.34 : r > 260 ? 0.26 : 0.17;

    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        // 空き地。まばらに抜くと街に隙間ができ、奥行きが見える
        if (rand() < vacancy) continue;
        const ox = x0 + cw * (i + 0.5);
        const oz = z0 + cd * (j + 0.5);
        const w = Math.max(7, cw - 3 - rand() * 6);
        const d = Math.max(7, cd - 3 - rand() * 6);

        /*
         * 高さ。
         * 中心街ほど高く、そのうえで棟ごとに揺らす。
         * 敷地のすぐ外だけは低く抑える。高い壁をすぐ外に立てると
         * 敷地が井戸の底になり、空がまったく見えなくなる。
         */
        const rr = Math.hypot(ox - cx, oz - cz);
        let h = 7 + rand() * 9 + skyline(ox, oz) * (34 + rand() * 62);
        if (rr < 120) h = Math.min(h, 9 + rand() * 7);
        else if (rr < 180) h = Math.min(h, 22 + rand() * 14);

        const mat = CITY_MATS[Math.floor(rand() * CITY_MATS.length)];
        // 区画に対してわずかに振る。完全に揃うと CG に見える
        block(ox + (rand() - 0.5) * 2, oz + (rand() - 0.5) * 2, w, d, h,
          (rand() - 0.5) * 0.06, mat, lod);
        placed++;
      }
    }
  };

  /*
   * 道路 2 本に挟まれた帯を、そのまま 1 区画として扱う。
   *
   * 以前は「敷地の外周から PITCH ずつ」で区画の中心を算出していたが、
   * その式では敷地と同じ列・同じ行に区画が 1 つも作られず、
   * 敷地の真北・真南・真東・真西だけ街が抜けていた。
   * 実際、上から見ると四隅にしかビルが無かった。
   * 道路の座標から挟まれた区間を取れば、そういう抜けは起きない。
   */
  for (let i = 0; i + 1 < linesX.length; i++) {
    const x0 = linesX[i] + ROAD / 2 + 2, x1 = linesX[i + 1] - ROAD / 2 - 2;
    for (let j = 0; j + 1 < linesZ.length; j++) {
      const z0 = linesZ[j] + ROAD / 2 + 2, z1 = linesZ[j + 1] - ROAD / 2 - 2;
      // 敷地に掛かる区画は置かない
      if (x1 > west - 4 && x0 < east + 4 && z1 > north - 4 && z0 < south + 4) continue;
      if (Math.hypot((x0 + x1) / 2 - cx, (z0 + z1) / 2 - cz) > REACH) continue;
      fillRect(x0, z0, x1, z1);
    }
  }

  /* ============ 稜線 ============ */
  /*
   * 山は 2 列にする。
   * 1 列だと、どの峰も同じ距離にあるので影の付き方が揃い、
   * 貼り絵にしか見えない。手前の低い列が奥の列に重なると、
   * そこで初めて「奥行きのある山並み」になる。
   */
  const ridge = (count, rMin, rSpan, hMin, hSpan, wMin, wSpan, mat) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.14;
      const r = rMin + rand() * rSpan;
      const x = cx + Math.cos(a) * r * 1.15, z = cz + Math.sin(a) * r;
      const w = wMin + rand() * wSpan, h = hMin + rand() * hSpan;
      const g = new THREE.ConeGeometry(w / 2, h, 9, 2);
      // 峰を左右非対称に潰す。円錐のままだとテントが並ぶ
      g.scale(1, 1, 0.5 + rand() * 0.55);
      g.rotateY(rand() * 3.14);
      b.mesh(mat, g, { x, y: BASE + h / 2 - 8, z });
    }
  };
  ridge(24, 700, 180, 90, 120, 260, 300, 'rock');
  ridge(26, 470, 130, 46, 62, 170, 210, 'rock');

  return placed;
}
