import * as THREE from 'three';
import { SURFACE } from '../../Physics.js';
import * as P from '../../Props.js';
import * as B from '../../Buildings.js';
import { label, plate, floorPlate, apron, HUE, FACE_S, FACE_N } from './common.js';

/**
 * ギミック試験場。
 *
 * 動く仕掛けの置き場。思い付いたものをここへ置いて、
 * 実際に乗ったり潜ったりして「遊べるか」を確かめる。
 *
 * 動くものはバッチに積めない（1 つのメッシュに溶けてしまう）ので、
 * 独立したメッシュとコライダの組にして b.mover へ預ける。
 * setPos を呼べば見た目と当たり判定が一緒に動く。
 */

/** 動く板を 1 枚作る。位置は update から setPos で決める */
function slab(b, o) {
  const { x, y, z, w, h, d, mat = 'diamondPlate', surface = SURFACE.METAL } = o;
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, b.mats.get(mat, { repeat: [w * 0.6, d * 0.6] }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const col = b.physics.addBox(x, y, z, w / 2, h / 2, d / 2, 0, { surface });
  return { mesh, collider: col };
}

export function sectionGizmos(b, cx, cz) {
  apron(b, { x: cx, z: cz, w: 46, d: 34, mat: 'concreteRaw' });
  label(b, { x: cx, y: 2.6, z: cz + 17.6, yaw: FACE_N,
    text: 'ギミック試験場', sub: 'MOVING PARTS', accent: HUE.gizmo, w: 4.6 });

  /* ---- 1. 昇降機（上下する床） ---- */
  {
    const x = cx - 18, z = cz + 8, lo = 0.15, hi = 5.4;
    // 昇降路の枠（4 隅の柱とガイド）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box({ x: x + sx * 1.8, y: hi / 2 + 0.6, z: z + sz * 1.8, w: 0.16, h: hi + 1.2, d: 0.16,
        mat: 'galvanized', surface: SURFACE.METAL });
    }
    b.box({ x, y: hi + 1.3, z, w: 3.9, h: 0.2, d: 3.9, mat: 'galvanized', surface: SURFACE.METAL });
    // 上の降り口
    b.box({ x: x + 3.2, y: hi - 0.1, z, w: 2.6, h: 0.2, d: 3.4, mat: 'diamondPlate', surface: SURFACE.METAL });
    P.railing(b, { x1: x + 4.4, z1: z - 1.7, x2: x + 4.4, z2: z + 1.7, y: hi, height: 1.05 });

    const car = slab(b, { x, y: lo, z, w: 3.2, h: 0.3, d: 3.2 });
    b.mover({
      ...car,
      update(t, dt, self) {
        // 上下に往復。上下端で 2 秒止まる
        const period = 12;
        const p = (t % period) / period;
        let k;
        if (p < 0.08) k = 0;
        else if (p < 0.42) k = (p - 0.08) / 0.34;
        else if (p < 0.58) k = 1;
        else if (p < 0.92) k = 1 - (p - 0.58) / 0.34;
        else k = 0;
        // 端で急に止まらないよう滑らかに
        const s = k * k * (3 - 2 * k);
        self.setPos(x, lo + (hi - lo) * s, z);
      },
    });
    floorPlate(b, { x, z: z + 3.0, text: '昇降機', sub: '0.15 → 5.4m / 往復', accent: HUE.gizmo, w: 3.0 });
  }

  /* ---- 2. 横に滑る扉 ---- */
  {
    const x = cx - 8, z = cz + 6;
    // 開口を持つ壁
    b.wallWithGap({ x1: x - 4, z1: z, x2: x + 4, z2: z, h: 3.2, thickness: 0.3,
      gapStart: 2.6, gapWidth: 2.8, gapTop: 2.6, mat: 'concreteBlock', surface: SURFACE.CONCRETE });
    // 上のレール
    b.box({ x, y: 2.75, z, w: 8, h: 0.14, d: 0.16, mat: 'galvanized', surface: SURFACE.METAL, collide: false });

    const door = slab(b, { x: x - 1.4, y: 1.3, z, w: 2.8, h: 2.5, d: 0.14, mat: 'paintedMetal' });
    b.mover({
      ...door,
      update(t, dt, self) {
        const period = 9;
        const p = (t % period) / period;
        let k;
        if (p < 0.10) k = 0;
        else if (p < 0.35) k = (p - 0.10) / 0.25;
        else if (p < 0.60) k = 1;
        else if (p < 0.85) k = 1 - (p - 0.60) / 0.25;
        else k = 0;
        const s = k * k * (3 - 2 * k);
        self.setPos(x - 1.4 - s * 2.85, 1.3, z);
      },
    });
    floorPlate(b, { x, z: z + 2.2, text: '横引き扉', sub: '開閉 / 挟まれ判定', accent: HUE.gizmo, w: 3.0 });
  }

  /* ---- 3. 回る足場 ---- */
  {
    const x = cx + 1, z = cz + 7;
    b.cylinder({ x, y: 0, z, radius: 0.5, height: 0.9, segments: 14, mat: 'gunMetal', surface: SURFACE.METAL });
    const arm = slab(b, { x, y: 1.05, z, w: 7.0, h: 0.22, d: 1.6, mat: 'scaffoldPlank', surface: SURFACE.WOOD });
    b.mover({
      ...arm,
      update(t, dt, self) { self.setYaw(t * 0.35); },
    });
    floorPlate(b, { x, z: z + 4.4, text: '回転足場', sub: '角速度 0.35 rad/s', accent: HUE.gizmo, w: 3.0 });
  }

  /* ---- 4. 往復する床（水平） ---- */
  {
    const x = cx + 11, z = cz + 7, span = 7;
    // 渡る先の台
    for (const s of [-1, 1]) {
      b.box({ x: x + s * (span / 2 + 2.2), y: 0.6, z, w: 3.0, h: 1.2, d: 3.4,
        mat: 'concrete', surface: SURFACE.CONCRETE });
    }
    const car = slab(b, { x, y: 1.15, z, w: 2.6, h: 0.24, d: 3.0 });
    b.mover({
      ...car,
      update(t, dt, self) {
        const s = Math.sin(t * 0.5) * 0.5 + 0.5;
        const e = s * s * (3 - 2 * s);
        self.setPos(x - span / 2 + span * e, 1.15, z);
      },
    });
    floorPlate(b, { x, z: z + 2.6, text: '往復する床', sub: `振幅 ${span}m`, accent: HUE.gizmo, w: 3.0 });
  }

  /* ---- 5. 振り子（当たると押される想定の障害） ---- */
  {
    const x = cx + 20, z = cz + 7;
    for (const sx of [-1, 1]) {
      b.box({ x: x + sx * 2.4, y: 2.6, z, w: 0.18, h: 5.2, d: 0.18, mat: 'galvanized', surface: SURFACE.METAL });
    }
    b.box({ x, y: 5.1, z, w: 5.2, h: 0.18, d: 0.18, mat: 'galvanized', surface: SURFACE.METAL, collide: false });
    const bob = slab(b, { x, y: 1.6, z, w: 1.0, h: 1.0, d: 1.0, mat: 'rustedMetal' });
    b.mover({
      ...bob,
      update(t, dt, self) {
        const a = Math.sin(t * 1.1) * 0.7;         // 振れ角
        const L = 3.4;
        self.setPos(x + Math.sin(a) * L, 5.0 - Math.cos(a) * L, z);
      },
    });
    floorPlate(b, { x, z: z + 2.2, text: '振り子', sub: '周期 5.7s / 振れ 40°', accent: HUE.gizmo, w: 2.8 });
  }

  /* ---- 6. 明滅する光（点滅・故障灯の見え方） ---- */
  {
    const x = cx - 18, z = cz - 6;
    b.box({ x, y: 1.6, z, w: 4.0, h: 3.2, d: 0.3, mat: 'paintedWall', surface: SURFACE.CONCRETE });
    const g = new THREE.BoxGeometry(1.2, 0.06, 0.3);
    const m = new THREE.Mesh(g, b.mats.emissive(0xdfe8f2, 5));
    m.position.set(x, 2.6, z + 0.6);
    b.addExtra(m);
    b.mover({
      mesh: m,
      update(t) {
        // 蛍光灯の切れかけ。不規則に落ちる
        const n = Math.sin(t * 13.1) * Math.sin(t * 7.3) * Math.sin(t * 3.1);
        const on = n > -0.35 ? 1 : 0.06;
        m.material.emissiveIntensity = 5 * on;
      },
    });
    floorPlate(b, { x, z: z - 1.4, text: '明滅する灯', sub: '切れかけの蛍光灯', accent: HUE.gizmo, w: 3.0 });
  }

  /* ---- 7. 開き戸（押して通れるかの確認用に開閉させる） ---- */
  {
    const x = cx - 8, z = cz - 6;
    b.wallWithGap({ x1: x - 3, z1: z, x2: x + 3, z2: z, h: 3.0, thickness: 0.26,
      gapStart: 2.1, gapWidth: 0.95, gapTop: 2.1, mat: 'plaster', surface: SURFACE.CONCRETE });
    const leaf = slab(b, { x: x - 0.42, y: 1.05, z, w: 0.95, h: 2.05, d: 0.06, mat: 'woodDark', surface: SURFACE.WOOD });
    const hx = x - 0.9;
    b.mover({
      ...leaf,
      update(t, dt, self) {
        const a = (Math.sin(t * 0.6) * 0.5 + 0.5) * 1.5;    // 0〜86 度
        // 蝶番を中心に回す
        self.setPos(hx + Math.cos(a) * 0.475, 1.05, z - Math.sin(a) * 0.475);
        self.setYaw(-a);
      },
    });
    floorPlate(b, { x, z: z - 1.6, text: '開き戸', sub: '蝶番まわりの回転', accent: HUE.gizmo, w: 2.8 });
  }

  /* ---- 8. 崩れる足場（乗ると落ちる想定。ここでは周期で落ちる） ---- */
  {
    const x = cx + 2, z = cz - 7;
    for (let i = 0; i < 4; i++) {
      const px = x + i * 2.4;
      const p = slab(b, { x: px, y: 1.2, z, w: 2.0, h: 0.2, d: 2.0, mat: 'scaffoldPlank', surface: SURFACE.WOOD });
      b.mover({
        ...p,
        update(t, dt, self) {
          const phase = (t * 0.5 + i * 0.25) % 1;
          // 3/4 の間は所定の位置、残りで落ちて戻る
          const drop = phase < 0.75 ? 0 : Math.sin((phase - 0.75) / 0.25 * Math.PI) * 3.0;
          self.setPos(px, 1.2 - drop, z);
        },
      });
    }
    for (const s of [-1, 1]) {
      b.box({ x: x + (s < 0 ? -2.2 : 9.4), y: 0.6, z, w: 2.2, h: 1.2, d: 2.6,
        mat: 'concrete', surface: SURFACE.CONCRETE });
    }
    floorPlate(b, { x: x + 3.6, z: z - 1.8, text: '崩れる足場', sub: '順に抜ける', accent: HUE.gizmo, w: 3.2 });
  }

  /* ---- 9. 空き枠（新しい仕掛けを置く場所） ---- */
  for (let i = 0; i < 3; i++) {
    const x = cx + 13 + i * 5.5, z = cz - 8;
    b.box({ x, y: 0.016, z, w: 4.6, h: 0.03, d: 4.6, mat: 'asphalt', surface: SURFACE.CONCRETE, collide: false });
    for (const [ox, oz, ww, dd] of [[0, -2.3, 4.6, 0.14], [0, 2.3, 4.6, 0.14], [-2.3, 0, 0.14, 4.6], [2.3, 0, 0.14, 4.6]]) {
      b.box({ x: x + ox, y: 0.019, z: z + oz, w: ww, h: 0.03, d: dd,
        mat: 'lineYellow', surface: SURFACE.CONCRETE, collide: false });
    }
    floorPlate(b, { x, z, text: `空き枠 ${i + 1}`, sub: '試作を置く', accent: HUE.gizmo, w: 2.6 });
  }
  label(b, { x: cx + 18.5, y: 2.0, z: cz - 12, yaw: FACE_S,
    text: '新しい仕掛けはここへ', accent: HUE.gizmo, w: 4.0 });
}
