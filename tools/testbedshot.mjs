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

// 歩いた目線で撮る（この施設は歩いて回る前提で作ってある）
const EYE = 1.68;
await shoot('a_全景', [0, 96, 118], [0, 0, -6], 84);
await shoot('a2_真上', [0, 150, 1], [0, 0, 0], 78);
await shoot('b_中央広場', [0, EYE, 20], [0, 3.5, 0], 76);
await shoot('c_東西通路_西から', [-84, EYE, 0], [30, 1.6, 0], 72);
await shoot('d_東西通路_東から', [84, EYE, 0], [-30, 1.6, 0], 72);
await shoot('e_南北通路_南から', [0, EYE, 66], [0, 2.0, -20], 72);
await shoot('f_博物館_外観', [0, EYE, -22], [0, 4.0, -40], 76);
await shoot('g_博物館_1室', [-17, EYE, -36], [-17, 1.4, -50], 76);
await shoot('h_博物館_3室', [19, EYE, -36], [19, 1.6, -50], 76);
await shoot('i_実験場', [-56, EYE, -8], [-56, 1.2, -34], 78);
await shoot('j_ギミック', [58, EYE, -10], [58, 2.0, -34], 78);
await shoot('k_建物街', [-50, EYE, 10], [-50, 2.4, 30], 78);
await shoot('l_建物街_道', [-78, EYE, 32], [-24, 2.0, 32], 66);
await shoot('m_資材置き場', [52, EYE, 12], [52, 1.4, 32], 78);
await shoot('n_マテリアル見本', [-24, EYE, 28], [-24, 1.2, 46], 76);
await shoot('o_試作場', [26, EYE, 26], [26, 1.2, 46], 76);
await shoot('p_射撃場', [-50, EYE, 71], [20, 1.4, 62], 62);

console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
