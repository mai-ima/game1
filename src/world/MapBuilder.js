import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SURFACE } from './Physics.js';
import { PRESETS, SOLIDS } from '../render/MaterialLibrary.js';

/**
 * レベル構築ヘルパ。
 * 「見た目のメッシュ」と「当たり判定のコライダ」を同時に生成し、
 * 同一マテリアルのジオメトリはバッチ結合してドローコールを抑える。
 *
 * 座標系: Y が上。1 単位 = 1 メートル。
 */

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

/** 表面種別ごとの既定マテリアル名 */
const SURFACE_MATERIAL = {
  [SURFACE.CONCRETE]: 'concrete',
  [SURFACE.METAL]: 'paintedMetal',
  [SURFACE.WOOD]: 'wood',
  [SURFACE.DIRT]: 'dirt',
  [SURFACE.SAND]: 'sand',
  [SURFACE.GRAVEL]: 'gravel',
  [SURFACE.FABRIC]: 'fabric',
  [SURFACE.RUBBER]: 'rubber',
};

export class MapBuilder {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./Physics.js').Physics} physics
   * @param {import('../render/MaterialLibrary.js').MaterialLibrary} mats
   */
  constructor(scene, physics, mats) {
    this.scene = scene;
    this.physics = physics;
    this.mats = mats;

    this.root = new THREE.Group();
    this.root.name = 'Level';
    scene.add(this.root);

    /** materialKey -> {geos: [], material, castShadow, receiveShadow} */
    this.batches = new Map();
    /** 個別メッシュ（発光体・ガラスなど、結合しないもの） */
    this.extras = [];
    /** インスタンス描画するプロップ */
    this.instances = new Map();

    this.spawnPoints = { A: [], B: [], FFA: [] };
    this.objectives = [];
    this.lights = [];
    this.bounds = new THREE.Box3();
    this.navHints = [];
    /** 毎フレーム動かすもの（昇降機・可動扉など） */
    this.movers = [];
  }

  /**
   * 動く仕掛けを登録する。
   *
   * バッチに積んだジオメトリは動かせない（1 つのメッシュに溶けているため）。
   * 動くものは独立したメッシュとして持ち、コライダと組にして
   * ここへ預ける。Game が毎フレーム update(t, dt) を呼ぶ。
   *
   * @param {object} o {mesh, collider, update}
   *   mesh     … 動かす見た目（addExtra 済みでなくてよい。ここで足す）
   *   collider … 一緒に動かす当たり判定（無くてもよい）
   *   update   … (t, dt, self) => void。self.setPos(x,y,z) で両方動く
   */
  mover(o) {
    const { mesh, collider = null, update } = o;
    if (mesh && !this.extras.includes(mesh)) this.addExtra(mesh);
    const physics = this.physics;
    const self = {
      mesh, collider, update, t: 0,
      /** 見た目と当たり判定をまとめて動かす */
      /*
       * レベルの枝は行列の自動更新を切ってあるので（_freezeStatic）、
       * 動かしたものは自分で行列を組み直す。
       */
      setPos(x, y, z) {
        if (mesh) { mesh.position.set(x, y, z); mesh.updateMatrixWorld(true); }
        if (collider) physics.moveCollider(collider, x, y, z);
      },
      setYaw(yaw) {
        if (mesh) { mesh.rotation.y = yaw; mesh.updateMatrixWorld(true); }
        if (collider) {
          physics.moveCollider(collider, collider.center.x, collider.center.y, collider.center.z, yaw);
        }
      },
    };
    this.movers.push(self);
    return self;
  }

  /* ================= バッチ ================= */

  _batch(matKey) {
    if (!this.batches.has(matKey)) {
      this.batches.set(matKey, { geos: [], matKey });
    }
    return this.batches.get(matKey);
  }

