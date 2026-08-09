/**
 * 線形値をトーンマップして、画面に出る色を求める。
 *
 * 霞の色は「トーンマップ前の放射輝度」で持っているので、
 * そのままでは画面の見た目と比べられない。
 * three と同じ ACES を通してから、実際に撮った絵の画素と突き合わせる。
 *
 *   node tools/tonecheck.mjs <r,g,b> [露出] [比較する画像 x y]
 */
import { readPng } from './pixel.mjs';

const IN = [
  [0.59719, 0.35458, 0.04823],
  [0.07600, 0.90834, 0.01566],
  [0.02840, 0.13383, 0.83777],
];
const OUT = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];
const mul = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const fit = (v) => v.map((x) => {
  const a = x * (x + 0.0245786) - 0.000090537;
  const b = x * (0.983729 * x + 0.4329510) + 0.238081;
  return a / b;
});
const sat = (v) => v.map((x) => Math.min(1, Math.max(0, x)));
const srgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

/** three の ACESFilmicToneMapping と同じ計算 */
export function aces(rgb, exposure = 1.0) {
  const c = rgb.map((x) => x * exposure / 0.6);
  return sat(mul(OUT, fit(mul(IN, c))));
}

export const toSrgb8 = (v) => v.map((x) => Math.round(srgb(x) * 255));

// 他から import されたときは何も表示しない
if (process.argv[1]?.endsWith('tonecheck.mjs')) {
  const rgb = (process.argv[2] || '0,0,0').split(',').map(Number);
  const exposure = +(process.argv[3] || 1.0);
  const lin = aces(rgb, exposure);
  console.log('線形入力      :', rgb.map((v) => +v.toFixed(4)).join(', '));
  console.log('トーンマップ後 :', lin.map((v) => +v.toFixed(4)).join(', '));
  console.log('画面の 8bit   :', toSrgb8(lin).join(', '));

  if (process.argv[4]) {
    const png = readPng(process.argv[4]);
    const x = +process.argv[5], y = +process.argv[6];
    const i = (png.width * y + x) * png.channels;
    console.log(`画像 ${process.argv[4]} (${x},${y}) :`, png.data[i], png.data[i + 1], png.data[i + 2]);
  }
}
