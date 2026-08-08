import { MODE_LIST, GAME_MODES } from '../game/GameModes.js';
import { MAP_LIST } from '../world/maps/index.js';
import { WEAPONS, ATTACHMENTS, WEAPON_CLASS } from '../player/weapons/WeaponDefs.js';
import { DIFFICULTY } from '../ai/Bot.js';
import { QUALITY, QUALITY_INFO } from '../core/Engine.js';
import { ICONS, MARK_CSS, BRAND, burstMarkHTML, burstStaticHTML, opusMarkHTML, engineMarkHTML } from './Icons.js';

/**
 * タイトル・メインメニュー・設定・戦績画面。
 *
 * デザイン方針:
 *   ゲームメニューの定型（面取りパネル + ネオン）ではなく、
 *   「作戦文書」の体裁 — 罫線・見出し番号・等幅の指標・トンボ — を骨格にする。
 *   強い色はコーラル 1 色に絞り、他は無彩色で支える。
 *
 * PC とスマートフォンでレイアウトを切り替える:
 *   PC   … 左に縦ナビ、右に広いパネル。マウス前提で情報密度を高くする。
 *   スマホ … 下部にタブバー、1 カラムのカード。指で押せる大きさを確保する。
 */

const CSS = MARK_CSS + `
.ui {
  --ink:#0a0b0d; --ink2:#111316; --ink3:#191c20;
  --paper:#f2efe9; --steel:#9aa1a8; --dim:#5d646c; --line:rgba(242,239,233,.10);
  --coral:#d97757; --crimson:#d9482f; --ally:#4a90d9;
  --mono: ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --sans: -apple-system,BlinkMacSystemFont,"Helvetica Neue","Hiragino Sans","Noto Sans JP",sans-serif;
  --st: env(safe-area-inset-top,0px); --sb: env(safe-area-inset-bottom,0px);
  --sl: env(safe-area-inset-left,0px); --sr: env(safe-area-inset-right,0px);
  position: fixed; inset: 0; z-index: 60; color: var(--paper); font-family: var(--sans);
  display: none; overflow: hidden;
}
.ui.on { display: block; }
.ui * { box-sizing: border-box; }
.ui button { font-family: inherit; color: inherit; background: none; border: none; cursor: pointer; }
.ui button:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }

/* ---------------- スプラッシュ ---------------- */
.splash {
  position: absolute; inset: 0; background: var(--ink);
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  transition: opacity .7s cubic-bezier(.4,0,.2,1); padding: 0 20px;
}
.splash.out { opacity: 0; pointer-events: none; }
.splash .stage { display: none; flex-direction: column; align-items: center; }
.splash .stage.on { display: flex; }
.splash .wm {
  margin-top: 28px; font: 500 13px/1 var(--sans); letter-spacing: .44em; text-indent: .44em;
  color: #b9bfc5; text-transform: uppercase; opacity: 0; text-align: center;
  animation: fadeUp .8s .45s cubic-bezier(.16,1,.3,1) forwards;
}
.splash .role {
  margin-top: 11px; font: 500 9px/1 var(--mono); letter-spacing: .3em; color: var(--dim);
  opacity: 0; animation: fadeUp .8s .68s cubic-bezier(.16,1,.3,1) forwards; text-align: center;
}
@keyframes fadeUp { from { opacity: 0; transform: translateY(9px); } to { opacity: .92; transform: none; } }

/* ---------------- タイトル ---------------- */
.title {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; padding: calc(20px + var(--st)) 18px calc(20px + var(--sb));
  background: radial-gradient(ellipse at 50% 42%, #1a1c20 0%, #0a0b0d 68%);
  transition: opacity .5s;
}
.title.out { opacity: 0; pointer-events: none; }
.title .rule { width: min(560px, 80vw); height: 1px; background: var(--line); }
.title .eyebrow {
  font: 500 9px/1 var(--mono); letter-spacing: .4em; color: var(--coral);
  text-transform: uppercase; margin-bottom: 20px; text-align: center;
}
.title h1 {
  font: 200 clamp(28px, 7vw, 88px)/1.0 var(--sans);
  letter-spacing: .15em; margin: 18px 0; text-transform: uppercase;
  display: flex; flex-wrap: wrap; justify-content: center; gap: 0 .34em;
  max-width: 94vw; text-align: center;
}
.title h1 span, .title h1 b { display: inline-block; text-indent: .15em; }
.title h1 b { font-weight: 500; color: var(--coral); }
.title .tag {
  margin-top: 18px; font: 400 11px/1.9 var(--sans); letter-spacing: .22em;
  color: var(--steel); text-align: center;
}
.title .cta {
  margin-top: 42px; font: 500 11px/1 var(--mono); letter-spacing: .28em;
  color: var(--paper); padding: 16px 34px; border: 1px solid rgba(242,239,233,.24);
  border-radius: 2px; transition: all .2s; text-transform: uppercase;
  min-height: 48px;
}
.title .cta:hover { background: var(--coral); border-color: var(--coral); color: var(--ink); }
.title .blink { animation: blink 2.1s ease-in-out infinite; }
@keyframes blink { 0%,100%{opacity:.6} 50%{opacity:1} }
.title .credit {
  position: absolute; bottom: calc(18px + var(--sb)); left: 0; right: 0; text-align: center;
  font: 400 9px/1.8 var(--mono); letter-spacing: .16em; color: var(--dim);
}

/* ---------------- メニュー共通 ---------------- */
.menu {
  position: absolute; inset: 0; display: none; flex-direction: column;
  background: linear-gradient(160deg, #0d0f12 0%, #0a0b0d 55%, #12100f 100%);
}
.menu.on { display: flex; }

.mhead {
  display: flex; align-items: center; gap: 13px;
  padding: calc(16px + var(--st)) calc(20px + var(--sr)) 13px calc(20px + var(--sl));
  border-bottom: 1px solid var(--line); flex: 0 0 auto;
}
.mhead .t { font: 500 12px/1 var(--sans); letter-spacing: .28em; text-transform: uppercase; }
.mhead .meta { margin-left: auto; font: 500 9px/1 var(--mono); letter-spacing: .18em; color: var(--dim); }

.mbody { flex: 1; display: flex; min-height: 0; }
.mpanel {
  flex: 1; min-width: 0; overflow-y: auto; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.mpanel::-webkit-scrollbar { width: 3px; }
.mpanel::-webkit-scrollbar-thumb { background: rgba(242,239,233,.16); }

.sec { margin-bottom: 26px; }
.sec > h2 {
  font: 500 9px/1 var(--mono); letter-spacing: .28em; color: var(--dim);
  text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 10px;
}
.sec > h2::after { content: ''; flex: 1; height: 1px; background: var(--line); }

/* カード */
.cards { display: grid; gap: 8px; }
.card {
  text-align: left; padding: 15px 16px; border: 1px solid var(--line);
  border-radius: 3px; background: rgba(242,239,233,.02); transition: all .18s; position: relative;
  display: block; width: 100%;
}
.card:hover { border-color: rgba(242,239,233,.24); background: rgba(242,239,233,.05); }
.card.on { border-color: var(--coral); background: rgba(217,119,87,.10); }
.card .ico { color: var(--coral); }
.card .nm { font: 400 14px/1.2 var(--sans); letter-spacing: .06em; margin-top: 8px; }
.card .nm .tag {
  margin-left: 9px; padding: 3px 7px; border: 1px solid rgba(242,239,233,.20);
  border-radius: 2px; font: 500 8.5px/1 var(--mono); letter-spacing: .16em;
  color: var(--dim); vertical-align: 2px;
}
.card .en { font: 500 8.5px/1 var(--mono); letter-spacing: .16em; color: var(--dim); margin-top: 5px; text-transform: uppercase; }
.card .ds { font: 400 11.5px/1.65 var(--sans); color: var(--steel); margin-top: 9px; }
.card.on::after {
  content: ''; position: absolute; right: 11px; top: 11px; width: 5px; height: 5px;
  border-radius: 50%; background: var(--coral);
}

/* 性能バー */
.stats { margin-top: 11px; display: flex; flex-direction: column; gap: 5px; }
.stat { display: flex; align-items: center; gap: 8px; }
.stat .k { font: 500 8.5px/1 var(--mono); letter-spacing: .1em; color: var(--dim); width: 44px; }
.stat .b { flex: 1; height: 2px; background: rgba(242,239,233,.10); border-radius: 2px; overflow: hidden; }
.stat .b > i { display: block; height: 100%; background: var(--coral); }
.stat .v { font: 500 9px/1 var(--mono); color: var(--steel); width: 24px; text-align: right; font-variant-numeric: tabular-nums; }

/* 画質の内訳表 */
.qtable {
  width: 100%; border-collapse: collapse; margin: 10px 0 4px;
  font: 500 10px/1 var(--mono); color: var(--steel);
}
.qtable th {
  text-align: left; font-weight: 500; color: var(--dim); letter-spacing: .12em;
  padding: 0 8px 7px 0; font-size: 8.5px; text-transform: uppercase; white-space: nowrap;
}
.qtable td { padding: 6px 8px 6px 0; border-top: 1px solid var(--line); white-space: nowrap; }
.qtable tr.on td { color: var(--coral); }
.qtable tr.on td:first-child { font-weight: 700; }

/* 補足文 */
.note {
  font: 400 11px/1.7 var(--sans); color: var(--dim);
  padding: 8px 0 2px; border-bottom: 1px solid var(--line);
}

/* 破壊的な操作のボタン */
.ui button.danger {
  padding: 10px 18px; border: 1px solid rgba(217,72,47,.55); border-radius: 2px;
  font: 500 10px/1 var(--mono); letter-spacing: .18em; color: var(--crimson);
  transition: all .16s; min-height: 40px;
}
.ui button.danger:hover { background: var(--crimson); border-color: var(--crimson); color: var(--paper); }
.ui button.danger.confirm { background: var(--crimson); border-color: var(--crimson); color: var(--paper); }

/* 設定行 */
.row { display: flex; align-items: center; gap: 16px; padding: 13px 2px; border-bottom: 1px solid var(--line); }
.row .lab { flex: 1; min-width: 0; }
.row .lab .n { font: 400 13.5px/1.35 var(--sans); letter-spacing: .03em; }
.row .lab .h { font: 400 10.5px/1.55 var(--sans); color: var(--dim); margin-top: 3px; }
.row .ctl { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; }
.row input[type=range] {
  -webkit-appearance: none; appearance: none; width: 148px; height: 22px;
  background: transparent; outline: none;
}
.row input[type=range]::-webkit-slider-runnable-track { height: 2px; background: rgba(242,239,233,.16); border-radius: 2px; }
.row input[type=range]::-moz-range-track { height: 2px; background: rgba(242,239,233,.16); border-radius: 2px; }
.row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 15px; height: 15px; border-radius: 50%; margin-top: -6.5px;
  background: var(--coral); cursor: pointer; border: 2px solid var(--ink);
}
.row input[type=range]::-moz-range-thumb {
  width: 15px; height: 15px; border-radius: 50%; background: var(--coral);
  cursor: pointer; border: 2px solid var(--ink);
}
.row .val { font: 500 11px/1 var(--mono); color: var(--steel); width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
.seg { display: flex; border: 1px solid var(--line); border-radius: 2px; overflow: hidden; }
.seg button { padding: 9px 13px; font: 500 10px/1 var(--mono); letter-spacing: .08em; color: var(--steel); transition: all .15s; min-height: 38px; }
.seg button.on { background: var(--coral); color: var(--ink); }
.tgl { width: 44px; height: 24px; border-radius: 12px; background: rgba(242,239,233,.14); position: relative; transition: background .18s; cursor: pointer; flex: 0 0 auto; }
.tgl::after {
  content: ''; position: absolute; left: 3px; top: 3px; width: 18px; height: 18px;
  border-radius: 50%; background: var(--paper); transition: transform .18s cubic-bezier(.4,0,.2,1);
}
.tgl.on { background: var(--coral); }
.tgl.on::after { transform: translateX(20px); }

/* 出撃ボタン */
.deploy {
  width: 100%; padding: 18px; border-radius: 3px; background: var(--coral); color: var(--ink);
  font: 600 13px/1 var(--mono); letter-spacing: .32em; text-transform: uppercase;
  transition: all .18s; display: flex; flex-direction: column; align-items: center; gap: 7px;
  min-height: 56px;
}
.deploy:hover { background: #e58a68; }
.deploy .sub { font: 500 9px/1 var(--mono); letter-spacing: .16em; opacity: .68; }

/* ================= PC レイアウト ================= */
.ui.desktop .mbody { gap: 26px; padding: 22px calc(24px + var(--sr)) 22px calc(24px + var(--sl)); }
.ui.desktop .mnav { width: 224px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px; }
.ui.desktop .mnav button {
  display: flex; align-items: center; gap: 12px; padding: 13px 14px;
  text-align: left; border-left: 2px solid transparent; transition: all .16s;
}
.ui.desktop .mnav button .n { font: 500 9px/1 var(--mono); color: var(--dim); letter-spacing: .08em; }
.ui.desktop .mnav button .l { font: 400 15px/1 var(--sans); letter-spacing: .08em; }
.ui.desktop .mnav button .ico { color: var(--dim); margin-left: auto; }
.ui.desktop .mnav button:hover { background: rgba(242,239,233,.04); }
.ui.desktop .mnav button.on { border-left-color: var(--coral); background: rgba(217,119,87,.09); }
.ui.desktop .mnav button.on .l,
.ui.desktop .mnav button.on .ico { color: var(--coral); }
.ui.desktop .mnav .spacer { flex: 1; }
.ui.desktop .mnav .ver { font: 400 8.5px/1.7 var(--mono); color: var(--dim); letter-spacing: .1em; padding: 0 14px; }
.ui.desktop .mpanel { padding-right: 4px; }
.ui.desktop .cards { grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); }
.ui.desktop .tabbar { display: none; }
.ui.desktop .deploybar { display: none; }

/* ================= スマートフォン レイアウト ================= */
.ui.touch .mnav { display: none; }
.ui.touch .mbody { flex-direction: column; }
.ui.touch .mpanel { padding: 18px calc(18px + var(--sr)) 8px calc(18px + var(--sl)); }
.ui.touch .cards { grid-template-columns: 1fr; gap: 9px; }
.ui.touch .card { padding: 16px 17px; }
.ui.touch .card .nm { font-size: 16px; }
.ui.touch .card .ds { font-size: 12.5px; }
.ui.touch .row { padding: 15px 2px; }
.ui.touch .row .lab .n { font-size: 15px; }
.ui.touch .row .lab .h { font-size: 11.5px; }
.ui.touch .row input[type=range] { width: 128px; }
.ui.touch .sec > h2 { font-size: 9.5px; }

/* 出撃バー（スマホは常時表示で固定） */
.ui.touch .deploybar {
  flex: 0 0 auto; padding: 10px calc(16px + var(--sr)) calc(10px + var(--sb)) calc(16px + var(--sl));
  border-top: 1px solid var(--line); background: rgba(9,10,12,.97);
}
.ui.touch .mpanel .deploy { display: none; }

/* 下部タブバー */
.ui.touch .tabbar {
  flex: 0 0 auto; display: flex; border-top: 1px solid var(--line);
  background: rgba(9,10,12,.98); padding-bottom: var(--sb);
}
.ui.touch .tabbar button {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 10px 4px 9px; color: var(--dim); transition: color .15s; min-height: 54px;
}
.ui.touch .tabbar button .l { font: 500 10px/1 var(--sans); letter-spacing: .1em; }
.ui.touch .tabbar button.on { color: var(--coral); }
.ui.touch .tabbar button.on .l { font-weight: 600; }

/* 縦画面のスマホ */
.ui.touch.portrait .mhead .t { font-size: 11px; letter-spacing: .2em; }
.ui.touch.portrait .mhead .meta { display: none; }

/* 横画面のスマホ（縦の余白が少ない） */
.ui.touch.landscape .mhead { padding-top: calc(9px + var(--st)); padding-bottom: 9px; }
.ui.touch.landscape .mpanel { padding-top: 12px; }
.ui.touch.landscape .sec { margin-bottom: 18px; }
.ui.touch.landscape .card { padding: 12px 14px; }
.ui.touch.landscape .card .nm { font-size: 14px; margin-top: 6px; }
.ui.touch.landscape .card .ds { font-size: 11.5px; margin-top: 6px; }
.ui.touch.landscape .cards { grid-template-columns: repeat(2, 1fr); }
.ui.touch.landscape .tabbar button { flex-direction: row; gap: 8px; min-height: 44px; padding: 7px; }
.ui.touch.landscape .deploy { padding: 13px; min-height: 46px; }
.ui.touch.landscape .title h1 { margin: 10px 0; }
.ui.touch.landscape .title .cta { margin-top: 22px; padding: 13px 26px; }
.ui.touch.landscape .title .tag { margin-top: 10px; }
.ui.touch.landscape .title .eyebrow { margin-bottom: 12px; }

/* ---------------- ローディング ---------------- */
.loading {
  position: absolute; inset: 0; display: none; flex-direction: column;
  align-items: center; justify-content: center; background: var(--ink); padding: 0 24px;
}
.loading.on { display: flex; }
.loading .mapname { font: 200 clamp(24px,6vw,48px)/1 var(--sans); letter-spacing: .18em; text-transform: uppercase; text-align: center; }
.loading .mapdesc { margin-top: 14px; font: 400 12px/1.9 var(--sans); color: var(--steel); max-width: 460px; text-align: center; }
.loading .bar { margin-top: 36px; width: min(300px,72vw); height: 2px; background: rgba(242,239,233,.10); border-radius: 2px; overflow: hidden; }
.loading .bar > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,var(--coral),var(--crimson)); transition: width .3s; }
.loading .pct { margin-top: 13px; font: 500 9.5px/1 var(--mono); letter-spacing: .18em; color: var(--dim); }
.loading .tip { position: absolute; bottom: calc(30px + var(--sb)); font: 400 11px/1.7 var(--sans); color: var(--dim); max-width: 520px; text-align: center; padding: 0 24px; }

/* ---------------- 結果 ---------------- */
.result {
  position: absolute; inset: 0; display: none; flex-direction: column;
  align-items: center; justify-content: center; background: rgba(8,9,11,.985); padding: 0 20px;
}
.result.on { display: flex; }
.result .verdict { font: 200 clamp(30px,7vw,64px)/1 var(--sans); letter-spacing: .2em; text-indent: .2em; text-transform: uppercase; text-align: center; }
.result .verdict.win { color: var(--coral); }
.result .verdict.lose { color: var(--steel); }
.result .score { margin-top: 18px; font: 500 14px/1 var(--mono); letter-spacing: .16em; color: var(--steel); text-align: center; }
.result .grid { margin-top: 36px; display: flex; gap: 34px; flex-wrap: wrap; justify-content: center; }
.result .cell { text-align: center; }
.result .cell .k { font: 500 8.5px/1 var(--mono); letter-spacing: .2em; color: var(--dim); text-transform: uppercase; }
.result .cell .v { margin-top: 9px; font: 300 30px/1 var(--mono); font-variant-numeric: tabular-nums; }
.result .acts { margin-top: 46px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.result .acts button {
  padding: 15px 28px; border: 1px solid rgba(242,239,233,.22); border-radius: 2px;
  font: 500 10px/1 var(--mono); letter-spacing: .22em; text-transform: uppercase; transition: all .18s;
  min-height: 48px;
}
.result .acts button.primary { background: var(--coral); border-color: var(--coral); color: var(--ink); }
.result .acts button:hover { border-color: var(--paper); }

/* ---------------- ポーズ ---------------- */
.pause {
  position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(8,9,11,.93); padding: 20px;
}
.pause.on { display: flex; }
.pause .box { width: min(360px, 88vw); }
.pause h2 { font: 500 9px/1 var(--mono); letter-spacing: .28em; color: var(--dim); text-transform: uppercase; margin-bottom: 16px; }
.pause button {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 16px;
  border-bottom: 1px solid var(--line); font: 400 14px/1 var(--sans); letter-spacing: .06em;
  transition: all .15s; min-height: 52px;
}
.pause button .ico { color: var(--dim); }
.pause button:hover { background: rgba(242,239,233,.05); color: var(--coral); }
.pause button:hover .ico { color: var(--coral); }
`;

