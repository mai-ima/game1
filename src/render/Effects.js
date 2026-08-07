import * as THREE from 'three';
import { SURFACE, DebrisBody } from '../world/Physics.js';

/**
 * 戦闘エフェクト一式。
 * すべてプール方式（生成/破棄をせず使い回す）でGC負荷を出さない。
 *
 *  - マズルフラッシュ（スプライト + 点光源）
 *  - 曳光弾（伸びる線分）
 *  - 着弾スパーク / 粉塵 / 破片
 *  - 弾痕デカール
 *  - 排莢（物理付き）
 *  - 血液ヒットエフェクト
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
// 毎フレームの生成を避けるための定数ベクトル（書き換えないこと）
const _AXIS_Z = new THREE.Vector3(0, 0, 1);
const _AXIS_NEG_Z = new THREE.Vector3(0, 0, -1);
const _scale = new THREE.Vector3(1, 1, 1);

/* ---------- テクスチャ生成（キャンバス） ---------- */

function radialSprite(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, col] of stops) grd.addColorStop(t, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 星形のマズルフラッシュ */
function flashTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  g.clearRect(0, 0, size, size);
  // 中心のコア
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.22);
  core.addColorStop(0, 'rgba(255,255,250,1)');
  core.addColorStop(0.45, 'rgba(255,232,170,0.92)');
  core.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);
  // 放射状の花弁
  g.globalCompositeOperation = 'lighter';
  const petals = 7;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + 0.4;
    const len = size * (0.30 + (i % 2) * 0.16);
    const w = size * 0.055;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    const grd = g.createLinearGradient(0, 0, len, 0);
    grd.addColorStop(0, 'rgba(255,240,200,0.85)');
    grd.addColorStop(0.5, 'rgba(255,190,90,0.35)');
    grd.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, -w);
    g.lineTo(len, 0);
    g.lineTo(0, w);
    g.closePath();
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 弾痕デカール（穴 + 放射状のヒビ） */
function bulletHoleTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  g.clearRect(0, 0, size, size);

  // 外側の粉砕リング
  const ring = g.createRadialGradient(cx, cy, size * 0.10, cx, cy, size * 0.48);
  ring.addColorStop(0, 'rgba(30,26,22,0.95)');
  ring.addColorStop(0.45, 'rgba(60,54,48,0.55)');
  ring.addColorStop(1, 'rgba(90,84,78,0)');
  g.fillStyle = ring;
  g.beginPath(); g.arc(cx, cy, size * 0.48, 0, 6.29); g.fill();

  // 放射状のヒビ
  g.strokeStyle = 'rgba(24,20,18,0.75)';
  for (let i = 0; i < 11; i++) {
    const a = Math.random() * Math.PI * 2;
    const len = size * (0.18 + Math.random() * 0.26);
    g.lineWidth = 1 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(cx, cy);
    let x = cx, y = cy, ang = a;
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      ang += (Math.random() - 0.5) * 0.7;
      x += Math.cos(ang) * len / steps;
      y += Math.sin(ang) * len / steps;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // 中心の穴
  const hole = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.13);
  hole.addColorStop(0, 'rgba(8,6,5,1)');
  hole.addColorStop(0.75, 'rgba(14,11,9,0.98)');
  hole.addColorStop(1, 'rgba(26,22,19,0.6)');
  g.fillStyle = hole;
  g.beginPath(); g.arc(cx, cy, size * 0.13, 0, 6.29); g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- 表面ごとの着弾パラメータ ---------- */

const IMPACT = {
  [SURFACE.CONCRETE]: { spark: 0.15, dust: 1.0, dustColor: 0xc9c2b4, debris: 5, decal: true },
  [SURFACE.METAL]:    { spark: 1.0,  dust: 0.25, dustColor: 0x9aa0a6, debris: 3, decal: true },
  [SURFACE.WOOD]:     { spark: 0.05, dust: 0.8, dustColor: 0xa87c50, debris: 6, decal: true },
  [SURFACE.DIRT]:     { spark: 0.0,  dust: 1.3, dustColor: 0xa8865c, debris: 7, decal: false },
  [SURFACE.SAND]:     { spark: 0.0,  dust: 1.5, dustColor: 0xd6bd8e, debris: 6, decal: false },
  [SURFACE.GRAVEL]:   { spark: 0.1,  dust: 1.1, dustColor: 0xa8a49c, debris: 8, decal: false },
  [SURFACE.GLASS]:    { spark: 0.2,  dust: 0.5, dustColor: 0xd0e0e8, debris: 9, decal: true },
  [SURFACE.FABRIC]:   { spark: 0.0,  dust: 0.7, dustColor: 0xb8a888, debris: 2, decal: true },
  [SURFACE.RUBBER]:   { spark: 0.0,  dust: 0.4, dustColor: 0x505050, debris: 2, decal: true },
  [SURFACE.FLESH]:    { spark: 0.0,  dust: 0.0, dustColor: 0x8a1010, debris: 0, decal: false },
};

