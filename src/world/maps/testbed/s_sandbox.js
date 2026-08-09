import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import { label, floorPlate, HUE, FACE_S, FACE_N } from './common.js';

/**
 * 試作場。
 *
 * 何も置いていない平地。ここだけは「作り込まない」ことが役目。
 *
 * 新しい建物や仕掛けを思い付いたとき、既存の展示の隙間に
 * 押し込もうとすると、まわりを崩さないよう気を遣うことになる。
 * 最初から空けてある場所があれば、そこへ置いて試し、
 * 良ければ然るべき区画へ移せばいい。
 *
 * 目印として 5m のグリッドだけ引いてある。
 */
export function sectionSandbox(b, cx, cz) {
  const W = 40, D = 30;

  b.box({ x: cx, y: 0.014, z: cz, w: W, h: 0.03, d: D, mat: 'concreteFloor', surface: SURFACE.CONCRETE, collide: false });

  // 5m グリッド（寸法を当たりながら組めるように）
  for (let x = -W / 2 + 5; x < W / 2; x += 5) {
    b.box({ x: cx + x, y: 0.018, z: cz, w: 0.05, h: 0.03, d: D - 0.4,
      mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }
  for (let z = -D / 2 + 5; z < D / 2; z += 5) {
    b.box({ x: cx, y: 0.018, z: cz + z, w: W - 0.4, h: 0.03, d: 0.05,
      mat: 'lineWhite', surface: SURFACE.CONCRETE, collide: false });
  }
  // 外枠は太く
  for (const [ox, oz, ww, dd] of [
    [0, -D / 2, W, 0.2], [0, D / 2, W, 0.2], [-W / 2, 0, 0.2, D], [W / 2, 0, 0.2, D],
  ]) {
    b.box({ x: cx + ox, y: 0.02, z: cz + oz, w: ww, h: 0.03, d: dd,
      mat: 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
  }
  // 中心の印（原点を取りやすくする）
  b.box({ x: cx, y: 0.022, z: cz, w: 2.0, h: 0.03, d: 0.16, mat: 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
  b.box({ x: cx, y: 0.022, z: cz, w: 0.16, h: 0.03, d: 2.0, mat: 'lineYellow', surface: SURFACE.CONCRETE, collide: false });

  label(b, { x: cx, y: 2.8, z: cz - D / 2 - 0.8, yaw: FACE_S,
    text: '試作場', sub: 'SANDBOX / 5m グリッド', accent: HUE.sandbox, w: 4.4 });
  floorPlate(b, { x: cx, z: cz + 3.0, text: '空き地 — 好きに組んで試す', accent: HUE.sandbox, w: 5.0 });

  /* ---- 隅に資材を少し置いておく（すぐ組めるように） ---- */
  const qx = cx - W / 2 + 3.5, qz = cz + D / 2 - 3.5;
  P.pallet(b, { x: qx, y: 0, z: qz, yaw: 0.1 });
  P.woodCrate(b, { x: qx, y: 0.13, z: qz, size: 0.8 });
  P.blockPallet(b, { x: qx + 2.6, y: 0, z: qz, rows: 3 });
  P.formworkStack(b, { x: qx + 5.2, y: 0, z: qz, yaw: 0.1, count: 6 });
  P.barrel(b, { x: qx + 7.4, y: 0, z: qz });
  floorPlate(b, { x: qx + 3, z: qz - 2.2, text: '材料置き', accent: HUE.sandbox, w: 2.6 });
}
