import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { MaterialLibrary } from './render/MaterialLibrary.js';
import { MODEL_BUILDERS, ATTACHMENT_BUILDERS } from './player/weapons/Models.js';
import { WEAPONS } from './player/weapons/WeaponDefs.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * 武器モデル確認用の開発エントリ。
 *   ?w=ak47        単体表示
 *   ?att=redDot    アタッチメント付き
 *   ?all=1         全武器を並べる（既定）
 *   ?studio=1      暗いスタジオ背景
 */
const boot = window.__boot;
const container = document.getElementById('app');
const qs = new URLSearchParams(location.search);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 46px "SF Mono", ui-monospace, Menlo, monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.9)';
  g.strokeText(text, 256, 64);
  g.fillStyle = '#ffffff'; g.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(0.34, 0.085, 1);
  return sp;
}

async function start() {
  boot?.set?.(5);
  const engine = new Engine(container, 'high');
  const mats = new MaterialLibrary(engine.renderer);

  // 屋外の空を IBL に使うと金属が真っ青に染まるため、
  // 武器ビューアでは中立的なスタジオ環境（RoomEnvironment）を使う。
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  const studioEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  engine.scene.environment = studioEnv;
  engine.viewScene.environment = studioEnv;
  mats.applyEnvironment(studioEnv, 1.0);

  // --- スタジオ 3 点照明（製品写真的に形状を読み取りやすくする） ---
  engine.sun.intensity = 0;
  engine.hemi.intensity = 0;
  engine.fill.intensity = 0;
  engine.scene.environmentIntensity = 0.85;
  engine.renderer.toneMappingExposure = 1.05;
  engine.sky.visible = false;
  engine.scene.background = new THREE.Color(0x24262a);

  const key = new THREE.DirectionalLight(0xfff0da, 3.4);
  key.position.set(1.4, 1.8, 1.1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.1; key.shadow.camera.far = 8;
  key.shadow.camera.left = -1.2; key.shadow.camera.right = 1.2;
  key.shadow.camera.top = 1.2; key.shadow.camera.bottom = -1.2;
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.002;   // 銃は数 cm 単位なので既定値では自己遮蔽が出る
  key.shadow.radius = 2;
  engine.scene.add(key);

  const rim = new THREE.DirectionalLight(0xbcd4f0, 1.6);
  rim.position.set(-1.6, 0.7, -1.4);
  engine.scene.add(rim);

  const fillL = new THREE.DirectionalLight(0xffffff, 0.8);
  fillL.position.set(-0.8, -0.4, 1.6);
  engine.scene.add(fillL);

  await nextFrame();

  const materials = {
    metal: mats.get('gunMetal', { repeat: [1, 1] }),
    darkMetal: mats.solid('darkSteel', { color: 0x15171a, roughness: 0.38, metalness: 1.0 }),
    polymer: mats.get('polymer', { repeat: [1, 1] }),
    wood: mats.get('woodDark', { repeat: [1, 1] }),
    accent: mats.solid('brass'),
    optic: mats.solid('darkSteel', { color: 0x101215, roughness: 0.30, metalness: 0.9 }),
    lens: new THREE.MeshPhysicalMaterial({
      color: 0x2a4a6a, roughness: 0.04, metalness: 0,
      transmission: 0.55, thickness: 0.004, ior: 1.55, transparent: true,
      side: THREE.DoubleSide, iridescence: 0.9, iridescenceIOR: 1.9,
      iridescenceThicknessRange: [120, 420],
    }),
    default: mats.solid('darkSteel'),
  };

  const root = new THREE.Group();
  engine.scene.add(root);

  const single = qs.get('w');
  const list = single ? [single] : Object.keys(MODEL_BUILDERS);
  const attId = qs.get('att');

  const SPACING = 0.46;
  list.forEach((id, i) => {
    const b = MODEL_BUILDERS[id]();
    const g = b.build(materials);
    const anchors = g.userData.anchors;

    if (attId && ATTACHMENT_BUILDERS[attId]) {
      const a = ATTACHMENT_BUILDERS[attId]().build(materials);
      const mount = attId === 'suppressor' ? anchors.muzzle : anchors.optic;
      a.position.copy(mount);
      if (attId === 'suppressor') a.position.z -= 0.085;
      g.add(a);
    }

    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    const y = single ? 0 : -(i - (list.length - 1) / 2) * SPACING;
    g.position.set(0, y, 0);
    g.rotation.y = 0;
    root.add(g);

    if (!single) {
      const label = makeLabel(WEAPONS[id]?.name || id);
      label.position.set(0, y + 0.155, 0.30);
      root.add(label);
    }
  });

  // 床（接地感と影のため）
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.85, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.22;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  // カメラ
  // 銃は -Z を向いているので、真横は +X 側から見る
  const view = qs.get('view') || (single ? 'side' : 'grid');
  if (view === 'side') {
    engine.camera.position.set(1.30, 0.10, 0.02);
    engine.camera.lookAt(0, 0.038, -0.02);
    engine.setFov(30);
  } else if (view === 'hero') {
    engine.camera.position.set(0.72, 0.30, -0.58);
    engine.camera.lookAt(0, 0.035, -0.02);
    engine.setFov(32);
  } else {
    engine.camera.position.set(1.55, 0.30, 0.05);
    engine.camera.lookAt(0, 0.0, 0);
    engine.setFov(42);
  }

  boot?.done();
  window.__DEV = { engine, mats, root, THREE };

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
