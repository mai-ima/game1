/**
 * ライティングの寄与を切り分ける。
 * 同じ構図で要素を 1 つずつ止め、壁・空・地面の色を測る。
 * 「何が画面を白くしているのか」を推測ではなく実測で決めるための道具。
 *
 *   node tools/lightlab.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const outDir = 'shots/lightlab';
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

// 主屋の壁が画面中央に大きく写る構図に固定する
await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game.paused = true;
  d.engine.autoResolution = false;
  d.hud.hide();
  const cam = d.engine.camera;
  cam.position.set(-6, 2.0, 12);
  cam.lookAt(0, 2.4, 0);
  cam.updateMatrixWorld();
})()`);
await page.waitForTimeout(9000);

/** 画面中央（壁）と上部（空）、下部（地面）を測る */
const measure = () => page.evaluate(`(() => {
  const e = window.__DEV.engine;
  const src = e.captureFrame(0.016);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const W = 160, H = 90;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      const region = (x0, y0, x1, y1) => {
        let r = 0, gg = 0, b = 0, n = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
        }
        return [Math.round(r / n), Math.round(gg / n), Math.round(b / n)];
      };
      res(JSON.stringify({ 壁: region(60, 35, 110, 60), 空: region(10, 3, 60, 15), 地面: region(50, 78, 120, 88) }));
    };
    img.onerror = () => res('{}');
    img.src = src;
  });
})()`);

const step = async (name, expr) => {
  if (expr) await page.evaluate(expr);
  await page.waitForTimeout(2600);
  console.log(name.padEnd(26), await measure());
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
};

await step('00_現状', null);
await step('01_ブルーム停止', 'window.__DEV.engine.bloomPass.enabled = false');
await step('02_合成パス停止', 'window.__DEV.engine.compositePass.enabled = false');
await step('03_空スケール半分', 'window.__DEV.engine._skyScale.value = 0.05');
await step('04_環境マップ0', 'window.__DEV.engine.scene.environmentIntensity = 0');
await step('05_半球光0', 'window.__DEV.engine.hemi.intensity = 0');
await step('06_フィル0', 'window.__DEV.engine.fill.intensity = 0');
await step('07_太陽のみ', 'window.__DEV.engine.sun.intensity = 3.6');
// 戻して、ブルームと合成だけ復帰させる
await step('08_太陽のみ+合成', `(() => {
  const e = window.__DEV.engine;
  e.compositePass.enabled = true;
})()`);

await browser.close();
