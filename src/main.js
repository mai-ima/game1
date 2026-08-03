import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { MaterialLibrary } from './render/MaterialLibrary.js';
import { MaterialShowcase } from './dev/MaterialShowcase.js';

/* 一時的な動作確認用ブート。順次ゲーム本体へ差し替える。 */

const boot = window.__boot;
const container = document.getElementById('app');

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function start() {
  if (window.__NO_WEBGL2__) return;

  boot?.set(3, '描画エンジン初期化');
  await nextFrame();

  const engine = new Engine(container, 'high');
  const mats = new MaterialLibrary(engine.renderer);

  boot?.set(8, '大気・環境光を生成');
  await nextFrame();
  engine.tune({ skyScale: 0.12, exposure: 1.0, sunIntensity: 4.2, hemiIntensity: 0.0 });
  const env = engine.refreshEnvironment();
  engine.scene.environmentIntensity = 0.42;
  mats.applyEnvironment(env, 1.0);

  const showcase = new MaterialShowcase(engine, mats);
  await showcase.build({
    cols: 6,
    texSize: 1024,
    onProgress: (t, name) => boot?.set(10 + t * 88, `マテリアル生成 ${name}`),
  });
  showcase.frameAll();

  boot?.set(100, '完了');
  await nextFrame();
  boot?.done();

  window.__DEV = { engine, mats, showcase, THREE };

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    engine.render(dt);
  }
  requestAnimationFrame(loop);
}

start().catch((e) => {
  console.error(e);
  boot?.fail('起動失敗: ' + e.message);
});
