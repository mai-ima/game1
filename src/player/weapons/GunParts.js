import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 銃器モデルを手続き的に組み立てるためのジオメトリ部品集。
 *
 * 座標系の約束:
 *   +X = 右, +Y = 上, -Z = 銃口方向（プレイヤーの視線方向）
 *   原点はおおよそマガジン取付部（レシーバ下面中央）付近。
 */

/* ------------------------------------------------------------------ *
 *  基本形状
 * ------------------------------------------------------------------ */

/** 角丸矩形の Shape を作る */
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2 - 0.0001, h / 2 - 0.0001);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * 面取り付きの箱。エッジにハイライトが乗るため、ただの BoxGeometry より
 * 格段に「作り込まれた」印象になる。
 * @param {number} w 幅(X) @param {number} h 高さ(Y) @param {number} d 奥行(Z)
 * @param {number} r 角丸半径 @param {number} bevel 面取り量
 */
export function roundedBox(w, h, d, r = 0.004, bevel = 0.0025) {
  const b = Math.min(bevel, d / 2 - 0.0002, r * 0.9);
  const shape = roundedRectShape(w - b * 2, h - b * 2, Math.max(0.0005, r - b));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d - b * 2,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 5,
  });
  g.translate(0, 0, -(d - b * 2) / 2 - b);
  g.computeVertexNormals();
  return g;
}

/** Z 軸方向の円筒（銃身・ガスチューブなど） */
export function tubeZ(radiusTop, radiusBottom, length, seg = 16, open = false) {
  const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Y 軸方向の円筒 */
export function tubeY(radiusTop, radiusBottom, length, seg = 16, open = false) {
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, length, seg, 1, open);
}

/** X 軸方向の円筒（ピン・軸など） */
export function tubeX(radius, length, seg = 12) {
  const g = new THREE.CylinderGeometry(radius, radius, length, seg);
  g.rotateZ(Math.PI / 2);
  return g;
}

/** 断面プロファイルを Z 方向に押し出す（機関部の複雑な断面向け） */
export function extrudeProfile(points, depth, bevel = 0.0015) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2 - bevel);
  g.computeVertexNormals();
  return g;
}

/** 曲線に沿った押し出し（AK のバナナマガジン用） */
export function curvedBox(w, h, length, curveRadius, segments = 10, taper = 0.9) {
  const geos = [];
  const segLen = length / segments;
  let angle = 0;
  const dA = segLen / curveRadius;
  let px = 0, py = 0;
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const sw = w * (1 - (1 - taper) * t);
    const sh = h;
    const g = roundedBox(sw, sh, segLen * 1.06, 0.003, 0.0015);
    g.rotateX(angle);
    g.translate(px, py, 0);
    geos.push(g);
    px += 0;
    py -= Math.cos(angle) * segLen;
    // 曲率に沿って倒す
    angle += dA;
  }
  return merge(geos);
}

/* ------------------------------------------------------------------ *
 *  銃器固有パーツ
 * ------------------------------------------------------------------ */

/** ピカティニーレール（20mm 規格・刻みあり） */
export function picatinnyRail(length, width = 0.021, slotCount = null) {
  const geos = [];
  const base = roundedBox(width, 0.005, length, 0.0012, 0.0008);
  base.translate(0, 0.0025, 0);
  geos.push(base);

  // 台形断面のレール本体
  const top = extrudeProfile([
    [-width / 2, 0], [width / 2, 0],
    [width * 0.38, 0.0055], [-width * 0.38, 0.0055],
  ], length, 0.0006);
  top.translate(0, 0.005, 0);
  geos.push(top);

  // 横方向の刻み（リコイルスロット）
  const n = slotCount ?? Math.max(2, Math.floor(length / 0.0102));
  const pitch = length / n;
  for (let i = 0; i < n; i++) {
    const z = -length / 2 + pitch * (i + 0.5);
    const slot = roundedBox(width * 1.02, 0.0032, 0.0034, 0.0006, 0.0004);
    slot.translate(0, 0.0072, z);
    geos.push(slot);
  }
  return merge(geos);
}

