/**
 * 長時間走らせて、落ちる原因を探す。
 *
 * 「たまに落ちる」は再現待ちでは捕まらない。
 * 資源が増え続けていないか、例外が出ていないか、
 * NaN が混じっていないかを、一定間隔で数字にして並べる。
 *
 * 見るもの:
 *   ・GPU 資源（ジオメトリ数・テクスチャ数・プログラム数）
 *   ・JS ヒープ
 *   ・物理の当たり判定の数、描画オブジェクトの数
 *   ・エフェクトの配列長（増え続けると最後に破裂する）
 *   ・座標に NaN が出ていないか
 *   ・未捕捉の例外、WebGL のコンテキストロスト
 *
 *   node tools/soak.mjs [url] [ゲーム内秒数] [マップ再読み込み回数]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=compound';
const simSeconds = +(process.argv[3] || 600);
const reloads = +(process.argv[4] || 0);

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--js-flags=--expose-gc',
  ],
});
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });

const errors = [];
const warns = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push('例外: ' + e.message); });
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') errors.push('console.error: ' + t);
  else if (m.type() === 'warning' && !/deprecat/i.test(t)) warns.push(t);
});
page.on('crash', () => errors.push('ページがクラッシュした'));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.waitForTimeout(1500);

// コンテキストロストを拾う
await page.evaluate(`(() => {
  const c = window.__DEV.engine.renderer.domElement;
  window.__LOST = 0;
  c.addEventListener('webglcontextlost', () => { window.__LOST++; });
})()`);

const snap = () => page.evaluate(`(() => {
  const d = window.__DEV, e = d.engine, g = d.game;
  const info = e.renderer.info;
  let meshes = 0, geos = new Set(), mats = new Set();
  e.scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    meshes++;
    geos.add(o.geometry);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
  });
  const fx = e.effects || g.effects || null;
  const bad = [];
  const chk = (name, v) => { if (v && (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z))) bad.push(name); };
  chk('player.position', g.player?.position);
  chk('player.velocity', g.player?.velocity);
  for (const b of g.bots || []) {
    chk('bot:' + b.name, b.char?.position);
    if (!Number.isFinite(b.hp)) bad.push('bot.hp:' + b.name);
  }
  return {
    ジオメトリ: info.memory.geometries,
    テクスチャ: info.memory.textures,
    'テクスチャMB': +((e.mats?.tf?.bytes || 0) / 1048576).toFixed(0),
    プログラム: info.programs ? info.programs.length : -1,
    描画呼び出し: info.render.calls,
    メッシュ: meshes,
    '一意なジオメトリ': geos.size,
    '一意なマテリアル': mats.size,
    当たり判定: g.physics?.colliders?.length ?? -1,
    ボット: (g.bots || []).length,
    'ヒープMB': performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1,
    コンテキストロスト: window.__LOST || 0,
    NaN: bad,
  };
})()`);

const rows = [];
const DT = 1 / 60;
const chunk = 15;             // 1 回に進めるゲーム内秒数

console.log(`対象: ${url}`);
console.log(`ゲーム内 ${simSeconds} 秒、マップ再読み込み ${reloads} 回\n`);
rows.push(['0s', await snap()]);

for (let t = 0; t < simSeconds; t += chunk) {
  const err = await page.evaluate(`(async () => {
    const g = window.__DEV.game;
    const N = Math.round(${chunk} / ${DT});
    for (let i = 0; i < N; i++) {
      try { g.update(${DT}); } catch (e) { return String(e && e.stack || e); }
      if (i % 600 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return null;
  })()`);
  if (err) { errors.push('update で例外: ' + err.split('\n').slice(0, 3).join(' / ')); break; }
  rows.push([`${t + chunk}s`, await snap()]);
}

/* --- マップの読み直しで資源が積み上がらないか --- */
for (let i = 0; i < reloads; i++) {
  const err = await page.evaluate(`(async () => {
    const d = window.__DEV;
    try {
      await d.reloadMap ? d.reloadMap() : d.startMatch();
    } catch (e) { return String(e && e.message || e); }
    return null;
  })()`);
  if (err) { errors.push('再読み込みで例外: ' + err); break; }
  await page.waitForTimeout(3000);
  rows.push([`再読込${i + 1}`, await snap()]);
}

const keys = Object.keys(rows[0][1]).filter((k) => k !== 'NaN');
const pad = (s, n) => String(s).padStart(n);
console.log(['時点'.padEnd(8), ...keys.map((k) => pad(k, 14))].join(''));
for (const [t, r] of rows) {
  console.log([String(t).padEnd(8), ...keys.map((k) => pad(r[k], 14))].join(''));
}

const nans = rows.flatMap(([t, r]) => r.NaN.map((n) => `${t}: ${n}`));
if (nans.length) console.log('\nNaN が出た所:\n  ' + [...new Set(nans)].join('\n  '));

const first = rows[0][1], last = rows[rows.length - 1][1];
console.log('\n増減:');
for (const k of keys) {
  const dv = last[k] - first[k];
  if (Math.abs(dv) > 0) console.log(`  ${k}: ${first[k]} → ${last[k]}  (${dv > 0 ? '+' : ''}${dv})`);
}

if (errors.length) console.log('\nエラー:\n  ' + [...new Set(errors)].slice(0, 12).join('\n  '));
else console.log('\nエラーなし');
if (warns.length) console.log('\n警告:\n  ' + [...new Set(warns)].slice(0, 8).join('\n  '));
await browser.close();
