import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { CompositeShader, RadialBlurShader } from '../render/PostFX.js';

/** 画質プリセット */
export const QUALITY = {
  low:    { pixelRatio: 1.0,  shadowMap: 1024, gtao: false, bloom: false, smaa: false, aniso: 4,  shadowDist: 32,  texSize: 256 },
  medium: { pixelRatio: 1.25, shadowMap: 1536, gtao: false, bloom: true,  smaa: true,  aniso: 8,  shadowDist: 45,  texSize: 512 },
  high:   { pixelRatio: 1.5,  shadowMap: 2048, gtao: false, bloom: true,  smaa: true,  aniso: 16, shadowDist: 55,  texSize: 512 },
  ultra:  { pixelRatio: 2.0,  shadowMap: 3072, gtao: true,  bloom: true,  smaa: true,  aniso: 16, shadowDist: 80,  texSize: 1024 },
};

export class Engine {
  /**
   * @param {HTMLElement} container
   * @param {string} quality QUALITY のキー
   */
  constructor(container, quality = 'high') {
    this.container = container;
    this.quality = QUALITY[quality] ? quality : 'high';
    const q = QUALITY[this.quality];

    /* ---------------- レンダラ ---------------- */
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,           // SMAA をポストで使うため無効
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
      preserveDrawingBuffer: true, // スクリーンショット取得のため
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap は非推奨。柔らかさは shadow.radius / blurSamples で制御する。
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    /*
     * モバイルではメモリ逼迫やタブ復帰で WebGL コンテキストが失われることがある。
     * 既定では以後まったく描画されず「クラッシュした」ように見えるため、
     * 明示的に復帰を要求し、状態を外へ通知する。
     */
    this.contextLost = false;
    this.onContextLost = null;
    this.onContextRestored = null;
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();          // これを呼ばないと復帰イベントが来ない
      this.contextLost = true;
      this.onContextLost?.();
    }, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      // シェーダとテクスチャは three 側が再構築するが、
      // 環境マップは自前で作っているので作り直す
      try { this.refreshEnvironment(); } catch { /* 復帰直後は失敗しうる */ }
      this.onContextRestored?.();
    }, false);

    /* ---------------- シーン / カメラ ---------------- */
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      80, (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight), 0.02, 800
    );
    this.camera.rotation.order = 'YXZ';

    // 武器ビューモデル専用シーン（近接クリップ回避のため別カメラで重ね描き）
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(60, this.camera.aspect, 0.004, 12);
    this.viewCamera.rotation.order = 'YXZ';

    this.elapsed = 0;

    /* ---------------- 大気 / 太陽 ---------------- */
    this._setupSky();
    this._setupLights();

    /* ---------------- ポストプロセス ---------------- */
    this._setupComposer();

    /* ---------------- リサイズ ---------------- */
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(this._onResize, 220));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize);
  }

  /* ================= 空・環境光 ================= */

  _setupSky() {
    const sky = new Sky();
    sky.scale.setScalar(6000);
    sky.name = 'Sky';
    this.scene.add(sky);
    this.sky = sky;

    const u = sky.material.uniforms;
    u.turbidity.value = 5.2;
    u.rayleigh.value = 1.35;
    u.mieCoefficient.value = 0.0062;
    u.mieDirectionalG.value = 0.82;

    // 雲（Sky.js 内蔵のプロシージャル雲）
    u.cloudScale.value = 0.00016;
    u.cloudSpeed.value = 0.000045;
    u.cloudCoverage.value = 0.46;
    u.cloudDensity.value = 0.55;
    u.cloudElevation.value = 0.42;

    /*
     * Preetham モデルは太陽ディスク付近で 1e7 級の輝度を返す。
     * half-float レンダーターゲットの上限 (65504) を超えて Inf になり、
     * PMREM のぼかし工程で NaN が全面へ伝播して IBL が真っ黒になるため、
     * シェーダ末尾で輝度に上限を設ける。
     */
    this._skyMaxRadiance = { value: 400.0 };
    // Preetham は非正規化スケール（EE=1000 基準）で返すため、
    // シーンのライト強度と釣り合う範囲へ縮める係数を掛ける。
    this._skyScale = { value: 0.22 };
    sky.material.onBeforeCompile = (shader) => {
      shader.uniforms.uMaxRadiance = this._skyMaxRadiance;
      shader.uniforms.uSkyScale = this._skyScale;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float uMaxRadiance;\n\t\tuniform float uSkyScale;\n\t\tvoid main() {')
        .replace(
          'gl_FragColor = vec4( texColor, 1.0 );',
          'gl_FragColor = vec4( min( texColor * uSkyScale, vec3( uMaxRadiance ) ), 1.0 );'
        );
    };
    sky.material.needsUpdate = true;

    this.sunPosition = new THREE.Vector3();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();

    this.setSunAngle(46, 128); // 高度 / 方位（度）
  }

  /**
   * 太陽の位置を設定し、環境マップを再生成する。
   * @param {number} elevationDeg 高度角（度）
   * @param {number} azimuthDeg 方位角（度）
   */
  setSunAngle(elevationDeg, azimuthDeg) {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    this.sunPosition.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunPosition);

    if (this.sun) {
      this.sun.position.copy(this.sunPosition).multiplyScalar(160);
      this.sun.target.position.set(0, 0, 0);
      this.sun.target.updateMatrixWorld();
    }
    this._sunDirty = true;
  }

  /**
   * 空から IBL 用の環境マップを生成（初回 / 太陽移動時）。
   * 太陽ディスクは焼き込まない（直射光は DirectionalLight が担当するため、
   * 二重計上と極端な輝度による NaN 汚染を避ける）。
   */
  refreshEnvironment() {
    const sky = this.sky;
    const u = sky.material.uniforms;

    const prevScale = sky.scale.x;
    const prevDisc = u.showSunDisc.value;
    const prevMax = this._skyMaxRadiance.value;

    sky.scale.setScalar(1200);
    u.showSunDisc.value = 0;
    this._skyMaxRadiance.value = 12.0;   // IBL 用にさらに安全側へ

    // 空以外を一時的に隠して純粋な天空光だけを取り込む
    const hidden = [];
    for (const c of this.scene.children) {
      if (c !== sky && c.visible && !c.isLight) { c.visible = false; hidden.push(c); }
    }

    const prevRT = this.envRT;
    this.envRT = this.pmrem.fromScene(sky, 0.035, 0.5, 4000);
    prevRT?.dispose();

    for (const c of hidden) c.visible = true;
    sky.scale.setScalar(prevScale);
    u.showSunDisc.value = prevDisc;
    this._skyMaxRadiance.value = prevMax;

    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 1.0;
    this.viewScene.environment = this.envRT.texture;
    this._sunDirty = false;
    return this.envRT.texture;
  }

  _setupLights() {
    const q = QUALITY[this.quality];

    // 太陽（ディレクショナルライト + シャドウ）
    // 空の青いフィルと対比させるため、キーライトははっきり暖色にする。
    // この暖⇔寒の分離が「色が豊かに見える」最大の要因。
    const sun = new THREE.DirectionalLight(0xffdcae, 3.1);
    sun.position.copy(this.sunPosition).multiplyScalar(160);
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 320;
    const d = q.shadowDist;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.028;
    sun.shadow.radius = 2.2;
    sun.shadow.blurSamples = 12;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // 半球光: 上は空の寒色、下は地面からの暖色バウンス。
    // IBL だけだと影が単調な青一色になるため、地面反射の暖色を明示的に足す。
    const hemi = new THREE.HemisphereLight(0x93b8e8, 0x6b5334, 0.55);
    this.scene.add(hemi);
    this.hemi = hemi;

    // 太陽と反対側からの弱い寒色フィル。輪郭が黒く潰れるのを防ぐ。
    const fill = new THREE.DirectionalLight(0x86a9d6, 0.5);
    fill.position.set(-0.6, 0.45, 0.7).multiplyScalar(80);
    this.scene.add(fill);
    this.fill = fill;

    // ビューモデル用の専用ライティング（常に手元が見えるように）
    const vKey = new THREE.DirectionalLight(0xfff2dd, 2.1);
    vKey.position.set(0.6, 1.0, 0.8);
    this.viewScene.add(vKey);
    const vFill = new THREE.DirectionalLight(0x9fb6d4, 0.85);
    vFill.position.set(-0.8, 0.2, -0.5);
    this.viewScene.add(vFill);
    const vRim = new THREE.DirectionalLight(0xffffff, 0.6);
    vRim.position.set(0.1, -0.4, -1.0);
    this.viewScene.add(vRim);
    this.viewLights = { key: vKey, fill: vFill, rim: vRim };
  }

  /**
   * シャドウカメラをプレイヤー周辺へ追従させる（広いマップでの解像度確保）
   */
  updateShadowFollow(target) {
    if (!this.sun) return;
    const s = this.sun;
    s.target.position.set(target.x, 0, target.z);
    s.position.copy(this.sunPosition).multiplyScalar(160).add(
      new THREE.Vector3(target.x, 0, target.z)
    );
    s.target.updateMatrixWorld();
    s.updateMatrixWorld();
  }

  /* ================= ポストプロセス ================= */

  _setupComposer() {
    const q = QUALITY[this.quality];
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const w = Math.floor(size.x * pr), h = Math.floor(size.y * pr);

    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      samples: 0,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setSize(size.x, size.y);
    this.composer.setPixelRatio(pr);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // --- GTAO (アンビエントオクルージョン) ---
    if (q.gtao) {
      const gtao = new GTAOPass(this.scene, this.camera, w, h);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({
        radius: 0.32,
        distanceExponent: 1.0,
        thickness: 1.0,
        scale: 1.05,
        samples: 16,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 });
      gtao.blendIntensity = 0.9;
      this.composer.addPass(gtao);
      this.gtaoPass = gtao;
    }

    // --- ブルーム ---
    if (q.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.62, 0.86);
      this.composer.addPass(bloom);
      this.bloomPass = bloom;
    }

    // --- 径方向モーションブラー ---
    this.blurPass = new ShaderPass(RadialBlurShader);
    this.blurPass.enabled = true;
    this.composer.addPass(this.blurPass);

    // --- トーンマップ + sRGB 変換 ---
    this.composer.addPass(new OutputPass());

    // --- 最終合成 (色収差/ビネット/グレイン/シャープ/グレーディング) ---
    this.compositePass = new ShaderPass(CompositeShader);
    this.compositePass.uniforms.uResolution.value.set(w, h);
    this.composer.addPass(this.compositePass);

    // --- アンチエイリアス ---
    if (q.smaa) {
      this.smaaPass = new SMAAPass();
      this.composer.addPass(this.smaaPass);
    }
  }

  /** 画質プリセットを切り替え（コンポーザを再構築） */
  setQuality(name) {
    if (!QUALITY[name] || name === this.quality) return;
    this.quality = name;
    const q = QUALITY[name];

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    if (this.sun) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      const d = q.shadowDist;
      this.sun.shadow.camera.left = -d; this.sun.shadow.camera.right = d;
      this.sun.shadow.camera.top = d;   this.sun.shadow.camera.bottom = -d;
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    this.composer?.dispose();
    this._setupComposer();
    this._onResize();
  }

  /* ================= ループ ================= */

  _onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);

    const pr = this.renderer.getPixelRatio();
    this.compositePass?.uniforms.uResolution.value.set(w * pr, h * pr);
    this.gtaoPass?.setSize(w * pr, h * pr);
    this.onResize?.(w, h);
  }

  /**
   * ライティング調整用のまとめ設定。
   * @param {object} o {skyScale, envIntensity, exposure, sunIntensity, hemiIntensity, regenEnv}
   */
  tune(o = {}) {
    if (o.skyScale !== undefined) this._skyScale.value = o.skyScale;
    if (o.exposure !== undefined) this.renderer.toneMappingExposure = o.exposure;
    if (o.sunIntensity !== undefined) this.sun.intensity = o.sunIntensity;
    if (o.hemiIntensity !== undefined) this.hemi.intensity = o.hemiIntensity;
    if (o.fillIntensity !== undefined) this.fill.intensity = o.fillIntensity;
    if (o.sunColor !== undefined) this.sun.color.set(o.sunColor);
    if (o.envIntensity !== undefined) this.scene.environmentIntensity = o.envIntensity;
    if (o.regenEnv) this.refreshEnvironment();
    if (o.envIntensity !== undefined) this.scene.environmentIntensity = o.envIntensity;
    return {
      skyScale: this._skyScale.value,
      exposure: this.renderer.toneMappingExposure,
      sunIntensity: this.sun.intensity,
      hemiIntensity: this.hemi.intensity,
      fillIntensity: this.fill.intensity,
      envIntensity: this.scene.environmentIntensity,
    };
  }

  /** 視野角を設定（ADS 時などに使用） */
  setFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 0.01) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setViewFov(fov) {
    if (Math.abs(this.viewCamera.fov - fov) < 0.01) return;
    this.viewCamera.fov = fov;
    this.viewCamera.updateProjectionMatrix();
  }

  /** 1フレーム描画 */
  render(dt) {
    if (this.contextLost) return;
    this.elapsed += dt;
    if (this.compositePass) this.compositePass.uniforms.uTime.value = this.elapsed;
    if (this.sky) this.sky.material.uniforms.time.value = this.elapsed;

    this.renderer.info.reset();
    this.composer.render(dt);

    // ビューモデルを上から重ね描き（深度をクリアして常に手前）
    if (this.viewScene.children.length > 0) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.viewCamera.quaternion.copy(this.camera.quaternion);
      this.viewCamera.position.copy(this.camera.position);
      this.renderer.render(this.viewScene, this.viewCamera);
      this.renderer.autoClear = true;
    }
  }

  get drawCalls() { return this.renderer.info.render.calls; }
  get triangles() { return this.renderer.info.render.triangles; }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.composer?.dispose();
    this.pmrem?.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