const TIPS = [
  'スプリント中に しゃがみ を押すとスライディングできる。角を取るときに有効。',
  '壁や箱に向かってジャンプすると自動で乗り越える（マントル）。',
  'リーンを使うと、遮蔽から最小限の露出で覗ける。',
  '腰だめ撃ちは近距離向け。中距離以遠は必ず覗き込んで狙う。',
  '連射すると反動が蓄積する。3〜5発ずつ区切って撃つと集弾が安定する。',
  'サプレッサーを付けると発砲時に敵のミニマップへ表示されない。',
  '体力は被弾後しばらく経つと自動回復する。不利なときは一度退く判断を。',
];

const PAGES = [
  { id: 'deploy', n: '01', label: '出撃', icon: 'deploy' },
  { id: 'loadout', n: '02', label: '装備', icon: 'loadout' },
  { id: 'settings', n: '03', label: '設定', icon: 'settings' },
  { id: 'about', n: '04', label: '操作', icon: 'help' },
];

export class Menu {
  constructor(parent, opts = {}) {
    if (!document.getElementById('ui-style')) {
      const st = document.createElement('style');
      st.id = 'ui-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.className = 'ui';
    parent.appendChild(this.root);

    this.settings = opts.settings;
    this.isTouch = !!opts.isTouch;
    this.onStart = null;
    this.onResume = null;
    this.onQuit = null;
    this.onSettingChange = null;

    this.sel = {
      mode: 'tdm',
      map: 'compound',
      difficulty: 'regular',
      primary: 'm4a1',
      secondary: 'pistol',
      attachments: { m4a1: ['redDot'] },
    };
    this.page = 'deploy';

    this._build();
    this._applyDeviceClass();
    this._onResize = () => this._applyDeviceClass();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(this._onResize, 250));
  }

