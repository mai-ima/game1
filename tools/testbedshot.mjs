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

// 通路を歩いた目線で撮る（この場は歩いて回る前提で作ってある）
const EYE = 1.68;
await shoot('a_全景', [0, 52, 76], [0, 0, -2], 82);
await shoot('b_通路_西から', [-58, EYE, 0], [20, 1.6, 0], 74);
await shoot('c_通路_東から', [58, EYE, 0], [-20, 1.6, 0], 74);
await shoot('d_01基準寸法', [-54, EYE, 2.2], [-54, 1.4, -9], 74);
await shoot('e_02移動', [-30, EYE, 2.2], [-30, 1.2, -12], 76);
await shoot('f_03小物', [-40, EYE, -1.6], [-40, 1.0, 10], 76);
await shoot('g_03設備', [-40, EYE, 6.5], [-40, 1.4, 16], 74);
await shoot('h_04家具', [-6, EYE, 1.8], [-6, 1.0, -10], 76);
await shoot('i_05大物', [-8, EYE, -1.6], [-8, 1.6, 14], 76);
await shoot('j_06建物', [26, EYE, 2.0], [26, 2.4, -14], 78);
await shoot('k_06建物_寄り', [15, EYE, -3.5], [24, 2.0, -12], 70);
await shoot('l_07マテリアル', [22, EYE, -1.6], [22, 1.0, 12], 76);
await shoot('m_07マテリアル寄り', [15.5, 1.45, 3.2], [15.5, 1.0, 6.2], 52);
await shoot('n_08射撃', [-52, EYE, 36], [10, 1.4, 30], 62);
await shoot('o_08貫通', [-42, EYE, 33], [-30, 1.4, 38.5], 70);
await shoot('p_屋内棟', [-6, EYE, -8], [-6, 1.6, -20], 78);

console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
