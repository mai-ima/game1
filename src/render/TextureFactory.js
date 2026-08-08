import * as THREE from 'three';
import { fbm, fbmP, ridged, worley, voronoiEdge, valueNoise, warp, clamp01, smoothstep, mix, hash01 } from './Noise.js';
import { DEFS2 } from './TextureDefs2.js';

/**
 * 手続き型 PBR テクスチャ工房。
 * 各マテリアル定義はピクセル毎に {r,g,b,h,rough,metal,ao} を返し、
 * ここから albedo / normal / roughness-metalness-ao (ORM) の各マップを生成する。
 * すべてタイリング可能。
 */

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ *
 *  マテリアル定義
 *  fn(u, v, o, R)  u,v ∈ [0,1) ; o = 出力先 ; R = 乱数シード基数
 * ------------------------------------------------------------------ */

const DEFS = {
  /* --- コンクリート（打ちっぱなし） --- */
  concrete(u, v, o, S) {
    const N = 6;
    const base = fbm(u * N, v * N, { octaves: 6, period: N, seed: S });
    const grain = valueNoise(u * 160, v * 160, 160, S + 3);
    const pit = worley(u * 14, v * 14, 14, S + 7, 0.95).f1;
    const pits = smoothstep(0.0, 0.26, pit);
    const stain = fbm(u * 2, v * 2, { octaves: 4, period: 2, seed: S + 11 });
    const crack = (1 - smoothstep(0.0, 0.014, voronoiEdge(u * 8, v * 8, 8, S + 21, 1)))
      * smoothstep(0.5, 0.78, fbm(u * 2, v * 2, { octaves: 3, period: 2, seed: S + 71 }));

    let l = 0.26 + base * 0.110 + grain * 0.048 - (1 - pits) * 0.105;
    l *= 1 - stain * 0.17;
    l -= crack * 0.2;
    // 実物のコンクリートはごくわずかに青灰色。ここを青くしすぎると
    // 環境光の青みと重なって画面全体が水色に転ぶ。
    o.r = l * 0.99; o.g = l * 0.995; o.b = l * 1.0;
    o.h = base * 0.55 + pits * 0.3 + grain * 0.08 - crack * 0.5;
    o.rough = clamp01(0.82 + grain * 0.12 - stain * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.72 + pits * 0.28 - crack * 0.35);
  },

  /* --- 塗装コンクリート壁（屋内） --- */
  paintedWall(u, v, o, S) {
    const base = fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S });
    const roll = valueNoise(u * 90, v * 12, 90, S + 5); // ローラー跡
    const scuff = ridged(u * 9, v * 3, { octaves: 4, period: 9, seed: S + 13 });
    const chip = worley(u * 22, v * 22, 22, S + 31, 1).f1;
    const chipped = smoothstep(0.12, 0.2, chip) < 0.5 ? 1 : 0;
    const drip = smoothstep(0.62, 0.98, fbm(u * 3, v * 0.6, { octaves: 3, period: 3, seed: S + 41 }));

    // 明度は日向で飽和しない範囲に収める（漆喰と同じ理由）
    let l = 0.30 + base * 0.060 + roll * 0.026;
    l -= scuff * 0.085 * smoothstep(0.35, 0.0, v);
    l -= drip * 0.13;
    o.r = l * 0.955; o.g = l * 0.945; o.b = l * 0.912;
    if (chipped) { o.r *= 0.62; o.g *= 0.6; o.b *= 0.56; }
    o.h = base * 0.3 + roll * 0.12 - chipped * 0.6;
    o.rough = clamp01(0.62 + scuff * 0.2 + chipped * 0.25);
    o.metal = 0;
    o.ao = clamp01(0.86 - chipped * 0.3 - drip * 0.1);
  },

  /* --- アスファルト --- */
  asphalt(u, v, o, S) {
    const agg = worley(u * 46, v * 46, 46, S + 3, 1);
    const fine = fbm(u * 90, v * 90, { octaves: 4, period: 90, seed: S + 9 });
    const broad = fbm(u * 3, v * 3, { octaves: 4, period: 3, seed: S + 17 });
    const crack = 1 - smoothstep(0, 0.028, voronoiEdge(u * 4, v * 4, 4, S + 27, 1));
    const stone = smoothstep(0.16, 0.05, agg.f1);

    let l = 0.085 + broad * 0.05 + fine * 0.05 + stone * 0.16 * (0.4 + agg.id * 0.6);
    l -= crack * 0.05;
    o.r = l * 0.95; o.g = l * 0.98; o.b = l * 1.08;
    o.h = stone * 0.6 + fine * 0.2 + broad * 0.2 - crack * 0.7;
    o.rough = clamp01(0.9 - stone * 0.2 + fine * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.7 + stone * 0.3 - crack * 0.45);
  },

  /* --- レンガ --- */
  brick(u, v, o, S) {
    const ROWS = 8, COLS = 4;
    const fy = v * ROWS;
    const row = Math.floor(fy);
    const offset = (row % 2) * 0.5;
    const fx = u * COLS + offset;
    const col = Math.floor(fx);
    const lx = fx - col, ly = fy - row;
    const MW = 0.045, MH = 0.09;
    const inX = smoothstep(0, MW, lx) * smoothstep(0, MW, 1 - lx);
    const inY = smoothstep(0, MH, ly) * smoothstep(0, MH, 1 - ly);
    const brickMask = Math.min(inX, inY);

    const id = ((col * 73 + row * 149) % 97) / 97;
    const bn = fbm(u * 40, v * 40, { octaves: 4, period: 40, seed: S + col * 7 + row * 13 });
    const wear = fbm(u * 8, v * 8, { octaves: 5, period: 8, seed: S + 5 });

    // レンガ本体色（個体差）
    const hueMix = 0.35 + id * 0.5;
    let br = 0.40 + hueMix * 0.24 + bn * 0.10;
    let bg = 0.135 + hueMix * 0.070 + bn * 0.050;
    let bb = 0.095 + hueMix * 0.042 + bn * 0.038;
    // 目地（モルタル）
    const mo = 0.5 + fbm(u * 60, v * 60, { octaves: 3, period: 60, seed: S + 61 }) * 0.14;

    const t = brickMask;
    o.r = mix(mo * 0.95, br, t);
    o.g = mix(mo * 0.96, bg, t);
    o.b = mix(mo * 0.97, bb, t);
    const shade = 1 - wear * 0.16;
    o.r *= shade; o.g *= shade; o.b *= shade;

    o.h = t * 0.85 + bn * 0.12;
    o.rough = clamp01(mix(0.95, 0.76 + bn * 0.14, t));
    o.metal = 0;
    o.ao = clamp01(mix(0.45, 0.95, smoothstep(0, 0.5, t)));
  },

  /* --- 錆びた鉄 --- */
  rustedMetal(u, v, o, S) {
    const [wu, wv] = warp(u * 5, v * 5, 1.4, { octaves: 4, period: 5, seed: S });
    const rustMask = smoothstep(0.34, 0.72, fbmP(wu, wv, { octaves: 5, period: 5, seed: S + 3 }));
    const flake = ridged(u * 26, v * 26, { octaves: 4, period: 26, seed: S + 7 });
    const grain = fbm(u * 130, v * 130, { octaves: 3, period: 130, seed: S + 11 });
    const streak = smoothstep(0.45, 1.0, fbm(u * 6, v * 1.1, { octaves: 4, period: 6, seed: S + 19 }));

    // 素地の鉄
    const mBase = 0.29 + grain * 0.09;
    // 錆色（酸化鉄）
    const rv = 0.3 + flake * 0.34;
    const rr = 0.30 + rv * 0.34, rg = 0.135 + rv * 0.17, rb = 0.055 + rv * 0.075;

    const t = clamp01(rustMask * 0.85 + streak * 0.4);
    o.r = mix(mBase, rr, t);
    o.g = mix(mBase * 0.99, rg, t);
    o.b = mix(mBase * 1.01, rb, t);
    o.h = flake * t * 0.55 + grain * 0.15 + (1 - t) * 0.25;
    o.rough = clamp01(mix(0.36 + grain * 0.1, 0.93, t));
    o.metal = clamp01(1 - t * 0.9);
    o.ao = clamp01(0.82 - t * 0.22 + flake * 0.12);
  },

  /* --- 塗装金属（military olive / 車両ボディ） --- */
  paintedMetal(u, v, o, S) {
    const dent = fbmP(u * 7, v * 7, { octaves: 4, period: 7, seed: S });
    const orange = valueNoise(u * 200, v * 200, 200, S + 3); // オレンジピール
    const scratch = smoothstep(0.86, 1.0, ridged(u * 40, v * 40, { octaves: 3, period: 40, seed: S + 9 }));
    const chip = smoothstep(0.1, 0.03, worley(u * 30, v * 30, 30, S + 15, 1).f1);
    const dirt = smoothstep(0.5, 0.95, fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S + 23 }));

    let r = 0.115, g = 0.128, b = 0.088; // OD グリーン
    const sh = 1 + (dent - 0.5) * 0.22 + orange * 0.05;
    r *= sh; g *= sh; b *= sh;
    // 剥離部は素地の金属
    const bare = clamp01(chip + scratch * 0.7);
    r = mix(r, 0.42, bare); g = mix(g, 0.43, bare); b = mix(b, 0.44, bare);
    // 泥汚れ
    r = mix(r, 0.19, dirt * 0.5); g = mix(g, 0.155, dirt * 0.5); b = mix(b, 0.11, dirt * 0.5);

    o.r = r; o.g = g; o.b = b;
    o.h = dent * 0.5 + orange * 0.1 - chip * 0.4;
    o.rough = clamp01(mix(0.42 + orange * 0.1, 0.62, bare) + dirt * 0.22);
    o.metal = clamp01(bare * 0.95);
    o.ao = clamp01(0.9 - chip * 0.3);
  },

  /* --- ヘアライン加工金属（アルミ） --- */
  brushedMetal(u, v, o, S) {
    const lines = valueNoise(u * 220, v * 5, 220, S);
    const lines2 = valueNoise(u * 130, v * 3, 130, S + 5);
    const broad = fbmP(u * 5, v * 5, { octaves: 3, period: 5, seed: S + 9 });
    const smudge = fbm(u * 12, v * 12, { octaves: 4, period: 12, seed: S + 13 });

    const l = 0.55 + broad * 0.09 + lines * 0.05 - smudge * 0.04;
    o.r = l * 0.98; o.g = l * 0.99; o.b = l * 1.0;
    o.h = lines * 0.35 + lines2 * 0.2 + broad * 0.1;
    o.rough = clamp01(0.34 + lines * 0.16 + lines2 * 0.1 + smudge * 0.14);
    o.metal = 1;
    o.ao = 1;
  },

  /* --- 縞鋼板（チェッカープレート） --- */
  diamondPlate(u, v, o, S) {
    const N = 9;
    const gx = u * N, gy = v * N;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    // 各セルに2本の傾いたバー
    const dir = ((cx + cy) % 2) ? 1 : -1;
    const bar = (px, py, off) => {
      const t = (px * dir + py) * 0.7071 + off;
      const w = Math.abs(((t % 1) + 1) % 1 - 0.5);
      return smoothstep(0.34, 0.13, w);
    };
    const b = Math.max(bar(lx, ly, 0.25), 0);
    const inner = smoothstep(0.06, 0.2, lx) * smoothstep(0.06, 0.2, 1 - lx) *
                  smoothstep(0.06, 0.2, ly) * smoothstep(0.06, 0.2, 1 - ly);
    const stud = b * inner;

    const grain = fbm(u * 150, v * 150, { octaves: 3, period: 150, seed: S });
    const wear = fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 7 });
    const l = 0.36 + stud * 0.2 + grain * 0.07 - wear * 0.06;
    o.r = l * 0.99; o.g = l; o.b = l * 1.02;
    o.h = stud * 0.9 + grain * 0.08;
    o.rough = clamp01(0.44 - stud * 0.14 + wear * 0.2 + grain * 0.08);
    o.metal = 1;
    o.ao = clamp01(0.72 + stud * 0.28);
  },

  /* --- 波板トタン --- */
  corrugated(u, v, o, S) {
    const wave = Math.sin(u * TAU * 5) * 0.5 + 0.5;
    const rib = Math.pow(wave, 0.7);
    const rust = smoothstep(0.5, 0.85, fbm(u * 6, v * 3, { octaves: 5, period: 6, seed: S }));
    const streak = smoothstep(0.4, 0.9, fbm(u * 10, v * 1.4, { octaves: 4, period: 10, seed: S + 9 }));
    const grain = fbm(u * 120, v * 120, { octaves: 3, period: 120, seed: S + 3 });

    const t = clamp01(rust * 0.8 + streak * 0.45);
    const base = 0.4 + rib * 0.16 + grain * 0.06;
    o.r = mix(base * 0.95, 0.33, t);
    o.g = mix(base * 0.97, 0.16, t);
    o.b = mix(base, 0.08, t);
    o.h = rib * 0.95 + grain * 0.05;
    o.rough = clamp01(mix(0.4, 0.9, t) + grain * 0.08);
    o.metal = clamp01(1 - t * 0.85);
    o.ao = clamp01(0.62 + rib * 0.38);
  },

  /* --- 木材（板・パレット） --- */
  wood(u, v, o, S) {
    const PLANKS = 5;
    const py = v * PLANKS;
    const pi = Math.floor(py);
    const ly = py - pi;
    const seam = smoothstep(0, 0.035, ly) * smoothstep(0, 0.035, 1 - ly);
    const off = ((pi * 37) % 100) / 100;

    // 年輪
    const [wu, wv] = warp(u * 3 + off * 5, py * 0.6, 0.6, { octaves: 3, period: 6, seed: S + pi });
    const rings = Math.abs(Math.sin((wu * 3.2 + wv * 0.35) * TAU * 2.4));
    const ring = Math.pow(rings, 0.42);
    const fiber = valueNoise(u * 420, py * 9, 420, S + pi * 3);
    const knotD = worley(u * 3.2, py * 1.1, 3, S + 77 + pi, 1).f1;
    const knot = smoothstep(0.24, 0.05, knotD);

    const tone = 0.5 + off * 0.32;
    let l = (0.2 + ring * 0.16 + fiber * 0.07) * (0.72 + tone * 0.5);
    l = mix(l, l * 0.42, knot);
    o.r = l * 1.06; o.g = l * 0.68; o.b = l * 0.40;
    o.h = ring * 0.35 + fiber * 0.3 + seam * 0.35 - knot * 0.25;
    o.rough = clamp01(0.72 + fiber * 0.16 - ring * 0.06);
    o.metal = 0;
    o.ao = clamp01(mix(0.35, 0.95, seam) - knot * 0.25);
  },

  /* --- 合板 / OSB --- */
  plywood(u, v, o, S) {
    const chips = worley(u * 9, v * 5, 9, S, 1);
    const dir = chips.id * TAU;
    const gu = u * Math.cos(dir) + v * Math.sin(dir);
    const grain = valueNoise(gu * 140, chips.id * 50, 140, S + 3);
    const glue = fbm(u * 7, v * 7, { octaves: 4, period: 7, seed: S + 11 });
    const edge = smoothstep(0.0, 0.05, chips.f2 - chips.f1);

    const tone = 0.5 + chips.id * 0.4;
    let l = (0.3 + grain * 0.13) * (0.7 + tone * 0.55) - glue * 0.05;
    l *= mix(0.72, 1, edge);
    o.r = l * 1.0; o.g = l * 0.79; o.b = l * 0.53;
    o.h = grain * 0.25 + edge * 0.45;
    o.rough = clamp01(0.78 + grain * 0.14);
    o.metal = 0;
    o.ao = clamp01(0.6 + edge * 0.4);
  },

  /* --- 土 / 乾いた地面 --- */
  dirt(u, v, o, S) {
    const broad = fbm(u * 4, v * 4, { octaves: 6, period: 4, seed: S });
    const fine = fbm(u * 70, v * 70, { octaves: 4, period: 70, seed: S + 7 });
    const peb = worley(u * 34, v * 34, 34, S + 13, 1);
    const pebble = smoothstep(0.16, 0.055, peb.f1);
    const crack = 1 - smoothstep(0, 0.012, voronoiEdge(u * 26, v * 26, 26, S + 23, 1));

    let l = 0.16 + broad * 0.11 + fine * 0.06;
    l = mix(l, 0.3 + peb.id * 0.16, pebble * 0.8);
    l -= crack * 0.025;
    o.r = l * 1.0; o.g = l * 0.79; o.b = l * 0.58;
    o.h = broad * 0.5 + fine * 0.2 + pebble * 0.4 - crack * 0.18;
    o.rough = clamp01(0.93 - pebble * 0.16 + fine * 0.05);
    o.metal = 0;
    o.ao = clamp01(0.68 + pebble * 0.25 - crack * 0.12);
  },

  /* --- 砂 --- */
  sand(u, v, o, S) {
    const dune = fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S });
    const ripple = Math.sin((v * 40 + fbm(u * 5, v * 5, { octaves: 3, period: 5, seed: S + 5 }) * 9) * TAU * 0.32) * 0.5 + 0.5;
    const grain = valueNoise(u * 190, v * 190, 190, S + 9);
    const l = 0.34 + dune * 0.085 + ripple * 0.045 + grain * 0.07;
    o.r = l * 1.0; o.g = l * 0.88; o.b = l * 0.67;
    o.h = dune * 0.5 + ripple * 0.35 + grain * 0.15;
    o.rough = clamp01(0.87 + grain * 0.1);
    o.metal = 0;
    o.ao = clamp01(0.85 + ripple * 0.15);
  },

  /* --- 砂利 --- */
  gravel(u, v, o, S) {
    const w1 = worley(u * 26, v * 26, 26, S, 1);
    const w2 = worley(u * 52, v * 52, 52, S + 31, 1);
    const big = smoothstep(0.2, 0.03, w1.f1);
    const small = smoothstep(0.11, 0.02, w2.f1);
    const grain = fbm(u * 160, v * 160, { octaves: 3, period: 160, seed: S + 7 });
    const id = big > small ? w1.id : w2.id;
    const stone = Math.max(big, small * 0.8);
    const l = mix(0.11, 0.24 + id * 0.24, stone) + grain * 0.05;
    o.r = l * 0.96; o.g = l * 0.98; o.b = l * 1.02;
    o.h = big * 0.7 + small * 0.4 + grain * 0.1;
    o.rough = clamp01(0.86 - stone * 0.12 + grain * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.5 + stone * 0.5);
  },

  /* --- 布（麻袋 / テント地） --- */
  fabric(u, v, o, S) {
    const N = 56;
    const wu = (u * N) % 1, wv = (v * N) % 1;
    const warpT = Math.sin(wu * Math.PI);
    const weftT = Math.sin(wv * Math.PI);
    const over = ((Math.floor(u * N) + Math.floor(v * N)) % 2) === 0;
    const weave = over ? warpT : weftT;
    const fuzz = fbm(u * 120, v * 120, { octaves: 3, period: 120, seed: S });
    const dirt = fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S + 11 });

    const l = (0.22 + weave * 0.1 + fuzz * 0.06) * (1 - dirt * 0.28);
    o.r = l * 1.0; o.g = l * 0.86; o.b = l * 0.62;
    o.h = weave * 0.6 + fuzz * 0.4;
    o.rough = clamp01(0.94 + fuzz * 0.06);
    o.metal = 0;
    o.ao = clamp01(0.6 + weave * 0.4);
  },

  /* --- 迷彩布（デジタルカモ） --- */
  camo(u, v, o, S) {
    const px = 26;
    const qu = Math.floor(u * px) / px, qv = Math.floor(v * px) / px;
    const n1 = fbmP(qu * 5, qv * 5, { octaves: 3, period: 5, seed: S });
    const n2 = fbmP(qu * 9, qv * 9, { octaves: 3, period: 9, seed: S + 17 });
    // 4色パレット (MultiCam 風)
    let r, g, b;
    if (n1 < 0.42) { r = 0.060; g = 0.098; b = 0.058; }
    else if (n1 < 0.56) { r = 0.185; g = 0.180; b = 0.098; }
    else if (n2 < 0.5) { r = 0.315; g = 0.270; b = 0.155; }
    else { r = 0.118; g = 0.104; b = 0.062; }

    const N = 60;
    const weave = Math.sin(((u * N) % 1) * Math.PI) * Math.sin(((v * N) % 1) * Math.PI);
    const fuzz = fbm(u * 110, v * 110, { octaves: 3, period: 110, seed: S + 5 });
    const sh = 0.82 + weave * 0.18 + fuzz * 0.1;
    o.r = r * sh; o.g = g * sh; o.b = b * sh;
    o.h = weave * 0.5 + fuzz * 0.5;
    o.rough = clamp01(0.9 + fuzz * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.72 + weave * 0.28);
  },

  /* --- ゴム（タイヤ / グリップ） --- */
  rubber(u, v, o, S) {
    const grain = fbm(u * 110, v * 110, { octaves: 4, period: 110, seed: S });
    const mold = fbm(u * 12, v * 12, { octaves: 3, period: 12, seed: S + 7 });
    const l = 0.035 + grain * 0.03 + mold * 0.018;
    o.r = l; o.g = l * 1.01; o.b = l * 1.03;
    o.h = grain * 0.6 + mold * 0.4;
    o.rough = clamp01(0.88 + grain * 0.1 - mold * 0.05);
    o.metal = 0;
    o.ao = clamp01(0.88 + mold * 0.12);
  },

  /* --- タイヤトレッド --- */
  tireTread(u, v, o, S) {
    /*
     * v をタイヤの幅方向、u を周方向とする。
     *
     * 以前は格子状のブロックを並べていただけで、
     * 黒いレンガ壁にしか見えなかった。実物のトレッドは
     *   ・幅方向に走る太い主溝（2 本）
     *   ・斜めに傾いたラグ（進行方向に対して角度が付く）
     *   ・ラグを横切る細かいサイプ（切れ込み）
     *   ・両肩の丸いショルダー
     * で出来ている。斜めの向きと溝の深さの差が「タイヤらしさ」を作る。
     */
    const w = Math.abs(v - 0.5) * 2;              // 0=中央 1=肩
    // 主溝（中央寄りに 2 本）
    const rib = Math.abs(Math.abs(v - 0.5) - 0.23);
    const mainGroove = 1 - smoothstep(0.020, 0.055, rib);
    // ラグ（斜めに傾いたブロック）。肩側ほど角度が寝る
    const skew = (v - 0.5) * 1.6;
    const lug = Math.abs((((u + skew) * 22) % 1) - 0.5);
    const lugGroove = 1 - smoothstep(0.30, 0.42, lug);
    // サイプ（ラグを横切る細い切れ込み）
    const sipe = 1 - smoothstep(0.06, 0.13, Math.abs((((u + skew) * 22 + 0.5) % 1) - 0.5));
    // ショルダーは丸く落ちる
    const shoulder = smoothstep(0.74, 1.0, w);

    const groove = clamp01(mainGroove + lugGroove * 0.85 + sipe * 0.45);
    const tread = 1 - groove;
    const grain = fbm(u * 130, v * 130, { octaves: 3, period: 130, seed: S });
    const wear = smoothstep(0.55, 0.95, fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 17 }));
    // 泥や埃が溝に溜まる
    const dirt = groove * smoothstep(0.4, 0.9, fbm(u * 9, v * 9, { octaves: 4, period: 9, seed: S + 41 }));

    let l = 0.026 + tread * 0.026 + grain * 0.016 - shoulder * 0.004;
    l = mix(l, l * 1.9, dirt * 0.5);
    o.r = l * (1 + dirt * 0.35); o.g = l * (1.02 + dirt * 0.12); o.b = l * 1.04;
    o.h = tread * 0.9 - mainGroove * 0.35 + grain * 0.06 - shoulder * 0.25;
    // 走行面は摩耗して少し光る、溝の中は艶がない
    o.rough = clamp01(0.94 - tread * wear * 0.22 + groove * 0.04);
    o.metal = 0;
    o.ao = clamp01(0.40 + tread * 0.60 - dirt * 0.1);
  },

  /* --- セラミックタイル --- */
  tile(u, v, o, S) {
    const N = 10;
    const gx = u * N, gy = v * N;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const G = 0.045;
    const inside = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx) *
                   smoothstep(0, G, ly) * smoothstep(0, G, 1 - ly);
    const id = ((cx * 31 + cy * 57) % 71) / 71;
    const glaze = fbm(u * 60, v * 60, { octaves: 3, period: 60, seed: S + cx + cy * 7 });
    const dirtG = fbm(u * 30, v * 30, { octaves: 4, period: 30, seed: S + 21 });
    const crack = smoothstep(0.9, 1.0, ridged(u * 30, v * 30, { octaves: 3, period: 30, seed: S + cx * 13 })) * (id > 0.85 ? 1 : 0);

    const tileL = 0.36 + id * 0.075 + glaze * 0.045;
    const groutL = 0.20 + dirtG * 0.085;
    const l = mix(groutL, tileL, inside);
    o.r = l * 0.955; o.g = l * 0.985; o.b = l * 1.0;
    o.h = inside * 0.85 - crack * 0.3;
    o.rough = clamp01(mix(0.9, 0.16 + glaze * 0.1 + crack * 0.4, inside));
    o.metal = 0;
    o.ao = clamp01(mix(0.5, 0.98, inside));
  },

  /* --- 汚れたガラス --- */
  dirtyGlass(u, v, o, S) {
    const smear = fbm(u * 5, v * 5, { octaves: 5, period: 5, seed: S });
    const drop = smoothstep(0.72, 0.95, fbm(u * 26, v * 26, { octaves: 3, period: 26, seed: S + 9 }));
    const dust = fbm(u * 120, v * 120, { octaves: 3, period: 120, seed: S + 17 });
    const l = 0.62 + smear * 0.1;
    o.r = l * 0.92; o.g = l * 0.97; o.b = l * 0.99;
    o.h = drop * 0.5 + smear * 0.3 + dust * 0.2;
    o.rough = clamp01(0.05 + smear * 0.22 + drop * 0.4 + dust * 0.12);
    o.metal = 0;
    o.ao = 1;
  },

  /* --- ガンメタル（武器本体） --- */
  gunMetal(u, v, o, S) {
    const micro = fbm(u * 26, v * 26, { octaves: 3, period: 26, seed: S });
    const machine = valueNoise(u * 48, v * 5, 48, S + 3);
    const wear = smoothstep(0.62, 0.95, fbm(u * 9, v * 9, { octaves: 5, period: 9, seed: S + 11 }));
    const edge = smoothstep(0.88, 1.0, ridged(u * 12, v * 12, { octaves: 3, period: 12, seed: S + 19 }));

    const base = 0.048 + micro * 0.026 + machine * 0.014;
    const l = mix(base, 0.34, clamp01(wear * 0.55 + edge * 0.4));
    o.r = l * 1.0; o.g = l * 1.01; o.b = l * 1.04;
    o.h = machine * 0.35 + micro * 0.35 + edge * 0.3;
    o.rough = clamp01(0.44 + micro * 0.16 - wear * 0.18);
    o.metal = 1;
    o.ao = clamp01(0.9 + micro * 0.1);
  },

  /* --- ポリマーグリップ（武器樹脂部） --- */
  polymer(u, v, o, S) {
    const N = 26;
    const gx = (u * N) % 1, gy = (v * N) % 1;
    const stipple = smoothstep(0.55, 0.2, Math.hypot(gx - 0.5, gy - 0.5));
    const micro = fbm(u * 40, v * 40, { octaves: 3, period: 40, seed: S });
    const wear = fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 7 });
    const l = 0.045 + stipple * 0.028 + micro * 0.018 + wear * 0.012;
    o.r = l * 1.0; o.g = l * 1.0; o.b = l * 0.98;
    o.h = stipple * 0.8 + micro * 0.2;
    o.rough = clamp01(0.72 - stipple * 0.12 + micro * 0.1);
    o.metal = 0;
    o.ao = clamp01(0.75 + stipple * 0.25);
  },

  /* --- 石壁 / 岩 --- */
  rock(u, v, o, S) {
    const [wu, wv] = warp(u * 4, v * 4, 1.1, { octaves: 4, period: 4, seed: S });
    const base = ridged(wu, wv, { octaves: 6, period: 4, seed: S + 3 });
    const strata = Math.sin((v * 7 + fbm(u * 3, v * 3, { octaves: 3, period: 3, seed: S + 9 }) * 3) * TAU) * 0.5 + 0.5;
    const grain = fbm(u * 110, v * 110, { octaves: 3, period: 110, seed: S + 13 });
    const l = 0.19 + base * 0.16 + strata * 0.05 + grain * 0.06;
    o.r = l * 0.99; o.g = l * 0.975; o.b = l * 0.945;
    o.h = base * 0.7 + strata * 0.2 + grain * 0.1;
    o.rough = clamp01(0.88 + grain * 0.08 - base * 0.06);
    o.metal = 0;
    o.ao = clamp01(0.45 + base * 0.5);
  },

  /* --- 漆喰 / 石膏 --- */
  plaster(u, v, o, S) {
    const trowel = fbmP(u * 6, v * 6, { octaves: 5, period: 6, seed: S });
    const micro = fbm(u * 240, v * 240, { octaves: 3, period: 240, seed: S + 5 });
    const crack = (1 - smoothstep(0, 0.010, voronoiEdge(u * 9, v * 9, 9, S + 29, 1)))
      * smoothstep(0.55, 0.8, fbm(u * 3, v * 3, { octaves: 3, period: 3, seed: S + 77 }));
    const patch = smoothstep(0.55, 0.85, fbm(u * 3, v * 3, { octaves: 4, period: 3, seed: S + 41 }));
    /*
     * 明度 0.42 は「日向で白飛びする」値だった。
     * ACES のトーンカーブは上端で強く圧縮するため、そこまで持ち上がると
     * 表面の凹凸が全部つぶれて真っ白な板に見える。
     * 実際の日焼けした漆喰の反射率（0.28〜0.35 程度）へ落とし、
     * 砂漠の建物らしい暖色を与える。
     */
    let l = 0.30 + trowel * 0.070 + micro * 0.034 - crack * 0.13 - patch * 0.040;
    o.r = l * 1.00; o.g = l * 0.955; o.b = l * 0.878;
    o.h = trowel * 0.6 + micro * 0.2 - crack * 0.6;
    o.rough = clamp01(0.8 + micro * 0.12 + crack * 0.1);
    o.metal = 0;
    o.ao = clamp01(0.88 - crack * 0.4);
  },

  /* --- 段ボール --- */
  cardboard(u, v, o, S) {
    const flute = Math.sin(u * TAU * 22) * 0.5 + 0.5;
    const fiber = fbm(u * 110, v * 110, { octaves: 3, period: 110, seed: S });
    const stain = fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 9 });
    const l = (0.3 + fiber * 0.09 + flute * 0.03) * (1 - stain * 0.22);
    o.r = l * 1.0; o.g = l * 0.79; o.b = l * 0.55;
    o.h = fiber * 0.6 + flute * 0.4;
    o.rough = clamp01(0.93 + fiber * 0.06);
    o.metal = 0;
    o.ao = clamp01(0.82 + flute * 0.18);
  },

  /* --- 石畳 / 舗装スラブ --- */
  paving(u, v, o, S) {
    const N = 5;
    // 目地をずらした矩形スラブ
    const row = Math.floor(v * N);
    const off = (row % 2) * 0.42;
    const gx = (u + off) * N, gy = v * N;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const G = 0.028;
    const inside = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx) *
                   smoothstep(0, G, ly) * smoothstep(0, G, 1 - ly);
    const id = ((cx * 41 + cy * 97) % 83) / 83;

    const grit = fbm(u * 130, v * 130, { octaves: 4, period: 130, seed: S + cx * 3 + cy * 7 });
    const wear = fbm(u * 7, v * 7, { octaves: 5, period: 7, seed: S + 19 });
    const chipD = worley(u * 40, v * 40, 40, S + 31 + cx, 1).f1;
    const chip = smoothstep(0.1, 0.03, chipD) * (1 - inside * 0.4);
    const moss = smoothstep(0.66, 0.92, fbm(u * 9, v * 9, { octaves: 4, period: 9, seed: S + 53 })) * (1 - inside);

    const slabL = 0.27 + id * 0.075 + grit * 0.055 - wear * 0.04;
    const jointL = 0.15 + grit * 0.06;
    let l = mix(jointL, slabL, inside) - chip * 0.06;
    let r = l * 1.0, g = l * 0.985, b = l * 0.95;
    // 目地の苔
    r = mix(r, l * 0.55, moss); g = mix(g, l * 0.78, moss); b = mix(b, l * 0.5, moss);

    o.r = r; o.g = g; o.b = b;
    o.h = inside * 0.8 + grit * 0.12 - chip * 0.35;
    o.rough = clamp01(mix(0.94, 0.8 + grit * 0.12 + wear * 0.06, inside));
    o.metal = 0;
    o.ao = clamp01(mix(0.42, 0.96, inside) - moss * 0.15);
  },

  /* --- 革（ホルスター・グリップ・装備） --- */
  leather(u, v, o, S) {
    // 皺のセル構造
    const [wu, wv] = warp(u * 30, v * 30, 0.9, { octaves: 3, period: 30, seed: S });
    const cell = worley(wu, wv, 30, S + 5, 1);
    const grainCell = smoothstep(0.0, 0.09, cell.f2 - cell.f1);
    const pore = fbm(u * 150, v * 150, { octaves: 3, period: 150, seed: S + 11 });
    const broad = fbmP(u * 4, v * 4, { octaves: 4, period: 4, seed: S + 17 });
    const scuff = smoothstep(0.68, 0.96, fbm(u * 11, v * 11, { octaves: 5, period: 11, seed: S + 23 }));

    const tone = 0.5 + broad * 0.28 + cell.id * 0.12;
    let l = (0.062 + tone * 0.075 + pore * 0.02) * (1 - grainCell * 0.22);
    l = mix(l, l * 1.5, scuff * 0.5);
    o.r = l * 1.0; o.g = l * 0.66; o.b = l * 0.46;
    o.h = grainCell * 0.55 + pore * 0.25 + broad * 0.2;
    o.rough = clamp01(0.62 + pore * 0.14 + grainCell * 0.12 - scuff * 0.16);
    o.metal = 0;
    o.ao = clamp01(0.62 + grainCell * 0.38);
  },

  /* --- 土嚢（サンドバッグ） --- */
  sandbag(u, v, o, S) {
    // 粗い麻織り + 中身の砂による膨らみ
    const N = 40;
    const wx = (u * N) % 1, wy = (v * N) % 1;
    const over = ((Math.floor(u * N) + Math.floor(v * N)) % 2) === 0;
    const weave = over ? Math.sin(wx * Math.PI) : Math.sin(wy * Math.PI);
    const thread = valueNoise(u * N * 2, v * N * 2, N * 2, S + 3);
    const bulge = fbmP(u * 6, v * 6, { octaves: 4, period: 6, seed: S });
    const fuzz = fbm(u * 120, v * 120, { octaves: 3, period: 120, seed: S + 9 });
    const dust = fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S + 21 });
    const stain = smoothstep(0.55, 0.95, dust);

    let l = (0.16 + weave * 0.075 + thread * 0.035 + bulge * 0.05 + fuzz * 0.03);
    l *= 1 - stain * 0.3;
    o.r = l * 1.0; o.g = l * 0.87; o.b = l * 0.63;
    o.h = weave * 0.4 + bulge * 0.42 + fuzz * 0.18;
    o.rough = clamp01(0.93 + fuzz * 0.06 - bulge * 0.04);
    o.metal = 0;
    o.ao = clamp01(0.55 + weave * 0.25 + bulge * 0.2);
  },

  /* --- カーボンファイバー（平織り） --- */
  carbon(u, v, o, S) {
    const N = 34;
    const gx = u * N, gy = v * N;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    // 2x2 の綾織パターン
    const warpUp = ((cx + cy) % 2) === 0;
    // 束の中の細いフィラメント
    const fil = warpUp
      ? Math.sin(lx * Math.PI * 9) * 0.5 + 0.5
      : Math.sin(ly * Math.PI * 9) * 0.5 + 0.5;
    const tow = warpUp ? Math.sin(ly * Math.PI) : Math.sin(lx * Math.PI);
    const sheen = warpUp ? 1.0 : 0.72;

    const clear = fbm(u * 90, v * 90, { octaves: 3, period: 90, seed: S }); // クリア層の微細な揺らぎ
    const l = (0.018 + tow * 0.028 + fil * 0.012) * sheen + clear * 0.006;
    o.r = l * 0.97; o.g = l * 1.0; o.b = l * 1.08;
    o.h = tow * 0.6 + fil * 0.3 + clear * 0.1;
    // クリアコートで全体に低ラフネス、束の向きで異方性を疑似再現
    o.rough = clamp01(0.16 + (1 - tow) * 0.12 + fil * 0.05);
    o.metal = 0.12;
    o.ao = clamp01(0.72 + tow * 0.28);
  },

  /* --- アルミ板（磨き / 微細ヘアライン） --- */
  aluminum(u, v, o, S) {
    const micro = valueNoise(u * 200, v * 9, 200, S);
    const swirl = fbmP(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 7 });
    const dent = fbmP(u * 3, v * 3, { octaves: 3, period: 3, seed: S + 13 });
    const smudge = smoothstep(0.55, 0.92, fbm(u * 14, v * 14, { octaves: 4, period: 14, seed: S + 19 }));

    const l = 0.62 + swirl * 0.042 + micro * 0.026 + dent * 0.026;
    o.r = l * 0.97; o.g = l * 0.985; o.b = l * 1.0;
    o.h = micro * 0.35 + dent * 0.5 + swirl * 0.15;
    o.rough = clamp01(0.26 + micro * 0.09 + smudge * 0.24 + swirl * 0.05);
    o.metal = 1;
    o.ao = 1;
  },

  /* --- 発光パネル（LED / 非常灯の面光源） --- */
  emissivePanel(u, v, o, S) {
    const N = 26;
    const band = Math.abs(((v * N) % 1) - 0.5) * 2;
    const diff = smoothstep(0.9, 0.25, band);          // 拡散板のリブ
    const grid = smoothstep(0.02, 0.06, Math.min(((u * 7) % 1), 1 - ((u * 7) % 1)));
    const dust = fbm(u * 60, v * 60, { octaves: 3, period: 60, seed: S });

    const l = 0.55 + diff * 0.3 + dust * 0.05;
    o.r = l * 0.72; o.g = l * 0.9; o.b = l * 1.0;
    o.h = diff * 0.55 + (1 - grid) * 0.45;
    o.rough = clamp01(0.28 + dust * 0.12);
    o.metal = 0;
    o.ao = clamp01(0.82 + grid * 0.18);
  },

  /* --- 発光パネル / 非常灯まわりの塗装 --- */
  hazardStripe(u, v, o, S) {
    const s = ((u * 6 + v * 6) % 1);
    const stripe = smoothstep(0.48, 0.52, s);
    const wear = fbm(u * 14, v * 14, { octaves: 5, period: 14, seed: S });
    const chip = smoothstep(0.09, 0.02, worley(u * 26, v * 26, 26, S + 11, 1).f1);
    let r = mix(0.55, 0.035, stripe), g = mix(0.4, 0.035, stripe), b = mix(0.02, 0.035, stripe);
    const sh = 1 - wear * 0.3;
    r *= sh; g *= sh; b *= sh;
    r = mix(r, 0.3, chip); g = mix(g, 0.3, chip); b = mix(b, 0.31, chip);
    o.r = r; o.g = g; o.b = b;
    o.h = wear * 0.4 - chip * 0.5;
    o.rough = clamp01(0.55 + wear * 0.3);
    o.metal = clamp01(chip * 0.8);
    o.ao = clamp01(0.9 - chip * 0.2);
  },

  /* ================================================================
   *  以下は追加マップ（工事現場・マンション・博物館・街中・鉄道駅）
   *  のために足したもの。
   *  明度はどれも 0.5 を超えないようにしてある。ACES のトーンカーブは
   *  上端を強く圧縮するので、そこまで持ち上げると日向で凹凸が全部
   *  つぶれて真っ白な板に見える（漆喰で一度やらかしている）。
   * ================================================================ */

  /* --- 磨き大理石（博物館・駅コンコース） --- */
  marble(u, v, o, S) {
    // 葉脈状の模様はドメインワープした fbm を細く絞ると出る
    const [wx, wy] = warp(u * 2.2, v * 2.2, 0.85, { octaves: 4, period: 2.2, seed: S });
    const vein = 1 - smoothstep(0.0, 0.055, Math.abs(fbmP(wx, wy, { octaves: 5, period: 2.2, seed: S + 3 }) - 0.5));
    const vein2 = 1 - smoothstep(0.0, 0.022, Math.abs(fbmP(wx * 2.3, wy * 2.3, { octaves: 4, period: 5.06, seed: S + 17 }) - 0.5));
    const cloud = fbm(u * 3.5, v * 3.5, { octaves: 5, period: 3.5, seed: S + 31 });
    const grain = valueNoise(u * 300, v * 300, 300, S + 47);
    // 研磨面の細かなうねり（映り込みが完全な鏡にならない理由）
    const polish = fbm(u * 18, v * 18, { octaves: 3, period: 18, seed: S + 53 });

    let l = 0.40 + cloud * 0.055 + grain * 0.012;
    l -= vein * 0.115 + vein2 * 0.07;
    o.r = l * 1.0; o.g = l * 0.985; o.b = l * 0.955;
    o.h = -vein * 0.15 + cloud * 0.1;
    o.rough = clamp01(0.09 + polish * 0.07 + vein * 0.12);
    o.metal = 0;
    o.ao = clamp01(0.97 - vein * 0.06);
  },

  /* --- テラゾー（研ぎ出し人造石。駅・公共建築の床） --- */
  terrazzo(u, v, o, S) {
    // 大小の骨材を 3 層重ねる。粒径が揃うと途端に嘘くさくなる
    const c1 = worley(u * 26, v * 26, 26, S, 1);
    const c2 = worley(u * 46, v * 46, 46, S + 11, 1);
    const c3 = worley(u * 78, v * 78, 78, S + 23, 1);
    const chipA = smoothstep(0.30, 0.16, c1.f1);
    const chipB = smoothstep(0.20, 0.11, c2.f1);
    const chipC = smoothstep(0.13, 0.07, c3.f1);
    const idA = hash01(u, v, 26, S);
    const idB = hash01(u, v, 46, S + 11);

    const base = 0.34 + fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 5 }) * 0.03;
    let r = base, g = base * 0.995, b = base * 0.975;
    // 骨材ごとに色を振る（灰・黒・赤茶・白）
    if (chipA > 0) {
      const t = idA;
      const cr = t < 0.3 ? 0.16 : t < 0.6 ? 0.30 : t < 0.85 ? 0.26 : 0.44;
      const cg = t < 0.3 ? 0.16 : t < 0.6 ? 0.30 : t < 0.85 ? 0.17 : 0.43;
      const cb = t < 0.3 ? 0.17 : t < 0.6 ? 0.29 : t < 0.85 ? 0.13 : 0.41;
      r = mix(r, cr, chipA); g = mix(g, cg, chipA); b = mix(b, cb, chipA);
    }
    if (chipB > 0) {
      const t = idB;
      const c = t < 0.5 ? 0.20 : 0.40;
      r = mix(r, c, chipB * 0.9); g = mix(g, c * 0.99, chipB * 0.9); b = mix(b, c * 0.97, chipB * 0.9);
    }
    r = mix(r, 0.42, chipC * 0.5); g = mix(g, 0.42, chipC * 0.5); b = mix(b, 0.40, chipC * 0.5);

    const buff = fbm(u * 40, v * 40, { octaves: 3, period: 40, seed: S + 61 });
    o.r = r; o.g = g; o.b = b;
    // 研ぎ出しなので骨材と地の段差はほぼ無い
    o.h = (chipA + chipB) * 0.06 + buff * 0.05;
    o.rough = clamp01(0.16 + buff * 0.09);
    o.metal = 0;
    o.ao = 0.98;
  },

  /* --- フローリング（マンション住戸） --- */
  woodFloor(u, v, o, S) {
    /*
     * 板は「幅の 10 倍以上の長さ」がないとフローリングに見えず、
     * 木レンガを敷いたような見た目になる。
     * repeat 0.85（1 タイル ≒ 1.18m）と合わせて
     * 板幅 98mm / 板長 1.0m 相当にしてある。
     */
    const ROWS = 12;         // 幅方向の板数
    const row = Math.floor(v * ROWS);
    // 板ごとに継ぎ目の位置をずらす（乱尺張り）
    const shift = ((row * 37) % 100) / 100;
    const LEN = 1.15;        // 1 行あたりの板の枚数
    const gx = (u + shift) * LEN;
    const col = Math.floor(gx);
    const lx = gx - col, ly = v * ROWS - row;

    const G = 0.012;
    const seam = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx)
               * smoothstep(0, G * LEN / ROWS * 3, ly) * smoothstep(0, G * LEN / ROWS * 3, 1 - ly);
    const id = ((col * 71 + row * 131) % 97) / 97;

    /*
     * 木目は板の長手方向（u）に沿って走る。
     * 幅方向（ly）に細かく、長手方向にはゆっくり変化させないと
     * 横縞になってしまい、板ではなく縞模様の板材に見える。
     */
    const grain = fbm((u + id * 4) * 9, (v + id * 6) * 230, { octaves: 4, period: 230, seed: S + col * 7 + row * 13 });
    const sway = fbm((u + id) * 3, v * 20, { octaves: 3, period: 20, seed: S + col * 3 });
    const ring = Math.abs(Math.sin((ly * 5.5 + sway * 2.6 + id * 11) * Math.PI));
    const knot = smoothstep(0.93, 0.995, fbm((u + id * 2) * 16, v * 16, { octaves: 3, period: 16, seed: S + 41 }));

    let l = 0.24 + id * 0.05 + ring * 0.055 + grain * 0.03 - knot * 0.10;
    l = mix(l * 0.42, l, seam);                      // 継ぎ目は影
    o.r = l * 1.0; o.g = l * 0.71; o.b = l * 0.44;
    o.h = seam * 0.8 + ring * 0.12 + grain * 0.1 - knot * 0.25;
    // ウレタン塗装なのでかなり滑らか。歩行帯だけ曇る
    const traffic = smoothstep(0.55, 0.95, fbm(u * 3, v * 3, { octaves: 4, period: 3, seed: S + 83 }));
    o.rough = clamp01(0.22 + traffic * 0.22 + knot * 0.2);
    o.metal = 0;
    o.ao = clamp01(mix(0.55, 0.99, seam));
  },

  /* --- カーペット（マンション共用廊下・博物館） --- */
  carpet(u, v, o, S) {
    // ループパイルの粒
    const pile = valueNoise(u * 420, v * 420, 420, S);
    const pile2 = valueNoise(u * 190, v * 190, 190, S + 7);
    // 織りの筋
    const weft = Math.sin(v * TAU * 150) * 0.5 + 0.5;
    const warpL = Math.sin(u * TAU * 150) * 0.5 + 0.5;
    const blotch = fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S + 19 });
    const stain = smoothstep(0.70, 0.95, fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 37 }));

    const l = 0.15 + pile * 0.045 + pile2 * 0.03 + blotch * 0.028
      + (weft * warpL) * 0.012 - stain * 0.035;
    o.r = l * 0.86; o.g = l * 0.80; o.b = l * 0.90;   // やや紫がかった灰
    o.h = pile * 0.55 + pile2 * 0.3 + weft * 0.1;
    o.rough = clamp01(0.95 + pile * 0.05);
    o.metal = 0;
    o.ao = clamp01(0.7 + pile2 * 0.3 - stain * 0.1);
  },

  /* --- ビニールクロス（住戸の内壁） --- */
  wallpaper(u, v, o, S) {
    // 石目調エンボスの細かい凹凸
    const emboss = worley(u * 150, v * 150, 150, S, 1).f1;
    const emb = smoothstep(0.0, 0.35, emboss);
    const micro = valueNoise(u * 400, v * 400, 400, S + 3);
    // 継ぎ目（幅 92cm のクロスを想定 → タイル内に約 3 本）
    const seamX = Math.abs(((u * 3) % 1) - 0.5);
    const seam = 1 - smoothstep(0.0, 0.008, seamX);
    const yellow = fbm(u * 2, v * 2, { octaves: 4, period: 2, seed: S + 29 });   // 経年の黄ばみ
    const scuff = smoothstep(0.72, 0.96, fbm(u * 10, v * 4, { octaves: 4, period: 10, seed: S + 53 }))
      * smoothstep(0.45, 0.0, v);                     // 下部ほど汚れる

    let l = 0.36 + emb * 0.022 + micro * 0.012 - seam * 0.05 - scuff * 0.055;
    o.r = l * 1.0; o.g = l * (0.985 - yellow * 0.02); o.b = l * (0.945 - yellow * 0.055);
    o.h = emb * 0.5 + micro * 0.2 - seam * 0.8;
    o.rough = clamp01(0.72 + emb * 0.12 + scuff * 0.1);
    o.metal = 0;
    o.ao = clamp01(0.92 - seam * 0.25);
  },

  /* --- 小口タイル（駅の壁・浴室） --- */
  ceramicTile(u, v, o, S) {
    const NX = 9, NY = 26;                             // 108×45mm 相当の横長
    const gx = u * NX, gy = v * NY;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const G = 0.07;
    const inside = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx)
                 * smoothstep(0, G * NX / NY, ly) * smoothstep(0, G * NX / NY, 1 - ly);
    const id = ((cx * 53 + cy * 29) % 61) / 61;
    // 施釉のムラ
    const glaze = fbm((u + id) * 70, (v + id) * 70, { octaves: 3, period: 70, seed: S + cx + cy * 5 });
    // 目地の汚れは下ほど濃い
    const groutDirt = fbm(u * 25, v * 25, { octaves: 4, period: 25, seed: S + 13 }) * (0.4 + v * 0.6);
    const crack = smoothstep(0.93, 1.0, ridged(u * 40, v * 40, { octaves: 3, period: 40, seed: S + cx * 7 })) * (id > 0.92 ? 1 : 0);

    const tileL = 0.40 + id * 0.03 + glaze * 0.035;
    const groutL = 0.24 - groutDirt * 0.08;
    const l = mix(groutL, tileL, inside);
    o.r = l * 0.98; o.g = l * 0.995; o.b = l * 0.98;
    o.h = inside * 0.9 - crack * 0.3;
    o.rough = clamp01(mix(0.88, 0.10 + glaze * 0.08 + crack * 0.4, inside));
    o.metal = 0;
    o.ao = clamp01(mix(0.42, 0.99, inside));
  },

  /* --- 点字ブロック（駅ホーム・歩道） --- */
  tactilePaving(u, v, o, S) {
    // 300mm 角に 5×5 の点（警告ブロック）
    const N = 3.3333;                                  // 1m あたり 3.33 枚 = 300mm
    const gx = u * N, gy = v * N;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const G = 0.03;
    const plate = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx)
                * smoothstep(0, G, ly) * smoothstep(0, G, 1 - ly);
    // 点の格子
    const dx = ((lx * 5) % 1) - 0.5, dy = ((ly * 5) % 1) - 0.5;
    const dr = Math.hypot(dx, dy);
    const dot = smoothstep(0.30, 0.20, dr) * plate;

    const wear = fbm(u * 14, v * 14, { octaves: 5, period: 14, seed: S });
    const grime = smoothstep(0.55, 0.9, fbm(u * 7, v * 7, { octaves: 4, period: 7, seed: S + 23 }));
    // 黄色。踏まれる点の頭は色が抜ける
    let l = 0.38 - wear * 0.05 - grime * 0.07;
    let r = l * 1.0, g = l * 0.80, b = l * 0.14;
    const rub = dot * smoothstep(0.4, 0.9, wear);
    r = mix(r, l * 0.72, rub); g = mix(g, l * 0.68, rub); b = mix(b, l * 0.5, rub);
    // 目地
    r = mix(r * 0.5, r, plate); g = mix(g * 0.5, g, plate); b = mix(b * 0.55, b, plate);

    o.r = r; o.g = g; o.b = b;
    o.h = plate * 0.3 + dot * 0.7;
    o.rough = clamp01(0.68 + wear * 0.2 - rub * 0.18);
    o.metal = 0;
    o.ao = clamp01(mix(0.5, 0.95, plate) - (1 - dot) * 0.05);
  },

  /* --- 白線入りアスファルト（車道） --- */
  roadMarking(u, v, o, S) {
    /*
     * 骨材は細かく。
     * 1 タイルが 7.7m もあるので、粒を大きく取ると
     * 一粒が 10cm を超えて砂利道に見えてしまう。
     */
    const grit = worley(u * 130, v * 130, 130, S, 1).f1;
    const stone = smoothstep(0.20, 0.05, grit);
    const grit2 = smoothstep(0.16, 0.04, worley(u * 260, v * 260, 260, S + 5, 1).f1);
    const bind = fbm(u * 9, v * 9, { octaves: 5, period: 9, seed: S + 7 });
    const crack = (1 - smoothstep(0, 0.012, voronoiEdge(u * 6, v * 6, 6, S + 19, 1)))
      * smoothstep(0.55, 0.85, fbm(u * 3, v * 3, { octaves: 3, period: 3, seed: S + 67 }));

    let l = 0.068 + bind * 0.026 + stone * 0.011 + grit2 * 0.007 - crack * 0.025;
    let r = l, g = l * 1.005, b = l * 1.02;

    // 中央に破線（進行方向 = v）。実寸で 5m 塗って 5m 空けるくらい
    const lineX = Math.abs(u - 0.5);
    const dash = smoothstep(0.06, 0.12, ((v * 1.5) % 1)) * (1 - smoothstep(0.52, 0.58, ((v * 1.5) % 1)));
    const paint = (1 - smoothstep(0.014, 0.022, lineX)) * dash;
    // 塗料は擦り減って下地が透ける
    const worn = smoothstep(0.35, 0.85, fbm(u * 30, v * 12, { octaves: 4, period: 30, seed: S + 91 }));
    const pm = paint * (1 - worn * 0.55);
    r = mix(r, 0.46, pm); g = mix(g, 0.455, pm); b = mix(b, 0.43, pm);

    o.r = r; o.g = g; o.b = b;
    o.h = stone * 0.35 + grit2 * 0.25 + bind * 0.2 - crack * 0.5 + pm * 0.15;
    o.rough = clamp01(0.88 + stone * 0.1 - pm * 0.2);
    o.metal = 0;
    o.ao = clamp01(0.85 - crack * 0.4);
  },

  /* --- 道床バラスト（線路の砕石） --- */
  ballast(u, v, o, S) {
    const c1 = worley(u * 15, v * 15, 15, S, 1);
    const c2 = worley(u * 27, v * 27, 27, S + 9, 1);
    const edge = smoothstep(0.0, 0.05, voronoiEdge(u * 15, v * 15, 15, S, 1));
    const id = hash01(u, v, 15, S);
    // 割石なので面が平ら。f2-f1 で「面」を作る
    const facet = clamp01((c1.f2 - c1.f1) * 2.2);
    const grit = valueNoise(u * 260, v * 260, 260, S + 31);
    const oil = smoothstep(0.62, 0.92, fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 47 }));

    let l = 0.17 + id * 0.075 + facet * 0.05 + grit * 0.025;
    l = mix(l * 0.35, l, edge);                        // 石と石の間は暗い
    l *= 1 - oil * 0.3;                                // 油と鉄粉で黒ずむ
    o.r = l * 1.0; o.g = l * 0.975; o.b = l * 0.94;
    o.h = mix(0.0, 0.45 + facet * 0.55, edge) + smoothstep(0.35, 0.1, c2.f1) * 0.12;
    o.rough = clamp01(0.9 + grit * 0.09 - oil * 0.12);
    o.metal = 0;
    o.ao = clamp01(mix(0.25, 0.95, edge));
  },

  /* --- レール鋼（頭頂部だけ磨かれている） --- */
  railSteel(u, v, o, S) {
    // v が断面方向。中央（レール頭頂）だけ列車に磨かれて鏡面になる
    const crown = 1 - smoothstep(0.10, 0.34, Math.abs(v - 0.5));
    const rust = fbm(u * 7, v * 12, { octaves: 5, period: 7, seed: S });
    const pit = smoothstep(0.18, 0.06, worley(u * 40, v * 40, 40, S + 13, 1).f1);
    const roll = valueNoise(u * 200, v * 9, 200, S + 5);   // 圧延の筋

    const rustL = 0.10 + rust * 0.075 + pit * 0.02;
    const shineL = 0.34 + roll * 0.05;
    const l = mix(rustL, shineL, crown);
    o.r = l * mix(1.0, 0.99, crown);
    o.g = l * mix(0.62, 0.99, crown);
    o.b = l * mix(0.42, 1.0, crown);
    o.h = roll * 0.2 - pit * 0.5 + (1 - crown) * 0.15;
    o.rough = clamp01(mix(0.82 + rust * 0.15, 0.10 + roll * 0.05, crown));
    o.metal = clamp01(mix(0.45, 1.0, crown) - pit * 0.2);
    o.ao = clamp01(0.9 - pit * 0.3);
  },

  /* --- 鉄筋（工事現場） --- */
  rebar(u, v, o, S) {
    // 竹節状のリブ。u を軸方向とする
    const ribA = Math.abs(Math.sin((u * 16 + v * 2.2) * Math.PI));
    const ribB = Math.abs(Math.sin((u * 16 - v * 2.2) * Math.PI));
    const rib = Math.max(smoothstep(0.80, 1.0, ribA), smoothstep(0.80, 1.0, ribB));
    const line = smoothstep(0.42, 0.5, Math.abs(v - 0.5)) * 0.0;    // 縦リブは省略
    const rust = fbm(u * 12, v * 12, { octaves: 5, period: 12, seed: S });
    const scale = smoothstep(0.55, 0.9, fbm(u * 4, v * 4, { octaves: 4, period: 4, seed: S + 17 }));

    let l = 0.115 + rust * 0.085 + rib * 0.03;
    o.r = l * 1.0; o.g = l * (0.66 - scale * 0.08); o.b = l * (0.45 - scale * 0.1);
    o.h = rib * 0.9 + rust * 0.15 + line;
    o.rough = clamp01(0.86 + rust * 0.12);
    o.metal = clamp01(0.55 - scale * 0.35);
    o.ao = clamp01(0.8 + rib * 0.2);
  },

  /* --- 亜鉛メッキ鋼（単管足場・ガードレール） --- */
  galvanized(u, v, o, S) {
    // スパングル（メッキの結晶模様）
    const cell = worley(u * 20, v * 20, 20, S, 1);
    const spangleId = hash01(u, v, 20, S);
    const edge = smoothstep(0.0, 0.035, voronoiEdge(u * 20, v * 20, 20, S, 1));
    const micro = valueNoise(u * 300, v * 300, 300, S + 11);
    const grime = fbm(u * 6, v * 6, { octaves: 5, period: 6, seed: S + 29 });
    const whiteRust = smoothstep(0.68, 0.93, fbm(u * 9, v * 9, { octaves: 4, period: 9, seed: S + 43 }));

    let l = 0.30 + spangleId * 0.055 + micro * 0.02 - (1 - edge) * 0.05;
    l *= 1 - grime * 0.22;
    let r = l * 0.98, g = l * 0.99, b = l * 1.0;
    // 白錆は艶が消えて粉っぽくなる
    r = mix(r, l * 1.05, whiteRust); g = mix(g, l * 1.05, whiteRust); b = mix(b, l * 1.03, whiteRust);
    o.r = r; o.g = g; o.b = b;
    o.h = micro * 0.3 + (1 - edge) * 0.2;
    o.rough = clamp01(0.30 + grime * 0.25 + whiteRust * 0.45 + (1 - edge) * 0.08);
    o.metal = clamp01(1.0 - whiteRust * 0.6);
    o.ao = clamp01(0.92 - (1 - edge) * 0.1);
  },

  /* --- 防炎シート / ブルーシート（工事現場） --- */
  tarp(u, v, o, S) {
    // 平織のクロス。糸の交差が見える
    const wx = Math.abs(Math.sin(u * TAU * 90));
    const wy = Math.abs(Math.sin(v * TAU * 90));
    const weave = wx > wy ? wx : wy;
    const over = wx > wy ? 1 : 0;                       // 上に乗っている糸
    const fold = fbm(u * 4, v * 4, { octaves: 4, period: 4, seed: S });
    const dust = smoothstep(0.5, 0.9, fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 21 }));
    const tear = smoothstep(0.94, 1.0, fbm(u * 16, v * 16, { octaves: 3, period: 16, seed: S + 37 }));

    let l = 0.17 + weave * 0.035 + fold * 0.045 - dust * 0.05;
    o.r = l * (0.42 + dust * 0.35); o.g = l * (0.62 + dust * 0.2); o.b = l * 1.0;
    o.h = weave * 0.5 + over * 0.15 + fold * 0.35 - tear * 0.4;
    o.rough = clamp01(0.62 + dust * 0.28);
    o.metal = 0;
    o.ao = clamp01(0.8 + weave * 0.2 - tear * 0.2);
  },

  /* --- ベルベット（博物館の展示台・ロープ） --- */
  velvet(u, v, o, S) {
    const nap = valueNoise(u * 500, v * 500, 500, S);      // 起毛
    const nap2 = valueNoise(u * 160, v * 160, 160, S + 5);
    const sheen = fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 13 });
    const dust = smoothstep(0.75, 0.98, fbm(u * 10, v * 10, { octaves: 3, period: 10, seed: S + 31 }));

    const l = 0.085 + nap * 0.022 + nap2 * 0.018 + sheen * 0.03;
    o.r = l * 1.0; o.g = l * 0.30; o.b = l * 0.33;         // 深い臙脂
    o.h = nap * 0.35 + nap2 * 0.4;
    // 起毛は角度で表情が変わる。粗さを揺らして近い雰囲気を出す
    o.rough = clamp01(0.78 + nap2 * 0.18 - sheen * 0.14 + dust * 0.06);
    o.metal = 0;
    o.ao = clamp01(0.78 + nap2 * 0.22);
  },

  /* --- 磨き真鍮（博物館の手すり・額縁） --- */
  brassPolished(u, v, o, S) {
    const buff = valueNoise(u * 260, v * 14, 260, S);      // 研磨の目
    const swirl = fbm(u * 22, v * 22, { octaves: 3, period: 22, seed: S + 7 });
    // 緑青は「隅に少しだけ」。面積を広げると磨いた真鍮に見えなくなる
    const patina = smoothstep(0.86, 0.99, fbm(u * 6, v * 6, { octaves: 5, period: 6, seed: S + 23 }));
    const finger = smoothstep(0.80, 0.97, fbm(u * 13, v * 13, { octaves: 3, period: 13, seed: S + 41 }));

    let l = 0.44 + buff * 0.03 + swirl * 0.02;
    let r = l * 1.0, g = l * 0.80, b = l * 0.36;
    // 緑青は隅に溜まる
    r = mix(r, l * 0.36, patina); g = mix(g, l * 0.56, patina); b = mix(b, l * 0.46, patina);
    o.r = r; o.g = g; o.b = b;
    o.h = buff * 0.25 - patina * 0.3;
    o.rough = clamp01(0.13 + buff * 0.06 + patina * 0.6 + finger * 0.18);
    o.metal = clamp01(1.0 - patina * 0.45);
    o.ao = clamp01(0.95 - patina * 0.15);
  },

  /* --- 店舗シャッター（街中） --- */
  shutter(u, v, o, S) {
    // 水平のスラット。v が上下方向
    const p = (v * 26) % 1;
    const curve = Math.sin(p * Math.PI);                   // 断面のふくらみ
    const seam = smoothstep(0.0, 0.06, p) * smoothstep(0.0, 0.06, 1 - p);
    const paint = fbm(u * 8, v * 8, { octaves: 5, period: 8, seed: S });
    const scratch = smoothstep(0.86, 0.99, ridged(u * 3, v * 60, { octaves: 3, period: 60, seed: S + 11 }));
    const rust = smoothstep(0.72, 0.95, fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 29 }))
      * smoothstep(0.35, 0.0, v);                          // 下端から錆びる
    const dent = smoothstep(0.55, 0.9, fbm(u * 11, v * 11, { octaves: 3, period: 11, seed: S + 53 }));

    let l = (0.20 + curve * 0.055 + paint * 0.03) * seam;
    l = Math.max(l, 0.055);
    let r = l * 0.94, g = l * 0.97, b = l * 1.0;
    r = mix(r, l * 1.25, rust); g = mix(g, l * 0.78, rust); b = mix(b, l * 0.5, rust);
    r = mix(r, l * 1.35, scratch); g = mix(g, l * 1.35, scratch); b = mix(b, l * 1.38, scratch);
    o.r = r; o.g = g; o.b = b;
    o.h = curve * 0.75 + seam * 0.2 - dent * 0.12;
    o.rough = clamp01(0.42 + paint * 0.2 + rust * 0.45 - scratch * 0.25);
    o.metal = clamp01(0.75 - rust * 0.5 + scratch * 0.25);
    o.ao = clamp01(0.55 + seam * 0.45);
  },

  /* --- システム天井（屋内の見上げ） --- */
  ceilingPanel(u, v, o, S) {
    const N = 4;                                           // 600mm 角相当
    const gx = u * N, gy = v * N;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const G = 0.035;
    const inside = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx)
                 * smoothstep(0, G, ly) * smoothstep(0, G, 1 - ly);
    // 岩綿吸音板の孔
    const hole = smoothstep(0.16, 0.08, worley(u * 90, v * 90, 90, S + cx * 3 + cy * 7, 1).f1) * inside;
    const fiber = valueNoise(u * 340, v * 340, 340, S + 3);
    const stain = smoothstep(0.80, 0.98, fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 19 }));
    const id = ((cx * 17 + cy * 43) % 53) / 53;

    let l = 0.40 + id * 0.012 + fiber * 0.02 - hole * 0.16;
    l -= stain * 0.09;                                     // 雨漏り跡
    let r = l * 1.0, g = l * (0.99 - stain * 0.05), b = l * (0.965 - stain * 0.12);
    // T バーは金属
    const bar = 1 - inside;
    r = mix(r, 0.30, bar); g = mix(g, 0.305, bar); b = mix(b, 0.31, bar);
    o.r = r; o.g = g; o.b = b;
    o.h = inside * 0.5 - hole * 0.5;
    o.rough = clamp01(mix(0.35, 0.92 + fiber * 0.08, inside));
    o.metal = clamp01(bar * 0.8);
    o.ao = clamp01(mix(0.7, 0.95 - hole * 0.25, inside));
  },

  /* --- 型枠合板（コンパネ。工事現場） --- */
  formPly(u, v, o, S) {
    const grain = fbm(u * 100, v * 6, { octaves: 4, period: 100, seed: S });
    const ply = Math.abs(Math.sin(v * TAU * 1.5)) * 0.02;
    // 剥離剤とコンクリートのノロが残る
    const laitance = smoothstep(0.5, 0.9, fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S + 13 }));
    const nail = smoothstep(0.05, 0.0, worley(u * 7, v * 7, 7, S + 31, 1).f1);
    const edgeWear = smoothstep(0.42, 0.5, Math.abs(u - 0.5)) * 0.6;
    const stamp = smoothstep(0.88, 0.94, fbm(u * 2.5, v * 2.5, { octaves: 3, period: 2.5, seed: S + 61 }));

    let l = 0.235 + grain * 0.055 + ply - edgeWear * 0.05;
    let r = l * 1.0, g = l * 0.80, b = l * 0.52;
    // 表面に残るセメント分は白っぽい
    r = mix(r, l * 1.12, laitance); g = mix(g, l * 1.14, laitance); b = mix(b, l * 1.18, laitance);
    r = mix(r, l * 0.55, stamp * 0.7); g = mix(g, l * 0.5, stamp * 0.7); b = mix(b, l * 0.5, stamp * 0.7);
    o.r = r; o.g = g; o.b = b;
    o.h = grain * 0.3 - nail * 0.8 + laitance * 0.1;
    o.rough = clamp01(0.6 + laitance * 0.3 + edgeWear * 0.15);
    o.metal = 0;
    o.ao = clamp01(0.9 - nail * 0.4);
  },

  /* --- 御影石（外構・駅の腰壁） --- */
  granite(u, v, o, S) {
    const q = worley(u * 120, v * 120, 120, S, 1).f1;        // 石英
    const f = worley(u * 70, v * 70, 70, S + 11, 1).f1;      // 長石
    const m = worley(u * 190, v * 190, 190, S + 23, 1).f1;   // 黒雲母
    const quartz = smoothstep(0.13, 0.05, q);
    const feld = smoothstep(0.16, 0.07, f);
    const mica = smoothstep(0.07, 0.025, m);
    const base = 0.26 + fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 5 }) * 0.025;

    let r = base, g = base * 0.99, b = base * 0.975;
    r = mix(r, 0.40, feld * 0.8); g = mix(g, 0.385, feld * 0.8); b = mix(b, 0.365, feld * 0.8);
    r = mix(r, 0.34, quartz * 0.7); g = mix(g, 0.35, quartz * 0.7); b = mix(b, 0.36, quartz * 0.7);
    r = mix(r, 0.055, mica); g = mix(g, 0.055, mica); b = mix(b, 0.06, mica);

    // ジェットバーナー仕上げなら粗く、本磨きなら滑らか。中間の水磨き想定
    const rough = fbm(u * 45, v * 45, { octaves: 3, period: 45, seed: S + 37 });
    o.r = r; o.g = g; o.b = b;
    o.h = quartz * 0.15 + mica * 0.1 + rough * 0.2;
    o.rough = clamp01(0.28 + rough * 0.12 + mica * 0.25);
    o.metal = 0;
    o.ao = clamp01(0.96 - mica * 0.06);
  },
};

