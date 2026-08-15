import * as THREE from 'three';
import { SURFACE } from '../Physics.js';

/**
 * 街路の小物。
 *
 * 市街地の絵を決めるのは建物の形ではなく、道と歩道の上に
 * 何が載っているか。実際に街を歩いて視界に入るものを数えると、
 * 建物より先に目へ入るのは側溝の蓋、車止め、標識、電柱の足元、
 * 街路樹の枡といった「地面から 1m まで」の物ばかりになる。
 *
 * ここが空だと、どれだけ建物を作り込んでも
 * 「建物の模型を平らな板に並べた」ようにしか見えない。
 *
 * 座標の規約は Props.js と同じ。
 *   at(lx, lz) はローカル（右, 手前）→ ワールド
 *   yaw は「その物の正面が向く向き」で、法線は (sin yaw, 0, cos yaw)
 */

/** ローカル→ワールドの変換を作る */
const local = (x, z, yaw) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
};

/**
 * 側溝と蓋（グレーチング）。
 *
 * 歩道と車道の境目には必ずある。長さ方向に敷くので、
 * 1 本引くだけで道の縁が締まる。
 *
 * 蓋は 1 枚ずつ置く。連続した 1 本の板にすると、
 * 目地が無いので樹脂の帯にしか見えない。
 *
 * @param {object} o {x1, z1, x2, z2, width, grate}
 */
export function gutter(b, o) {
  const { x1, z1, x2, z2, width = 0.34, grate = true, y = 0 } = o;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return b;
  const yaw = Math.atan2(dx, dz);
  const ux = dx / len, uz = dz / len;
  const nx = Math.cos(yaw), nz = -Math.sin(yaw);   // 溝の横断方向

  // 溝の躯体（U 字溝）。両側の立ち上がりと底
  for (const s of [-1, 1]) {
    b.box({
      x: (x1 + x2) / 2 + nx * s * (width / 2 + 0.035), y: y - 0.13,
      z: (z1 + z2) / 2 + nz * s * (width / 2 + 0.035),
      w: 0.07, h: 0.30, d: len, yaw,
      mat: 'concrete', surface: SURFACE.CONCRETE, collide: false,
    });
  }
  b.box({
    x: (x1 + x2) / 2, y: y - 0.27, z: (z1 + z2) / 2,
    w: width, h: 0.06, d: len, yaw,
    mat: 'concrete', surface: SURFACE.CONCRETE, collide: false,
  });

  if (!grate) return b;
  /*
   * 蓋。500mm 刻みで並べる。
   * 桟は溝を横断する向き（車輪が落ちない向き）に走る。
   */
  const PITCH = 0.5;
  const n = Math.max(1, Math.round(len / PITCH));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * step;
    const cx = x1 + ux * t, cz = z1 + uz * t;
    // 枠
    b.box({ x: cx, y: y - 0.025, z: cz, w: width, h: 0.05, d: step - 0.012, yaw,
      mat: 'gunMetal', surface: SURFACE.METAL });
    // 桟（横断方向。5 本）
    for (let k = 0; k < 5; k++) {
      const lt = -step / 2 + (step / 5) * (k + 0.5);
      b.box({
        x: cx + ux * lt, y: y - 0.012, z: cz + uz * lt,
        w: width - 0.03, h: 0.028, d: 0.018, yaw,
        mat: 'gunMetal', surface: SURFACE.METAL, collide: false,
      });
    }
  }
  return b;
}

/**
 * マンホール。
 *
 * 路面にひとつあるだけで「舗装された道」に見える。
 * 蓋は路面よりわずかに沈み、まわりに補修の輪ができている。
 */
