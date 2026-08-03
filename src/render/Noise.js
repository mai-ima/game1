/**
 * タイリング可能な手続き型ノイズ群。
 * すべて周期 (period) 付きの格子を使うため、生成したテクスチャは継ぎ目なくタイルする。
 */

const F = Math.floor;

/** 整数ハッシュ (xorshift ベース) → [0,1) */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393) ^ (y * 668265263) ^ (seed * 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** 2成分ハッシュ (セルラーノイズの特徴点用) */
export function hash2v(x, y, seed = 0) {
  return [hash2(x, y, seed), hash2(x, y, seed + 9871)];
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (v, p) => ((v % p) + p) % p;

/** 周期付き値ノイズ */
export function valueNoise(x, y, period, seed = 0) {
  const xi = F(x), yi = F(y);
  const xf = x - xi, yf = y - yi;
  const x0 = wrap(xi, period), x1 = wrap(xi + 1, period);
  const y0 = wrap(yi, period), y1 = wrap(yi + 1, period);
  const u = fade(xf), v = fade(yf);
  return lerp(
    lerp(hash2(x0, y0, seed), hash2(x1, y0, seed), u),
    lerp(hash2(x0, y1, seed), hash2(x1, y1, seed), u),
    v
  );
}

/** 周期付き Perlin (勾配) ノイズ → [-1,1] */
export function perlin(x, y, period, seed = 0) {
  const xi = F(x), yi = F(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const g = (gx, gy, dx, dy) => {
    const a = hash2(wrap(gx, period), wrap(gy, period), seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  return lerp(
    lerp(g(xi, yi, xf, yf), g(xi + 1, yi, xf - 1, yf), u),
    lerp(g(xi, yi + 1, xf, yf - 1), g(xi + 1, yi + 1, xf - 1, yf - 1), u),
    v
  );
}

/** フラクタルブラウン運動 (値ノイズ版) → [0,1] */
export function fbm(x, y, opts = {}) {
  const { octaves = 5, lacunarity = 2, gain = 0.5, period = 8, seed = 0 } = opts;
  let amp = 1, freq = 1, sum = 0, norm = 0, p = period;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, p, seed + i * 131) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
    p *= lacunarity;
  }
  return sum / norm;
}

/** Perlin FBM → [0,1] */
export function fbmP(x, y, opts = {}) {
  const { octaves = 5, lacunarity = 2, gain = 0.5, period = 8, seed = 0 } = opts;
  let amp = 1, freq = 1, sum = 0, norm = 0, p = period;
  for (let i = 0; i < octaves; i++) {
    sum += perlin(x * freq, y * freq, p, seed + i * 131) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
    p *= lacunarity;
  }
  return sum / norm * 0.5 + 0.5;
}

/** リッジドマルチフラクタル (岩・鉄錆の筋に有効) → [0,1] */
export function ridged(x, y, opts = {}) {
  const { octaves = 5, lacunarity = 2, gain = 0.5, period = 8, seed = 0 } = opts;
  let amp = 1, freq = 1, sum = 0, norm = 0, p = period;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(perlin(x * freq, y * freq, p, seed + i * 131));
    sum += n * n * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
    p *= lacunarity;
  }
  return sum / norm;
}

/**
 * 周期付き Worley (セルラー) ノイズ。
 * @returns {{f1:number, f2:number, id:number}} 最近傍距離・第2近傍距離・セルID
 */
export function worley(x, y, period, seed = 0, jitter = 1) {
  const xi = F(x), yi = F(y);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const wx = wrap(cx, period), wy = wrap(cy, period);
      const [rx, ry] = hash2v(wx, wy, seed);
      const px = cx + 0.5 + (rx - 0.5) * jitter;
      const py = cy + 0.5 + (ry - 0.5) * jitter;
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 555); }
      else if (d < f2) { f2 = d; }
    }
  }
  return { f1, f2, id };
}

/** ボロノイのエッジ距離 (タイル目地・ひび割れ用) */
export function voronoiEdge(x, y, period, seed = 0, jitter = 1) {
  const w = worley(x, y, period, seed, jitter);
  return w.f2 - w.f1;
}

/** 定義域歪み (domain warping) — 有機的な模様を作る */
export function warp(x, y, amount, opts = {}) {
  const qx = fbmP(x, y, { ...opts, seed: (opts.seed || 0) + 17 });
  const qy = fbmP(x, y, { ...opts, seed: (opts.seed || 0) + 43 });
  return [x + (qx - 0.5) * amount, y + (qy - 0.5) * amount];
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const mix = lerp;