/*
 * 第 2 群を取り込む。
 * 定義がこのファイルだけで 1000 行を超えたので、武器の表面処理・
 * 被服・建材・小物は TextureDefs2.js に分けてある。
 */
Object.assign(DEFS, DEFS2);

/* ------------------------------------------------------------------ *
 *  生成エンジン
 * ------------------------------------------------------------------ */

export class TextureFactory {
  /**
   * @param {THREE.WebGLRenderer} renderer 異方性フィルタの最大値取得用
   */
  constructor(renderer) {
    this.maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
    this.cache = new Map();
  }

  /** 利用可能なマテリアル名の一覧 */
  static get names() { return Object.keys(DEFS); }

  /**
   * PBR テクスチャ一式を生成（キャッシュ付き）
   * @param {string} name DEFS のキー
   * @param {object} opt {size, seed, normalStrength}
   * @returns {{map:THREE.Texture, normalMap:THREE.Texture, roughnessMap:THREE.Texture,
   *            metalnessMap:THREE.Texture, aoMap:THREE.Texture}}
   */
  get(name, opt = {}) {
    const size = opt.size || 512;
    const seed = opt.seed ?? 1234;
    const key = `${name}|${size}|${seed}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const def = DEFS[name];
    if (!def) throw new Error(`未定義のマテリアル: ${name}`);

    const n = size * size;
    const albedo = new Uint8ClampedArray(n * 4);
    const orm = new Uint8ClampedArray(n * 4);   // R=AO, G=Roughness, B=Metalness
    const height = new Float32Array(n);

    const o = { r: 0, g: 0, b: 0, h: 0, rough: 0.8, metal: 0, ao: 1 };
    const inv = 1 / size;

    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        o.r = o.g = o.b = 0; o.h = 0; o.rough = 0.8; o.metal = 0; o.ao = 1;
        def(u, v, o, seed);

        const i = y * size + x, i4 = i * 4;
        // リニア値 → sRGB へエンコード
        albedo[i4] = srgb(o.r) * 255;
        albedo[i4 + 1] = srgb(o.g) * 255;
        albedo[i4 + 2] = srgb(o.b) * 255;
        albedo[i4 + 3] = 255;

        orm[i4] = clamp01(o.ao) * 255;
        orm[i4 + 1] = clamp01(o.rough) * 255;
        orm[i4 + 2] = clamp01(o.metal) * 255;
        orm[i4 + 3] = 255;

        height[i] = o.h;
      }
    }

    const normal = heightToNormal(height, size, opt.normalStrength ?? 2.0);

    /*
     * 実際の粗さと金属度は ORM テクスチャの中にある。
     * プリセットの roughness / metalness は、そこに掛ける係数として
     * ほぼ 1 が入っているだけで、材質の判別には使えない。
     * 描画側が「この材質は環境の映り込みが要るか」を判断できるよう、
     * ここで平均を出しておく。
     */
    let sumR = 0, sumM = 0;
    for (let i = 0; i < n; i++) { sumR += orm[i * 4 + 1]; sumM += orm[i * 4 + 2]; }
    const avgRough = sumR / n / 255;
    const avgMetal = sumM / n / 255;

    const result = {
      map: this._tex(albedo, size, THREE.SRGBColorSpace),
      normalMap: this._tex(normal, size, THREE.NoColorSpace),
      roughnessMap: this._tex(orm, size, THREE.NoColorSpace),
      metalnessMap: null,
      aoMap: null,
      avgRough,
      avgMetal,
      _orm: orm,
      _size: size,
    };
    // ORM は 1 枚のテクスチャを 3 スロットで共有（GPU メモリ節約）
    result.metalnessMap = result.roughnessMap;
    result.aoMap = result.roughnessMap;

    this.cache.set(key, result);
    return result;
  }

  _tex(data, size, colorSpace) {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = colorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(16, this.maxAniso);
    t.needsUpdate = true;
    return t;
  }

  dispose() {
    for (const set of this.cache.values()) {
      set.map?.dispose();
      set.normalMap?.dispose();
      set.roughnessMap?.dispose();
    }
    this.cache.clear();
  }
}

/** リニア → sRGB */
function srgb(c) {
  c = c < 0 ? 0 : c > 1 ? 1 : c;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** ハイトマップ → タンジェント空間ノーマルマップ (OpenGL 規約 / +Y up) */
function heightToNormal(h, size, strength) {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sobel
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dX * strength, ny = -dY * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i4 = (y * size + x) * 4;
      out[i4] = (nx * 0.5 + 0.5) * 255;
      out[i4 + 1] = (ny * 0.5 + 0.5) * 255;
      out[i4 + 2] = (nz * 0.5 + 0.5) * 255;
      out[i4 + 3] = 255;
    }
  }
  return out;
}

export { DEFS };
