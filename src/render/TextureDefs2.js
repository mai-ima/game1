import {
  fbm, fbmP, ridged, worley, voronoiEdge, valueNoise, warp,
  clamp01, smoothstep, mix, hash01,
} from './Noise.js';

/**
 * 手続き型 PBR テクスチャの定義（第 2 群）。
 *
 * TextureFactory.js の DEFS と同じ書式で、あちらが 1000 行を超えたので
 * 分けてある。どちらも fn(u, v, o, S) で {r,g,b,h,rough,metal,ao} を返す。
 *
 * 明度（o.r/g/b）は 0.5 を超えないようにしてある。
 * ACES のトーンカーブは上端を強く圧縮するので、そこまで持ち上げると
 * 日向で凹凸が全部つぶれて真っ白な板に見える。
 */

const TAU = Math.PI * 2;

export const DEFS2 = {

  /* ================================================================
   *  武器の表面処理
   *  実銃の仕上げは「黒い金属」で一括りにできない。
   *  パーカーはざらついて艶が無く、アナダイズは均一で青みがあり、
   *  ブルーイングは深く映り込む。分けると武器の情報量が一段上がる。
   * ================================================================ */

  /* --- パーカーライジング（りん酸塩皮膜。AK/M14 のレシーバー） --- */
  parkerized(u, v, o, S) {
    // りん酸塩の結晶。細かい粒が全面を覆う
    const cryst = worley(u * 220, v * 220, 220, S, 1).f1;
    const grain = smoothstep(0.22, 0.04, cryst);
    const micro = valueNoise(u * 480, v * 480, 480, S + 3);
    const blotch = fbm(u * 7, v * 7, { octaves: 5, period: 7, seed: S + 11 });
    // 角の摩耗（下地の鋼が出る）
    const wear = smoothstep(0.80, 0.97, fbm(u * 13, v * 13, { octaves: 4, period: 13, seed: S + 29 }));

    let l = 0.055 + grain * 0.020 + micro * 0.010 + blotch * 0.016;
    l = mix(l, 0.185, wear);
    o.r = l * 1.0; o.g = l * 1.005; o.b = l * 1.02;
    o.h = grain * 0.45 + micro * 0.25;
    o.rough = clamp01(0.66 + grain * 0.16 - wear * 0.34);
    o.metal = clamp01(0.82 + wear * 0.18);
    o.ao = clamp01(0.9 + grain * 0.1);
  },

  /* --- ハードアナダイズ（AR のアッパー／ハンドガード） --- */
  anodizedBlack(u, v, o, S) {
    const micro = valueNoise(u * 380, v * 380, 380, S);
    // 押出材の目（長手方向のごく細い筋）
    const extrude = valueNoise(u * 620, v * 14, 620, S + 5);
    const cloud = fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 17 });
    const scuff = smoothstep(0.86, 0.99, ridged(u * 28, v * 6, { octaves: 3, period: 28, seed: S + 31 }));

    let l = 0.062 + micro * 0.008 + extrude * 0.010 + cloud * 0.012;
    l = mix(l, 0.21, scuff * 0.8);
    // アナダイズはわずかに青みを帯びる
    o.r = l * 0.97; o.g = l * 0.99; o.b = l * 1.04;
    o.h = micro * 0.15 + extrude * 0.25;
    o.rough = clamp01(0.40 + micro * 0.10 - scuff * 0.22);
    o.metal = 1;
    o.ao = clamp01(0.95 + micro * 0.05);
  },

  /* --- セラコート FDE（砂色の武器塗装） --- */
  cerakoteFDE(u, v, o, S) {
    const spray = fbm(u * 90, v * 90, { octaves: 4, period: 90, seed: S });
    const orange = fbm(u * 6, v * 6, { octaves: 5, period: 6, seed: S + 13 });
    // エッジの塗装剥げ。下から金属が出る
    const chip = smoothstep(0.83, 0.97, fbm(u * 20, v * 20, { octaves: 4, period: 20, seed: S + 41 }));
    const rub = smoothstep(0.68, 0.94, fbm(u * 9, v * 9, { octaves: 4, period: 9, seed: S + 59 }));

    let l = 0.205 + spray * 0.030 + orange * 0.022;
    let r = l * 1.0, g = l * 0.87, b = l * 0.66;
    r = mix(r, 0.16, chip); g = mix(g, 0.163, chip); b = mix(b, 0.168, chip);
    o.r = r; o.g = g; o.b = b;
    o.h = spray * 0.35 - chip * 0.3;
    o.rough = clamp01(0.72 + spray * 0.12 - chip * 0.42 - rub * 0.1);
    o.metal = clamp01(chip * 0.95);
    o.ao = clamp01(0.94 - chip * 0.08);
  },

  /* --- ブルーイング（拳銃のスライド。深い青黒で映り込む） --- */
  bluedSteel(u, v, o, S) {
    // 研磨してから浸けるので、下地の研磨目がうっすら残る
    const polish = valueNoise(u * 520, v * 26, 520, S);
    const cloud = fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S + 7 });
    const holster = smoothstep(0.72, 0.96, fbm(u * 11, v * 11, { octaves: 4, period: 11, seed: S + 23 }));

    let l = 0.048 + polish * 0.012 + cloud * 0.014;
    l = mix(l, 0.115, holster);          // ホルスター擦れは白っぽく曇る
    o.r = l * 0.94; o.g = l * 0.97; o.b = l * 1.10;
    o.h = polish * 0.2;
    o.rough = clamp01(0.13 + polish * 0.05 + holster * 0.35);
    o.metal = 1;
    o.ao = 0.98;
  },

  /* --- ナイトライド（バレル外面。半光沢の黒） --- */
  nitride(u, v, o, S) {
    const lathe = Math.abs(Math.sin(v * TAU * 90)) * 0.5 + 0.5;   // 旋盤目
    const micro = valueNoise(u * 300, v * 300, 300, S);
    const heat = fbm(u * 3, v * 3, { octaves: 4, period: 3, seed: S + 19 });  // 焼けムラ

    let l = 0.052 + micro * 0.010 + lathe * 0.008 + heat * 0.012;
    o.r = l * 1.0; o.g = l * 0.99; o.b = l * 0.99;
    o.h = lathe * 0.3 + micro * 0.15;
    o.rough = clamp01(0.30 + micro * 0.10 + heat * 0.08);
    o.metal = 1;
    o.ao = 0.97;
  },

  /* --- プレス鋼板（AK のレシーバー。打痕と工具痕が残る） --- */
  stampedSteel(u, v, o, S) {
    const micro = valueNoise(u * 260, v * 260, 260, S);
    // プレスの流れ目
    const flow = ridged(u * 16, v * 4, { octaves: 3, period: 16, seed: S + 5 });
    // 打痕（点在するくぼみ）
    const dent = smoothstep(0.12, 0.03, worley(u * 12, v * 12, 12, S + 13, 1).f1);
    // スポット溶接の跡
    const spotD = worley(u * 6, v * 22, 6, S + 29, 0.4).f1;
    const spot = smoothstep(0.09, 0.03, spotD);
    const wear = smoothstep(0.72, 0.95, fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 43 }));

    let l = 0.070 + micro * 0.014 + flow * 0.012 - dent * 0.018;
    l = mix(l, 0.155, wear * 0.8);
    l = mix(l, l * 0.72, spot);
    o.r = l * 1.0; o.g = l * 0.995; o.b = l * 0.985;
    o.h = flow * 0.2 + micro * 0.2 - dent * 0.55 - spot * 0.35;
    o.rough = clamp01(0.52 + micro * 0.14 + spot * 0.2 - wear * 0.22);
    o.metal = 1;
    o.ao = clamp01(0.9 - dent * 0.2 - spot * 0.15);
  },

  /* --- 木製ストック（ニス塗り。導管と杢目） --- */
  woodStock(u, v, o, S) {
    // 年輪は長手方向へ緩やかに流れる
    const [wx, wy] = warp(u * 3, v * 3, 0.65, { octaves: 3, period: 3, seed: S });
    // 年輪。木口ではなく板目なので、長手方向に緩く流れる帯になる
    const ring = Math.abs(Math.sin((wy * 6.0 + fbmP(wx * 2, wy * 2, { octaves: 3, period: 6, seed: S + 3 }) * 6) * Math.PI));
    const ring2 = Math.abs(Math.sin((wy * 14.0 + fbmP(wx * 3, wy * 3, { octaves: 3, period: 6, seed: S + 9 }) * 4) * Math.PI));
    // 導管（長手に走る細い筋）
    const pore = smoothstep(0.55, 0.92, valueNoise(u * 300, v * 10, 300, S + 11));
    const figure = fbm(u * 9, v * 3, { octaves: 4, period: 9, seed: S + 23 });   // 杢
    const ding = smoothstep(0.90, 0.99, fbm(u * 22, v * 22, { octaves: 3, period: 22, seed: S + 37 }));

    let l = 0.115 + ring * 0.085 + ring2 * 0.030 + figure * 0.028 - pore * 0.035 - ding * 0.03;
    o.r = l * 1.0; o.g = l * 0.63; o.b = l * 0.36;
    o.h = pore * 0.5 + ring * 0.2 + ring2 * 0.1 - ding * 0.4;
    // ニスが乗っているので導管の谷だけ艶が引ける
    o.rough = clamp01(0.22 + pore * 0.30 + ding * 0.3);
    o.metal = 0;
    o.ao = clamp01(0.93 - pore * 0.12);
  },

  /* --- 光学レンズ（スコープ。反射防止コートの色） --- */
  scopeLens(u, v, o, S) {
    const rr = Math.hypot(u - 0.5, v - 0.5) * 2;
    const edge = smoothstep(0.86, 1.0, rr);
    const smudge = fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S });
    const dust = smoothstep(0.90, 0.99, valueNoise(u * 200, v * 200, 200, S + 7));
    // コートの干渉色は入射角で変わる。中心を紫、周辺を緑に寄せる
    const t = clamp01(rr * 1.1);
    let r = mix(0.055, 0.020, t), g = mix(0.028, 0.075, t), b = mix(0.090, 0.055, t);
    r += smudge * 0.012; g += smudge * 0.012; b += smudge * 0.012;
    r = mix(r, 0.06, edge); g = mix(g, 0.06, edge); b = mix(b, 0.062, edge);
    o.r = r + dust * 0.05; o.g = g + dust * 0.05; o.b = b + dust * 0.05;
    o.h = edge * 0.6;
    o.rough = clamp01(0.04 + smudge * 0.06 + dust * 0.3 + edge * 0.4);
    o.metal = clamp01(0.85 - edge * 0.5 - dust * 0.4);
    o.ao = 1;
  },

  /* ================================================================
   *  人物の装備・被服
   * ================================================================ */

  /* --- ウッドランド迷彩 --- */
  camoWoodland(u, v, o, S) {
    const w = (sc, sd) => fbm(u * sc, v * sc, { octaves: 4, period: sc, seed: S + sd });
    const a = smoothstep(0.46, 0.54, w(3.2, 0));
    const b2 = smoothstep(0.50, 0.58, w(5.1, 21));
    const c = smoothstep(0.54, 0.62, w(8.3, 47));
    const weave = Math.abs(Math.sin(u * TAU * 210)) * Math.abs(Math.sin(v * TAU * 210));
    const fade = fbm(u * 2, v * 2, { octaves: 4, period: 2, seed: S + 71 });

    // 下地=淡い黄緑 / 中間=濃緑 / 斑=茶 / 差し色=黒
    let r = 0.135, g = 0.150, b = 0.088;
    if (a > 0) { r = mix(r, 0.062, a); g = mix(g, 0.086, a); b = mix(b, 0.046, a); }
    if (b2 > 0) { r = mix(r, 0.105, b2); g = mix(g, 0.070, b2); b = mix(b, 0.040, b2); }
    if (c > 0) { r = mix(r, 0.030, c); g = mix(g, 0.032, c); b = mix(b, 0.028, c); }
    const sh = (1 - fade * 0.16) * (0.92 + weave * 0.16);
    o.r = r * sh; o.g = g * sh; o.b = b * sh;
    o.h = weave * 0.7 + fade * 0.1;
    o.rough = clamp01(0.90 + weave * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.82 + weave * 0.18);
  },

  /* --- 三色デザート迷彩 --- */
  camoDesert(u, v, o, S) {
    const w = (sc, sd) => fbm(u * sc, v * sc, { octaves: 4, period: sc, seed: S + sd });
    const a = smoothstep(0.47, 0.55, w(3.6, 0));
    const b2 = smoothstep(0.52, 0.60, w(6.4, 33));
    const weave = Math.abs(Math.sin(u * TAU * 210)) * Math.abs(Math.sin(v * TAU * 210));
    const dust = fbm(u * 2.5, v * 2.5, { octaves: 4, period: 2.5, seed: S + 61 });

    let r = 0.235, g = 0.205, b = 0.140;
    if (a > 0) { r = mix(r, 0.175, a); g = mix(g, 0.140, a); b = mix(b, 0.086, a); }
    if (b2 > 0) { r = mix(r, 0.108, b2); g = mix(g, 0.092, b2); b = mix(b, 0.062, b2); }
    const sh = (1 - dust * 0.14) * (0.93 + weave * 0.14);
    o.r = r * sh; o.g = g * sh; o.b = b * sh;
    o.h = weave * 0.7;
    o.rough = clamp01(0.91 + weave * 0.07);
    o.metal = 0;
    o.ao = clamp01(0.84 + weave * 0.16);
  },

  /* --- 都市迷彩（灰） --- */
  camoUrban(u, v, o, S) {
    const w = (sc, sd) => fbm(u * sc, v * sc, { octaves: 4, period: sc, seed: S + sd });
    // 直線的なピクセル調にするため座標を量子化する
    const q = 64;
    const qu = Math.floor(u * q) / q, qv = Math.floor(v * q) / q;
    const a = smoothstep(0.48, 0.52, fbm(qu * 4, qv * 4, { octaves: 3, period: 4, seed: S }));
    const b2 = smoothstep(0.52, 0.56, fbm(qu * 7, qv * 7, { octaves: 3, period: 7, seed: S + 27 }));
    const weave = Math.abs(Math.sin(u * TAU * 210)) * Math.abs(Math.sin(v * TAU * 210));

    let r = 0.225, g = 0.230, b = 0.235;
    r = mix(r, 0.120, a); g = mix(g, 0.126, a); b = mix(b, 0.134, a);
    r = mix(r, 0.048, b2); g = mix(g, 0.050, b2); b = mix(b, 0.055, b2);
    const sh = 0.93 + weave * 0.14;
    o.r = r * sh; o.g = g * sh; o.b = b * sh;
    o.h = weave * 0.7;
    o.rough = clamp01(0.90 + weave * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.84 + weave * 0.16);
  },

  /* --- コーデュラ 1000D（装備のナイロン。太い斜子織） --- */
  cordura(u, v, o, S) {
    const N = 150;
    const gx = u * N, gy = v * N;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    // 2 本ずつ交互に浮き沈みする
    const over = ((Math.floor(cx / 2) + Math.floor(cy / 2)) % 2) === 0;
    const lx = gx - cx, ly = gy - cy;
    const bumpX = Math.sin(lx * Math.PI), bumpY = Math.sin(ly * Math.PI);
    const bump = over ? bumpX : bumpY;
    const fuzz = valueNoise(u * 520, v * 520, 520, S + 3);
    const fade = fbm(u * 4, v * 4, { octaves: 4, period: 4, seed: S + 17 });

    const l = 0.085 + bump * 0.030 + fuzz * 0.012 - fade * 0.014;
    o.r = l * 1.0; o.g = l * 1.01; o.b = l * 0.98;
    o.h = bump * 0.7 + (over ? 0.2 : 0) + fuzz * 0.1;
    o.rough = clamp01(0.86 + fuzz * 0.12);
    o.metal = 0;
    o.ao = clamp01(0.72 + bump * 0.28);
  },

  /* --- ケブラー綾織（ヘルメット内装・プレート） --- */
  kevlarWeave(u, v, o, S) {
    const N = 90;
    const gx = u * N, gy = v * N;
    // 綾織なので斜めに流れる
    const twill = ((Math.floor(gx) + Math.floor(gy)) % 3) === 0 ? 1 : 0;
    const bump = Math.abs(Math.sin((gx - gy) * Math.PI / 3));
    const sheen = fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 11 });
    const l = 0.130 + bump * 0.028 + twill * 0.012 + sheen * 0.016;
    o.r = l * 1.0; o.g = l * 0.90; o.b = l * 0.52;   // アラミドの黄
    o.h = bump * 0.6 + twill * 0.25;
    o.rough = clamp01(0.52 + bump * 0.16);
    o.metal = 0;
    o.ao = clamp01(0.78 + bump * 0.22);
  },

  /* --- ノーメックス（グローブ・フライトスーツ） --- */
  nomex(u, v, o, S) {
    const knit = Math.abs(Math.sin(u * TAU * 170)) * 0.6 + Math.abs(Math.sin(v * TAU * 130)) * 0.4;
    const fuzz = valueNoise(u * 460, v * 460, 460, S);
    const wear = smoothstep(0.70, 0.95, fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 19 }));
    const l = 0.072 + knit * 0.020 + fuzz * 0.012 - wear * 0.014;
    o.r = l * 1.0; o.g = l * 0.98; o.b = l * 0.92;
    o.h = knit * 0.5 + fuzz * 0.3;
    o.rough = clamp01(0.88 + fuzz * 0.1 - wear * 0.14);
    o.metal = 0;
    o.ao = clamp01(0.78 + knit * 0.22);
  },

  /* --- ブーツ革（つま先と踵が擦れて光る） --- */
  bootLeather(u, v, o, S) {
    const cell = voronoiEdge(u * 55, v * 55, 55, S, 1);
    const pore = 1 - smoothstep(0.0, 0.045, cell);
    const grain = valueNoise(u * 300, v * 300, 300, S + 5);
    const crease = smoothstep(0.55, 0.85, ridged(u * 7, v * 14, { octaves: 4, period: 14, seed: S + 23 }));
    const polish = smoothstep(0.45, 0.90, fbm(u * 4, v * 4, { octaves: 4, period: 4, seed: S + 41 }));
    const scuff = smoothstep(0.80, 0.97, fbm(u * 15, v * 15, { octaves: 3, period: 15, seed: S + 53 }));

    let l = 0.082 + grain * 0.018 - pore * 0.016 - crease * 0.020;
    l = mix(l, l * 1.5, scuff);
    o.r = l * 1.0; o.g = l * 0.86; o.b = l * 0.74;
    o.h = pore * 0.4 + grain * 0.2 - crease * 0.5;
    o.rough = clamp01(0.74 - polish * 0.34 + pore * 0.1 + scuff * 0.2);
    o.metal = 0;
    o.ao = clamp01(0.88 - crease * 0.2);
  },

  /* --- 日焼けした肌 --- */
  skinWeathered(u, v, o, S) {
    const pore = valueNoise(u * 420, v * 420, 420, S);
    const cell = 1 - smoothstep(0.0, 0.05, voronoiEdge(u * 130, v * 130, 130, S + 3, 1));
    const blush = fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 13 });
    const stubble = smoothstep(0.55, 0.85, valueNoise(u * 260, v * 260, 260, S + 29));
    const dirt = smoothstep(0.72, 0.95, fbm(u * 7, v * 7, { octaves: 4, period: 7, seed: S + 47 }));

    let l = 0.215 + pore * 0.016 - cell * 0.012 - stubble * 0.030 - dirt * 0.030;
    o.r = l * 1.0; o.g = l * (0.70 - blush * 0.05); o.b = l * (0.56 - blush * 0.06);
    o.h = pore * 0.3 + cell * 0.35;
    // 皮脂で少しだけ艶が出る
    o.rough = clamp01(0.62 + pore * 0.12 - blush * 0.08 + stubble * 0.12);
    o.metal = 0;
    o.ao = clamp01(0.9 - cell * 0.1);
  },

  /* ================================================================
   *  建材・壁・屋根
   * ================================================================ */

  /* --- 打ちっぱなしコンクリート（型枠目地と P コン跡） --- */
  concreteRaw(u, v, o, S) {
    const base = fbm(u * 5, v * 5, { octaves: 6, period: 5, seed: S });
    const grain = valueNoise(u * 190, v * 190, 190, S + 3);
    // 型枠の継ぎ目（900×1800 の合板割り）
    const seamX = 1 - smoothstep(0.0, 0.010, Math.abs(((u * 2) % 1) - 0.5));
    const seamY = 1 - smoothstep(0.0, 0.010, Math.abs(((v * 1) % 1) - 0.5));
    const seam = Math.max(seamX, seamY);
    // P コン（セパレータ）の跡。型枠 1 枚に 4 点
    const px = ((u * 4) % 1) - 0.5, py = ((v * 2) % 1) - 0.5;
    const pc = smoothstep(0.09, 0.05, Math.hypot(px, py));
    const stain = smoothstep(0.55, 0.95, fbm(u * 3, v * 1.2, { octaves: 4, period: 3, seed: S + 31 }));
    const air = smoothstep(0.24, 0.06, worley(u * 60, v * 60, 60, S + 43, 1).f1);   // 気泡

    /*
     * 型枠の継ぎ目と P コン跡の強さ。
     *
     * 以前は明度で 5〜6%、法線で 0.7〜0.85 落としていた。
     * 実物の P コン跡は直径 2cm 前後で、たいていモルタルで埋めてあり、
     * 数 m 離れれば「わずかな色むら」にしかならない。
     * 強すぎると、壁でも床でも黒い点が 45cm 間隔で整然と並び、
     * 打ち放しというより穴あきボードに見える（実際その絵が撮れた）。
     * 半分以下に落として、近寄ったときだけ判る程度にする。
     */
    let l = 0.275 + base * 0.075 + grain * 0.030 - air * 0.040 - seam * 0.032 - pc * 0.020;
    l *= 1 - stain * 0.14;
    o.r = l * 0.995; o.g = l * 1.0; o.b = l * 1.0;
    o.h = base * 0.4 + grain * 0.1 - seam * 0.34 - pc * 0.32 - air * 0.22;
    o.rough = clamp01(0.80 + grain * 0.12 + air * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.88 - seam * 0.18 - pc * 0.14 - air * 0.16);
  },

  /* --- コンクリートブロック（CMU） --- */
  concreteBlock(u, v, o, S) {
    const NX = 2.5, NY = 5;                     // 390×190mm 相当
    const row = Math.floor(v * NY);
    const off = (row % 2) * 0.5;
    const gx = (u + off / NX) * NX, gy = v * NY;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const G = 0.030;
    const inside = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx)
                 * smoothstep(0, G * NX / NY, ly) * smoothstep(0, G * NX / NY, 1 - ly);
    const id = hash01(u + off / NX, v, NX, S + row * 7);
    const grit = fbm((u + id) * 120, (v + id) * 120, { octaves: 4, period: 120, seed: S + cx + cy * 3 });
    const air = smoothstep(0.20, 0.05, worley(u * 70, v * 70, 70, S + 23, 1).f1);
    const efflor = smoothstep(0.70, 0.95, fbm(u * 4, v * 4, { octaves: 4, period: 4, seed: S + 51 }));  // 白華

    const blockL = 0.285 + id * 0.030 + grit * 0.045 - air * 0.05;
    const jointL = 0.235 + grit * 0.03;
    let l = mix(jointL, blockL, inside);
    l = mix(l, l * 1.16, efflor);
    o.r = l * 1.0; o.g = l * 0.995; o.b = l * 0.975;
    o.h = inside * 0.75 + grit * 0.15 - air * 0.3;
    o.rough = clamp01(0.90 + grit * 0.08);
    o.metal = 0;
    o.ao = clamp01(mix(0.45, 0.94, inside) - air * 0.12);
  },

  /* --- リシン吹付（外壁の粗い塗装） --- */
  stuccoRough(u, v, o, S) {
    const drop = worley(u * 95, v * 95, 95, S, 1).f1;
    const bead = smoothstep(0.26, 0.07, drop);
    const drop2 = worley(u * 160, v * 160, 160, S + 11, 1).f1;
    const bead2 = smoothstep(0.16, 0.05, drop2);
    const cloud = fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S + 23 });
    const rain = smoothstep(0.62, 0.95, fbm(u * 6, v * 1.1, { octaves: 4, period: 6, seed: S + 41 }));

    let l = 0.290 + cloud * 0.045 + bead * 0.028 + bead2 * 0.016;
    l *= 1 - rain * 0.16;
    o.r = l * 1.0; o.g = l * 0.985; o.b = l * 0.945;
    o.h = bead * 0.65 + bead2 * 0.3 + cloud * 0.1;
    o.rough = clamp01(0.90 + bead * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.76 + bead * 0.24 - rain * 0.08);
  },

  /* --- ひび割れた漆喰（下地が透ける） --- */
  plasterCracked(u, v, o, S) {
    const trowel = fbmP(u * 5, v * 5, { octaves: 5, period: 5, seed: S });
    const micro = fbm(u * 210, v * 210, { octaves: 3, period: 210, seed: S + 5 });
    // 大きなひび
    const crackA = 1 - smoothstep(0.0, 0.008, voronoiEdge(u * 5, v * 5, 5, S + 29, 1));
    // 細かい貫入
    const crackB = (1 - smoothstep(0.0, 0.004, voronoiEdge(u * 17, v * 17, 17, S + 61, 1)))
      * smoothstep(0.45, 0.75, fbm(u * 3, v * 3, { octaves: 3, period: 3, seed: S + 83 }));
    // 剥落して下地のレンガが出た部分
    const spall = smoothstep(0.72, 0.86, fbm(u * 3.5, v * 3.5, { octaves: 5, period: 3.5, seed: S + 97 }));

    let l = 0.300 + trowel * 0.060 + micro * 0.030;
    l -= crackA * 0.16 + crackB * 0.09;
    let r = l * 1.0, g = l * 0.955, b = l * 0.885;
    // 下地は赤茶
    r = mix(r, l * 0.86, spall); g = mix(g, l * 0.56, spall); b = mix(b, l * 0.40, spall);
    o.r = r; o.g = g; o.b = b;
    o.h = trowel * 0.5 - crackA * 0.85 - crackB * 0.4 - spall * 0.5;
    o.rough = clamp01(0.82 + micro * 0.12 + spall * 0.1);
    o.metal = 0;
    o.ao = clamp01(0.88 - crackA * 0.45 - crackB * 0.2 - spall * 0.15);
  },

  /* --- 砂岩（層理が走る） --- */
  sandstone(u, v, o, S) {
    const [wx, wy] = warp(u * 3, v * 3, 0.35, { octaves: 3, period: 3, seed: S });
    // 層理はうっすら。強くすると畝を掘った畑に見える
    const bed = Math.abs(Math.sin((wy * 4.5) * Math.PI));
    const grit = valueNoise(u * 240, v * 240, 240, S + 7);
    const grit2 = smoothstep(0.30, 0.10, worley(u * 150, v * 150, 150, S + 3, 1).f1);
    const pit = smoothstep(0.18, 0.05, worley(u * 42, v * 42, 42, S + 19, 1).f1);
    const patina = fbm(u * 3, v * 3, { octaves: 4, period: 3, seed: S + 37 });

    let l = 0.265 + bed * 0.018 + grit * 0.040 + grit2 * 0.022 - pit * 0.050;
    l *= 1 - patina * 0.12;
    o.r = l * 1.0; o.g = l * 0.885; o.b = l * 0.700;
    o.h = bed * 0.12 + grit * 0.30 + grit2 * 0.25 - pit * 0.5;
    o.rough = clamp01(0.90 + grit * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.85 - pit * 0.25);
  },

  /* --- 日干し煉瓦（アドベ。藁が混じる） --- */
  adobe(u, v, o, S) {
    const NX = 3, NY = 7;
    const row = Math.floor(v * NY);
    const off = (row % 2) * 0.5;
    const gx = (u + off / NX) * NX, gy = v * NY;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const G = 0.055;
    const inside = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx)
                 * smoothstep(0, G * NX / NY, ly) * smoothstep(0, G * NX / NY, 1 - ly);
    const id = hash01(u + off / NX, v, NX, S + row * 11);
    const straw = smoothstep(0.80, 0.95, ridged(u * 60, v * 22, { octaves: 3, period: 60, seed: S + cx * 5 }));
    const grit = fbm(u * 90, v * 90, { octaves: 4, period: 90, seed: S + 13 });
    const erode = smoothstep(0.55, 0.9, fbm(u * 6, v * 6, { octaves: 5, period: 6, seed: S + 29 }));

    const brickL = 0.250 + id * 0.045 + grit * 0.035 + straw * 0.030;
    const jointL = 0.215 + grit * 0.03;
    let l = mix(jointL, brickL, inside) * (1 - erode * 0.14);
    o.r = l * 1.0; o.g = l * 0.855; o.b = l * 0.665;
    o.h = inside * 0.6 + grit * 0.2 + straw * 0.2 - erode * 0.3;
    o.rough = clamp01(0.93 + grit * 0.06);
    o.metal = 0;
    o.ao = clamp01(mix(0.5, 0.93, inside));
  },

  /* --- 下見板張り（横張りの木壁） --- */
  woodSiding(u, v, o, S) {
    const N = 7;                                  // 板の枚数
    const gy = v * N;
    const row = Math.floor(gy);
    const ly = gy - row;
    // 下の板に少し重なる（見込みの影）
    const lap = smoothstep(0.0, 0.10, ly);
    const edge = 1 - smoothstep(0.86, 1.0, ly);
    const id = ((row * 53) % 71) / 71;
    /*
     * 下見板は横張りなので、木目も横（u 方向）に走る。
     * u を細かくすると縦縞になってしまい、板ではなく波板に見えた。
     */
    const grain = fbm((u + id * 3) * 7, (v + id) * 240, { octaves: 4, period: 240, seed: S + row * 7 });
    const ring = Math.abs(Math.sin((ly * 3.0 + grain * 3.5 + id * 7) * Math.PI));
    const peel = smoothstep(0.68, 0.92, fbm(u * 9, v * 9, { octaves: 4, period: 9, seed: S + 41 }));
    const nail = smoothstep(0.04, 0.0, Math.hypot(((u * 12) % 1) - 0.5, ly - 0.22) );

    let l = 0.235 + grain * 0.045 + ring * 0.030;
    l *= lap * 0.35 + 0.65;
    l = mix(l, l * 0.80, peel);                   // 塗装が剥げて素地が出る
    let r = l * 0.94, g = l * 0.92, b = l * 0.86;
    r = mix(r, l * 1.05, peel * 0.6); g = mix(g, l * 0.80, peel * 0.6); b = mix(b, l * 0.58, peel * 0.6);
    o.r = r; o.g = g; o.b = b;
    o.h = edge * 0.5 + grain * 0.2 - (1 - lap) * 0.7 - nail * 0.6;
    o.rough = clamp01(0.68 + peel * 0.26 + grain * 0.06);
    o.metal = 0;
    o.ao = clamp01(0.55 + lap * 0.45 - nail * 0.2);
  },

  /* --- 金属サイディング（角波の外装板） --- */
  sidingMetal(u, v, o, S) {
    const p = (v * 14) % 1;
    // 角波なので断面が台形
    const face = smoothstep(0.0, 0.12, p) * (1 - smoothstep(0.38, 0.50, p));
    const back = smoothstep(0.55, 0.67, p) * (1 - smoothstep(0.88, 1.0, p));
    const prof = face * 1.0 + back * 0.55;
    const paint = fbm(u * 10, v * 10, { octaves: 4, period: 10, seed: S });
    const chalk = fbm(u * 3, v * 3, { octaves: 4, period: 3, seed: S + 17 });    // 白亜化
    const rust = smoothstep(0.80, 0.97, fbm(u * 7, v * 7, { octaves: 4, period: 7, seed: S + 31 }))
      * smoothstep(0.30, 0.0, v);
    const dent = smoothstep(0.70, 0.93, fbm(u * 16, v * 16, { octaves: 3, period: 16, seed: S + 53 }));

    let l = 0.245 + prof * 0.045 + paint * 0.022 - chalk * 0.020;
    let r = l * 0.93, g = l * 0.96, b = l * 1.0;
    r = mix(r, l * 1.25, rust); g = mix(g, l * 0.72, rust); b = mix(b, l * 0.45, rust);
    o.r = r; o.g = g; o.b = b;
    o.h = prof * 0.85 - dent * 0.1;
    o.rough = clamp01(0.42 + chalk * 0.3 + rust * 0.45);
    o.metal = clamp01(0.7 - rust * 0.55 - chalk * 0.2);
    o.ao = clamp01(0.7 + prof * 0.3);
  },

  /* --- 瓦（和瓦の波） --- */
  roofTile(u, v, o, S) {
    const NX = 6, NY = 8;
    const col = Math.floor(u * NX);
    const rowOff = (col % 2) * 0.0;
    const gy = (v + rowOff) * NY;
    const row = Math.floor(gy);
    const lx = u * NX - col, ly = gy - row;
    // 山と谷
    // 山と谷の差をはっきりさせる（浅いと溝を彫った板にしか見えない）
    const wave = Math.pow(Math.sin(lx * Math.PI), 0.6);
    const overlap = smoothstep(0.0, 0.14, ly);
    const id = ((col * 31 + row * 17) % 59) / 59;
    const grit = fbm(u * 110, v * 110, { octaves: 3, period: 110, seed: S + col + row });
    const moss = smoothstep(0.72, 0.94, fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 37 })) * (1 - wave * 0.6);

    let l = 0.098 + wave * 0.075 + id * 0.020 + grit * 0.020;
    l *= overlap * 0.35 + 0.65;
    let r = l * 0.95, g = l * 0.98, b = l * 1.02;
    r = mix(r, l * 0.66, moss); g = mix(g, l * 0.95, moss); b = mix(b, l * 0.52, moss);
    o.r = r; o.g = g; o.b = b;
    o.h = wave * 0.85 + overlap * 0.35;
    o.rough = clamp01(0.42 + grit * 0.2 + moss * 0.4);
    o.metal = 0;
    o.ao = clamp01(0.48 + overlap * 0.28 + wave * 0.24);
  },

  /* --- アスファルトシングル --- */
  asphaltShingle(u, v, o, S) {
    const NY = 9;
    const gy = v * NY;
    const row = Math.floor(gy);
    const ly = gy - row;
    const off = (row % 2) * 0.5;
    const NX = 4;
    const gx = (u + off / NX) * NX;
    const col = Math.floor(gx), lx = gx - col;
    // タブの切れ込み
    const slot = (1 - smoothstep(0.0, 0.02, Math.abs(lx - 0.5))) * smoothstep(0.45, 0.60, ly);
    const lap = smoothstep(0.0, 0.10, ly);
    const id = ((col * 43 + row * 61) % 67) / 67;
    const grit = valueNoise(u * 340, v * 340, 340, S + col + row * 3);
    const grit2 = worley(u * 130, v * 130, 130, S + 11, 1).f1;
    const gran = smoothstep(0.2, 0.06, grit2);

    let l = 0.085 + id * 0.022 + grit * 0.030 + gran * 0.018;
    l *= lap * 0.30 + 0.70;
    l *= 1 - slot * 0.5;
    o.r = l * 1.0; o.g = l * 0.97; o.b = l * 0.92;
    o.h = lap * 0.5 + gran * 0.3 - slot * 0.6;
    o.rough = clamp01(0.94 + grit * 0.05);
    o.metal = 0;
    o.ao = clamp01(0.6 + lap * 0.4 - slot * 0.3);
  },

  /* --- 折板屋根（大きな山谷の金属屋根） --- */
  metalRoof(u, v, o, S) {
    const p = (u * 5) % 1;
    const rib = smoothstep(0.40, 0.47, p) * (1 - smoothstep(0.53, 0.60, p));
    const flat = 1 - rib;
    const paint = fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S });
    const streak = smoothstep(0.55, 0.92, fbm(u * 20, v * 2, { octaves: 4, period: 20, seed: S + 19 }));
    const rust = smoothstep(0.84, 0.98, fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 41 }));
    const bolt = smoothstep(0.045, 0.02, Math.hypot(p - 0.5, ((v * 10) % 1) - 0.5)) * rib;

    let l = 0.230 + rib * 0.040 + paint * 0.020 - streak * 0.030;
    let r = l * 0.95, g = l * 0.99, b = l * 0.96;
    r = mix(r, l * 1.28, rust); g = mix(g, l * 0.70, rust); b = mix(b, l * 0.42, rust);
    o.r = r; o.g = g; o.b = b;
    o.h = rib * 0.9 + bolt * 0.5;
    o.rough = clamp01(0.36 + streak * 0.25 + rust * 0.5 + paint * 0.08);
    o.metal = clamp01(0.8 - rust * 0.6);
    o.ao = clamp01(0.75 + flat * 0.2);
  },

  /* --- 化粧レンガ（艶のある焼成面） --- */
  brickGlazed(u, v, o, S) {
    const NX = 4, NY = 12;
    const row = Math.floor(v * NY);
    const off = (row % 2) * 0.5;
    const gx = (u + off / NX) * NX, gy = v * NY;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const G = 0.035;
    const inside = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx)
                 * smoothstep(0, G * NX / NY, ly) * smoothstep(0, G * NX / NY, 1 - ly);
    const id = hash01(u + off / NX, v, NX, S + row * 13);
    const glaze = fbm((u + id) * 60, (v + id) * 60, { octaves: 3, period: 60, seed: S + cx + cy * 7 });
    const dirt = fbm(u * 20, v * 20, { octaves: 4, period: 20, seed: S + 23 });

    const brickL = 0.175 + id * 0.055 + glaze * 0.030;
    const jointL = 0.245 + dirt * 0.03;
    const l = mix(jointL, brickL, inside);
    const warm = mix(1.0, 1.0 + id * 0.25, inside);
    o.r = l * warm; o.g = l * mix(1.0, 0.62, inside); o.b = l * mix(0.98, 0.50, inside);
    o.h = inside * 0.8;
    o.rough = clamp01(mix(0.90, 0.20 + glaze * 0.12, inside));
    o.metal = 0;
    o.ao = clamp01(mix(0.45, 0.96, inside));
  },

  /* ================================================================
   *  小物・什器
   * ================================================================ */

  /* --- つや消しプラスチック（工具ケース・コンテナ） --- */
  plasticMatte(u, v, o, S) {
    // 金型のシボ（微細な梨地）
    const grain = worley(u * 300, v * 300, 300, S, 1).f1;
    const tex = smoothstep(0.30, 0.10, grain);
    const micro = valueNoise(u * 620, v * 620, 620, S + 3);
    const flow = fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 11 });     // 樹脂の流れ
    const scuff = smoothstep(0.82, 0.98, fbm(u * 18, v * 18, { octaves: 3, period: 18, seed: S + 29 }));

    let l = 0.115 + tex * 0.012 + micro * 0.008 + flow * 0.014;
    l = mix(l, l * 1.4, scuff);      // 擦り傷は白化する
    o.r = l * 1.0; o.g = l * 1.0; o.b = l * 1.0;
    o.h = tex * 0.45 + micro * 0.2;
    o.rough = clamp01(0.72 + tex * 0.14 - scuff * 0.1);
    o.metal = 0;
    o.ao = clamp01(0.88 + tex * 0.12);
  },

  /* --- 光沢プラスチック（家電・看板） --- */
  plasticGloss(u, v, o, S) {
    const micro = valueNoise(u * 700, v * 700, 700, S);
    const orange = fbm(u * 22, v * 22, { octaves: 3, period: 22, seed: S + 7 });   // ゆず肌
    const dust = smoothstep(0.88, 0.99, valueNoise(u * 220, v * 220, 220, S + 17));
    const scratch = smoothstep(0.90, 0.995, ridged(u * 40, v * 8, { octaves: 3, period: 40, seed: S + 31 }));

    let l = 0.175 + micro * 0.006 + orange * 0.010;
    o.r = l * 1.0; o.g = l * 1.0; o.b = l * 1.005;
    o.h = orange * 0.3 + micro * 0.1 - scratch * 0.3;
    o.rough = clamp01(0.10 + orange * 0.06 + dust * 0.35 + scratch * 0.3);
    o.metal = 0;
    o.ao = 0.99;
  },

  /* --- 半透明アクリル（サイン・仕切り） --- */
  acrylic(u, v, o, S) {
    const micro = valueNoise(u * 500, v * 500, 500, S);
    const smear = fbm(u * 7, v * 7, { octaves: 4, period: 7, seed: S + 5 });
    const scratch = smoothstep(0.88, 0.99, ridged(u * 30, v * 12, { octaves: 3, period: 30, seed: S + 23 }));
    const l = 0.36 + micro * 0.010 + smear * 0.020;
    o.r = l * 0.98; o.g = l * 1.0; o.b = l * 1.0;
    o.h = smear * 0.2 - scratch * 0.4;
    o.rough = clamp01(0.06 + smear * 0.14 + scratch * 0.35);
    o.metal = 0;
    o.ao = 1;
  },

  /* --- ステンレス（流し台・什器・手すり） --- */
  stainless(u, v, o, S) {
    // ヘアライン（一方向の研磨目）
    const hair = valueNoise(u * 1400, v * 8, 1400, S);
    const hair2 = valueNoise(u * 620, v * 5, 620, S + 3);
    const smudge = fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 17 });
    const finger = smoothstep(0.78, 0.96, fbm(u * 14, v * 14, { octaves: 3, period: 14, seed: S + 41 }));
    const dent = smoothstep(0.90, 0.99, fbm(u * 26, v * 26, { octaves: 3, period: 26, seed: S + 53 }));

    const l = 0.400 + hair * 0.016 + hair2 * 0.010 - smudge * 0.014;
    o.r = l * 0.99; o.g = l * 1.0; o.b = l * 1.01;
    o.h = hair * 0.22 + hair2 * 0.15 - dent * 0.3;
    o.rough = clamp01(0.15 + hair * 0.10 + finger * 0.24 + smudge * 0.06);
    o.metal = 1;
    o.ao = clamp01(0.96 - dent * 0.06);
  },

  /* --- 鋳鉄（マンホール・機械・ラジエーター） --- */
  castIron(u, v, o, S) {
    // 鋳肌のざらつき
    const sandD = worley(u * 130, v * 130, 130, S, 1).f1;
    const sand = smoothstep(0.24, 0.06, sandD);
    const micro = valueNoise(u * 340, v * 340, 340, S + 5);
    const rust = fbm(u * 6, v * 6, { octaves: 5, period: 6, seed: S + 19 });
    // 錆は「広い面がうっすら」。点在させると斑点柄に見えてしまう
    const scale = smoothstep(0.52, 0.90, rust) * 0.55;
    const worn = smoothstep(0.86, 0.98, fbm(u * 11, v * 11, { octaves: 3, period: 11, seed: S + 37 }));

    let l = 0.078 + sand * 0.030 + micro * 0.016 + rust * 0.020;
    let r = l * 1.0, g = l * 0.98, b = l * 0.96;
    r = mix(r, l * 1.5, scale); g = mix(g, l * 0.92, scale); b = mix(b, l * 0.58, scale);
    r = mix(r, 0.20, worn); g = mix(g, 0.20, worn); b = mix(b, 0.205, worn);
    o.r = r; o.g = g; o.b = b;
    o.h = sand * 0.65 + micro * 0.3 + scale * 0.15;
    o.rough = clamp01(0.78 + sand * 0.12 + scale * 0.14 - worn * 0.5);
    o.metal = clamp01(0.75 - scale * 0.45 + worn * 0.25);
    o.ao = clamp01(0.82 + sand * 0.18);
  },

  /* --- 塗装が剥げた鉄（ドラム缶・機械・工具箱） --- */
  chippedPaint(u, v, o, S) {
    const paint = fbm(u * 7, v * 7, { octaves: 5, period: 7, seed: S });
    // 剥がれの縁は voronoi で作ると自然な島になる
    const cellD = worley(u * 9, v * 9, 9, S + 13, 1).f1;
    const island = smoothstep(0.30, 0.16, cellD)
      * smoothstep(0.48, 0.66, fbm(u * 4, v * 4, { octaves: 4, period: 4, seed: S + 31 }));
    const rim = smoothstep(0.34, 0.28, cellD) - smoothstep(0.30, 0.24, cellD);
    const rust = fbm(u * 15, v * 15, { octaves: 4, period: 15, seed: S + 47 });
    const micro = valueNoise(u * 280, v * 280, 280, S + 61);

    // 塗装（青緑の工業色）
    let r = 0.055 + paint * 0.020, g = 0.105 + paint * 0.022, b = 0.115 + paint * 0.020;
    // 剥がれた地は錆
    const rr = 0.135 + rust * 0.055;
    r = mix(r, rr * 1.0, island); g = mix(g, rr * 0.55, island); b = mix(b, rr * 0.30, island);
    // 縁は下地のプライマーが覗く
    r = mix(r, 0.14, rim * 0.6); g = mix(g, 0.12, rim * 0.6); b = mix(b, 0.10, rim * 0.6);
    o.r = r + micro * 0.006; o.g = g + micro * 0.006; o.b = b + micro * 0.006;
    o.h = -island * 0.55 + rim * 0.3 + micro * 0.1;
    o.rough = clamp01(0.46 + island * 0.42 + micro * 0.08);
    o.metal = clamp01(island * 0.4);
    o.ao = clamp01(0.9 - island * 0.14 - rim * 0.1);
  },

  /* --- パンチングメタル（ラック・スピーカー・什器） --- */
  perforatedMetal(u, v, o, S) {
    const N = 26;
    const row = Math.floor(v * N);
    const off = (row % 2) * 0.5;
    const gx = (u + off / N) * N, gy = v * N;
    const lx = gx - Math.floor(gx) - 0.5, ly = gy - Math.floor(gy) - 0.5;
    const d = Math.hypot(lx, ly);
    const hole = smoothstep(0.34, 0.26, d);
    const brush = valueNoise(u * 500, v * 10, 500, S);
    const dust = fbm(u * 9, v * 9, { octaves: 4, period: 9, seed: S + 17 });

    let l = 0.245 + brush * 0.022 - dust * 0.020;
    l = mix(l, 0.030, hole);              // 穴の中は暗い
    o.r = l * 0.99; o.g = l * 1.0; o.b = l * 1.0;
    o.h = -hole * 0.9 + brush * 0.15;
    o.rough = clamp01(0.34 + dust * 0.2 + hole * 0.4);
    o.metal = clamp01(1 - hole * 0.7);
    o.ao = clamp01(1 - hole * 0.75);
  },

  /* --- 金網フェンス（菱形。線の間は抜ける） --- */
  chainlink(u, v, o, S) {
    /*
     * 以前は色と凹凸だけで菱形を描いていたため、不透明な板のままだった。
     * 遠景では模様が潰れて一続きの帯になり、近景では模様の縁が
     * ぎざぎざに光っていた。線のある所だけを残して抜く。
     *
     * 実物の金網は 2 インチ（50mm）目。repeat 1.8（1 タイル ≒ 0.56m）で
     * N = 11 なら、菱形の一辺が約 51mm になる。
     */
    const N = 11;
    // 線の中心は dA が 0 になる所。dA が 0.5 の所が目の中心（穴）。
    const dA = Math.abs(((u + v) * N) % 1 - 0.5);
    const dB = Math.abs(((u - v) * N) % 1 - 0.5);
    /*
     * 線の太さ。
     * 隣り合う線の間隔は dA でちょうど 1.0 に相当し、
     * 実寸では 50mm ÷ √2 ≒ 35mm。針金 3.5mm はその 1 割なので
     * 半幅 0.05。ただし 512px の 1 タイルだと 3px しか無く、
     * ミップに落ちた途端に消えてしまうため少しだけ太らせてある。
     */
    const W0 = 0.075, W1 = 0.040;
    const wA = smoothstep(W0, W1, dA);
    const wB = smoothstep(W0, W1, dB);
    const wire = Math.max(wA, wB);
    // 手前を通る線（交点で上下に編まれている）
    const over = wA > wB ? wA : -wB;
    const round = Math.sin(Math.min(1, wire) * Math.PI * 0.5);
    const rust = smoothstep(0.66, 0.92, fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 11 }));
    const micro = valueNoise(u * 400, v * 400, 400, S + 3);

    const l = 0.245 + round * 0.055 + micro * 0.014;
    let r = l * 0.98, g = l * 1.0, b = l * 1.0;
    r = mix(r, l * 1.4, rust); g = mix(g, l * 0.76, rust); b = mix(b, l * 0.44, rust);
    o.r = r; o.g = g; o.b = b;
    // 針金の丸みと編みの前後を法線に出す
    o.h = round * 0.6 + over * 0.4;
    /*
     * 亜鉛メッキの針金は、磨いた金属ではなく白く曇った金属。
     * 金属度を 1 にしていたため、遠目には鏡の板になり、
     * 視界を横切る水面のような帯が出ていた。
     */
    o.rough = clamp01(0.62 + rust * 0.28 + micro * 0.08);
    o.metal = clamp01(0.45 - rust * 0.30);
    o.ao = clamp01(0.55 + round * 0.45);
    o.a = wire;
  },

  /* --- 家具の張り地（平織りの布。麻袋とは別物） --- */
  upholstery(u, v, o, S) {
    /*
     * fabric（麻袋・テント地）しか布が無かったので、
     * ソファも寝具も事務椅子も麻袋の目になっていた。
     * こちらは織り目を細かくし、毛羽で角を丸める。
     */
    const N = 190;                            // 麻袋の 56 に対して 3 倍以上細かい
    const wu = (u * N) % 1, wv = (v * N) % 1;
    const over = ((Math.floor(u * N) + Math.floor(v * N)) % 2) === 0;
    const weave = over ? Math.sin(wu * Math.PI) : Math.sin(wv * Math.PI);
    // 毛羽（織り目を少し曇らせる。これが無いと硬いナイロンに見える）
    const nap = fbm(u * 240, v * 240, { octaves: 3, period: 240, seed: S + 5 });
    // 生地の張りムラ（座面のたわみ）
    const slack = fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 23 });
    const wear = smoothstep(0.74, 0.97, fbm(u * 9, v * 9, { octaves: 3, period: 9, seed: S + 41 }));

    const l = (0.150 + weave * 0.020 + nap * 0.014 + slack * 0.012) * (1 - wear * 0.10);
    o.r = l * 1.00; o.g = l * 0.96; o.b = l * 0.90;
    o.h = weave * 0.30 + nap * 0.20 + slack * 0.50;
    o.rough = clamp01(0.90 + nap * 0.08 - wear * 0.06);
    o.metal = 0;
    o.ao = clamp01(0.80 + weave * 0.20 - slack * 0.10);
  },

  /* --- 寝具（綿。しわが主役） --- */
  bedding(u, v, o, S) {
    // 大きなしわ → 中くらいのたるみ → 織り目、の 3 段
    const foldA = ridged(u * 3.2, v * 3.2, { octaves: 3, period: 3.2, seed: S });
    const foldB = ridged(u * 9, v * 9, { octaves: 3, period: 9, seed: S + 13 });
    const N = 220;
    const weave = Math.sin(((u * N) % 1) * Math.PI) * Math.sin(((v * N) % 1) * Math.PI);
    const nap = valueNoise(u * 300, v * 300, 300, S + 7);

    const crease = foldA * 0.7 + foldB * 0.3;
    const l = 0.235 + crease * 0.045 + weave * 0.008 + nap * 0.010;
    o.r = l * 1.00; o.g = l * 0.99; o.b = l * 0.96;
    o.h = crease * 0.85 + weave * 0.15;
    o.rough = clamp01(0.93 + nap * 0.06);
    o.metal = 0;
    // しわの谷に影を溜める
    o.ao = clamp01(0.62 + crease * 0.38);
  },

  /* --- 化粧板（家具の面材。木目プリント＋薄い艶） --- */
  melamine(u, v, o, S) {
    /*
     * たんす・棚・カウンターの面材。
     * 無垢材のテクスチャを貼ると木目が強すぎて丸太に見えるので、
     * 「印刷された木目」らしく、柄を薄く・一定方向に流す。
     */
    const grain = fbm(u * 2.4, v * 90, { octaves: 4, period: 90, seed: S });
    const ring = Math.abs(Math.sin((v * 7.5 + grain * 2.2) * Math.PI));
    const pore = valueNoise(u * 180, v * 620, 620, S + 11);
    // 表面の艶（薄いオレンジピール）
    const peel = fbm(u * 30, v * 30, { octaves: 3, period: 30, seed: S + 29 });
    const scuff = smoothstep(0.90, 0.995, fbm(u * 16, v * 16, { octaves: 3, period: 16, seed: S + 47 }));

    const l = 0.230 + ring * 0.045 + grain * 0.020 + pore * 0.008;
    o.r = l * 1.00; o.g = l * 0.84; o.b = l * 0.66;
    // 印刷なので凹凸はほぼ無い。艶のうねりだけ
    o.h = peel * 0.25 + pore * 0.1;
    o.rough = clamp01(0.30 + peel * 0.10 + scuff * 0.35);
    o.metal = 0;
    o.ao = 1;
  },

  /* --- メラミン天板（流し台・カウンター・事務机） --- */
  laminate(u, v, o, S) {
    // 細かい粒の柄（無地だと樹脂の板に見えない）
    const fleck = valueNoise(u * 420, v * 420, 420, S);
    const fleck2 = smoothstep(0.80, 0.94, valueNoise(u * 210, v * 210, 210, S + 3));
    const peel = fbm(u * 26, v * 26, { octaves: 3, period: 26, seed: S + 17 });
    const scratch = smoothstep(0.90, 0.995, ridged(u * 40, v * 14, { octaves: 3, period: 40, seed: S + 31 }));
    const stain = smoothstep(0.82, 0.98, fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 53 }));

    let l = 0.255 + fleck * 0.016 + fleck2 * 0.020;
    l *= 1 - stain * 0.12;
    o.r = l * 0.99; o.g = l * 0.98; o.b = l * 0.94;
    o.h = peel * 0.2 - scratch * 0.5;
    o.rough = clamp01(0.24 + peel * 0.08 + scratch * 0.4 + stain * 0.14);
    o.metal = 0;
    o.ao = 1;
  },

  /*
   * --- 長尺塩ビシート（共用廊下・事務所の床） ---
   *
   * これまで床には laminate（艶あり樹脂板）を暗く着色して使っていた。
   * laminate は明度 0.255・粗さ 0.24 で、家具の天板には合うが
   * 床に敷くと「暗い鏡」になる。屋根の下の外廊下を撮ったら、
   * 空を映して床が一面の紺色になっていた。
   * 明るさを色で上げようとしても、色は掛け算なので下地より明るくならない。
   *
   * 床は床として焼く。明度 0.38 前後、粗さ 0.62 前後の艶消し。
   * 1.82m ごとの熱溶接の継ぎ目と、細かい石目の柄を入れる。
   */
  vinylSheet(u, v, o, S) {
    // 石目調の細かい粒（無地だと塩ビに見えない）
    const fleck = valueNoise(u * 380, v * 380, 380, S);
    const fleck2 = smoothstep(0.74, 0.93, valueNoise(u * 150, v * 150, 150, S + 5));
    const vein = fbm(u * 22, v * 22, { octaves: 4, period: 22, seed: S + 11 });
    /*
     * 熱溶接の継ぎ目。1 タイル 0.91m なので 2 タイルで 1 本にすると
     * 実寸 1.82m ごとになる。ここだけわずかに窪んで艶が変わる。
     */
    const seamV = Math.abs(((u * 0.5) % 1) - 0.5);
    const seam = 1 - smoothstep(0.0, 0.006, seamV);
    // 歩行帯の擦れ（面で薄く。高さで変えると繰り返しの帯になる）
    const traffic = smoothstep(0.55, 0.95, fbm(u * 3.5, v * 3.5, { octaves: 4, period: 4, seed: S + 37 }));
    const scuff = smoothstep(0.86, 0.995, ridged(u * 60, v * 22, { octaves: 3, period: 60, seed: S + 61 }));

    const l = 0.375 + fleck * 0.022 + fleck2 * 0.03 + vein * 0.02 - seam * 0.05;
    o.r = l * 0.99; o.g = l * 1.0; o.b = l * 0.98;
    o.h = fleck2 * 0.25 + vein * 0.15 - seam * 0.9;
    // 艶消し。歩行帯だけ少し磨かれて滑らかになる
    o.rough = clamp01(0.66 + fleck * 0.06 - traffic * 0.12 + scuff * 0.1);
    o.metal = 0;
    o.ao = clamp01(0.96 - seam * 0.2);
  },

  /* --- 白物家電の塗装（冷蔵庫・洗濯機・自販機） --- */
  applianceWhite(u, v, o, S) {
    // 粉体塗装のごく浅いゆず肌
    const peel = fbm(u * 90, v * 90, { octaves: 3, period: 90, seed: S });
    const wave = fbm(u * 7, v * 7, { octaves: 3, period: 7, seed: S + 9 });
    const smudge = smoothstep(0.72, 0.96, fbm(u * 12, v * 12, { octaves: 4, period: 12, seed: S + 23 }));
    const chip = smoothstep(0.965, 0.995, fbm(u * 34, v * 34, { octaves: 3, period: 34, seed: S + 41 }));

    let l = 0.400 + peel * 0.010 + wave * 0.008;
    l = mix(l, 0.16, chip);                    // 欠けは下地の鋼板
    o.r = l * 1.00; o.g = l * 1.00; o.b = l * 0.99;
    /*
     * ゆず肌は「言われれば判る」程度に留める。
     * 0.35 では法線が立ちすぎて、冷蔵庫が漆喰塗りの壁のように見えた。
     */
    o.h = peel * 0.06 - chip * 0.5;
    o.rough = clamp01(0.18 + peel * 0.06 + smudge * 0.18 + chip * 0.5);
    o.metal = chip * 0.8;
    o.ao = clamp01(1 - chip * 0.2);
  },

  /* --- 葉の板（鉢植え・街路樹。葉と葉の間が抜ける） --- */
  leafCard(u, v, o, S) {
    /*
     * 板に緑を塗ると必ず「割れた緑のガラス」に見える。
     * 葉の形に切り抜き、主脈と側脈を法線に出す。
     * 1 タイルに 3×3 枚。
     */
    const N = 3;
    const gx = u * N, gy = v * N;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    let lx = gx - cx - 0.5, ly = gy - cy - 0.5;
    // 枚ごとに向きと大きさを変える
    const rot = hash01(cx * 13 + cy * 71 + S) * Math.PI;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const rxp = lx * cs - ly * sn, ryp = lx * sn + ly * cs;
    const scale = 0.72 + hash01(cx * 7 + cy * 29 + S + 5) * 0.5;
    const ax = rxp / (0.20 * scale), ay = ryp / (0.44 * scale);

    // 葉身：先の尖った楕円
    const taper = 1 - Math.abs(ay) * 0.45;
    const d = Math.hypot(ax / Math.max(0.15, taper), ay);
    const leaf = smoothstep(1.02, 0.94, d);
    if (leaf <= 0) { o.r = o.g = o.b = 0; o.a = 0; o.rough = 1; o.metal = 0; o.ao = 1; o.h = 0; return; }

    // 主脈と側脈
    const mid = smoothstep(0.10, 0.0, Math.abs(ax));
    const side = Math.abs(Math.sin((ay * 7 + Math.abs(ax) * 3) * Math.PI));
    const vein = mid * 0.7 + (1 - side) * 0.25;
    const tone = hash01(cx * 31 + cy * 17 + S + 11);
    const dry = smoothstep(0.86, 1.0, d);       // 縁が少し枯れる

    let r = 0.055 + tone * 0.030, g = 0.130 + tone * 0.055, bl = 0.038 + tone * 0.020;
    r = mix(r, 0.150, dry); g = mix(g, 0.115, dry); bl = mix(bl, 0.045, dry);
    const sh = 0.86 + vein * 0.20;
    o.r = r * sh; o.g = g * sh; o.b = bl * sh;
    o.h = vein * 0.8 + (1 - d) * 0.2;
    o.rough = clamp01(0.62 + dry * 0.25 - vein * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.7 + leaf * 0.3);
    o.a = leaf;
  },

  /* --- エキスパンドメタル（グレーチング・足場） --- */
  expandedMetal(u, v, o, S) {
    const NX = 14, NY = 8;
    const row = Math.floor(v * NY);
    const off = (row % 2) * 0.5;
    const gx = (u + off / NX) * NX, gy = v * NY;
    const lx = gx - Math.floor(gx) - 0.5, ly = gy - Math.floor(gy) - 0.5;
    // 菱形の抜き
    const dia = Math.abs(lx) + Math.abs(ly) * 1.6;
    const open = smoothstep(0.30, 0.24, dia);
    const strand = 1 - open;
    const twist = Math.abs(ly) * 2;             // 板が捻れて立ち上がる
    const galv = valueNoise(u * 260, v * 260, 260, S);
    const grime = fbm(u * 7, v * 7, { octaves: 4, period: 7, seed: S + 23 });

    let l = (0.230 + galv * 0.030 + twist * 0.020) * strand + 0.030 * open;
    l *= 1 - grime * 0.24;
    o.r = l * 0.98; o.g = l * 0.99; o.b = l * 1.0;
    o.h = strand * (0.4 + twist * 0.6) - open * 0.6;
    o.rough = clamp01(0.42 + grime * 0.3 + galv * 0.08);
    o.metal = clamp01(strand * 0.95);
    o.ao = clamp01(0.3 + strand * 0.7);
  },

  /* --- 緑青の銅（屋根・配管・装飾） --- */
  copperPatina(u, v, o, S) {
    const base = fbm(u * 5, v * 5, { octaves: 5, period: 5, seed: S });
    const patch = smoothstep(0.42, 0.62, fbm(u * 3, v * 3, { octaves: 5, period: 3, seed: S + 17 }));
    const drip = smoothstep(0.60, 0.92, fbm(u * 8, v * 1.5, { octaves: 4, period: 8, seed: S + 31 }));
    const micro = valueNoise(u * 300, v * 300, 300, S + 43);

    // 地の銅
    let r = 0.180 + base * 0.030, g = 0.098 + base * 0.020, b = 0.055 + base * 0.012;
    // 緑青
    const pl = 0.150 + base * 0.030 + micro * 0.012;
    r = mix(r, pl * 0.42, patch); g = mix(g, pl * 1.0, patch); b = mix(b, pl * 0.84, patch);
    r = mix(r, pl * 0.50, drip * 0.6); g = mix(g, pl * 1.05, drip * 0.6); b = mix(b, pl * 0.90, drip * 0.6);
    o.r = r; o.g = g; o.b = b;
    o.h = patch * 0.35 + micro * 0.2;
    o.rough = clamp01(0.24 + patch * 0.62 + micro * 0.06);
    o.metal = clamp01(1 - patch * 0.85);
    o.ao = clamp01(0.94 - patch * 0.1);
  },

  /* --- アルマイト（アルミサッシ・什器） --- */
  anodized(u, v, o, S) {
    const extrude = valueNoise(u * 800, v * 10, 800, S);
    const micro = valueNoise(u * 400, v * 400, 400, S + 5);
    const dust = fbm(u * 7, v * 7, { octaves: 4, period: 7, seed: S + 19 });
    const l = 0.300 + extrude * 0.022 + micro * 0.010 - dust * 0.018;
    o.r = l * 0.99; o.g = l * 1.0; o.b = l * 1.01;
    o.h = extrude * 0.3 + micro * 0.15;
    o.rough = clamp01(0.28 + micro * 0.1 + dust * 0.14);
    o.metal = 1;
    o.ao = 0.97;
  },

  /* --- 印刷紙（ポスター・書類・ラベル） --- */
  paperPrint(u, v, o, S) {
    const fiber = valueNoise(u * 400, v * 400, 400, S);
    const fold = smoothstep(0.72, 0.95, ridged(u * 5, v * 5, { octaves: 3, period: 5, seed: S + 11 }));
    const yellowing = fbm(u * 3, v * 3, { octaves: 4, period: 3, seed: S + 23 });
    // 印刷面（帯とブロック）
    const band = smoothstep(0.10, 0.13, v) * (1 - smoothstep(0.27, 0.30, v));
    const block = smoothstep(0.55, 0.58, v) * (1 - smoothstep(0.86, 0.89, v))
      * smoothstep(0.12, 0.15, u) * (1 - smoothstep(0.85, 0.88, u));
    const text = smoothstep(0.55, 0.75, valueNoise(u * 90, v * 220, 90, S + 37)) * block;

    let l = 0.400 + fiber * 0.020 - fold * 0.045;
    l *= 1 - yellowing * 0.10;
    let r = l * 1.0, g = l * 0.985, b = l * 0.94;
    r = mix(r, 0.11, band); g = mix(g, 0.055, band); b = mix(b, 0.045, band);
    r = mix(r, 0.055, text); g = mix(g, 0.055, text); b = mix(b, 0.058, text);
    o.r = r; o.g = g; o.b = b;
    o.h = fiber * 0.2 - fold * 0.6;
    o.rough = clamp01(0.86 + fiber * 0.1 - band * 0.14);
    o.metal = 0;
    o.ao = clamp01(0.94 - fold * 0.2);
  },

  /* --- 陶器（便器・洗面台・食器） --- */
  porcelain(u, v, o, S) {
    const glaze = fbm(u * 14, v * 14, { octaves: 3, period: 14, seed: S });
    const orange = fbm(u * 40, v * 40, { octaves: 3, period: 40, seed: S + 7 });   // ゆず肌
    // 貫入（釉薬の細かいひび）
    const craze = (1 - smoothstep(0.0, 0.004, voronoiEdge(u * 26, v * 26, 26, S + 23, 1)))
      * smoothstep(0.5, 0.8, fbm(u * 4, v * 4, { octaves: 3, period: 4, seed: S + 41 }));
    const stain = smoothstep(0.82, 0.98, fbm(u * 9, v * 9, { octaves: 4, period: 9, seed: S + 53 }));

    let l = 0.415 + glaze * 0.012 + orange * 0.008 - craze * 0.055 - stain * 0.075;
    o.r = l * 1.0; o.g = l * 1.0; o.b = l * 0.99;
    o.h = orange * 0.2 - craze * 0.3;
    o.rough = clamp01(0.06 + orange * 0.05 + craze * 0.25 + stain * 0.3);
    o.metal = 0;
    o.ao = clamp01(0.98 - craze * 0.08);
  },

  /* --- 液晶画面（消灯時。反射で見せる） --- */
  screenPanel(u, v, o, S) {
    // サブピクセルの縞
    const sub = ((u * 340) % 1);
    const rgbBand = sub < 0.333 ? 0 : sub < 0.666 ? 1 : 2;
    const grid = smoothstep(0.0, 0.10, ((v * 340) % 1)) * smoothstep(0.0, 0.06, ((u * 340) % 1));
    const dust = smoothstep(0.90, 0.99, valueNoise(u * 200, v * 200, 200, S + 7));
    const smear = fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 19 });

    const l = 0.022 + grid * 0.010 + smear * 0.006;
    o.r = l * (rgbBand === 0 ? 1.35 : 0.9);
    o.g = l * (rgbBand === 1 ? 1.35 : 0.9);
    o.b = l * (rgbBand === 2 ? 1.35 : 0.95);
    o.h = grid * 0.3;
    o.rough = clamp01(0.05 + dust * 0.4 + smear * 0.10);
    o.metal = 0;
    o.ao = 1;
  },

  /* --- 発泡スチロール（梱包材・断熱材） --- */
  foam(u, v, o, S) {
    const cell = worley(u * 60, v * 60, 60, S, 1);
    const bead = smoothstep(0.34, 0.10, cell.f1);
    const edge = smoothstep(0.0, 0.045, voronoiEdge(u * 60, v * 60, 60, S, 1));
    const micro = valueNoise(u * 420, v * 420, 420, S + 5);
    const dirt = smoothstep(0.80, 0.97, fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 23 }));

    let l = 0.400 + bead * 0.020 + micro * 0.010 - (1 - edge) * 0.055 - dirt * 0.06;
    o.r = l * 1.0; o.g = l * 1.0; o.b = l * 0.985;
    o.h = bead * 0.55 - (1 - edge) * 0.45;
    o.rough = clamp01(0.94 + micro * 0.05);
    o.metal = 0;
    o.ao = clamp01(0.72 + edge * 0.28);
  },

  /* --- 麻袋（土嚢・荷物） --- */
  burlap(u, v, o, S) {
    const N = 44;
    const gx = u * N, gy = v * N;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const over = ((cx + cy) % 2) === 0;
    const bump = over ? Math.sin(lx * Math.PI) : Math.sin(ly * Math.PI);
    // 織り目の隙間
    const gap = (1 - smoothstep(0.0, 0.16, Math.min(lx, 1 - lx)))
      * (1 - smoothstep(0.0, 0.16, Math.min(ly, 1 - ly)));
    const fuzz = valueNoise(u * 380, v * 380, 380, S + 3);
    const stain = fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 19 });

    let l = 0.205 + bump * 0.035 + fuzz * 0.018 - gap * 0.075;
    l *= 1 - stain * 0.18;
    o.r = l * 1.0; o.g = l * 0.87; o.b = l * 0.62;
    o.h = bump * 0.6 + (over ? 0.2 : 0) - gap * 0.5;
    o.rough = clamp01(0.94 + fuzz * 0.05);
    o.metal = 0;
    o.ao = clamp01(0.7 + bump * 0.3 - gap * 0.2);
  },

  /* ================================================================
   *  汚し（既存の面に重ねて使う）
   * ================================================================ */

  /* --- 煤・焼け跡 --- */
  soot(u, v, o, S) {
    const smoke = fbm(u * 4, v * 2, { octaves: 6, period: 4, seed: S });
    const flake = smoothstep(0.62, 0.90, fbm(u * 26, v * 26, { octaves: 3, period: 26, seed: S + 13 }));
    const micro = valueNoise(u * 340, v * 340, 340, S + 29);
    const l = 0.028 + smoke * 0.030 + micro * 0.008 - flake * 0.010;
    o.r = l * 1.0; o.g = l * 0.97; o.b = l * 0.94;
    o.h = flake * 0.4 + micro * 0.2;
    o.rough = clamp01(0.96 + micro * 0.04);
    o.metal = 0;
    o.ao = clamp01(0.7 + smoke * 0.3);
  },

  /* --- 苔 --- */
  moss(u, v, o, S) {
    const clump = fbm(u * 12, v * 12, { octaves: 5, period: 12, seed: S });
    const fuzz = valueNoise(u * 420, v * 420, 420, S + 3);
    const tuft = smoothstep(0.45, 0.85, fbm(u * 40, v * 40, { octaves: 3, period: 40, seed: S + 11 }));
    const dry = smoothstep(0.70, 0.95, fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 31 }));

    let l = 0.062 + clump * 0.035 + tuft * 0.020 + fuzz * 0.010;
    let r = l * 0.62, g = l * 1.0, b = l * 0.40;
    r = mix(r, l * 0.95, dry); g = mix(g, l * 0.86, dry); b = mix(b, l * 0.42, dry);
    o.r = r; o.g = g; o.b = b;
    o.h = tuft * 0.55 + fuzz * 0.35 + clump * 0.1;
    o.rough = clamp01(0.92 + fuzz * 0.07);
    o.metal = 0;
    o.ao = clamp01(0.62 + tuft * 0.3);
  },

  /* ================================================================
   *  自然物・屋外
   * ================================================================ */

  /* --- 草地 --- */
  grass(u, v, o, S) {
    // 葉の向きを揃えすぎると芝生に見えないので、房ごとに向きを変える
    const clump = fbm(u * 7, v * 7, { octaves: 5, period: 7, seed: S });
    const dir = fbm(u * 3, v * 3, { octaves: 3, period: 3, seed: S + 5 });
    const blade = valueNoise(u * 300 + dir * 40, v * 90, 300, S + 11);
    const blade2 = valueNoise(u * 120, v * 340 - dir * 30, 340, S + 23);
    const dry = smoothstep(0.55, 0.9, fbm(u * 4, v * 4, { octaves: 4, period: 4, seed: S + 37 }));
    const bare = smoothstep(0.72, 0.94, fbm(u * 5, v * 5, { octaves: 5, period: 5, seed: S + 53 }));

    let l = 0.070 + clump * 0.030 + blade * 0.022 + blade2 * 0.016;
    let r = l * 0.60, g = l * 1.0, b = l * 0.38;
    // 枯れ
    r = mix(r, l * 1.05, dry); g = mix(g, l * 0.90, dry); b = mix(b, l * 0.42, dry);
    // 土が見える部分
    r = mix(r, 0.085, bare); g = mix(g, 0.066, bare); b = mix(b, 0.046, bare);
    o.r = r; o.g = g; o.b = b;
    o.h = blade * 0.5 + blade2 * 0.35 + clump * 0.15;
    o.rough = clamp01(0.90 + blade * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.60 + clump * 0.32);
  },

  /* --- 葉むら（植栽・生垣） --- */
  foliage(u, v, o, S) {
    // 葉 1 枚ずつをセルで作り、重なりで陰影を出す
    const c = worley(u * 26, v * 26, 26, S, 1);
    const leaf = smoothstep(0.34, 0.10, c.f1);
    const id = hash01(u, v, 26, S);
    const vein = 1 - smoothstep(0.0, 0.035, voronoiEdge(u * 26, v * 26, 26, S, 1));
    const depth = fbm(u * 5, v * 5, { octaves: 5, period: 5, seed: S + 19 });
    const sun = smoothstep(0.45, 0.95, depth);

    let l = 0.055 + leaf * 0.030 + id * 0.020 + sun * 0.028;
    let r = l * 0.52, g = l * 1.0, b = l * 0.34;
    // 内側の葉は暗く青みがかる
    r = mix(r * 0.55, r, sun); g = mix(g * 0.62, g, sun); b = mix(b * 0.75, b, sun);
    o.r = r; o.g = g; o.b = b;
    o.h = leaf * 0.7 - vein * 0.2 + depth * 0.2;
    o.rough = clamp01(0.72 + leaf * 0.14);
    o.metal = 0;
    o.ao = clamp01(0.45 + leaf * 0.3 + sun * 0.25);
  },

  /* --- 樹皮 --- */
  bark(u, v, o, S) {
    // 縦に裂けた溝。ドメインワープで直線的になりすぎるのを防ぐ
    const [wx, wy] = warp(u * 6, v * 2.2, 0.5, { octaves: 3, period: 6, seed: S });
    const crack = 1 - smoothstep(0.0, 0.06, Math.abs(fbmP(wx, wy, { octaves: 5, period: 6, seed: S + 3 }) - 0.5));
    const ridge = ridged(u * 9, v * 2.5, { octaves: 4, period: 9, seed: S + 11 });
    const grain = valueNoise(u * 200, v * 60, 200, S + 23);
    const moss = smoothstep(0.70, 0.94, fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: S + 41 }));

    let l = 0.062 + ridge * 0.040 + grain * 0.016 - crack * 0.035;
    let r = l * 1.0, g = l * 0.82, b = l * 0.62;
    r = mix(r, l * 0.60, moss); g = mix(g, l * 0.92, moss); b = mix(b, l * 0.48, moss);
    o.r = r; o.g = g; o.b = b;
    o.h = ridge * 0.6 + grain * 0.15 - crack * 0.8;
    o.rough = clamp01(0.92 + grain * 0.06);
    o.metal = 0;
    o.ao = clamp01(0.82 - crack * 0.42);
  },

  /* --- 水面（浅い水たまり・水路） --- */
  water(u, v, o, S) {
    // さざ波を 2 方向重ねる
    const a = fbm(u * 9 + 0.0, v * 9, { octaves: 4, period: 9, seed: S });
    const b2 = fbm(u * 14 - 3.0, v * 11, { octaves: 4, period: 14, seed: S + 7 });
    const ripple = (a * 0.6 + b2 * 0.4);
    const debris = smoothstep(0.86, 0.99, fbm(u * 30, v * 30, { octaves: 3, period: 30, seed: S + 29 }));
    const l = 0.052 + ripple * 0.020;
    o.r = l * 0.62; o.g = l * 0.86; o.b = l * 1.0;
    o.h = ripple * 0.55 + debris * 0.15;
    o.rough = clamp01(0.04 + ripple * 0.05 + debris * 0.5);
    o.metal = 0;
    o.ao = 1;
  },

  /* ================================================================
   *  街路・汚れ・掲示物
   * ================================================================ */

  /* --- 落書き（壁のスプレー） --- */
  graffiti(u, v, o, S) {
    /*
     * タグ（署名）を模す。
     *
     * 最初はドメインワープした fbm の等高線をストロークに使ったが、
     * 閉じたループばかりになって「絡まった紐」にしか見えなかった。
     * 実際のタグは、太い斜めの筆致を何本か重ね、その上から
     * 黒で縁取り、さらに一部へ明るい差し色を入れて作られる。
     * ここではその構成をそのまま組む。
     */
    const wall = 0.250 + fbm(u * 6, v * 6, { octaves: 5, period: 6, seed: S + 61 }) * 0.045;
    let r = wall, g = wall * 0.995, b = wall * 0.98;

    // 描かれている範囲（壁いっぱいだと落書きに見えない）
    const inArea = smoothstep(0.06, 0.14, u) * smoothstep(0.06, 0.14, 1 - u)
                 * smoothstep(0.22, 0.32, v) * smoothstep(0.10, 0.20, 1 - v);
    if (inArea > 0.001) {
      /**
       * 1 本の筆致。
       * 中心 (cx,cy) を通り、角度 ang に伸びる帯。
       * 進む向きに沿って波打たせ、端は細くすぼめる。
       */
      const stroke = (cx, cy, ang, len, thick, wob) => {
        const dx = u - cx, dy = v - cy;
        const c = Math.cos(ang), sn = Math.sin(ang);
        const lx = dx * c + dy * sn;
        let ly = -dx * sn + dy * c;
        ly += Math.sin(lx * wob) * 0.045;                  // 筆の振り
        const t = clamp01(1 - Math.abs(lx) / len);          // 端で細くなる
        if (t <= 0) return 0;
        const w = thick * (0.45 + t * 0.55);
        return 1 - smoothstep(w * 0.55, w, Math.abs(ly));
      };

      // 筆致（太い順に重ねる）
      const s1 = stroke(0.30, 0.55, -0.55, 0.26, 0.085, 22);
      const s2 = stroke(0.52, 0.48, 0.42, 0.22, 0.075, 26);
      const s3 = stroke(0.70, 0.58, -0.62, 0.20, 0.070, 30);
      const s4 = stroke(0.45, 0.70, 0.10, 0.30, 0.045, 18);
      const body = clamp01(Math.max(Math.max(s1, s2), Math.max(s3, s4)));

      // 同じ形をひと回り太らせたものが縁取りになる
      const o1 = stroke(0.30, 0.55, -0.55, 0.28, 0.135, 22);
      const o2 = stroke(0.52, 0.48, 0.42, 0.24, 0.125, 26);
      const o3 = stroke(0.70, 0.58, -0.62, 0.22, 0.118, 30);
      const o4 = stroke(0.45, 0.70, 0.10, 0.32, 0.082, 18);
      const outline = clamp01(Math.max(Math.max(o1, o2), Math.max(o3, o4)));

      const mist = fbm(u * 45, v * 45, { octaves: 3, period: 45, seed: S + 53 });
      // 縁取り（黒）→ 本体（差し色）の順に乗せる
      const ol = outline * inArea;
      r = mix(r, 0.030, ol); g = mix(g, 0.030, ol); b = mix(b, 0.034, ol);
      const bd = body * inArea;
      r = mix(r, 0.225 + mist * 0.02, bd);
      g = mix(g, 0.060 + mist * 0.02, bd);
      b = mix(b, 0.055 + mist * 0.02, bd);
      // ハイライト（本体の片側だけ明るく）
      const hi = clamp01(body - stroke(0.30, 0.585, -0.55, 0.24, 0.055, 22)) * inArea;
      r = mix(r, 0.255, hi * 0.5); g = mix(g, 0.215, hi * 0.5); b = mix(b, 0.060, hi * 0.5);
      // 吹きこぼれ（スプレーのミスト）
      const spray = smoothstep(0.55, 0.95, mist) * outline * 0.35 * inArea;
      r = mix(r, 0.16, spray); g = mix(g, 0.09, spray); b = mix(b, 0.09, spray);

      o.h = -ol * 0.05;
      o.rough = clamp01(0.86 - bd * 0.22 + mist * 0.05);
      o.r = r; o.g = g; o.b = b;
      o.metal = 0;
      o.ao = 0.95;
      return;
    }

    o.r = r; o.g = g; o.b = b;
    o.h = 0;
    o.rough = 0.88;
    o.metal = 0;
    o.ao = 0.95;
  },

  /* --- 油染み（駐車場・工場の床） --- */
  oilStain(u, v, o, S) {
    const grit = worley(u * 60, v * 60, 60, S, 1).f1;
    const stone = smoothstep(0.24, 0.06, grit);
    const base = 0.090 + fbm(u * 8, v * 8, { octaves: 5, period: 8, seed: S + 3 }) * 0.030 + stone * 0.020;
    // 染みは滲んだ縁を持つ
    const blot = smoothstep(0.44, 0.72, fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S + 23 }));
    const core = smoothstep(0.58, 0.80, fbm(u * 4, v * 4, { octaves: 5, period: 4, seed: S + 23 }));
    const l = base * (1 - blot * 0.55);
    o.r = l * (1 + core * 0.25); o.g = l * (1 - core * 0.05); o.b = l * (1 - core * 0.18);
    o.h = stone * 0.5;
    // 油の乗った部分は照りが出る
    o.rough = clamp01(0.90 - blot * 0.55 - core * 0.20);
    o.metal = 0;
    o.ao = clamp01(0.88 - blot * 0.08);
  },

  /* --- 貼り紙だらけの壁 --- */
  posterWall(u, v, o, S) {
    const NX = 3, NY = 2;
    const gx = u * NX, gy = v * NY;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const id = ((cx * 37 + cy * 71) % 53) / 53;
    // 紙ごとに少しずれて貼られている
    const ox = (id - 0.5) * 0.10, oy = ((id * 7) % 1 - 0.5) * 0.10;
    const lx = gx - cx + ox, ly = gy - cy + oy;
    const inside = smoothstep(0.06, 0.10, lx) * smoothstep(0.06, 0.10, 1 - lx)
                 * smoothstep(0.06, 0.10, ly) * smoothstep(0.06, 0.10, 1 - ly);
    // 破れ
    const torn = smoothstep(0.55, 0.72, fbm((u + id) * 9, (v + id) * 9, { octaves: 4, period: 9, seed: S + cx + cy * 5 }));
    const paper = inside * (1 - torn * 0.9);
    const fiber = valueNoise(u * 260, v * 260, 260, S + 11);
    const ink = smoothstep(0.55, 0.70, valueNoise(u * 60, v * 150, 60, S + cx * 13)) * paper;
    const bandY = smoothstep(0.14, 0.18, ly) * (1 - smoothstep(0.34, 0.38, ly));

    const wall = 0.230 + fbm(u * 7, v * 7, { octaves: 5, period: 7, seed: S + 71 }) * 0.035;
    let r = wall, g = wall * 0.99, b = wall * 0.965;
    const pl = 0.395 + fiber * 0.018;
    r = mix(r, pl, paper); g = mix(g, pl * 0.99, paper); b = mix(b, pl * 0.95, paper);
    // 見出しの帯と本文
    r = mix(r, 0.185, paper * bandY * 0.9); g = mix(g, 0.055, paper * bandY * 0.9); b = mix(b, 0.050, paper * bandY * 0.9);
    r = mix(r, 0.075, ink * 0.8); g = mix(g, 0.075, ink * 0.8); b = mix(b, 0.078, ink * 0.8);
    o.r = r; o.g = g; o.b = b;
    o.h = paper * 0.45 + fiber * 0.1;
    o.rough = clamp01(0.88 - paper * 0.10);
    o.metal = 0;
    o.ao = clamp01(0.92 - (1 - inside) * 0.06);
  },

  /* --- 重度の錆（放置された鉄） --- */
  rustHeavy(u, v, o, S) {
    const layer = fbm(u * 5, v * 5, { octaves: 6, period: 5, seed: S });
    const flake = worley(u * 24, v * 24, 24, S + 11, 1);
    const scab = smoothstep(0.30, 0.12, flake.f1);
    const edge = smoothstep(0.0, 0.05, voronoiEdge(u * 24, v * 24, 24, S + 11, 1));
    const pit = smoothstep(0.14, 0.04, worley(u * 70, v * 70, 70, S + 29, 1).f1);
    const grit = valueNoise(u * 300, v * 300, 300, S + 43);
    // 錆は上から下へ流れる
    const run = smoothstep(0.52, 0.90, fbm(u * 10, v * 2, { octaves: 4, period: 10, seed: S + 61 }));

    let l = 0.095 + layer * 0.055 + scab * 0.030 + grit * 0.014 - pit * 0.030;
    l = mix(l, l * 0.82, 1 - edge);
    let r = l * 1.0, g = l * (0.52 + layer * 0.10), b = l * (0.28 + layer * 0.06);
    r = mix(r, l * 1.1, run * 0.5); g = mix(g, l * 0.46, run * 0.5); b = mix(b, l * 0.24, run * 0.5);
    o.r = r; o.g = g; o.b = b;
    o.h = scab * 0.55 + grit * 0.2 - pit * 0.6 - (1 - edge) * 0.2;
    o.rough = clamp01(0.93 + grit * 0.06);
    o.metal = clamp01(0.20 - scab * 0.18);
    o.ao = clamp01(0.72 + edge * 0.24 - pit * 0.2);
  },

  /* --- 網戸・防虫網 --- */
  meshScreen(u, v, o, S) {
    /*
     * 養生ネット・網戸。
     *
     * 以前は抜きが無かったため、足場に張ると濃紺の板になり、
     * 建物が箱で塞がれたように見えていた。
     * 目の粗さは残しつつ、線と線の間を抜く。
     * 実物も「向こうが透けるが、はっきりとは見えない」ので、
     * 線を少し太めにして半分ほど塞ぐ。
     */
    const N = 46;
    const wx = Math.abs(((u * N) % 1) - 0.5);
    const wy = Math.abs(((v * N) % 1) - 0.5);
    /*
     * 線の太さは目の 1 割強に留める。
     * ここを太くすると、ミップに落ちたときの平均 α が 0.5 を超えて
     * alphaTest が全面を通してしまい、また不透明な板に戻る。
     */
    const wire = Math.max(smoothstep(0.17, 0.09, wx), smoothstep(0.17, 0.09, wy));
    const dust = fbm(u * 8, v * 8, { octaves: 4, period: 8, seed: S + 13 });
    // 織りのゆらぎ（ぴんと張っていない）
    const slack = fbm(u * 3, v * 3, { octaves: 3, period: 3, seed: S + 29 });
    const l = 0.075 + dust * 0.020 + slack * 0.012;
    o.r = l; o.g = l * 1.01; o.b = l * 1.0;
    o.h = wire * 0.6 + slack * 0.3;
    o.rough = clamp01(0.62 + dust * 0.24);
    o.metal = clamp01(0.6);
    o.ao = clamp01(0.28 + wire * 0.72);
    o.a = wire;
  },

  /* --- 足場板（使い込まれた木の板） --- */
  scaffoldPlank(u, v, o, S) {
    const N = 3;                                    // 板の枚数
    const row = Math.floor(v * N);
    const ly = v * N - row;
    const gap = (1 - smoothstep(0.0, 0.045, ly)) + (1 - smoothstep(0.0, 0.045, 1 - ly));
    const id = ((row * 53) % 61) / 61;
    const grain = fbm((u + id * 3) * 7, (v + id) * 220, { octaves: 4, period: 220, seed: S + row * 7 });
    const ring = Math.abs(Math.sin((ly * 4.5 + grain * 3 + id * 9) * Math.PI));
    const paint = smoothstep(0.55, 0.85, fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 31 }));
    const cement = smoothstep(0.62, 0.92, fbm(u * 12, v * 12, { octaves: 4, period: 12, seed: S + 47 }));
    const split = smoothstep(0.90, 0.99, ridged(u * 40, v * 6, { octaves: 3, period: 40, seed: S + 59 }));

    let l = 0.185 + grain * 0.040 + ring * 0.030 - gap * 0.10 - split * 0.04;
    let r = l * 1.0, g = l * 0.84, b = l * 0.62;
    // 使い込まれてセメントや塗料が付いている
    r = mix(r, l * 1.18, cement); g = mix(g, l * 1.20, cement); b = mix(b, l * 1.24, cement);
    r = mix(r, l * 0.72, paint * 0.4); g = mix(g, l * 0.90, paint * 0.4); b = mix(b, l * 1.05, paint * 0.4);
    o.r = r; o.g = g; o.b = b;
    o.h = ring * 0.2 + grain * 0.25 - gap * 0.9 - split * 0.5;
    o.rough = clamp01(0.86 + grain * 0.08 + cement * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.88 - gap * 0.55);
  },

  /* --- 波板ポリカ（半透明の屋根材） --- */
  corrugatedPlastic(u, v, o, S) {
    const p = (u * 26) % 1;
    const wave = Math.sin(p * Math.PI);
    const scratch = smoothstep(0.86, 0.99, ridged(u * 12, v * 50, { octaves: 3, period: 50, seed: S }));
    const dirt = fbm(u * 6, v * 3, { octaves: 5, period: 6, seed: S + 17 });
    const leaf = smoothstep(0.82, 0.97, fbm(u * 14, v * 14, { octaves: 3, period: 14, seed: S + 37 }));

    let l = 0.320 + wave * 0.026 - dirt * 0.075 - leaf * 0.06;
    o.r = l * 1.0; o.g = l * 0.99; o.b = l * 0.93;
    o.h = wave * 0.9;
    o.rough = clamp01(0.12 + dirt * 0.42 + scratch * 0.28 + leaf * 0.3);
    o.metal = 0;
    o.ao = clamp01(0.78 + wave * 0.2);
  },

  /* --- テント地（日除け・露店） --- */
  awningFabric(u, v, o, S) {
    const N = 6;                                    // ストライプ
    const stripe = Math.floor(u * N) % 2;
    const weave = Math.abs(Math.sin(u * TAU * 190)) * 0.5 + Math.abs(Math.sin(v * TAU * 190)) * 0.5;
    const fade = fbm(u * 3, v * 3, { octaves: 4, period: 3, seed: S + 11 });
    const stain = smoothstep(0.68, 0.94, fbm(u * 7, v * 4, { octaves: 4, period: 7, seed: S + 29 }));

    const base = 0.300 + weave * 0.022 - fade * 0.030 - stain * 0.045;
    let r, g, b;
    if (stripe) { r = base * 1.0; g = base * 0.98; b = base * 0.92; }      // 生成り
    else { r = base * 0.92; g = base * 0.42; b = base * 0.30; }            // 赤
    o.r = r; o.g = g; o.b = b;
    o.h = weave * 0.55;
    o.rough = clamp01(0.88 + weave * 0.08);
    o.metal = 0;
    o.ao = clamp01(0.80 + weave * 0.18);
  },

  /* --- 太陽光パネル --- */
  solarPanel(u, v, o, S) {
    const NX = 6, NY = 10;
    const gx = u * NX, gy = v * NY;
    const lx = gx - Math.floor(gx), ly = gy - Math.floor(gy);
    const G = 0.035;
    const cell = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx)
               * smoothstep(0, G * NX / NY, ly) * smoothstep(0, G * NX / NY, 1 - ly);
    // セル内の集電フィンガー
    const finger = 1 - smoothstep(0.02, 0.05, Math.abs(((lx * 8) % 1) - 0.5));
    const busbar = 1 - smoothstep(0.03, 0.06, Math.abs(ly - 0.5));
    const dust = fbm(u * 9, v * 9, { octaves: 4, period: 9, seed: S + 19 });

    let l = 0.030 + (1 - cell) * 0.10 + dust * 0.012;
    let r = l * 0.72, g = l * 0.80, b = l * 1.0;   // 反射防止膜の青
    const metalLine = clamp01((finger * 0.5 + busbar) * cell);
    r = mix(r, 0.34, metalLine); g = mix(g, 0.345, metalLine); b = mix(b, 0.35, metalLine);
    o.r = r; o.g = g; o.b = b;
    o.h = (1 - cell) * 0.4 + metalLine * 0.2;
    o.rough = clamp01(0.08 + dust * 0.42 + (1 - cell) * 0.3);
    o.metal = clamp01(0.3 + metalLine * 0.65);
    o.ao = clamp01(0.82 + cell * 0.18);
  },

  /* --- 古レンガ（角が丸く欠けた） --- */
  brickOld(u, v, o, S) {
    const NX = 4.5, NY = 13;
    const row = Math.floor(v * NY);
    const off = (row % 2) * 0.5;
    const gx = (u + off / NX) * NX, gy = v * NY;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    const lx = gx - cx, ly = gy - cy;
    const id = hash01(u + off / NX, v, NX, S + row * 17);
    // 角の欠けを輪郭に乗せる
    const nibble = fbm((u + id) * 60, (v + id) * 60, { octaves: 3, period: 60, seed: S + cx + cy * 3 }) * 0.035;
    const G = 0.045 + nibble;
    const inside = smoothstep(0, G, lx) * smoothstep(0, G, 1 - lx)
                 * smoothstep(0, G * NX / NY, ly) * smoothstep(0, G * NX / NY, 1 - ly);
    const grit = fbm((u + id) * 150, (v + id) * 150, { octaves: 4, period: 150, seed: S + cx });
    const spall = smoothstep(0.74, 0.92, fbm((u + id * 2) * 22, (v + id) * 22, { octaves: 3, period: 22, seed: S + 41 }));
    const efflor = smoothstep(0.72, 0.95, fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: S + 67 }));
    const soot2 = smoothstep(0.60, 0.92, fbm(u * 3, v * 1.4, { octaves: 5, period: 3, seed: S + 83 }));

    const brickL = 0.150 + id * 0.060 + grit * 0.035 - spall * 0.030;
    const jointL = 0.225 + grit * 0.030;
    let l = mix(jointL, brickL, inside);
    l *= 1 - soot2 * 0.22;
    let r = l * mix(1.0, 1.30, inside), g = l * mix(1.0, 0.72, inside), b = l * mix(0.96, 0.58, inside);
    r = mix(r, l * 1.20, efflor); g = mix(g, l * 1.20, efflor); b = mix(b, l * 1.18, efflor);
    o.r = r; o.g = g; o.b = b;
    o.h = inside * 0.75 + grit * 0.15 - spall * 0.35;
    o.rough = clamp01(0.90 + grit * 0.08);
    o.metal = 0;
    o.ao = clamp01(mix(0.40, 0.94, inside) - spall * 0.1);
  },

  /* --- 泥（濡れて艶が出る） --- */
  mud(u, v, o, S) {
    const [wx, wy] = warp(u * 6, v * 6, 0.6, { octaves: 3, period: 6, seed: S });
    const flow = fbmP(wx, wy, { octaves: 5, period: 6, seed: S + 7 });
    const crack = (1 - smoothstep(0.0, 0.012, voronoiEdge(u * 11, v * 11, 11, S + 23, 1)))
      * smoothstep(0.55, 0.85, fbm(u * 3, v * 3, { octaves: 3, period: 3, seed: S + 47 }));
    const stone = smoothstep(0.12, 0.04, worley(u * 45, v * 45, 45, S + 61, 1).f1);
    const wet = smoothstep(0.42, 0.80, flow);
    const grit = valueNoise(u * 260, v * 260, 260, S + 71);

    let l = 0.088 + flow * 0.045 + stone * 0.030 + grit * 0.012 - crack * 0.030;
    l *= 1 - wet * 0.22;
    o.r = l * 1.0; o.g = l * 0.84; o.b = l * 0.62;
    o.h = flow * 0.4 + stone * 0.35 - crack * 0.5;
    o.rough = clamp01(0.92 - wet * 0.62 + grit * 0.06);
    o.metal = 0;
    o.ao = clamp01(0.82 - crack * 0.25);
  },
};
