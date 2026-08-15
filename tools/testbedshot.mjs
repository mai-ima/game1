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
/*
 * 視点は区画の中心から決める。
 * 手で書いていた頃は「博物館」など、とうに無くなった区画を撮り続けていた。
 * 区画を動かしたら、ここも一緒に動かすこと。
 */
const EYE = 1.68;
await shoot('a_全景', [0, 104, 126], [0, 0, -20], 84);
await shoot('a2_真上', [0, 168, 1], [0, 0, -20], 78);
await shoot('b_中央広場', [0, EYE, 20], [0, 3.5, 0], 76);
await shoot('c_東西通路_西から', [-84, EYE, 0], [30, 1.6, 0], 72);
await shoot('d_東西通路_東から', [84, EYE, 0], [-30, 1.6, 0], 72);
await shoot('e_南北通路_南から', [0, EYE, 66], [0, 2.0, -20], 72);

/* 02 室内試作場（x 5.6〜32.4 / 廊下 z -42.1） */
await shoot('f_室内試作場_廊下', [6, EYE, -42], [32, 1.7, -42], 74);
await shoot('g_室内_台所', [10.72, EYE, -43.4], [10.72, 1.4, -49], 82);
await shoot('h_室内_和室', [23.14, EYE, -43.4], [23.14, 1.3, -49], 82);
await shoot('h2_室内_洋室', [19.0, EYE, -43.4], [19.0, 1.4, -49], 82);

await shoot('i_実験場', [-58, EYE, -12], [-58, 1.2, -38], 78);
await shoot('j_ギミック', [58, EYE, -12], [58, 2.0, -38], 78);
await shoot('k_完成建物の展示', [-52, EYE, 6], [-52, 2.4, 30], 78);
await shoot('l_完成建物_道', [-80, EYE, 32], [-24, 2.0, 32], 66);
await shoot('m_完成小物の展示', [37, EYE, 8], [37, 1.4, 32], 78);
await shoot('n_マテリアル見本', [-24, EYE, -6], [-24, 1.2, -26], 76);
await shoot('o_試作場', [-50, EYE, 46], [-50, 1.2, 66], 76);
await shoot('r_地形試験場', [76, EYE, 16], [76, 1.2, 38], 76);

/* 09 射撃場（射座 x=10, z=64。的は東へ 5〜75m） */
await shoot('p_射撃場_射座から', [7, EYE, 64], [86, 1.5, 64], 58);
await shoot('p2_射撃場_的の列', [24, EYE, 58], [40, 1.3, 64], 70);
await shoot('p3_貫通の壁', [20, EYE, 67], [22, 1.3, 74], 74);

/* 11 建築試作場 / 12 小物試作場 */
await shoot('s_建築試作場', [0, EYE, -84], [0, 6, -108], 80);
await shoot('t_小物試作場', [-112, EYE, -10], [-112, 1.2, -32], 78);
await shoot('t2_小物_家具の列', [-118, EYE, -31], [-100, 0.9, -37], 74);
await shoot('t3_小物_和室の列', [-118, EYE, -39], [-100, 1.2, -45], 74);

console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
