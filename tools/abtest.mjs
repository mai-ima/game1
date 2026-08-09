/**
 * 同じ視点を、設定だけ変えて撮り比べる。
 *
 * 「この縞は色収差なのか、法線のエイリアスなのか」は、
 * 片方を切って撮り直せば 1 回で判る。
 * 目で見て推測するより速い。
 *
 *   node tools/abtest.mjs <出力先> <url> "x,y,z|lx,ly,lz|fov" "名前=JS式" ...
 *
 * JS 式は d（__DEV）を受け取る文字列。例:
 *   "noab=d.engine.compositePass.uniforms.uAberration.value=0"
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const outDir = process.argv[2];
const url = process.argv[3];
const [from, look, fov] = process.argv[4].split('|');
const cases = process.argv.slice(5).map((s) => {
  const i = s.indexOf('=');
  return { name: s.slice(0, i), code: s.slice(i + 1) };
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
  const cam = d.engine.camera, THREE = d.THREE;
  cam.fov = ${+(fov || 74)}; cam.updateProjectionMatrix();
  cam.position.set(${from});
  cam.lookAt(new THREE.Vector3(${look}));
  cam.updateMatrixWorld();
  d.engine.lightPool.snap(cam.position);
  for (const c of d.engine.viewScene.children) c.visible = false;
})()`);

for (const c of cases) {
  const err = await page.evaluate(`(() => { const d = window.__DEV; try { ${c.code}; return null; } catch (e) { return String(e.message); } })()`);
  if (err) console.log(`${c.name}: 設定に失敗 — ${err}`);
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${outDir}/${c.name}.png`, timeout: 240000 });
  console.log('撮影:', c.name);
}
console.log(errors.length ? 'エラー: ' + [...new Set(errors)].slice(0, 3).join(' / ') : 'JS エラーなし');
await browser.close();
