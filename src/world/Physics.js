import * as THREE from 'three';

/*
 * 段差を昇るときに試す持ち上げ量（stepHeight に対する比）。
 *
 * 小さい方から試し、通れたところで確定する。
 * 一気に stepHeight まで持ち上げると、低い段でも
 * 「stepHeight + 身長」ぶんの頭上空間を要求してしまう。
 */
const STEP_TRIES = [0.32, 0.58, 1.0];

/**
 * FPS 向けの軽量コリジョンシステム。
 *
 * - 静的コライダは AABB もしくは Y 軸回転ボックス (OBB) として保持
 * - ブロードフェーズは一様グリッド（セルサイズ既定 4m）
 * - プレイヤーは垂直カプセル（実装上は円柱 + 軸別解決 + 段差乗り越え）
 * - 弾はレイキャスト（スラブ法）で解決
 */

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
// raycast 専用。呼び出し側と共有しないことで引数の破壊を防ぐ。
const _rayO = new THREE.Vector3();
const _rayD = new THREE.Vector3();
// _rayBox 専用（raycast のループ内から呼ばれるため _v3 とは分ける）
const _rbLocal = new THREE.Vector3();
// 視線判定専用
const _losDir = new THREE.Vector3();
// 破片・薬莢の積分専用
const _dbMove = new THREE.Vector3();
const _dbDir = new THREE.Vector3();

/** 表面種別（着弾エフェクト・足音の切り替えに使う） */
export const SURFACE = {
  CONCRETE: 'concrete', METAL: 'metal', WOOD: 'wood', DIRT: 'dirt',
  SAND: 'sand', GLASS: 'glass', FABRIC: 'fabric', WATER: 'water',
  FLESH: 'flesh', GRAVEL: 'gravel', RUBBER: 'rubber',
};

export class Collider {
  /**
   * @param {THREE.Vector3} center 中心座標
   * @param {THREE.Vector3} half   半径ベクトル（ローカル）
   * @param {number} yaw           Y 軸回転（ラジアン）
   * @param {object} opt           {surface, blocksBullets, blocksMovement, breakable, mesh}
   */
  constructor(center, half, yaw = 0, opt = {}) {
    this.center = center.clone();
    this.half = half.clone();
    this.yaw = yaw;
    this.rotated = Math.abs(yaw) > 1e-4;
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
    this.surface = opt.surface || SURFACE.CONCRETE;
    this.blocksBullets = opt.blocksBullets !== false;
    this.blocksMovement = opt.blocksMovement !== false;
    this.penetration = opt.penetration ?? 0;   // 0=貫通不可, 1=薄板（貫通で減衰）
    this.mesh = opt.mesh || null;
    this.tag = opt.tag || null;
    this.active = true;

    // ワールド AABB（ブロードフェーズ用）
    this.min = new THREE.Vector3();
    this.max = new THREE.Vector3();
    this._updateBounds();
  }

  _updateBounds() {
    if (!this.rotated) {
      this.min.copy(this.center).sub(this.half);
      this.max.copy(this.center).add(this.half);
    } else {
      const ex = Math.abs(this.cos) * this.half.x + Math.abs(this.sin) * this.half.z;
      const ez = Math.abs(this.sin) * this.half.x + Math.abs(this.cos) * this.half.z;
      this.min.set(this.center.x - ex, this.center.y - this.half.y, this.center.z - ez);
      this.max.set(this.center.x + ex, this.center.y + this.half.y, this.center.z + ez);
    }
  }

  /*
   * 回転の向きは three に合わせる。
   *
   * BufferGeometry.rotateY(yaw) が行う local → world は
   *     x' =  x·cos + z·sin
   *     z' = -x·sin + z·cos
   * なので、world → local はその逆行列（転置）でなければならない。
   *
   * ここは以前 2 つの式が入れ替わっており、回転したコライダだけが
   * yaw の 2 倍ぶん回った位置に判定を持っていた。
   * 斜めの壁や向きを変えて置いたコンテナで
   * 「見えているのに弾が抜ける」「何も無い所で止まる」が起きていた原因。
   * yaw = 0 では両者が一致するため、正面向きの箱では表面化しなかった。
   */

