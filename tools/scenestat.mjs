/**
 * シーンの構成を数える。
 * 「どこにドローコールが使われているか」「影を落としているのは何か」を
 * 実測して、最適化の当てを付けるためのもの。
 *
 *   node tools/scenestat.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=igpu';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('ERR', e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(3000);

const out = await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE;
  const box = new THREE.Box3(), size = new THREE.Vector3();
  const rows = [];
  let meshes = 0, casters = 0, tris = 0;
  const byMat = new Map();
  d.engine.scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    tris += n;
    if (o.castShadow) casters++;
    const mn = o.material?.name || o.material?.uuid?.slice(0, 6) || '?';
    byMat.set(mn, (byMat.get(mn) || 0) + 1);
    box.setFromObject(o); box.getSize(size);
    rows.push({
      名前: o.name || '(無名)',
      材質: mn,
      面: Math.round(n),
      大きさm: +Math.max(size.x, size.y, size.z).toFixed(1),
      影: o.castShadow,
      keep: !!o.userData.keepShadow,
    });
  });
  rows.sort((a, b) => b.面 - a.面);
  const buckets = { '0-0.5m': 0, '0.5-1.7m': 0, '1.7-5m': 0, '5m+': 0 };
  for (const r of rows) {
    if (!r.影) continue;
    if (r.大きさm < 0.5) buckets['0-0.5m']++;
    else if (r.大きさm < 1.7) buckets['0.5-1.7m']++;
    else if (r.大きさm < 5) buckets['1.7-5m']++;
    else buckets['5m+']++;
  }
  // 兵士 1 体あたりの面数を数える
  let soldierTris = 0, soldierMeshes = 0, soldiers = 0;
  d.engine.scene.traverse((o) => {
    if (o.name !== 'soldier') return;
    soldiers++;
    if (soldiers > 1) return;
    o.traverse((m) => {
      if (!m.isMesh) return;
      soldierMeshes++;
      soldierTris += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
    });
  });

  return JSON.stringify({
    軽量モード: d.engine.lightweight,
    兵士1体の面数: Math.round(soldierTris),
    兵士1体のメッシュ数: soldierMeshes,
    兵士の数: soldiers,
    画質: d.engine.quality,
    メッシュ総数: meshes,
    影を落とす数: casters,
    総面数: Math.round(tris),
    影メッシュの大きさ分布: buckets,
    材質ごとのメッシュ数: [...byMat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14),
    面数の多い順: rows.slice(0, 12),
  }, null, 1);
})()`);
console.log(out);
await browser.close();
