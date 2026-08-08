/**
 * 画質プリセットごとの見た目を同一構図で撮り比べる。
 * 「画質が変に低下する」の切り分け用。
 *
 *   node tools/qualityshots.mjs [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const outDir = process.argv[3] || 'shots/quality';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

/** 同じ視点で各画質を撮る */
const shoot = async (quality, label) => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
  const errs = [];
  page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errs.push(e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });

  await page.goto(`${url}?rawgpu&quality=${quality}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
  await page.evaluate('window.__DEV.startMatch()');
  await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});

  // 決まった視点に固定する（構図を揃えないと比較にならない）
  await page.evaluate(`(() => {
    const d = window.__DEV, g = d.game, THREE = d.THREE;
    g.paused = true;
    const cam = d.engine.camera;
    cam.position.set(-9.5, 3.4, 16.5);
    cam.lookAt(2, 1.6, -4);
    cam.updateMatrixWorld();
    d.hud.hide();
  })()`);
  await page.waitForTimeout(9000);
  await page.evaluate('window.__DEV.engine.render(0.016)');
  await page.waitForTimeout(2500);

  const info = await page.evaluate(`JSON.stringify({
    画質: window.__DEV.engine.quality,
    解像度: window.__DEV.engine.renderSize,
    倍率: window.__DEV.engine.renderScale,
    影: window.__DEV.engine.renderer.shadowMap.enabled,
    パス: window.__DEV.engine.composer.passes.filter(p => p.enabled !== false).length,
    GPU: window.__DEV.engine.gpu.name.slice(0, 60),
  })`);
  await page.screenshot({ path: `${outDir}/${label}.png`, timeout: 180000 });
  console.log(label.padEnd(10), info, errs.length ? `エラー: ${errs[0]}` : '');
  await page.close();
};

for (const q of ['low', 'medium', 'high', 'ultra', 'igpu']) await shoot(q, q);
await browser.close();
