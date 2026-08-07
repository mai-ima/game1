import * as THREE from 'three';
import { TextureFactory } from './TextureFactory.js';

/**
 * マテリアルのプリセット定義。
 * tex   : TextureFactory のマテリアル名（null なら無地）
 * repeat: ワールド 1m あたりのタイル数（UV は後段でワールドスケールに合わせる）
 * params: THREE.MeshStandardMaterial / MeshPhysicalMaterial への追加パラメータ
 */
const PRESETS = {
  /* ---- 建材 ---- */
  concrete:        { tex: 'concrete',     repeat: 1.0,  params: { roughness: 1, metalness: 1 } },
  concreteFloor:   { tex: 'concrete',     repeat: 0.85, params: { roughness: 1, metalness: 1, color: 0xb8b6b0 }, seed: 88 },
  paintedWall:     { tex: 'paintedWall',  repeat: 0.9,  params: { roughness: 1, metalness: 1 } },
  paintedWallBlue: { tex: 'paintedWall',  repeat: 0.9,  params: { roughness: 1, metalness: 1, color: 0x8fa4b8 }, seed: 302 },
  plaster:         { tex: 'plaster',      repeat: 1.0, params: { roughness: 1, metalness: 1 } },
  brick:           { tex: 'brick',        repeat: 0.55, params: { roughness: 1, metalness: 1 } },
  brickPale:       { tex: 'brick',        repeat: 0.55, params: { roughness: 1, metalness: 1, color: 0xc9bda8 }, seed: 555 },
  rock:            { tex: 'rock',         repeat: 0.6, params: { roughness: 1, metalness: 1 } },
  tile:            { tex: 'tile',         repeat: 1.1, params: { roughness: 1, metalness: 1 } },
  paving:          { tex: 'paving',       repeat: 0.42,  params: { roughness: 1, metalness: 1 } },

  /* ---- 地面 ---- */
  asphalt:         { tex: 'asphalt',      repeat: 0.75, params: { roughness: 1, metalness: 1 } },
  dirt:            { tex: 'dirt',         repeat: 0.7,  params: { roughness: 1, metalness: 1 } },
  sand:            { tex: 'sand',         repeat: 0.7, params: { roughness: 1, metalness: 1 } },
  gravel:          { tex: 'gravel',       repeat: 1.1,  params: { roughness: 1, metalness: 1 } },

  /* ---- 金属 ---- */
  rustedMetal:     { tex: 'rustedMetal',  repeat: 0.9,  params: { roughness: 1, metalness: 1 } },
  paintedMetal:    { tex: 'paintedMetal', repeat: 1.0,  params: { roughness: 1, metalness: 1 } },
  paintedMetalTan: { tex: 'paintedMetal', repeat: 1.0,  params: { roughness: 1, metalness: 1, color: 0xc8b389 }, seed: 71 },
  brushedMetal:    { tex: 'brushedMetal', repeat: 0.8,  params: { roughness: 1, metalness: 1 } },
  aluminum:        { tex: 'aluminum',     repeat: 0.7,  params: { roughness: 1, metalness: 1 } },
  carbon:          { tex: 'carbon',       repeat: 2.2,  params: { roughness: 1, metalness: 1 } },
  diamondPlate:    { tex: 'diamondPlate', repeat: 0.5,  params: { roughness: 1, metalness: 1 } },
  corrugated:      { tex: 'corrugated',   repeat: 0.9, params: { roughness: 1, metalness: 1 } },
  hazardStripe:    { tex: 'hazardStripe', repeat: 0.5,  params: { roughness: 1, metalness: 1 } },
  gunMetal:        { tex: 'gunMetal',     repeat: 3.0,  params: { roughness: 1, metalness: 1 } },

  /* ---- 有機物 / 布 ---- */
  wood:            { tex: 'wood',         repeat: 0.85,  params: { roughness: 1, metalness: 1 } },
  woodDark:        { tex: 'wood',         repeat: 0.85,  params: { roughness: 1, metalness: 1, color: 0x8a6a4c }, seed: 909 },
  plywood:         { tex: 'plywood',      repeat: 0.9, params: { roughness: 1, metalness: 1 } },
  fabric:          { tex: 'fabric',       repeat: 0.8,  params: { roughness: 1, metalness: 1 } },
  camo:            { tex: 'camo',         repeat: 1.2,  params: { roughness: 1, metalness: 1 } },
  leather:         { tex: 'leather',      repeat: 1.6,  params: { roughness: 1, metalness: 1 } },
  sandbag:         { tex: 'sandbag',      repeat: 1.1,  params: { roughness: 1, metalness: 1 } },
  cardboard:       { tex: 'cardboard',    repeat: 1.0,  params: { roughness: 1, metalness: 1 } },
  rubber:          { tex: 'rubber',       repeat: 1.5,  params: { roughness: 1, metalness: 1 } },
  tireTread:       { tex: 'tireTread',    repeat: 1.2,  params: { roughness: 1, metalness: 1 } },
  polymer:         { tex: 'polymer',      repeat: 3.0,  params: { roughness: 1, metalness: 1 } },
};

