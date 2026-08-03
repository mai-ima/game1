/**
 * 入力アグリゲータ。
 * キーボード/マウス・タッチ（仮想スティック）・ゲームパッドの3系統を
 * 単一の抽象状態にまとめる。
 *
 *   input.move        {x, y}  正規化された移動入力 (-1..1)
 *   input.lookDelta   {x, y}  このフレームの視点移動量（ラジアン換算前の生値）
 *   input.down(name)          アクションが押されているか
 *   input.pressed(name)       このフレームで押されたか（立ち上がり）
 *   input.released(name)      このフレームで離されたか（立ち下がり）
 */

export const ACTIONS = [
  'fire', 'ads', 'jump', 'crouch', 'prone', 'sprint', 'reload',
  'interact', 'melee', 'grenade', 'nextWeapon', 'prevWeapon',
  'weapon1', 'weapon2', 'scoreboard', 'pause', 'leanLeft', 'leanRight',
];

const DEFAULT_BINDINGS = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  Space: 'jump',
  ControlLeft: 'crouch', KeyC: 'crouch',
  KeyX: 'prone',
  ShiftLeft: 'sprint',
  KeyR: 'reload',
  KeyF: 'interact',
  KeyV: 'melee',
  KeyG: 'grenade',
  KeyQ: 'leanLeft', KeyE: 'leanRight',
  Digit1: 'weapon1', Digit2: 'weapon2',
  Tab: 'scoreboard',
  Escape: 'pause',
};

export class Input {
  /**
   * @param {HTMLElement} element ポインタロック対象（通常は canvas）
   */
  constructor(element) {
    this.el = element;
    this.bindings = { ...DEFAULT_BINDINGS };

    this.move = { x: 0, y: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.enabled = true;

    this.sensitivity = 1.0;
    this.adsSensitivity = 0.62;
    this.touchSensitivity = 1.25;
    this.invertY = false;

    this._keys = new Set();
    this._state = Object.create(null);
    this._prev = Object.create(null);
    this._dirs = { forward: false, back: false, left: false, right: false };

    // タッチ関連
    this.isTouch = false;
    this._touchLook = null;       // {id, x, y}
    this._touchMove = null;       // {id, ox, oy, x, y}
    this.stickRadius = 62;
    this.stickOrigin = { x: 0, y: 0 };
    this.stickVec = { x: 0, y: 0 };
    this.stickActive = false;
    this.onStickChange = null;    // (active, ox, oy, dx, dy) => void
    this.autoSprintThreshold = 0.82;

    // ゲームパッド
    this.gamepadIndex = null;
    this.gamepadDeadzone = 0.14;
    this.gamepadLookScale = 2.6;

    this.pointerLocked = false;
    this.onPointerLockChange = null;

    this._bind();
  }

  /* ================= 内部束縛 ================= */

  _bind() {
    const el = this.el;

    // --- キーボード ---
    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      const act = this.bindings[e.code];
      if (act) {
        e.preventDefault();
        if (act in this._dirs) this._dirs[act] = true;
        else this._state[act] = true;
      }
    };
    this._onKeyUp = (e) => {
      const act = this.bindings[e.code];
      if (act) {
        e.preventDefault();
        if (act in this._dirs) this._dirs[act] = false;
        else this._state[act] = false;
      }
    };
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp, { passive: false });

    // --- マウス ---
    this._onMouseDown = (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      if (e.button === 0) this._state.fire = true;
      if (e.button === 2) this._state.ads = true;
      if (e.button === 1) { this._state.melee = true; e.preventDefault(); }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this._state.fire = false;
      if (e.button === 2) this._state.ads = false;
      if (e.button === 1) this._state.melee = false;
    };
    this._onMouseMove = (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      const s = this.sensitivity * 0.0022;
      this.lookDelta.x -= e.movementX * s;
      this.lookDelta.y -= e.movementY * s * (this.invertY ? -1 : 1);
    };
    this._onWheel = (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      if (e.deltaY > 0) this._state.nextWeapon = true;
      else if (e.deltaY < 0) this._state.prevWeapon = true;
      e.preventDefault();
    };
    this._onContext = (e) => e.preventDefault();

    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    el.addEventListener('wheel', this._onWheel, { passive: false });
    el.addEventListener('contextmenu', this._onContext);

