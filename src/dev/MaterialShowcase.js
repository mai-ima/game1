import * as THREE from 'three';
import { MaterialLibrary } from '../render/MaterialLibrary.js';

/**
 * マテリアル確認用ショーケース。
 * 各マテリアルを「ラベル付き床タイル + 球」で並べ、品質を目視評価する。
 */

/** テキストラベルのスプライトを生成 */
function makeLabel(text, px = 256) {
  const c = document.createElement('canvas');
  c.width = px * 2; c.height = px / 2;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = `600 ${px * 0.19}px "SF Mono", ui-monospace, Menlo, Consolas, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 縁取りで背景に負けないようにする
  g.lineWidth = px * 0.045;
  g.strokeStyle = 'rgba(0,0,0,0.88)';
  g.strokeText(text, c.width / 2, c.height / 2);
  g.fillStyle = '#ffffff';
  g.fillText(text, c.width / 2, c.height / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(2.15, 0.5375, 1);
  return sp;
}

export class MaterialShowcase {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {MaterialLibrary} mats
   */
  constructor(engine, mats) {
    this.engine = engine;
    this.mats = mats;
    this.root = new THREE.Group();
    engine.scene.add(this.root);
  }

  /**
   * @param {object} opt {cols, texSize, onProgress}
   */
  async build(opt = {}) {
    const cols = opt.cols || 6;
    const texSize = opt.texSize || 1024;
    const onProgress = opt.onProgress || (() => {});

    const names = [...MaterialLibrary.presets];
    const SP = 3.1;                 // タイル間隔
    const TILE = 2.72;              // タイル一辺
    const R = 0.86;                 // 球半径

    const sphereGeo = new THREE.SphereGeometry(R, 96, 64);
    const tileGeo = new THREE.PlaneGeometry(TILE, TILE);

    const rows = Math.ceil(names.length / cols);
    const ox = -((cols - 1) * SP) / 2;
    const oz = -((rows - 1) * SP) / 2;

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      onProgress(i / names.length, name);
      // 数個ごとにフレームを譲ってローディング進捗を描画させる
      if (i % 2 === 0) await new Promise((r) => requestAnimationFrame(() => r()));

      const mat = this.mats.scaled(name, TILE, TILE, { size: texSize });
      const cx = ox + (i % cols) * SP;
      const cz = oz + Math.floor(i / cols) * SP;

      // 床タイル
      const tile = new THREE.Mesh(tileGeo, mat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(cx, 0.006, cz);
      tile.receiveShadow = true;
      this.root.add(tile);

      // 球は整数リピートにする（非整数だと極・経度で継ぎ目が出る）
      const sMat = this.mats.get(name, { repeat: [4, 2], size: texSize });
      const sph = new THREE.Mesh(sphereGeo, sMat);
      sph.position.set(cx, R + 0.02, cz);
      sph.castShadow = true;
      sph.receiveShadow = true;
      this.root.add(sph);

      // ラベル
      const label = makeLabel(name);
      label.position.set(cx, 0.08, cz - TILE * 0.46);
      this.root.add(label);
    }

    // 特殊マテリアル（テクスチャセット外）
    const extras = [
      { name: 'glass', mat: this.mats.glass() },
      { name: 'emissivePanel', mat: this.mats.emissive(0x5ec8f0, 1.35) },
      { name: 'chrome', mat: this.mats.solid('chrome') },
      { name: 'brass', mat: this.mats.solid('brass') },
      { name: 'copper', mat: this.mats.solid('copper') },
      { name: 'darkSteel', mat: this.mats.solid('darkSteel') },
    ];
    for (let j = 0; j < extras.length; j++) {
      const i = names.length + j;
      const cx = ox + (i % cols) * SP;
      const cz = oz + Math.floor(i / cols) * SP;

      const tile = new THREE.Mesh(tileGeo, this.mats.scaled('concreteFloor', TILE, TILE, { size: texSize }));
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(cx, 0.006, cz);
      tile.receiveShadow = true;
      this.root.add(tile);

      const sph = new THREE.Mesh(sphereGeo, extras[j].mat);
      sph.position.set(cx, R + 0.02, cz);
      sph.castShadow = true;
      sph.receiveShadow = true;
      this.root.add(sph);

      const label = makeLabel(extras[j].name);
      label.position.set(cx, 0.08, cz - TILE * 0.46);
      this.root.add(label);
    }

    // 全体を載せるベース床
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(cols * SP + 8, (rows + 1) * SP + 8),
      this.mats.scaled('concreteFloor', 40, 40, { size: 512, color: 0x8a8a88 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, 0, (rows - 1) * SP / 2 - oz - (rows - 1) * SP / 2);
    base.receiveShadow = true;
    this.root.add(base);

    this.bounds = { cols, rows: Math.ceil((names.length + extras.length) / cols), SP, ox, oz };
    onProgress(1, '完了');
    return this;
  }

  /** ショーケース全体を俯瞰するカメラ位置 */
  frameAll() {
    const { cols, rows, SP } = this.bounds;
    const cam = this.engine.camera;
    const depth = rows * SP;
    cam.position.set(0, depth * 0.62, -depth * 0.72);
    cam.lookAt(0, 0.4, 0.6);
    this.engine.setFov(58);
  }

  /** 特定マテリアルへ寄る */
  focus(index, dist = 3.0) {
    const { cols, SP, ox, oz } = this.bounds;
    const cx = ox + (index % cols) * SP;
    const cz = oz + Math.floor(index / cols) * SP;
    const cam = this.engine.camera;
    cam.position.set(cx + dist * 0.35, 1.55, cz - dist);
    cam.lookAt(cx, 0.75, cz);
    this.engine.setFov(45);
  }

  dispose() {
    this.engine.scene.remove(this.root);
  }
}
