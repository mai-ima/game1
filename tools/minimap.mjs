/**
 * ミニマップの向きを検証する。
 *
 * 自機の前方に目印を置き、各方位を向いたときに
 * それがミニマップの「上」に描かれるかを画素で確かめる。
 * 南北を向いているときだけ偶然合う、という種類のバグを拾うため
 * 東西も含めた 8 方位を見る。
 *
 *   node tools/minimap.mjs [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const outDir = process.argv[3] || 'shots/minimap';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});

/*
 * ミニマップだけを大きく描いた検証用キャンバスを作る。
 * HUD 上の小さなミニマップを画面から切り出すより、
 * 同じ Minimap クラスに直接描かせたほうが確実で速い。
 */
await page.evaluate(`(() => {
  const d = window.__DEV;
  const cv = document.createElement('canvas');
  cv.id = 'mmtest';
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999';
  document.body.appendChild(cv);
  const Mini = d.hud.minimap.constructor;
  const m = new Mini(cv, { size: 320 });
  // 焼き込み済みの地形をそのまま借りる
  m.terrain = d.hud.minimap.terrain;
  m.terrainScale = d.hud.minimap.terrainScale;
  m.terrainOrigin = d.hud.minimap.terrainOrigin;
  m.bounds = d.hud.minimap.bounds;
  window.__MM = m;
})()`);

const dirs = [
  ['北 (yaw 0°)', 0], ['北東 (45°)', 45], ['東 (90°)', 90], ['南東 (135°)', 135],
  ['南 (180°)', 180], ['南西 (225°)', 225], ['西 (270°)', 270], ['北西 (315°)', 315],
];

let allOk = true;
for (const [label, deg] of dirs) {
  const r = JSON.parse(await page.evaluate(`(() => {
    const d = window.__DEV, m = window.__MM;
    const yaw = ${deg} * Math.PI / 180;
    const p = { x: 0, z: 0 };
    // 自機の 12m 前方に味方を 1 人置く（前方は (-sin, -cos)）
    const fx = -Math.sin(yaw) * 12, fz = -Math.cos(yaw) * 12;
    m.draw({
      playerPos: p, playerYaw: yaw, fov: 80,
      allies: [{ x: fx, z: fz, yaw }],
      enemies: [], objectives: [],
    });
    // 味方トークンの画素を探す（青 #4a90d9）
    const S = m.canvas.width;
    const g = m.canvas.getContext('2d');
    const img = g.getImageData(0, 0, S, S).data;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const R = img[i], G = img[i + 1], B = img[i + 2];
        if (B > 150 && B - R > 60 && G > 100 && G < 200) { sx += x; sy += y; n++; }
      }
    }
    if (!n) return JSON.stringify({ 見つからず: true });
    const cx = sx / n, cy = sy / n, C = S / 2;
    const ang = Math.atan2(cx - C, -(cy - C)) * 180 / Math.PI;   // 上を 0° とした時計回り
    return JSON.stringify({
      画素数: n,
      中心からのずれ: [+(cx - C).toFixed(1), +(cy - C).toFixed(1)],
      上からの角度: +ang.toFixed(1),
    });
  })()`));

  const ok = !r.見つからず && Math.abs(r.上からの角度) < 8;
  if (!ok) allOk = false;
  console.log(`${ok ? '○' : '×'} ${label.padEnd(14)} 前方の味方は上から ${r.上からの角度 ?? '?'}° の位置`);
  await page.screenshot({ path: `${outDir}/${String(deg).padStart(3, '0')}.png`, clip: { x: 0, y: 0, width: 320, height: 320 }, timeout: 120000 });
}

console.log(`\n判定: ${allOk ? '全方位で前方が上を向いている' : '向きがずれている方位がある'}`);
console.log(errors.length ? 'エラー:\n' + [...new Set(errors)].slice(0, 4).join('\n') : 'JS エラーなし');
await browser.close();