export class Effects {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {import('../world/Physics.js').Physics} physics
   */
  constructor(engine, physics) {
    this.engine = engine;
    this.physics = physics;
    this.scene = engine.scene;

    this.tex = {
      flash: flashTexture(256),
      hole: bulletHoleTexture(128),
      smoke: radialSprite(128, [[0, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]),
      spark: radialSprite(64, [[0, 'rgba(255,250,220,1)'], [0.35, 'rgba(255,190,90,0.8)'], [1, 'rgba(255,120,30,0)']]),
      blood: radialSprite(64, [[0, 'rgba(190,20,16,0.95)'], [0.6, 'rgba(120,10,8,0.5)'], [1, 'rgba(90,6,6,0)']]),
    };

    this._initMuzzle();
    this._initTracers();
    this._initParticles();
    this._initDecals();
    this._initCasings();

    this.time = 0;
  }

  /* ================= マズルフラッシュ ================= */

  _initMuzzle() {
    const mat = new THREE.SpriteMaterial({
      map: this.tex.flash, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true, transparent: true, opacity: 0,
    });
    this.muzzleSprite = new THREE.Sprite(mat);
    this.muzzleSprite.visible = false;
    this.muzzleSprite.renderOrder = 10;
    // ビューモデルと同じシーンに置き、常に手前に描く
    this.engine.viewScene.add(this.muzzleSprite);

    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 14, 2);
    this.scene.add(this.muzzleLight);
    this._muzzleT = 0;
    this._muzzleDur = 0.055;
  }

  /**
   * @param {THREE.Vector3} worldPos 銃口のワールド座標
   * @param {number} scale 大きさ
   */
  muzzleFlash(worldPos, scale = 1, viewLocal = null) {
    const s = scale * (0.16 + Math.random() * 0.06);
    if (viewLocal) {
      this.muzzleSprite.position.copy(viewLocal);
    } else {
      this.muzzleSprite.position.copy(worldPos);
    }
    this.muzzleSprite.scale.set(s, s, s);
    this.muzzleSprite.material.rotation = Math.random() * Math.PI * 2;
    this.muzzleSprite.material.opacity = 1;
    this.muzzleSprite.visible = true;
    this._muzzleT = this._muzzleDur;

    this.muzzleLight.position.copy(worldPos);
    this.muzzleLight.intensity = 26 * scale;
  }

  /* ================= 曳光弾 ================= */