export function manhole(b, o) {
  const { x, y = 0, z, radius = 0.32, kind = 'sewer' } = o;
  // 補修の輪（蓋を入れ替えたときのアスファルトの継ぎ目）
  b.cylinder({ x, y: y - 0.005, z, radius: radius + 0.16, height: 0.012, segments: 20,
    mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
  // 受け枠
  b.cylinder({ x, y: y - 0.002, z, radius: radius + 0.055, height: 0.022, segments: 22,
    mat: 'castIron', surface: SURFACE.METAL, collide: false });
  // 蓋（枠より 8mm 沈む）
  b.cylinder({ x, y: y - 0.004, z, radius, height: 0.024, segments: 22,
    mat: 'castIron', surface: SURFACE.METAL, collide: false });
  /*
   * 蓋の模様。
   * 実物は同心円と放射のリブで滑り止めを作る。
   * 平らな円盤のままだと、路面に貼った丸いシールに見える。
   */
  for (const r of [radius * 0.34, radius * 0.60, radius * 0.84]) {
    b.mesh('castIron', new THREE.TorusGeometry(r, 0.012, 4, 20),
      { x, y: y + 0.010, z, rx: Math.PI / 2 });
  }
  const spokes = kind === 'sewer' ? 8 : 6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    b.box({
      x: x + Math.cos(a) * radius * 0.58, y: y + 0.010, z: z + Math.sin(a) * radius * 0.58,
      w: radius * 0.52, h: 0.012, d: 0.022, yaw: -a,
      mat: 'castIron', surface: SURFACE.METAL, collide: false,
    });
  }
  // 中央のつまみ穴
  b.cylinder({ x, y: y + 0.004, z, radius: 0.035, height: 0.016, segments: 8,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 車止め（ボラード）。
 *
 * 歩道の入口、駐車場の縁、店先。街のどこにでもある。
 * 反射帯が入るので、暗い場面でも輪郭が読める。
 */
export function bollard(b, o) {
  const { x, y = 0, z, height = 0.82, radius = 0.058, mat = 'stainless' } = o;
  // 根巻き
  b.cylinder({ x, y, z, radius: radius + 0.045, height: 0.06, segments: 12,
    mat: 'concrete', surface: SURFACE.CONCRETE, collide: false });
  // 支柱
  b.cylinder({ x, y: y + 0.05, z, radius, height: height - 0.05, segments: 12,
    mat, surface: SURFACE.METAL });
  // 頭（丸い笠）
  b.mesh(mat, new THREE.SphereGeometry(radius, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    { x, y: y + height, z });
  // 反射帯 2 本
  for (const h of [height - 0.10, height - 0.20]) {
    b.cylinder({ x, y: y + h, z, radius: radius + 0.004, height: 0.035, segments: 12,
      mat: 'reflectorRed', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/**
 * 道路標識。
 *
 * 板・支柱・取付金具の 3 つで出来ている。
 * 板だけ浮かせると看板ではなく紙に見えるので、
 * 裏側の桟と支柱への留め具まで作る。
 *
 * @param {object} o {x, y, z, yaw, kind, height}
 *   kind … 'round'（規制）/ 'square'（案内）/ 'triangle'（警戒）
 */
export function roadSign(b, o) {
  const {
    x, y = 0, z, yaw = 0, kind = 'round', height = 2.35,
    text = '止まれ', bg = '#a8241c', fg = '#f4f0e6', post = 'galvanized',
  } = o;
  /*
   * 標識の面。
   * 専用のテクスチャを焼くのではなく、看板と同じ仕組みで
   * 文字を描いた板を作る。標識は種類が多いので、
   * 1 種類ごとにテクスチャを増やすと総量に効いてしまう。
   */
  const faceMat = b.mats.signboard(text, { bg, fg, w: 256, h: 256, worn: 0.10 });
  const nx = Math.sin(yaw), nz = Math.cos(yaw);

  // 支柱と根巻き
  b.cylinder({ x, y, z, radius: 0.032, height, segments: 10, mat: post, surface: SURFACE.METAL });
  b.cylinder({ x, y, z, radius: 0.075, height: 0.08, segments: 10,
    mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });

  const py = y + height - 0.42;
  /*
   * 板。
   * 表は標識の絵、裏は塗装した鋼板。
   * 実物は 1.5mm の板に補強のリブが入っているので、
   * 厚みを 3cm 取って側面が見えるようにする。
   */
  {
    let g;
    if (kind === 'round') g = new THREE.CylinderGeometry(0.30, 0.30, 0.028, 24);
    else if (kind === 'triangle') g = new THREE.CylinderGeometry(0.36, 0.36, 0.028, 3);
    else g = new THREE.BoxGeometry(0.60, 0.028, 0.44);
    g.rotateX(Math.PI / 2);
    g.rotateY(yaw);
    g.translate(x + nx * 0.045, py, z + nz * 0.045);
    b.addExtra(new THREE.Mesh(g, faceMat));
  }
  // 裏の補強桟と、支柱への留め具
  b.box({ x: x + nx * 0.018, y: py, z: z + nz * 0.018, w: 0.06, h: 0.52, d: 0.022, yaw,
    mat: post, surface: SURFACE.METAL, collide: false });
  for (const oy of [0.18, -0.18]) {
    b.box({ x: x + nx * 0.012, y: py + oy, z: z + nz * 0.012, w: 0.11, h: 0.05, d: 0.05, yaw,
      mat: post, surface: SURFACE.METAL, collide: false });
  }
  // 支柱の天端キャップ
  b.cylinder({ x, y: y + height, z, radius: 0.034, height: 0.02, segments: 10,
    mat: post, surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * カーブミラー。
 *
 * 曲がり角に必ず立っている。丸い鏡面が空を映すので、
 * 遠くからでも「そこに角がある」と分かる目印になる。
 */
export function curveMirror(b, o) {
  const { x, y = 0, z, yaw = 0, height = 2.9, radius = 0.42 } = o;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);

  b.cylinder({ x, y, z, radius: 0.042, height, segments: 10, mat: 'galvanized', surface: SURFACE.METAL });
  b.cylinder({ x, y, z, radius: 0.09, height: 0.09, segments: 10,
    mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });

  const py = y + height - 0.30;
  // 腕（支柱から前へ出て、鏡を斜め下へ向ける）
  b.box({ x: x + nx * 0.16, y: py, z: z + nz * 0.16, w: 0.05, h: 0.05, d: 0.34,
    yaw: yaw + Math.PI / 2, mat: 'galvanized', surface: SURFACE.METAL, collide: false });

  const mx = x + nx * 0.34, mz = z + nz * 0.34;
  // 背面の皿（オレンジ）
  b.mesh('plasticOrange', new THREE.CylinderGeometry(radius, radius, 0.05, 20),
    { x: mx, y: py, z: mz, rx: Math.PI / 2 - 0.22, ry: yaw });
  // 縁の帯
  b.mesh('plasticOrange', new THREE.TorusGeometry(radius, 0.028, 5, 22),
    { x: mx + nx * 0.028, y: py, z: mz + nz * 0.028, rx: -0.22, ry: yaw });
  /*
   * 鏡面。
   * 曇った金属では鏡に見えない。粗さを落として空を映させる。
   */
  b.mesh('chrome', new THREE.CylinderGeometry(radius - 0.035, radius - 0.035, 0.02, 20),
    { x: mx + nx * 0.032, y: py, z: mz + nz * 0.032, rx: Math.PI / 2 - 0.22, ry: yaw });
  return b;
}

/**
 * ガードレール。
 *
 * ビーム（波形の鋼板）・支柱・ブラケットで出来ている。
 * 波形が無いとただの帯になるので、断面の山谷を 3 枚の板で作る。
 */
export function guardrail(b, o) {
  const { x1, z1, x2, z2, y = 0, height = 0.72 } = o;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return b;
  const yaw = Math.atan2(dx, dz);
  const ux = dx / len, uz = dz / len;
  const nx = Math.cos(yaw), nz = -Math.sin(yaw);

  // 支柱（2m ごと）
  const n = Math.max(2, Math.round(len / 2.0));
  for (let i = 0; i <= n; i++) {
    const t = (len * i) / n;
    const px = x1 + ux * t, pz = z1 + uz * t;
    b.box({ x: px, y: y + height / 2 - 0.05, z: pz, w: 0.09, h: height + 0.1, d: 0.06, yaw,
      mat: 'galvanized', surface: SURFACE.METAL });
    // ブラケット（ビームを支柱から前へ持ち出す）
    b.box({ x: px + nx * 0.07, y: y + height, z: pz + nz * 0.07, w: 0.05, h: 0.14, d: 0.14, yaw,
      mat: 'galvanized', surface: SURFACE.METAL, collide: false });
  }
  /*
   * ビーム。波形の断面を上・中・下の 3 枚で近似する。
   * 中央だけ手前へ出すと、光の当たり方が上下と変わって
   * 1 枚の板ではなくプレスした形に見える。
   */
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const beams = [
    [height + 0.11, 0.13, 0.10],
    [height + 0.00, 0.16, 0.15],
    [height - 0.11, 0.13, 0.10],
  ];
  for (const [by, bh, out] of beams) {
    b.box({ x: cx + nx * out, y: y + by, z: cz + nz * out, w: 0.035, h: bh, d: len, yaw,
      mat: 'galvanized', surface: SURFACE.METAL });
  }
  return b;
}

/**
 * 消火栓（地上式）と標識。
 *
 * 赤は街の中で最も目を引く色のひとつ。
 * 交差点や建物の前に置くと、そこが「手入れされている場所」に見える。
 */
export function hydrant(b, o) {
  const { x, y = 0, z, yaw = 0 } = o;
  const at = local(x, z, yaw);
  // 基礎
  b.cylinder({ x, y, z, radius: 0.17, height: 0.07, segments: 12,
    mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
  // 胴
  b.cylinder({ x, y: y + 0.06, z, radius: 0.105, height: 0.56, segments: 14,
    mat: 'plasticGlossRed', surface: SURFACE.METAL });
  // 上のフランジと帽子
  b.cylinder({ x, y: y + 0.60, z, radius: 0.125, height: 0.045, segments: 14,
    mat: 'plasticGlossRed', surface: SURFACE.METAL, collide: false });
  b.mesh('plasticGlossRed', new THREE.SphereGeometry(0.105, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    { x, y: y + 0.645, z });
  // 天端の五角ナット
  b.cylinder({ x, y: y + 0.73, z, radius: 0.042, height: 0.05, segments: 5,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  // 側面の放水口（2 方向）
  for (const s of [-1, 1]) {
    const [px, pz] = at(s * 0.10, 0);
    b.cylinder({ x: px, y: y + 0.40, z: pz, radius: 0.055, height: 0.09, segments: 10,
      mat: 'brass', surface: SURFACE.METAL, collide: false });
    b.cylinder({ x: px + Math.cos(yaw) * s * 0.035, y: y + 0.40, z: pz - Math.sin(yaw) * s * 0.035,
      radius: 0.062, height: 0.02, segments: 10, mat: 'brass', surface: SURFACE.METAL, collide: false });
  }
  // 前面の大口径口
  const [fx, fz] = at(0, 0.10);
  b.cylinder({ x: fx, y: y + 0.30, z: fz, radius: 0.07, height: 0.10, segments: 12,
    mat: 'brass', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 郵便ポスト。
 *
 * 日本の街角にある角型。赤い箱ひとつで場所の性格が変わる。
 */
export function postBox(b, o) {
  const { x, y = 0, z, yaw = 0 } = o;
  const at = local(x, z, yaw);
  const W = 0.42, D = 0.36, H = 1.30;

  // 台座
  b.box({ x, y: y + 0.05, z, w: W + 0.10, h: 0.10, d: D + 0.10, yaw,
    mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
  // 本体
  b.box({ x, y: y + 0.10 + H / 2, z, w: W, h: H, d: D, yaw,
    mat: 'plasticGlossRed', surface: SURFACE.METAL });
  // 天板（少し出す）
  b.box({ x, y: y + 0.10 + H + 0.02, z, w: W + 0.06, h: 0.04, d: D + 0.06, yaw,
    mat: 'plasticGlossRed', surface: SURFACE.METAL, collide: false });
  // 投入口 2 つ（庇つき）
  for (const s of [-1, 1]) {
    const [sx, sz] = at(s * 0.10, D / 2);
    b.box({ x: sx, y: y + 0.10 + H - 0.22, z: sz, w: 0.16, h: 0.045, d: 0.03, yaw,
      mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
    b.box({ x: sx, y: y + 0.10 + H - 0.17, z: sz + Math.cos(yaw) * 0.02, w: 0.20, h: 0.02, d: 0.07,
      yaw, rx: 0.20, mat: 'plasticGlossRed', surface: SURFACE.METAL, collide: false });
  }
  // 取り出し扉（下部）と鍵
  const [dx, dz] = at(0, D / 2 + 0.005);
  b.box({ x: dx, y: y + 0.10 + 0.34, z: dz, w: W - 0.08, h: 0.50, d: 0.015, yaw,
    mat: 'plasticGlossRed', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x: dx + Math.sin(yaw) * 0.012, y: y + 0.10 + 0.34, z: dz + Math.cos(yaw) * 0.012,
    radius: 0.022, height: 0.02, segments: 8, mat: 'brass', surface: SURFACE.METAL, collide: false });
  // 集荷時刻の札
  const [px, pz] = at(0, D / 2 + 0.012);
  b.box({ x: px, y: y + 0.10 + 0.74, z: pz, w: 0.26, h: 0.16, d: 0.01, yaw,
    mat: 'paperPrint', surface: SURFACE.METAL, collide: false });
  return b;
}

/**
 * 街路樹と植栽枡。
 *
 * 幹・枝・葉の 3 段で作る。葉は板を交差させた「葉群」で、
 * 上から見ると十字だが、地上の視点では枝葉の塊に見える。
 *
 * 枡の縁石と土、根元の保護格子まで入れて初めて
 * 「植えられた木」になる。地面から棒が生えているだけでは木に見えない。
 */
export function streetTree(b, o) {
  const {
    x, y = 0, z, height = 5.4, trunk = 0.16, seed = 1,
    curb = true, leaf = 'leafCard',
  } = o;
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };

  if (curb) {
    // 植栽枡（縁石で囲い、中は土）
    const S = 1.35;
    for (const [ox, oz, w, d] of [
      [0, -S / 2, S, 0.11], [0, S / 2, S, 0.11],
      [-S / 2, 0, 0.11, S - 0.22], [S / 2, 0, 0.11, S - 0.22],
    ]) {
      b.box({ x: x + ox, y: y + 0.07, z: z + oz, w, h: 0.14, d,
        mat: 'concrete', surface: SURFACE.CONCRETE });
    }
    b.box({ x, y: y + 0.03, z, w: S - 0.2, h: 0.06, d: S - 0.2,
      mat: 'dirt', surface: SURFACE.DIRT, collide: false });
    // 根元の保護格子
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      b.box({ x, y: y + 0.075, z, w: S - 0.24, h: 0.02, d: 0.03, yaw: a,
        mat: 'castIron', surface: SURFACE.METAL, collide: false });
    }
  }

  /*
   * 幹。
   * まっすぐの円柱だと電柱に見える。3 段に分けて少しずつ細く、
   * 各段をわずかに傾ける。
   */
  const segs = 3;
  let px = x, pz = z, py = y;
  for (let i = 0; i < segs; i++) {
    const h = (height * 0.55) / segs;
    const rr = trunk * (1 - i * 0.18);
    const tilt = (rnd() - 0.5) * 0.12;
    const ta = rnd() * Math.PI * 2;
    b.cylinder({ x: px, y: py, z: pz, radius: rr, height: h, segments: 9,
      mat: 'bark', surface: SURFACE.WOOD, collide: i === 0 });
    py += h;
    px += Math.cos(ta) * tilt * h;
    pz += Math.sin(ta) * tilt * h;
  }

  /*
   * 枝。幹の上から 4〜5 本、上向きに広がる。
   * 葉群だけ浮かせると、緑の玉が空に浮いているように見える。
   */
  const nb = 4 + Math.floor(rnd() * 2);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rnd() * 0.5;
    const len = height * (0.18 + rnd() * 0.10);
    const up = 0.55 + rnd() * 0.3;
    const ex = px + Math.cos(a) * len, ez = pz + Math.sin(a) * len;
    const ey = py + len * up;
    b.box({
      x: (px + ex) / 2, y: (py + ey) / 2, z: (pz + ez) / 2,
      w: trunk * 0.42, h: trunk * 0.42, d: Math.hypot(len, len * up),
      yaw: Math.atan2(ex - px, ez - pz), rx: -Math.atan2(len * up, len),
      mat: 'bark', surface: SURFACE.WOOD, collide: false,
    });
    // 葉群（枝先に 2 枚の板を交差させる）
    const lr = height * (0.15 + rnd() * 0.07);
    for (let k = 0; k < 2; k++) {
      const g = new THREE.PlaneGeometry(lr * 2, lr * 1.5);
      g.rotateY(a + k * Math.PI / 2);
      g.translate(ex, ey + lr * 0.35, ez);
      b.mesh(leaf, g);
    }
  }
  // 頂部の葉群（横からの穴を塞ぐ）
  {
    const lr = height * 0.20;
    for (let k = 0; k < 2; k++) {
      const g = new THREE.PlaneGeometry(lr * 2.2, lr * 1.6);
      g.rotateY(rnd() * 3.14 + k * Math.PI / 2);
      g.translate(px, py + lr * 0.75, pz);
      b.mesh(leaf, g);
    }
  }
  return b;
}

/**
 * バス停。
 *
 * 標柱・時刻表・上屋・ベンチ。
 * 道の途中に人の居場所を作る要素で、遮蔽としても働く。
 */
export function busStop(b, o) {
  const { x, y = 0, z, yaw = 0, shelter = true, name = '' } = o;
  const at = local(x, z, yaw);

  // 標柱
  b.cylinder({ x, y, z, radius: 0.038, height: 2.5, segments: 10,
    mat: 'galvanized', surface: SURFACE.METAL });
  b.cylinder({ x, y, z, radius: 0.085, height: 0.08, segments: 10,
    mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false });
  // 丸い標識板（両面）
  {
    const g = new THREE.CylinderGeometry(0.26, 0.26, 0.03, 20);
    g.rotateX(Math.PI / 2);
    g.rotateY(yaw);
    g.translate(x, y + 2.28, z);
    b.addExtra(new THREE.Mesh(g, b.mats.signboard('バス', { bg: '#1d4a7a', fg: '#f2f4f6', w: 256, h: 256 })));
  }
  // 時刻表（縦長の板）
  const [tx, tz] = at(0.0, 0.055);
  b.box({ x: tx, y: y + 1.45, z: tz, w: 0.30, h: 0.50, d: 0.02, yaw,
    mat: 'paperPrint', surface: SURFACE.METAL, collide: false });
  b.box({ x: tx, y: y + 1.45, z: tz, w: 0.34, h: 0.54, d: 0.012, yaw,
    mat: 'aluminum', surface: SURFACE.METAL, collide: false });

  if (!shelter) return b;
  /*
   * 上屋。
   * 4 本柱に片流れの屋根。背面はガラス、側面は袖壁。
   */
  const W = 3.2, D = 1.5, H = 2.4;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [cxp, czp] = at(sx * (W / 2 - 0.06) + 1.9, sz * (D / 2 - 0.06) - 0.9);
      b.box({ x: cxp, y: y + H / 2, z: czp, w: 0.07, h: H, d: 0.07, yaw,
        mat: 'anodized', surface: SURFACE.METAL });
    }
  }
  const [rx2, rz2] = at(1.9, -0.9);
  b.box({ x: rx2, y: y + H + 0.06, z: rz2, w: W + 0.3, h: 0.09, d: D + 0.4, yaw, rx: -0.06,
    mat: 'corrugatedPlastic', surface: SURFACE.METAL, collide: false });
  b.box({ x: rx2, y: y + H + 0.13, z: rz2, w: W + 0.36, h: 0.05, d: 0.09, yaw,
    mat: 'anodized', surface: SURFACE.METAL, collide: false });
  // 背面のガラス
  const [bx2, bz2] = at(1.9, -0.9 - D / 2 + 0.03);
  {
    const g = new THREE.BoxGeometry(W - 0.1, H - 0.5, 0.02);
    g.rotateY(yaw);
    g.translate(bx2, y + H / 2 + 0.2, bz2);
    b.addExtra(new THREE.Mesh(g, b.mats.windowGlass({ opacity: 0.42 })));
  }
  // ベンチ
  const [nx2, nz2] = at(1.9, -0.9 - D / 2 + 0.30);
  for (let i = 0; i < 3; i++) {
    b.box({ x: nx2 + Math.cos(yaw) * (i - 1) * 0.95, y: y + 0.44, z: nz2 - Math.sin(yaw) * (i - 1) * 0.95,
      w: 0.88, h: 0.05, d: 0.34, yaw, mat: 'woodFine', surface: SURFACE.WOOD });
    b.box({ x: nx2 + Math.cos(yaw) * (i - 1) * 0.95, y: y + 0.22, z: nz2 - Math.sin(yaw) * (i - 1) * 0.95,
      w: 0.06, h: 0.44, d: 0.30, yaw, mat: 'gunMetal', surface: SURFACE.METAL, collide: false });
  }
  if (name) {
    const [sx2, sz2] = at(1.9, -0.9 + D / 2 - 0.02);
    b.box({ x: sx2, y: y + H - 0.22, z: sz2, w: W - 0.6, h: 0.28, d: 0.02, yaw,
      mat: 'paperPrint', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/**
 * ゴミ集積所。
 *
 * 折りたたみの枠にネットを掛け、中に袋が積んである。
 * 生活している街には必ずあるが、ゲームではまず作られない。
 */
export function garbagePoint(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.8, d = 1.0, seed = 3 } = o;
  const at = local(x, z, yaw);
  let r = seed * 7919;
  const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };

  const H = 1.15;
  // 枠（4 隅の柱と上下の桟）
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = at(sx * w / 2, sz * d / 2);
      b.cylinder({ x: px, y, z: pz, radius: 0.016, height: H, segments: 6,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
  }
  for (const hy of [H, H * 0.5]) {
    for (const sz of [-1, 1]) {
      const [p1x, p1z] = at(-w / 2, sz * d / 2), [p2x, p2z] = at(w / 2, sz * d / 2);
      b.box({ x: (p1x + p2x) / 2, y: y + hy, z: (p1z + p2z) / 2, w, h: 0.016, d: 0.016, yaw,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
    for (const sx of [-1, 1]) {
      const [p1x, p1z] = at(sx * w / 2, -d / 2), [p2x, p2z] = at(sx * w / 2, d / 2);
      b.box({ x: (p1x + p2x) / 2, y: y + hy, z: (p1z + p2z) / 2, w: 0.016, h: 0.016, d, yaw,
        mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    }
  }
  // ネット（青い網。三方に張る）
  for (const [ox, oz, ww, dd, ya] of [
    [0, -d / 2, w, 0.01, yaw], [0, d / 2, w, 0.01, yaw],
    [-w / 2, 0, 0.01, d, yaw], [w / 2, 0, 0.01, d, yaw],
  ]) {
    const [px, pz] = at(ox, oz);
    b.box({ x: px, y: y + H / 2, z: pz, w: ww, h: H, d: dd, yaw: ya,
      mat: 'netBlue', surface: SURFACE.FABRIC, collide: false });
  }
  // 中の袋（半透明の白と、はみ出した段ボール）
  for (let i = 0; i < 5; i++) {
    const bx2 = (rnd() - 0.5) * (w - 0.5), bz2 = (rnd() - 0.5) * (d - 0.4);
    const [px, pz] = at(bx2, bz2);
    const s = 0.26 + rnd() * 0.12;
    b.mesh('trashBag', new THREE.SphereGeometry(s, 8, 6),
      { x: px, y: y + s * 0.78, z: pz, sy: 0.82 });
  }
  // 注意書きの札
  const [sx2, sz2] = at(0, d / 2 + 0.012);
  b.box({ x: sx2, y: y + H - 0.18, z: sz2, w: 0.34, h: 0.22, d: 0.008, yaw,
    mat: 'paperPrint', surface: SURFACE.CONCRETE, collide: false });
  b.physics.addBox(x, y + H / 2, z, w / 2, H / 2, d / 2, yaw, { surface: SURFACE.METAL, penetration: 0.6 });
  return b;
}

/**
 * 自転車。
 *
 * 街に置くと一気に生活感が出る。輪は 12 角の環で作る。
 * 円柱を寝かせただけだとタイヤに見えないので、
 * リムとタイヤを別に持ち、スポークも入れる。
 */
export function bicycle(b, o) {
  const { x, y = 0, z, yaw = 0, lean = 0.06 } = o;
  const at = local(x, z, yaw);
  const R = 0.34, WB = 1.06;      // 車輪半径・ホイールベース

  const wheel = (lx) => {
    const [px, pz] = at(lx, 0);
    // タイヤ
    b.mesh('rubber', new THREE.TorusGeometry(R, 0.028, 6, 14),
      { x: px, y: y + R, z: pz, ry: yaw + Math.PI / 2, rz: lean });
    // リム
    b.mesh('aluminum', new THREE.TorusGeometry(R - 0.035, 0.012, 4, 14),
      { x: px, y: y + R, z: pz, ry: yaw + Math.PI / 2, rz: lean });
    // ハブ
    b.cylinder({ x: px, y: y + R, z: pz, radius: 0.028, height: 0.07, segments: 8,
      mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
    // スポーク（6 本）
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      b.box({
        x: px, y: y + R, z: pz, w: 0.008, h: (R - 0.04) * 2, d: 0.008,
        yaw: yaw + Math.PI / 2, rz: a,
        mat: 'brushedMetal', surface: SURFACE.METAL, collide: false,
      });
    }
  };
  wheel(-WB / 2);
  wheel(WB / 2);

  // フレーム（ダウンチューブ・シートチューブ・トップチューブ）
  const tube = (l1, y1, l2, y2, r = 0.019) => {
    const [ax, az] = at(l1, 0), [bx2, bz2] = at(l2, 0);
    const dl = l2 - l1, dy = y2 - y1;
    b.box({
      x: (ax + bx2) / 2, y: y + (y1 + y2) / 2, z: (az + bz2) / 2,
      w: r * 2, h: r * 2, d: Math.hypot(dl, dy),
      yaw, rx: 0, rz: Math.atan2(dy, dl) + Math.PI / 2,
      mat: 'paintedMetal', surface: SURFACE.METAL, collide: false,
    });
  };
  tube(-WB / 2 + 0.06, R + 0.02, 0.06, R + 0.26);      // ダウンチューブ
  tube(0.06, R + 0.26, 0.30, R + 0.02);                 // シートステー下
  tube(0.06, R + 0.26, WB / 2 - 0.10, R + 0.44);        // トップチューブ
  tube(WB / 2 - 0.10, R + 0.44, WB / 2, R + 0.02);      // フォーク

  // サドル
  const [sx2, sz2] = at(0.02, 0);
  b.box({ x: sx2, y: y + R + 0.50, z: sz2, w: 0.24, h: 0.05, d: 0.11, yaw,
    mat: 'leather', surface: SURFACE.FABRIC, collide: false });
  // ハンドル
  const [hx, hz] = at(WB / 2 - 0.08, 0);
  b.box({ x: hx, y: y + R + 0.50, z: hz, w: 0.05, h: 0.05, d: 0.46,
    yaw: yaw + Math.PI / 2, mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  // 前かご
  const [kx, kz] = at(WB / 2 + 0.02, 0);
  for (const [ox, oz, ww, dd] of [[0, -0.16, 0.34, 0.02], [0, 0.16, 0.34, 0.02], [-0.17, 0, 0.02, 0.32], [0.17, 0, 0.02, 0.32]]) {
    b.box({ x: kx + Math.cos(yaw) * ox + Math.sin(yaw) * oz, y: y + R + 0.30,
      z: kz - Math.sin(yaw) * ox + Math.cos(yaw) * oz,
      w: ww, h: 0.20, d: dd, yaw, mat: 'netGrey', surface: SURFACE.METAL, collide: false });
  }
  b.box({ x: kx, y: y + R + 0.20, z: kz, w: 0.34, h: 0.02, d: 0.32, yaw,
    mat: 'netGrey', surface: SURFACE.METAL, collide: false });
  // スタンド
  const [tx2, tz2] = at(-WB / 2 + 0.12, 0.10);
  b.box({ x: tx2, y: y + 0.16, z: tz2, w: 0.02, h: 0.32, d: 0.02, yaw, rx: 0.22,
    mat: 'gunMetal', surface: SURFACE.METAL, collide: false });

  b.physics.addBox(x, y + R + 0.2, z, WB / 2, R + 0.35, 0.22, yaw,
    { surface: SURFACE.METAL, penetration: 0.85 });
  return b;
}
