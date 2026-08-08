/**
 * マップを俯瞰と目線の両方で撮る。
 * 建物や道の作りを目で確かめるためのもの。
 *
 *   node tools/mapshot.mjs [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=high';
const outDir = process.argv[3] || 'shots/map';
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
await page.waitForFunction('!!window.__DEV', null, { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 300000 }).catch(() => {});

await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game.paused = true;
  d.hud.hide();
  d.engine.autoResolution = false;
})()`);

/** 位置と向きを指定して撮る */
const shoot = async (name, from, look, fov = 70) => {
  await page.evaluate(`(() => {
    const d = window.__DEV, THREE = d.THREE;
    const cam = d.engine.camera;
    cam.fov = ${fov}; cam.updateProjectionMatrix();
    cam.position.set(${from.join(',')});
    cam.lookAt(new THREE.Vector3(${look.join(',')}));
    cam.updateMatrixWorld();
    // ビューモデル（手元の銃）は邪魔なので隠す
    for (const c of d.engine.viewScene.children) c.visible = false;
  })()`);
  await page.waitForTimeout(3400);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
  console.log('撮影:', name);
};

// 俯瞰（全体・西半分・東半分）
await shoot('a_俯瞰_全体', [-9, 92, 78], [-9, 0, 0], 62);
await shoot('b_俯瞰_西', [-41, 52, 34], [-41, 0, -6], 66);
await shoot('c_俯瞰_東', [16, 44, 30], [14, 0, 0], 66);

// 目線
await shoot('d_工事現場_南から', [-41, 1.7, 22], [-41, 4, -6], 78);
await shoot('e_工事現場_躯体内', [-41, 4.0, 2], [-44, 3.4, -12], 82);
await shoot('f_仮囲いの入口', [-26, 1.7, -11], [-38, 2.0, -8], 80);
await shoot('g_中央広場', [0, 1.7, 20], [0, 3.0, 0], 78);
await shoot('h_市場通り', [16, 1.7, 16], [16, 2.0, -8], 78);
await shoot('i_コンテナ置場', [-16, 1.7, 16], [-20, 2.0, -4], 78);
await shoot('j_主屋2階', [-4, 5.2, 4], [6, 4.0, -4], 80);

console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