  _pushGeo(matKey, geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    // 属性を統一
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.getAttribute('uv')) {
      const c = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c * 2), 2));
    }
    g.clearGroups();
    this._batch(matKey).geos.push(g);
    _box.setFromBufferAttribute(g.getAttribute('position'));
    this.bounds.union(_box);
  }

  /**
   * 直方体を追加（ワールドスケールに応じた UV を自動生成）。
   * @param {object} o {x,y,z, w,h,d, yaw, mat, surface, collide, shadow, uvScale, penetration, tag}
   */
  box(o) {
    const {
      x = 0, y = 0, z = 0, w = 1, h = 1, d = 1, yaw = 0, rx = 0, rz = 0,
      mat = 'concrete', surface = SURFACE.CONCRETE,
      collide = true, blocksBullets = true, penetration = 0,
      uvScale = null, tag = null,
    } = o;

    const geo = new THREE.BoxGeometry(w, h, d);
    this._worldUv(geo, uvScale ?? this._matDensity(mat), w, h, d);
    if (rz) geo.rotateZ(rz);
    if (rx) geo.rotateX(rx);
    if (yaw) geo.rotateY(yaw);
    geo.translate(x, y, z);
    this._pushGeo(mat, geo);

    if (collide) {
      this.physics.addBox(x, y, z, w / 2, h / 2, d / 2, yaw, {
        surface, blocksBullets, penetration, tag,
      });
    }
    return this;
  }

  /** 床（薄い箱として扱う。厚み 0.3m で下から抜けない） */
  floor(o) {
    return this.box({ h: 0.3, ...o, y: (o.y ?? 0) - 0.15 });
  }

  /**
   * 壁。start/end で指定でき、厚みと高さを持つ。
   * @param {object} o {x1,z1,x2,z2, h, thickness, y, mat, surface}
   */
  wall(o) {
    const { x1, z1, x2, z2, h = 3.2, thickness = 0.28, y = 0, ...rest } = o;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    return this.box({
      x: (x1 + x2) / 2, y: y + h / 2, z: (z1 + z2) / 2,
      w: thickness, h, d: len, yaw, ...rest,
    });
  }

  /**
   * 出入口付きの壁（ドア/窓の開口を残す）。
   * @param {object} o wall と同じ + {gapStart, gapWidth, gapBottom, gapTop}
   */
  wallWithGap(o) {
    const { x1, z1, x2, z2, h = 3.2, gapStart = 0.4, gapWidth = 1.2, gapBottom = 0, gapTop = 2.15 } = o;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const s = Math.max(0, Math.min(len, gapStart));
    const e = Math.max(s, Math.min(len, gapStart + gapWidth));

    // 開口の手前
    if (s > 0.02) {
      this.wall({ ...o, x1, z1, x2: x1 + ux * s, z2: z1 + uz * s, h });
    }
    // 開口の奥
    if (len - e > 0.02) {
      this.wall({ ...o, x1: x1 + ux * e, z1: z1 + uz * e, x2, z2, h });
    }
    // 開口の下（腰壁 = 窓の場合）
    if (gapBottom > 0.02) {
      this.wall({ ...o, x1: x1 + ux * s, z1: z1 + uz * s, x2: x1 + ux * e, z2: z1 + uz * e, h: gapBottom, y: o.y ?? 0 });
    }
    // 開口の上（まぐさ）
    if (h - gapTop > 0.02) {
      this.wall({
        ...o, x1: x1 + ux * s, z1: z1 + uz * s, x2: x1 + ux * e, z2: z1 + uz * e,
        h: h - gapTop, y: (o.y ?? 0) + gapTop,
      });
    }
    return this;
  }

  /**
   * 開口を複数持つ壁。
   *
   * wallWithGap は開口が 1 つしか開かない。
   * 中層ビルの 1 面には窓が 4〜6 並ぶので、
   * 1 開口ずつ壁を分割して呼ぶと、隣り合う壁が重なって
   * 継ぎ目に段差が出る。ここでまとめて割る。
   *
   * @param {object} o wall と同じ + {gaps: [{start, width, bottom, top}]}
   *   start は壁の始点からの距離、bottom/top は y からの高さ。
   */
  wallWithGaps(o) {
    const { x1, z1, x2, z2, h = 3.2, gaps = [], ...rest } = o;
    const y = o.y ?? 0;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.02) return this;
    const ux = dx / len, uz = dz / len;
    const P = (t) => [x1 + ux * t, z1 + uz * t];

    const list = gaps
      .map((g) => ({
        s: Math.max(0, Math.min(len, g.start)),
        e: Math.max(0, Math.min(len, g.start + g.width)),
        bottom: g.bottom ?? 0,
        top: g.top ?? h,
      }))
      .filter((g) => g.e - g.s > 0.02)
      .sort((a, c) => a.s - c.s);

    let cursor = 0;
    for (const g of list) {
      const s = Math.max(cursor, g.s);
      if (s >= g.e) continue;
      // 開口の手前（無開口の壁）
      if (s - cursor > 0.02) {
        const [ax, az] = P(cursor), [bx, bz] = P(s);
        this.wall({ ...rest, x1: ax, z1: az, x2: bx, z2: bz, h, y });
      }
      const [gx1, gz1] = P(s), [gx2, gz2] = P(g.e);
      // 腰壁
      if (g.bottom > 0.02) {
        this.wall({ ...rest, x1: gx1, z1: gz1, x2: gx2, z2: gz2, h: g.bottom, y });
      }
      // まぐさ
      if (h - g.top > 0.02) {
        this.wall({ ...rest, x1: gx1, z1: gz1, x2: gx2, z2: gz2, h: h - g.top, y: y + g.top });
      }
      cursor = g.e;
    }
    if (len - cursor > 0.02) {
      const [ax, az] = P(cursor);
      this.wall({ ...rest, x1: ax, z1: az, x2, z2, h, y });
    }
    return this;
  }

  /**
   * 階段。
   * @param {object} o {x,y,z, width, rise, run, steps, yaw, mat, surface}
   */
  stairs(o) {
    const {
      x = 0, y = 0, z = 0, width = 1.6, rise = 0.19, run = 0.28,
      steps = 10, yaw = 0, mat = 'concrete', surface = SURFACE.CONCRETE,
    } = o;
    for (let i = 0; i < steps; i++) {
      const sy = y + rise * (i + 0.5);
      const sz = z - run * (i + 0.5);
      // 段を回転
      const rx = Math.sin(yaw) * (sz - z);
      const rz = Math.cos(yaw) * (sz - z);
      this.box({
        x: x + rx, y: sy, z: z + rz,
        w: width, h: rise, d: run, yaw, mat, surface,
      });
    }
    return this;
  }

  /** 傾斜路 */
  ramp(o) {
    const { x = 0, y = 0, z = 0, width = 2.0, length = 4.0, height = 1.2, yaw = 0, steps = 12, mat = 'concrete', surface = SURFACE.CONCRETE } = o;
    const rise = height / steps;
    const run = length / steps;
    for (let i = 0; i < steps; i++) {
      const sy = y + rise * (i + 0.5);
      const off = -run * (i + 0.5);
      this.box({
        x: x + Math.sin(yaw) * off, y: sy, z: z + Math.cos(yaw) * off,
        w: width, h: rise * 1.05, d: run * 1.05, yaw, mat, surface,
      });
    }
    return this;
  }

  /** 円柱（柱・パイプ） */
  cylinder(o) {
    const {
      x = 0, y = 0, z = 0, radius = 0.2, height = 3, segments = 14,
      mat = 'concrete', surface = SURFACE.CONCRETE, collide = true,
    } = o;
    const geo = new THREE.CylinderGeometry(radius, radius, height, segments);
    this._cylUv(geo, radius, height, this._matDensity(mat));
    geo.translate(x, y + height / 2, z);
    this._pushGeo(mat, geo);
    if (collide) {
      this.physics.addBox(x, y + height / 2, z, radius * 0.88, height / 2, radius * 0.88, 0, { surface });
    }
    return this;
  }

  /** 任意ジオメトリ（コライダは別途 box で指定） */
  mesh(matKey, geo, transform = {}) {
    const g = geo.clone();
    if (transform.sx || transform.sy || transform.sz) g.scale(transform.sx ?? 1, transform.sy ?? 1, transform.sz ?? 1);
    if (transform.rx) g.rotateX(transform.rx);
    if (transform.ry) g.rotateY(transform.ry);
    if (transform.rz) g.rotateZ(transform.rz);
    g.translate(transform.x ?? 0, transform.y ?? 0, transform.z ?? 0);
    this._pushGeo(matKey, g);
    return this;
  }

  /** 結合しない個別メッシュ（ガラス・発光体など） */
  addExtra(mesh, collider = null) {
    this.root.add(mesh);
    this.extras.push(mesh);
    if (collider) {
      this.physics.addBox(
        collider.x, collider.y, collider.z,
        collider.hx, collider.hy, collider.hz, collider.yaw || 0,
        { surface: collider.surface || SURFACE.GLASS, blocksBullets: collider.blocksBullets !== false, penetration: collider.penetration ?? 0 }
      );
    }
    return this;
  }

  /**
   * 点光源を追加する。
   *
   * ここでは実体を作らず、定義だけを貯める。
   * 実際に光らせるのは LightPool で、カメラの近くにある数灯だけを
   * 実体の PointLight に割り当てる。
   * マップの光源をすべて実体で置くと、three は画素ごとに
   * その数だけ減衰と BRDF を計算し、描画時間の半分を持っていく。
   */
  light(o) {
    const { x, y, z, color = 0xffd9a0, intensity = 3, distance = 9, decay = 2 } = o;
    this.lights.push({ x, y, z, color, intensity, distance, decay });
    return this;
  }

  /** スポーン地点 */
  spawn(team, x, y, z, yaw = 0) {
    (this.spawnPoints[team] ??= []).push({ pos: new THREE.Vector3(x, y, z), yaw });
    this.spawnPoints.FFA.push({ pos: new THREE.Vector3(x, y, z), yaw });
    return this;
  }

  /** 目標地点（爆破・支配など） */
  objective(id, x, y, z, radius = 3.2) {
    this.objectives.push({ id, pos: new THREE.Vector3(x, y, z), radius });
    return this;
  }

  /* ================= UV ================= */

  _matDensity(matKey) {
    // MaterialLibrary のプリセットが持つワールド密度（1m あたりのタイル数）
    return PRESETS[matKey]?.repeat ?? 0.42;
  }

  /**
   * BoxGeometry にワールドスケール UV を貼る。
   * 面ごとに投影軸が異なるので、six-face の順序（+X,-X,+Y,-Y,+Z,-Z）に沿って処理する。
   */
  _worldUv(geo, density, w, h, d) {
    const uv = geo.getAttribute('uv');
    const sizes = [
      [d, h], [d, h],   // +X, -X
      [w, d], [w, d],   // +Y, -Y
      [w, h], [w, h],   // +Z, -Z
    ];
    for (let f = 0; f < 6; f++) {
      const [su, sv] = sizes[f];
      const su2 = su * density, sv2 = sv * density;
      for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i;
        uv.setXY(idx, uv.getX(idx) * su2, uv.getY(idx) * sv2);
      }
    }
    uv.needsUpdate = true;
  }

  _cylUv(geo, radius, height, density) {
    const uv = geo.getAttribute('uv');
    const circ = 2 * Math.PI * radius * density;
    const hh = height * density;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * hh);
    }
    uv.needsUpdate = true;
  }

  /* ================= 完成 ================= */

  /**
   * バッチを結合して実際の Mesh を生成する。
   * 必ずレベル構築の最後に 1 度だけ呼ぶ。
   */
  /**
   * バッチを 1 つ仕上げる。finalize から順に呼ばれる。
   * @returns {boolean} 何か作ったか
   */
  _finalizeBatch(matKey, batch) {
    if (batch.geos.length === 0) return false;
    const merged = BufferGeometryUtils.mergeGeometries(batch.geos, false);
    if (!merged) {
      console.warn(`バッチ結合に失敗: ${matKey}`);
      return false;
    }
    merged.computeBoundingSphere();
    // repeat を 1 にしたマテリアルを使う（UV 側でワールドスケール済み）。
    // テクスチャ無しの単色マテリアル（brass / copper 等）も同じキー空間で扱う。
    const material = PRESETS[matKey]
      ? this.mats.get(matKey, { repeat: [1, 1], normalScale: new THREE.Vector2(0.72, 0.72) })
      : this.mats.solid(matKey);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `batch:${matKey}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    // 元ジオメトリを解放
    for (const g of batch.geos) g.dispose();
    return true;
  }

  /**
   * フレームを跨ぎながら仕上げる。
   *
   * mats.get() はテクスチャをその場で合成する（512×512 を 3 枚、
   * さらに法線を作るのに 9 タップの微分を全画素）。
   * このマップは 60 種類以上の材質を使うので、まとめてやると
   * メインスレッドが数秒止まり、ローディング画面ごと固まる。
   * 兵士の生成は 1 体ずつフレームを跨いでいるのに、
   * それより重いこの工程だけ一息で走っていた。
   *
   * @param {(p:number)=>void} onProgress 0..1
   * @param {()=>Promise} yieldFrame フレームを譲る関数
   */
  async finalizeAsync(onProgress = () => {}, yieldFrame = null) {
    const keys = [...this.batches.keys()];
    let i = 0;
    for (const matKey of keys) {
      this._finalizeBatch(matKey, this.batches.get(matKey));
      i++;
      onProgress(i / Math.max(1, keys.length));
      // 1 材質ごとに描画の順番を返す（数十 ms ずつに割れる）
      if (yieldFrame) await yieldFrame();
    }
    this.batches.clear();
    this._finalizeRest();
    return this.root;
  }

  finalize() {
    for (const [matKey, batch] of this.batches) this._finalizeBatch(matKey, batch);
    this.batches.clear();
    return this._finalizeRest();
  }

  /** インスタンス群など、バッチ以外の仕上げ */
  _finalizeRest() {

    // インスタンス群を生成
    for (const [key, list] of this.instances) {
      const { geo, matKey, items } = list;
      const material = PRESETS[matKey]
        ? this.mats.get(matKey, { repeat: [1, 1] })
        : this.mats.solid(matKey);
      const inst = new THREE.InstancedMesh(geo, material, items.length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      const m = new THREE.Matrix4();
      items.forEach((it, i) => {
        m.compose(it.pos, it.quat, it.scale);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.name = `inst:${key}`;
      this.root.add(inst);
    }
    this.instances.clear();
    this._freezeStatic();

    return this.root;
  }

  /**
   * 動かないものの行列更新を止める。
   *
   * three は毎フレーム、シーンの全オブジェクトを辿って
   * 位置・回転・拡大から行列を組み直し、親の行列と掛け合わせる。
   * レベルは 190 個ほどのメッシュを持つが、そのほとんどは
   * 置いたきり一度も動かない。計算しても結果は毎回同じ。
   *
   * 根に matrixWorldAutoUpdate = false を立てると、
   * three はこの枝へ降りてこなくなる。190 個ぶんの
   * 行列合成と再帰がまるごと消える。
   *
   * 動く仕掛け（mover）だけは別で、setPos / setYaw を通ったときに
   * 自分で行列を組み直す。
   */
  _freezeStatic() {
    const moving = new Set(this.movers.map((m) => m.mesh).filter(Boolean));
    this.root.traverse((o) => {
      if (o === this.root || moving.has(o)) return;
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    this.root.updateMatrixWorld(true);
    // ここから先、この枝はシーンの巡回対象から外れる
    this.root.matrixWorldAutoUpdate = false;
  }

  /** インスタンス配置を登録 */
  instance(key, geo, matKey, pos, quat = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1)) {
    if (!this.instances.has(key)) this.instances.set(key, { geo, matKey, items: [] });
    this.instances.get(key).items.push({ pos: pos.clone(), quat: quat.clone(), scale: scale.clone() });
    return this;
  }

  /*
   * 後始末。
   *
   * ジオメトリはこのレベル専用なので返す。
   * マテリアルとテクスチャは工房（MaterialLibrary）が
   * 名前で使い回しているため、ここでは触らない。
   * 触ると、次のマップが同じ材質を要求したときに
   * 破棄済みのものを掴んで真っ黒になる。
   */
  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      o.dispose?.();        // InstancedMesh 自身が持つ資源
    });
    this.movers.length = 0;
    this.extras.length = 0;
    this.physics.clear();
  }
}
