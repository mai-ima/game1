import * as THREE from 'three';
import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import { label, floorPlate, HUE, FACE_S, mulberry32 } from './common.js';

/**
 * 地形試験場。
 *
 * これまで全マップが完全な平面で、高低差は「箱を置く」でしか
 * 作れなかった。視線の抜けも構図も生まれず、
 * どのマップも駐車場の上に物を並べたように見える原因になっていた。
 *
 * ここでは
 *   ・登れる斜面と登れない斜面の境目
 *   ・掘り込み（塹壕・側溝）
 *   ・盛土と稜線ごしの撃ち合い
 *   ・地面の材質が変わる境目（土・草・砂利・泥・水たまり）
 * をまとめて置き、実際に歩いて確かめられるようにする。
 */
export function sectionTerrain(b, cx, cz) {
  const rand = mulberry32(31415);
  const W = 26, D = 30;

  // 下地は土。まわりのコンクリートとの境目に縁石を回す
  b.box({ x: cx, y: 0.02, z: cz, w: W, h: 0.04, d: D, mat: 'dirt', surface: SURFACE.DIRT, collide: false });
  for (const [ox, oz, w, d] of [
    [0, -D / 2, W, 0.22], [0, D / 2, W, 0.22],
    [-W / 2, 0, 0.22, D], [W / 2, 0, 0.22, D],
  ]) {
    b.box({ x: cx + ox, y: 0.08, z: cz + oz, w, h: 0.16, d,
      mat: 'concrete', surface: SURFACE.CONCRETE });
  }
  label(b, { x: cx, y: 2.8, z: cz - D / 2 - 0.7, yaw: FACE_S,
    text: '地形試験場', sub: 'TERRAIN', accent: HUE.lab, w: 4.6 });

  /* ================= 1. 斜面の限界 ================= */
  /*
   * 何度まで登れるかは、歩いてみないと判らない。
   * 10° から 45° まで並べ、足元に角度を書いておく。
   */
  {
    const z0 = cz - D / 2 + 5.5;
    const angles = [10, 18, 26, 34, 42];
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      const x = cx - W / 2 + 3.0 + i * 4.6;
      const run = 3.6;
      const rise = run * Math.tan(a * Math.PI / 180);
      const slope = Math.hypot(run, rise);

      /*
       * 見た目は 1 枚の斜めの板、当たり判定だけ段で近似する。
       *
       * MapBuilder.ramp は見た目も段で作るので、
       * 3.6m を 14 段に割ると 1 段 26cm の階段がはっきり見えてしまう。
       * 実際そう見えていた。斜面は傾けた箱 1 つで描き、
       * 登れるかどうかを決める判定だけ細かい段にする。
       */
      b.box({
        x, y: rise / 2, z: z0,
        w: 3.4, h: 0.30, d: slope,
        rx: -Math.atan2(rise, run),
        mat: 'dirt', surface: SURFACE.DIRT, collide: false,
      });
      // 斜面の左右の土手（切り土の法面。無いと板が浮いて見える）
      for (const sx of [-1, 1]) {
        b.box({
          x: x + sx * 1.78, y: rise / 2, z: z0,
          w: 0.22, h: rise + 0.4, d: run,
          mat: 'concreteRaw', surface: SURFACE.CONCRETE, collide: false,
        });
      }
      // 判定の段（1 段 8cm。これ以上粗いと登坂の限界がずれる）
      const steps = Math.max(6, Math.round(rise / 0.08));
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps;
        b.physics.addBox(
          x, rise * t / 2, z0 - run / 2 + run * t,
          1.7, rise * t / 2 + 0.03, run / steps * 0.56, 0,
          { surface: SURFACE.DIRT }
        );
      }
      // 天端の平場
      b.box({ x, y: rise / 2, z: z0 + run / 2 + 0.8, w: 3.4, h: rise, d: 1.6,
        mat: 'gravel', surface: SURFACE.GRAVEL });
      floorPlate(b, { x, z: z0 - run / 2 - 1.1, text: `${a}°`, accent: HUE.lab, w: 1.6 });
    }
    label(b, { x: cx - W / 2 + 3.0, y: 1.9, z: z0 - 3.4, yaw: FACE_S,
      text: '斜面の限界', sub: 'SLOPE LIMIT', accent: HUE.lab, w: 3.0 });
  }

  /* ================= 2. 掘り込み ================= */
  /*
   * 塹壕。地面を掘る仕組みは無いので、
   * まわりを盛って相対的に低くする。
   */
  {
    const z0 = cz - 2.0;
    const len = 16, half = 1.1;
    for (const s of [-1, 1]) {
      // 掘り上げた土（両脇の盛り）
      b.box({ x: cx + s * (half + 0.9), y: 0.55, z: z0, w: 1.8, h: 1.1, d: len,
        mat: 'dirt', surface: SURFACE.DIRT });
      // 縁の土嚢
      P.sandbagStack(b, { x: cx + s * (half + 0.35), y: 1.1, z: z0 - 3.5,
        yaw: Math.PI / 2, rows: 2, perRow: 5, length: 2.4 });
      P.sandbagStack(b, { x: cx + s * (half + 0.35), y: 1.1, z: z0 + 3.5,
        yaw: Math.PI / 2, rows: 2, perRow: 5, length: 2.4 });
    }
    // 溝の底（砂利敷き）
    b.box({ x: cx, y: 0.03, z: z0, w: half * 2, h: 0.05, d: len,
      mat: 'gravel', surface: SURFACE.GRAVEL, collide: false });
    // 足場板の渡り
    for (const zz of [-5, 0.5, 6]) {
      b.box({ x: cx, y: 1.14, z: z0 + zz, w: half * 2 + 1.4, h: 0.06, d: 0.9,
        mat: 'scaffoldPlank', surface: SURFACE.WOOD });
    }
    floorPlate(b, { x: cx, z: z0 - len / 2 - 1.0, text: '塹壕', sub: '深さ 1.1m / 幅 2.2m',
      accent: HUE.lab, w: 3.0 });
  }

  /* ================= 3. 盛土と稜線 ================= */
  {
    const x0 = cx + W / 2 - 6.0, z0 = cz + 2;
    // 円錐を潰した丘。上に立つと敷地が見渡せる
    const R = 5.2, H = 3.1;
    const g = new THREE.ConeGeometry(R, H, 22, 5);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const t = 0.5 - vy / H;
      if (t > 0.02) {
        const a = Math.atan2(vz, vx);
        const r = R * Math.pow(t, 0.72) * (1 + Math.sin(a * 3.3) * 0.09 + Math.sin(a * 6.1) * 0.05);
        pos.setX(i, Math.cos(a) * r);
        pos.setZ(i, Math.sin(a) * r);
      } else {
        pos.setY(i, vy - H * 0.10);
      }
    }
    g.computeVertexNormals();
    b.mesh('grass', g, { x: x0, y: H / 2, z: z0 });
    // 登れるように段の判定を積む
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const r = R * (1 - (i + 0.5) / steps) * 0.78;
      if (r < 0.3) continue;
      b.physics.addCylinder(x0, H * (i + 0.5) / steps, z0, r, H / (steps * 2), { surface: SURFACE.DIRT });
    }
    // 頂上の目印
    P.sandbagStack(b, { x: x0, y: H * 0.86, z: z0 - 1.4, yaw: 0, rows: 2, perRow: 4, length: 2.0 });
    floorPlate(b, { x: x0, z: z0 - R - 1.2, text: '丘', sub: '高さ 3.1m', accent: HUE.lab, w: 2.2 });
  }

  /* ================= 4. 地面の材質 ================= */
  /*
   * 材質の切り替わりは、板を並べただけだと畳のように見える。
   * 境目を互い違いに食い込ませ、上に実際の粒を撒く。
   */
  {
    const z0 = cz + D / 2 - 5.0;
    const kinds = [
      ['土', 'dirt', SURFACE.DIRT],
      ['草', 'grass', SURFACE.DIRT],
      ['砂利', 'gravel', SURFACE.GRAVEL],
      ['砂', 'sand', SURFACE.SAND],
      ['泥', 'mud', SURFACE.DIRT],
    ];
    const pitch = (W - 3) / kinds.length;
    for (let i = 0; i < kinds.length; i++) {
      const [name, mat, surf] = kinds[i];
      const x = cx - W / 2 + 1.5 + pitch * (i + 0.5);
      b.box({ x, y: 0.05, z: z0, w: pitch - 0.1, h: 0.06, d: 6.4,
        mat, surface: surf, collide: false });
      // 隣へ食い込む舌
      for (let k = 0; k < 4; k++) {
        b.box({
          x: x + pitch / 2 + rand() * 0.5, y: 0.055,
          z: z0 - 2.6 + k * 1.7 + rand() * 0.6,
          w: 0.5 + rand() * 0.9, h: 0.06, d: 0.5 + rand() * 0.8,
          yaw: rand() * 3.14, mat, surface: surf, collide: false,
        });
      }
      // 撒いた粒
      const grains = mat === 'gravel' ? 26 : mat === 'sand' ? 8 : 12;
      for (let k = 0; k < grains; k++) {
        const s = 0.035 + rand() * 0.075;
        b.box({
          x: x + (rand() - 0.5) * (pitch - 0.4), y: 0.06 + s * 0.3,
          z: z0 + (rand() - 0.5) * 6.0,
          w: s, h: s * 0.6, d: s * (0.7 + rand() * 0.6), yaw: rand() * 3.14,
          mat: mat === 'grass' ? 'grassDry' : 'rock', surface: surf, collide: false,
        });
      }
      floorPlate(b, { x, z: z0 - 3.9, text: name, accent: HUE.lab, w: pitch - 0.6 });
    }
    // 水たまり（泥の区画に）
    const px = cx - W / 2 + 1.5 + pitch * 4.5;
    b.cylinder({ x: px, y: 0.055, z: z0 + 1.6, radius: 1.15, height: 0.02, segments: 20,
      mat: 'water', surface: SURFACE.DIRT, collide: false });
    b.cylinder({ x: px, y: 0.052, z: z0 + 1.6, radius: 1.32, height: 0.02, segments: 20,
      mat: 'mud', surface: SURFACE.DIRT, collide: false });
    floorPlate(b, { x: px, z: z0 + 3.2, text: '水たまり', accent: HUE.lab, w: 2.0 });
  }

  // 散らかり（この場を「使われている場所」に見せる）
  P.litter(b, { x: cx - 4, z: cz + 6, radius: 3.4, count: 16 });
  P.rubble(b, { x: cx + 6, y: 0.04, z: cz - 9, radius: 1.6, count: 9 });
  P.aggregatePile(b, { x: cx - W / 2 + 3.4, y: 0.04, z: cz + 3, radius: 1.7, height: 1.2, mat: 'sand' });

  return b;
}
