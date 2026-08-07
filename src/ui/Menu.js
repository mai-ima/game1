import { MODE_LIST, GAME_MODES } from '../game/GameModes.js';
import { WEAPONS, ATTACHMENTS, WEAPON_CLASS } from '../player/weapons/WeaponDefs.js';
import { DIFFICULTY } from '../ai/Bot.js';

/**
 * タイトル・メインメニュー・設定・戦績画面。
 *
 * デザイン方針:
 *   ゲームメニューの定型（面取りパネル + ネオン）ではなく、
 *   「作戦文書」の体裁 — 罫線・見出し番号・等幅の指標・トンボ —
 *   を骨格にする。強い色はコーラル 1 色に絞り、他は無彩色で支える。
 */

const CSS = `
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

/* ---------------- スプラッシュ ---------------- */
.splash {
  position: absolute; inset: 0; background: var(--ink);
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  transition: opacity .7s cubic-bezier(.4,0,.2,1);
}
.splash.out { opacity: 0; pointer-events: none; }
.splash .stage { display: none; flex-direction: column; align-items: center; }
.splash .stage.on { display: flex; }

/* Anthropic のバーストマーク */
.burst { width: 84px; height: 84px; position: relative; }
.burst i {
  position: absolute; left: 50%; top: 50%; width: 8.5px; height: 42px;
  background: var(--coral); border-radius: 4.25px; transform-origin: 50% 0; opacity: 0;
  animation: spoke .6s cubic-bezier(.16,1,.3,1) forwards;
}
@keyframes spoke {
  from { opacity: 0; transform: translate(-50%,0) rotate(var(--r)) scaleY(.12); }
  to   { opacity: 1; transform: translate(-50%,0) rotate(var(--r)) scaleY(1); }
}
/* Opus 5 のマーク: 5 本の弧が段階的に開く */
.opus { width: 96px; height: 96px; position: relative; }
.opus svg { width: 100%; height: 100%; overflow: visible; }
.opus circle, .opus path { fill: none; stroke-linecap: round; }
.opus .arc { stroke: var(--coral); stroke-dasharray: 200; stroke-dashoffset: 200; animation: arc .8s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes arc { to { stroke-dashoffset: 0; } }
.opus .core { fill: var(--coral); opacity: 0; animation: pop .5s .55s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes pop { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }

.splash .wm {
  margin-top: 30px; font: 500 12px/1 var(--sans); letter-spacing: .46em; text-indent: .46em;
  color: #9aa0a6; text-transform: uppercase; opacity: 0;
  animation: fadeUp .8s .45s cubic-bezier(.16,1,.3,1) forwards;
}
.splash .sub {
  margin-top: 12px; font: 400 9.5px/1 var(--mono); letter-spacing: .3em; color: var(--dim);
  opacity: 0; animation: fadeUp .8s .7s cubic-bezier(.16,1,.3,1) forwards;
}
@keyframes fadeUp { from { opacity: 0; transform: translateY(9px); } to { opacity: .9; transform: none; } }

/* ---------------- タイトル ---------------- */
.title {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 50% 42%, #1a1c20 0%, #0a0b0d 68%);
  transition: opacity .5s; padding: 0 18px;
}
.title.out { opacity: 0; pointer-events: none; }
.title .rule { width: min(560px, 78vw); height: 1px; background: var(--line); }
.title .eyebrow {
  font: 500 9px/1 var(--mono); letter-spacing: .42em; color: var(--coral);
  text-transform: uppercase; margin-bottom: 20px;
}
.title h1 {
  font: 200 clamp(30px, 7.2vw, 88px)/1.0 var(--sans);
  letter-spacing: .15em; margin: 18px 0; text-transform: uppercase;
  display: flex; flex-wrap: wrap; justify-content: center; gap: 0 .34em;
  max-width: 92vw; text-align: center;
}
.title h1 span, .title h1 b { display: inline-block; text-indent: .15em; }
.title h1 b { font-weight: 500; color: var(--coral); }
.title .tag {
  margin-top: 18px; font: 400 11px/1.9 var(--sans); letter-spacing: .24em;
  color: var(--steel); text-align: center;
}
.title .cta {
  margin-top: 46px; font: 500 11px/1 var(--mono); letter-spacing: .3em;
  color: var(--paper); padding: 15px 34px; border: 1px solid rgba(242,239,233,.24);
  border-radius: 2px; transition: all .2s; text-transform: uppercase;
}
.title .cta:hover { background: var(--coral); border-color: var(--coral); color: var(--ink); }
.title .blink { animation: blink 2.1s ease-in-out infinite; }
@keyframes blink { 0%,100%{opacity:.55} 50%{opacity:1} }

/* ---------------- メニュー本体 ---------------- */
.menu {
  position: absolute; inset: 0; display: none; flex-direction: column;
  background: linear-gradient(160deg, #0d0f12 0%, #0a0b0d 55%, #12100f 100%);
  padding: calc(20px + var(--st)) calc(24px + var(--sr)) calc(20px + var(--sb)) calc(24px + var(--sl));
}
.menu.on { display: flex; }

.mhead { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.mhead .mark { width: 22px; height: 22px; position: relative; flex: 0 0 auto; }
.mhead .mark i {
  position: absolute; left: 50%; top: 50%; width: 2.4px; height: 11px;
  background: var(--coral); border-radius: 1.2px; transform-origin: 50% 0;
  transform: translate(-50%,0) rotate(var(--r));
}
.mhead .t { font: 500 12px/1 var(--sans); letter-spacing: .3em; text-transform: uppercase; }
.mhead .meta { margin-left: auto; font: 500 9px/1 var(--mono); letter-spacing: .2em; color: var(--dim); }

.mbody { flex: 1; display: flex; gap: 26px; padding-top: 22px; min-height: 0; }

/* 左: ナビゲーション */
.mnav { width: 224px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px; }
.mnav button {
  display: flex; align-items: baseline; gap: 12px; padding: 13px 14px;
  text-align: left; border-left: 2px solid transparent; transition: all .16s;
}
.mnav button .n { font: 500 9px/1 var(--mono); color: var(--dim); letter-spacing: .1em; }
.mnav button .l { font: 400 15px/1 var(--sans); letter-spacing: .1em; }
.mnav button:hover { background: rgba(242,239,233,.04); }
.mnav button.on { border-left-color: var(--coral); background: rgba(217,119,87,.09); }
.mnav button.on .l { color: var(--coral); }
.mnav .spacer { flex: 1; }
.mnav .ver { font: 400 8.5px/1.7 var(--mono); color: var(--dim); letter-spacing: .12em; padding: 0 14px; }

/* 右: パネル */
.mpanel { flex: 1; min-width: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; }
.mpanel::-webkit-scrollbar { width: 3px; }
.mpanel::-webkit-scrollbar-thumb { background: rgba(242,239,233,.16); }
.page { display: none; } .page.on { display: block; animation: pageIn .28s cubic-bezier(.16,1,.3,1); }
@keyframes pageIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.sec { margin-bottom: 28px; }
.sec > h2 {
  font: 500 9px/1 var(--mono); letter-spacing: .3em; color: var(--dim);
  text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 10px;
}
.sec > h2::after { content: ''; flex: 1; height: 1px; background: var(--line); }

/* カード（モード・マップ・武器の共通体裁） */
.cards { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(228px, 1fr)); }
.card {
  text-align: left; padding: 15px 16px; border: 1px solid var(--line);
  border-radius: 3px; background: rgba(242,239,233,.02); transition: all .18s; position: relative;
}
.card:hover { border-color: rgba(242,239,233,.24); background: rgba(242,239,233,.05); }
.card.on { border-color: var(--coral); background: rgba(217,119,87,.10); }
.card .ico { font-size: 15px; color: var(--coral); }
.card .nm { font: 400 14px/1.2 var(--sans); letter-spacing: .08em; margin-top: 7px; }
.card .en { font: 500 8.5px/1 var(--mono); letter-spacing: .18em; color: var(--dim); margin-top: 5px; text-transform: uppercase; }
.card .ds { font: 400 11px/1.65 var(--sans); color: var(--steel); margin-top: 9px; }
.card.on::after {
  content: ''; position: absolute; right: 10px; top: 10px; width: 5px; height: 5px;
  border-radius: 50%; background: var(--coral);
}

/* 武器の性能バー */
.stats { margin-top: 11px; display: flex; flex-direction: column; gap: 5px; }
.stat { display: flex; align-items: center; gap: 8px; }
.stat .k { font: 500 8.5px/1 var(--mono); letter-spacing: .12em; color: var(--dim); width: 46px; }
.stat .b { flex: 1; height: 2px; background: rgba(242,239,233,.10); border-radius: 2px; overflow: hidden; }
.stat .b > i { display: block; height: 100%; background: var(--coral); }
.stat .v { font: 500 9px/1 var(--mono); color: var(--steel); width: 24px; text-align: right; font-variant-numeric: tabular-nums; }

/* 設定行 */
.row {
  display: flex; align-items: center; gap: 16px; padding: 12px 2px;
  border-bottom: 1px solid var(--line);
}
.row .lab { flex: 1; }
.row .lab .n { font: 400 13.5px/1.3 var(--sans); letter-spacing: .04em; }
.row .lab .h { font: 400 10.5px/1.5 var(--sans); color: var(--dim); margin-top: 3px; }
.row .ctl { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; }
.row input[type=range] {
  -webkit-appearance: none; appearance: none; width: 148px; height: 2px;
  background: rgba(242,239,233,.16); border-radius: 2px; outline: none;
}
.row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%;
  background: var(--coral); cursor: pointer; border: 2px solid var(--ink);
}
.row input[type=range]::-moz-range-thumb {
  width: 13px; height: 13px; border-radius: 50%; background: var(--coral);
  cursor: pointer; border: 2px solid var(--ink);
}
.row .val { font: 500 11px/1 var(--mono); color: var(--steel); width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
.seg { display: flex; border: 1px solid var(--line); border-radius: 2px; overflow: hidden; }
.seg button { padding: 7px 13px; font: 500 10px/1 var(--mono); letter-spacing: .1em; color: var(--steel); transition: all .15s; }
.seg button.on { background: var(--coral); color: var(--ink); }
.tgl { width: 40px; height: 21px; border-radius: 11px; background: rgba(242,239,233,.14); position: relative; transition: background .18s; }
.tgl::after {
  content: ''; position: absolute; left: 3px; top: 3px; width: 15px; height: 15px;
  border-radius: 50%; background: var(--paper); transition: transform .18s cubic-bezier(.4,0,.2,1);
}
.tgl.on { background: var(--coral); }
.tgl.on::after { transform: translateX(19px); }

/* 出撃ボタン */
.deploy {
  margin-top: 6px; width: 100%; padding: 18px; border-radius: 3px;
  background: var(--coral); color: var(--ink);
  font: 600 13px/1 var(--mono); letter-spacing: .34em; text-transform: uppercase;
  transition: all .18s;
}
.deploy:hover { background: #e58a68; transform: translateY(-1px); }
.deploy:active { transform: none; }
.deploy .sub { display: block; margin-top: 7px; font: 500 9px/1 var(--mono); letter-spacing: .18em; opacity: .65; }

/* 結果画面 */
.result {
  position: absolute; inset: 0; display: none; flex-direction: column;
  align-items: center; justify-content: center; background: rgba(8,9,11,.94);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.result.on { display: flex; }
.result .verdict { font: 200 clamp(34px,7vw,64px)/1 var(--sans); letter-spacing: .22em; text-indent: .22em; text-transform: uppercase; }
.result .verdict.win { color: var(--coral); }
.result .verdict.lose { color: var(--steel); }
.result .score { margin-top: 20px; font: 500 15px/1 var(--mono); letter-spacing: .2em; color: var(--steel); }
.result .grid { margin-top: 40px; display: flex; gap: 42px; }
.result .cell { text-align: center; }
.result .cell .k { font: 500 8.5px/1 var(--mono); letter-spacing: .22em; color: var(--dim); text-transform: uppercase; }
.result .cell .v { margin-top: 9px; font: 300 32px/1 var(--mono); font-variant-numeric: tabular-nums; }
.result .acts { margin-top: 52px; display: flex; gap: 10px; }
.result .acts button {
  padding: 14px 28px; border: 1px solid rgba(242,239,233,.22); border-radius: 2px;
  font: 500 10px/1 var(--mono); letter-spacing: .24em; text-transform: uppercase; transition: all .18s;
}
.result .acts button.primary { background: var(--coral); border-color: var(--coral); color: var(--ink); }
.result .acts button:hover { border-color: var(--paper); }

/* ポーズ */
.pause {
  position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(8,9,11,.80); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.pause.on { display: flex; }
.pause .box { width: min(340px, 84vw); }
.pause h2 { font: 500 9px/1 var(--mono); letter-spacing: .3em; color: var(--dim); text-transform: uppercase; margin-bottom: 18px; }
.pause button {
  display: block; width: 100%; text-align: left; padding: 15px 16px;
  border-bottom: 1px solid var(--line); font: 400 14px/1 var(--sans); letter-spacing: .08em;
  transition: all .15s;
}
.pause button:hover { background: rgba(242,239,233,.05); padding-left: 22px; color: var(--coral); }

/* ローディング */
.loading {
  position: absolute; inset: 0; display: none; flex-direction: column;
  align-items: center; justify-content: center; background: var(--ink);
}
.loading.on { display: flex; }
.loading .mapname { font: 200 clamp(26px,6vw,48px)/1 var(--sans); letter-spacing: .2em; text-transform: uppercase; }
.loading .mapdesc { margin-top: 14px; font: 400 12px/1.9 var(--sans); color: var(--steel); max-width: 460px; text-align: center; padding: 0 24px; }
.loading .bar { margin-top: 40px; width: min(300px,70vw); height: 2px; background: rgba(242,239,233,.10); border-radius: 2px; overflow: hidden; }
.loading .bar > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,var(--coral),var(--crimson)); transition: width .3s; }
.loading .pct { margin-top: 13px; font: 500 9.5px/1 var(--mono); letter-spacing: .2em; color: var(--dim); }
.loading .tip { position: absolute; bottom: calc(38px + var(--sb)); font: 400 11px/1.7 var(--sans); color: var(--dim); max-width: 520px; text-align: center; padding: 0 24px; }

@media (max-height: 460px) {
  .title .tag { margin-top: 10px; font-size: 10px; }
  .title .cta { margin-top: 22px; padding: 12px 26px; }
  .title h1 { margin: 10px 0; }
  .title .eyebrow { margin-bottom: 12px; }
}
@media (max-width: 860px) {
  .mbody { flex-direction: column; gap: 14px; }
  .mnav { width: 100%; flex-direction: row; overflow-x: auto; gap: 0; }
  .mnav button { border-left: none; border-bottom: 2px solid transparent; white-space: nowrap; padding: 11px 14px; }
  .mnav button.on { border-left-color: transparent; border-bottom-color: var(--coral); }
  .mnav .spacer, .mnav .ver { display: none; }
  .cards { grid-template-columns: 1fr; }
  .result .grid { gap: 22px; flex-wrap: wrap; justify-content: center; }
}
`;

