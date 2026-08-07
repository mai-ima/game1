/**
 * スマートフォン向けのタッチ操作 UI。
 *
 * 画面左＝移動（仮想スティック）、右＝視点。
 * ボタン類は指が届きやすい右下と左下へ寄せ、
 * セーフエリア（ノッチ・ホームインジケータ）を避ける。
 */

const CSS = `
.mc {
  position: fixed; inset: 0; z-index: 45; pointer-events: none;
  --paper:#f2efe9; --coral:#d97757; --crimson:#d9482f; --ink:#0a0b0d;
  --mono: ui-monospace,"SF Mono",Menlo,monospace;
  --sb: env(safe-area-inset-bottom,0px);
  --sl: env(safe-area-inset-left,0px);
  --sr: env(safe-area-inset-right,0px);
  display: none;
  -webkit-user-select: none; user-select: none; touch-action: none;
}
.mc.on { display: block; }

/* 仮想スティック */
.mc .stick {
  position: absolute; width: 132px; height: 132px; margin: -66px 0 0 -66px;
  border-radius: 50%; border: 1.5px solid rgba(242,239,233,.20);
  background: radial-gradient(circle, rgba(242,239,233,.055), rgba(242,239,233,0) 70%);
  opacity: 0; transition: opacity .16s;
}
.mc .stick.on { opacity: 1; }
.mc .stick i {
  position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px;
  border-radius: 50%; background: rgba(242,239,233,.20);
  border: 1.5px solid rgba(242,239,233,.42);
  backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
}

/* ボタン共通 */
.mc button {
  position: absolute; pointer-events: auto; border-radius: 50%;
  background: rgba(14,16,19,.50); border: 1.5px solid rgba(242,239,233,.22);
  color: var(--paper); font-family: var(--mono); font-weight: 600;
  letter-spacing: .06em; display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 2px; backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px);
  transition: transform .08s, background .12s, border-color .12s;
  -webkit-tap-highlight-color: transparent;
}
.mc button:active, .mc button.held {
  transform: scale(.93); background: rgba(217,119,87,.30); border-color: var(--coral);
}
.mc button .lbl { font-size: 8.5px; opacity: .78; letter-spacing: .12em; }
.mc button .ic { font-size: 17px; line-height: 1; }

/* 配置 */
.mc .fire {
  right: calc(22px + var(--sr)); bottom: calc(104px + var(--sb));
  width: 88px; height: 88px; font-size: 11px;
  border-color: rgba(217,72,47,.55); background: rgba(60,18,12,.45);
}
.mc .fire.held { background: rgba(217,72,47,.42); }
.mc .ads {
  right: calc(122px + var(--sr)); bottom: calc(150px + var(--sb));
  width: 64px; height: 64px;
}
.mc .ads.on { background: rgba(217,119,87,.34); border-color: var(--coral); }
.mc .jump  { right: calc(30px + var(--sr)); bottom: calc(212px + var(--sb)); width: 56px; height: 56px; }
.mc .crouch{ right: calc(120px + var(--sr)); bottom: calc(66px + var(--sb)); width: 56px; height: 56px; }
.mc .reload{ right: calc(190px + var(--sr)); bottom: calc(96px + var(--sb)); width: 56px; height: 56px; }
.mc .swap  { right: calc(96px + var(--sr)); bottom: calc(226px + var(--sb)); width: 50px; height: 50px; }
.mc .melee { left: calc(24px + var(--sl)); bottom: calc(190px + var(--sb)); width: 50px; height: 50px; }
.mc .sprint{ left: calc(24px + var(--sl)); bottom: calc(120px + var(--sb)); width: 56px; height: 56px; }
.mc .sprint.on { background: rgba(217,119,87,.32); border-color: var(--coral); }

/* 上部の小ボタン */
.mc .pause {
  right: calc(16px + var(--sr)); top: calc(14px + env(safe-area-inset-top,0px));
  width: 38px; height: 38px; border-radius: 6px;
}
.mc .board {
  right: calc(62px + var(--sr)); top: calc(14px + env(safe-area-inset-top,0px));
  width: 38px; height: 38px; border-radius: 6px;
}

/* リロード中の進捗リング */
.mc .reload .ring {
  position: absolute; inset: -3px; border-radius: 50%;
  border: 2px solid transparent; border-top-color: var(--coral);
  animation: spin .9s linear infinite; display: none;
}
.mc .reload.busy .ring { display: block; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 横画面のスマートフォンは縦の余白が乏しいため、全体を圧縮する */
@media (max-height: 460px) {
  .mc .fire   { width: 72px; height: 72px; right: calc(16px + var(--sr)); bottom: calc(74px + var(--sb)); }
  .mc .ads    { width: 54px; height: 54px; right: calc(98px + var(--sr)); bottom: calc(112px + var(--sb)); }
  .mc .jump   { width: 46px; height: 46px; right: calc(24px + var(--sr)); bottom: calc(158px + var(--sb)); }
  .mc .crouch { width: 46px; height: 46px; right: calc(96px + var(--sr)); bottom: calc(48px + var(--sb)); }
  .mc .reload { width: 46px; height: 46px; right: calc(156px + var(--sr)); bottom: calc(74px + var(--sb)); }
  .mc .swap   { width: 42px; height: 42px; right: calc(80px + var(--sr)); bottom: calc(170px + var(--sb)); }
  .mc .melee  { width: 42px; height: 42px; left: calc(18px + var(--sl)); bottom: calc(146px + var(--sb)); }
  .mc .sprint { width: 46px; height: 46px; left: calc(18px + var(--sl)); bottom: calc(92px + var(--sb)); }
  .mc button .lbl { font-size: 7.5px; }
  .mc button .ic { font-size: 14px; }
  .mc .stick { width: 108px; height: 108px; margin: -54px 0 0 -54px; }
  .mc .stick i { width: 44px; height: 44px; margin: -22px 0 0 -22px; }
  .mc .pause, .mc .board { width: 32px; height: 32px; }
  .mc .board { right: calc(54px + var(--sr)); }
}

/* 横向き推奨の案内 */
.mc .rotate {
  position: fixed; inset: 0; background: rgba(10,11,13,.96); display: none;
  align-items: center; justify-content: center; flex-direction: column; gap: 18px;
  pointer-events: auto; z-index: 70; color: var(--paper);
}
.mc .rotate.on { display: flex; }
.mc .rotate .ic { font-size: 42px; animation: tilt 2s ease-in-out infinite; }
@keyframes tilt { 0%,100%{transform:rotate(0)} 50%{transform:rotate(-90deg)} }
.mc .rotate .t { font: 500 12px/1.9 -apple-system,"Hiragino Sans",sans-serif; letter-spacing: .18em; text-align: center; }
`;