/** フラッシュハイダー（スリット入り） */
export function flashHider(radius = 0.0115, length = 0.058, slots = 6) {
  const geos = [];
  const body = tubeZ(radius, radius * 0.94, length, 20);
  geos.push(body);
  // 前端の面取りリング
  const lip = tubeZ(radius * 1.08, radius * 1.08, 0.006, 20);
  lip.translate(0, 0, -length / 2 + 0.003);
  geos.push(lip);
  // 縦スリット
  for (let i = 0; i < slots; i++) {
    const a = (i / slots) * Math.PI * 2;
    const s = roundedBox(0.0032, radius * 0.9, length * 0.62, 0.0006, 0.0004);
    s.rotateZ(a);
    s.translate(Math.cos(a) * radius * 0.72, Math.sin(a) * radius * 0.72, -length * 0.1);
    geos.push(s);
  }
  return merge(geos);
}

/** 消音器 / サプレッサー */
export function suppressor(radius = 0.019, length = 0.185) {
  const geos = [];
  geos.push(tubeZ(radius, radius, length, 24));
  // 前後のカラー
  const c1 = tubeZ(radius * 1.06, radius * 1.06, 0.012, 24);
  c1.translate(0, 0, length / 2 - 0.006);
  geos.push(c1);
  const c2 = tubeZ(radius * 1.06, radius * 1.02, 0.014, 24);
  c2.translate(0, 0, -length / 2 + 0.007);
  geos.push(c2);
  // 表面の放熱リング
  for (let i = 0; i < 7; i++) {
    const z = -length / 2 + 0.03 + i * (length - 0.06) / 6;
    const r = tubeZ(radius * 1.02, radius * 1.02, 0.0035, 24);
    r.translate(0, 0, z);
    geos.push(r);
  }
  return merge(geos);
}

/** ピストルグリップ（人間工学形状 + 指の窪み） */
export function pistolGrip(w = 0.030, h = 0.105, d = 0.040, rake = 0.34) {
  const geos = [];
  /*
   * 積み上げる輪切りの数。少ないと側面に階段状の段差が出る。
   * 重なり量（1.45）も併せて増やし、隣の輪切りと十分に食い込ませる。
   */
  const SEG = 14;
  for (let i = 0; i < SEG; i++) {
    const t = i / (SEG - 1);
    // 下に行くほど細く、後ろに傾く。握りらしく中ほどをわずかに絞る。
    const waist = 1 - Math.sin(t * Math.PI) * 0.05;
    const sw = w * (1 - t * 0.16) * waist;
    const sd = d * (1 - t * 0.30) * waist;
    const seg = roundedBox(sw, h / SEG * 1.45, sd, 0.008, 0.003);
    seg.translate(0, -h * t, Math.sin(rake) * h * t * 0.55);
    geos.push(seg);
  }
  // 指かけの膨らみ
  for (let i = 0; i < 3; i++) {
    const y = -h * (0.28 + i * 0.22);
    const bump = new THREE.SphereGeometry(0.0085, 12, 8);
    bump.scale(1.0, 0.55, 1.3);
    bump.translate(0, y, Math.sin(rake) * (-y) * 0.55 - d * 0.32);
    geos.push(bump);
  }
  return merge(geos);
}

/** トリガーガード + トリガー */
export function triggerGuard(w = 0.014, len = 0.052, h = 0.036) {
  const geos = [];
  const th = 0.005;
  // 前壁
  const front = roundedBox(w, h, th, 0.002, 0.0012);
  front.translate(0, -h / 2, -len / 2 + th / 2);
  geos.push(front);
  // 下部（緩いカーブ）
  const N = 6;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const z = -len / 2 + len * t;
    const dip = Math.sin(t * Math.PI) * 0.006;
    const seg = roundedBox(w, th, len / N * 1.15, 0.002, 0.001);
    seg.translate(0, -h + dip, z);
    geos.push(seg);
  }
  return merge(geos);
}

