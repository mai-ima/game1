import { Minimap } from './Minimap.js';

/**
 * 戦闘中の HUD。
 *
 * デザイン方針:
 *   一般的な FPS の「面取りしたSFパネル + オレンジ/シアン」を避け、
 *   作戦文書（ドシエ）の意匠 — ヘアライン罫・トンボ・等幅の計器表示 —
 *   に、Anthropic のコーラルとクリムゾンを載せる。
 *   数値は全て等幅（tabular）で桁が揺れないようにする。
 */

const CSS = `
.hud {
  position: fixed; inset: 0; pointer-events: none; z-index: 40;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif;
  color: var(--paper);
  --paper: #f2efe9;
  --ink: #0a0b0d;
  --coral: #d97757;
  --crimson: #d9482f;
  --steel: #8b9299;
  --dim: #565c63;
  --ally: #4a90d9;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  --safe-t: env(safe-area-inset-top, 0px);
  --safe-b: env(safe-area-inset-bottom, 0px);
  --safe-l: env(safe-area-inset-left, 0px);
  --safe-r: env(safe-area-inset-right, 0px);
}
.hud.hidden { display: none; }
.hud [data-el] { position: absolute; }

/* ---------- 照準 ----------
 * 中心の点と 4 本の線は「同じ基準点」から配置する必要がある。
 * margin による中央寄せと transform:translate(-50%) を併用すると
 * 2 重にずれて、点と線の中心が 1px 食い違う（狙点がずれて見える）。
 * ここでは margin を使わず、transform だけで位置を決める。
 */
.xh {
  left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 96px; height: 96px;
}
.xh i {
  position: absolute; left: 50%; top: 50%;
  background: var(--paper); box-shadow: 0 0 0 1px rgba(0,0,0,.55);
  transition: opacity .12s linear;
  will-change: transform;
}
.xh .v { width: 2px; height: 9px; }
.xh .h { width: 9px; height: 2px; }
.xh .dot {
  width: 2px; height: 2px; border-radius: 50%;
  transform: translate(-50%, -50%);
}
.xh.hide i { opacity: 0; }
.xh.hide .dot { opacity: .9; }

/* ヒットマーカー */
.hitmark { left: 50%; top: 50%; transform: translate(-50%,-50%); width: 34px; height: 34px; opacity: 0; }
.hitmark span {
  position: absolute; left: 50%; top: 50%; width: 11px; height: 2px; margin: -1px 0 0 -5.5px;
  background: var(--paper); box-shadow: 0 0 0 1px rgba(0,0,0,.6);
}
.hitmark span:nth-child(1) { transform: rotate(45deg) translate(9px,0); }
.hitmark span:nth-child(2) { transform: rotate(-45deg) translate(9px,0); }
.hitmark span:nth-child(3) { transform: rotate(135deg) translate(9px,0); }
.hitmark span:nth-child(4) { transform: rotate(-135deg) translate(9px,0); }
.hitmark.kill span { background: var(--crimson); }
.hitmark.show { animation: hm .28s ease-out; }
@keyframes hm { 0%{opacity:1;transform:translate(-50%,-50%) scale(.72)} 100%{opacity:0;transform:translate(-50%,-50%) scale(1.18)} }

/* ---------- 上部: スコアバー ---------- */
.scorebar {
  left: 50%; top: calc(10px + var(--safe-t)); transform: translateX(-50%);
  display: flex; align-items: center; gap: 14px;
  background: linear-gradient(180deg, rgba(11,12,14,.93), rgba(8,9,11,.86));
  border: 1px solid rgba(242,239,233,.10);
  border-radius: 3px; padding: 7px 14px;
}
.scorebar .team { display: flex; align-items: center; gap: 7px; }
.scorebar .pip { width: 7px; height: 7px; border-radius: 1px; }
.scorebar .pip.a { background: var(--ally); box-shadow: 0 0 7px rgba(74,144,217,.55); }
.scorebar .pip.b { background: var(--crimson); box-shadow: 0 0 7px rgba(217,72,47,.55); }
.scorebar .num { font: 600 19px/1 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.scorebar .clock {
  font: 500 14px/1 var(--mono); font-variant-numeric: tabular-nums;
  color: var(--paper); padding: 0 12px; border-left: 1px solid rgba(242,239,233,.14);
  border-right: 1px solid rgba(242,239,233,.14);
}
.scorebar .clock.urgent { color: var(--crimson); }
.scorebar .mode { font: 500 9px/1 var(--mono); letter-spacing: .22em; color: var(--dim); text-transform: uppercase; }

/* ---------- ミニマップ ---------- */
.mapbox { left: calc(16px + var(--safe-l)); top: calc(14px + var(--safe-t)); }
.mapbox canvas { display: block; border-radius: 50%; }
.mapbox .frame {
  position: absolute; inset: -5px; border-radius: 50%;
  border: 1px solid rgba(242,239,233,.14);
  box-shadow: 0 6px 26px rgba(0,0,0,.55), inset 0 0 22px rgba(0,0,0,.5);
}
/* トンボ（作戦文書の意匠） */
.mapbox .tick { position: absolute; background: var(--coral); }
.mapbox .tick.t1 { left: -9px; top: 50%; width: 6px; height: 1px; }
.mapbox .tick.t2 { right: -9px; top: 50%; width: 6px; height: 1px; }
.mapbox .tick.t3 { top: -9px; left: 50%; width: 1px; height: 6px; }
.mapbox .label {
  position: absolute; left: 0; bottom: -19px; width: 100%; text-align: center;
  font: 500 8px/1 var(--mono); letter-spacing: .24em; color: var(--dim); text-transform: uppercase;
}

/* ---------- キルフィード ---------- */
.feed {
  right: calc(16px + var(--safe-r)); top: calc(14px + var(--safe-t));
  display: flex; flex-direction: column; align-items: flex-end; gap: 4px; max-width: 46vw;
}
.feed .row {
  display: flex; align-items: center; gap: 7px;
  background: rgba(9,10,12,.72); border-right: 2px solid var(--dim);
  padding: 4px 8px 4px 9px; border-radius: 2px;
  font: 500 11.5px/1.3 var(--mono); white-space: nowrap;
  animation: feedIn .22s cubic-bezier(.16,1,.3,1);
}
.feed .row.mine { border-right-color: var(--coral); background: rgba(20,12,9,.8); }
.feed .row .k { color: var(--ally); }
.feed .row .k.b { color: var(--crimson); }
.feed .row .v { color: var(--steel); }
.feed .row .w { color: var(--paper); opacity: .85; font-size: 11px; }
.feed .row .hs { color: var(--coral); font-weight: 700; }
@keyframes feedIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }

/* ---------- 下段: 体力・スタミナ ---------- */
.vitals { left: calc(20px + var(--safe-l)); bottom: calc(22px + var(--safe-b)); width: 214px; }
.vitals .hpwrap { display: flex; align-items: flex-end; gap: 9px; }
.vitals .hpnum {
  font: 600 27px/0.85 var(--mono); font-variant-numeric: tabular-nums;
  letter-spacing: -.01em; text-shadow: 0 2px 10px rgba(0,0,0,.7);
}
.vitals .hplabel { font: 500 8px/1 var(--mono); letter-spacing: .22em; color: var(--dim); padding-bottom: 3px; }
.vitals .bar { margin-top: 7px; height: 3px; background: rgba(242,239,233,.12); border-radius: 2px; overflow: hidden; }
.vitals .bar > i { display: block; height: 100%; width: 100%; background: var(--paper); transition: width .18s ease-out; }
.vitals.low .bar > i { background: var(--crimson); }
.vitals.low .hpnum { color: var(--crimson); }
.vitals .stam { margin-top: 5px; height: 2px; background: rgba(242,239,233,.09); border-radius: 2px; overflow: hidden; opacity: 0; transition: opacity .25s; }
.vitals .stam > i { display: block; height: 100%; background: var(--coral); transition: width .1s linear; }
.vitals.showstam .stam { opacity: 1; }

/* ---------- 下段: 弾薬 ---------- */
.ammo { right: calc(22px + var(--safe-r)); bottom: calc(20px + var(--safe-b)); text-align: right; }
.ammo .wname {
  font: 500 10px/1 var(--mono); letter-spacing: .2em; color: var(--steel);
  text-transform: uppercase; margin-bottom: 8px;
}
.ammo .wname .mode { color: var(--coral); margin-left: 8px; }
.ammo .counts { display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; }
.ammo .mag {
  font: 600 40px/0.82 var(--mono); font-variant-numeric: tabular-nums;
  letter-spacing: -.02em; text-shadow: 0 2px 12px rgba(0,0,0,.75);
}
.ammo .sep { font: 400 20px/1 var(--mono); color: var(--dim); }
.ammo .res { font: 500 17px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--steel); }
.ammo.empty .mag { color: var(--crimson); }
/* 装弾数を刻みで見せる（残弾が直感的にわかる） */
.ammo .ticks { display: flex; justify-content: flex-end; gap: 2px; margin-top: 8px; height: 7px; }
.ammo .ticks i { width: 3px; height: 100%; background: var(--paper); opacity: .88; border-radius: 1px; }
.ammo .ticks i.spent { opacity: .14; }
.ammo .reload {
  margin-top: 9px; font: 500 10px/1 var(--mono); letter-spacing: .2em; color: var(--coral);
  opacity: 0; transition: opacity .12s;
}
.ammo.reloading .reload { opacity: 1; }

/* ---------- スコープ ----------
 * 円形のレンズ以外を黒で覆い、内側にミルドット照準線を描く。
 * 黒縁は「画面いっぱいの radial-gradient」で作る。
 * box-shadow の巨大 spread（0 0 0 9999px）は iOS Safari で
 * 画面外まで及ぶ巨大な合成レイヤを生み、覗くたびに数秒固まる原因になる。
 * グラデーションなら画面サイズぶんの塗りで済むので安全。
 */
.scope {
  inset: 0; opacity: 0; pointer-events: none;
  transition: opacity .09s linear;
}
.scope.on { opacity: 1; }
.scope .shroud {
  position: absolute; inset: 0;
  background: radial-gradient(circle at 50% 50%,
    rgba(0,0,0,0) calc(var(--lens) / 2 - 1px),
    #000 calc(var(--lens) / 2 + 0.5px));
}
/* レンズ内側の暗い縁取り（要素サイズが有限なので合成コストは小さい） */
.scope .lens {
  position: absolute; left: 50%; top: 50%;
  width: var(--lens); height: var(--lens); margin: calc(var(--lens) / -2) 0 0 calc(var(--lens) / -2);
  border-radius: 50%;
  box-shadow:
    inset 0 0 34px 12px rgba(0,0,0,.92),
    inset 0 0 4px 2px rgba(150,180,210,.30);
}
/* レンズ外周のわずかな色収差 */
.scope .fringe {
  position: absolute; left: 50%; top: 50%;
  width: calc(var(--lens) - 4px); height: calc(var(--lens) - 4px);
  margin: calc((var(--lens) - 4px) / -2) 0 0 calc((var(--lens) - 4px) / -2);
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px rgba(120,170,220,.22), inset 0 0 0 3px rgba(210,140,110,.10);
}
.scope .reticle {
  position: absolute; left: 50%; top: 50%;
  width: var(--lens); height: var(--lens); margin: calc(var(--lens) / -2) 0 0 calc(var(--lens) / -2);
  color: rgba(14,16,18,.92);
}
.scope .reticle svg { width: 100%; height: 100%; display: block; }
/* 息づかいによる微細な揺れ */
.scope .inner { position: absolute; inset: 0; will-change: transform; }

/* ---------- 被弾方向 ---------- */
.dmgring { left: 50%; top: 50%; width: 0; height: 0; }
.dmgring i {
  position: absolute; left: -70px; top: -140px; width: 140px; height: 44px;
  background: radial-gradient(ellipse at 50% 100%, rgba(217,72,47,.85), rgba(217,72,47,0) 70%);
  transform-origin: 50% 140px; opacity: 0;
}

/* ---------- 中央通知 ---------- */
.announce {
  left: 50%; top: 27%; transform: translateX(-50%); text-align: center; opacity: 0;
}
.announce .big {
  font: 300 34px/1.1 -apple-system, "Helvetica Neue", "Hiragino Sans", sans-serif;
  letter-spacing: .30em; text-indent: .30em; text-transform: uppercase;
  text-shadow: 0 3px 22px rgba(0,0,0,.85);
}
.announce .sub { margin-top: 9px; font: 500 11px/1 var(--mono); letter-spacing: .2em; color: var(--coral); }
.announce.show { animation: annIn 2.6s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes annIn {
  0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
  12% { opacity: 1; transform: translateX(-50%) translateY(0); }
  76% { opacity: 1; }
  100% { opacity: 0; }
}

/* 連続キル */
.streak {
  left: 50%; top: 36%; transform: translateX(-50%); text-align: center; opacity: 0;
}
.streak .n { font: 600 20px/1 var(--mono); color: var(--coral); letter-spacing: .1em; }
.streak .t { margin-top: 5px; font: 500 9px/1 var(--mono); letter-spacing: .24em; color: var(--steel); }
.streak.show { animation: annIn 1.8s cubic-bezier(.16,1,.3,1) forwards; }

/* ---------- 死亡画面 ---------- */
.death {
  inset: 0; background: rgba(6,7,9,.62); display: flex; flex-direction: column;
  align-items: center; justify-content: center; opacity: 0; pointer-events: none;
  transition: opacity .3s;
}
.death.show { opacity: 1; }
.death .k { font: 500 10px/1 var(--mono); letter-spacing: .26em; color: var(--steel); }
.death .who { margin-top: 12px; font: 300 30px/1 -apple-system, "Hiragino Sans", sans-serif; letter-spacing: .14em; }
.death .w { margin-top: 10px; font: 500 11px/1 var(--mono); letter-spacing: .16em; color: var(--coral); }
.death .rs { margin-top: 34px; font: 500 10px/1 var(--mono); letter-spacing: .22em; color: var(--steel); }
.death .rsn { font: 600 30px/1 var(--mono); margin-top: 8px; }

/* ---------- スコアボード ---------- */
.board {
  left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: min(760px, 92vw); background: rgba(9,10,12,.93);
  border: 1px solid rgba(242,239,233,.12); border-radius: 4px;
  padding: 22px 24px; opacity: 0; pointer-events: none; transition: opacity .14s;
  box-shadow: 0 24px 70px rgba(0,0,0,.6);
}
.board.show { opacity: 1; }
.board h3 {
  font: 500 9px/1 var(--mono); letter-spacing: .28em; color: var(--dim);
  text-transform: uppercase; margin-bottom: 14px;
}
.board table { width: 100%; border-collapse: collapse; }
.board th {
  font: 500 8.5px/1 var(--mono); letter-spacing: .2em; color: var(--dim);
  text-transform: uppercase; text-align: right; padding: 0 0 8px; font-weight: 500;
}
.board th:first-child { text-align: left; }
.board td {
  font: 500 12.5px/1 var(--mono); font-variant-numeric: tabular-nums;
  padding: 7px 0; text-align: right; border-top: 1px solid rgba(242,239,233,.07);
}
.board td:first-child { text-align: left; font-family: -apple-system, "Hiragino Sans", sans-serif; font-size: 13px; }
.board tr.me td { color: var(--coral); }
.board .teamhead { display: flex; align-items: center; gap: 8px; margin: 16px 0 6px; }
.board .teamhead:first-of-type { margin-top: 0; }
.board .teamhead .pip { width: 6px; height: 6px; border-radius: 1px; }
.board .teamhead .nm { font: 500 9px/1 var(--mono); letter-spacing: .2em; text-transform: uppercase; }
.board .teamhead .sc { margin-left: auto; font: 600 15px/1 var(--mono); }

/* ---------- 目標マーカー（画面上のピン） ---------- */
.pins { inset: 0; overflow: hidden; }
.pin {
  position: absolute; transform: translate(-50%,-50%);
  font: 600 10px/1 var(--mono); letter-spacing: .1em;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.pin .ring { width: 18px; height: 18px; border: 1.4px solid currentColor; border-radius: 50%; }
.pin .dist { font-size: 9px; opacity: .8; }

@media (max-height: 460px) {
  .mapbox { left: calc(10px + var(--safe-l)); top: calc(8px + var(--safe-t)); }
  .mapbox .label { font-size: 7px; bottom: -15px; }
  .scorebar { top: calc(6px + var(--safe-t)); padding: 5px 11px; gap: 10px; }
  .scorebar .num { font-size: 15px; }
  .scorebar .clock { font-size: 12px; padding: 0 9px; }
  .vitals { left: calc(12px + var(--safe-l)); bottom: calc(10px + var(--safe-b)); width: 118px; }
  .vitals .hpnum { font-size: 18px; }
  .ammo { right: calc(14px + var(--safe-r)); bottom: calc(8px + var(--safe-b)); }
  .ammo .mag { font-size: 24px; }
  .ammo .res { font-size: 12px; }
  .ammo .wname { font-size: 8.5px; margin-bottom: 4px; }
  .ammo .ticks { height: 5px; margin-top: 5px; }
  .feed { top: calc(44px + var(--safe-t)); }
  .feed .row { font-size: 10px; padding: 3px 6px; }
  .announce .big { font-size: 20px; }
}
@media (max-width: 780px) {
  .vitals { width: 150px; }
  .vitals .hpnum { font-size: 21px; }
  .ammo .mag { font-size: 30px; }
  .ammo .res { font-size: 14px; }
  .announce .big { font-size: 22px; }
  .board { padding: 16px; }
}
`;

