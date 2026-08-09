/**
 * 指定した視点を並べて撮る。向きの確認など、狙った場所だけ見たいとき用。
 *
 *   node tools/spotshot.mjs <出力先> <url> "名前|x,y,z|lx,ly,lz|fov" ...
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const outDir = process.argv[2];
const url = process.argv[3];
const spots = process.argv.slice(4).map((s) => {
  const [name, from, look, fov] = s.split('|');
  return { name, from: from.split(',').map(Number), look: look.split(',').map(Number), fov: +(fov || 74) };
});
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game.paused = true; d.hud.hide(); d.engine.autoResolution = false;
})()`);

for (const s of spots) {
  await page.evaluate(`(() => {
    const d = window.__DEV, THREE = d.THREE, cam = d.engine.camera;
    cam.fov = ${s.fov}; cam.updateProjectionMatrix();
    cam.position.set(${s.from.join(',')});
    cam.lookAt(new THREE.Vector3(${s.look.join(',')}));
    cam.updateMatrixWorld();
    d.engine.lightPool.snap(cam.position);
    for (const c of d.engine.viewScene.children) c.visible = false;
  })()`);
  await page.waitForTimeout(3400);
  await page.screenshot({ path: `${outDir}/${s.name}.png`, timeout: 240000 });
  console.log('撮影:', s.name);
}
console.log(errors.length ? 'エラー: ' + [...new Set(errors)].slice(0, 3).join(' / ') : 'JS エラーなし');
await browser.close();
