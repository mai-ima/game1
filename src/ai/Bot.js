import * as THREE from 'three';
import { Character, buildSoldier, soldierMaterials, HIT_ZONE } from './Character.js';
import { WEAPONS, damageAt, fireInterval } from '../player/weapons/WeaponDefs.js';

/**
 * 対戦用ボット。
 *
 * 経路探索はナビメッシュを持たず、
 *   目標方向へのステアリング + ひげレイによる障害物回避
 * で解決する。屋内外が混在するコンパウンド規模では十分に機能し、
 * 事前ベイクが不要なためマップ追加が容易。
 */

export const BOT_STATE = {
  IDLE: 'idle', PATROL: 'patrol', SEEK: 'seek',
  ENGAGE: 'engage', COVER: 'cover', RELOAD: 'reload', DEAD: 'dead',
};

/** 難易度プリセット */
export const DIFFICULTY = {
  recruit:  { name: '新兵',   aimError: 0.075, reaction: 0.62, burstMin: 2, burstMax: 4, aimSpeed: 3.2,  accuracy: 0.55, hp: 100, fovDeg: 105, sight: 55, lead: 0.3 },
  regular:  { name: '正規兵', aimError: 0.042, reaction: 0.40, burstMin: 3, burstMax: 6, aimSpeed: 5.0,  accuracy: 0.72, hp: 100, fovDeg: 115, sight: 70, lead: 0.6 },
  veteran:  { name: '古参兵', aimError: 0.024, reaction: 0.26, burstMin: 4, burstMax: 8, aimSpeed: 7.0,  accuracy: 0.84, hp: 100, fovDeg: 125, sight: 85, lead: 0.85 },
  elite:    { name: '特殊部隊', aimError: 0.013, reaction: 0.17, burstMin: 5, burstMax: 11, aimSpeed: 9.5, accuracy: 0.92, hp: 100, fovDeg: 135, sight: 100, lead: 1.0 },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();

let _nextId = 1;

export class Bot {
  /**
   * @param {object} ctx {scene, physics, effects, mats, game}
   * @param {object} opt {team, difficulty, weaponId, name}
   */
  constructor(ctx, opt = {}) {
    this.id = _nextId++;
    this.ctx = ctx;
    this.team = opt.team ?? 'B';
    this.name = opt.name || `BOT-${String(this.id).padStart(2, '0')}`;
    this.diff = DIFFICULTY[opt.difficulty] || DIFFICULTY.regular;
    this.weaponId = opt.weaponId || 'm4a1';
    this.weapon = WEAPONS[this.weaponId];

    const teamColor = this.team === 'A' ? 0x2f6fb8 : 0xb84a2f;
    const model = buildSoldier(soldierMaterials(ctx.mats, this.id % 3), teamColor);
    ctx.scene.add(model);
    this.char = new Character(model);
    this.char.model.visible = false;

    // ステータス
    this.hp = this.diff.hp;
    this.maxHp = this.diff.hp;
    this.alive = false;
    this.state = BOT_STATE.IDLE;
    this.kills = 0;
    this.deaths = 0;
    this.score = 0;

    // 移動
    this.radius = 0.34;
    this.height = 1.78;
    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.moveTarget = null;
    this.moveSpeed = 4.0;
    this._repathT = 0;
    this._stuckT = 0;
    this._lastPos = new THREE.Vector3();
    this._strafeDir = Math.random() < 0.5 ? -1 : 1;
    this._strafeT = 0;

    // 知覚
    this.targetEnemy = null;
    this.lastSeenPos = new THREE.Vector3();
    this.lastSeenTime = -99;
    this._reactionT = 0;
    this._losT = 0;

    // 射撃
    this.ammo = this.weapon.magSize;
    this.reserve = this.weapon.reserveAmmo;
    this._fireTimer = 0;
    this._burstLeft = 0;
    this._burstPauseT = 0;
    this._reloadT = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this._aimNoise = new THREE.Vector3();
    this._noisePhase = Math.random() * 100;

    this.respawnTimer = 0;
  }

  /*
   * ターゲットとしての共通インタフェース。
   * Game / 他のボットは「プレイヤーもボットも同じ形」で扱えることを前提に
   * position / getEyePosition を参照するため、char へ委譲しておく。
   */
  get position() { return this.char.position; }
  getEyePosition(out) { return this.char.getEyePosition(out); }

  /* ================= 生死 ================= */

  spawn(pos, yaw = 0) {
    this.char.position.copy(pos);
    this.char.yaw = this.aimYaw = yaw;
    this.char.pitch = this.aimPitch = 0;
    this.char.alive = true;
    this.char._deathT = 0;
    this.char.model.visible = true;
    this.char.model.rotation.set(0, yaw, 0);
    this.alive = true;
    this.hp = this.maxHp;
    this.velocity.set(0, 0, 0);
    this.state = BOT_STATE.PATROL;
    this.targetEnemy = null;
    this.ammo = this.weapon.magSize;
    this.reserve = this.weapon.reserveAmmo;
    this._reloadT = 0;
    this.moveTarget = null;
    this._lastPos.copy(pos);
  }

  /**
   * ダメージを与える。
   * @returns {boolean} これで倒れたか
   */
  damage(amount, from, zone = HIT_ZONE.BODY) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.char.onHit();

    // 撃たれたら反撃対象にする（背後からでも気づく）
    if (from && !this.targetEnemy) {
      this.targetEnemy = from;
      this.lastSeenPos.copy(from.position ?? from.char?.position ?? this.char.position);
      this.lastSeenTime = this.ctx.game?.time ?? 0;
      this._reactionT = this.diff.reaction * 0.55;
    }

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    this.hp = 0;
    this.deaths++;
    this.state = BOT_STATE.DEAD;
    this.char.alive = false;
    this.char._deathT = 0;
    this.velocity.set(0, 0, 0);
    this.respawnTimer = 0;
  }

  hide() { this.char.model.visible = false; }

  /* ================= 更新 ================= */

  /**
   * 影を落とすかを距離で切り替える。
   * 影パスは本描画と同じ数のドローコールを消費するため、
   * 遠方のボットまで影を出すと描画コストが倍増する。
   */
  updateShadowLod(cameraPos, maxDist = 26) {
    const on = this.alive && this.char.position.distanceToSquared(cameraPos) < maxDist * maxDist;
    if (on === this._shadowOn) return;
    this._shadowOn = on;
    this.char.model.traverse((o) => { if (o.isMesh) o.castShadow = on; });
  }

  update(dt, world) {
    if (!this.alive) {
      this.char.update(dt, false);
      this.respawnTimer += dt;
      // 一定時間後にモデルを隠す（死体は残しすぎない）
      if (this.respawnTimer > 6) this.hide();
      return;
    }

    this._perceive(dt, world);
    this._think(dt, world);
    this._move(dt);
    this._aim(dt);
    this._shoot(dt, world);

    this.char.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.char.update(dt, this.state === BOT_STATE.ENGAGE || this.state === BOT_STATE.COVER);
  }

  /* ---------------- 知覚 ---------------- */

  _perceive(dt, world) {
    const now = world.time;
    const myEye = this.char.getEyePosition(_v);

    let best = null, bestD = Infinity;
    for (const e of world.enemiesOf(this.team)) {
      if (!e.alive) continue;
      const ep = e.getEyePosition ? e.getEyePosition(_v2) : _v2.copy(e.position);
      const d = myEye.distanceTo(ep);
      if (d > this.diff.sight) continue;

      // 視野角
      _dir.copy(ep).sub(myEye).normalize();
      const fwd = _v3.set(-Math.sin(this.aimYaw), 0, -Math.cos(this.aimYaw));
      const dot = fwd.x * _dir.x + fwd.z * _dir.z;
      const cosFov = Math.cos(THREE.MathUtils.degToRad(this.diff.fovDeg) / 2);
      const inFov = dot > cosFov;
      // 近距離は視野外でも気配で気づく
      const close = d < 7;
      if (!inFov && !close) continue;

      // 遮蔽判定
      if (this.ctx.physics.losBlocked(myEye, ep)) continue;

      if (d < bestD) { bestD = d; best = e; }
    }

    if (best) {
      if (this.targetEnemy !== best) {
        this.targetEnemy = best;
        this._reactionT = this.diff.reaction * (0.7 + Math.random() * 0.6);
      }
      const ep = best.getEyePosition ? best.getEyePosition(_v2) : _v2.copy(best.position);
      this.lastSeenPos.copy(ep);
      this.lastSeenTime = now;
      this._losT = 0;
    } else {
      this._losT += dt;
      // しばらく見失ったら追跡をやめる
      if (this._losT > 5.5) this.targetEnemy = null;
    }

    if (this._reactionT > 0) this._reactionT -= dt;
  }

  /* ---------------- 意思決定 ---------------- */

  _think(dt, world) {
    const now = world.time;
    const hasTarget = !!this.targetEnemy && this.targetEnemy.alive;
    const seenRecently = now - this.lastSeenTime < 1.2;

    // リロード
    if (this._reloadT > 0) {
      this._reloadT -= dt;
      this.state = BOT_STATE.RELOAD;
      if (this._reloadT <= 0) {
        const need = this.weapon.magSize - this.ammo;
        const give = Math.min(need, this.reserve);
        this.ammo += give; this.reserve -= give;
      }
      return;
    }
    if (this.ammo <= 0 && this.reserve > 0) {
      this._reloadT = this.weapon.reloadEmptyTime;
      this.state = BOT_STATE.RELOAD;
      return;
    }

    if (hasTarget && seenRecently) {
      this.state = BOT_STATE.ENGAGE;
      this._engagePositioning(dt);
    } else if (hasTarget) {
      this.state = BOT_STATE.SEEK;
      this.moveTarget = _v.copy(this.lastSeenPos).setY(0).clone();
    } else {
      if (this.state !== BOT_STATE.PATROL || !this.moveTarget) {
        this.state = BOT_STATE.PATROL;
        this._repathT -= dt;
        if (this._repathT <= 0 || !this.moveTarget) {
          this.moveTarget = world.randomPatrolPoint(this.char.position);
          this._repathT = 6 + Math.random() * 6;
        }
      } else {
        this._repathT -= dt;
        if (this._repathT <= 0) {
          this.moveTarget = world.randomPatrolPoint(this.char.position);
          this._repathT = 6 + Math.random() * 6;
        }
      }
    }

    // 目標に着いたら次へ
    if (this.moveTarget) {
      const d = Math.hypot(this.moveTarget.x - this.char.position.x, this.moveTarget.z - this.char.position.z);
      if (d < 1.4) {
        this.moveTarget = null;
        this._repathT = 0;
      }
    }
  }

  /** 交戦中の立ち回り（距離を保ちつつ横移動） */
  _engagePositioning(dt) {
    const t = this.targetEnemy;
    const tp = t.getEyePosition ? t.getEyePosition(_v2) : _v2.copy(t.position);
    const d = this.char.position.distanceTo(tp);

    this._strafeT -= dt;
    if (this._strafeT <= 0) {
      this._strafeDir = Math.random() < 0.5 ? -1 : 1;
      this._strafeT = 0.9 + Math.random() * 1.6;
    }

    // 武器の得意距離を保つ
    const ideal = this.weapon.class.includes('サブマシンガン') ? 10
      : this.weapon.class.includes('スナイパー') ? 34 : 18;

    _dir.copy(tp).sub(this.char.position).setY(0).normalize();
    const right = _v3.set(-_dir.z, 0, _dir.x);

    const approach = (d > ideal * 1.25) ? 1 : (d < ideal * 0.6 ? -1 : 0);
    const tgt = _v.copy(this.char.position)
      .addScaledVector(_dir, approach * 4.5)
      .addScaledVector(right, this._strafeDir * 3.2);
    this.moveTarget = tgt.clone();

    // 低 HP なら遮蔽へ退く
    if (this.hp < this.maxHp * 0.32) {
      this.state = BOT_STATE.COVER;
      this.moveTarget = _v.copy(this.char.position).addScaledVector(_dir, -5.5)
        .addScaledVector(right, this._strafeDir * 2.0).clone();
    }
  }

  /* ---------------- 移動 ---------------- */

  _move(dt) {
    const phys = this.ctx.physics;
    const pos = this.char.position;

    let wishX = 0, wishZ = 0;
    if (this.moveTarget) {
      const dx = this.moveTarget.x - pos.x, dz = this.moveTarget.z - pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.2) {
        wishX = dx / len; wishZ = dz / len;

        // --- ひげレイによる障害物回避 ---
        const eye = _v.set(pos.x, pos.y + 0.9, pos.z);
        const probe = (ang) => {
          const c = Math.cos(ang), s = Math.sin(ang);
          _v2.set(wishX * c - wishZ * s, 0, wishX * s + wishZ * c);
          return phys.raycast(eye, _v2, 2.4, { forBullets: false });
        };
        const center = probe(0);
        if (center) {
          const left = probe(-0.72), right = probe(0.72);
          const lDist = left ? left.dist : 99;
          const rDist = right ? right.dist : 99;
          const turn = lDist > rDist ? -1.05 : 1.05;
          const c = Math.cos(turn), s = Math.sin(turn);
          const nx = wishX * c - wishZ * s, nz = wishX * s + wishZ * c;
          wishX = nx; wishZ = nz;
        }
      }
    }

    // 交戦中はやや遅く（狙いを付けるため）
    let speed = this.moveSpeed;
    if (this.state === BOT_STATE.ENGAGE) speed *= 0.62;
    if (this.state === BOT_STATE.RELOAD) speed *= 0.5;

    const accel = 34;
    this.velocity.x += (wishX * speed - this.velocity.x) * Math.min(1, accel * dt / speed);
    this.velocity.z += (wishZ * speed - this.velocity.z) * Math.min(1, accel * dt / speed);
    if (!this.grounded) this.velocity.y += phys.gravity * dt;
    else if (this.velocity.y < 0) this.velocity.y = 0;

    const delta = _v.set(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);
    const res = phys.moveCharacter(pos, this.radius, this.height, delta, { stepHeight: 0.45 });
    this.grounded = res.grounded;
    if (res.grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (res.hitWall) { this.velocity.x *= 0.5; this.velocity.z *= 0.5; }

    // スタック検出（壁に押し付けられ続けたら別方向へ）
    const moved = this._lastPos.distanceTo(pos);
    this._lastPos.copy(pos);
    if (moved < 0.012 && this.moveTarget) {
      this._stuckT += dt;
      if (this._stuckT > 0.7) {
        this._stuckT = 0;
        this.moveTarget = null;
        this._repathT = 0;
        this._strafeDir *= -1;
      }
    } else {
      this._stuckT = 0;
    }

    // 落下復帰
    if (pos.y < -12) { this.die(); }
  }

  /* ---------------- 照準 ---------------- */

  _aim(dt) {
    let wantYaw = this.aimYaw, wantPitch = 0;

    if (this.targetEnemy && this.targetEnemy.alive) {
      const t = this.targetEnemy;
      const tp = t.getEyePosition ? t.getEyePosition(_v2) : _v2.copy(t.position);
      // 移動先を先読み（難易度で精度が変わる）
      if (t.velocity && this.diff.lead > 0) {
        const d = this.char.position.distanceTo(tp);
        const flight = d / (this.weapon.muzzleVelocity || 800);
        tp.addScaledVector(t.velocity, flight * this.diff.lead);
      }
      const me = this.char.getEyePosition(_v);
      _dir.copy(tp).sub(me);
      const horiz = Math.hypot(_dir.x, _dir.z);
      wantYaw = Math.atan2(-_dir.x, -_dir.z);
      wantPitch = Math.atan2(_dir.y, horiz);
    } else if (this.moveTarget) {
      wantYaw = Math.atan2(-(this.moveTarget.x - this.char.position.x), -(this.moveTarget.z - this.char.position.z));
      wantPitch = 0;
    }

    // 照準の揺らぎ（人間らしさ）
    this._noisePhase += dt;
    const n = this.diff.aimError;
    const nx = Math.sin(this._noisePhase * 2.3) * 0.5 + Math.sin(this._noisePhase * 5.7) * 0.3;
    const ny = Math.cos(this._noisePhase * 1.9) * 0.5 + Math.cos(this._noisePhase * 4.3) * 0.3;
    wantYaw += nx * n;
    wantPitch += ny * n * 0.7;

    // 追従（角度差を最短方向で詰める）
    const k = Math.min(1, this.diff.aimSpeed * dt);
    let dy = wantYaw - this.aimYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.aimYaw += dy * k;
    this.aimPitch += (wantPitch - this.aimPitch) * k;
    this.aimPitch = Math.max(-1.2, Math.min(1.2, this.aimPitch));

    this.char.yaw = this.aimYaw;
    this.char.pitch = this.aimPitch;
  }

  /* ---------------- 射撃 ---------------- */

  _shoot(dt, world) {
    if (this._fireTimer > 0) this._fireTimer -= dt;
    if (this._burstPauseT > 0) { this._burstPauseT -= dt; return; }
    if (this.state !== BOT_STATE.ENGAGE || this._reactionT > 0) return;
    if (!this.targetEnemy || !this.targetEnemy.alive) return;
    if (this.ammo <= 0) return;

    const me = this.char.getEyePosition(_v);
    const t = this.targetEnemy;
    const tp = t.getEyePosition ? t.getEyePosition(_v2) : _v2.copy(t.position);

    // 遮蔽があれば撃たない
    if (this.ctx.physics.losBlocked(me, tp)) return;

    // 狙いが十分合っているか
    _dir.copy(tp).sub(me).normalize();
    const fwd = _v3.set(
      -Math.sin(this.aimYaw) * Math.cos(this.aimPitch),
      Math.sin(this.aimPitch),
      -Math.cos(this.aimYaw) * Math.cos(this.aimPitch)
    );
    if (fwd.dot(_dir) < 0.985) return;

    if (this._fireTimer > 0) return;

    // バースト管理
    if (this._burstLeft <= 0) {
      this._burstLeft = this.diff.burstMin + Math.floor(Math.random() * (this.diff.burstMax - this.diff.burstMin + 1));
    }

    this._fire(world, fwd);
    this._burstLeft--;
    this._fireTimer = fireInterval(this.weapon);
    if (this._burstLeft <= 0) {
      this._burstPauseT = 0.25 + Math.random() * 0.55;
    }
  }

  _fire(world, fwd) {
    this.ammo--;
    this.char.onFire();

    // 命中判定: 難易度の accuracy で当たり外れを決め、外す弾は周囲へ散らす
    const dir = _dir.copy(fwd);
    const hitRoll = Math.random() < this.diff.accuracy;
    if (!hitRoll) {
      const miss = 0.028 + Math.random() * 0.045;
      const a = Math.random() * Math.PI * 2;
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(dir, up).normalize();
      const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(a) * miss).addScaledVector(upv, Math.sin(a) * miss).normalize();
    }

    const origin = this.char.getEyePosition(new THREE.Vector3());
    // 銃口位置はおおよそ胸の前
    const muzzle = origin.clone().addScaledVector(dir, 0.45).add(new THREE.Vector3(0, -0.12, 0));

    world.resolveShot({
      shooter: this, origin, dir, weapon: this.weapon, muzzle,
    });
  }

  dispose() {
    this.ctx.scene.remove(this.char.model);
  }
}
