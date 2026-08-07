/**
 * UI 用の SVG アイコン集。
 *
 * 絵文字や記号文字（⚔ ◉ ⏸ など）はフォント依存で字形・字幅・ベースラインが
 * 環境ごとに変わり、レイアウトが崩れる。すべて自前の SVG に置き換える。
 *
 * すべて 24x24 のビューボックスで統一し、線は currentColor を継承する。
 */

const svg = (body, opt = {}) => {
  const {
    size = 24, stroke = 1.6, fill = 'none', vb = '0 0 24 24', cls = '',
  } = opt;
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="${vb}" fill="${fill}" ` +
    `stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${body}</svg>`;
};

/* ================= ゲームモード ================= */

export const ICONS = {
  /** チームデスマッチ: 交差する 2 本の刃 */
  tdm: (o) => svg(`
    <path d="M4 4l9.5 9.5M20 4l-9.5 9.5" />
    <path d="M14.5 14.5L20 20l-1.6 1.6-5.4-5.4" />
    <path d="M9.5 14.5L4 20l1.6 1.6 5.4-5.4" />`, o),

  /** フリーフォーオール: 中心を囲む 4 つの照準 */
  ffa: (o) => svg(`
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.2v3.4M12 18.4v3.4M2.2 12h3.4M18.4 12h3.4" />
    <path d="M5.4 5.4l2.3 2.3M16.3 16.3l2.3 2.3M18.6 5.4l-2.3 2.3M7.7 16.3l-2.3 2.3" opacity=".55" />`, o),

  /** ドミネーション: 旗 */
  dom: (o) => svg(`
    <path d="M6 21V3" />
    <path d="M6 4h11.5l-2.2 3.6L17.5 11H6z" />`, o),

  /** キルコンファームド: ドッグタグ */
  kc: (o) => svg(`
    <rect x="7.4" y="3.2" width="9.2" height="14.4" rx="2.6" transform="rotate(14 12 10.4)" />
    <path d="M10.6 8.2h4.6M10.2 11.2h4.6" opacity=".6" />
    <circle cx="12" cy="20.4" r="1.4" />`, o),

  /** 捜索と破壊: 起爆装置 */
  snd: (o) => svg(`
    <circle cx="12" cy="13.5" r="6.6" />
    <path d="M12 13.5v-3.2" />
    <path d="M8.6 4.6l1.8 2.2M15.4 4.6l-1.8 2.2" />
    <path d="M9.4 3.4h5.2" />`, o),

  /** ガンゲーム: 段階的に上がるバー */
  gungame: (o) => svg(`
    <path d="M4 20V15M9.3 20V11.5M14.7 20V8M20 20V4.5" />
    <path d="M3 21.4h18" opacity=".5" />`, o),

  /* ================= マップ / 汎用 ================= */

  /** マップ: 折りたたみ地図 */
  map: (o) => svg(`
    <path d="M3 6.4l6-2.4 6 2.4 6-2.4v13.6l-6 2.4-6-2.4-6 2.4z" />
    <path d="M9 4v13.6M15 6.4V20" opacity=".6" />`, o),

  /** 出撃 */
  deploy: (o) => svg(`
    <path d="M4 12h13" />
    <path d="M12.5 6.8L17.8 12l-5.3 5.2" />
    <path d="M20.4 4.6v14.8" opacity=".55" />`, o),

  /** 装備 */
  loadout: (o) => svg(`
    <path d="M3 10.5h10.5l2.4-2.4h3.6l1.5 1.6v2.6l-1.5 1.6h-3l-1.4-1.4H9.4" />
    <path d="M6.6 10.5v3.4h3" />
    <circle cx="18.4" cy="11" r=".9" fill="currentColor" stroke="none" />`, o),

  /** 設定 */
  settings: (o) => svg(`
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2L5.4 5.4" />`, o),

  /** 操作方法 */
  help: (o) => svg(`
    <circle cx="12" cy="12" r="9" />
    <path d="M9.4 9.2a2.7 2.7 0 015.2.9c0 1.8-2.6 2.3-2.6 4" />
    <circle cx="12" cy="17.4" r="1" fill="currentColor" stroke="none" />`, o),

  /* ================= タッチ操作 ================= */

  /** 射撃 */
  fire: (o) => svg(`
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />`, o),

  /** 照準（ADS） */
  ads: (o) => svg(`
    <circle cx="12" cy="12" r="7.4" />
    <path d="M12 1.8v4.2M12 18v4.2M1.8 12h4.2M18 12h4.2" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />`, o),

  /** ジャンプ */
  jump: (o) => svg(`
    <path d="M12 20V5.4" />
    <path d="M6.8 10.6L12 5.2l5.2 5.4" />`, o),

  /** しゃがみ / 伏せ */
  crouch: (o) => svg(`
    <path d="M12 4v14.6" />
    <path d="M17.2 13.4L12 18.8l-5.2-5.4" />`, o),

  /** リロード */
  reload: (o) => svg(`
    <path d="M20.2 12a8.2 8.2 0 11-2.5-5.9" />
    <path d="M20.6 3.6v5.2h-5.2" />`, o),

  /** 武器切り替え */
  swap: (o) => svg(`
    <path d="M3.6 8.4h14.2M14.4 5l3.6 3.4-3.6 3.4" />
    <path d="M20.4 15.6H6.2M9.6 12.2l-3.6 3.4 3.6 3.4" />`, o),

  /** 近接攻撃 */
  melee: (o) => svg(`
    <path d="M4.2 19.8l9.6-9.6" />
    <path d="M12.4 8.8l3-3 4.4 4.4-3 3z" />
    <path d="M3 21l2.4-.6-.6-2.4z" fill="currentColor" stroke="none" />`, o),

  /** スプリント */
  sprint: (o) => svg(`
    <path d="M4 8.4h7M2.6 12h5.6M4.6 15.6h6" opacity=".55" />
    <path d="M13.4 5.2l5.4 6.8-5.4 6.8" />`, o),

  /** 一時停止 */
  pause: (o) => svg(`
    <rect x="7.6" y="5.4" width="3" height="13.2" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.4" y="5.4" width="3" height="13.2" rx="1" fill="currentColor" stroke="none" />`, o),

  /** スコアボード */
  board: (o) => svg(`
    <rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2" />
    <path d="M3.6 9.2h16.8" />
    <path d="M8.6 9.2v10.2M14.4 9.2v10.2" opacity=".6" />`, o),

  /* ================= その他 ================= */

  /** 端末の向き（縦横の切替案内） */
  rotate: (o) => svg(`
    <rect x="2.6" y="7.4" width="18.8" height="9.2" rx="1.8" />
    <path d="M8.6 4.2A7.4 7.4 0 0112 3.2" opacity=".7" />
    <path d="M6.4 3l-.4 2.4 2.4-.3" opacity=".7" />`, o),

  /** 閉じる */
  close: (o) => svg(`<path d="M6 6l12 12M18 6L6 18" />`, o),

  /** 戻る */
  back: (o) => svg(`<path d="M20 12H4M10.4 5.6L4 12l6.4 6.4" />`, o),

  /** チェック */
  check: (o) => svg(`<path d="M4.6 12.6l4.8 4.8L19.4 7.4" />`, o),

  /** 目標の使用（設置・解除） */
  objective: (o) => svg(`
    <rect x="5" y="9" width="14" height="10" rx="1.4" />
    <path d="M9 9V6.6a3 3 0 0 1 6 0V9" />
    <circle cx="12" cy="14" r="1.5" />`, o),
};

