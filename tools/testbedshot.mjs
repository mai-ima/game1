/**
 * テストベッドの各区画を撮る。
 * 検証用マップなので、名札が読めるかどうかまで含めて確かめる。
 *
 *   node tools/testbedshot.mjs [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=high&map=testbed';
const outDir = process.argv[3] || 'shots/testbed';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});

await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game.paused = true;
  d.hud.hide();
  d.engine.autoResolution = false;
})()`);

const shoot = async (name, from, look, fov = 74) => {
  await page.evaluate(`(() => {
    const d = window.__DEV, THREE = d.THREE;
    const cam = d.engine.camera;
    cam.fov = ${fov}; cam.updateProjectionMatrix();
    cam.position.set(${from.join(',')});
    cam.lookAt(new THREE.Vector3(${look.join(',')}));
    cam.updateMatrixWorld();
    d.engine.lightPool.snap(cam.position);
    for (const c of d.engine.viewScene.children) c.visible = false;
  })()`);
  await page.waitForTimeout(3600);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 240000 });
  console.log('撮影:', name);
};

await shoot('a_全景', [0, 46, 74], [0, 0, -2], 80);
await shoot('b_基準寸法', [-56, 3.0, 20], [-56, 1.5, 2], 74);
await shoot('c_移動検証', [-34, 4.5, 22], [-34, 1.0, 2], 76);
await shoot('c2_段差', [-42, 1.8, 16], [-26, 0.6, 11], 70);
await shoot('c3_斜面', [-34, 2.4, 0.5], [-34, 1.4, 8], 74);
await shoot('d_射撃', [-16, 2.2, 3.4], [40, 1.4, -1.2], 60);
await shoot('d2_貫通壁', [-13, 2.4, 14], [-2, 1.2, 12], 72);
await shoot('e_展示_収納', [11, 2.4, 17.5], [20, 0.9, 12], 70);
await shoot('e2_展示_大物', [6, 3.4, -6], [24, 2.0, -13], 74);
await shoot('e3_展示_設備', [11, 2.2, 8], [28, 1.8, 2], 72);
await shoot('f_マテリアル', [42, 3.6, 19], [50, 0.9, 3], 78);
await shoot('f2_マテリアル寄り', [49, 1.5, 16.4], [49, 1.0, 12], 52);
await shoot('g_屋内棟', [0, 2.2, -18], [0, 1.6, -30], 76);
await shoot('g2_屋内', [-9, 1.7, -30], [8, 1.6, -30], 80);

console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
