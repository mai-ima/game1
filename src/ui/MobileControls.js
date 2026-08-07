import { ICONS } from './Icons.js';

/**
 * スマートフォン向けのタッチ操作 UI。
 *
 * 既定は「左＝移動、右＝視点」。左利き設定で左右を入れ替える。
 * 横画面・縦画面のどちらでも遊べるようレイアウトを分けている:
 *   横画面 … 画面下の左右隅にボタンを寄せ、中央の視界を空ける
 *   縦画面 … 下部 1/3 を操作帯として使い、上 2/3 を視界に充てる
 */

const CSS = `
.mc {
  position: fixed; inset: 0; z-index: 45; pointer-events: none;
  --paper:#f2efe9; --coral:#d97757; --crimson:#d9482f; --ink:#0a0b0d;
  --mono: ui-monospace,"SF Mono",Menlo,monospace;
  --st: env(safe-area-inset-top,0px);
  --sb: env(safe-area-inset-bottom,0px);
  --sl: env(safe-area-inset-left,0px);
  --sr: env(safe-area-inset-right,0px);
  display: none;
  -webkit-user-select: none; user-select: none; touch-action: none;
}
.mc.on { display: block; }

/* 仮想スティック */
.mc .stick {
  position: absolute; width: 128px; height: 128px; margin: -64px 0 0 -64px;
  border-radius: 50%; border: 1.5px solid rgba(242,239,233,.20);
  background: radial-gradient(circle, rgba(242,239,233,.055), rgba(242,239,233,0) 70%);
  opacity: 0; transition: opacity .16s;
}
.mc .stick.on { opacity: 1; }
.mc .stick i {
  position: absolute; left: 50%; top: 50%; width: 50px; height: 50px; margin: -25px 0 0 -25px;
  border-radius: 50%; background: rgba(242,239,233,.20);
  border: 1.5px solid rgba(242,239,233,.42);
}

/* ボタン共通 */
.mc button {
  position: absolute; pointer-events: auto; border-radius: 50%;
  background: rgba(14,16,19,.68); border: 1.5px solid rgba(242,239,233,.22);
  color: var(--paper); font-family: var(--mono); font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 2px;
  transition: transform .08s, background .12s, border-color .12s;
  -webkit-tap-highlight-color: transparent;
}
.mc button:active, .mc button.held {
  transform: scale(.93); background: rgba(217,119,87,.32); border-color: var(--coral);
}
.mc button .lbl { font-size: 8px; opacity: .8; letter-spacing: .1em; }

/* --- 既定（横画面）の配置 --- */
.mc .fire {
  right: calc(20px + var(--sr)); bottom: calc(78px + var(--sb));
  width: 84px; height: 84px;
  border-color: rgba(217,72,47,.55); background: rgba(60,18,12,.46);
}
.mc .fire.held { background: rgba(217,72,47,.44); }
.mc .ads    { right: calc(112px + var(--sr)); bottom: calc(118px + var(--sb)); width: 60px; height: 60px; }
.mc .ads.on { background: rgba(217,119,87,.34); border-color: var(--coral); }
.mc .jump   { right: calc(26px + var(--sr)); bottom: calc(174px + var(--sb)); width: 52px; height: 52px; }
.mc .crouch { right: calc(110px + var(--sr)); bottom: calc(46px + var(--sb)); width: 52px; height: 52px; }
.mc .reload { right: calc(178px + var(--sr)); bottom: calc(78px + var(--sb)); width: 52px; height: 52px; }
.mc .swap   { right: calc(94px + var(--sr)); bottom: calc(190px + var(--sb)); width: 46px; height: 46px; }
.mc .melee  { left: calc(20px + var(--sl)); bottom: calc(166px + var(--sb)); width: 46px; height: 46px; }
.mc .sprint { left: calc(20px + var(--sl)); bottom: calc(104px + var(--sb)); width: 52px; height: 52px; }
.mc .sprint.on { background: rgba(217,119,87,.32); border-color: var(--coral); }
/* 使用（爆弾の設置・解除など目標系の操作） */
.mc .use { left: calc(84px + var(--sl)); bottom: calc(150px + var(--sb)); width: 52px; height: 52px; display: none; }
.mc.showuse .use { display: flex; }

/* 上部の小ボタン */
.mc .pause { right: calc(14px + var(--sr)); top: calc(12px + var(--st)); width: 38px; height: 38px; border-radius: 8px; }
.mc .board { right: calc(60px + var(--sr)); top: calc(12px + var(--st)); width: 38px; height: 38px; border-radius: 8px; }

/* リロード中の進捗リング */
.mc .reload .ring {
  position: absolute; inset: -3px; border-radius: 50%;
  border: 2px solid transparent; border-top-color: var(--coral);
  animation: mcspin .9s linear infinite; display: none;
}
.mc .reload.busy .ring { display: block; }
@keyframes mcspin { to { transform: rotate(360deg); } }

/* --- 横画面で高さが足りない端末 --- */
@media (max-height: 430px) {
  .mc .fire   { width: 70px; height: 70px; bottom: calc(58px + var(--sb)); right: calc(14px + var(--sr)); }
  .mc .ads    { width: 50px; height: 50px; bottom: calc(94px + var(--sb)); right: calc(92px + var(--sr)); }
  .mc .jump   { width: 44px; height: 44px; bottom: calc(136px + var(--sb)); right: calc(20px + var(--sr)); }
  .mc .crouch { width: 44px; height: 44px; bottom: calc(36px + var(--sb)); right: calc(90px + var(--sr)); }
  .mc .reload { width: 44px; height: 44px; bottom: calc(62px + var(--sb)); right: calc(146px + var(--sr)); }
  .mc .swap   { width: 40px; height: 40px; bottom: calc(148px + var(--sb)); right: calc(76px + var(--sr)); }
  .mc .melee  { width: 40px; height: 40px; bottom: calc(128px + var(--sb)); left: calc(14px + var(--sl)); }
  .mc .sprint { width: 44px; height: 44px; bottom: calc(80px + var(--sb)); left: calc(14px + var(--sl)); }
  .mc .use    { width: 44px; height: 44px; bottom: calc(122px + var(--sb)); left: calc(64px + var(--sl)); }
  .mc button .lbl { font-size: 7px; }
  .mc .stick { width: 106px; height: 106px; margin: -53px 0 0 -53px; }
  .mc .stick i { width: 42px; height: 42px; margin: -21px 0 0 -21px; }
  .mc .pause, .mc .board { width: 32px; height: 32px; }
  .mc .board { right: calc(52px + var(--sr)); }
}

/* --- 縦画面: 下部を操作帯にする --- */
.mc.portrait .fire   { right: calc(18px + var(--sr)); bottom: calc(112px + var(--sb)); width: 88px; height: 88px; }
.mc.portrait .ads    { right: calc(116px + var(--sr)); bottom: calc(150px + var(--sb)); width: 62px; height: 62px; }
.mc.portrait .jump   { right: calc(24px + var(--sr)); bottom: calc(212px + var(--sb)); width: 56px; height: 56px; }
.mc.portrait .crouch { right: calc(112px + var(--sr)); bottom: calc(76px + var(--sb)); width: 56px; height: 56px; }
.mc.portrait .reload { right: calc(24px + var(--sr)); bottom: calc(38px + var(--sb)); width: 56px; height: 56px; }
.mc.portrait .swap   { right: calc(96px + var(--sr)); bottom: calc(226px + var(--sb)); width: 50px; height: 50px; }
.mc.portrait .melee  { left: calc(20px + var(--sl)); bottom: calc(206px + var(--sb)); width: 50px; height: 50px; }
.mc.portrait .sprint { left: calc(20px + var(--sl)); bottom: calc(138px + var(--sb)); width: 56px; height: 56px; }
.mc.portrait .use    { left: calc(88px + var(--sl)); bottom: calc(174px + var(--sb)); width: 56px; height: 56px; }
.mc.portrait .pause  { top: calc(10px + var(--st)); }
.mc.portrait .board  { top: calc(10px + var(--st)); }

/* 対戦中に縦画面になったら横向きを促す。
   メニューやオープニングは縦でも問題ないので、対戦中だけ出す。 */
.mc .needland {
  position: fixed; inset: 0; background: rgba(10,11,13,.97); display: none;
  align-items: center; justify-content: center; flex-direction: column; gap: 20px;
  pointer-events: auto; z-index: 90; color: var(--paper); padding: 24px;
}
.mc.needland .needland { display: flex; }
.mc .needland .ico { color: var(--coral); animation: tilt 2.4s ease-in-out infinite; }
@keyframes tilt { 0%,55%,100%{transform:rotate(0)} 25%,45%{transform:rotate(-90deg)} }
.mc .needland .t {
  font: 500 13px/2 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;
  letter-spacing: .14em; text-align: center;
}
.mc .needland .s { font: 400 11px/1.9 var(--mono); letter-spacing: .1em; color: rgba(242,239,233,.5); text-align: center; }

/* --- 左利き配置: 左右のボタン群を入れ替える --- */
.mc.lefty .fire   { left: calc(20px + var(--sl)); right: auto; }
.mc.lefty .ads    { left: calc(112px + var(--sl)); right: auto; }
.mc.lefty .jump   { left: calc(26px + var(--sl)); right: auto; }
.mc.lefty .crouch { left: calc(110px + var(--sl)); right: auto; }
.mc.lefty .reload { left: calc(178px + var(--sl)); right: auto; }
.mc.lefty .swap   { left: calc(94px + var(--sl)); right: auto; }
.mc.lefty .melee  { right: calc(20px + var(--sr)); left: auto; }
.mc.lefty .sprint { right: calc(20px + var(--sr)); left: auto; }
.mc.lefty .use    { right: calc(84px + var(--sr)); left: auto; }
.mc.lefty.portrait .fire   { left: calc(18px + var(--sl)); }
.mc.lefty.portrait .ads    { left: calc(116px + var(--sl)); }
.mc.lefty.portrait .jump   { left: calc(24px + var(--sl)); }
.mc.lefty.portrait .crouch { left: calc(112px + var(--sl)); }
.mc.lefty.portrait .reload { left: calc(24px + var(--sl)); }
.mc.lefty.portrait .swap   { left: calc(96px + var(--sl)); }
`;