/**
 * Anthropic のバーストマーク（12 本のスポーク）。
 * CSS アニメーション用に個別要素を返す版。
 */
export function burstMarkHTML(cls = 'burst', delay = 0.05, step = 0.028) {
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += `<i style="--r:${i * 30}deg;animation-delay:${(delay + i * step).toFixed(3)}s"></i>`;
  }
  return `<div class="${cls}">${s}</div>`;
}

/** 静止版のバーストマーク（ヘッダ等） */
export function burstStaticHTML(cls = 'mark') {
  let s = '';
  for (let i = 0; i < 12; i++) s += `<i style="--r:${i * 30}deg"></i>`;
  return `<div class="${cls}">${s}</div>`;
}

/**
 * Opus 5 のスタジオマーク。
 * 五本の弧が中心のコアから開く形。「5」と、音楽用語 opus（作品番号）の
 * 「重なり」を重ねた意匠。
 */
export function opusMarkHTML(size = 96, animate = true) {
  const arcs = [
    { r: 20, w: 3.4, span: 200, d: 0.05 },
    { r: 28, w: 3.0, span: 174, d: 0.13 },
    { r: 36, w: 2.6, span: 148, d: 0.21 },
    { r: 44, w: 2.2, span: 122, d: 0.29 },
  ];
  const cls = animate ? 'arc' : 'arc static';
  let paths = '';
  for (const a of arcs) {
    const start = -90 - a.span / 2;
    paths += `<path class="${cls}" d="${describeArc(48, 48, a.r, start, start + a.span)}" ` +
      `stroke-width="${a.w}" style="animation-delay:${a.d}s" />`;
  }
  return `<div class="opus" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 96 96" aria-hidden="true">
      ${paths}
      <circle class="core${animate ? '' : ' static'}" cx="48" cy="48" r="7" />
    </svg></div>`;
}

