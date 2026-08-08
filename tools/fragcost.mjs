/**
 * 描画のどこに時間が消えているかを、画素側の視点で切り分ける。
 *
 * ・深度だけ描く   … ラスタライズ量（画素数 × 重なり）の下限
 * ・単色で描く     … 上に加えて、頂点処理とドローコールの分
 * ・本番の材質     … 上に加えて、PBR シェーダとテクスチャ取得の分
 * ・Z プリパス後   … 重なって捨てられる画素を先に潰した場合
 *
 * 「本番 − 単色」が大きければシェーダが重い。
 * 「Z プリパス後」が本番より速ければ、重なりを潰す価値がある。
 *
 *   node tools/fragcost.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=igpu';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('[エラー]', e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(3500);

const out = await page.evaluate(`(async () => {
  const { engine, game, THREE } = window.__DEV;
  const r = engine.renderer, gl = r.getContext();
  game.paused = true;
  await new Promise((res) => requestAnimationFrame(res));

  const px = new Uint8Array(4);
  const sync = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  const time = (fn, n = 3) => {
    fn(); sync();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { fn(); sync(); }
    return +((performance.now() - t0) / n).toFixed(1);
  };

  const scene = engine.scene, cam = engine.camera;
  const res = {
    解像度: r.domElement.width + 'x' + r.domElement.height,
    画質: engine.quality,
  };

  // --- 本番 ---
  res['本番_ms'] = time(() => r.render(scene, cam));
  const info = r.info.render;
  res['ドローコール'] = info.calls;
  res['三角形'] = info.triangles;

  // --- 単色（頂点処理 + ラスタライズのみ） ---
  const basic = new THREE.MeshBasicMaterial({ color: 0x808080 });
  scene.overrideMaterial = basic;
  res['単色_ms'] = time(() => r.render(scene, cam));

  // --- 深度だけ（色を書かない） ---
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  scene.overrideMaterial = depthOnly;
  res['深度のみ_ms'] = time(() => r.render(scene, cam));
  scene.overrideMaterial = null;

  /*
   * --- Z プリパスを入れた場合 ---
   * 先に深度だけを書き、本番は深度が一致する画素にだけ色を書く。
   * 重なって捨てられる画素の PBR 計算が丸ごと省ける。
   */
  const mats = new Set();
  scene.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) mats.add(o.material); });
  const saved = [...mats].map((m) => ({ m, f: m.depthFunc, w: m.depthWrite }));
  res['Zプリパス後_ms'] = time(() => {
    const sm = r.shadowMap.autoUpdate;
    scene.overrideMaterial = depthOnly;
    r.render(scene, cam);
    scene.overrideMaterial = null;
    r.shadowMap.autoUpdate = false;
    for (const { m } of saved) { m.depthFunc = THREE.EqualDepth; m.depthWrite = false; }
    r.autoClearDepth = false;
    r.render(scene, cam);
    r.autoClearDepth = true;
    for (const { m, f, w } of saved) { m.depthFunc = f; m.depthWrite = w; }
    r.shadowMap.autoUpdate = sm;
  });

  /*
   * --- 重なりの量 ---
   * 深度テストを常に通るようにして描くと、
   * 実際に塗った画素数 ÷ 画面画素数 が重なりの倍率になる。
   * 時間比で近似する（深度テスト有り／無しの比）。
   */
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthTest: false, depthWrite: false });
  res['深度テスト無し_ms'] = time(() => r.render(scene, cam));
  scene.overrideMaterial = null;

  // --- 空だけ ---
  const hidden = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (o.name === 'Sky' || o.name === 'SkyBox') return;
    hidden.push(o); o.visible = false;
  });
  res['空だけ_ms'] = time(() => r.render(scene, cam));
  for (const o of hidden) o.visible = true;

  /* ================================================================
   * ここから「何がシェーダを重くしているか」を 1 つずつ外して測る。
   * 外した状態の時間との差が、その機能の取り分になる。
   * ================================================================ */
  const list = [...mats];
  const dirty = () => { for (const m of list) m.needsUpdate = true; };

  // --- 環境マップ（IBL）を外す ---
  {
    const envWas = scene.environment;
    const per = list.map((m) => m.envMap);
    scene.environment = null;
    for (const m of list) m.envMap = null;
    dirty();
    res['環境マップ無し_ms'] = time(() => r.render(scene, cam));
    scene.environment = envWas;
    list.forEach((m, i) => { m.envMap = per[i]; });
    dirty();
  }

  // --- 法線マップを外す ---
  {
    const per = list.map((m) => m.normalMap);
    for (const m of list) m.normalMap = null;
    dirty();
    res['法線マップ無し_ms'] = time(() => r.render(scene, cam));
    list.forEach((m, i) => { m.normalMap = per[i]; });
    dirty();
  }

  // --- 粗さ/金属/AO マップを外す ---
  {
    const per = list.map((m) => [m.roughnessMap, m.metalnessMap, m.aoMap]);
    for (const m of list) { m.roughnessMap = null; m.metalnessMap = null; m.aoMap = null; }
    dirty();
    res['ORMマップ無し_ms'] = time(() => r.render(scene, cam));
    list.forEach((m, i) => { [m.roughnessMap, m.metalnessMap, m.aoMap] = per[i]; });
    dirty();
  }

  // --- 影を外す ---
  {
    const was = r.shadowMap.enabled;
    r.shadowMap.enabled = false;
    dirty();
    res['影無し_ms'] = time(() => r.render(scene, cam));
    r.shadowMap.enabled = was;
    dirty();
  }

  // --- 全部の貼りものを外す（素の PBR だけ） ---
  {
    const per = list.map((m) => [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap]);
    for (const m of list) { m.map = null; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null; m.aoMap = null; }
    dirty();
    res['貼りもの全無し_ms'] = time(() => r.render(scene, cam));
    list.forEach((m, i) => { [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap] = per[i]; });
    dirty();
  }

  // --- ライトの構成 ---
  const lights = [];
  scene.traverse((o) => {
    if (!o.isLight || !o.visible) return;
    lights.push(o.type + (o.castShadow ? '(影あり)' : '') + ' 強さ' + (+o.intensity.toFixed(2)));
  });
  res['ライト'] = lights;
  res['影の解像度'] = (() => {
    let s = null;
    scene.traverse((o) => { if (o.isLight && o.castShadow && o.shadow) s = o.shadow.mapSize.width; });
    return s;
  })();
  res['影のフィルタ'] = ['Basic', 'PCF', 'PCFSoft', 'VSM'][[0, 1, 2, 3].find((i) => [THREE.BasicShadowMap, THREE.PCFShadowMap, THREE.PCFSoftShadowMap, THREE.VSMShadowMap][i] === r.shadowMap.type)] ?? '?';

  basic.dispose(); depthOnly.dispose();
  return JSON.stringify(res, null, 1);
})()`);

console.log(out);

const d = JSON.parse(out);
const shade = d['本番_ms'] - d['単色_ms'];
const raster = d['単色_ms'] - d['空だけ_ms'];
console.log('\n内訳の読み方');
console.log(`  PBR シェーダとテクスチャ  : ${shade.toFixed(1)} ms  (${(shade / d['本番_ms'] * 100).toFixed(0)}%)`);
console.log(`  ラスタライズと頂点処理    : ${raster.toFixed(1)} ms  (${(raster / d['本番_ms'] * 100).toFixed(0)}%)`);
console.log(`  空                        : ${d['空だけ_ms'].toFixed(1)} ms`);
const gain = d['本番_ms'] - d['Zプリパス後_ms'];
console.log(`\n  Z プリパスの効果          : ${gain > 0 ? '-' : '+'}${Math.abs(gain).toFixed(1)} ms ` +
  `(${(gain / d['本番_ms'] * 100).toFixed(0)}% ${gain > 0 ? '短縮' : '悪化'})`);
console.log(`  重なり（深度テスト無し比）: ${(d['深度テスト無し_ms'] / Math.max(0.1, d['深度のみ_ms'])).toFixed(2)} 倍`);

console.log('\n機能ごとの取り分（外したときに減る時間）');
for (const k of ['環境マップ無し_ms', '法線マップ無し_ms', 'ORMマップ無し_ms', '影無し_ms', '貼りもの全無し_ms']) {
  if (d[k] == null) continue;
  const save = d['本番_ms'] - d[k];
  const label = k.replace('_ms', '').replace('無し', '').replace('全', '');
  console.log(`  ${label.padEnd(12, '　')} : ${save >= 0 ? '-' : '+'}${Math.abs(save).toFixed(1).padStart(6)} ms  ` +
    `(${(save / d['本番_ms'] * 100).toFixed(0)}%)`);
}
console.log('\nライト:', (d['ライト'] || []).join(' / '));
console.log(`影: ${d['影の解像度']}px / ${d['影のフィルタ']}`);

await browser.close();
