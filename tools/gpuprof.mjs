/**
 * 描画コストの内訳を測る。
 * gl.finish() で GPU の完了を待ってから計測するため、
 * ソフトウェアラスタライザ上でも「どのパスが何 ms 使っているか」が正確に出る。
 *
 *   node tools/gpuprof.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[エラー]', e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(4000);

const report = await page.evaluate(`(async () => {
  const { engine, game } = window.__DEV;
  const gl = engine.renderer.getContext();
  const r = engine.renderer;

  // 計測中はゲームループを止め、描画だけを回す
  game.paused = true;
  await new Promise((res) => requestAnimationFrame(res));

  /*
   * gl.finish() は ANGLE/SwiftShader では実際にはラスタライズ完了を待たない。
   * 1 画素の readPixels はパイプライン全体のフラッシュと同期を強制するので、
   * これで挟むと本当の描画時間が測れる。
   */
  const px = new Uint8Array(4);
  const sync = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  const time = (fn, n = 4) => {
    fn(); sync();                            // ウォームアップ
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { fn(); sync(); }
    return (performance.now() - t0) / n;
  };

  const out = {
    画質: engine.quality,
    ピクセル比: r.getPixelRatio(),
    描画解像度: \`\${r.domElement.width}x\${r.domElement.height}\`,
    preserveDrawingBuffer: !!r.getContextAttributes().preserveDrawingBuffer,
    パス数: engine.composer.passes.length,
    パス構成: engine.composer.passes.map((p) => p.constructor.name).join(' → '),
  };

  // --- 1. コンポーザ全体 ---
  out['全体_ms'] = +time(() => engine.composer.render(0.016)).toFixed(2);

  // --- 2. シーン直描き（ポスト無し・影あり） ---
  out['シーンのみ_ms'] = +time(() => r.render(engine.scene, engine.camera)).toFixed(2);

  // --- 3. 影を切ったシーン直描き ---
  const shadowWas = r.shadowMap.enabled;
  r.shadowMap.enabled = false;
  out['シーン_影なし_ms'] = +time(() => r.render(engine.scene, engine.camera)).toFixed(2);
  r.shadowMap.enabled = shadowWas;

  // --- 4. 空を消したシーン直描き ---
  const sky = engine.sky;
  sky.visible = false;
  out['シーン_空なし_ms'] = +time(() => r.render(engine.scene, engine.camera)).toFixed(2);
  sky.visible = true;

  // --- 5. 空だけ ---
  const hidden = [];
  for (const c of engine.scene.children) {
    if (c !== sky && c.visible && !c.isLight) { c.visible = false; hidden.push(c); }
  }
  r.shadowMap.enabled = false;
  out['空だけ_ms'] = +time(() => r.render(engine.scene, engine.camera)).toFixed(2);
  r.shadowMap.enabled = shadowWas;
  for (const c of hidden) c.visible = true;

  // --- 6. 各ポストパスを個別に無効化して差分を見る ---
  const passes = engine.composer.passes;
  const perPass = {};
  for (let i = 1; i < passes.length; i++) {
    const p = passes[i];
    const was = p.enabled;
    p.enabled = false;
    const t = time(() => engine.composer.render(0.016), 3);
    p.enabled = was;
    perPass[p.constructor.name] = +(out['全体_ms'] - t).toFixed(2);
  }
  out['パス別コスト_ms'] = perPass;

  // --- 7. 描画呼び出しの内訳 ---
  r.info.autoReset = false;
  r.info.reset();
  r.render(engine.scene, engine.camera);
  out['描画_影込み'] = { calls: r.info.render.calls, tris: r.info.render.triangles };
  r.shadowMap.enabled = false;
  r.info.reset();
  r.render(engine.scene, engine.camera);
  out['描画_影なし'] = { calls: r.info.render.calls, tris: r.info.render.triangles };
  r.shadowMap.enabled = shadowWas;

  out['シーン内オブジェクト数'] = (() => { let n = 0; engine.scene.traverse(() => n++); return n; })();
  out['影を落とすメッシュ数'] = (() => {
    let n = 0; engine.scene.traverse((o) => { if (o.isMesh && o.castShadow) n++; }); return n;
  })();
  out['ビューモデル面'] = (() => { let n = 0; engine.viewScene.traverse(() => n++); return n; })();

  game.paused = false;
  return JSON.stringify(out, null, 2);
})()`);

console.log(report);
await browser.close();