/** テクスチャ無しの単色マテリアル定義 */
const SOLIDS = {
  black:      { color: 0x0a0a0b, roughness: 0.55, metalness: 0.0 },
  darkSteel:  { color: 0x1c1e22, roughness: 0.42, metalness: 1.0 },
  chrome:     { color: 0xe8eaec, roughness: 0.08, metalness: 1.0 },
  brass:      { color: 0xc9a227, roughness: 0.28, metalness: 1.0 },
  copper:     { color: 0xb87333, roughness: 0.32, metalness: 1.0 },
  lead:       { color: 0x6e7175, roughness: 0.5,  metalness: 1.0 },
  whitePaint: { color: 0xd8d6d0, roughness: 0.6,  metalness: 0.0 },
  redPaint:   { color: 0x8e2318, roughness: 0.5,  metalness: 0.0 },
  odGreen:    { color: 0x2b3020, roughness: 0.62, metalness: 0.05 },
  tan:        { color: 0x8c7a55, roughness: 0.68, metalness: 0.05 },
};

export class MaterialLibrary {
  /**
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(renderer) {
    this.tf = new TextureFactory(renderer);
    this.cache = new Map();
    this.envIntensity = 1.0;
    this.envMap = null;
    this._all = [];
  }

  /** 生成直後のマテリアルへ現在の環境設定を反映し、追跡リストへ登録する */
  _register(mat, key) {
    if (this.envMap) { mat.envMap = this.envMap; }
    mat.envMapIntensity = this.envIntensity;
    this.cache.set(key, mat);
    this._all.push(mat);
    return mat;
  }

  /** プリセット名一覧 */
  static get presets() { return Object.keys(PRESETS); }
  static get solids() { return Object.keys(SOLIDS); }

  /**
   * テクスチャ付きマテリアルを取得。
   * @param {string} name PRESETS のキー
   * @param {object} opt {repeat:[u,v] 上書き, size, ...MeshStandardMaterial パラメータ}
   */
  get(name, opt = {}) {
    const key = `${name}|${JSON.stringify(opt)}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const p = PRESETS[name];
    if (!p) throw new Error(`未定義のマテリアルプリセット: ${name}`);

    const set = this.tf.get(p.tex, { size: opt.size || 512, seed: p.seed ?? 1234 });
    // repeat / size は生成用パラメータなのでマテリアルには渡さない
    const { repeat, size, ...rest } = opt;

    // 同じテクスチャを別リピートで使うためにクローン
    const map = set.map.clone(); map.needsUpdate = true;
    const nrm = set.normalMap.clone(); nrm.needsUpdate = true;
    const orm = set.roughnessMap.clone(); orm.needsUpdate = true;

    const r = repeat || [1, 1];
    map.repeat.set(r[0], r[1]);
    nrm.repeat.set(r[0], r[1]);
    orm.repeat.set(r[0], r[1]);

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap: nrm,
      roughnessMap: orm,
      metalnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 1.0,
      normalScale: new THREE.Vector2(1, 1),
      envMapIntensity: this.envIntensity,
      ...p.params,
      ...rest,
    });
    mat.userData.worldRepeat = p.repeat;
    mat.name = name;
    return this._register(mat, key);
  }

  /**
   * ワールドサイズに応じて UV リピートを自動計算したマテリアルを取得。
   * 壁や床など、寸法の異なるジオメトリで密度を揃えるために使う。
   * @param {string} name
   * @param {number} w ワールド幅 (m)
   * @param {number} h ワールド高さ (m)
   */
  scaled(name, w, h, opt = {}) {
    const p = PRESETS[name];
    if (!p) throw new Error(`未定義のマテリアルプリセット: ${name}`);
    const d = p.repeat;
    return this.get(name, { ...opt, repeat: [Math.max(0.25, w * d), Math.max(0.25, h * d)] });
  }

  /** 単色 PBR マテリアル */
  solid(name, opt = {}) {
    const key = `solid:${name}|${JSON.stringify(opt)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const s = SOLIDS[name];
    if (!s) throw new Error(`未定義の単色マテリアル: ${name}`);
    const mat = new THREE.MeshStandardMaterial({
      ...s, envMapIntensity: this.envIntensity, ...opt,
    });
    mat.name = `solid:${name}`;
    return this._register(mat, key);
  }

  /** ガラス（物理マテリアル・透過） */
  glass(opt = {}) {
    const key = `glass|${JSON.stringify(opt)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const set = this.tf.get('dirtyGlass', { size: 512, seed: 4242 });
    const nrm = set.normalMap.clone(); nrm.needsUpdate = true;
    const orm = set.roughnessMap.clone(); orm.needsUpdate = true;
    nrm.repeat.set(2, 2); orm.repeat.set(2, 2);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xdce6ea,
      metalness: 0,
      roughness: 0.06,
      roughnessMap: orm,
      normalMap: nrm,
      normalScale: new THREE.Vector2(0.28, 0.28),
      transmission: 0.94,
      thickness: 0.02,
      ior: 1.52,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      envMapIntensity: this.envIntensity,
      specularIntensity: 1,
      ...opt,
    });
    mat.name = 'glass';
    return this._register(mat, key);
  }

  /** 発光マテリアル（照明器具・モニタ等） */
  emissive(color = 0xffe6b0, intensity = 4, opt = {}) {
    const key = `emis|${color}|${intensity}|${JSON.stringify(opt)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      emissive: new THREE.Color(color),
      emissiveIntensity: intensity,
      roughness: 0.4,
      metalness: 0,
      ...opt,
    });
    mat.name = 'emissive';
    return this._register(mat, key);
  }

  /** 環境マップを全マテリアルへ適用 */
  applyEnvironment(envTexture, intensity = 1.0) {
    this.envIntensity = intensity;
    this.envMap = envTexture;
    for (const m of this._all) {
      m.envMap = envTexture;
      m.envMapIntensity = intensity;
      m.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of this._all) m.dispose();
    this._all.length = 0;
    this.cache.clear();
    this.tf.dispose();
  }
}

export { PRESETS, SOLIDS };
