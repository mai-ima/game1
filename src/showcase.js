import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { MaterialLibrary } from './render/MaterialLibrary.js';
import { MaterialShowcase } from './dev/MaterialShowcase.js';

/**
 * マテリアル評価専用の開発エントリ。
 * URL パラメータ:
 *   ?tex=1024      テクスチャ解像度
 *   ?cols=6        列数
 *   ?focus=3       指定インデックスへ寄る
 *   ?studio=1      屋外空ではなくスタジオ照明で評価
 */
const boot = window.__boot;
const container = document.getElementById('app');
const qs = new URLSearchParams(location.search);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function start() {
  boot?.set(3, 'エンジン初期化');
  await nextFrame();

  const engine = new Engine(container, 'high');
  const mats = new MaterialLibrary(engine.renderer);

  boot?.set(8, '環境光生成');
  await nextFrame();
  engine.tune({ skyScale: 0.12, exposure: 0.85, sunIntensity: 4.5, hemiIntensity: 0 });
  const env = engine.refreshEnvironment();
  engine.scene.environmentIntensity = 0.35;
  mats.applyEnvironment(env, 1.0);

  if (qs.get('studio') === '1') {
    // 参考画像に近い暗いスタジオ背景（素材の明度を判断しやすい）
    engine.sky.visible = false;
    engine.scene.background = new THREE.Color(0x3a3d40);
    engine.scene.environmentIntensity = 0.55;
  }

  const showcase = new MaterialShowcase(engine, mats);
  await showcase.build({
    cols: parseInt(qs.get('cols') || '6', 10),
    // 119 材質を 1024 で焼くと 2GB になり、ページごと落ちる
    texSize: parseInt(qs.get('tex') || '512', 10),
    onProgress: (t, name) => boot?.set(10 + t * 88, `生成中 ${name}`),
  });

  if (qs.has('focus')) showcase.focus(parseInt(qs.get('focus'), 10));
  else showcase.frameAll();

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

start().catch((e) => { console.error(e); boot?.fail(e.message); });
