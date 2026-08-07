import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roundedBox } from '../player/weapons/GunParts.js';

/**
 * 兵士キャラクタ。
 * ボーン階層（Group）に部位メッシュをぶら下げ、歩行・射撃・被弾を
 * 手続き的なアニメーションで表現する（スキニング無し）。
 *
 * 当たり判定は部位ごとのカプセル/ボックスで、頭・胴・手足を判別する。
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** 部位ごとのダメージ倍率区分 */
export const HIT_ZONE = { HEAD: 'head', BODY: 'body', LIMB: 'limb' };

function part(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  for (const n of Object.keys(g.attributes)) {
    if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
  }
  if (!g.getAttribute('uv')) {
    const c = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c * 2), 2));
  }
  g.clearGroups();
  return g;
}

function mergeParts(list) {
  const valid = list.filter(Boolean).map(part);
  if (!valid.length) return null;
  return valid.length === 1 ? valid[0] : BufferGeometryUtils.mergeGeometries(valid, false);
}

/**
 * 兵士モデルを構築する。
 * @param {object} mats {uniform, gear, skin, boot, metal}
 * @param {number} teamColor 陣営色（アクセント）
 */
export function buildSoldier(mats, teamColor = 0x2f6fb8) {
  const root = new THREE.Group();
  root.name = 'soldier';

  const M = {
    uniform: mats.uniform,
    gear: mats.gear,
    skin: mats.skin,
    boot: mats.boot,
    metal: mats.metal,
    accent: new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.55, metalness: 0.1 }),
  };

  /* ---------- 骨格（Group 階層） ---------- */
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  const chest = new THREE.Group(); chest.position.y = 0.26; spine.add(chest);
  const neck = new THREE.Group(); neck.position.y = 0.24; chest.add(neck);
  const head = new THREE.Group(); head.position.y = 0.09; neck.add(head);

  const armL = new THREE.Group(); armL.position.set(0.19, 0.18, 0); chest.add(armL);
  const armR = new THREE.Group(); armR.position.set(-0.19, 0.18, 0); chest.add(armR);
  const foreL = new THREE.Group(); foreL.position.y = -0.27; armL.add(foreL);
  const foreR = new THREE.Group(); foreR.position.y = -0.27; armR.add(foreR);

  const legL = new THREE.Group(); legL.position.set(0.11, -0.02, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(-0.11, -0.02, 0); hips.add(legR);
  const shinL = new THREE.Group(); shinL.position.y = -0.42; legL.add(shinL);
  const shinR = new THREE.Group(); shinR.position.y = -0.42; legR.add(shinR);

  /* ---------- メッシュ ---------- */
  // 骨盤
  addMesh(hips, mergeParts([
    translated(roundedBox(0.32, 0.20, 0.21, 0.055, 0.02), 0, -0.02, 0),
  ]), M.uniform);

  // 胴
  addMesh(chest, mergeParts([
    translated(roundedBox(0.36, 0.40, 0.23, 0.07, 0.025), 0, 0.06, 0),
  ]), M.uniform);

  // プレートキャリア（ベスト）
  addMesh(chest, mergeParts([
    translated(roundedBox(0.345, 0.31, 0.135, 0.03, 0.012), 0, 0.07, 0.062),
    translated(roundedBox(0.345, 0.31, 0.115, 0.03, 0.012), 0, 0.07, -0.058),
    // 肩ストラップ
    translated(roundedBox(0.075, 0.055, 0.20, 0.02, 0.008), 0.115, 0.225, 0),
    translated(roundedBox(0.075, 0.055, 0.20, 0.02, 0.008), -0.115, 0.225, 0),
  ]), M.gear);

  // マガジンポーチ（前面の情報量）
  const pouches = [];
  for (let i = 0; i < 3; i++) {
    pouches.push(translated(roundedBox(0.075, 0.115, 0.055, 0.014, 0.006), -0.09 + i * 0.09, -0.02, 0.128));
  }
  pouches.push(translated(roundedBox(0.10, 0.09, 0.06, 0.016, 0.007), 0.135, 0.10, 0.115));
  addMesh(chest, mergeParts(pouches), M.gear);

  // バックパック
  addMesh(chest, mergeParts([
    translated(roundedBox(0.30, 0.34, 0.16, 0.045, 0.018), 0, 0.05, -0.155),
    translated(roundedBox(0.14, 0.10, 0.07, 0.02, 0.008), 0, -0.10, -0.24),
  ]), M.gear);

  // 首
  addMesh(neck, mergeParts([
    translated(new THREE.CylinderGeometry(0.052, 0.058, 0.09, 10), 0, 0.02, 0),
  ]), M.skin);

  // 頭（ヘルメット + 顔）
  addMesh(head, mergeParts([
    translated(roundedBox(0.155, 0.185, 0.175, 0.06, 0.02), 0, 0.055, 0.006),
  ]), M.skin);
  addMesh(head, mergeParts([
    // ヘルメット本体
    translated(scaled(new THREE.SphereGeometry(0.116, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), 1.0, 0.92, 1.06), 0, 0.085, 0.004),
    // 後頭部の張り出し
    translated(scaled(new THREE.SphereGeometry(0.104, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 1.0, 0.8, 1.0), 0, 0.062, -0.022),
    // レール / マウント
    translated(roundedBox(0.028, 0.020, 0.14, 0.006, 0.003), 0.106, 0.078, 0),
    translated(roundedBox(0.028, 0.020, 0.14, 0.006, 0.003), -0.106, 0.078, 0),
    translated(roundedBox(0.05, 0.035, 0.03, 0.008, 0.004), 0, 0.12, 0.098),
  ]), M.gear);
  // ゴーグル
  addMesh(head, mergeParts([
    translated(roundedBox(0.175, 0.045, 0.03, 0.012, 0.005), 0, 0.10, 0.082),
  ]), M.metal);

  // 腕
  addMesh(armL, mergeParts([translated(roundedBox(0.098, 0.28, 0.098, 0.04, 0.015), 0, -0.13, 0)]), M.uniform);
  addMesh(armR, mergeParts([translated(roundedBox(0.098, 0.28, 0.098, 0.04, 0.015), 0, -0.13, 0)]), M.uniform);
  addMesh(foreL, mergeParts([
    translated(roundedBox(0.086, 0.25, 0.086, 0.035, 0.014), 0, -0.11, 0),
    translated(roundedBox(0.072, 0.09, 0.072, 0.025, 0.01), 0, -0.255, 0.012),  // 手
  ]), M.uniform);
  addMesh(foreR, mergeParts([
    translated(roundedBox(0.086, 0.25, 0.086, 0.035, 0.014), 0, -0.11, 0),
    translated(roundedBox(0.072, 0.09, 0.072, 0.025, 0.01), 0, -0.255, 0.012),
  ]), M.uniform);
  // 肘・手袋のアクセント
  addMesh(foreL, mergeParts([translated(roundedBox(0.095, 0.07, 0.095, 0.02, 0.008), 0, 0.0, 0)]), M.gear);
  addMesh(foreR, mergeParts([translated(roundedBox(0.095, 0.07, 0.095, 0.02, 0.008), 0, 0.0, 0)]), M.gear);

  // 脚
  addMesh(legL, mergeParts([translated(roundedBox(0.125, 0.44, 0.13, 0.045, 0.018), 0, -0.21, 0)]), M.uniform);
  addMesh(legR, mergeParts([translated(roundedBox(0.125, 0.44, 0.13, 0.045, 0.018), 0, -0.21, 0)]), M.uniform);
  addMesh(shinL, mergeParts([translated(roundedBox(0.108, 0.40, 0.115, 0.04, 0.016), 0, -0.19, 0)]), M.uniform);
  addMesh(shinR, mergeParts([translated(roundedBox(0.108, 0.40, 0.115, 0.04, 0.016), 0, -0.19, 0)]), M.uniform);
  // ニーパッド
  addMesh(shinL, mergeParts([translated(roundedBox(0.115, 0.10, 0.055, 0.025, 0.01), 0, 0.005, 0.062)]), M.gear);
  addMesh(shinR, mergeParts([translated(roundedBox(0.115, 0.10, 0.055, 0.025, 0.01), 0, 0.005, 0.062)]), M.gear);
  // ブーツ
  addMesh(shinL, mergeParts([
    translated(roundedBox(0.115, 0.11, 0.24, 0.03, 0.012), 0, -0.40, 0.038),
  ]), M.boot);
  addMesh(shinR, mergeParts([
    translated(roundedBox(0.115, 0.11, 0.24, 0.03, 0.012), 0, -0.40, 0.038),
  ]), M.boot);

  // 陣営色のアームバンド
  addMesh(armL, mergeParts([translated(roundedBox(0.104, 0.045, 0.104, 0.02, 0.008), 0, -0.06, 0)]), M.accent);
  addMesh(armR, mergeParts([translated(roundedBox(0.104, 0.045, 0.104, 0.02, 0.008), 0, -0.06, 0)]), M.accent);

  root.userData.bones = { hips, spine, chest, neck, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR };
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

function addMesh(parent, geo, mat) {
  if (!geo) return null;
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}
function translated(g, x, y, z) { g.translate(x, y, z); return g; }
function scaled(g, x, y, z) { g.scale(x, y, z); return g; }

/**
 * キャラクタの当たり判定・アニメーションを司る。
 */
export class Character {
  /**
   * @param {THREE.Group} model buildSoldier の戻り値
   */
  constructor(model) {
    this.model = model;
    this.bones = model.userData.bones;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.stance = 0;             // 0=立ち 1=しゃがみ
    this.speed = 0;
    this.alive = true;

    this._walkPhase = 0;
    this._aimT = 0;
    this._fireKick = 0;
    this._hitFlash = 0;
    this._deathT = 0;
    this._breath = Math.random() * 6.28;

    // 部位判定用のカプセル（ローカル座標・立ち姿勢基準）
    this.hitboxes = [
      { zone: HIT_ZONE.HEAD, y: 1.66, r: 0.135, h: 0.24 },
      { zone: HIT_ZONE.BODY, y: 1.22, r: 0.235, h: 0.62 },
      { zone: HIT_ZONE.BODY, y: 0.92, r: 0.20, h: 0.24 },
      { zone: HIT_ZONE.LIMB, y: 0.48, r: 0.24, h: 0.86 },
      { zone: HIT_ZONE.LIMB, y: 1.22, r: 0.36, h: 0.50 },   // 腕を含む広め
    ];
  }

  get eyeHeight() { return this.stance ? 1.06 : 1.62; }

  /** 目の位置（射撃・視線の基点） */
  getEyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  /**
   * レイとの交差判定。
   * @returns {{dist:number, point:THREE.Vector3, normal:THREE.Vector3, zone:string}|null}
   */
  raycast(origin, dir, maxDist) {
    if (!this.alive) return null;
    const scale = this.stance ? 0.68 : 1.0;
    let best = null;

    for (const hb of this.hitboxes) {
      // 垂直カプセルを円柱で近似
      const cy = this.position.y + hb.y * scale;
      const half = (hb.h * scale) / 2;
      const r = hb.r;

      // XZ 平面で円 vs レイ
      const ox = origin.x - this.position.x, oz = origin.z - this.position.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      if (a < 1e-9) continue;
      const b = 2 * (ox * dir.x + oz * dir.z);
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a);
      if (t < 0) t = (-b + sq) / (2 * a);
      if (t < 0.01 || t > maxDist) continue;

      const hy = origin.y + dir.y * t;
      if (hy < cy - half || hy > cy + half) continue;

      if (!best || t < best.dist) {
        const point = new THREE.Vector3(origin.x + dir.x * t, hy, origin.z + dir.z * t);
        const normal = new THREE.Vector3(point.x - this.position.x, 0, point.z - this.position.z).normalize();
        /*
         * target は「弾を受けた主体」。Character は見た目と当たり判定だけを
         * 持つ部品で、体力や撃破処理は所有者（Bot）側にある。
         * ここで Character 自身を返すと呼び出し側が target.damage() を
         * 呼べず、着弾のたびに例外で更新が止まる。
         */
        best = { dist: t, point, normal, zone: hb.zone, target: this.owner || this };
      }
    }
    return best;
  }

  /** 被弾演出 */
  onHit() { this._hitFlash = 1; }

  /** 発砲演出 */
  onFire() { this._fireKick = 1; }

  /**
   * 姿勢アニメーション。
   * @param {number} dt
   * @param {boolean} aiming 構えているか
   */
  update(dt, aiming = false) {
    const B = this.bones;
    this.model.position.copy(this.position);
    this.model.rotation.y = this.yaw;

    if (!this.alive) {
      this._deathT += dt;
      const t = Math.min(1, this._deathT / 0.85);
      const e = 1 - Math.pow(1 - t, 3);
      // 崩れ落ちる
      this.model.rotation.x = e * 1.42;
      this.model.position.y = this.position.y + Math.sin(t * Math.PI) * 0.12;
      B.chest.rotation.x = e * 0.5;
      B.head.rotation.x = e * 0.6;
      B.armL.rotation.x = e * -1.1; B.armR.rotation.x = e * -0.9;
      B.legL.rotation.x = e * 0.35; B.legR.rotation.x = e * 0.15;
      return;
    }

    this._aimT += ((aiming ? 1 : 0) - this._aimT) * Math.min(1, 8 * dt);
    this._fireKick *= Math.pow(0.02, dt / 0.09);
    this._hitFlash *= Math.pow(0.02, dt / 0.16);
    this._breath += dt * 1.6;

    const moving = this.speed > 0.4;
    const runK = Math.min(1, this.speed / 5.5);
    if (moving) this._walkPhase += dt * (5.2 + runK * 5.0);

    const swing = moving ? Math.sin(this._walkPhase) : 0;
    const swing2 = moving ? Math.sin(this._walkPhase * 2) : 0;
    const amp = 0.34 + runK * 0.42;

    // 脚
    B.legL.rotation.x = swing * amp;
    B.legR.rotation.x = -swing * amp;
    B.shinL.rotation.x = Math.max(0, -swing * 0.5) * amp * 1.5;
    B.shinR.rotation.x = Math.max(0, swing * 0.5) * amp * 1.5;

    // 腰の上下動と捻り
    B.hips.position.y = (this.stance ? 0.62 : 0.95) + (moving ? Math.abs(swing2) * 0.035 * runK : Math.sin(this._breath) * 0.006);
    B.hips.rotation.y = swing * 0.10 * runK;
    B.spine.rotation.y = -swing * 0.07 * runK;
    B.chest.rotation.y = swing * 0.05 * runK;
    B.chest.rotation.x = this.stance ? 0.30 : (0.06 + runK * 0.16 - this._aimT * 0.04);

    // 腕：構えると武器を保持する姿勢へ
    const aim = this._aimT;
    const armSwing = moving ? -swing * 0.5 * amp * (1 - aim * 0.85) : 0;
    B.armR.rotation.set(-1.28 * aim + armSwing, 0, -0.20 - 0.16 * aim);
    B.armL.rotation.set(-1.34 * aim + (-armSwing), 0, 0.20 + 0.42 * aim);
    B.foreR.rotation.set(-0.30 - 0.32 * aim, 0, 0);
    B.foreL.rotation.set(-0.30 - 0.85 * aim, 0.42 * aim, 0);

    // 発砲の反動
    const kick = this._fireKick;
    B.chest.rotation.x -= kick * 0.10;
    B.armR.rotation.x += kick * 0.16;

    // 頭は視線方向へ（ピッチを上半身と頭で配分）
    B.chest.rotation.x += this.pitch * 0.22;
    B.head.rotation.x = this.pitch * 0.55 + (moving ? -swing2 * 0.02 : 0);
    B.head.rotation.y = moving ? -swing * 0.06 : Math.sin(this._breath * 0.6) * 0.03;
  }

  setTeamColor(color) {
    this.model.traverse((o) => {
      if (o.isMesh && o.material?.userData?.isAccent) o.material.color.set(color);
    });
  }
}

/** 兵士用マテリアル一式を作る */
export function soldierMaterials(mats, variant = 0) {
  const uniforms = ['camo', 'camo', 'fabric'];
  return {
    uniform: mats.get(uniforms[variant % uniforms.length], { repeat: [2.6, 2.6] }),
    gear: mats.solid('odGreen', { color: variant % 2 ? 0x2a2c26 : 0x3a3529, roughness: 0.72 }),
    skin: mats.solid('tan', { color: 0x8a6a52, roughness: 0.78, metalness: 0 }),
    boot: mats.solid('black', { color: 0x141414, roughness: 0.62 }),
    metal: mats.solid('darkSteel', { color: 0x181a1d, roughness: 0.35, metalness: 0.9 }),
  };
}
