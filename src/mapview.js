import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { MaterialLibrary } from './render/MaterialLibrary.js';
import { Physics } from './world/Physics.js';
import { MapBuilder } from './world/MapBuilder.js';
import { buildCompound, MAP_INFO } from './world/maps/Map_Compound.js';

/**
 * マップ確認用の開発エントリ。
 *   ?cam=overview|spawnA|spawnB|center|west|east|roof|eye
 *   ?x=&y=&z=&ry=  任意のカメラ位置
 */
const boot = window.__boot;
const container = document.getElementById('app');
const qs = new URLSearchParams(location.search);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const CAMS = {
  overview: { pos: [0, 62, 74], look: [0, 0, 0], fov: 46 },
  angled:   { pos: [42, 30, 46], look: [0, 2, 0], fov: 50 },
  spawnA:   { pos: [0, 1.65, 28], look: [0, 2.2, -6], fov: 78 },
  spawnB:   { pos: [0, 1.65, -28], look: [0, 2.2, 6], fov: 78 },
  center:   { pos: [0, 1.65, 14], look: [0, 2.4, -4], fov: 78 },
  west:     { pos: [-16, 1.65, 16], look: [-16, 2.2, -6], fov: 78 },
  east:     { pos: [15, 1.65, 20], look: [16, 2.4, -8], fov: 78 },
  roof:     { pos: [-4, 8.4, 4], look: [8, 3.0, -10], fov: 74 },
  market:   { pos: [15.5, 1.65, 8], look: [16, 2.0, -14], fov: 78 },
  yard:     { pos: [-13, 1.65, 12], look: [-18, 2.2, -8], fov: 78 },
};

async function start() {
  boot?.set(4, 'エンジン初期化');
  const engine = new Engine(container, 'high');
  const mats = new MaterialLibrary(engine.renderer);
  const physics = new Physics(4);

  engine.setSunAngle(MAP_INFO.sun.elevation, MAP_INFO.sun.azimuth);
  engine.tune({ skyScale: 0.10, exposure: 0.95, sunIntensity: 4.4, hemiIntensity: 0.42, fillIntensity: 0.45 });
  const env = engine.refreshEnvironment();
  engine.scene.environmentIntensity = 0.40;
  mats.applyEnvironment(env, 1.0);

  // 遠景をやわらげる大気（奥行き感が出る）
  engine.scene.fog = new THREE.Fog(MAP_INFO.fog.color, MAP_INFO.fog.near, MAP_INFO.fog.far);

  boot?.set(15, 'レベル構築');
  await nextFrame();

  const b = new MapBuilder(engine.scene, physics, mats);
  buildCompound(b);

  boot?.set(55, 'テクスチャ生成');
  await nextFrame();
  b.finalize();

  boot?.set(96, '仕上げ');
  await nextFrame();

  // カメラ
  const key = qs.get('cam') || 'angled';
  if (qs.has('x')) {
    engine.camera.position.set(+qs.get('x'), +(qs.get('y') || 1.65), +qs.get('z'));
    engine.camera.rotation.set(+(qs.get('rx') || 0), +(qs.get('ry') || 0), 0, 'YXZ');
    engine.setFov(+(qs.get('fov') || 78));
  } else {
    const c = CAMS[key] || CAMS.angled;
    engine.camera.position.set(...c.pos);
    engine.camera.lookAt(...c.look);
    engine.setFov(c.fov);
  }

  const hud = document.getElementById('hud');
  boot?.done();

  window.__DEV = { engine, mats, physics, builder: b, THREE, CAMS,
    goto(k) { const c = CAMS[k]; if (!c) return 'no cam'; engine.camera.position.set(...c.pos); engine.camera.lookAt(...c.look); engine.setFov(c.fov); return k; } };

  let last = performance.now(), acc = 0, frames = 0, fps = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    engine.render(dt);
    acc += dt; frames++;
    if (acc >= 0.5) {
      fps = Math.round(frames / acc); acc = 0; frames = 0;
      if (hud) hud.textContent =
        `${MAP_INFO.nameJa} / ${fps} FPS / ${engine.drawCalls} draws / ${(engine.triangles / 1000).toFixed(0)}k tris / コライダ ${physics.colliders.length}`;
    }
  }
  requestAnimationFrame(loop);
}

start().catch((e) => { console.error(e); boot?.fail(e.message); });