  /** 端末種別と画面の向きを CSS クラスへ反映する */
  _applyDeviceClass() {
    const r = this.root;
    r.classList.toggle('touch', this.isTouch);
    r.classList.toggle('desktop', !this.isTouch);
    const portrait = window.innerHeight >= window.innerWidth;
    r.classList.toggle('portrait', portrait);
    r.classList.toggle('landscape', !portrait);
  }

  _build() {
    const navBtns = PAGES.map((p, i) => `
      <button data-page="${p.id}" class="${i === 0 ? 'on' : ''}">
        <span class="n">${p.n}</span><span class="l">${p.label}</span>${ICONS[p.icon]({ size: 15 })}
      </button>`).join('');

    const tabBtns = PAGES.map((p, i) => `
      <button data-page="${p.id}" class="${i === 0 ? 'on' : ''}">
        ${ICONS[p.icon]({ size: 19 })}<span class="l">${p.label}</span>
      </button>`).join('');

    this.root.innerHTML = `
      <div class="splash" id="splash">
        <div class="stage on" id="st1">
          ${opusMarkHTML(92)}
          <div class="wm">${BRAND.studio}</div>
          <div class="role">${BRAND.studioRole}</div>
        </div>
        <div class="stage" id="st2">
          ${engineMarkHTML(92)}
          <div class="wm">${BRAND.engineFull}</div>
          <div class="role">${BRAND.engineTagline}</div>
        </div>
        <div class="stage" id="st3">
          ${burstMarkHTML()}
          <div class="wm">${BRAND.techName}</div>
          <div class="role">${BRAND.techRole}</div>
        </div>
      </div>

      <div class="title" id="title">
        <div class="eyebrow">${BRAND.studio} ${BRAND.studioRole}</div>
        <div class="rule"></div>
        <h1><span>Operation</span><b>Crimson</b></h1>
        <div class="rule"></div>
        <div class="tag">ブラウザで動作する タクティカル FPS</div>
        <button class="cta blink" id="btnStart">${this.isTouch ? '画面をタップして開始' : '画面をクリックして開始'}</button>
        <div class="credit">${BRAND.engineFull} &nbsp;/&nbsp; ${BRAND.techRole}: ${BRAND.techName}</div>
      </div>

      <div class="menu" id="menu">
        <div class="mhead">
          ${burstStaticHTML()}
          <div class="t">Operation Crimson</div>
          <div class="meta" id="metaLine">作戦準備</div>
        </div>
        <div class="mbody">
          <div class="mnav" id="nav">
            ${navBtns}
            <div class="spacer"></div>
            <div class="ver">BUILD ${BRAND.version}<br>${BRAND.engineFull}</div>
          </div>
          <div class="mpanel" id="panel"></div>
        </div>
        <div class="deploybar" id="deploybar"></div>
        <div class="tabbar" id="tabbar">${tabBtns}</div>
      </div>

      <div class="loading" id="loading">
        <div class="mapname" id="ldName">COMPOUND</div>
        <div class="mapdesc" id="ldDesc"></div>
        <div class="bar"><i id="ldBar"></i></div>
        <div class="pct" id="ldPct">0%</div>
        <div class="tip" id="ldTip"></div>
      </div>

      <div class="pause" id="pause">
        <div class="box">
          <h2>一時停止</h2>
          <button data-act="resume">${ICONS.deploy({ size: 17 })}<span>戦闘に戻る</span></button>
          <button data-act="settings">${ICONS.settings({ size: 17 })}<span>設定</span></button>
          <button data-act="quit">${ICONS.back({ size: 17 })}<span>作戦を中止してメニューへ</span></button>
        </div>
      </div>

      <div class="result" id="result"></div>
    `;

    this.el = {};
    for (const id of ['splash', 'st1', 'st2', 'st3', 'title', 'btnStart', 'menu', 'nav', 'panel',
      'loading', 'ldName', 'ldDesc', 'ldBar', 'ldPct', 'ldTip', 'pause', 'result', 'metaLine',
      'tabbar', 'deploybar']) {
      this.el[id] = this.root.querySelector('#' + id);
    }

    this.el.btnStart.addEventListener('click', () => this.showMenu());

    const navHandler = (e) => {
      const b = e.target.closest('button[data-page]');
      if (!b) return;
      this._setPage(b.dataset.page);
    };
    this.el.nav.addEventListener('click', navHandler);
    this.el.tabbar.addEventListener('click', navHandler);

    this.el.pause.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      if (b.dataset.act === 'resume') this.onResume?.();
      else if (b.dataset.act === 'quit') this.onQuit?.();
      else if (b.dataset.act === 'settings') { this.hidePause(); this.showMenu('settings'); }
    });

    this._setPage('deploy');
  }

  _setPage(id) {
    this.page = id;
    for (const c of [this.el.nav, this.el.tabbar]) {
      c.querySelectorAll('button[data-page]').forEach((x) => x.classList.toggle('on', x.dataset.page === id));
    }
    this._renderPage(id);
  }

  /* ================= フロー ================= */

  /** スプラッシュ（製作 → エンジン → 使用技術）→ タイトル */
  async playIntro() {
    this.root.classList.add('on');
    this.el.title.classList.add('out');
    this.el.menu.classList.remove('on');
    this.el.splash.classList.remove('out');

    const stages = [this.el.st1, this.el.st2, this.el.st3];
    for (let i = 0; i < stages.length; i++) {
      stages.forEach((s, j) => s.classList.toggle('on', i === j));
      // 表示のたびにアニメーションを再生し直す
      stages[i].querySelectorAll('.arc, .core, .egrid, .ecore, .wm, .role, .burst i').forEach((n) => {
        n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
      });
      await wait(i === stages.length - 1 ? 1900 : 1750);
    }
    this.el.splash.classList.add('out');
    await wait(700);
    this.el.splash.style.display = 'none';
    this.el.title.classList.remove('out');
  }

  showTitle() {
    this.root.classList.add('on');
    this.el.splash.style.display = 'none';
    this.el.title.classList.remove('out');
    this.el.menu.classList.remove('on');
    this.el.result.classList.remove('on');
  }

  showMenu(page = null) {
    this.root.classList.add('on');
    this.el.splash.style.display = 'none';
    this.el.title.classList.add('out');
    this.el.result.classList.remove('on');
    this.el.pause.classList.remove('on');
    this.el.loading.classList.remove('on');
    this.el.menu.classList.add('on');
    this._applyDeviceClass();
    if (page) this._setPage(page);
  }

  hide() { this.root.classList.remove('on'); }

  showLoading(mapInfo) {
    this.root.classList.add('on');
    this.el.menu.classList.remove('on');
    this.el.title.classList.add('out');
    this.el.loading.classList.add('on');
    this.el.ldName.textContent = mapInfo.name;
    this.el.ldDesc.textContent = mapInfo.desc;
    this.el.ldTip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    this.setProgress(0, '');
  }
  setProgress(p, label) {
    this.el.ldBar.style.width = `${Math.round(p * 100)}%`;
    this.el.ldPct.textContent = `${Math.round(p * 100)}%  ${label || ''}`;
  }
  hideLoading() { this.el.loading.classList.remove('on'); }

  showPause() { this.root.classList.add('on'); this.el.pause.classList.add('on'); }
  hidePause() { this.el.pause.classList.remove('on'); }

  showResult(r) {
    this.root.classList.add('on');
    this.el.menu.classList.remove('on');
    this.el.result.classList.add('on');
    const verdict = r.draw ? '引き分け' : (r.victory ? '任務達成' : '任務失敗');
    const cls = r.draw ? '' : (r.victory ? 'win' : 'lose');
    const kd = r.player.deaths ? (r.player.kills / r.player.deaths).toFixed(2) : r.player.kills.toFixed(2);
    this.el.result.innerHTML = `
      <div class="verdict ${cls}">${verdict}</div>
      <div class="score">${esc(r.mode)} — ALPHA ${r.scores.A} : ${r.scores.B} BRAVO</div>
      <div class="grid">
        <div class="cell"><div class="k">キル</div><div class="v">${r.player.kills}</div></div>
        <div class="cell"><div class="k">デス</div><div class="v">${r.player.deaths}</div></div>
        <div class="cell"><div class="k">K/D</div><div class="v">${kd}</div></div>
        <div class="cell"><div class="k">最大連続</div><div class="v">${r.player.bestStreak}</div></div>
        <div class="cell"><div class="k">スコア</div><div class="v">${r.player.score}</div></div>
      </div>
      <div class="acts">
        <button class="primary" data-a="again">もう一度</button>
        <button data-a="menu">メニューへ</button>
      </div>`;
    this.el.result.querySelector('[data-a="again"]').addEventListener('click', () => this.onStart?.(this.sel));
    this.el.result.querySelector('[data-a="menu"]').addEventListener('click', () => this.showMenu());
  }

  /* ================= ページ描画 ================= */

  _renderPage(page) {
    const p = this.el.panel;
    if (page === 'deploy') p.innerHTML = this._deployHTML();
    else if (page === 'loadout') p.innerHTML = this._loadoutHTML();
    else if (page === 'settings') p.innerHTML = this._settingsHTML();
    else p.innerHTML = this._aboutHTML();

    // スマホでは出撃ボタンを固定バーへ出す
    this.el.deploybar.innerHTML = (this.isTouch && page === 'deploy') ? this._deployButtonHTML() : '';
    p.scrollTop = 0;
    this._wirePage(page);
  }

  _deployButtonHTML() {
    return `<button class="deploy" data-deploy>出撃
      <span class="sub">${esc(GAME_MODES[this.sel.mode].nameJa)} — ${esc(MAP_LIST.find((m) => m.id === this.sel.map)?.nameJa || '')}</span></button>`;
  }

  _deployHTML() {
    const modes = MODE_LIST.map((m) => `
      <button class="card ${this.sel.mode === m.id ? 'on' : ''}" data-mode="${m.id}">
        ${ICONS[m.id] ? ICONS[m.id]({ size: 20 }) : ICONS.tdm({ size: 20 })}
        <div class="nm">${m.nameJa}</div>
        <div class="en">${m.name}</div>
        <div class="ds">${m.desc}</div>
      </button>`).join('');

    /*
     * レベルの一覧。
     * 検証用のテストベッドには印を付けて、対戦向けと取り違えないようにする。
     */
    const maps = MAP_LIST.map((m) => `
      <button class="card ${this.sel.map === m.id ? 'on' : ''}" data-map="${m.id}">
        ${m.utility ? ICONS.settings({ size: 20 }) : ICONS.map({ size: 20 })}
        <div class="nm">${esc(m.nameJa)}${m.utility ? '<span class="tag">検証用</span>' : ''}</div>
        <div class="en">${esc(m.name)}</div>
        <div class="ds">${esc(m.desc)}</div>
      </button>`).join('');

    /** 拡散半径（ラジアン）を人が読める表現へ */
    const accuracyLabel = (aimError) => {
      // 15m 先での散らばり半径（メートル）に直すと直感的
      const spread = aimError * 15;
      if (spread < 0.4) return `非常に高い（15m で ±${spread.toFixed(1)}m）`;
      if (spread < 0.6) return `高い（15m で ±${spread.toFixed(1)}m）`;
      if (spread < 0.95) return `並（15m で ±${spread.toFixed(1)}m）`;
      return `低い（15m で ±${spread.toFixed(1)}m）`;
    };

    const diffs = Object.entries(DIFFICULTY).map(([k, d]) => `
      <button class="card ${this.sel.difficulty === k ? 'on' : ''}" data-diff="${k}">
        <div class="nm" style="margin-top:0">${d.name}</div>
        <div class="en">${k}</div>
        <div class="ds">反応 ${(d.reaction * 1000).toFixed(0)}ms ／ 射撃精度 ${accuracyLabel(d.aimError)} ／ 視認 ${d.sight}m</div>
      </button>`).join('');

    return `
      <div class="sec"><h2>ゲームモード</h2><div class="cards">${modes}</div></div>
      <div class="sec"><h2>マップ</h2><div class="cards">${maps}</div></div>
      <div class="sec"><h2>敵の練度</h2><div class="cards">${diffs}</div></div>
      <div class="sec">${this._deployButtonHTML()}</div>`;
  }

  _loadoutHTML() {
    const bar = (k, v, max) => `
      <div class="stat"><span class="k">${k}</span>
        <span class="b"><i style="width:${Math.min(100, (v / max) * 100).toFixed(0)}%"></i></span>
        <span class="v">${Math.round(Math.min(100, (v / max) * 100))}</span></div>`;

    const prim = Object.values(WEAPONS).filter((w) => w.class !== WEAPON_CLASS.PISTOL).map((w) => `
      <button class="card ${this.sel.primary === w.id ? 'on' : ''}" data-prim="${w.id}">
        <div class="nm" style="margin-top:0">${w.nameJa}</div>
        <div class="en">${w.class}</div>
        <div class="ds">${w.desc}</div>
        <div class="stats">
          ${bar('威力', w.damage * (w.pellets || 1), 120)}
          ${bar('連射', w.rpm, 900)}
          ${bar('射程', w.falloff[1], 200)}
          ${bar('機動', 1 / w.adsTime, 6)}
          ${bar('制御', 1 / (w.recoil.vertical * 100), 12)}
        </div>
      </button>`).join('');

    const sec = Object.values(WEAPONS).filter((w) => w.class === WEAPON_CLASS.PISTOL).map((w) => `
      <button class="card ${this.sel.secondary === w.id ? 'on' : ''}" data-sec="${w.id}">
        <div class="nm" style="margin-top:0">${w.nameJa}</div><div class="en">${w.class}</div><div class="ds">${w.desc}</div>
      </button>`).join('');

    const cur = WEAPONS[this.sel.primary];
    const list = this.sel.attachments[cur.id] || [];
    const atts = (cur.attachments || []).map((id) => {
      const a = ATTACHMENTS[id];
      return `<button class="card ${list.includes(id) ? 'on' : ''}" data-att="${id}">
        <div class="nm" style="margin-top:0">${a.name}</div><div class="ds">${a.desc}</div></button>`;
    }).join('') || '<div class="ds" style="color:var(--dim)">この武器に装着できるアタッチメントはありません</div>';

    return `
      <div class="sec"><h2>メイン武器</h2><div class="cards">${prim}</div></div>
      <div class="sec"><h2>${cur.nameJa} のアタッチメント</h2><div class="cards">${atts}</div></div>
      <div class="sec"><h2>サブ武器</h2><div class="cards">${sec}</div></div>`;
  }

  _settingsHTML() {
    const s = this.settings.values;
    const range = (id, label, help, min, max, step, val, fmt) => `
      <div class="row"><div class="lab"><div class="n">${label}</div><div class="h">${help}</div></div>
        <div class="ctl"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
        <span class="val" id="${id}Val">${fmt(val)}</span></div></div>`;
    const toggle = (id, label, help, on) => `
      <div class="row"><div class="lab"><div class="n">${label}</div><div class="h">${help}</div></div>
        <div class="ctl"><div class="tgl ${on ? 'on' : ''}" id="${id}" role="switch" aria-checked="${on}"></div></div></div>`;
    const seg = (id, label, help, opts, cur) => `
      <div class="row"><div class="lab"><div class="n">${label}</div><div class="h">${help}</div></div>
        <div class="ctl"><div class="seg" id="${id}">
          ${opts.map((o) => `<button data-v="${o.v}" class="${cur === o.v ? 'on' : ''}">${o.l}</button>`).join('')}
        </div></div></div>`;

    // 端末に応じて出す項目を変える
    const control = this.isTouch
      ? `${range('touchSens', 'タッチ感度', '画面右側をなぞったときの視点の動く量。上げるほど少ない指の動きで大きく振り向ける。', 0.4, 3, 0.05, s.touchSensitivity, (v) => (+v).toFixed(2))}
         ${range('adsSens', '照準時の感度倍率', '覗き込み中だけ感度を何倍にするか。1 未満にすると狙いを細かく合わせやすい。', 0.2, 1.5, 0.02, s.adsSensitivity, (v) => `×${(+v).toFixed(2)}`)}
         ${toggle('invertY', 'Y軸反転', '上へなぞると下を向くようになる。航空機の操縦桿と同じ向き。', s.invertY)}
         ${toggle('leftHanded', '左利き配置', '移動スティックと射撃ボタンの左右を入れ替える。', s.leftHanded)}`
      : `${range('sens', 'マウス感度', 'マウスを動かしたときの視点の動く量。', 0.2, 3, 0.05, s.sensitivity, (v) => (+v).toFixed(2))}
         ${range('adsSens', 'ADS 感度倍率', '覗き込み中だけ感度を何倍にするか。1 未満にすると狙いを細かく合わせやすい。', 0.2, 1.5, 0.02, s.adsSensitivity, (v) => `×${(+v).toFixed(2)}`)}
         ${toggle('invertY', 'Y軸反転', 'マウスを奥へ動かすと下を向くようになる。', s.invertY)}`;

    // 画質プリセットの中身を表で見せる（何が変わるのかを明示する）
    const qRow = (k) => {
      const q = QUALITY[k], i = QUALITY_INFO[k];
      return `<tr class="${s.quality === k ? 'on' : ''}">
        <td>${i.label}</td>
        <td>${q.shadows ? `影 ${q.shadowMap}` : '影なし'}</td>
        <td>${q.bloom ? 'ブルーム' : '—'}</td>
        <td>${q.gtao ? 'GTAO' : '—'}</td>
        <td>${q.aa === 'smaa' ? 'SMAA' : q.aa === 'fxaa' ? 'FXAA' : '—'}</td>
        <td>最大 ×${q.pixelRatio}</td>
      </tr>`;
    };

    return `
      <div class="sec"><h2>操作</h2>${control}</div>

      <div class="sec"><h2>画面</h2>
        ${range('fov', '視野角', '一度に見渡せる角度。広げるほど周囲の敵に気づきやすくなる反面、遠くの敵が小さく写る。', 65, 110, 1, s.fov, (v) => `${v}°`)}
        ${seg('quality', '画質', '影・ブルーム・環境遮蔽・アンチエイリアスと描画解像度をまとめて切り替える。下の表が各段階の内訳。', [
          { v: 'low', l: '低' }, { v: 'medium', l: '中' }, { v: 'high', l: '高' }, { v: 'ultra', l: '最高' },
          { v: 'igpu', l: '内蔵GPU' },
        ], s.quality)}
        <table class="qtable">
          <thead><tr><th>段階</th><th>影</th><th>光の滲み</th><th>環境遮蔽</th><th>輪郭処理</th><th>解像度</th></tr></thead>
          <tbody>${['low', 'medium', 'high', 'ultra', 'igpu'].map(qRow).join('')}</tbody>
        </table>
        <div class="note">${QUALITY_INFO[s.quality]?.desc || ''}</div>

        ${toggle('dynamicRes', '動的解像度', 'フレーム時間を見て描画解像度を自動で上下させ、動きの滑らかさを保つ。切ると常に選んだ画質のままになり、重い場面ではカクつく。', s.dynamicRes !== false)}
        ${toggle('perfMode', '性能優先', '解像度を下げても足りないとき、画質設定そのものを自動で 1 段下げる。滑らかさを最優先したい場合に。', !!s.perfMode)}
        ${range('brightness', '明るさ', '露出の倍率。屋内や日陰が見づらいときに上げる。', 0.6, 1.6, 0.02, s.brightness, (v) => `×${(+v).toFixed(2)}`)}
        ${toggle('motionBlur', 'モーションブラー', '疾走時に画面の周辺を放射状にぼかして速度感を出す。酔いやすい場合は切る。', s.motionBlur)}
        ${toggle('filmGrain', 'フィルムグレイン', '画面全体に細かい粒状感を乗せる。フィルムらしい質感になる。', s.filmGrain)}
        ${toggle('showFps', 'FPS 表示', '左下にフレームレート・描画解像度・描画呼び出し数を表示する。', s.showFps)}
      </div>

      <div class="sec"><h2>音響</h2>
        ${range('master', 'マスター音量', 'すべての音の最終的な音量。', 0, 1, 0.02, s.master, (v) => `${Math.round(v * 100)}`)}
        ${range('sfx', '効果音', '銃声・着弾・足音などの音量。', 0, 1, 0.02, s.sfx, (v) => `${Math.round(v * 100)}`)}
        ${range('music', 'BGM', 'メニューで流れる環境音の音量。', 0, 1, 0.02, s.music, (v) => `${Math.round(v * 100)}`)}
      </div>

      <div class="sec"><h2>初期化</h2>
        <div class="row">
          <div class="lab">
            <div class="n">すべて既定値に戻す</div>
            <div class="h">操作・画面・音響のすべての項目を初期状態へ戻す。装備や難易度の選択は変わらない。</div>
          </div>
          <div class="ctl"><button class="danger" id="resetSettings">既定に戻す</button></div>
        </div>
        <div class="note" id="resetNote" style="display:none">既定値に戻しました。</div>
      </div>`;
  }

  _aboutHTML() {
    const row = (k, d) => `<div class="row"><div class="lab"><div class="n">${d}</div></div>
      <div class="ctl"><span class="val" style="width:auto;font-size:11px">${k}</span></div></div>`;

    const controls = this.isTouch ? `
      <div class="sec"><h2>タッチ操作</h2>
        ${row('画面左側をドラッグ', '移動（大きく倒すとスプリント）')}
        ${row('画面右側をドラッグ', '視点移動')}
        ${row('射撃ボタン', '押している間ずっと射撃')}
        ${row('照準ボタン', '覗き込み（押すたび切り替え）')}
        ${row('走ボタン', 'スプリント（押すたび切り替え）')}
        ${row('跳 / 伏 / 装填', 'ジャンプ・しゃがみ・リロード')}
        ${row('切替ボタン', 'メイン武器とサブ武器の持ち替え')}
      </div>` : `
      <div class="sec"><h2>キーボード / マウス</h2>
        ${row('W A S D', '移動')}
        ${row('Shift', 'スプリント')}
        ${row('Ctrl / C', 'しゃがみ（スプリント中はスライディング）')}
        ${row('X', '伏せ')}
        ${row('Space', 'ジャンプ / 乗り越え')}
        ${row('Q / E', '左右へ体を傾ける（リーン）')}
        ${row('左クリック', '射撃')}
        ${row('右クリック', '覗き込み（ADS）')}
        ${row('R', 'リロード')}
        ${row('1 / 2 / ホイール', '武器切り替え')}
        ${row('Tab', 'スコアボード')}
        ${row('Esc', '一時停止')}
      </div>`;

    return `
      ${controls}
      <div class="sec"><h2>クレジット</h2>
        <div class="row"><div class="lab">
          <div class="n">${BRAND.gameTitle}</div>
          <div class="h">テクスチャ・3Dモデル・レベル・効果音のすべてをコードから生成しており、
          外部アセットを一切使用していません。</div>
        </div></div>
        <div class="row"><div class="lab">
          <div class="n">${BRAND.studio}</div>
          <div class="h">${BRAND.studioRole}</div>
        </div></div>
        <div class="row"><div class="lab">
          <div class="n">${BRAND.engineFull}</div>
          <div class="h">${BRAND.engineTagline}。Three.js を基盤に、手続き型生成と
          ポストプロセスを独自に組み上げています。</div>
        </div></div>
        <div class="row"><div class="lab">
          <div class="n">${BRAND.techName}</div>
          <div class="h">${BRAND.techNote}</div>
        </div></div>
      </div>`;
  }

  /* ================= イベント接続 ================= */

  _wirePage(page) {
    const p = this.el.panel;
    const bar = this.el.deploybar;

    const deploy = () => this.onStart?.(this.sel);
    p.querySelectorAll('[data-deploy]').forEach((b) => b.addEventListener('click', deploy));
    bar.querySelectorAll('[data-deploy]').forEach((b) => b.addEventListener('click', deploy));

    if (page === 'deploy') {
      p.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
        this.sel.mode = b.dataset.mode;
        this._renderPage('deploy');
      }));
      p.querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => {
        this.sel.map = b.dataset.map;
        this._renderPage('deploy');
      }));
      p.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
        this.sel.difficulty = b.dataset.diff;
        this._renderPage('deploy');
      }));
    }

    if (page === 'loadout') {
      p.querySelectorAll('[data-prim]').forEach((b) => b.addEventListener('click', () => {
        this.sel.primary = b.dataset.prim;
        if (!this.sel.attachments[this.sel.primary]) this.sel.attachments[this.sel.primary] = [];
        this._renderPage('loadout');
      }));
      p.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => {
        this.sel.secondary = b.dataset.sec;
        this._renderPage('loadout');
      }));
      p.querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.att;
        const cur = this.sel.attachments[this.sel.primary] ||= [];
        // 光学サイトは同時に 1 つだけ
        const isOptic = ATTACHMENTS[id].opticZoom !== undefined;
        const i = cur.indexOf(id);
        if (i >= 0) cur.splice(i, 1);
        else {
          if (isOptic) {
            for (let j = cur.length - 1; j >= 0; j--) {
              if (ATTACHMENTS[cur[j]]?.opticZoom !== undefined) cur.splice(j, 1);
            }
          }
          cur.push(id);
        }
        this._renderPage('loadout');
      }));
    }

    if (page === 'settings') {
      const s = this.settings;
      const bindRange = (id, key, fmt) => {
        const el = p.querySelector('#' + id);
        const val = p.querySelector('#' + id + 'Val');
        if (!el) return;
        el.addEventListener('input', () => {
          const v = parseFloat(el.value);
          val.textContent = fmt(v);
          s.set(key, v);
          this.onSettingChange?.(key, v);
        });
      };
      bindRange('sens', 'sensitivity', (v) => v.toFixed(2));
      bindRange('adsSens', 'adsSensitivity', (v) => v.toFixed(2));
      bindRange('touchSens', 'touchSensitivity', (v) => v.toFixed(2));
      bindRange('fov', 'fov', (v) => `${v}°`);
      bindRange('brightness', 'brightness', (v) => v.toFixed(2));
      bindRange('master', 'master', (v) => `${Math.round(v * 100)}`);
      bindRange('sfx', 'sfx', (v) => `${Math.round(v * 100)}`);
      bindRange('music', 'music', (v) => `${Math.round(v * 100)}`);

      for (const key of ['invertY', 'motionBlur', 'filmGrain', 'showFps', 'leftHanded', 'dynamicRes', 'perfMode']) {
        const el = p.querySelector('#' + key);
        el?.addEventListener('click', () => {
          const v = !el.classList.contains('on');
          el.classList.toggle('on', v);
          el.setAttribute('aria-checked', String(v));
          s.set(key, v);
          this.onSettingChange?.(key, v);
        });
      }
      const q = p.querySelector('#quality');
      q?.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        s.set('quality', b.dataset.v);
        this.onSettingChange?.('quality', b.dataset.v);
        // 内訳表と説明文も切り替わるので、ページごと描き直す
        this._renderPage('settings');
      });

      /*
       * 既定へ戻す。
       * 押し間違いで全設定が飛ぶと痛いので、1 度目は確認、2 度目で実行する。
       */
      const reset = p.querySelector('#resetSettings');
      const note = p.querySelector('#resetNote');
      let armed = false;
      reset?.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          reset.textContent = 'もう一度押すと実行';
          reset.classList.add('confirm');
          clearTimeout(this._resetT);
          this._resetT = setTimeout(() => {
            armed = false;
            reset.textContent = '既定に戻す';
            reset.classList.remove('confirm');
          }, 4000);
          return;
        }
        clearTimeout(this._resetT);
        s.reset();
        this.onSettingsReset?.();
        this._renderPage('settings');
        const n = this.root.querySelector('#resetNote');
        if (n) { n.style.display = 'block'; n.textContent = 'すべての設定を既定値に戻しました。'; }
      });
    }
  }

  setMeta(text) { this.el.metaLine.textContent = text; }

  /** エンジンが自動で画質を落としたときに、設定画面の選択状態を合わせる */
  syncQuality(name) {
    const q = this.root.querySelector('#quality');
    if (!q) return;
    [...q.children].forEach((x) => x.classList.toggle('on', x.dataset.v === name));
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.root.remove();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
