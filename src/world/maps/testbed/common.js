import * as THREE from 'three';
import { SURFACE } from '../../Physics.js';

/**
 * テストベッド共通の部品。
 *
 * この場は「歩いて回れること」を第一に作る。
 * どこにいても、次にどこへ行けばいいかが視界に入っていること。
 * そのために銘板の置き方を 3 通りに決めてある。
 */

/** 通路の向き。北側の物は南（+Z）を向き、南側の物は北（−Z）を向く */
export const FACE_S = 0;
export const FACE_N = Math.PI;

/** 区画の色帯 */
export const HUE = {
  hub: '#d97757',       // 中央広場
  museum: '#7b8fa8',    // 博物館
  lab: '#4a90d9',       // 実験場
  range: '#d9482f',     // 射撃場
  town: '#8a7b56',      // 建物街
  yard: '#c8783c',      // 置き場
  mat: '#6f9e6a',       // マテリアル
  gizmo: '#a86fb0',     // ギミック
  sandbox: '#8b9299',   // 試作場
};

/**
 * 自立の看板。区画名や見出しに使う。
 * 光の影響を受けない板なので、日陰でも読める。
 */
export function label(b, o) {
  const { x, y = 1.5, z, yaw = 0, text, sub = '', accent = '#c8783c', w = 2.6, post = true } = o;
  const h = w * 0.25;
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, b.mats.label(text, { sub, accent }));
  mesh.position.set(x + Math.sin(yaw) * 0.03, y, z + Math.cos(yaw) * 0.03);
  mesh.rotation.y = yaw;
  // 向きの自動検査に使う印（tools/facing.mjs が拾う）
  mesh.userData.signText = text;
  mesh.userData.signKind = 'label';
  b.addExtra(mesh);
  b.box({ x, y, z, w: w + 0.08, h: h + 0.08, d: 0.05, yaw,
    mat: 'paintedMetal', surface: SURFACE.METAL, collide: false });
  if (post) {
    for (const s of [-1, 1]) {
      b.cylinder({
        x: x + Math.cos(yaw) * (w / 2 - 0.15) * s, y: 0, z: z - Math.sin(yaw) * (w / 2 - 0.15) * s,
        radius: 0.035, height: y - h / 2, segments: 6, mat: 'galvanized', surface: SURFACE.METAL, collide: false,
      });
    }
  }
  return b;
}

/**
 * 面に貼る銘板。
 * 展示台の前面や壁に貼る。自立の名札を展示物の手前に立てると
 * 肝心の展示物が隠れてしまうので、こちらを使う。
 */
export function plate(b, o) {
  const { x, y = 0.26, z, yaw = 0, text, sub = '', accent = '#c8783c', w = 1.3 } = o;
  const geo = new THREE.PlaneGeometry(w, w * 0.25);
  const mesh = new THREE.Mesh(geo, b.mats.label(text, { sub, accent }));
  mesh.position.set(x + Math.sin(yaw) * 0.014, y, z + Math.cos(yaw) * 0.014);
  mesh.rotation.y = yaw;
  mesh.userData.signText = text;
  mesh.userData.signKind = 'plate';
  b.addExtra(mesh);
  return b;
}

/**
 * 床に寝かせる銘板。
 * 見下ろしながら歩く場所（段差の並びや床置きの展示）で読ませる。
 */
export function floorPlate(b, o) {
  const { x, z, text, sub = '', accent = '#c8783c', w = 1.5, yaw = 0 } = o;
  const geo = new THREE.PlaneGeometry(w, w * 0.25);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, b.mats.label(text, { sub, accent }));
  mesh.position.set(x, 0.035, z);
  mesh.rotation.y = yaw;
  mesh.userData.signText = text;
  mesh.userData.signKind = 'floor';     // 床置きは上を向くので表裏の検査から外す
  b.addExtra(mesh);
  return b;
}

/** 高さの目盛が付いた棒（1m ごとに帯） */
export function measurePole(b, o) {
  const { x, z, height = 4, mat = 'galvanized' } = o;
  b.cylinder({ x, y: 0, z, radius: 0.045, height, segments: 8, mat, surface: SURFACE.METAL, collide: false });
  for (let m = 1; m <= Math.floor(height); m++) {
    b.cylinder({ x, y: m - 0.03, z, radius: 0.075, height: 0.06, segments: 8,
      mat: m % 2 ? 'lineWhite' : 'hazardStripe', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/**
 * 区画の舗装。
 * 足元の色が変わると「別の区画に入った」と体が分かる。
 */
export function apron(b, o) {
  const { x, z, w, d, mat = 'concreteRaw', border = true } = o;
  b.box({ x, y: 0.014, z, w, h: 0.03, d, mat, surface: SURFACE.CONCRETE, collide: false });
  if (border) {
    for (const [ox, oz, ww, dd] of [
      [0, -d / 2, w, 0.16], [0, d / 2, w, 0.16],
      [-w / 2, 0, 0.16, d], [w / 2, 0, 0.16, d],
    ]) {
      b.box({ x: x + ox, y: 0.017, z: z + oz, w: ww, h: 0.03, d: dd,
        mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
    }
  }
  return b;
}

/**
 * 展示台に載せて 1 列に並べる。
 * すべて同じ向きを向き、銘板は台の前面（見る側）に貼る。
 */
export function displayRow(b, items, o) {
  const { x0, z, pitch = 2.6, accent = '#c8783c', yaw = FACE_N, depth = 1.7, height = 0.52 } = o;
  const front = Math.cos(yaw) < 0 ? 1 : -1;
  for (let i = 0; i < items.length; i++) {
    const [name, place, sub] = items[i];
    const x = x0 + i * pitch;
    b.box({ x, y: height / 2, z, w: pitch - 0.5, h: height, d: depth, yaw,
      mat: 'concreteFloor', surface: SURFACE.CONCRETE });
    b.box({ x, y: height + 0.02, z, w: pitch - 0.43, h: 0.04, d: depth + 0.07, yaw,
      mat: 'concrete', surface: SURFACE.CONCRETE, collide: false });
    place(x, z, height + 0.04);
    plate(b, { x, y: 0.3, z: z + front * (depth / 2 + 0.02), yaw,
      text: name, sub, accent, w: pitch - 0.85 });
  }
  return b;
}

/** マップごとに固定の乱数（作り直しても同じ配置になる） */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