  _initTracers() {
    const N = 48;
    this.tracerPool = [];
    const geo = new THREE.CylinderGeometry(0.012, 0.004, 1, 5, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -0.5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd48a, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
    });
    this.tracerMesh = new THREE.InstancedMesh(geo, mat, N);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = N;
    this.scene.add(this.tracerMesh);
    for (let i = 0; i < N; i++) {
      this.tracerPool.push({ active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0.09, len: 0 });
      _m.makeScale(0, 0, 0);
      this.tracerMesh.setMatrixAt(i, _m);
    }
    this.tracerMesh.instanceMatrix.needsUpdate = true;
  }

  /** 曳光弾を飛ばす */
  tracer(from, to, speed = 900) {
    const p = this.tracerPool.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.from.copy(from);
    p.to.copy(to);
    p.len = from.distanceTo(to);
    p.dur = Math.max(0.035, Math.min(0.22, p.len / speed));
    p.t = 0;
  }

  _updateTracers(dt) {
    let changed = false;
    for (let i = 0; i < this.tracerPool.length; i++) {
      const p = this.tracerPool[i];
      if (!p.active) continue;
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) {
        p.active = false;
        _m.makeScale(0, 0, 0);
        this.tracerMesh.setMatrixAt(i, _m);
        changed = true;
        continue;
      }
      // 弾の先端位置と、後方へ伸びる尾
      const headD = p.len * Math.min(1, k * 1.15);
      const tailLen = Math.min(headD, 7.5 + p.len * 0.06);
      _v.copy(p.to).sub(p.from).normalize();
      const head = _v2.copy(p.from).addScaledVector(_v, headD);

      _q.setFromUnitVectors(_AXIS_NEG_Z, _v);
      _m.compose(head, _q, _scale.set(1, 1, tailLen));
      this.tracerMesh.setMatrixAt(i, _m);
      changed = true;
    }
    if (changed) this.tracerMesh.instanceMatrix.needsUpdate = true;
  }

  /* ================= パーティクル ================= */

  _initParticles() {
    const N = 380;
    this.particles = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex.smoke, transparent: true, depthWrite: false,
      blending: THREE.NormalBlending, side: THREE.DoubleSide,
    });
    this.dustMesh = new THREE.InstancedMesh(geo, mat, N);
    this.dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dustMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.dustMesh.frustumCulled = false;
    this.scene.add(this.dustMesh);

    const sparkMat = new THREE.MeshBasicMaterial({
      map: this.tex.spark, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.sparkMesh = new THREE.InstancedMesh(geo, sparkMat, 220);
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparkMesh.frustumCulled = false;
    this.scene.add(this.sparkMesh);

    for (let i = 0; i < N; i++) {
      this.particles.push({
        active: false, kind: 'dust', pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        life: 0, maxLife: 1, size0: 0.1, size1: 0.4, rot: 0, rotVel: 0,
        color: new THREE.Color(), drag: 2.0, gravity: -1.2,
      });
    }
    this._dustCount = N;
    this._sparkCount = 220;
  }

  _spawnParticle(kind, pos, vel, opt = {}) {
    const p = this.particles.find((x) => !x.active);
    if (!p) return null;
    p.active = true;
    p.kind = kind;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = 0;
    p.maxLife = opt.life ?? 0.8;
    p.size0 = opt.size0 ?? 0.08;
    p.size1 = opt.size1 ?? 0.4;
    p.rot = Math.random() * Math.PI * 2;
    p.rotVel = (Math.random() - 0.5) * 3;
    p.drag = opt.drag ?? 2.2;
    p.gravity = opt.gravity ?? -1.2;
    if (opt.color !== undefined) p.color.set(opt.color);
    else p.color.set(0xffffff);
    return p;
  }

  _updateParticles(dt, camera) {
    let di = 0, si = 0;
    const camQ = camera.quaternion;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      const k = p.life / p.maxLife;
      if (k >= 1) { p.active = false; continue; }

      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(1 - Math.min(1, p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      p.rot += p.rotVel * dt;

      const size = p.size0 + (p.size1 - p.size0) * k;
      const alpha = p.kind === 'spark'
        ? Math.pow(1 - k, 1.8)
        : Math.sin(Math.min(1, k * 2.4) * Math.PI * 0.5) * (1 - k) * 1.1;

      // ビルボード（カメラ向き + 自転）
      _q2.setFromAxisAngle(_AXIS_Z, p.rot);
      _q.copy(camQ).multiply(_q2);
      _m.compose(p.pos, _q, _v.set(size, size, size));

      if (p.kind === 'spark') {
        if (si < this._sparkCount) { this.sparkMesh.setMatrixAt(si, _m); si++; }
      } else {
        if (di < this._dustCount) {
          this.dustMesh.setMatrixAt(di, _m);
          this.dustMesh.instanceColor.setXYZ(di, p.color.r * alpha, p.color.g * alpha, p.color.b * alpha);
          di++;
        }
      }
    }
    // 未使用分は潰す
    for (let i = di; i < this._dustCount; i++) { _m.makeScale(0, 0, 0); this.dustMesh.setMatrixAt(i, _m); }
    for (let i = si; i < this._sparkCount; i++) { _m.makeScale(0, 0, 0); this.sparkMesh.setMatrixAt(i, _m); }
    this.dustMesh.instanceMatrix.needsUpdate = true;
    this.dustMesh.instanceColor.needsUpdate = true;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
  }

  /* ================= デカール ================= */

  _initDecals() {
    const MAX = 96;
    this.decalMax = MAX;
    this.decalIndex = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex.hole, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      side: THREE.DoubleSide, opacity: 0.95,
    });
    this.decalMesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decalMesh.frustumCulled = false;
    this.scene.add(this.decalMesh);
    for (let i = 0; i < MAX; i++) { _m.makeScale(0, 0, 0); this.decalMesh.setMatrixAt(i, _m); }
    this.decalMesh.instanceMatrix.needsUpdate = true;
  }

  /** 弾痕を貼る */
  decal(point, normal, size = 0.11) {
    const i = this.decalIndex % this.decalMax;
    this.decalIndex++;
    _q.setFromUnitVectors(_AXIS_Z, normal);
    // 面内でランダム回転
    const spin = _q2.setFromAxisAngle(_AXIS_Z, Math.random() * Math.PI * 2);
    _q.multiply(spin);
    const s = size * (0.82 + Math.random() * 0.42);
    _v.copy(point).addScaledVector(normal, 0.006);
    _m.compose(_v, _q, _v2.set(s, s, s));
    this.decalMesh.setMatrixAt(i, _m);
    this.decalMesh.instanceMatrix.needsUpdate = true;
  }

  /* ================= 排莢 ================= */

  _initCasings() {
    const MAX = 40;
    this.casingMax = MAX;
    this.casings = [];
    const geo = new THREE.CylinderGeometry(0.0045, 0.0042, 0.020, 7);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.28, metalness: 1.0 });
    this.casingMesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.casingMesh.frustumCulled = false;
    this.casingMesh.castShadow = false;
    this.scene.add(this.casingMesh);
    for (let i = 0; i < MAX; i++) {
      this.casings.push(null);
      _m.makeScale(0, 0, 0);
      this.casingMesh.setMatrixAt(i, _m);
    }
    this.casingMesh.instanceMatrix.needsUpdate = true;
    this._casingIndex = 0;
  }

  /** 薬莢を排出 */
  ejectCasing(pos, dir, playerVel = null) {
    const i = this._casingIndex % this.casingMax;
    this._casingIndex++;
    // 右斜め後方へ飛ばす
    const v = _v.copy(dir).multiplyScalar(2.4)
      .add(_v2.set((Math.random() - 0.5) * 0.8, 1.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8));
    if (playerVel) v.addScaledVector(playerVel, 0.8);
    const body = new DebrisBody(pos, v, 0.012);
    body.restitution = 0.35;
    this.casings[i] = body;
  }

  _updateCasings(dt) {
    let changed = false;
    for (let i = 0; i < this.casingMax; i++) {
      const b = this.casings[i];
      if (!b) continue;
      if (b.life > 6.5) { this.casings[i] = null; _m.makeScale(0, 0, 0); this.casingMesh.setMatrixAt(i, _m); changed = true; continue; }
      if (!b.resting) {
        b.step(this.physics, dt);
        _q.setFromEuler(b.rot);
        _m.compose(b.pos, _q, _v.set(1, 1, 1));
        this.casingMesh.setMatrixAt(i, _m);
        changed = true;
      } else {
        b.life += dt;
      }
    }
    if (changed) this.casingMesh.instanceMatrix.needsUpdate = true;
  }

  /* ================= 高レベル API ================= */

  /** 着弾エフェクト（表面種別で見た目を変える） */
  impact(point, normal, surface = SURFACE.CONCRETE) {
    const cfg = IMPACT[surface] || IMPACT[SURFACE.CONCRETE];

    // 粉塵
    const dustN = Math.round(3 + cfg.dust * 4);
    for (let i = 0; i < dustN; i++) {
      const v = _v.copy(normal).multiplyScalar(1.1 + Math.random() * 1.4)
        .add(_v2.set((Math.random() - 0.5) * 1.5, Math.random() * 0.9, (Math.random() - 0.5) * 1.5));
      this._spawnParticle('dust', point, v, {
        life: 0.55 + Math.random() * 0.55,
        size0: 0.045, size1: 0.30 + cfg.dust * 0.22,
        color: cfg.dustColor, drag: 3.4, gravity: -0.7,
      });
    }

    // 火花
    if (cfg.spark > 0.01) {
      const n = Math.round(cfg.spark * 9);
      for (let i = 0; i < n; i++) {
        const v = _v.copy(normal).multiplyScalar(2.5 + Math.random() * 3.5)
          .add(_v2.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4));
        this._spawnParticle('spark', point, v, {
          life: 0.18 + Math.random() * 0.26,
          size0: 0.035, size1: 0.012,
          drag: 1.4, gravity: -7.5,
        });
      }
    }

    // 破片
    for (let i = 0; i < cfg.debris; i++) {
      const v = _v.copy(normal).multiplyScalar(1.6 + Math.random() * 2.4)
        .add(_v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
      this._spawnParticle('dust', point, v, {
        life: 0.5 + Math.random() * 0.4,
        size0: 0.022, size1: 0.012,
        color: cfg.dustColor, drag: 0.9, gravity: -9,
      });
    }

    if (cfg.decal) this.decal(point, normal, surface === SURFACE.METAL ? 0.075 : 0.105);
  }

  /** 被弾（キャラクタ） */
  bloodImpact(point, normal, isHead = false) {
    const n = isHead ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const v = _v.copy(normal).multiplyScalar(1.2 + Math.random() * 2.2)
        .add(_v2.set((Math.random() - 0.5) * 2.2, Math.random() * 1.4, (Math.random() - 0.5) * 2.2));
      this._spawnParticle('dust', point, v, {
        life: 0.34 + Math.random() * 0.28,
        size0: 0.05, size1: 0.16,
        color: isHead ? 0x9e0f0c : 0x7a0d0a, drag: 3.0, gravity: -5.5,
      });
    }
  }

  /** 爆発 */
  explosion(point, radius = 4) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.5;
      const v = _v.set(Math.cos(a) * Math.cos(e), Math.sin(e) * 1.6, Math.sin(a) * Math.cos(e))
        .multiplyScalar(4 + Math.random() * 7);
      this._spawnParticle('dust', point, v, {
        life: 0.9 + Math.random() * 0.8, size0: 0.3, size1: 2.2 + Math.random(),
        color: 0x4a4038, drag: 1.9, gravity: 0.6,
      });
    }
    for (let i = 0; i < 22; i++) {
      const v = _v.set((Math.random() - 0.5), Math.random() * 1.2, (Math.random() - 0.5))
        .normalize().multiplyScalar(7 + Math.random() * 12);
      this._spawnParticle('spark', point, v, {
        life: 0.3 + Math.random() * 0.4, size0: 0.12, size1: 0.03, drag: 1.1, gravity: -8,
      });
    }
    const l = new THREE.PointLight(0xffa040, 400, radius * 5, 2);
    l.position.copy(point);
    this.scene.add(l);
    const t0 = this.time;
    this._tempLights ??= [];
    this._tempLights.push({ light: l, t0, dur: 0.32 });
  }

  /* ================= 更新 ================= */

  update(dt, camera) {
    this.time += dt;

    // マズルフラッシュの減衰
    if (this._muzzleT > 0) {
      this._muzzleT -= dt;
      const k = Math.max(0, this._muzzleT / this._muzzleDur);
      this.muzzleSprite.material.opacity = k;
      this.muzzleLight.intensity *= Math.pow(0.02, dt / this._muzzleDur);
      if (this._muzzleT <= 0) {
        this.muzzleSprite.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }

    // 一時的な光源
    if (this._tempLights?.length) {
      for (let i = this._tempLights.length - 1; i >= 0; i--) {
        const e = this._tempLights[i];
        const k = (this.time - e.t0) / e.dur;
        if (k >= 1) { this.scene.remove(e.light); e.light.dispose(); this._tempLights.splice(i, 1); }
        else e.light.intensity = 400 * Math.pow(1 - k, 2.2);
      }
    }

    this._updateTracers(dt);
    this._updateParticles(dt, camera);
    this._updateCasings(dt);
  }

  dispose() {
    for (const t of Object.values(this.tex)) t.dispose();
    this.scene.remove(this.tracerMesh, this.dustMesh, this.sparkMesh, this.decalMesh, this.casingMesh, this.muzzleLight);
    this.engine.viewScene.remove(this.muzzleSprite);
  }
}