    // --- ポインタロック ---
    this._onPLChange = () => {
      this.pointerLocked = document.pointerLockElement === el;
      if (!this.pointerLocked) {
        this._state.fire = false;
        this._state.ads = false;
      }
      this.onPointerLockChange?.(this.pointerLocked);
    };
    document.addEventListener('pointerlockchange', this._onPLChange);

    // --- タッチ ---
    this._onTouchStart = (e) => {
      if (!this.enabled) return;
      this.isTouch = true;
      const w = window.innerWidth;
      for (const t of e.changedTouches) {
        // UI ボタン上のタッチは無視（UI 側が stopPropagation する想定）
        if (t.clientX < w * 0.46 && this._touchMove === null) {
          this._touchMove = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
          this.stickOrigin.x = t.clientX; this.stickOrigin.y = t.clientY;
          this.stickActive = true;
          this.onStickChange?.(true, t.clientX, t.clientY, 0, 0);
        } else if (this._touchLook === null) {
          this._touchLook = { id: t.identifier, x: t.clientX, y: t.clientY, moved: 0 };
        }
      }
      e.preventDefault();
    };
    this._onTouchMove = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (this._touchMove && t.identifier === this._touchMove.id) {
          const m = this._touchMove;
          m.x = t.clientX; m.y = t.clientY;
          let dx = m.x - m.ox, dy = m.y - m.oy;
          const d = Math.hypot(dx, dy);
          if (d > this.stickRadius) {
            // スティックの原点を引きずる（指を追従させる）
            const k = (d - this.stickRadius) / d;
            m.ox += dx * k; m.oy += dy * k;
            dx = m.x - m.ox; dy = m.y - m.oy;
            this.stickOrigin.x = m.ox; this.stickOrigin.y = m.oy;
          }
          this.stickVec.x = dx / this.stickRadius;
          this.stickVec.y = dy / this.stickRadius;
          this.onStickChange?.(true, m.ox, m.oy, dx, dy);
        } else if (this._touchLook && t.identifier === this._touchLook.id) {
          const l = this._touchLook;
          const dx = t.clientX - l.x, dy = t.clientY - l.y;
          const s = this.touchSensitivity * 0.0032;
          this.lookDelta.x -= dx * s;
          this.lookDelta.y -= dy * s * (this.invertY ? -1 : 1);
          l.x = t.clientX; l.y = t.clientY;
          l.moved += Math.hypot(dx, dy);
        }
      }
      e.preventDefault();
    };
    this._onTouchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (this._touchMove && t.identifier === this._touchMove.id) {
          this._touchMove = null;
          this.stickVec.x = 0; this.stickVec.y = 0;
          this.stickActive = false;
          this.onStickChange?.(false, 0, 0, 0, 0);
        } else if (this._touchLook && t.identifier === this._touchLook.id) {
          this._touchLook = null;
        }
      }
    };
    el.addEventListener('touchstart', this._onTouchStart, { passive: false });
    el.addEventListener('touchmove', this._onTouchMove, { passive: false });
    el.addEventListener('touchend', this._onTouchEnd);
    el.addEventListener('touchcancel', this._onTouchEnd);

    // --- ゲームパッド ---
    window.addEventListener('gamepadconnected', (e) => { this.gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = null; });

    // フォーカス喪失時に全入力を解除
    this._onBlur = () => this.clear();
    window.addEventListener('blur', this._onBlur);
  }

  /* ================= 公開 API ================= */

  requestPointerLock() {
    if (this.isTouch) return;
    this.el.requestPointerLock?.({ unadjustedMovement: true })?.catch?.(() => {
      this.el.requestPointerLock?.();
    });
  }

  exitPointerLock() { document.exitPointerLock?.(); }

  /** UI ボタンからアクションを設定する */
  setAction(name, value) { this._state[name] = !!value; }

  /** UI ボタンから 1 フレームだけアクションを立てる */
  tapAction(name) {
    this._state[name] = true;
    this._tapQueue ??= [];
    this._tapQueue.push(name);
  }

  down(name) { return !!this._state[name]; }
  pressed(name) { return !!this._state[name] && !this._prev[name]; }
  released(name) { return !this._state[name] && !!this._prev[name]; }

  /** 全入力をクリア（ポーズ時など） */
  clear() {
    for (const k in this._state) this._state[k] = false;
    for (const k in this._dirs) this._dirs[k] = false;
    this.move.x = this.move.y = 0;
    this.lookDelta.x = this.lookDelta.y = 0;
    this.stickVec.x = this.stickVec.y = 0;
    this._touchMove = null; this._touchLook = null;
    this.stickActive = false;
    this.onStickChange?.(false, 0, 0, 0, 0);
  }

  /**
   * 毎フレーム先頭で呼ぶ。ゲームパッドのポーリングと移動ベクトルの確定を行う。
   */
  update() {
    // ---- 移動ベクトル ----
    let mx = 0, my = 0;
    if (this._dirs.right) mx += 1;
    if (this._dirs.left) mx -= 1;
    if (this._dirs.forward) my += 1;
    if (this._dirs.back) my -= 1;

    // タッチスティック
    if (this.stickActive) {
      mx += this.stickVec.x;
      my -= this.stickVec.y;
    }

    // ゲームパッド
    this._pollGamepad();
    if (this._gpMove) { mx += this._gpMove.x; my += this._gpMove.y; }

    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my;

    // タッチ時は大きく倒すと自動スプリント
    if (this.stickActive && Math.hypot(this.stickVec.x, this.stickVec.y) > this.autoSprintThreshold) {
      this._state.sprint = true;
    } else if (this.isTouch && !this._sprintLocked) {
      this._state.sprint = false;
    }
  }

  /** 毎フレーム末尾で呼ぶ。エッジ検出用に前フレーム状態を保存する。 */
  lateUpdate() {
    // 単発アクション（ホイール・タップ）をリセット
    this._prev = { ...this._state };
    this._state.nextWeapon = false;
    this._state.prevWeapon = false;
    if (this._tapQueue?.length) {
      for (const n of this._tapQueue) this._state[n] = false;
      this._tapQueue.length = 0;
    }
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
  }

  _pollGamepad() {
    this._gpMove = null;
    if (this.gamepadIndex === null || !navigator.getGamepads) return;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return;

    const dz = (v) => (Math.abs(v) < this.gamepadDeadzone ? 0 : (v - Math.sign(v) * this.gamepadDeadzone) / (1 - this.gamepadDeadzone));

    // 左スティック: 移動
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    this._gpMove = { x: lx, y: -ly };

    // 右スティック: 視点（加速カーブ付き）
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
    const s = this.sensitivity * this.gamepadLookScale * 0.016;
    this.lookDelta.x -= curve(rx) * s;
    this.lookDelta.y -= curve(ry) * s * (this.invertY ? -1 : 1);

    const b = gp.buttons;
    const pressed = (i) => !!(b[i] && b[i].pressed);
    this._state.fire = pressed(7) || pressed(5);     // RT / RB
    this._state.ads = pressed(6) || pressed(4);      // LT / LB
    if (pressed(0)) this._state.jump = true;
    if (pressed(1)) this._state.crouch = true;
    if (pressed(2)) this._state.reload = true;
    if (pressed(3)) this._state.interact = true;
    if (pressed(10)) this._state.sprint = true;      // L3
    if (pressed(11)) this._state.melee = true;       // R3
    if (pressed(9)) this._state.pause = true;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onPLChange);
    this.el.removeEventListener('wheel', this._onWheel);
    this.el.removeEventListener('contextmenu', this._onContext);
    this.el.removeEventListener('touchstart', this._onTouchStart);
    this.el.removeEventListener('touchmove', this._onTouchMove);
    this.el.removeEventListener('touchend', this._onTouchEnd);
    this.el.removeEventListener('touchcancel', this._onTouchEnd);
  }
}
