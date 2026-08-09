import * as THREE from 'three';
import { WEAPONS, ATTACHMENTS, FIRE_MODE, fireInterval, damageAt } from './weapons/WeaponDefs.js';
import { MODEL_BUILDERS, ATTACHMENT_BUILDERS } from './weapons/Models.js';
import { buildHand, handMaterials, HAND_POSE } from './weapons/Hands.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
// ビューモデル合成専用の一時領域。
// 汎用の _v / _v2 を使うと、途中で呼ぶヘルパが同じ実体を上書きしてしまう。
const _vmBase = new THREE.Vector3();
const _vmAds = new THREE.Vector3();
const _amPos = new THREE.Vector3();
const _amRot = new THREE.Vector3();
// 近接攻撃の判定専用
const _mv1 = new THREE.Vector3();
const _mv2 = new THREE.Vector3();

/**
 * 近接攻撃のパラメータ。
 * 一撃で倒せる間合いを短く保ち、外したときの隙を作る。
 */
const MELEE = { duration: 0.62, range: 2.1, damage: 135 };

/** 武器未装備時に返す既定ステータス（参照側で null チェックを不要にする） */
const EMPTY_STATS = Object.freeze({
  adsTime: 0.25, adsSpreadMul: 1, recoilMul: 1, damageMul: 1, falloffMul: 1,
  opticZoom: 1, silent: false, hideMuzzleFlash: false, pip: false,
});

/** ビューモデルの基本配置（カメラローカル座標） */
const HIP_POS = new THREE.Vector3(0.148, -0.132, -0.30);
const HIP_ROT = new THREE.Euler(0.028, -0.075, 0.022);
const SPRINT_POS = new THREE.Vector3(0.175, -0.175, -0.26);
const SPRINT_ROT = new THREE.Euler(-0.16, 0.62, 0.30);

export class WeaponSystem {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {import('../world/Physics.js').Physics} physics
   * @param {import('../core/Input.js').Input} input
   * @param {import('./PlayerController.js').PlayerController} player
   * @param {import('../render/MaterialLibrary.js').MaterialLibrary} mats
   */
  constructor(engine, physics, input, player, mats) {
    this.engine = engine;
    this.physics = physics;
    this.input = input;
    this.player = player;
    this.mats = mats;

    // カメラに追従するホルダ。この中でビューモデルをローカル配置する。
    this.holder = new THREE.Group();
    engine.viewScene.add(this.holder);

    this.models = new Map();       // weaponId -> {root, anchors}
    this.loadout = [];             // 装備中の武器 id 配列
    this.attachments = {};         // weaponId -> [attachmentId]
    this.current = -1;
    this.def = null;
    this.model = null;

    // 状態
    this.ammo = {};                // weaponId -> {mag, reserve}
    this.firing = false;
    this.ads = false;
    this.adsT = 0;                 // 0..1
    this._fireTimer = 0;
    this._shotIndex = 0;
    this._sinceLastShot = 99;
    this.reloading = false;
    this._reloadT = 0;
    this._reloadDur = 0;
    this._reloadEmpty = false;
    this.swapping = false;
    this._swapT = 0;
    this._pendingSwap = -1;
    this._boltT = 0;
    this._sprintOut = 0;
    this._semiLatch = false;
    /** 近接攻撃の残り時間（0 で待機） */
    this.meleeT = 0;

    // ビューモデル演出
    this._kickPos = new THREE.Vector3();
    this._kickRot = new THREE.Vector3();
    this._kickVel = new THREE.Vector3();
    this._kickRotVel = new THREE.Vector3();
    this._swayPos = new THREE.Vector3();
    this._swayRot = new THREE.Vector3();
    this._bobPhase = 0;
    this._reloadOffset = new THREE.Vector3();
    this._reloadRot = new THREE.Vector3();

    // コールバック（エフェクト・音・ゲームロジックへ接続）
    this.onFire = null;            // (def, origin, dir, muzzleWorld) => void
    this.onHit = null;             // (hitInfo) => void
    this.onReloadStart = null;
    this.onReloadEnd = null;
    this.onSwap = null;
    this.onDryFire = null;
    this.onAdsChange = null;
    this.onAmmoChange = null;
    this.onMelee = null;

    this.enabled = true;
  }

  /* ================= モデル生成 ================= */

