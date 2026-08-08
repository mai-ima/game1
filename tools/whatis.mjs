/**
 * 画面に映っている物の正体を調べる。
 *
 * 指定した視点から格子状にレイを飛ばし、当たったメッシュの
 * マテリアル名・距離・当たった点を並べる。
 * スクリーンショットと突き合わせれば、「この妙な模様は何か」が
 * 目分量ではなく名前で分かる。
 *
 *   node tools/whatis.mjs "x,y,z" "lx,ly,lz" [fov] [url] [出力先]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const from = (process.argv[2] || '0,1.7,20').split(',').map(Number);
const look = (process.argv[3] || '0,3,0').split(',').map(Number);
const fov = parseFloat(process.argv[4] || '78');
const url = process.argv[5] || 'http://127.0.0.1:4173/?rawgpu&quality=high';
const outDir = process.argv[6] || 'shots/whatis';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

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

const out = await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE;
  d.game.paused = true;
  d.hud.hide();
  d.engine.autoResolution = false;
  const cam = d.engine.camera;
  cam.fov = ${fov}; cam.updateProjectionMatrix();
  cam.position.set(${from.join(',')});
  cam.lookAt(new THREE.Vector3(${look.join(',')}));
  cam.updateMatrixWorld();
  d.engine.lightPool.snap(cam.position);
  for (const c of d.engine.viewScene.children) c.visible = false;

  // 人物と空は除く（動くもの・無限遠は調べても仕方がない）
  const targets = [];
  d.engine.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let p = o, skip = false;
    while (p) { if (p.name === 'soldier' || p.name === 'Sky' || p.name === 'SkyBox') { skip = true; break; } p = p.parent; }
    if (!skip) targets.push(o);
  });

  /*
   * 画面を 7x5 に割って中心へレイを飛ばす。
   * 列は左→右、行は上→下。スクショと同じ並びで読める。
   */
  const COLS = 7, ROWS = 5;
  const rc = new THREE.Raycaster();
  rc.far = 300;
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const ndc = new THREE.Vector2(
        (c + 0.5) / COLS * 2 - 1,
        -((r + 0.5) / ROWS * 2 - 1)
      );
      rc.setFromCamera(ndc, cam);
      const hit = rc.intersectObjects(targets, false)[0];
      if (!hit) { row.push('—'); continue; }
      const m = hit.object.material;
      const name = (Array.isArray(m) ? m[0]?.name : m?.name) || hit.object.name || '(無名)';
      row.push(name.replace(/^batch:/, '') + '@' + hit.distance.toFixed(1));
    }
    grid.push(row);
  }
  return JSON.stringify(grid);
})()`);

const grid = JSON.parse(out);
const w = Math.max(...grid.flat().map((s) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));
const pad = (s) => {
  const vis = [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return s + ' '.repeat(Math.max(0, w - vis));
};
console.log(`視点 (${from}) → (${look})  画角 ${fov}°`);
for (const row of grid) console.log('  ' + row.map(pad).join(' │ '));

await page.waitForTimeout(3200);
const name = `whatis_${from.map((n) => n.toFixed(0)).join('_')}`;
await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
console.log('撮影:', `${outDir}/${name}.png`);
await browser.close();