  /** ワールド座標 → ボックスローカル座標 */
  toLocal(p, out) {
    out.copy(p).sub(this.center);
    if (this.rotated) {
      const x = out.x * this.cos - out.z * this.sin;
      const z = out.x * this.sin + out.z * this.cos;
      out.x = x; out.z = z;
    }
    return out;
  }

  /** ワールド方向 → ボックスローカル方向（平行移動を伴わない） */
  dirToLocal(d, out) {
    out.copy(d);
    if (this.rotated) {
      const x = out.x * this.cos - out.z * this.sin;
      const z = out.x * this.sin + out.z * this.cos;
      out.x = x; out.z = z;
    }
    return out;
  }

  /** ボックスローカル方向 → ワールド方向 */
  dirToWorld(d, out) {
    out.copy(d);
    if (this.rotated) {
      const x = out.x * this.cos + out.z * this.sin;
      const z = -out.x * this.sin + out.z * this.cos;
      out.x = x; out.z = z;
    }
    return out;
  }
}

export class Physics {
  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.colliders = [];
    this.grid = new Map();
    this.gravity = -19.6;   // ゲーム的に重めの重力（COD 系の落下感）
  }

  /* ================= 構築 ================= */

  /**
   * ボックスコライダを追加。
   * @returns {Collider}
   */
  addBox(cx, cy, cz, hx, hy, hz, yaw = 0, opt = {}) {
    const c = new Collider(_v1.set(cx, cy, cz), _v2.set(hx, hy, hz), yaw, opt);
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  /**
   * 円柱を箱で近似して置く。
   *
   * 箱ひとつで囲むと、角が半径の √2 倍まで張り出す。
   * タンクやドラム缶では、見た目には何も無い空中で弾が止まる
   * 「見えない壁」になってしまう。
   * 角が円周にちょうど乗る大きさにし、半径が大きいものは
   * 45 度ずらした 2 枚を重ねて八角形に近づける。
   *
   * @returns {Collider} 主となるコライダ
   */
  addCylinder(cx, cy, cz, r, hy, opt = {}) {
    const s = r * Math.SQRT1_2;
    const main = this.addBox(cx, cy, cz, s, hy, s, 0, opt);
    // 細いものは 1 枚で十分（辺の中央の欠けが 13cm 以下に収まる）
    if (r > 0.45) this.addBox(cx, cy, cz, s, hy, s, Math.PI / 4, opt);
    return main;
  }

  /** Mesh (BoxGeometry 前提) からコライダを生成 */
  addFromMesh(mesh, opt = {}) {
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const size = _v1.copy(bb.max).sub(bb.min);
    const localCenter = _v2.copy(bb.max).add(bb.min).multiplyScalar(0.5);

    const worldCenter = localCenter.clone().applyMatrix4(mesh.matrixWorld);
    const scale = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    mesh.matrixWorld.decompose(new THREE.Vector3(), quat, scale);
    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');

    return this.addBox(
      worldCenter.x, worldCenter.y, worldCenter.z,
      Math.abs(size.x * scale.x) / 2, Math.abs(size.y * scale.y) / 2, Math.abs(size.z * scale.z) / 2,
      euler.y, { mesh, ...opt }
    );
  }

  /**
   * コライダを動かす。
   *
   * 位置を書き換えるだけでは当たり判定は付いてこない。
   * ブロードフェーズの格子に登録済みなので、
   * 元の升目から抜いて、新しい升目へ入れ直す必要がある。
   *
   * 昇降機や可動扉のように「動くのに当たる」ものはこれを通す。
   */
  moveCollider(c, x, y, z, yaw = c.yaw) {
    this._remove(c);
    c.center.set(x, y, z);
    if (yaw !== c.yaw) {
      c.yaw = yaw;
      c.rotated = Math.abs(yaw) > 1e-4;
      c.cos = Math.cos(yaw);
      c.sin = Math.sin(yaw);
    }
    c._updateBounds();
    this._insert(c);
    return c;
  }

  _cellKey(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  _remove(c) {
    const cs = this.cellSize;
    const x0 = Math.floor(c.min.x / cs), x1 = Math.floor(c.max.x / cs);
    const z0 = Math.floor(c.min.z / cs), z1 = Math.floor(c.max.z / cs);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const arr = this.grid.get(this._cellKey(x, z));
        if (!arr) continue;
        const i = arr.indexOf(c);
        if (i >= 0) arr.splice(i, 1);
      }
    }
  }

  _insert(c) {
    const cs = this.cellSize;
    const x0 = Math.floor(c.min.x / cs), x1 = Math.floor(c.max.x / cs);
    const z0 = Math.floor(c.min.z / cs), z1 = Math.floor(c.max.z / cs);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = this._cellKey(x, z);
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(c);
      }
    }
  }

  /** 指定 AABB と重なる可能性のあるコライダを集める */
  query(min, max, out = []) {
    out.length = 0;
    const cs = this.cellSize;
    const x0 = Math.floor(min.x / cs), x1 = Math.floor(max.x / cs);
    const z0 = Math.floor(min.z / cs), z1 = Math.floor(max.z / cs);
    const seen = this._seen ??= new Set();
    seen.clear();
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const arr = this.grid.get(this._cellKey(x, z));
        if (!arr) continue;
        for (const c of arr) {
          if (!c.active || seen.has(c)) continue;
          seen.add(c);
          if (c.max.x < min.x || c.min.x > max.x) continue;
          if (c.max.y < min.y || c.min.y > max.y) continue;
          if (c.max.z < min.z || c.min.z > max.z) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  clear() {
    this.colliders.length = 0;
    this.grid.clear();
  }

  /* ================= キャラクタ移動 ================= */

  /**
   * 円柱状のキャラクタを移動させ、衝突を解決する。
   * @param {THREE.Vector3} pos    足元の位置（in/out）
   * @param {number} radius
   * @param {number} height
   * @param {THREE.Vector3} delta  このフレームの移動量
   * @param {object} opt {stepHeight}
   * @returns {{grounded:boolean, hitWall:boolean, groundY:number, wallNormal:THREE.Vector3|null}}
   */
  moveCharacter(pos, radius, height, delta, opt = {}) {
    const stepHeight = opt.stepHeight ?? 0.42;
    const result = { grounded: false, hitWall: false, groundY: -Infinity, wallNormal: null, ceiling: false };

    // ---- Y 軸（重力・ジャンプ）----
    if (delta.y !== 0) {
      pos.y += delta.y;
      const r = this._resolveY(pos, radius, height, delta.y);
      if (r.hit) {
        if (delta.y < 0) { result.grounded = true; result.groundY = r.y; result.surface = r.surface; }
        else result.ceiling = true;
      }
    }

    // ---- 水平（X → Z の順で軸別解決、段差乗り越え付き）----
    const tryAxis = (axis, amount) => {
      if (amount === 0) return;
      const before = pos[axis];
      pos[axis] += amount;
      const hit = this._resolveAxis(pos, radius, height, axis, amount);
      if (hit) {
        /*
         * 段差を昇れるか試す。
         *
         * 以前は必ず stepHeight（42cm）ぶん持ち上げてから重なりを見ていた。
         * 蹴上げ 17cm の階段でも 42cm 持ち上がるので、
         * 頭上に「42cm + 身長 1.8m」＝ 2.22m の空きが要ることになる。
         * 上階の床が張り出した階段室では、この余裕が取れず、
         * 数段目から先へ一歩も進めなくなっていた
         * （実測: 3.5m 上がるはずの階段で 1.14m しか上がらず、
         *  300 フレーム中 268 フレームが停止）。
         *
         * 実際に必要なのは段の高さぶんだけ。低い方から順に試して、
         * 通れたところで止める。42cm の段は今までどおり昇れる。
         */
        const savedY = pos.y;
        let climbed = false;
        for (const f of STEP_TRIES) {
          const lift = stepHeight * f;
          pos.y = savedY + lift;
          if (this._overlaps(pos, radius, height)) continue;
          // 昇った先で地面があるか確認（無ければ次を試す）
          const drop = this._groundBelow(pos, radius, lift + 0.06);
          if (drop === null || drop - savedY > stepHeight + 0.01) continue;
          pos.y = drop;
          climbed = true;
          break;
        }
        if (climbed) return;
        pos.y = savedY;
        pos[axis] = before;
        result.hitWall = true;
      }
    };
    tryAxis('x', delta.x);
    tryAxis('z', delta.z);

    // 接地判定（わずかに下を見る）
    if (!result.grounded && delta.y <= 0) {
      const g = this._groundBelow(pos, radius, 0.09);
      if (g !== null && pos.y - g < 0.09) {
        result.grounded = true;
        result.groundY = g;
        pos.y = g;
      }
    }
    return result;
  }

  _bounds(pos, radius, height, min, max) {
    min.set(pos.x - radius, pos.y, pos.z - radius);
    max.set(pos.x + radius, pos.y + height, pos.z + radius);
  }

  /**
   * その位置・その寸法で立てるだけの空間が空いているかを調べる。
   *
   * skin は判定を内側へ縮める量（メートル）。これが無いと、
   * 接地しているキャラクタは足元が床の上面と厳密に一致するため
   * （move() が pos.y を地面の高さへスナップする）、
   * 自分が乗っている床そのものと接触していると判定されてしまう。
   * その結果 _blockedAbove() が常に真になり、
   * 「しゃがんだら二度と立ち上がれない」という不具合になっていた。
   *
   * @param {THREE.Vector3} pos 足元の位置
   * @param {number} radius 円柱半径
   * @param {number} height 全高
   * @param {number} skin 判定を縮める余裕
   */
  _overlaps(pos, radius, height, skin = 0.03) {
    const r = Math.max(0.02, radius - skin);
    const y0 = pos.y + skin;
    const h = Math.max(0.04, height - skin * 2);

    const min = _v1, max = _v2;
    min.set(pos.x - r, y0, pos.z - r);
    max.set(pos.x + r, y0 + h, pos.z + r);

    const list = this.query(min, max, this._q ??= []);
    for (const c of list) {
      if (!c.blocksMovement) continue;
      if (this._boxOverlapAt(c, pos.x, y0, pos.z, r, h)) return true;
    }
    return false;
  }

  _boxOverlap(c, pos, radius, height) {
    return this._boxOverlapAt(c, pos.x, pos.y, pos.z, radius, height);
  }

  /**
   * 円柱 vs ボックス（ボックスのローカル空間で AABB 近似）。
   * @param {number} y0 円柱の下端
   */
  _boxOverlapAt(c, x, y0, z, radius, height) {
    const p = _v3.set(x, y0 + height / 2, z);
    c.toLocal(p, p);
    const hy = height / 2;
    if (Math.abs(p.y) > c.half.y + hy) return false;
    // XZ 平面で円 vs 矩形
    const dx = Math.max(Math.abs(p.x) - c.half.x, 0);
    const dz = Math.max(Math.abs(p.z) - c.half.z, 0);
    return dx * dx + dz * dz < radius * radius;
  }

  _resolveAxis(pos, radius, height, axis, amount) {
    const min = _v1, max = _v2;
    this._bounds(pos, radius, height, min, max);
    const list = this.query(min, max, this._q ??= []);
    let hit = false;
    for (const c of list) {
      if (!c.blocksMovement) continue;
      if (this._boxOverlap(c, pos, radius, height)) { hit = true; break; }
    }
    return hit;
  }

  _resolveY(pos, radius, height, amount) {
    const min = _v1, max = _v2;
    this._bounds(pos, radius, height, min, max);
    const list = this.query(min, max, this._q ??= []);
    let best = null, bestY = amount < 0 ? -Infinity : Infinity;
    for (const c of list) {
      if (!c.blocksMovement) continue;
      if (!this._boxOverlap(c, pos, radius, height)) continue;
      if (amount < 0) {
        const top = c.max.y;
        if (top > bestY) { bestY = top; best = c; }
      } else {
        const bot = c.min.y;
        if (bot < bestY) { bestY = bot; best = c; }
      }
    }
    if (!best) return { hit: false };
    if (amount < 0) { pos.y = bestY; return { hit: true, y: bestY, surface: best.surface }; }
    pos.y = bestY - height;
    return { hit: true, y: bestY, surface: best.surface };
  }

  /** 足元から maxDrop まで下方に地面を探す */
  _groundBelow(pos, radius, maxDrop) {
    const min = _v1.set(pos.x - radius, pos.y - maxDrop, pos.z - radius);
    const max = _v2.set(pos.x + radius, pos.y + 0.02, pos.z + radius);
    const list = this.query(min, max, this._q2 ??= []);
    let bestY = null;
    for (const c of list) {
      if (!c.blocksMovement) continue;
      const top = c.max.y;
      if (top > pos.y + 0.02 || top < pos.y - maxDrop) continue;
      // XZ 内包チェック
      const p = _v3.set(pos.x, top, pos.z);
      c.toLocal(p, p);
      const dx = Math.max(Math.abs(p.x) - c.half.x, 0);
      const dz = Math.max(Math.abs(p.z) - c.half.z, 0);
      if (dx * dx + dz * dz > radius * radius) continue;
      if (bestY === null || top > bestY) bestY = top;
    }
    return bestY;
  }

  /** 指定位置の直下の表面種別を返す */
  surfaceBelow(pos, radius = 0.3) {
    const min = _v1.set(pos.x - radius, pos.y - 0.3, pos.z - radius);
    const max = _v2.set(pos.x + radius, pos.y + 0.05, pos.z + radius);
    const list = this.query(min, max, this._q2 ??= []);
    let bestY = -Infinity, s = SURFACE.CONCRETE;
    for (const c of list) {
      if (c.max.y <= pos.y + 0.05 && c.max.y > bestY) { bestY = c.max.y; s = c.surface; }
    }
    return s;
  }

  /* ================= レイキャスト ================= */

  /**
   * ワールドに対するレイキャスト。
   * @returns {{hit:boolean, dist:number, point:THREE.Vector3, normal:THREE.Vector3, collider:Collider}|null}
   */
  raycast(origin, dir, maxDist = 200, opt = {}) {
    const forBullets = opt.forBullets !== false;
    let best = null, bestT = maxDist;

    /*
     * 引数はまず専用の領域へ退避する。
     * このメソッドは内部で _v1 / _v2 を作業用に使うため、呼び出し側が
     * 同じ一時ベクトルを origin / dir として渡していると、
     * ブロードフェーズ計算の途中で引数そのものが壊れてしまう。
     * （実際に losBlocked と DebrisBody.step がこれで誤動作していた）
     */
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    const o = _rayO.set(ox, oy, oz);
    const d = _rayD.set(dx, dy, dz);

    // レイの AABB でブロードフェーズ
    const min = _v1.set(
      Math.min(ox, ox + dx * maxDist),
      Math.min(oy, oy + dy * maxDist),
      Math.min(oz, oz + dz * maxDist)
    );
    const max = _v2.set(
      Math.max(ox, ox + dx * maxDist),
      Math.max(oy, oy + dy * maxDist),
      Math.max(oz, oz + dz * maxDist)
    );
    const list = this.query(min, max, this._qr ??= []);

    for (const c of list) {
      if (forBullets && !c.blocksBullets) continue;
      if (!forBullets && !c.blocksMovement) continue;
      const r = this._rayBox(c, o, d, bestT);
      if (r && r.t < bestT) { bestT = r.t; best = { t: r.t, nx: r.nx, ny: r.ny, nz: r.nz, collider: c }; }
    }

    if (!best) return null;
    const point = new THREE.Vector3(ox + dx * best.t, oy + dy * best.t, oz + dz * best.t);
    const normal = new THREE.Vector3(best.nx, best.ny, best.nz);
    if (best.collider.rotated) best.collider.dirToWorld(normal, normal);
    return { hit: true, dist: best.t, point, normal, collider: best.collider };
  }

  /** スラブ法によるレイ vs ボックス。ローカル空間で判定する。 */
  _rayBox(c, origin, dir, maxT) {
    // ローカル空間へ
    const o = _rbLocal.copy(origin);
    c.toLocal(o, o);
    let dx = dir.x, dy = dir.y, dz = dir.z;
    if (c.rotated) {
      // 原点と同じ向きにそろえる（toLocal と同じ回転）
      const x = dx * c.cos - dz * c.sin;
      const z = dx * c.sin + dz * c.cos;
      dx = x; dz = z;
    }

    let tmin = 0, tmax = maxT;
    let nAxis = 0, nSign = 0;

    // X
    if (Math.abs(dx) < 1e-8) { if (Math.abs(o.x) > c.half.x) return null; }
    else {
      const inv = 1 / dx;
      let t1 = (-c.half.x - o.x) * inv, t2 = (c.half.x - o.x) * inv;
      let sgn = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = 0; nSign = sgn; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    // Y
    if (Math.abs(dy) < 1e-8) { if (Math.abs(o.y) > c.half.y) return null; }
    else {
      const inv = 1 / dy;
      let t1 = (-c.half.y - o.y) * inv, t2 = (c.half.y - o.y) * inv;
      let sgn = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = 1; nSign = sgn; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    // Z
    if (Math.abs(dz) < 1e-8) { if (Math.abs(o.z) > c.half.z) return null; }
    else {
      const inv = 1 / dz;
      let t1 = (-c.half.z - o.z) * inv, t2 = (c.half.z - o.z) * inv;
      let sgn = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = 2; nSign = sgn; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }

    if (tmin < 0.0001) return null;
    return {
      t: tmin,
      nx: nAxis === 0 ? nSign : 0,
      ny: nAxis === 1 ? nSign : 0,
      nz: nAxis === 2 ? nSign : 0,
    };
  }

  /**
   * 2点間に遮蔽物があるか（AI の視線判定用・高速版）
   */
  losBlocked(from, to) {
    const dir = _losDir.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.01) return false;
    dir.divideScalar(dist);
    return !!this.raycast(from, dir, dist - 0.02);
  }
}

/**
 * 簡易剛体（薬莢・破片用）。ワールドとの球衝突のみ扱う。
 */
export class DebrisBody {
  constructor(pos, vel, radius = 0.02) {
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.radius = radius;
    this.angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 28, (Math.random() - 0.5) * 28, (Math.random() - 0.5) * 28
    );
    this.rot = new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    this.life = 0;
    this.resting = false;
    this.restitution = 0.32;
    this.friction = 0.72;
  }

  step(physics, dt) {
    if (this.resting) return;
    this.life += dt;
    this.vel.y += physics.gravity * dt;

    // physics.raycast が内部で使う領域とは別の場所を使う
    const move = _dbMove.copy(this.vel).multiplyScalar(dt);
    const dist = move.length();
    if (dist > 1e-5) {
      const dir = _dbDir.copy(move).divideScalar(dist);
      const hit = physics.raycast(this.pos, dir, dist + this.radius, { forBullets: false });
      if (hit) {
        // 反射
        this.pos.copy(hit.point).addScaledVector(hit.normal, this.radius);
        const vn = this.vel.dot(hit.normal);
        this.vel.addScaledVector(hit.normal, -vn * (1 + this.restitution));
        this.vel.multiplyScalar(this.friction);
        this.angVel.multiplyScalar(0.55);
        if (this.vel.lengthSq() < 0.18 && Math.abs(hit.normal.y) > 0.6) {
          this.resting = true;
          this.vel.set(0, 0, 0);
        }
        return true; // バウンド発生（音を鳴らす合図）
      }
    }
    this.pos.add(move);
    this.rot.x += this.angVel.x * dt;
    this.rot.y += this.angVel.y * dt;
    this.rot.z += this.angVel.z * dt;
    return false;
  }
}