/** Anthropic のバーストマーク（12 本のスポーク） */
function burstHTML(cls = 'burst', delay = 0.05, step = 0.028) {
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += `<i style="--r:${i * 30}deg;animation-delay:${(delay + i * step).toFixed(3)}s"></i>`;
  }
  return `<div class="${cls}">${s}</div>`;
}

/** Opus 5 のマーク: 中心のコアから 5 本の弧が開く */
function opusHTML() {
  const arcs = [
    { r: 20, d: 0.05 }, { r: 28, d: 0.13 }, { r: 36, d: 0.21 }, { r: 44, d: 0.29 },
  ];
  let paths = '';
  arcs.forEach((a, i) => {
    const sw = 3.4 - i * 0.35;
    const span = 200 - i * 26;
    const start = -90 - span / 2;
    const p = describeArc(48, 48, a.r, start, start + span);
    paths += `<path class="arc" d="${p}" stroke-width="${sw}" style="animation-delay:${a.d}s" />`;
  });
  return `<div class="opus"><svg viewBox="0 0 96 96">
    ${paths}
    <circle class="core" cx="48" cy="48" r="7" style="transform-origin:48px 48px" />
  </svg></div>`;
}

function describeArc(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const TIPS = [
  'スプリント中に しゃがみ を押すとスライディングできる。角を取るときに有効。',
  '壁や箱に向かってジャンプすると自動で乗り越える（マントル）。',
  'Q / E で左右に体を傾けて、遮蔽から最小限の露出で覗ける。',
  '腰だめ撃ちは近距離向け。中距離以遠は必ず ADS（右クリック）で狙う。',
  '連射すると反動が蓄積する。3〜5発ずつ区切って撃つと集弾が安定する。',
  'サプレッサーを付けると発砲時に敵のミニマップへ表示されない。',
  '体力は被弾後しばらく経つと自動回復する。不利なときは一度退く判断を。',
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

    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div class="splash" id="splash">
        <div class="stage on" id="st1">
          ${burstHTML()}
          <div class="wm">Anthropic</div>
          <div class="sub">POWERED BY CLAUDE</div>
        </div>
        <div class="stage" id="st2">
          ${opusHTML()}
          <div class="wm">Opus 5</div>
          <div class="sub">REAL-TIME RENDERING ENGINE</div>
        </div>
      </div>

      <div class="title" id="title">
        <div class="eyebrow">Anthropic × Opus 5</div>
        <div class="rule"></div>
        <h1><span>Operation</span><b>Crimson</b></h1>
        <div class="rule"></div>
        <div class="tag">ブラウザで動作する タクティカル FPS</div>
        <button class="cta blink" id="btnStart">画面をクリックして開始</button>
      </div>

      <div class="menu" id="menu">
        <div class="mhead">
          <div class="mark">${Array.from({ length: 12 }, (_, i) => `<i style="--r:${i * 30}deg"></i>`).join('')}</div>
          <div class="t">Operation Crimson</div>
          <div class="meta" id="metaLine">作戦準備</div>
        </div>
        <div class="mbody">
          <div class="mnav" id="nav">
            <button class="on" data-page="deploy"><span class="n">01</span><span class="l">出撃</span></button>
            <button data-page="loadout"><span class="n">02</span><span class="l">装備</span></button>
            <button data-page="settings"><span class="n">03</span><span class="l">設定</span></button>
            <button data-page="about"><span class="n">04</span><span class="l">操作方法</span></button>
            <div class="spacer"></div>
            <div class="ver">BUILD 0.1.0<br>ENGINE OPUS 5</div>
          </div>
          <div class="mpanel" id="panel"></div>
        </div>
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
          <button data-act="resume">戦闘に戻る</button>
          <button data-act="settings">設定</button>
          <button data-act="quit">作戦を中止してメニューへ</button>
        </div>
      </div>

      <div class="result" id="result"></div>
    `;

    this.el = {};
    for (const id of ['splash', 'st1', 'st2', 'title', 'btnStart', 'menu', 'nav', 'panel',
      'loading', 'ldName', 'ldDesc', 'ldBar', 'ldPct', 'ldTip', 'pause', 'result', 'metaLine']) {
      this.el[id] = this.root.querySelector('#' + id);
    }

    this.el.btnStart.addEventListener('click', () => this.showMenu());
    this.el.nav.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-page]');
      if (!b) return;
      [...this.el.nav.querySelectorAll('button')].forEach((x) => x.classList.toggle('on', x === b));
      this._renderPage(b.dataset.page);
    });
    this.el.pause.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      if (b.dataset.act === 'resume') this.onResume?.();
      else if (b.dataset.act === 'quit') this.onQuit?.();
      else if (b.dataset.act === 'settings') { this.hidePause(); this.showMenu('settings'); }
    });

    this._renderPage('deploy');
  }

  /* ================= フロー ================= */

  /** スプラッシュ → タイトル */
  async playIntro() {
    this.root.classList.add('on');
    this.el.title.classList.add('out');
    this.el.menu.classList.remove('on');
    this.el.splash.classList.remove('out');

    await wait(2100);
    this.el.st1.classList.remove('on');
    this.el.st2.classList.add('on');
    // アニメーションを再生し直す
    this.el.st2.querySelectorAll('.arc, .core, .wm, .sub').forEach((n) => {
      n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
    });
    await wait(2200);
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
    if (page) {
      const b = this.el.nav.querySelector(`button[data-page="${page}"]`);
      if (b) {
        [...this.el.nav.querySelectorAll('button')].forEach((x) => x.classList.toggle('on', x === b));
        this._renderPage(page);
      }
    }
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
      <div class="score">${r.mode} — ALPHA ${r.scores.A} : ${r.scores.B} BRAVO</div>
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
    p.scrollTop = 0;
    this._wirePage(page);
  }

  _deployHTML() {
    const modes = MODE_LIST.map((m) => `
      <button class="card ${this.sel.mode === m.id ? 'on' : ''}" data-mode="${m.id}">
        <div class="ico">${m.icon}</div>
        <div class="nm">${m.nameJa}</div>
        <div class="en">${m.name}</div>
        <div class="ds">${m.desc}</div>
      </button>`).join('');

    const diffs = Object.entries(DIFFICULTY).map(([k, d]) => `
      <button class="card ${this.sel.difficulty === k ? 'on' : ''}" data-diff="${k}">
        <div class="nm">${d.name}</div>
        <div class="en">${k}</div>
        <div class="ds">反応 ${(d.reaction * 1000).toFixed(0)}ms / 命中率 ${(d.accuracy * 100).toFixed(0)}% / 視認 ${d.sight}m</div>
      </button>`).join('');

    return `
      <div class="sec"><h2>ゲームモード</h2><div class="cards">${modes}</div></div>
      <div class="sec"><h2>マップ</h2><div class="cards">
        <button class="card on" data-map="compound">
          <div class="ico">▣</div><div class="nm">コンパウンド</div><div class="en">COMPOUND</div>
          <div class="ds">砂漠地帯の廃棄されたコンパウンド。西のコンテナ置き場・中央の主屋・東の市場通りによる 3 レーン構造。</div>
        </button>
      </div></div>
      <div class="sec"><h2>敵の練度</h2><div class="cards">${diffs}</div></div>
      <div class="sec">
        <button class="deploy" id="btnDeploy">
          出撃
          <span class="sub">${GAME_MODES[this.sel.mode].nameJa} — コンパウンド</span>
        </button>
      </div>`;
  }

  _loadoutHTML() {
    const bar = (k, v, max) => `
      <div class="stat"><span class="k">${k}</span>
        <span class="b"><i style="width:${Math.min(100, (v / max) * 100).toFixed(0)}%"></i></span>
        <span class="v">${Math.round((v / max) * 100)}</span></div>`;

    const prim = Object.values(WEAPONS).filter((w) => w.class !== WEAPON_CLASS.PISTOL).map((w) => `
      <button class="card ${this.sel.primary === w.id ? 'on' : ''}" data-prim="${w.id}">
        <div class="nm">${w.nameJa}</div>
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
        <div class="nm">${w.nameJa}</div><div class="en">${w.class}</div><div class="ds">${w.desc}</div>
      </button>`).join('');

    const cur = WEAPONS[this.sel.primary];
    const list = this.sel.attachments[cur.id] || [];
    const atts = (cur.attachments || []).map((id) => {
      const a = ATTACHMENTS[id];
      return `<button class="card ${list.includes(id) ? 'on' : ''}" data-att="${id}">
        <div class="nm">${a.name}</div><div class="ds">${a.desc}</div></button>`;
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
        <div class="ctl"><div class="tgl ${on ? 'on' : ''}" id="${id}"></div></div></div>`;
    const seg = (id, label, help, opts, cur) => `
      <div class="row"><div class="lab"><div class="n">${label}</div><div class="h">${help}</div></div>
        <div class="ctl"><div class="seg" id="${id}">
          ${opts.map((o) => `<button data-v="${o.v}" class="${cur === o.v ? 'on' : ''}">${o.l}</button>`).join('')}
        </div></div></div>`;

    return `
      <div class="sec"><h2>操作</h2>
        ${range('sens', 'マウス感度', '視点移動の速さ', 0.2, 3, 0.05, s.sensitivity, (v) => (+v).toFixed(2))}
        ${range('adsSens', 'ADS 感度倍率', '覗き込み中の感度（対 通常）', 0.2, 1.5, 0.02, s.adsSensitivity, (v) => (+v).toFixed(2))}
        ${range('touchSens', 'タッチ感度', 'スマートフォンでの視点移動', 0.4, 3, 0.05, s.touchSensitivity, (v) => (+v).toFixed(2))}
        ${toggle('invertY', 'Y軸反転', '上下の視点操作を反転する', s.invertY)}
      </div>
      <div class="sec"><h2>画面</h2>
        ${range('fov', '視野角', '広いほど周辺が見えるが的が小さくなる', 65, 110, 1, s.fov, (v) => `${v}°`)}
        ${seg('quality', '画質', '描画負荷と見た目の釣り合い', [
          { v: 'low', l: '低' }, { v: 'medium', l: '中' }, { v: 'high', l: '高' }, { v: 'ultra', l: '最高' },
        ], s.quality)}
        ${range('brightness', '明るさ', '暗所の見やすさ', 0.6, 1.6, 0.02, s.brightness, (v) => (+v).toFixed(2))}
        ${toggle('motionBlur', 'モーションブラー', '疾走時の速度感を強調する', s.motionBlur)}
        ${toggle('filmGrain', 'フィルムグレイン', '画面に粒状感を加える', s.filmGrain)}
        ${toggle('showFps', 'FPS 表示', '描画性能を画面隅に表示する', s.showFps)}
      </div>
      <div class="sec"><h2>音響</h2>
        ${range('master', 'マスター音量', '全体の音量', 0, 1, 0.02, s.master, (v) => `${Math.round(v * 100)}`)}
        ${range('sfx', '効果音', '銃声・着弾音など', 0, 1, 0.02, s.sfx, (v) => `${Math.round(v * 100)}`)}
        ${range('music', 'BGM', 'メニューの音楽', 0, 1, 0.02, s.music, (v) => `${Math.round(v * 100)}`)}
      </div>`;
  }

  _aboutHTML() {
    const keyRow = (k, d) => `<div class="row"><div class="lab"><div class="n">${d}</div></div>
      <div class="ctl"><span class="val" style="width:auto;font-size:11px">${k}</span></div></div>`;
    return `
      <div class="sec"><h2>キーボード / マウス</h2>
        ${keyRow('W A S D', '移動')}
        ${keyRow('Shift', 'スプリント')}
        ${keyRow('Ctrl / C', 'しゃがみ（スプリント中はスライディング）')}
        ${keyRow('X', '伏せ')}
        ${keyRow('Space', 'ジャンプ / 乗り越え')}
        ${keyRow('Q / E', '左右へ体を傾ける（リーン）')}
        ${keyRow('左クリック', '射撃')}
        ${keyRow('右クリック', '覗き込み（ADS）')}
        ${keyRow('R', 'リロード')}
        ${keyRow('1 / 2 / ホイール', '武器切り替え')}
        ${keyRow('Tab', 'スコアボード')}
        ${keyRow('Esc', '一時停止')}
      </div>
      <div class="sec"><h2>スマートフォン</h2>
        ${keyRow('画面左側をドラッグ', '移動（大きく倒すとスプリント）')}
        ${keyRow('画面右側をドラッグ', '視点移動')}
        ${keyRow('右下の丸ボタン', '射撃')}
        ${keyRow('照準ボタン', '覗き込み（トグル）')}
        ${keyRow('各ボタン', 'ジャンプ / しゃがみ / リロード / 武器切替')}
      </div>
      <div class="sec"><h2>クレジット</h2>
        <div class="row"><div class="lab">
          <div class="n">OPERATION CRIMSON</div>
          <div class="h">Three.js による手続き型生成のブラウザ FPS。テクスチャ・モデル・レベルは
          すべてコードから生成しており、外部アセットを一切使用していません。</div>
        </div></div>
        <div class="row"><div class="lab">
          <div class="n">Anthropic / Opus 5</div>
          <div class="h">本作は Anthropic の Claude（Opus 5）によって実装されました。</div>
        </div></div>
      </div>`;
  }

  /* ================= イベント接続 ================= */

  _wirePage(page) {
    const p = this.el.panel;

    if (page === 'deploy') {
      p.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
        this.sel.mode = b.dataset.mode;
        this._renderPage('deploy');
      }));
      p.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
        this.sel.difficulty = b.dataset.diff;
        this._renderPage('deploy');
      }));
      p.querySelector('#btnDeploy')?.addEventListener('click', () => this.onStart?.(this.sel));
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

      for (const [id, key] of [['invertY', 'invertY'], ['motionBlur', 'motionBlur'], ['filmGrain', 'filmGrain'], ['showFps', 'showFps']]) {
        const el = p.querySelector('#' + id);
        el?.addEventListener('click', () => {
          const v = !el.classList.contains('on');
          el.classList.toggle('on', v);
          s.set(key, v);
          this.onSettingChange?.(key, v);
        });
      }
      const q = p.querySelector('#quality');
      q?.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        [...q.children].forEach((x) => x.classList.toggle('on', x === b));
        s.set('quality', b.dataset.v);
        this.onSettingChange?.('quality', b.dataset.v);
      });
    }
  }

  setMeta(text) { this.el.metaLine.textContent = text; }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