export function trigger(w = 0.007, h = 0.026) {
  const geos = [];
  const N = 5;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const seg = roundedBox(w, h / N * 1.2, 0.006 + t * 0.004, 0.0018, 0.0009);
    seg.translate(0, -h * t, Math.sin(t * 1.1) * 0.006);
    geos.push(seg);
  }
  return merge(geos);
}

/** アイアンサイト: フロントポスト */
export function frontSight(h = 0.030, w = 0.012) {
  const geos = [];
  // 台座
  const base = roundedBox(w * 1.9, 0.010, 0.020, 0.002, 0.001);
  geos.push(base);
  // 両側の保護ウィング
  for (const s of [-1, 1]) {
    const wing = roundedBox(0.0035, h, 0.013, 0.0012, 0.0008);
    wing.translate(s * w * 0.62, h / 2 + 0.004, 0);
    geos.push(wing);
  }
  // ポスト
  const post = tubeY(0.0016, 0.0021, h * 0.78, 8);
  post.translate(0, h * 0.39 + 0.004, 0);
  geos.push(post);
  return merge(geos);
}

/** アイアンサイト: リアサイト（ピープ / ノッチ） */
export function rearSight(w = 0.024, h = 0.020, peep = true) {
  const geos = [];
  const base = roundedBox(w, 0.008, 0.020, 0.002, 0.001);
  geos.push(base);
  if (peep) {
    // 環状のピープ
    const ring = new THREE.TorusGeometry(0.0042, 0.0016, 8, 18);
    ring.translate(0, h * 0.62, 0);
    geos.push(ring);
    for (const s of [-1, 1]) {
      const wing = roundedBox(0.0032, h * 0.85, 0.012, 0.0012, 0.0008);
      wing.translate(s * w * 0.34, h * 0.44, 0);
      geos.push(wing);
    }
  } else {
    // U 字ノッチ
    for (const s of [-1, 1]) {
      const post = roundedBox(0.005, h * 0.8, 0.010, 0.0012, 0.0008);
      post.translate(s * 0.0058, h * 0.42, 0);
      geos.push(post);
    }
  }
  return merge(geos);
}

/** 放熱スリット / 通気孔の列 */
export function ventSlots(count, w, h, spacing, axis = 'z') {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const o = (i - (count - 1) / 2) * spacing;
    const g = roundedBox(w, h, 0.004, 0.0008, 0.0005);
    if (axis === 'z') g.translate(0, 0, o);
    else g.translate(o, 0, 0);
    geos.push(g);
  }
  return merge(geos);
}

/** ねじ・ピン・リベットのような小径円筒（作り込み感の要） */
export function boltHead(radius = 0.003, depth = 0.0022, faces = 6) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.96, depth, faces);
  g.rotateX(Math.PI / 2);
  return g;
}

/** スリング取付環 */
export function slingLoop(radius = 0.008, thickness = 0.0018) {
  return new THREE.TorusGeometry(radius, thickness, 8, 16);
}

/** チャージングハンドル */
export function chargingHandle(len = 0.055, knobR = 0.0058) {
  const geos = [];
  const bar = roundedBox(0.010, 0.008, len, 0.002, 0.001);
  geos.push(bar);
  const knob = new THREE.SphereGeometry(knobR, 12, 10);
  knob.scale(1.25, 1, 0.9);
  knob.translate(0, 0, len / 2 - 0.004);
  geos.push(knob);
  return merge(geos);
}

/**
 * マージ可能な形へジオメトリを正規化する。
 * ExtrudeGeometry は非インデックス、Cylinder/Sphere/Torus はインデックス付きで
 * 生成されるため、そのままでは mergeGeometries が失敗する。
 * 全て非インデックス化し、属性を position / normal / uv の 3 つに揃える。
 */