export class MobileControls {
  /**
   * @param {HTMLElement} parent
   * @param {import('../core/Input.js').Input} input
   * @param {import('../core/Settings.js').Settings} settings
   */
  constructor(parent, input, settings = null) {
    if (!document.getElementById('mc-style')) {
      const st = document.createElement('style');
      st.id = 'mc-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.input = input;
    this.settings = settings;
    this.root = document.createElement('div');
    this.root.className = 'mc';
    this.root.innerHTML = `
      <div class="stick" id="mcStick"><i id="mcKnob"></i></div>

      <button class="fire" id="mcFire" aria-label="射撃">${ICONS.fire({ size: 30 })}<span class="lbl">射撃</span></button>
      <button class="ads" id="mcAds" aria-label="照準">${ICONS.ads({ size: 22 })}<span class="lbl">照準</span></button>
      <button class="jump" id="mcJump" aria-label="ジャンプ">${ICONS.jump({ size: 20 })}<span class="lbl">跳</span></button>
      <button class="crouch" id="mcCrouch" aria-label="しゃがみ">${ICONS.crouch({ size: 20 })}<span class="lbl">伏</span></button>
      <button class="reload" id="mcReload" aria-label="リロード"><span class="ring"></span>${ICONS.reload({ size: 20 })}<span class="lbl">装填</span></button>
      <button class="swap" id="mcSwap" aria-label="武器切替">${ICONS.swap({ size: 19 })}</button>
      <button class="melee" id="mcMelee" aria-label="近接攻撃">${ICONS.melee({ size: 19 })}</button>
      <button class="sprint" id="mcSprint" aria-label="スプリント">${ICONS.sprint({ size: 20 })}<span class="lbl">走</span></button>
      <button class="use" id="mcUse" aria-label="使用">${ICONS.objective ? ICONS.objective({ size: 20 }) : ICONS.reload({ size: 20 })}<span class="lbl">使用</span></button>

      <button class="pause" id="mcPause" aria-label="一時停止">${ICONS.pause({ size: 17 })}</button>
      <button class="board" id="mcBoard" aria-label="スコアボード">${ICONS.board({ size: 17 })}</button>

      <div class="needland" id="mcNeedLand">
        ${ICONS.rotate({ size: 52 })}
        <div class="t">端末を横向きにしてください</div>
        <div class="s">戦闘は横画面でのみプレイできます</div>
      </div>
    `;
    parent.appendChild(this.root);

    const $ = (id) => this.root.querySelector('#' + id);
    this.el = {
      stick: $('mcStick'), knob: $('mcKnob'),
      fire: $('mcFire'), ads: $('mcAds'), jump: $('mcJump'), crouch: $('mcCrouch'),
      reload: $('mcReload'), swap: $('mcSwap'), melee: $('mcMelee'), sprint: $('mcSprint'),
      use: $('mcUse'),
      pause: $('mcPause'), board: $('mcBoard'), needLand: $('mcNeedLand'),
    };
    // 対戦中かどうか（縦画面の警告を出す条件）
    this.inGameplay = false;
    this.onOrientationBlock = null;

    this.onPause = null;
    this.onBoard = null;
    this.adsToggled = false;
    this.sprintLocked = false;

    this._wire();
    this._applyLayout();
    window.addEventListener('orientationchange', () => setTimeout(() => this._applyLayout(), 260));
    window.addEventListener('resize', () => this._applyLayout());
    settings?.onChange((k) => { if (k === 'leftHanded') this._applyLayout(); });

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

  show() {
    this.root.classList.add('on');
    this.input.isTouch = true;
    this.inGameplay = true;
    // 前の試合の押下・トグル状態を持ち越さない
    this.resetButtons();
    this._applyLayout();
  }

  hide() {
    this.root.classList.remove('on');
    this.inGameplay = false;
    this.root.classList.remove('needland');
    this.resetButtons();
  }

  /** 縦画面で戦闘が始められない状態か */
  get blockedByOrientation() {
    return this.inGameplay && window.innerHeight >= window.innerWidth;
  }

  /** 設定変更後などに、外部から配置を再適用する */
  applyLayout() { this._applyLayout(); }

  /** 画面の向きと利き手を反映する */
  _applyLayout() {
    const portrait = window.innerHeight >= window.innerWidth;
    this.root.classList.toggle('portrait', portrait);
    // 対戦中の縦画面は操作が成立しないため、横向きを促して一時停止する
    const block = this.inGameplay && portrait;
    this.root.classList.toggle('needland', block);
    this.onOrientationBlock?.(block);
    const lefty = !!this.settings?.get('leftHanded');
    this.root.classList.toggle('lefty', lefty);
    // 移動スティックの側も入れ替える
    this.input.stickSide = lefty ? 'right' : 'left';
  }

  /*
   * ボタンの束ね方について。
   *
   * タッチ端末では touchstart / touchend のあとにブラウザが
   * 互換のマウスイベント（mousedown / mouseup / click）を続けて発火する。
   * touchstart で preventDefault すれば大半の環境では抑制されるが、
   * 抑制されない場合や、抑制の効かない経路（ペン入力・一部の WebView）が
   * 残っており、そこでは 1 回の操作でハンドラが 2 度走る。
   * トグル（覗き込み・スプリント）だと 2 回で元に戻るため
   * 「押しても何も起きないボタン」になり、タップ系も二重に発火する。
   *
   * そこで、直前にタッチで処理した時刻を覚えておき、
   * その直後に来たマウスイベントは互換イベントとみなして捨てる。
   * マウス操作しかない環境（PC でのデバッグ）では従来どおり動く。
   */
  _wire() {
    const COMPAT_MS = 700;   // タッチ後、この時間内のマウスイベントは互換とみなす

    /** タッチとマウスの両方から同じ処理を呼ぶ。互換イベントは捨てる。 */
    const bindPress = (el, onDown, onUp) => {
      /** @type {number|null} この要素を押している指の識別子 */
      let touchId = null;

      const touchDown = (e) => {
        e.preventDefault(); e.stopPropagation();
        this._lastTouchAt = performance.now();
        // 既に別の指で押されているなら、その指を優先して二重発火を避ける
        if (touchId !== null) return;
        const t = e.changedTouches[0];
        touchId = t ? t.identifier : 0;
        onDown();
      };
      const touchUp = (e) => {
        this._lastTouchAt = performance.now();
        // 押し始めた指が離れたときだけ解除する。
        // 別の指のイベントで解除すると、押しっぱなしが途中で切れる。
        if (touchId !== null) {
          let matched = false;
          for (const t of e.changedTouches) if (t.identifier === touchId) matched = true;
          if (!matched) return;
        }
        e.preventDefault(); e.stopPropagation();
        touchId = null;
        onUp?.();
      };

      const mouseDown = (e) => {
        if (this._isCompatMouse()) return;
        e.preventDefault(); e.stopPropagation();
        onDown();
      };
      const mouseUp = (e) => {
        if (this._isCompatMouse()) return;
        e.preventDefault(); e.stopPropagation();
        onUp?.();
      };

      el.addEventListener('touchstart', touchDown, { passive: false });
      el.addEventListener('touchend', touchUp, { passive: false });
      el.addEventListener('touchcancel', touchUp, { passive: false });
      el.addEventListener('mousedown', mouseDown);
      if (onUp) {
        el.addEventListener('mouseup', mouseUp);
        el.addEventListener('mouseleave', (e) => { if (e.buttons) mouseUp(e); });
      }
      // 互換 click が漏れてきても何も起こさない
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      // 長押しでの選択・コンテキストメニューを抑える
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      return () => { touchId = null; };
    };

    this._resets = [];

    // 押している間だけ有効
    const hold = (el, action) => {
      const reset = bindPress(el,
        () => { this.input.setAction(action, true); el.classList.add('held'); },
        () => { this.input.setAction(action, false); el.classList.remove('held'); });
      this._resets.push(() => { reset(); this.input.setAction(action, false); el.classList.remove('held'); });
    };

    // 1 回押すと 1 フレームだけ有効
    const tap = (el, action) => {
      const reset = bindPress(el, () => {
        this.input.tapAction(action);
        el.classList.add('held');
        clearTimeout(el._holdT);
        el._holdT = setTimeout(() => el.classList.remove('held'), 110);
      }, () => {});
      this._resets.push(() => { reset(); el.classList.remove('held'); });
    };

    hold(this.el.fire, 'fire');
    hold(this.el.use, 'interact');
    tap(this.el.jump, 'jump');
    tap(this.el.crouch, 'crouch');
    tap(this.el.reload, 'reload');
    tap(this.el.swap, 'nextWeapon');
    tap(this.el.melee, 'melee');

    // 覗き込みとスプリントは押しっぱなしが辛いのでトグルにする
    const toggle = (el, action, key) => {
      const apply = (on) => {
        this[key] = on;
        this.input.setAction(action, on);
        if (key === 'sprintLocked') this.input._sprintLocked = on;
        el.classList.toggle('on', on);
      };
      const reset = bindPress(el, () => apply(!this[key]));
      this._resets.push(() => { reset(); apply(false); });
      return apply;
    };
    this._applyAds = toggle(this.el.ads, 'ads', 'adsToggled');
    this._applySprint = toggle(this.el.sprint, 'sprint', 'sprintLocked');

    bindPress(this.el.pause, () => this.onPause?.());
    // スコアボードは押している間だけ表示
    bindPress(this.el.board, () => this.onBoard?.(true), () => this.onBoard?.(false));
  }

  /** 直前のタッチに続いて発火した互換マウスイベントか */
  _isCompatMouse() {
    return this._lastTouchAt !== undefined && performance.now() - this._lastTouchAt < 700;
  }

  /**
   * すべてのボタンの押下・トグル状態を解除する。
   * ポーズや死亡でゲーム側の入力が clear されると、UI 側の
   * 「押しっぱなし」「トグル ON」の表示と実際の入力状態がずれるため、
   * 同じ契機でこちらも戻す。
   */
  resetButtons() {
    for (const r of this._resets || []) r();
  }

  /** 覗き込みを外部から解除（死亡時など） */
  resetAds() {
    this._applyAds?.(false);
  }

  setReloading(on) { this.el.reload.classList.toggle('busy', on); }

  /**
   * 「使用」ボタンの表示切り替え。
   * 使う場面のあるモード（捜索と破壊）でだけ出す。
   * 常に置くと横画面の限られた領域を無駄に潰すため。
   */
  setUseVisible(on) { this.root.classList.toggle('showuse', !!on); }

  dispose() { this.root.remove(); }
}