/**
 * PROCYON エンジンのマーク。
 * 手続き型生成が主題のエンジンなので、
 * 「一点から規則的に増殖する格子」を意匠にする。
 */
export function engineMarkHTML(size = 96, animate = true) {
  const cls = animate ? 'egrid' : 'egrid static';
  let cells = '';
  // 中心から広がる同心の正方形（回転させて増殖感を出す）
  const rings = [
    { s: 11, rot: 0, w: 2.6, d: 0.02 },
    { s: 21, rot: 15, w: 2.2, d: 0.12 },
    { s: 31, rot: 30, w: 1.8, d: 0.22 },
    { s: 41, rot: 45, w: 1.4, d: 0.32 },
  ];
  for (const r of rings) {
    cells += `<rect class="${cls}" x="${48 - r.s}" y="${48 - r.s}" width="${r.s * 2}" height="${r.s * 2}" ` +
      `rx="${r.s * 0.16}" stroke-width="${r.w}" transform="rotate(${r.rot} 48 48)" ` +
      `style="animation-delay:${r.d}s" />`;
  }
  return `<div class="emark" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 96 96" aria-hidden="true">
      ${cells}
      <circle class="ecore${animate ? '' : ' static'}" cx="48" cy="48" r="4.6" />
    </svg></div>`;
}

function describeArc(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** マーク類に共通の CSS（Menu / MobileControls から読み込む） */
export const MARK_CSS = `
.ico { display: block; flex: 0 0 auto; }

/* Anthropic バーストマーク */
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
.mark { width: 22px; height: 22px; position: relative; flex: 0 0 auto; }
.mark i {
  position: absolute; left: 50%; top: 50%; width: 2.4px; height: 11px;
  background: var(--coral); border-radius: 1.2px; transform-origin: 50% 0;
  transform: translate(-50%,0) rotate(var(--r));
}

/* Opus 5 スタジオマーク */
.opus svg { width: 100%; height: 100%; overflow: visible; }
.opus path { fill: none; stroke: var(--coral); stroke-linecap: round; }
.opus .arc { stroke-dasharray: 200; stroke-dashoffset: 200; animation: arcDraw .8s cubic-bezier(.16,1,.3,1) forwards; }
.opus .arc.static { stroke-dashoffset: 0; animation: none; }
@keyframes arcDraw { to { stroke-dashoffset: 0; } }
.opus .core { fill: var(--coral); stroke: none; opacity: 0; transform-origin: 48px 48px;
  animation: markPop .5s .55s cubic-bezier(.16,1,.3,1) forwards; }
.opus .core.static { opacity: 1; animation: none; }
@keyframes markPop { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }

/* エンジンマーク */
.emark svg { width: 100%; height: 100%; overflow: visible; }
.emark rect { fill: none; stroke: var(--coral); }
.emark .egrid { opacity: 0; transform-box: fill-box; transform-origin: center;
  animation: gridIn .55s cubic-bezier(.16,1,.3,1) forwards; }
.emark .egrid.static { opacity: 1; animation: none; }
@keyframes gridIn { from { opacity: 0; } to { opacity: 1; } }
.emark .ecore { fill: var(--coral); stroke: none; opacity: 0; transform-origin: 48px 48px;
  animation: markPop .45s .42s cubic-bezier(.16,1,.3,1) forwards; }
.emark .ecore.static { opacity: 1; animation: none; }
`;

/** ブランド情報（表記ゆれを防ぐため一箇所に集約する） */
export const BRAND = {
  gameTitle: 'OPERATION CRIMSON',
  studio: 'Opus 5',
  studioJa: 'オーパス・ファイブ',
  studioRole: '製作',
  engine: 'PROCYON',
  engineFull: 'PROCYON ENGINE',
  engineTagline: '手続き型リアルタイムエンジン',
  techName: 'Anthropic Claude',
  techRole: '使用技術',
  techNote: '本作の実装には Anthropic の Claude を使用しています。',
  version: '0.2.0',
};
