import * as THREE from 'three';
import { fbm, fbmP, ridged, worley, voronoiEdge, valueNoise, warp, clamp01, smoothstep, mix } from './Noise.js';

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
    const crack = 1 - smoothstep(0.0, 0.035, voronoiEdge(u * 5, v * 5, 5, S + 21, 1));

    let l = 0.30 + base * 0.115 + grain * 0.05 - (1 - pits) * 0.11;
    l *= 1 - stain * 0.17;
    l -= crack * 0.2;
    // 実物のコンクリートはわずかに青灰色。暖色寄りにすると画面全体がセピアになる。
    o.r = l * 0.97; o.g = l * 0.985; o.b = l * 1.0;
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

    let l = 0.40 + base * 0.065 + roll * 0.028;
    l -= scuff * 0.09 * smoothstep(0.35, 0.0, v);
    l -= drip * 0.14;
    o.r = l * 0.93; o.g = l * 0.945; o.b = l * 0.94;
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
    o.rough = clamp01(0.22 + lines * 0.16 + lines2 * 0.1 + smudge * 0.12);
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
    const wave = Math.sin(u * TAU * 10) * 0.5 + 0.5;
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
    const chips = worley(u * 16, v * 9, 16, S, 1);
    const dir = chips.id * TAU;
    const gu = u * Math.cos(dir) + v * Math.sin(dir);
    const grain = valueNoise(gu * 300, chips.id * 50, 300, S + 3);
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
    const blockV = Math.abs(((v * 14) % 1) - 0.5);
    const shift = Math.floor(v * 14) % 2 ? 0.5 : 0;
    const blockU = Math.abs((((u + shift) * 5) % 1) - 0.5);
    const groove = smoothstep(0.3, 0.42, blockV) + smoothstep(0.3, 0.44, blockU);
    const tread = clamp01(1 - groove);
    const grain = fbm(u * 110, v * 110, { octaves: 3, period: 110, seed: S });
    const l = 0.03 + tread * 0.028 + grain * 0.022;
    o.r = l; o.g = l * 1.02; o.b = l * 1.04;
    o.h = tread * 0.95 + grain * 0.05;
    o.rough = clamp01(0.92 - tread * 0.08 + grain * 0.06);
    o.metal = 0;
    o.ao = clamp01(0.45 + tread * 0.55);
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
    const micro = valueNoise(u * 180, v * 180, 180, S);
    const machine = valueNoise(u * 190, v * 6, 190, S + 3);
    const wear = smoothstep(0.62, 0.95, fbm(u * 9, v * 9, { octaves: 5, period: 9, seed: S + 11 }));
    const edge = smoothstep(0.9, 1.0, ridged(u * 24, v * 24, { octaves: 3, period: 24, seed: S + 19 }));

    const base = 0.055 + micro * 0.03 + machine * 0.018;
    const l = mix(base, 0.34, clamp01(wear * 0.55 + edge * 0.4));
    o.r = l * 1.0; o.g = l * 1.01; o.b = l * 1.04;
    o.h = machine * 0.4 + micro * 0.3 + edge * 0.3;
    o.rough = clamp01(0.4 + micro * 0.14 - wear * 0.2);
    o.metal = 1;
    o.ao = clamp01(0.9 + micro * 0.1);
  },

  /* --- ポリマーグリップ（武器樹脂部） --- */
  polymer(u, v, o, S) {
    const N = 26;
    const gx = (u * N) % 1, gy = (v * N) % 1;
    const stipple = smoothstep(0.55, 0.2, Math.hypot(gx - 0.5, gy - 0.5));
    const micro = fbm(u * 130, v * 130, { octaves: 3, period: 130, seed: S });
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
    const crack = 1 - smoothstep(0, 0.022, voronoiEdge(u * 6, v * 6, 6, S + 29, 1));
    const patch = smoothstep(0.55, 0.85, fbm(u * 3, v * 3, { octaves: 4, period: 3, seed: S + 41 }));
    let l = 0.42 + trowel * 0.075 + micro * 0.038 - crack * 0.14 - patch * 0.042;
    o.r = l * 0.985; o.g = l * 0.985; o.b = l * 0.975;
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
    o.rough = clamp01(0.13 + micro * 0.09 + smudge * 0.22 + swirl * 0.04);
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
};

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

    const result = {
      map: this._tex(albedo, size, THREE.SRGBColorSpace),
      normalMap: this._tex(normal, size, THREE.NoColorSpace),
      roughnessMap: this._tex(orm, size, THREE.NoColorSpace),
      metalnessMap: null,
      aoMap: null,
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
