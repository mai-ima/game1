/**
 * PNG の画素を読む（外部依存なし）。
 *
 * 「霞の色が空と合っているか」は、絵の上で同じ場所の
 * 画素を並べないと判定できない。ライブラリを増やしたくないので、
 * 非圧縮化だけ自前でやる。zlib は Node に入っている。
 *
 *   node tools/pixel.mjs <画像> x,y x,y ...
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readPng(path) {
  const buf = readFileSync(path);
  let p = 8;               // シグネチャ
  let width = 0, height = 0, depth = 0, ctype = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    p += len + 12;
  }
  if (depth !== 8) throw new Error(`8bit 以外は未対応: ${depth}`);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error(`未対応のカラータイプ: ${ctype}`);

  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * ch);
  const stride = width * ch;
  let q = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[q++];
    const line = raw.subarray(q, q + stride);
    q += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = (prev && i >= ch) ? prev[i - ch] : 0;
      let v = line[i];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: break;
      }
      cur[i] = v & 0xff;
    }
  }
  return { width, height, channels: ch, data: out };
}

if (process.argv[1]?.endsWith('pixel.mjs')) {
  const img = readPng(process.argv[2]);
  console.log(`${img.width}x${img.height} ch=${img.channels}`);
  for (const s of process.argv.slice(3)) {
    const [x, y] = s.split(',').map(Number);
    const i = (img.width * y + x) * img.channels;
    console.log(`(${x},${y})`, img.data[i], img.data[i + 1], img.data[i + 2]);
  }
}
