/**
 * 露出とライティングの数値診断。
 *
 * 同じ構図で設定を振りながら、画面の輝度分布を測る。
 *   白飛び率  … いずれかのチャンネルが 250 以上の画素の割合
 *   黒潰れ率  … 輝度 8 未満の画素の割合
 *   平均輝度 / 中央値
 *   彩度      … 平均の (max-min)/max
 *
 * 目視だけだと「明るい絵」と「破綻した絵」の区別がつかないので数値で見る。
 *
 *   node tools/exposure.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const outDir = 'shots/exposure';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('[エラー]', e.message); });

await page.goto(`${url}?rawgpu&quality=high`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});

// 構図を固定し、解像度も固定する
await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game.paused = true;
  d.engine.autoResolution = false;
  d.hud.hide();
  const cam = d.engine.camera;
  cam.position.set(-9.5, 3.4, 16.5);
  cam.lookAt(2, 1.6, -4);
  cam.updateMatrixWorld();
})()`);
await page.waitForTimeout(8000);

/** 現在のフレームの輝度分布を測る */
const measure = () => page.evaluate(`(() => {
  const e = window.__DEV.engine;
  const url = e.captureFrame(0.016);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const W = 200, H = 112;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      const n = W * H;
      let blown = 0, crushed = 0, sum = 0, sat = 0;
      const lum = new Float32Array(n);
      for (let i = 0, k = 0; i < d.length; i += 4, k++) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        if (mx >= 250) blown++;
        const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        lum[k] = l;
        if (l < 8) crushed++;
        sum += l;
        sat += mx > 0 ? (mx - mn) / mx : 0;
      }
      // 代表領域の平均色を取る（全体平均だと空と地面に埋もれて建物が見えない）
      const region = (x0, y0, x1, y1) => {
        let r = 0, g2 = 0, b = 0, cnt = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          r += d[i]; g2 += d[i + 1]; b += d[i + 2]; cnt++;
        }
        return [Math.round(r / cnt), Math.round(g2 / cnt), Math.round(b / cnt)];
      };
      lum.sort();
      res(JSON.stringify({
        空: region(20, 5, 80, 25),
        日向の壁: region(90, 30, 120, 55),
        日陰の壁: region(60, 55, 85, 70),
        地面日向: region(140, 90, 190, 108),
        地面日陰: region(40, 90, 80, 108),
        白飛び率: +(blown / n).toFixed(3),
        黒潰れ率: +(crushed / n).toFixed(3),
        平均輝度: Math.round(sum / n),
        中央値: Math.round(lum[n >> 1]),
        上位5パーセント輝度: Math.round(lum[Math.floor(n * 0.95)]),
        彩度: +(sat / n).toFixed(3),
      }));
    };
    img.onerror = () => res('{}');
    img.src = url;
  });
})()`);

console.log('--- 現状 ---');
console.log(' ', await measure());
await page.screenshot({ path: `${outDir}/00_current.png`, timeout: 180000 });

/*
 * 候補を振る。
 * sun … 太陽光の強さ、exposure … トーンマップ露出、
 * hemi … 空と地面からの回り込み、fill … 逆側からの弱い光、
 * env … 環境マップ（IBL）の効き
 */
const cands = [
  { name: '01_sun3.0_exp0.85', sun: 3.0, exposure: 0.85, hemi: 0.35, fill: 0.30, env: 0.40 },
  { name: '02_sun2.4_exp0.80', sun: 2.4, exposure: 0.80, hemi: 0.30, fill: 0.26, env: 0.35 },
  { name: '03_sun2.0_exp0.75', sun: 2.0, exposure: 0.75, hemi: 0.26, fill: 0.22, env: 0.32 },
  { name: '04_sun1.7_exp0.72', sun: 1.7, exposure: 0.72, hemi: 0.24, fill: 0.20, env: 0.30 },
  { name: '05_sun1.4_exp0.68', sun: 1.4, exposure: 0.68, hemi: 0.22, fill: 0.18, env: 0.28 },
  { name: '06_sun2.0_exp0.60', sun: 2.0, exposure: 0.60, hemi: 0.26, fill: 0.22, env: 0.32 },
];

console.log('\n--- 候補 ---');
for (const c of cands) {
  await page.evaluate(`(() => {
    const e = window.__DEV.engine;
    e.tune({ sunIntensity: ${c.sun}, exposure: ${c.exposure}, hemiIntensity: ${c.hemi}, fillIntensity: ${c.fill} });
    e.scene.environmentIntensity = ${c.env};
  })()`);
  await page.waitForTimeout(2500);
  const m = await measure();
  console.log(' ', c.name.padEnd(22), m);
  await page.screenshot({ path: `${outDir}/${c.name}.png`, timeout: 180000 });
}

await browser.close();
