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

/**
 * 難易度プリセット。
 *
 * aimError は 1 発ごとの拡散半径（ラジアン）。
 * 10m 先での散らばり半径はおよそ aimError * 10 メートルになる。
 * 人体の幅が 0.5m 程度なので、0.030 なら 10m で半径 0.30m ＝ そこそこ当たる、
 * 0.075 なら半径 0.75m ＝ かなり外す、という目安。
 *
 * reaction   : 敵を認識してから撃ち始めるまでの秒数
 * burstPause : バースト間の休み（長いほど player に反撃の間が生まれる）
 */
export const DIFFICULTY = {
  recruit:  { name: '新兵',     aimError: 0.085, reaction: 0.85, burstMin: 2, burstMax: 4,  burstPause: [0.75, 1.35], aimSpeed: 2.6, hp: 100, fovDeg: 95,  sight: 42, lead: 0.2 },
  regular:  { name: '正規兵',   aimError: 0.055, reaction: 0.62, burstMin: 3, burstMax: 5,  burstPause: [0.55, 1.05], aimSpeed: 3.8, hp: 100, fovDeg: 105, sight: 55, lead: 0.45 },
  veteran:  { name: '古参兵',   aimError: 0.034, reaction: 0.42, burstMin: 4, burstMax: 7,  burstPause: [0.42, 0.85], aimSpeed: 5.4, hp: 100, fovDeg: 115, sight: 70, lead: 0.7 },
  elite:    { name: '特殊部隊', aimError: 0.021, reaction: 0.28, burstMin: 5, burstMax: 9,  burstPause: [0.32, 0.62], aimSpeed: 7.2, hp: 100, fovDeg: 125, sight: 85, lead: 0.9 },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
// 射撃解決の専用一時領域（毎発の生成を避ける）
const _fOrigin = new THREE.Vector3();
const _fOrigin2 = new THREE.Vector3();
const _fAim = new THREE.Vector3();
const _fRight = new THREE.Vector3();
const _fUp = new THREE.Vector3();
const _fMuzzle = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

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
    // 被弾解決がこのボット本体へ辿り着けるようにする
    this.char.owner = this;
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
    // 大まかに向いていれば撃つ。命中の当たり外れは拡散側で決める。
    if (fwd.dot(_dir) < 0.965) return;

    if (this._fireTimer > 0) return;

    // バースト管理
    if (this._burstLeft <= 0) {
      this._burstLeft = this.diff.burstMin + Math.floor(Math.random() * (this.diff.burstMax - this.diff.burstMin + 1));
      this._shotsInBurst = 0;
    }

    this._fire(world, fwd);
    this._burstLeft--;
    this._shotsInBurst = (this._shotsInBurst || 0) + 1;
    this._fireTimer = fireInterval(this.weapon);
    if (this._burstLeft <= 0) {
      const [lo, hi] = this.diff.burstPause || [0.25, 0.8];
      this._burstPauseT = lo + Math.random() * (hi - lo);
      this._shotsInBurst = 0;
    }
  }

  /**
   * 1 発撃つ。
   *
   * 以前は「命中ロールに勝ったら照準方向へ寸分違わず飛ぶ」実装だった。
   * ボットは相手の目の位置を狙うため、これは事実上「確定ヘッドショット」で、
   * 正規兵でも 100 の体力を 0.3 秒で削り切ってしまい勝負にならなかった。
   *
   * 実銃と同じく、常に拡散を持たせる方式へ変える:
   *   - 狙点は胸（目より少し下）。頭に当たるのは拡散が上振れしたときだけ。
   *   - 拡散は難易度と距離で決まり、遠いほど当てにくい。
   *   - 連射するほど拡散が広がる（反動の再現）。
   */
  _fire(world, fwd) {
    this.ammo--;
    this.char.onFire();

    const origin = this.char.getEyePosition(_fOrigin);
    const t = this.targetEnemy;
    const tp = t?.getEyePosition ? t.getEyePosition(_fAim) : _fAim.copy(t?.position || origin);
    // 目ではなく胸を狙う
    tp.y -= 0.28;
    const dist = origin.distanceTo(tp);

    const dir = _dir.copy(tp).sub(origin).normalize();
    // 狙いが定まっていない分（aimError）＋ 連射による広がり
    const burstSpread = Math.min(1, this._shotsInBurst * 0.16);
    const spread = this.diff.aimError * (1 + burstSpread)
      * (1 + Math.max(0, dist - 12) * 0.022);

    const a = Math.random() * Math.PI * 2;
    // 中心寄りの分布（sqrt を取らないので中心に集まる）
    const r = Math.random() * Math.random() * spread;
    _fRight.crossVectors(dir, _UP).normalize();
    _fUp.crossVectors(_fRight, dir).normalize();
    dir.addScaledVector(_fRight, Math.cos(a) * r)
      .addScaledVector(_fUp, Math.sin(a) * r)
      .normalize();

    // 銃口位置はおおよそ胸の前
    const muzzle = _fMuzzle.copy(origin).addScaledVector(dir, 0.45);
    muzzle.y -= 0.12;

    world.resolveShot({
      shooter: this, origin: _fOrigin2.copy(origin), dir, weapon: this.weapon, muzzle,
    });
  }

  dispose() {
    this.ctx.scene.remove(this.char.model);
  }
}