  /** 武器マテリアル一式 */
  _materials() {
    if (this._mats) return this._mats;
    const m = this.mats;
    this._mats = {
      metal: m.get('gunMetal', { repeat: [1, 1], normalScale: new THREE.Vector2(0.45, 0.45) }),
      darkMetal: m.solid('darkSteel', { color: 0x15171a, roughness: 0.38, metalness: 1.0 }),
      polymer: m.get('polymer', { repeat: [1, 1] }),
      wood: m.get('woodDark', { repeat: [1, 1] }),
      accent: m.solid('brass'),
      optic: m.solid('darkSteel', { color: 0x101215, roughness: 0.30, metalness: 0.9 }),
      lens: new THREE.MeshPhysicalMaterial({
        color: 0x2a4a6a, roughness: 0.04, metalness: 0.0,
        transmission: 0.55, thickness: 0.004, ior: 1.55,
        transparent: true, side: THREE.DoubleSide,
        iridescence: 0.9, iridescenceIOR: 1.9, iridescenceThicknessRange: [120, 420],
      }),
      default: m.solid('darkSteel'),
    };
    return this._mats;
  }

  /** 手袋・袖のマテリアル一式 */
  _handMaterials() {
    if (!this._handMats) this._handMats = handMaterials(this.mats);
    return this._handMats;
  }