/**
 * ボックス投影 UV の 1 タイルあたりのワールド長（メートル）。
 *
 * 銃はマップの壁と違い、手元で数十センチの物体を至近距離から見る。
 * 0.16m/タイルだと樹脂の滑り止め（テクスチャ内で 1 タイル 26 個）が
 * 6mm ピッチになり、画面上では巨大な市松模様として現れていた。
 * 実物の滑り止めは 1〜2mm ピッチなので、タイルを 5cm まで詰める。
 * 金属の肌目や木目も同時に細かくなり、手元の解像感が上がる。
 */
export const UV_TILE = 0.05;

/**
 * ボックス（トライプラナー）投影で UV を貼り直す。
 *
 * ExtrudeGeometry はワールド座標そのままの UV、CylinderGeometry は 0..1 正規化 UV を
 * 返すため、そのまま混在させるとパーツごとにテクセル密度が数百倍ずれ、
 * 高周波テクスチャが激しくエイリアシングする（銃全体がノイズまみれになる）。
 * ここで全パーツを共通のワールドスケール基準へ統一する。
 */
export function boxProjectUV(g, tile = UV_TILE) {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  const inv = 1 / tile;

  for (let i = 0; i < n; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz)      { u = pz * inv; v = py * inv; }  // X 面 → ZY 平面へ投影
    else if (ny >= nx && ny >= nz) { u = px * inv; v = pz * inv; }  // Y 面 → XZ
    else                           { u = px * inv; v = py * inv; }  // Z 面 → XY
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function normalizeGeo(geo, projectUv = true) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g === geo) g = geo.clone();

  if (!g.getAttribute('normal')) g.computeVertexNormals();

  // 余分な属性（ExtrudeGeometry の場合など）を落とす
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }

  if (projectUv) boxProjectUV(g);
  else if (!g.getAttribute('uv')) {
    const count = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }

  g.clearGroups();
  g.morphAttributes = {};
  return g;
}

/** 複数ジオメトリを結合（マテリアルごとにまとめる用） */
export function merge(geos) {
  const valid = geos.filter(Boolean).map((g) => normalizeGeo(g, false));
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  return BufferGeometryUtils.mergeGeometries(valid, false);
}

/**
 * パーツを積み上げるための小さなビルダ。
 * マテリアル種別ごとにジオメトリを蓄積し、最後に結合して Mesh 群を返す。
 */
export class GunBuilder {
  constructor() {
    this.groups = new Map();   // materialKey -> geometry[]
    this.anchors = {};         // 名前付きの取付位置
  }

  /**
   * @param {string} matKey マテリアル種別キー
   * @param {THREE.BufferGeometry} geo
   * @param {object} t {x,y,z, rx,ry,rz, sx,sy,sz}
   */
  add(matKey, geo, t = {}) {
    if (!geo) return this;
    const g = normalizeGeo(geo, false);
    if (t.sx !== undefined || t.sy !== undefined || t.sz !== undefined) {
      g.scale(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    }
    if (t.rx) g.rotateX(t.rx);
    if (t.ry) g.rotateY(t.ry);
    if (t.rz) g.rotateZ(t.rz);
    g.translate(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    if (!this.groups.has(matKey)) this.groups.set(matKey, []);
    this.groups.get(matKey).push(g);
    return this;
  }

  /** 左右対称に配置 */
  addMirrored(matKey, geo, t = {}) {
    this.add(matKey, geo, t);
    this.add(matKey, geo, { ...t, x: -(t.x ?? 0), ry: -(t.ry ?? 0), rz: -(t.rz ?? 0) });
    return this;
  }

  anchor(name, x, y, z) {
    this.anchors[name] = new THREE.Vector3(x, y, z);
    return this;
  }

  /**
   * @param {Record<string, THREE.Material>} materials matKey -> Material
   * @returns {THREE.Group}
   */
  build(materials) {
    const root = new THREE.Group();
    for (const [key, geos] of this.groups) {
      const merged = merge(geos);
      if (!merged) continue;
      merged.computeVertexNormals();
      // 全パーツ共通のワールドスケールで UV を貼り直す
      boxProjectUV(merged);
      const mat = materials[key] || materials.default;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = key;
      root.add(mesh);
    }
    root.userData.anchors = this.anchors;
    return root;
  }
}