export class MobileControls {
  /**
   * @param {HTMLElement} parent
   * @param {import('../core/Input.js').Input} input
   */
  constructor(parent, input) {
    if (!document.getElementById('mc-style')) {
      const st = document.createElement('style');
      st.id = 'mc-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.input = input;
    this.root = document.createElement('div');
    this.root.className = 'mc';
    this.root.innerHTML = `
      <div class="stick" id="mcStick"><i id="mcKnob"></i></div>

      <button class="fire" id="mcFire"><span class="ic">◉</span><span class="lbl">射撃</span></button>
      <button class="ads" id="mcAds"><span class="ic">⊕</span><span class="lbl">照準</span></button>
      <button class="jump" id="mcJump"><span class="ic">↑</span><span class="lbl">跳</span></button>
      <button class="crouch" id="mcCrouch"><span class="ic">↓</span><span class="lbl">伏</span></button>
      <button class="reload" id="mcReload"><span class="ring"></span><span class="ic">⟳</span><span class="lbl">装填</span></button>
      <button class="swap" id="mcSwap"><span class="ic">⇄</span></button>
      <button class="melee" id="mcMelee"><span class="ic">✕</span></button>
      <button class="sprint" id="mcSprint"><span class="ic">≫</span><span class="lbl">走</span></button>

      <button class="pause" id="mcPause"><span class="ic">⏸</span></button>
      <button class="board" id="mcBoard"><span class="ic">▤</span></button>

      <div class="rotate" id="mcRotate">
        <div class="ic">▭</div>
        <div class="t">端末を横向きにしてください<br><span style="opacity:.6">横画面でのプレイを推奨しています</span></div>
      </div>
    `;
    parent.appendChild(this.root);

    const $ = (id) => this.root.querySelector('#' + id);
    this.el = {
      stick: $('mcStick'), knob: $('mcKnob'),
      fire: $('mcFire'), ads: $('mcAds'), jump: $('mcJump'), crouch: $('mcCrouch'),
      reload: $('mcReload'), swap: $('mcSwap'), melee: $('mcMelee'), sprint: $('mcSprint'),
      pause: $('mcPause'), board: $('mcBoard'), rotate: $('mcRotate'),
    };

    this.onPause = null;
    this.onBoard = null;
    this.adsToggled = false;
    this.sprintLocked = false;

    this._wire();
    this._checkOrientation();
    window.addEventListener('orientationchange', () => setTimeout(() => this._checkOrientation(), 260));
    window.addEventListener('resize', () => this._checkOrientation());

    // 仮想スティックの表示を Input から受け取る
    input.onStickChange = (active, ox, oy, dx, dy) => {
      this.el.stick.classList.toggle('on', active);
      if (active) {
        this.el.stick.style.left = `${ox}px`;
        this.el.stick.style.top = `${oy}px`;
        this.el.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else {
        this.el.knob.style.transform = 'translate(0,0)';
      }
    };
  }

  /** タッチデバイスか */
  static isTouch() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  show() { this.root.classList.add('on'); this.input.isTouch = true; }
  hide() { this.root.classList.remove('on'); }

  _wire() {
    // 押している間 true にするボタン
    const hold = (el, action) => {
      const down = (e) => {
        e.preventDefault(); e.stopPropagation();
        this.input.setAction(action, true);
        el.classList.add('held');
      };
      const up = (e) => {
        e.preventDefault(); e.stopPropagation();
        this.input.setAction(action, false);
        el.classList.remove('held');
      };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', up);
    };

    // 1 回押すと 1 フレームだけ true
    const tap = (el, action) => {
      const down = (e) => {
        e.preventDefault(); e.stopPropagation();
        this.input.tapAction(action);
        el.classList.add('held');
        setTimeout(() => el.classList.remove('held'), 110);
      };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('mousedown', down);
    };

    hold(this.el.fire, 'fire');
    tap(this.el.jump, 'jump');
    tap(this.el.crouch, 'crouch');
    tap(this.el.reload, 'reload');
    tap(this.el.swap, 'nextWeapon');
    tap(this.el.melee, 'melee');

    // ADS はトグル（押しっぱなしは指が疲れる）
    const adsToggle = (e) => {
      e.preventDefault(); e.stopPropagation();
      this.adsToggled = !this.adsToggled;
      this.input.setAction('ads', this.adsToggled);
      this.el.ads.classList.toggle('on', this.adsToggled);
    };
    this.el.ads.addEventListener('touchstart', adsToggle, { passive: false });
    this.el.ads.addEventListener('mousedown', adsToggle);

    // スプリントもトグル
    const sprintToggle = (e) => {
      e.preventDefault(); e.stopPropagation();
      this.sprintLocked = !this.sprintLocked;
      this.input._sprintLocked = this.sprintLocked;
      this.input.setAction('sprint', this.sprintLocked);
      this.el.sprint.classList.toggle('on', this.sprintLocked);
    };
    this.el.sprint.addEventListener('touchstart', sprintToggle, { passive: false });
    this.el.sprint.addEventListener('mousedown', sprintToggle);

    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    this.el.pause.addEventListener('touchstart', (e) => { stop(e); this.onPause?.(); }, { passive: false });
    this.el.pause.addEventListener('click', (e) => { stop(e); this.onPause?.(); });

    // スコアボードは押している間だけ表示
    const boardDown = (e) => { stop(e); this.onBoard?.(true); };
    const boardUp = (e) => { stop(e); this.onBoard?.(false); };
    this.el.board.addEventListener('touchstart', boardDown, { passive: false });
    this.el.board.addEventListener('touchend', boardUp);
    this.el.board.addEventListener('mousedown', boardDown);
    this.el.board.addEventListener('mouseup', boardUp);
  }

  /** ADS 状態を外部から解除（死亡時など） */
  resetAds() {
    this.adsToggled = false;
    this.input.setAction('ads', false);
    this.el.ads.classList.remove('on');
  }

  setReloading(on) { this.el.reload.classList.toggle('busy', on); }

  _checkOrientation() {
    const portrait = window.innerHeight > window.innerWidth;
    const small = Math.min(window.innerWidth, window.innerHeight) < 500;
    this.el.rotate.classList.toggle('on', portrait && small && this.root.classList.contains('on'));
  }

  dispose() { this.root.remove(); }
}