/**
 * ミルドット照準線の SVG を組み立てる。
 * 実物の狙撃スコープに倣い、中心から等間隔の点で距離・偏差を読む。
 * 100 の座標系で描き、表示時にレンズ径へスケールされる。
 */
function reticleSVG() {
  const C = 50;          // 中心
  const R = 50;          // 外周
  const dot = 1.05;      // ミルドットの半径
  const pitch = 5.2;     // ドット間隔
  let marks = '';

  // 上下左右のミルドット（中心付近は空けて視界を確保）
  for (let i = 2; i <= 8; i++) {
    const d = i * pitch;
    if (d > R - 4) break;
    const big = i % 2 === 0;
    const r = big ? dot : dot * 0.62;
    marks += `<circle cx="${C}" cy="${C + d}" r="${r}" />`;
    marks += `<circle cx="${C}" cy="${C - d}" r="${r * 0.8}" />`;
    marks += `<circle cx="${C - d}" cy="${C}" r="${r}" />`;
    marks += `<circle cx="${C + d}" cy="${C}" r="${r}" />`;
  }

  // 下方向の距離目盛り（落下量の読み取り用）
  let ticks = '';
  for (let i = 1; i <= 4; i++) {
    const y = C + i * pitch * 2;
    if (y > R * 1.9) break;
    ticks += `<line x1="${C - 3.4}" y1="${y}" x2="${C + 3.4}" y2="${y}" stroke-width="0.7" />`;
  }

  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <g stroke="currentColor" fill="currentColor" stroke-linecap="round">
      <!-- 太い外側の十字（薄明かりでも視認できる） -->
      <line x1="0" y1="${C}" x2="${C - 12}" y2="${C}" stroke-width="1.9" />
      <line x1="${C + 12}" y1="${C}" x2="100" y2="${C}" stroke-width="1.9" />
      <line x1="${C}" y1="0" x2="${C}" y2="${C - 12}" stroke-width="1.9" />
      <line x1="${C}" y1="${C + 12}" x2="${C}" y2="100" stroke-width="1.9" />
      <!-- 細い内側の十字 -->
      <line x1="${C - 12}" y1="${C}" x2="${C - 2.4}" y2="${C}" stroke-width="0.55" />
      <line x1="${C + 2.4}" y1="${C}" x2="${C + 12}" y2="${C}" stroke-width="0.55" />
      <line x1="${C}" y1="${C - 12}" x2="${C}" y2="${C - 2.4}" stroke-width="0.55" />
      <line x1="${C}" y1="${C + 2.4}" x2="${C}" y2="${C + 12}" stroke-width="0.55" />
      <g stroke="none">${marks}</g>
      <g stroke="currentColor">${ticks}</g>
      <circle cx="${C}" cy="${C}" r="0.62" stroke="none" />
    </g>
  </svg>`;
}

export class HUD {
  /**
   * @param {HTMLElement} parent
   */
  constructor(parent) {
    if (!document.getElementById('hud-style')) {
      const st = document.createElement('style');
      st.id = 'hud-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    this.root.innerHTML = `
      <div data-el class="pins" id="hudPins"></div>

      <div data-el class="xh" id="hudXh">
        <i class="v" id="xhT"></i><i class="v" id="xhB"></i>
        <i class="h" id="xhL"></i><i class="h" id="xhR"></i>
        <i class="dot"></i>
      </div>
      <div data-el class="hitmark" id="hudHit"><span></span><span></span><span></span><span></span></div>

      <div data-el class="scope" id="hudScope">
        <div class="inner" id="scopeInner">
          <div class="reticle">${reticleSVG()}</div>
          <div class="fringe"></div>
        </div>
        <div class="lens"></div>
        <div class="shroud"></div>
      </div>
      <div data-el class="dmgring" id="hudDmg"></div>

      <div data-el class="scorebar">
        <div class="team"><span class="pip a"></span><span class="num" id="scoreA">0</span></div>
        <span class="clock" id="clock">10:00</span>
        <div class="team"><span class="num" id="scoreB">0</span><span class="pip b"></span></div>
        <span class="mode" id="modeName">TDM</span>
      </div>

      <div data-el class="mapbox" id="hudMap">
        <canvas id="mapCanvas"></canvas>
        <div class="frame"></div>
        <div class="tick t1"></div><div class="tick t2"></div><div class="tick t3"></div>
        <div class="label" id="mapLabel">コンパウンド</div>
      </div>

      <div data-el class="feed" id="hudFeed"></div>

      <div data-el class="vitals" id="hudVitals">
        <div class="hpwrap">
          <span class="hpnum" id="hpNum">100</span>
          <span class="hplabel">HP</span>
        </div>
        <div class="bar"><i id="hpBar"></i></div>
        <div class="stam"><i id="stamBar"></i></div>
      </div>

      <div data-el class="ammo" id="hudAmmo">
        <div class="wname"><span id="wName">M4A1</span><span class="mode" id="wMode">AUTO</span></div>
        <div class="counts">
          <span class="mag" id="ammoMag">30</span>
          <span class="sep">/</span>
          <span class="res" id="ammoRes">180</span>
        </div>
        <div class="ticks" id="ammoTicks"></div>
        <div class="reload">リロード中</div>
      </div>

      <div data-el class="announce" id="hudAnn"><div class="big" id="annBig"></div><div class="sub" id="annSub"></div></div>
      <div data-el class="streak" id="hudStreak"><div class="n" id="streakN"></div><div class="t" id="streakT"></div></div>

      <div data-el class="death" id="hudDeath">
        <div class="k">戦死</div>
        <div class="who" id="deathWho">—</div>
        <div class="w" id="deathW">—</div>
        <div class="rs">リスポーンまで</div>
        <div class="rsn" id="deathT">3</div>
      </div>

      <div data-el class="board" id="hudBoard"></div>
    `;
    parent.appendChild(this.root);

    const $ = (id) => this.root.querySelector('#' + id);
    this.el = {
      xh: $('hudXh'), xhT: $('xhT'), xhB: $('xhB'), xhL: $('xhL'), xhR: $('xhR'),
      hit: $('hudHit'), dmg: $('hudDmg'), pins: $('hudPins'),
      scope: $('hudScope'), scopeInner: $('scopeInner'),
      scoreA: $('scoreA'), scoreB: $('scoreB'), clock: $('clock'), modeName: $('modeName'),
      map: $('hudMap'), mapCanvas: $('mapCanvas'), mapLabel: $('mapLabel'),
      feed: $('hudFeed'),
      vitals: $('hudVitals'), hpNum: $('hpNum'), hpBar: $('hpBar'), stamBar: $('stamBar'),
      ammo: $('hudAmmo'), wName: $('wName'), wMode: $('wMode'),
      ammoMag: $('ammoMag'), ammoRes: $('ammoRes'), ammoTicks: $('ammoTicks'),
      ann: $('hudAnn'), annBig: $('annBig'), annSub: $('annSub'),
      streak: $('hudStreak'), streakN: $('streakN'), streakT: $('streakT'),
      death: $('hudDeath'), deathWho: $('deathWho'), deathW: $('deathW'), deathT: $('deathT'),
      board: $('hudBoard'),
    };

    // 横画面スマホは縦の余白が乏しいので、画面高からサイズを決める
    const h = window.innerHeight;
    const size = h < 460 ? 96 : (window.innerWidth < 780 ? 124 : 176);
    this.minimap = new Minimap(this.el.mapCanvas, { size });

    // 画面サイズが変わったらレンズ径とミニマップを作り直す
    this._onResize = () => {
      this.el.scope.style.setProperty('--lens', `${this._lensSize()}px`);
      const h = window.innerHeight;
      const size = h < 460 ? 96 : (window.innerWidth < 780 ? 124 : 176);
      if (size !== this.minimap.size) this.minimap.resize(size);
    };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(this._onResize, 250));

    this._dmgMarks = [];
    this._feedRows = [];
    this._xhSpread = -1;   // 初回は必ず反映されるよう範囲外にしておく
    this._scopeOn = false;
    this._lastMag = -1;
    this.visible = false;
  }

  show() { this.root.classList.remove('hidden'); this.visible = true; }
  hide() { this.root.classList.add('hidden'); this.visible = false; }

  /* ================= 各要素の更新 ================= */

  setMapName(name) { this.el.mapLabel.textContent = name; }
  setModeName(name) { this.el.modeName.textContent = name; }

  setHealth(hp, max) {
    const p = Math.max(0, Math.min(1, hp / max));
    this.el.hpNum.textContent = Math.ceil(hp);
    this.el.hpBar.style.width = `${p * 100}%`;
    this.el.vitals.classList.toggle('low', p < 0.35);
  }

  setStamina(v, max) {
    const p = Math.max(0, Math.min(1, v / max));
    this.el.stamBar.style.width = `${p * 100}%`;
    this.el.vitals.classList.toggle('showstam', p < 0.995);
  }

  setAmmo({ mag, reserve, weapon }) {
    if (!weapon) return;
    this.el.ammoMag.textContent = mag;
    this.el.ammoRes.textContent = reserve;
    this.el.wName.textContent = weapon.name;
    this.el.wMode.textContent = {
      auto: 'フルオート', semi: 'セミオート', burst: 'バースト', bolt: 'ボルト', pump: 'ポンプ',
    }[weapon.fireMode] || '';
    this.el.ammo.classList.toggle('empty', mag === 0);

    // 弾数の刻み（30発を超える場合は間引く）
    if (this._lastMag !== weapon.magSize) {
      this._lastMag = weapon.magSize;
      const n = Math.min(weapon.magSize, 30);
      this.el.ammoTicks.innerHTML = Array.from({ length: n }, () => '<i></i>').join('');
      this._tickEls = [...this.el.ammoTicks.children];
      this._tickRatio = weapon.magSize / n;
    }
    if (this._tickEls) {
      const filled = Math.ceil(mag / this._tickRatio);
      for (let i = 0; i < this._tickEls.length; i++) {
        this._tickEls[i].classList.toggle('spent', i >= filled);
      }
    }
  }

  setReloading(on) { this.el.ammo.classList.toggle('reloading', on); }

  /**
   * 照準の広がりを設定する。
   * @param {number} gapPx 中心から線の内側までの距離（ピクセル）
   * @param {boolean} hidden 覗き込み中などに線を隠すか
   *
   * 線は長さ 9px なので、中心から線の中心までは gap + 4.5px。
   * 全要素を translate(-50%,-50%) 起点に揃えることで、
   * 点と線の中心が必ず一致する。
   */
  setCrosshair(gapPx, hidden = false) {
    const g = Math.max(2, gapPx);
    if (Math.abs(g - this._xhSpread) > 0.3) {
      this._xhSpread = g;
      const c = (g + 4.5).toFixed(1);
      this.el.xhT.style.transform = `translate(-50%, -50%) translateY(-${c}px)`;
      this.el.xhB.style.transform = `translate(-50%, -50%) translateY(${c}px)`;
      this.el.xhL.style.transform = `translate(-50%, -50%) translateX(-${c}px)`;
      this.el.xhR.style.transform = `translate(-50%, -50%) translateX(${c}px)`;
    }
    this.el.xh.classList.toggle('hide', hidden);
  }

  /**
   * スコープ表示の更新。
   * @param {number} t 0..1 覗き込みの進行度
   * @param {number} swayX 息づかいによる横揺れ（画素）
   * @param {number} swayY 縦揺れ（画素）
   */
  setScope(t, swayX = 0, swayY = 0) {
    const on = t > 0.5;
    if (on !== this._scopeOn) {
      this._scopeOn = on;
      this.el.scope.classList.toggle('on', on);
      // レンズ径は短辺基準。覗き込み途中は少し広げて“寄る”感じを出す
      this.el.scope.style.setProperty('--lens', `${this._lensSize()}px`);
    }
    if (on) {
      this.el.scopeInner.style.transform = `translate(${swayX.toFixed(2)}px, ${swayY.toFixed(2)}px)`;
    }
  }

  _lensSize() {
    const short = Math.min(window.innerWidth, window.innerHeight);
    return Math.round(short * 0.78);
  }

  hitmarker(isKill = false) {
    const e = this.el.hit;
    e.classList.toggle('kill', isKill);
    e.classList.remove('show');
    void e.offsetWidth;
    e.classList.add('show');
  }

  /** 被弾方向インジケータ */
  damageFrom(angleRad) {
    const i = document.createElement('i');
    i.style.transform = `rotate(${angleRad}rad)`;
    i.style.opacity = '1';
    i.style.transition = 'opacity 1.1s ease-out';
    this.el.dmg.appendChild(i);
    requestAnimationFrame(() => { i.style.opacity = '0'; });
    setTimeout(() => i.remove(), 1200);
  }

  /** キルフィードへ 1 行追加 */
  addKill({ killerName, victimName, killerTeam, weapon, headshot, byPlayer, againstPlayer }) {
    const row = document.createElement('div');
    row.className = 'row' + (byPlayer || againstPlayer ? ' mine' : '');
    const kc = killerTeam === 'A' ? 'k' : 'k b';
    row.innerHTML =
      `<span class="${kc}">${esc(killerName)}</span>` +
      `<span class="w">${esc(weapon?.name || '')}</span>` +
      (headshot ? '<span class="hs">HS</span>' : '') +
      `<span class="v">${esc(victimName)}</span>`;
    this.el.feed.appendChild(row);
    this._feedRows.push(row);

    /*
     * 行の破棄は「その行自身」を対象にする。
     * 以前は shift() で先頭を落としていたため、行数上限で先に消えた行の
     * タイマーが無関係な行を配列から外し、DOM 上に取り残された行が
     * 試合中ずっと積み上がっていた。
     */
    const drop = () => {
      clearTimeout(row._fadeT); clearTimeout(row._killT);
      const i = this._feedRows.indexOf(row);
      if (i >= 0) this._feedRows.splice(i, 1);
      row.remove();
    };
    row._fadeT = setTimeout(() => { row.style.transition = 'opacity .4s'; row.style.opacity = '0'; }, 5200);
    row._killT = setTimeout(drop, 5700);

    while (this._feedRows.length > 6) {
      const r = this._feedRows.shift();
      if (!r) continue;
      clearTimeout(r._fadeT); clearTimeout(r._killT);
      r.remove();
    }
  }

  /** 試合終了・離脱時にキルフィードを空にする */
  clearFeed() {
    for (const r of this._feedRows) {
      clearTimeout(r._fadeT); clearTimeout(r._killT);
      r.remove();
    }
    this._feedRows.length = 0;
  }

  announce(big, sub = '') {
    this.el.annBig.textContent = big;
    this.el.annSub.textContent = sub;
    this.el.ann.classList.remove('show');
    void this.el.ann.offsetWidth;
    this.el.ann.classList.add('show');
  }

  showStreak(n) {
    const names = { 2: 'ダブルキル', 3: 'トリプルキル', 4: 'クアッドキル', 5: '無双' };
    this.el.streakN.textContent = `${n} 連続キル`;
    this.el.streakT.textContent = names[Math.min(n, 5)] || '圧倒的';
    this.el.streak.classList.remove('show');
    void this.el.streak.offsetWidth;
    this.el.streak.classList.add('show');
  }

  showDeath(killerName, weaponName) {
    this.el.deathWho.textContent = killerName;
    this.el.deathW.textContent = weaponName;
    this.el.death.classList.add('show');
  }
  setRespawnTime(t) { this.el.deathT.textContent = Math.max(0, Math.ceil(t)); }
  hideDeath() { this.el.death.classList.remove('show'); }

  setScores(s, modeName) {
    if (!s) return;
    this.el.scoreA.textContent = s.A ?? 0;
    this.el.scoreB.textContent = s.B ?? 0;
    const t = Math.max(0, s.remaining ?? 0);
    const m = Math.floor(t / 60), sec = Math.floor(t % 60);
    this.el.clock.textContent = `${m}:${String(sec).padStart(2, '0')}`;
    this.el.clock.classList.toggle('urgent', t < 30);
    if (modeName) this.el.modeName.textContent = modeName;
  }

  /** スコアボード（Tab） */
  setBoard(open, data) {
    this.el.board.classList.toggle('show', open);
    if (!open || !data) return;
    const teamRows = (team, rows, score) => `
      <div class="teamhead">
        <span class="pip" style="background:${team === 'A' ? '#4a90d9' : '#d9482f'}"></span>
        <span class="nm">${team === 'A' ? '部隊 ALPHA' : '部隊 BRAVO'}</span>
        <span class="sc">${score}</span>
      </div>
      <table>
        <tr><th>名前</th><th>キル</th><th>デス</th><th>K/D</th><th>スコア</th></tr>
        ${rows.map((r) => `
          <tr class="${r.me ? 'me' : ''}">
            <td>${esc(r.name)}</td><td>${r.kills}</td><td>${r.deaths}</td>
            <td>${(r.deaths ? r.kills / r.deaths : r.kills).toFixed(2)}</td><td>${r.score}</td>
          </tr>`).join('')}
      </table>`;
    this.el.board.innerHTML =
      `<h3>${esc(data.mode || '')} — ${esc(data.map || '')}</h3>` +
      teamRows('A', data.teamA, data.scoreA) +
      teamRows('B', data.teamB, data.scoreB);
  }

  /** ミニマップ更新 */
  /**
   * ミニマップを更新する。
   * 中身は Canvas2D の再描画（回転した地形画像の転写を含む）なので、
   * 描画フレームレートに合わせて毎フレーム回す必要はない。
   * 30Hz に間引いても体感は変わらず、負荷は半分になる。
   */
  updateMinimap(state) {
    const now = performance.now();
    if (now - (this._miniAt || 0) < 33) return;
    this._miniAt = now;
    this.minimap.draw(state);
  }

  /** 目標地点のスクリーンピン */
  setPins(pins) {
    const c = this.el.pins;
    while (c.children.length < pins.length) {
      const d = document.createElement('div');
      d.className = 'pin';
      d.innerHTML = '<div class="ring"></div><span class="id"></span><span class="dist"></span>';
      c.appendChild(d);
    }
    for (let i = 0; i < c.children.length; i++) {
      const el = c.children[i];
      const p = pins[i];
      if (!p) { el.style.display = 'none'; continue; }
      el.style.display = 'flex';
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.color = p.color;
      el.style.opacity = p.alpha ?? 1;
      el.querySelector('.id').textContent = p.label;
      el.querySelector('.dist').textContent = `${Math.round(p.dist)}m`;
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.root.remove();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
