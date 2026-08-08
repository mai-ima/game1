/**
 * 「軽くするための省略」で絵がどれだけ変わるかを数える。
 *
 * 同じセッションの中で入／切を切り替えて同じ画を撮り、画素の差を出す。
 * 目視だけだと「たぶん同じ」で済ませてしまうので、
 * 平均差・最大差・目に付く差の画素率を並べる。
 *
 *   node tools/visualdiff.mjs <ibl|shadow|both> [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const what = process.argv[2] || 'both';
const url = process.argv[3] || 'http://127.0.0.1:4173/?rawgpu&quality=igpu';
const outDir = process.argv[4] || `shots/diff-${what}`;
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const SWITCH = {
  ibl:    { name: 'ざらつき面の鏡面IBL省略', on: 'm.setDropRoughIBL(true)', off: 'm.setDropRoughIBL(false)' },
  shadow: { name: '影のぼかしを1回に',       on: 'm.setCheapShadows(true)', off: 'm.setCheapShadows(false)' },
  both:   { name: '両方',
            on: 'm.setDropRoughIBL(true); m.setCheapShadows(true)',
            off: 'm.setDropRoughIBL(false); m.setCheapShadows(false)' },
};
const sw = SWITCH[what];
if (!sw) { console.error('第 1 引数は ibl / shadow / both のいずれか'); process.exit(1); }

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 506 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('ERR', e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 300000 }).catch(() => {});

await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game.paused = true;
  d.hud.hide();
  d.engine.autoResolution = false;
  for (const c of d.engine.viewScene.children) c.visible = false;
})()`);

const view = (from, look, fov) => page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE;
  const cam = d.engine.camera;
  cam.fov = ${fov}; cam.updateProjectionMatrix();
  cam.position.set(${from.join(',')});
  cam.lookAt(new THREE.Vector3(${look.join(',')}));
  cam.updateMatrixWorld();
  // 点光源は近い順に割り当て直される。止めていると前の場所のままなので促す
  d.engine.lightPool.snap(cam.position);
})()`);

const grab = (slot) => page.evaluate(`(() => {
  const d = window.__DEV, r = d.engine.renderer;
  d.engine.render(0.016);
  const gl = r.getContext();
  const w = r.domElement.width, h = r.domElement.height;
  const buf = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  window['__g${slot}'] = buf;
  return w * h;
})()`);

const diff = () => page.evaluate(`(() => {
  const a = window.__gA, b = window.__gB;
  let sum = 0, max = 0, over4 = 0, over12 = 0;
  const n = a.length / 4;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const d = Math.max(Math.abs(a[j] - b[j]), Math.abs(a[j+1] - b[j+1]), Math.abs(a[j+2] - b[j+2]));
    sum += d; if (d > max) max = d;
    if (d > 4) over4++;
    if (d > 12) over12++;
  }
  return JSON.stringify({
    平均差: +(sum / n).toFixed(2), 最大差: max,
    差4超: +(over4 / n * 100).toFixed(2), 差12超: +(over12 / n * 100).toFixed(2),
  });
})()`);

// 影が大きく写る視点を選ぶ（差が出るなら、まず影の縁に出る）
const spots = [
  ['中央広場', [0, 1.7, 20], [0, 3, 0], 78],
  ['市場通り', [16, 1.7, 16], [16, 2, -8], 78],
  ['工事現場', [-46, 1.7, 24], [-46, 4, -6], 78],
  ['車両基地', [30, 1.7, 4], [46, 3, 0], 80],
  ['影の縁',   [6, 1.6, -14], [-6, 1.2, -2], 70],
  ['俯瞰',     [0, 30, 48], [0, 2, 0], 74],
];

console.log(`${sw.name} — 入／切での画素差（0 に近いほど同じ絵）\n`);
let worst = 0;
for (const [name, from, look, fov] of spots) {
  await view(from, look, fov);

  await page.evaluate(`(() => { const m = window.__DEV.game.mats; ${sw.on}; })()`);
  await page.waitForTimeout(1000);
  await grab('A');
  await page.screenshot({ path: `${outDir}/${name}_軽量.png`, timeout: 180000 });

  await page.evaluate(`(() => { const m = window.__DEV.game.mats; ${sw.off}; })()`);
  await page.waitForTimeout(1000);
  await grab('B');
  await page.screenshot({ path: `${outDir}/${name}_通常.png`, timeout: 180000 });

  const d = JSON.parse(await diff());
  worst = Math.max(worst, d.差12超);
  console.log(`  ${name.padEnd(6, '　')} 平均 ${String(d.平均差).padStart(5)} / 最大 ${String(d.最大差).padStart(3)} ` +
    `/ 差4超 ${String(d.差4超).padStart(6)}% / 差12超 ${String(d.差12超).padStart(6)}%`);
}
console.log(`\n目に付く差（12/255 超）が出た画素の最大割合: ${worst}%`);

await browser.close();