  /** 指定武器のビューモデルを生成（キャッシュ） */
  _getModel(weaponId) {
    if (this.models.has(weaponId)) return this.models.get(weaponId);
    const def = WEAPONS[weaponId];
    const builder = MODEL_BUILDERS[def.model];
    if (!builder) throw new Error(`モデル未定義: ${def.model}`);

    const b = builder();
    const materials = this._materials();
    const root = b.build(materials);
    const anchors = { ...root.userData.anchors };

    // アタッチメントを取り付ける
    const attList = this.attachments[weaponId] || [];
    for (const attId of attList) {
      const ab = ATTACHMENT_BUILDERS[attId];
      if (!ab) continue;
      const attRoot = ab().build(materials);
      const mount = anchors.optic || new THREE.Vector3();
      if (attId === 'suppressor') {
        const mz = anchors.muzzle || new THREE.Vector3();
        attRoot.position.set(mz.x, mz.y, mz.z - 0.085);
        anchors.muzzle = new THREE.Vector3(mz.x, mz.y, mz.z - 0.19);
      } else {
        attRoot.position.copy(mount);
        // 光学サイトのレンズ中心を新しい照準点にする
        const lens = attRoot.userData.anchors?.lens;
        if (lens) anchors.sight = new THREE.Vector3(mount.x + lens.x, mount.y + lens.y, mount.z + lens.z);
      }
      root.add(attRoot);
    }

    /*
     * 手を付ける。
     *
     * 以前はビューモデルが銃だけで、画面の中で武器が宙に浮いていた。
     * 一人称視点で常時 3 割を占める要素なので、腕が無いと
     * リロードも構えも「浮いた物体の平行移動」にしか見えない。
     *
     * 手は銃の子にする。こうしておけば、反動・構え・持ち替えの
     * どの動きも銃と手が必ず一緒に動き、ずれようがない。
     * 銃と別に動かす必要があるのはリロードの左手だけで、
     * それは _reloadPose が握り位置を上書きして表現する。
     */
    const pose = HAND_POSE[def.model];
    if (pose) {
      const hm = this._handMaterials();
      const hands = {};
      for (const [key, side, grip] of [['grip', 1, 'pistol'], ['support', -1, 'support']]) {
        const p = pose[key];
        const rot = pose[key === 'grip' ? 'gripRot' : 'supportRot'] || [0, 0, 0];
        const h = buildHand(hm, side, {
          grip: key === 'support' ? (pose.supportGrip || grip) : grip,
        });
        h.position.set(p[0], p[1], p[2]);
        h.rotation.set(rot[0], rot[1], rot[2]);
        root.add(h);
        hands[key] = h;
      }
      root.userData.hands = hands;
      // 支え手の定位置。リロードで動かしたあと、ここへ戻す
      root.userData.supportHome = new THREE.Vector3(...pose.support);
    }

    // ビューモデルは影を落とさない（自己遮蔽で汚くなるため）
    root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });

    const entry = { root, anchors, attachments: attList, hands: root.userData.hands || null };
    this.models.set(weaponId, entry);
    return entry;
  }

  /* ================= ロードアウト ================= */

  /**
   * @param {string[]} weaponIds 装備する武器（0=メイン, 1=サブ）
   * @param {Record<string,string[]>} attachments
   */
  setLoadout(weaponIds, attachments = {}) {
    // 既存モデルを破棄
    for (const { root } of this.models.values()) root.parent?.remove(root);
    this.models.clear();

    this.loadout = weaponIds.filter((id) => WEAPONS[id]);
    this.attachments = attachments;
    this.ammo = {};
    for (const id of this.loadout) {
      const d = WEAPONS[id];
      this.ammo[id] = { mag: d.magSize, reserve: d.reserveAmmo };
    }
    this.current = -1;
    this.equip(0, true);
  }

  /** 武器を持ち替える */
  equip(index, instant = false) {
    if (index < 0 || index >= this.loadout.length) return;
    if (index === this.current && !instant) return;

    if (instant) {
      this._applyEquip(index);
      this.swapping = false;
      this._swapT = 0;
      return;
    }
    if (this.swapping) return;
    this.swapping = true;
    this._pendingSwap = index;
    this._swapT = 0;
    this.reloading = false;
    this.ads = false;
  }

  _applyEquip(index) {
    if (this.model) this.holder.remove(this.model.root);
    this.current = index;
    const id = this.loadout[index];
    this.def = WEAPONS[id];
    this.model = this._getModel(id);
    this.holder.add(this.model.root);
    this._shotIndex = 0;
    this._fireTimer = 0;
    this._boltT = 0;
    this.onSwap?.(this.def);
    this.onAmmoChange?.(this.getAmmo());
  }

  /**
   * 進行中の動作（覗き込み・リロード・近接・持ち替え）を全て畳む。
   * 死亡時とリスポーン時に呼ぶ。特に覗き込みは、
   * 進行度を残したままにするとスコープの黒縁が画面を覆い続ける。
   */
  resetState() {
    this.ads = false;
    this.adsT = 0;
    this.reloading = false;
    this._reloadT = 0;
    this.meleeT = 0;
    this.swapping = false;
    this._swapT = 0;
    this._pendingSwap = -1;
    this._boltT = 0;
    this._sprintOut = 0;
    this._semiLatch = false;
    this.firing = false;
    this._reloadOffset.set(0, 0, 0);
    this._reloadRot.set(0, 0, 0);
    if (this.model) this.model.root.visible = true;
    this.engine.setFov(this.player.baseFov ?? 80);
  }

  /** 次 / 前の武器へ */
  nextWeapon() { this.equip((this.current + 1) % this.loadout.length); }
  prevWeapon() { this.equip((this.current - 1 + this.loadout.length) % this.loadout.length); }

  getAmmo() {
    const id = this.loadout[this.current];
    return id ? { ...this.ammo[id], weapon: this.def } : { mag: 0, reserve: 0, weapon: null };
  }

  /** 装備中武器の実効ステータス（アタッチメント補正込み） */
  getStats() {
    // 装備前や持ち替えの隙間で参照されても落ちないようにする
    if (!this.def) return EMPTY_STATS;
    if (!this._statsCache || this._statsCacheFor !== this.loadout[this.current]) {
      const def = this.def;
      const atts = (this.attachments[def.id] || []).map((a) => ATTACHMENTS[a]).filter(Boolean);
      const s = {
        adsTime: def.adsTime,
        adsSpreadMul: 1,
        recoilMul: 1,
        damageMul: 1,
        falloffMul: 1,
        opticZoom: 1,
        silent: false,
        hideMuzzleFlash: false,
        pip: false,
      };
      for (const a of atts) {
        const m = a.mods || {};
        s.adsTime += m.adsTime || 0;
        s.adsSpreadMul *= m.adsSpreadMul ?? 1;
        s.recoilMul *= m.recoilMul ?? 1;
        s.damageMul *= m.damageMul ?? 1;
        s.falloffMul *= m.falloffMul ?? 1;
        if (a.opticZoom) s.opticZoom = a.opticZoom;
        if (a.silent) s.silent = true;
        if (a.hideMuzzleFlash) s.hideMuzzleFlash = true;
        if (a.pip) s.pip = true;
      }
      if (def.scope) {
        s.opticZoom = Math.max(s.opticZoom, def.scope.magnification);
        s.pip = true;   // 狙撃銃は光学サイト前提
      }
      this._statsCache = s;
      this._statsCacheFor = def.id;
    }
    return this._statsCache;
  }

  /* ================= 更新 ================= */

  update(dt) {
    if (!this.def) return;
    /*
     * enabled が false（死亡中）でも、覗き込みの進行度や
     * ビューモデルの姿勢は戻し続ける必要がある。
     * 入力の読み取りだけを止める。
     */
    if (!this.enabled) {
      this.adsT = Math.max(0, this.adsT - dt * 6);
      this.ads = false;
      this.meleeT = Math.max(0, this.meleeT - dt);
      this._updateViewModel(dt);
      return;
    }

    this._sinceLastShot += dt;
    if (this._fireTimer > 0) this._fireTimer -= dt;
    if (this._boltT > 0) this._boltT -= dt;

    this._updateWeaponSelect();
    this._updateSwap(dt);
    this._updateSprintOut(dt);
    this._updateMelee(dt);
    this._updateAds(dt);
    this._updateReload(dt);
    this._updateFire(dt);
    this._updateRecoilRecovery(dt);
    this._updateViewModel(dt);
  }

  /**
   * 武器の持ち替え入力。
   * ホイール・数字キー・スマホの切替ボタンのいずれからも同じ経路を通す。
   */
  _updateWeaponSelect() {
    if (!this.player.alive) return;
    const inp = this.input;
    if (inp.pressed('nextWeapon')) this.nextWeapon();
    else if (inp.pressed('prevWeapon')) this.prevWeapon();
    else if (inp.pressed('weapon1')) this.equip(0);
    else if (inp.pressed('weapon2')) this.equip(1);
  }

  /**
   * 近接攻撃。
   * 銃を構えたまま素早く突き出す動作で、射撃より短い間合いを埋める。
   * 命中判定は振り抜きの中盤で 1 度だけ行う。
   */
  _updateMelee(dt) {
    if (this.meleeT > 0) {
      const prev = this.meleeT;
      this.meleeT = Math.max(0, this.meleeT - dt);
      // 振りの中盤で判定（見た目と当たりのタイミングを合わせる）
      const hitAt = MELEE.duration * 0.55;
      if (prev > hitAt && this.meleeT <= hitAt) this._resolveMelee();
      return;
    }
    if (!this.input.pressed('melee')) return;
    if (!this.player.alive || this.swapping || this.player.mantling) return;

    this.meleeT = MELEE.duration;
    this.reloading = false;
    this.ads = false;
    this.onMelee?.();
  }

  _resolveMelee() {
    const origin = this.player.getEyePosition(_mv1);
    // 画面中央の向きをそのまま使う（反動や揺れも含めた実際の照準方向）
    this.engine.camera.getWorldDirection(_mv2);

    const charHit = this.characterRaycast?.(origin, _mv2, MELEE.range);
    const worldHit = this.physics.raycast(origin, _mv2, MELEE.range);
    // 壁越しには当てない
    if (charHit && (!worldHit || charHit.dist <= worldHit.dist)) {
      this.onHit?.({
        type: 'char', target: charHit.target, point: charHit.point, normal: charHit.normal,
        zone: charHit.zone, damage: MELEE.damage, surface: 'fabric', melee: true,
      });
    } else if (worldHit) {
      this.onHit?.({
        type: 'world', point: worldHit.point, normal: worldHit.normal,
        surface: worldHit.collider.surface, melee: true,
      });
    }
  }

  _updateSwap(dt) {
    if (!this.swapping) return;
    this._swapT += dt;
    const half = this.def.swapTime * 0.45;
    if (this._pendingSwap >= 0 && this._swapT >= half) {
      this._applyEquip(this._pendingSwap);
      this._pendingSwap = -1;
    }
    if (this._swapT >= this.def.swapTime) {
      this.swapping = false;
      this._swapT = 0;
    }
  }

  _updateSprintOut(dt) {
    // スプリント中は構えを解き、解除後に射撃可能まで少し待つ
    if (this.player.sprinting || this.player.sliding) {
      this._sprintOut = this.def.sprintOutTime;
    } else if (this._sprintOut > 0) {
      this._sprintOut = Math.max(0, this._sprintOut - dt);
    }
  }

  get canFire() {
    return !this.reloading && !this.swapping && this._sprintOut <= 0 && this.meleeT <= 0
      && this._fireTimer <= 0 && this._boltT <= 0 && this.player.alive && !this.player.mantling;
  }

  _updateAds(dt) {
    const stats = this.getStats();
    const want = this.input.down('ads')
      && !this.player.sprinting && !this.player.sliding
      && !this.swapping && this._sprintOut <= 0 && this.meleeT <= 0 && this.player.alive;

    if (want !== this.ads) {
      this.ads = want;
      this.onAdsChange?.(want, stats);
    }
    const speed = 1 / Math.max(0.04, stats.adsTime);
    this.adsT += (want ? 1 : -1) * speed * dt;
    this.adsT = Math.max(0, Math.min(1, this.adsT));

    // 視野角（ズーム）
    const base = this.player.baseFov ?? 80;
    const zoom = stats.opticZoom;
    const adsFov = base / Math.max(1, zoom * 0.92);
    const e = this.adsT * this.adsT * (3 - 2 * this.adsT);
    if (this.adsT > 0.001) this.engine.setFov(base + (adsFov - base) * e);
    this.player.ads = this.adsT > 0.5;
  }

  _updateReload(dt) {
    const id = this.loadout[this.current];
    const a = this.ammo[id];

    if (!this.reloading) {
      const want = this.input.pressed('reload');
      const autoReload = a.mag === 0 && this.input.down('fire');
      if ((want || autoReload) && a.mag < this.def.magSize && a.reserve > 0 && !this.swapping) {
        this._startReload();
      }
      return;
    }

    this._reloadT += dt;
    if (this._reloadT >= this._reloadDur) {
      if (this.def.shellReload) {
        // 1 発ずつ装填。満タンか予備切れ、または射撃入力で中断。
        a.mag += 1; a.reserve -= 1;
        this.onAmmoChange?.(this.getAmmo());
        if (a.mag >= this.def.magSize || a.reserve <= 0 || this.input.down('fire')) {
          this.reloading = false;
          this._boltT = 0.28;
          this.onReloadEnd?.(this.def);
        } else {
          this._reloadT = 0;
        }
      } else {
        const need = this.def.magSize - a.mag;
        const give = Math.min(need, a.reserve);
        a.mag += give; a.reserve -= give;
        this.reloading = false;
        this.onReloadEnd?.(this.def);
        this.onAmmoChange?.(this.getAmmo());
      }
    }
  }

  _startReload() {
    const id = this.loadout[this.current];
    const a = this.ammo[id];
    this.reloading = true;
    this._reloadT = 0;
    this._reloadEmpty = a.mag === 0;
    this._reloadDur = this._reloadEmpty ? this.def.reloadEmptyTime : this.def.reloadTime;
    this.ads = false;
    this.onReloadStart?.(this.def, this._reloadEmpty, this._reloadDur);
  }

  _updateFire(dt) {
    const id = this.loadout[this.current];
    const a = this.ammo[id];
    const mode = this.def.fireMode;
    const held = this.input.down('fire');

    if (!held) this._semiLatch = false;

    if (!held || !this.canFire) {
      if (!held) this._shotIndexDecay(dt);
      return;
    }

    // 単発系は 1 回押すごとに 1 発
    if (mode !== FIRE_MODE.AUTO) {
      if (this._semiLatch) return;
      this._semiLatch = true;
    }

    if (a.mag <= 0) {
      this.onDryFire?.(this.def);
      this._fireTimer = 0.28;
      return;
    }

    this._shoot();
  }

  _shotIndexDecay(dt) {
    // 撃つのをやめると反動パターンの位置が戻る
    if (this._sinceLastShot > 0.32 && this._shotIndex > 0) {
      this._shotIndex = Math.max(0, this._shotIndex - dt * 14);
    }
  }

  _shoot() {
    const def = this.def;
    const stats = this.getStats();
    const id = this.loadout[this.current];
    const a = this.ammo[id];

    a.mag -= 1;
    this._fireTimer = fireInterval(def);
    if (def.fireMode === FIRE_MODE.BOLT) this._boltT = def.boltTime;
    if (def.fireMode === FIRE_MODE.PUMP) this._boltT = def.pumpTime;
    this._sinceLastShot = 0;

    // --- 拡散 ---
    const sp = def.spread;
    let spread = this.adsT > 0.6 ? sp.ads * stats.adsSpreadMul : sp.hip;
    const p = this.player;
    if (!p.grounded) spread *= sp.airMul;
    else if (p.speed2D > 0.6) spread *= 1 + (sp.moveMul - 1) * Math.min(1, p.speed2D / 4.4);
    if (p.stance === 1) spread *= sp.crouchMul;
    if (p.stance === 2) spread *= sp.crouchMul * 0.7;

    // --- 射線 ---
    const origin = p.getEyePosition(_v);
    const baseDir = p.getLookDirection(_v2);

    const pellets = def.pellets || 1;
    const hits = [];
    for (let i = 0; i < pellets; i++) {
      const dir = baseDir.clone();
      if (spread > 0) {
        // 円内一様分布（中心に寄りすぎない自然な散らばり）
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(dir, up).normalize();
        const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
        dir.addScaledVector(right, Math.cos(ang) * r).addScaledVector(upv, Math.sin(ang) * r).normalize();
      }
      const hit = this._traceShot(origin, dir, def, stats);
      if (hit) hits.push(hit);
    }

    // --- 反動 ---
    this._applyRecoil(stats);

    // --- ビューモデルのキック ---
    const k = def.kick;
    this._kickVel.z += k.back * 62;
    this._kickRotVel.x -= k.up * 62;
    this._kickRotVel.z += (Math.random() - 0.5) * k.roll * 42;
    this._kickRotVel.y += (Math.random() - 0.5) * k.roll * 20;

    // --- 通知 ---
    const muzzle = this.getMuzzleWorld(_v2.clone());
    this.onFire?.(def, origin.clone(), baseDir.clone(), muzzle, hits, stats);
    this.onAmmoChange?.(this.getAmmo());

    this._shotIndex++;
    this.player.addShake(def.kick.up * 1.4, 0.1);
  }

  /** 1 本の弾道を解決する */
  _traceShot(origin, dir, def, stats) {
    const maxDist = 320;
    let remaining = maxDist;
    let pos = origin.clone();
    let penetrationLeft = def.penetration;
    let damageMul = stats.damageMul;

    for (let bounce = 0; bounce < 3; bounce++) {
      // キャラクタ（ボット・プレイヤー）との判定は外部から差し込む
      const charHit = this.characterRaycast?.(pos, dir, remaining);
      const worldHit = this.physics.raycast(pos, dir, remaining);

      const useChar = charHit && (!worldHit || charHit.dist < worldHit.dist);
      if (useChar) {
        const dist = origin.distanceTo(charHit.point);
        const dmg = damageAt(def, dist, charHit.zone) * damageMul;
        const info = {
          type: 'character', target: charHit.target, point: charHit.point,
          normal: charHit.normal, zone: charHit.zone, damage: dmg, dist, dir: dir.clone(),
        };
        this.onHit?.(info);
        return info;
      }
      if (!worldHit) return null;

      const dist = origin.distanceTo(worldHit.point);
      const info = {
        type: 'world', point: worldHit.point, normal: worldHit.normal,
        surface: worldHit.collider.surface, dist, dir: dir.clone(), collider: worldHit.collider,
      };
      this.onHit?.(info);

      // 貫通判定（薄い板のみ）
      const wallPen = worldHit.collider.penetration || 0;
      if (wallPen <= 0 || penetrationLeft <= 0) return info;
      penetrationLeft -= (1 - wallPen);
      damageMul *= 0.62;
      remaining -= worldHit.dist + 0.05;
      pos = worldHit.point.clone().addScaledVector(dir, 0.06);
      if (remaining <= 0) return info;
    }
    return null;
  }

  _applyRecoil(stats) {
    const r = this.def.recoil;
    const pattern = r.pattern || [[1, 0]];
    const idx = Math.min(Math.floor(this._shotIndex), pattern.length - 1);
    const [pv, ph] = pattern[idx];

    let mul = stats.recoilMul * (this.adsT > 0.6 ? r.adsMul : 1);
    if (this._shotIndex === 0) mul *= r.firstShotMul;
    if (this.player.stance === 1) mul *= 0.82;
    if (this.player.stance === 2) mul *= 0.62;

    const rand = (Math.random() - 0.5) * 2 * r.randomness;
    const vert = r.vertical * pv * mul;
    const horiz = (r.horizontal * ph + r.horizontal * rand) * mul;

    this.player.addRecoil(vert, horiz);
    this._recoilPitchAccum = (this._recoilPitchAccum || 0) + vert;
  }

  _updateRecoilRecovery(dt) {
    if (this._recoilPitchAccum > 0 && this._sinceLastShot > 0.09) {
      const rec = this.def.recoil.recovery * dt;
      const back = Math.min(this._recoilPitchAccum, this._recoilPitchAccum * rec);
      this._recoilPitchAccum -= back;
    }
  }

  /* ================= ビューモデル ================= */

  getMuzzleWorld(out = new THREE.Vector3()) {
    if (!this.model) return out.set(0, 0, 0);
    const a = this.model.anchors.muzzle || new THREE.Vector3();
    out.copy(a);
    this.model.root.localToWorld(out);
    return out;
  }

  _updateViewModel(dt) {
    if (!this.model) return;
    const cam = this.engine.camera;
    this.holder.position.copy(cam.position);
    this.holder.quaternion.copy(cam.quaternion);

    const root = this.model.root;
    const p = this.player;
    const stats = this.getStats();

    /* --- 基本姿勢の補間: 腰だめ ⇔ ADS ⇔ スプリント --- */
    const sprintT = (p.sprinting || p.sliding) ? 1 : 0;
    this._sprintT = this._sprintT ?? 0;
    this._sprintT += (sprintT - this._sprintT) * Math.min(1, 11 * dt);

    // ADS 位置は照準点がカメラ中心に来るよう逆算する
    const sight = this.model.anchors.sight || new THREE.Vector3(0, 0.08, 0);
    const adsPos = _vmAds.set(-sight.x, -sight.y, -0.16 - stats.opticZoom * 0.004);
    const adsRot = _e.set(0, 0, 0);

    const e = this.adsT * this.adsT * (3 - 2 * this.adsT);
    const basePos = _vmBase.copy(HIP_POS).lerp(adsPos, e);
    const rx = HIP_ROT.x * (1 - e) + adsRot.x * e;
    const ry = HIP_ROT.y * (1 - e) + adsRot.y * e;
    const rz = HIP_ROT.z * (1 - e) + adsRot.z * e;

    // スプリント姿勢を上書き合成
    const s = this._sprintT * (1 - e);
    basePos.lerp(SPRINT_POS, s);
    const frx = rx * (1 - s) + SPRINT_ROT.x * s;
    const fry = ry * (1 - s) + SPRINT_ROT.y * s;
    const frz = rz * (1 - s) + SPRINT_ROT.z * s;

    /* --- 慣性スウェイ（視点移動に対する追従遅れ） --- */
    const ld = this.input.lookDelta;
    const swayScale = (1 - e * 0.78);
    this._swayPos.x += (-ld.x * 0.55 * swayScale - this._swayPos.x) * Math.min(1, 9 * dt);
    this._swayPos.y += (ld.y * 0.45 * swayScale - this._swayPos.y) * Math.min(1, 9 * dt);
    this._swayRot.y += (ld.x * 1.15 * swayScale - this._swayRot.y) * Math.min(1, 8 * dt);
    this._swayRot.x += (-ld.y * 0.95 * swayScale - this._swayRot.x) * Math.min(1, 8 * dt);
    this._swayRot.z += (-ld.x * 0.85 * swayScale - this._swayRot.z) * Math.min(1, 7 * dt);

    /* --- 歩行に伴う揺れ --- */
    const moveAmt = p.grounded ? Math.min(1, p.speed2D / 4.4) : 0;
    const bobScale = (1 - e * 0.85) * (0.5 + this._sprintT * 0.9);
    this._bobPhase += dt * (p.sprinting ? 10.4 : 7.6) * (0.5 + moveAmt * 0.7);
    const bobX = Math.cos(this._bobPhase) * 0.016 * moveAmt * bobScale;
    const bobY = Math.sin(this._bobPhase * 2) * 0.011 * moveAmt * bobScale;
    const bobRZ = Math.cos(this._bobPhase) * 0.022 * moveAmt * bobScale;

    /* --- 呼吸（ADS 時に強く出る） --- */
    this._breath = (this._breath || 0) + dt * (p.stamina < 1.5 ? 3.0 : 1.25);
    const breathAmp = e * (0.0012 + (1 - p.stamina / 5.2) * 0.0032);
    const brX = Math.sin(this._breath * 1.3) * breathAmp;
    const brY = Math.cos(this._breath) * breathAmp;

    /* --- 発砲キック（バネ） --- */
    const stiff = 128, damp = 15.5;
    this._kickVel.addScaledVector(this._kickPos, -stiff * dt);
    this._kickVel.multiplyScalar(1 - Math.min(1, damp * dt));
    this._kickPos.addScaledVector(this._kickVel, dt);

    this._kickRotVel.addScaledVector(this._kickRot, -stiff * dt);
    this._kickRotVel.multiplyScalar(1 - Math.min(1, damp * dt));
    this._kickRot.addScaledVector(this._kickRotVel, dt);

    /* --- リロード / 持ち替えのモーション --- */
    this._updateActionMotion(dt);

    /* --- 合成 --- */
    root.position.set(
      basePos.x + this._swayPos.x + bobX + this._kickPos.x + this._reloadOffset.x + brX,
      basePos.y + this._swayPos.y + bobY + this._kickPos.y + this._reloadOffset.y + brY,
      basePos.z + this._kickPos.z + this._reloadOffset.z
    );
    root.rotation.set(
      frx + this._swayRot.x + this._kickRot.x + this._reloadRot.x,
      fry + this._swayRot.y + this._kickRot.y + this._reloadRot.y,
      frz + this._swayRot.z + bobRZ + this._kickRot.z + this._reloadRot.z,
      'YXZ'
    );

    // スコープを覗いている間は銃を隠す。
    // 実際のスコープ視界では銃本体は見えないため、写り込むと没入感を損なう。
    root.visible = !this.isScoped;
  }

  /**
   * スコープ内の揺れ（画素）。
   * 息を止められない状態（スタミナ低下）ほど大きく揺れる。
   */
  getScopeSway(out = { x: 0, y: 0 }) {
    const stam = 1 - Math.max(0, Math.min(1, this.player.stamina / 5.2));
    const amp = 2.0 + stam * 8.5;
    const t = this._breath || 0;
    out.x = Math.sin(t * 1.15) * amp + Math.sin(t * 2.7) * amp * 0.28;
    out.y = Math.cos(t * 0.86) * amp * 0.72 + Math.cos(t * 2.1) * amp * 0.2;
    return out;
  }

  _updateActionMotion(dt) {
    const target = _amPos.set(0, 0, 0);
    const targetRot = _amRot.set(0, 0, 0);

    if (this.meleeT > 0) {
      /*
       * 近接: 引く → 突き出す → 戻す。
       * 判定は MELEE.duration * 0.55 の時点なので、
       * 突き出しの頂点がそこに来るよう曲線を作る。
       */
      const t = 1 - this.meleeT / MELEE.duration;   // 0..1
      const wind = Math.min(1, t / 0.35);            // 引き
      const thrust = t < 0.35 ? 0 : Math.sin(Math.min(1, (t - 0.35) / 0.45) * Math.PI);
      target.set(
        0.045 * wind - 0.115 * thrust,
        -0.030 * wind + 0.022 * thrust,
        0.070 * wind - 0.230 * thrust
      );
      targetRot.set(
        -0.20 * wind + 0.16 * thrust,
        0.55 * wind - 0.72 * thrust,
        -0.42 * wind + 0.30 * thrust
      );
      // 近接は素早い動きなので追従も速くする
      this._reloadOffset.lerp(target, Math.min(1, 26 * dt));
      this._reloadRot.lerp(targetRot, Math.min(1, 26 * dt));
      return;
    }

    if (this.reloading) {
      const t = this._reloadT / Math.max(0.01, this._reloadDur);
      // 下げる → マガジン交換 → 戻す
      const dip = Math.sin(Math.min(1, t * 1.35) * Math.PI) ;
      target.set(0.012 * dip, -0.075 * dip, 0.028 * dip);
      targetRot.set(0.36 * dip, 0.30 * dip, -0.26 * dip);
      // 中盤に細かい揺れ（マガジン挿入の衝撃）
      if (t > 0.42 && t < 0.58) {
        const k = Math.sin((t - 0.42) / 0.16 * Math.PI);
        target.y -= 0.012 * k;
        targetRot.x += 0.09 * k;
      }
    } else if (this.swapping) {
      const t = this._swapT / Math.max(0.01, this.def.swapTime);
      // 前半で下げ、後半で上げる
      const d = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
      target.set(0, -0.22 * d, 0.02 * d);
      targetRot.set(0.72 * d, 0.18 * d, -0.10 * d);
    } else if (this._boltT > 0 && (this.def.fireMode === 'bolt' || this.def.fireMode === 'pump')) {
      const dur = this.def.boltTime || this.def.pumpTime || 0.6;
      const t = 1 - this._boltT / dur;
      const k = Math.sin(t * Math.PI);
      target.set(0.008 * k, -0.016 * k, 0.030 * k);
      targetRot.set(0.10 * k, 0.13 * k, -0.06 * k);
    }

    const k = Math.min(1, 13 * dt);
    this._reloadOffset.lerp(target, k);
    this._reloadRot.lerp(targetRot, k);
  }

  /** ADS の進行度（0..1）。UI・ポストエフェクトから参照する。 */
  get adsProgress() { return this.adsT; }

  /** スコープ（PiP）表示中か */
  get isScoped() {
    return !!this.def && this.adsT > 0.82 && this.getStats().pip;
  }

  dispose() {
    for (const { root } of this.models.values()) root.parent?.remove(root);
    this.models.clear();
    this.holder.parent?.remove(this.holder);
  }
}
