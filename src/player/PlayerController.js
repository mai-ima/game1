import * as THREE from 'three';
import { SURFACE } from '../world/Physics.js';

/** 姿勢 */
export const STANCE = { STAND: 0, CROUCH: 1, PRONE: 2 };

/** 姿勢ごとの寸法（メートル） */
const STANCE_DIM = {
  [STANCE.STAND]:  { height: 1.80, eye: 1.63, speed: 1.00 },
  [STANCE.CROUCH]: { height: 1.20, eye: 1.05, speed: 0.52 },
  [STANCE.PRONE]:  { height: 0.62, eye: 0.42, speed: 0.22 },
};

/** 移動パラメータ（Call of Duty 系の手触りに寄せた値） */
const MOVE = {
  radius: 0.34,
  walkSpeed: 4.35,
  sprintSpeed: 6.45,
  tacSprintSpeed: 8.10,
  adsSpeedMul: 0.58,
  backSpeedMul: 0.82,
  strafeSpeedMul: 0.92,

  groundAccel: 62,
  airAccel: 14,
  friction: 11.5,
  airFriction: 0.18,

  jumpHeight: 1.05,
  stepHeight: 0.45,

  slideSpeed: 8.6,
  slideDuration: 0.92,
  slideFriction: 3.4,
  slideCooldown: 0.55,

  mantleMaxHeight: 1.85,
  mantleMinHeight: 0.55,
  mantleReach: 1.05,
  mantleDuration: 0.52,

  staminaMax: 5.2,
  staminaDrain: 1.0,
  staminaRegen: 0.62,
  staminaRegenDelay: 1.1,

  leanAngle: 0.30,
  leanOffset: 0.42,
  leanSpeed: 9.0,
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export class PlayerController {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {import('../world/Physics.js').Physics} physics
   * @param {import('../core/Input.js').Input} input
   */
  constructor(engine, physics, input) {
    this.engine = engine;
    this.physics = physics;
    this.input = input;

    this.position = new THREE.Vector3(0, 0, 0);   // 足元
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.stance = STANCE.STAND;
    this.targetStance = STANCE.STAND;
    this.height = STANCE_DIM[STANCE.STAND].height;
    this.eyeHeight = STANCE_DIM[STANCE.STAND].eye;
    /** 見学モードの浮遊（重力・当たり判定を無視する） */
    this.noclip = false;
    this.radius = MOVE.radius;

    this.grounded = false;
    this.wasGrounded = false;
    this.sprinting = false;
    this.tacSprinting = false;
    this.ads = false;
    this.adsAmount = 0;         // 0..1 補間値
    this.stamina = MOVE.staminaMax;
    this._staminaIdle = 0;

    // スライディング
    this.sliding = false;
    this.slideTime = 0;
    this._slideCooldown = 0;
    this.slideDir = new THREE.Vector3();

    // マントル（乗り越え）
    this.mantling = false;
    this._mantleT = 0;
    this._mantleFrom = new THREE.Vector3();
    this._mantleTo = new THREE.Vector3();

    // リーン
    this.lean = 0;
    this.leanTarget = 0;

    // カメラ演出
    this.bobPhase = 0;
    this.bobAmount = 0;
    this._landDip = 0;
    this._landVel = 0;
    this._recoilPitch = 0;
    this._recoilYaw = 0;
    this._shake = 0;
    this._shakeTime = 0;
    this._breath = 0;

    this.speed2D = 0;
    this.surface = SURFACE.CONCRETE;
    this.stepDistance = 0;

    // コールバック
    this.onFootstep = null;      // (surface, isRun) => void
    this.onLand = null;          // (impactSpeed, surface) => void
    this.onJump = null;
    this.onSlideStart = null;
    this.onMantle = null;
    this.onStanceChange = null;

    this.enabled = true;
    this.alive = true;
  }

  /** スポーン */
  spawn(pos, yaw = 0) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.stance = this.targetStance = STANCE.STAND;
    this.height = STANCE_DIM[STANCE.STAND].height;
    this.eyeHeight = STANCE_DIM[STANCE.STAND].eye;
    this.sliding = false;
    this.mantling = false;
    this.stamina = MOVE.staminaMax;
    this.alive = true;
    this._landDip = 0;
    this.lean = this.leanTarget = 0;
  }

  /** 視点方向の単位ベクトル */
  getLookDirection(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
  }

  /** 目（カメラ）のワールド座標 */
  getEyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  /** 反動を加える（武器から呼ばれる） */
  addRecoil(pitch, yaw) {
    this._recoilPitch += pitch;
    this._recoilYaw += yaw;
  }

  /** 画面揺れ */
  addShake(amount, duration = 0.3) {
    this._shake = Math.max(this._shake, amount);
    this._shakeTime = Math.max(this._shakeTime, duration);
  }

  /* ================= メイン更新 ================= */

  update(dt) {
    /*
     * 死亡中（enabled = false）でもカメラの更新だけは続ける。
     * 完全に止めると、視野角や揺れが倒れた瞬間の値で固まり、
     * 復帰時に画面がおかしいまま残ることがある。操作入力は読まない。
     */
    if (!this.enabled) {
      this._updateCamera(dt);
      return;
    }

    this._updateLook(dt);

    /*
     * 見学用の浮遊。
     * 重力も当たり判定も無視して視線方向へ動く。
     * マップの造りを確かめるためのもので、対戦中には入らない。
     */
    if (this.noclip) {
      this._updateNoclip(dt);
      this._updateCamera(dt);
      return;
    }

    if (this.mantling) {
      this._updateMantle(dt);
    } else {
      this._updateStance(dt);
      this._updateMove(dt);
    }

    this._updateCamera(dt);
    this._updateStamina(dt);
  }

  /** 浮遊移動（見学モード専用） */
  _updateNoclip(dt) {
    const mv = this.input.move;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // 視線方向（上下を含む）と、その真横
    const fx = -Math.sin(this.yaw) * cp, fy = sp, fz = -Math.cos(this.yaw) * cp;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const speed = (this.input.down('sprint') ? 34 : 13) * dt;

    this.position.x += (fx * mv.y + rx * mv.x) * speed;
    this.position.y += (fy * mv.y) * speed;
    this.position.z += (fz * mv.y + rz * mv.x) * speed;
    if (this.input.down('jump')) this.position.y += speed;
    if (this.input.down('crouch')) this.position.y -= speed;

    // 地面より下と、空の彼方には行かせない
    this.position.y = Math.max(-2, Math.min(140, this.position.y));
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.stance = 0;
    this.sprinting = false;
  }

  /* ---------------- 視点 ---------------- */

  _updateLook(dt) {
    const ld = this.input.lookDelta;
    const sens = this.ads ? this.input.adsSensitivity : 1.0;
    this.yaw += ld.x * sens;
    this.pitch += ld.y * sens;

    // 反動の減衰（撃った直後は素早く戻る）
    const rec = 1 - Math.exp(-13 * dt);
    this._recoilPitch -= this._recoilPitch * rec;
    this._recoilYaw -= this._recoilYaw * rec;

    const LIM = Math.PI / 2 - 0.015;
    this.pitch = Math.max(-LIM, Math.min(LIM, this.pitch));
    this.yaw = ((this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  }

  /* ---------------- 姿勢 ---------------- */

  _updateStance(dt) {
    const inp = this.input;

    // 伏せ / しゃがみ のトグル
    if (inp.pressed('prone')) {
      this.targetStance = this.targetStance === STANCE.PRONE ? STANCE.STAND : STANCE.PRONE;
    } else if (inp.pressed('crouch')) {
      if (this.sliding) {
        // スライディング中にもう一度押したら切り上げてしゃがみへ移る
        this._endSlide();
        this.targetStance = STANCE.CROUCH;
      } else if (this.sprinting && this.speed2D > MOVE.walkSpeed * 1.1 && this._slideCooldown <= 0) {
        this._startSlide();
      } else {
        this.targetStance = this.targetStance === STANCE.CROUCH ? STANCE.STAND : STANCE.CROUCH;
      }
    }

    if (this.sliding) this.targetStance = STANCE.CROUCH;

    // 立ち上がれるか（頭上判定）
    if (this.targetStance < this.stance) {
      const want = STANCE_DIM[this.targetStance].height;
      if (this._blockedAbove(want)) this.targetStance = this.stance;
    }

    if (this.targetStance !== this.stance) {
      this.stance = this.targetStance;
      this.onStanceChange?.(this.stance);
    }

    // 高さ・目線を滑らかに補間
    const dim = STANCE_DIM[this.stance];
    const k = 1 - Math.exp(-14 * dt);
    this.height += (dim.height - this.height) * k;
    this.eyeHeight += (dim.eye - this.eyeHeight) * k;
  }

  _blockedAbove(targetHeight) {
    const p = _v.copy(this.position);
    const saved = this.height;
    this.height = targetHeight;
    const blocked = this.physics._overlaps(p, this.radius, targetHeight);
    this.height = saved;
    return blocked;
  }

  /* ---------------- 移動 ---------------- */

  _updateMove(dt) {
    const inp = this.input;
    const mv = inp.move;

    // 前方・右方（水平面）
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // ---- スプリント判定 ----
    const wantSprint = inp.down('sprint') && mv.y > 0.3 && !this.ads && this.stamina > 0.05;
    this.sprinting = wantSprint && this.grounded && this.stance === STANCE.STAND && !this.sliding;
    this.tacSprinting = this.sprinting && this.stamina > MOVE.staminaMax * 0.35 && mv.y > 0.85;

    // ---- 目標速度 ----
    let speed = MOVE.walkSpeed * STANCE_DIM[this.stance].speed;
    if (this.sprinting) speed = this.tacSprinting ? MOVE.tacSprintSpeed : MOVE.sprintSpeed;
    if (this.ads) speed *= MOVE.adsSpeedMul;

    // 後退・横移動は減速
    const dirMul = mv.y < -0.1 ? MOVE.backSpeedMul : (Math.abs(mv.x) > Math.abs(mv.y) ? MOVE.strafeSpeedMul : 1);
    speed *= dirMul;

    const wish = _v.set(0, 0, 0)
      .addScaledVector(_fwd, mv.y)
      .addScaledVector(_right, mv.x);
    const wishLen = wish.length();
    if (wishLen > 0.001) wish.divideScalar(wishLen);
    const wishSpeed = Math.min(wishLen, 1) * speed;

    // ---- スライディング ----
    if (this.sliding) {
      this.slideTime += dt;
      const t = this.slideTime / MOVE.slideDuration;
      // 減衰しながら滑る
      const decay = Math.exp(-MOVE.slideFriction * this.slideTime);
      const sp = MOVE.slideSpeed * decay;
      this.velocity.x = this.slideDir.x * sp;
      this.velocity.z = this.slideDir.z * sp;
      // 少しだけ方向転換できる
      const steer = 1.9 * dt;
      this.velocity.x += wish.x * steer * sp * 0.35;
      this.velocity.z += wish.z * steer * sp * 0.35;

      if (t >= 1 || sp < 2.2 || !this.grounded) this._endSlide();
    } else {
      // ---- 加速 / 摩擦 ----
      const vh = _v2.set(this.velocity.x, 0, this.velocity.z);
      const cur = vh.length();

      if (this.grounded) {
        // 摩擦
        if (cur > 0.001) {
          const drop = Math.max(cur, 1.2) * MOVE.friction * dt;
          const nf = Math.max(0, cur - drop) / cur;
          this.velocity.x *= nf;
          this.velocity.z *= nf;
        }
        // 加速（Quake 系の投影加速。空中制御と連続性がある）
        const curSpeedInDir = this.velocity.x * wish.x + this.velocity.z * wish.z;
        const addSpeed = wishSpeed - curSpeedInDir;
        if (addSpeed > 0) {
          const accel = Math.min(MOVE.groundAccel * dt * wishSpeed, addSpeed);
          this.velocity.x += wish.x * accel;
          this.velocity.z += wish.z * accel;
        }
      } else {
        const curSpeedInDir = this.velocity.x * wish.x + this.velocity.z * wish.z;
        const addSpeed = Math.min(wishSpeed, MOVE.walkSpeed * 0.85) - curSpeedInDir;
        if (addSpeed > 0) {
          const accel = Math.min(MOVE.airAccel * dt * wishSpeed, addSpeed);
          this.velocity.x += wish.x * accel;
          this.velocity.z += wish.z * accel;
        }
        this.velocity.x *= 1 - MOVE.airFriction * dt;
        this.velocity.z *= 1 - MOVE.airFriction * dt;
      }
    }

    // ---- ジャンプ ----
    if (this.input.pressed('jump')) {
      if (this.grounded && !this.sliding && this.stance === STANCE.STAND) {
        this.velocity.y = Math.sqrt(2 * Math.abs(this.physics.gravity) * MOVE.jumpHeight);
        this.grounded = false;
        this.onJump?.();
      } else if (this.stance !== STANCE.STAND) {
        this.targetStance = STANCE.STAND;
      } else if (!this.grounded) {
        this._tryMantle();
      }
    }
    // 進行方向に壁があり、上に乗れそうなら自動マントル
    if (!this.grounded && this.velocity.y < 1.5 && !this.mantling && wishLen > 0.4) {
      this._tryMantle();
    }

    // ---- 重力 ----
    if (!this.grounded) this.velocity.y += this.physics.gravity * dt;
    else if (this.velocity.y < 0) this.velocity.y = 0;

    // ---- 衝突解決 ----
    this.wasGrounded = this.grounded;
    const delta = _v.copy(this.velocity).multiplyScalar(dt);
    const res = this.physics.moveCharacter(this.position, this.radius, this.height, delta, {
      stepHeight: this.sliding ? 0.2 : MOVE.stepHeight,
    });

    this.grounded = res.grounded;
    if (res.grounded && this.velocity.y < 0) {
      // 着地
      if (!this.wasGrounded) {
        const impact = -this.velocity.y;
        if (impact > 3.5) {
          this._landVel = Math.min(impact / 11, 1.15);
          this.onLand?.(impact, this.physics.surfaceBelow(this.position, this.radius));
        }
      }
      this.velocity.y = 0;
    }
    if (res.ceiling && this.velocity.y > 0) this.velocity.y = 0;
    if (res.hitWall) {
      // 壁ずり（滑らかに壁沿いへ）
      this.velocity.x *= 0.72;
      this.velocity.z *= 0.72;
    }

    // 落下死・地形外への転落を防ぐ安全網
    if (this.position.y < -30) this.onFellOutOfWorld?.();

    // ---- 速度・足音 ----
    this.speed2D = Math.hypot(this.velocity.x, this.velocity.z);
    this.surface = this.physics.surfaceBelow(this.position, this.radius);

    if (this.grounded && !this.sliding && this.speed2D > 0.6) {
      this.stepDistance += this.speed2D * dt;
      const stride = this.sprinting ? 2.05 : (this.stance === STANCE.STAND ? 1.72 : 1.15);
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        this.onFootstep?.(this.surface, this.sprinting);
      }
    } else if (!this.grounded) {
      this.stepDistance = 0;
    }

    if (this._slideCooldown > 0) this._slideCooldown -= dt;
  }

  /* ---------------- スライディング ---------------- */

  _startSlide() {
    this.sliding = true;
    this.slideTime = 0;
    this._slideCooldown = MOVE.slideDuration + MOVE.slideCooldown;
    const len = Math.hypot(this.velocity.x, this.velocity.z) || 1;
    this.slideDir.set(this.velocity.x / len, 0, this.velocity.z / len);
    this.stamina = Math.max(0, this.stamina - 0.7);
    this.onSlideStart?.();
    this.addShake(0.35, 0.22);
  }

  _endSlide() {
    this.sliding = false;
    this.slideTime = 0;
    // 頭上が空いていれば立つ
    if (!this._blockedAbove(STANCE_DIM[STANCE.STAND].height)) this.targetStance = STANCE.STAND;
  }

  /* ---------------- マントル（乗り越え） ---------------- */

  _tryMantle() {
    if (this.mantling) return false;
    const dir = _fwd.clone();
    const from = _v.copy(this.position);
    from.y += 0.15;

    // 前方に壁があるか
    const wall = this.physics.raycast(
      _v2.set(this.position.x, this.position.y + 0.9, this.position.z),
      dir, MOVE.mantleReach, { forBullets: false }
    );
    if (!wall) return false;

    // 壁の上面の高さを探す
    const top = wall.collider.max.y;
    const rel = top - this.position.y;
    if (rel < MOVE.mantleMinHeight || rel > MOVE.mantleMaxHeight) return false;

    // 上面に十分なスペースがあるか
    const landing = _v2.copy(wall.point).addScaledVector(dir, this.radius + 0.22);
    landing.y = top + 0.02;
    if (this.physics._overlaps(landing, this.radius * 0.9, STANCE_DIM[STANCE.CROUCH].height)) return false;

    this.mantling = true;
    this._mantleT = 0;
    this._mantleFrom.copy(this.position);
    this._mantleTo.copy(landing);
    this.velocity.set(0, 0, 0);
    this.sliding = false;
    this.onMantle?.();
    return true;
  }

  _updateMantle(dt) {
    this._mantleT += dt / MOVE.mantleDuration;
    const t = Math.min(1, this._mantleT);
    // まず上へ、次に前へ（実際の乗り越え動作に近い曲線）
    const up = Math.min(1, t / 0.62);
    const fwd = Math.max(0, (t - 0.34) / 0.66);
    const ue = up * up * (3 - 2 * up);
    const fe = fwd * fwd * (3 - 2 * fwd);

    this.position.y = this._mantleFrom.y + (this._mantleTo.y - this._mantleFrom.y) * ue;
    this.position.x = this._mantleFrom.x + (this._mantleTo.x - this._mantleFrom.x) * fe;
    this.position.z = this._mantleFrom.z + (this._mantleTo.z - this._mantleFrom.z) * fe;

    if (t >= 1) {
      this.mantling = false;
      this.grounded = true;
      this.velocity.set(0, 0, 0);
    }
  }

  /* ---------------- スタミナ ---------------- */

  _updateStamina(dt) {
    if (this.sprinting) {
      const drain = this.tacSprinting ? MOVE.staminaDrain * 1.85 : MOVE.staminaDrain;
      this.stamina = Math.max(0, this.stamina - drain * dt);
      this._staminaIdle = 0;
    } else {
      this._staminaIdle += dt;
      if (this._staminaIdle > MOVE.staminaRegenDelay) {
        this.stamina = Math.min(MOVE.staminaMax, this.stamina + MOVE.staminaRegen * MOVE.staminaMax * dt * 0.6);
      }
    }
  }

  /* ---------------- カメラ ---------------- */

  _updateCamera(dt) {
    const cam = this.engine.camera;

    // --- リーン ---
    const inp = this.input;
    this.leanTarget = 0;
    if (!this.sprinting && !this.sliding) {
      if (inp.down('leanLeft')) this.leanTarget = -1;
      else if (inp.down('leanRight')) this.leanTarget = 1;
    }
    // 壁にめり込まないようリーン量を制限
    if (this.leanTarget !== 0) {
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const probe = _v.copy(this.position);
      probe.y += this.eyeHeight;
      const leanDir = _v2.copy(_right).multiplyScalar(this.leanTarget);
      const hit = this.physics.raycast(probe, leanDir, MOVE.leanOffset + 0.25, { forBullets: false });
      if (hit) this.leanTarget = 0;
    }
    this.lean += (this.leanTarget - this.lean) * Math.min(1, MOVE.leanSpeed * dt);

    // --- 頭の揺れ（歩行バランス） ---
    const moving = this.grounded && this.speed2D > 0.5 && !this.sliding;
    const bobTarget = moving ? Math.min(this.speed2D / MOVE.sprintSpeed, 1.25) : 0;
    this.bobAmount += (bobTarget - this.bobAmount) * Math.min(1, 7 * dt);
    if (moving) {
      const freq = this.sprinting ? 10.2 : 7.4;
      this.bobPhase += dt * freq * (0.55 + this.speed2D / MOVE.sprintSpeed * 0.65);
    }
    const bobY = Math.sin(this.bobPhase * 2) * 0.032 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.042 * this.bobAmount;
    const bobRoll = Math.cos(this.bobPhase) * 0.012 * this.bobAmount;

    // --- 着地の沈み込み（バネ） ---
    this._landVel += -this._landDip * 165 * dt - this._landVel * 17 * dt;
    this._landDip += this._landVel * dt;
    const landOffset = -Math.abs(this._landDip) * 0.42;

    // --- 呼吸（静止時のわずかな揺らぎ） ---
    this._breath += dt * (this.stamina < 1.5 ? 3.1 : 1.35);
    const breathAmp = this.ads
      ? (0.0016 + (1 - this.stamina / MOVE.staminaMax) * 0.0052)
      : 0.0009;
    const breathY = Math.sin(this._breath) * breathAmp;
    const breathX = Math.cos(this._breath * 0.73) * breathAmp * 0.8;

    // --- 画面揺れ ---
    let shakeX = 0, shakeY = 0;
    if (this._shakeTime > 0) {
      this._shakeTime -= dt;
      const k = Math.max(0, this._shakeTime) * this._shake;
      shakeX = (Math.random() - 0.5) * k * 0.09;
      shakeY = (Math.random() - 0.5) * k * 0.09;
      if (this._shakeTime <= 0) this._shake = 0;
    }

    // --- 位置 ---
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    cam.position.set(
      this.position.x + _right.x * (bobX + this.lean * MOVE.leanOffset),
      this.position.y + this.eyeHeight + bobY + landOffset,
      this.position.z + _right.z * (bobX + this.lean * MOVE.leanOffset)
    );

    // --- 回転 ---
    cam.rotation.set(
      this.pitch + this._recoilPitch + bobY * 0.35 + breathY + shakeY,
      this.yaw + this._recoilYaw + breathX + shakeX,
      -this.lean * MOVE.leanAngle + bobRoll + (this.sliding ? 0.055 : 0),
      'YXZ'
    );

    // --- 視野角（スプリント / スライディングで広がる） ---
    const baseFov = this.baseFov ?? 80;
    let fov = baseFov;
    if (this.tacSprinting) fov = baseFov + 9;
    else if (this.sprinting) fov = baseFov + 5.5;
    if (this.sliding) fov = baseFov + 11;
    this._fov = this._fov ?? fov;
    this._fov += (fov - this._fov) * Math.min(1, 8 * dt);
    if (!this.ads) this.engine.setFov(this._fov);
  }

  /** スプリント/スライディング時の径方向ブラー強度 */
  getMotionBlur() {
    if (this.sliding) return 0.55;
    if (this.tacSprinting) return 0.34;
    if (this.sprinting) return 0.18;
    return 0;
  }
}

export { MOVE, STANCE_DIM };
