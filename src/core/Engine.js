import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { CompositeShader, RadialBlurShader } from '../render/PostFX.js';

/**
 * 画質プリセット。
 *
 * pixelRatio は「上限」。実際の描画解像度はここに動的解像度スケール
 * （後述の DRS）を掛けた値になるため、余裕のある端末では上限まで上がり、
 * 苦しい端末では自動的に下がる。
 *
 * aa: 'smaa'（3 パス・最良） / 'fxaa'（1 パス・安価） / 'none'
 */
export const QUALITY = {
  low:    { pixelRatio: 1.0,  shadows: false, shadowMap: 1024, gtao: false, bloom: false, aa: 'fxaa', aniso: 4,  shadowDist: 30, texSize: 256,  bloomScale: 0.5,  minScale: 0.62 },
  medium: { pixelRatio: 1.0,  shadows: true,  shadowMap: 1536, gtao: false, bloom: true,  aa: 'fxaa', aniso: 8,  shadowDist: 40, texSize: 512,  bloomScale: 0.5,  minScale: 0.70 },
  high:   { pixelRatio: 1.5,  shadows: true,  shadowMap: 2048, gtao: false, bloom: true,  aa: 'smaa', aniso: 16, shadowDist: 52, texSize: 512,  bloomScale: 0.5,  minScale: 0.70 },
  ultra:  { pixelRatio: 2.0,  shadows: true,  shadowMap: 2560, gtao: true,  bloom: true,  aa: 'smaa', aniso: 16, shadowDist: 68, texSize: 1024, bloomScale: 0.75, minScale: 0.75 },
};

/** 画質プリセットの説明（設定画面に出す） */
export const QUALITY_INFO = {
  low:    { label: '低',   desc: '影とブルームを切り、解像度も抑える。GPU が弱い端末向け。' },
  medium: { label: '中',   desc: '影あり・簡易アンチエイリアス。多くのノートPCで 60fps を狙える。' },
  high:   { label: '高',   desc: '影 2048・SMAA・等倍以上の解像度。既定の推奨設定。' },
  ultra:  { label: '最高', desc: 'さらに環境遮蔽（GTAO）と高解像度の影を追加。要 dGPU。' },
};

/**
 * 動的解像度が取りうる段階（プリセットの pixelRatio に対する倍率）。
 * 下げすぎると「見られる絵」でなくなるため、既定の下限は 0.70 とし、
 * それ以下は利用者が明示的に許可した場合だけ使う。
 */
const SCALE_STEPS = [1.0, 0.92, 0.85, 0.78, 0.70, 0.62, 0.55];
/** 通常時に到達できる最下段（利用者が「性能優先」を選ぶと最後まで使う） */
const SAFE_MIN_INDEX = 4;
/** 目標フレーム時間（ms）。60fps を狙い、これを超え続けたら解像度を下げる */
const TARGET_MS = 16.7;

/**
 * GPU がソフトウェア実装かどうかを判定する。
 *
 * Chrome はハードウェアアクセラレーションが無効・GPU が blocklist 入り・
 * リモートデスクトップ経由といった条件で SwiftShader（CPU 実装）へ落ちる。
 * この状態では本作に限らず 3D は 1fps 級になり、利用者からは
 * 「フリーズした」ようにしか見えない。判別して設定を最小にし、
 * 原因を伝えられるようにしておく。
 */
export function detectSoftwareRenderer(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(
      (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || ''
    );
    const soft = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|generic renderer/i.test(name);
    return { name, software: soft };
  } catch {
    return { name: '不明', software: false };
  }
}

export class Engine {
  /**
   * @param {HTMLElement} container
   * @param {string} quality QUALITY のキー
   */
  constructor(container, quality = 'high', opts = {}) {
    this.container = container;
    // 検証用途では、ソフトウェア描画でも指定した画質のまま動かしたいことがある
    this.ignoreSoftwareDowngrade = !!opts.ignoreSoftwareDowngrade;
    this.quality = QUALITY[quality] ? quality : 'high';
    const q = QUALITY[this.quality];

    /* ---------------- レンダラ ---------------- */
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,           // SMAA / FXAA をポストで使うため無効
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
      /*
       * preserveDrawingBuffer は false。true にするとブラウザは毎フレーム
       * 描画バッファを保持するためにコピーを挟み、合成のゼロコピー経路から
       * 外れる。Chrome では高解像度ほど顕著に重くなる。
       * canvas から画像を取り出したい場合は captureFrame() を使う
       * （描き直した直後に読むので保持は不要）。
       */
      preserveDrawingBuffer: false,
    });

    /*
     * ---------------- 動的解像度（DRS） ----------------
     * 実測フレーム時間に応じて描画解像度を上下させる。
     * 端末性能を事前に当てるのは不可能なので、走らせながら合わせるほうが確実。
     * 初期値は 1 段下げた状態から始め、余裕があれば上げていく
     * （最初のフレームから重い、という印象を避けるため）。
     */
    this._scaleIdx = 1;
    this._frameMs = TARGET_MS;
    this._scaleCooldown = 1.2;
    /** 解像度の自動調整（利用者が切れる） */
    this.autoResolution = true;
    /**
     * 解像度を下限まで下げても足りないときに画質プリセットまで落とすか。
     * 既定は false。勝手に見た目が別物になるのは体験として悪いので、
     * 「性能優先」を選んだときだけ有効にする。
     */
    this.autoQualityDowngrade = false;
    /** 通常時に許す最下段。性能優先ではさらに下まで使う。 */
    this._minScaleIndex = SAFE_MIN_INDEX;

    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = q.shadows !== false;
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

    /* ---------------- GPU の素性を確認 ---------------- */
    this.gpu = detectSoftwareRenderer(this.renderer.getContext());
    if (this.gpu.software && !this.ignoreSoftwareDowngrade) {
      // CPU 描画では何をしても 60fps には届かない。最小構成で始める。
      this.quality = 'low';
      this._scaleIdx = SCALE_STEPS.length - 1;
      this.renderer.setPixelRatio(this._targetPixelRatio());
      this.renderer.shadowMap.enabled = false;
      this.composer?.dispose();
      this._setupComposer();
      this._onResizeRaw();
    }

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
    /*
     * 空は最後に描く。
     * 雲は 2 回の FBM（各 5 オクターブ）を回す高価なフラグメントシェーダで、
     * 既定の描画順（不透明を手前から）だと画面全体で実行されたうえに
     * 建物で上書きされ、丸ごと無駄になる。
     * 最後に回せば深度テストで隠れた画素が early-Z で捨てられ、
     * 実際に空が見えている部分だけの計算で済む。
     */
    sky.renderOrder = 1000;
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
    // 毎フレーム呼ばれるので Vector3 を生成しない
    s.position.copy(this.sunPosition).multiplyScalar(160);
    s.position.x += target.x;
    s.position.z += target.z;
    s.target.updateMatrixWorld();
    s.updateMatrixWorld();
  }

  /* ================= ポストプロセス ================= */

  _setupComposer() {
    const q = QUALITY[this.quality];
    // 作り直すので、前回のパス参照は必ず捨てる
    this.gtaoPass = null; this.bloomPass = null; this.smaaPass = null; this.fxaaPass = null;

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
    // AO は低周波なので半解像度で十分。全解像度だと深度・法線の再描画まで
    // 含めて基本パスの数倍のコストになる。
    if (q.gtao) {
      const gw = Math.max(2, Math.floor(w * 0.5)), gh = Math.max(2, Math.floor(h * 0.5));
      const gtao = new GTAOPass(this.scene, this.camera, gw, gh);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({
        radius: 0.32,
        distanceExponent: 1.0,
        thickness: 1.0,
        scale: 1.05,
        samples: 8,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 8 });
      gtao.blendIntensity = 0.9;
      this.composer.addPass(gtao);
      this.gtaoPass = gtao;
    }

    // --- ブルーム ---
    // ブルームも低周波。入力解像度を落としても見た目はほぼ変わらない一方、
    // 内部で 5 段のミップ×2 方向ぼかしを回すためコスト差は大きい。
    if (q.bloom) {
      const bs = q.bloomScale ?? 0.5;
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(Math.max(4, Math.floor(w * bs)), Math.max(4, Math.floor(h * bs))),
        0.34, 0.62, 0.86
      );
      this.composer.addPass(bloom);
      this.bloomPass = bloom;
      this._bloomScale = bs;
    }

    // --- 径方向モーションブラー ---
    // 効果量が 0 のときはパスごと無効化する。有効なままだと、何も変えない
    // 全画面描画とレンダーターゲットの往復が毎フレーム走って無駄になる。
    this.blurPass = new ShaderPass(RadialBlurShader);
    this.blurPass.enabled = false;
    this.motionBlurAllowed = this._motionBlurAllowed ?? true;
    this.composer.addPass(this.blurPass);

    // --- トーンマップ + sRGB 変換 ---
    this.composer.addPass(new OutputPass());

    // --- 最終合成 (色収差/ビネット/グレイン/シャープ/グレーディング) ---
    this.compositePass = new ShaderPass(CompositeShader);
    this.compositePass.uniforms.uResolution.value.set(w, h);
    this.composer.addPass(this.compositePass);

    // --- アンチエイリアス ---
    // SMAA は 3 パス、FXAA は 1 パス。負荷に応じて選べるようにしておく。
    if (q.aa === 'smaa') {
      this.smaaPass = new SMAAPass();
      this.composer.addPass(this.smaaPass);
    } else if (q.aa === 'fxaa') {
      const fxaa = new ShaderPass(FXAAShader);
      fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
      this.composer.addPass(fxaa);
      this.fxaaPass = fxaa;
    }
  }

  /**
   * シェーダを事前コンパイルする。
   *
   * three は「そのマテリアルで初めて描画するフレーム」でプログラムを
   * 生成・リンクする。これは同期処理なので、対戦開始直後や新しい敵・武器が
   * 初めて画面に入った瞬間に数十〜数百 ms のカクつきとして現れる。
   * ローディング中にまとめて済ませておけば、試合中は起きない。
   */
  async precompile() {
    const r = this.renderer;
    try {
      if (r.compileAsync) {
        await r.compileAsync(this.scene, this.camera);
        if (this.viewScene.children.length > 0) await r.compileAsync(this.viewScene, this.viewCamera);
      } else {
        r.compile(this.scene, this.camera);
        if (this.viewScene.children.length > 0) r.compile(this.viewScene, this.viewCamera);
      }
    } catch { /* コンパイル失敗は描画時に再試行される */ }
  }

  /* ================= 動的解像度 ================= */

  /** 現在の解像度段階から実際のピクセル比を求める */
  _targetPixelRatio() {
    const q = QUALITY[this.quality];
    const scale = SCALE_STEPS[this._scaleIdx];
    // 下限を下回るとさすがに眠い絵になるので、プリセットごとの最低値で止める
    const eff = Math.max(q.minScale ?? 0.5, scale);
    return Math.max(0.5, Math.min(window.devicePixelRatio, q.pixelRatio) * eff);
  }

  /** 解像度段階を変更して、レンダラとコンポーザに反映する */
  _applyScale(idx) {
    const lowest = Math.min(SCALE_STEPS.length - 1, this._minScaleIndex ?? SAFE_MIN_INDEX);
    const clamped = Math.max(0, Math.min(lowest, idx));
    if (clamped === this._scaleIdx) return false;
    this._scaleIdx = clamped;
    this.renderer.setPixelRatio(this._targetPixelRatio());
    this._onResize();
    // 作り直したレンダーターゲットの確保コストを次フレームの計測に混ぜない
    this._lastFrameAt = 0;
    return true;
  }

  /**
   * 実測フレーム時間から解像度を上下させる。
   *
   * 下げるときは素早く（重い状態を長引かせない）、
   * 上げるときは慎重に（上げ下げの振動を防ぐ）。
   * @param {number} dt 直前フレームの経過秒
   */
  _updateAutoResolution(dt) {
    if (!this.autoResolution) return;

    /*
     * フレーム時間は自前で測る。
     * ゲームループから渡される dt は物理を安定させるため上限で切られており
     * （50ms 相当）、本当に重いときの値がそのまま丸められてしまうため、
     * これを判断材料にすると解像度がいつまでも下がらない。
     */
    const now = performance.now();
    const raw = this._lastFrameAt ? now - this._lastFrameAt : TARGET_MS;
    this._lastFrameAt = now;
    // タブ復帰などの巨大な間隔は測定対象外
    if (raw > 2000) return;
    const ms = Math.min(raw, 400);
    /*
     * 指数移動平均。悪化には速く、改善にはゆっくり追従させる。
     * 逆にすると、たまたま軽い数フレームで解像度を上げてしまい、
     * 上げ下げを往復し続ける。
     */
    this._frameMs += (ms - this._frameMs) * (ms > this._frameMs ? 0.30 : 0.06);

    this._scaleCooldown -= raw / 1000;
    if (this._scaleCooldown > 0) return;

    if (this._frameMs > TARGET_MS * 1.35) {
      /*
       * 描画時間はおおむね画素数に比例するので、必要な縮小率は
       * sqrt(目標時間 / 実測時間)。1 段ずつ下げると重い端末では
       * 収束まで何秒もかかるため、必要な段まで一気に飛ばす。
       */
      const need = Math.sqrt(TARGET_MS / this._frameMs);
      const lowest = Math.min(SCALE_STEPS.length - 1, this._minScaleIndex ?? SAFE_MIN_INDEX);
      let want = this._scaleIdx;
      while (want < lowest && SCALE_STEPS[want] > need) want++;
      if (this._applyScale(Math.max(this._scaleIdx + 1, want))) {
        this._scaleCooldown = 1.0;
        this._frameMs = TARGET_MS;
        return;
      }
      /*
       * 解像度を下限まで落としてもまだ重い。
       * プリセット自体が端末に対して重すぎるので 1 段下げるが、
       * これは見た目が明確に変わる操作なので、
       * 利用者が「性能優先」を選んだときだけ行う。
       */
      if (!this.autoQualityDowngrade) return;
      const order = ['ultra', 'high', 'medium', 'low'];
      const i = order.indexOf(this.quality);
      if (i >= 0 && i < order.length - 1) {
        const next = order[i + 1];
        this.setQuality(next);
        this._scaleCooldown = 6.0;
        this._frameMs = TARGET_MS;
        this.onQualityAuto?.(next);
      }
    } else if (this._frameMs < TARGET_MS * 0.72) {
      // 十分な余裕がある → 1 段上げる
      if (this._applyScale(this._scaleIdx - 1)) {
        this._scaleCooldown = 3.0;
        this._frameMs = TARGET_MS;
      }
    }
  }

  /**
   * 性能優先モードの切り替え。
   * 有効にすると解像度の下限をさらに下げ、
   * それでも足りなければ画質プリセット自体も自動で落とす。
   */
  setPerformanceMode(on) {
    this.autoQualityDowngrade = !!on;
    this._minScaleIndex = on ? SCALE_STEPS.length - 1 : SAFE_MIN_INDEX;
    if (!on && this._scaleIdx > SAFE_MIN_INDEX) this._applyScale(SAFE_MIN_INDEX);
  }

  /** 実際に描画している解像度（デバッグ表示用） */
  get renderScale() { return +(this._targetPixelRatio() / Math.min(window.devicePixelRatio, QUALITY[this.quality].pixelRatio)).toFixed(2); }
  get renderSize() { return `${this.renderer.domElement.width}x${this.renderer.domElement.height}`; }

  /** 画質プリセットを切り替え（コンポーザを再構築） */
  setQuality(name) {
    if (!QUALITY[name] || name === this.quality) return;
    this.quality = name;
    const q = QUALITY[name];

    this._scaleIdx = 1;
    this._frameMs = TARGET_MS;
    this._scaleCooldown = 1.5;
    this._lastFrameAt = 0;
    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.shadowMap.enabled = q.shadows !== false;
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

  /** bind 前でも呼べる実体。_onResize はこれを指す。 */
  _onResizeRaw() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);

    const pw = Math.floor(w * pr), ph = Math.floor(h * pr);
    this.compositePass?.uniforms.uResolution.value.set(pw, ph);
    // GTAO とブルームは縮小解像度で動かしているので、その比率を保つ
    this.gtaoPass?.setSize(Math.max(2, Math.floor(pw * 0.5)), Math.max(2, Math.floor(ph * 0.5)));
    if (this.bloomPass) {
      const bs = this._bloomScale ?? 0.5;
      this.bloomPass.setSize(Math.max(4, Math.floor(pw * bs)), Math.max(4, Math.floor(ph * bs)));
    }
    this.fxaaPass?.material.uniforms.resolution.value.set(1 / pw, 1 / ph);
    this.onResize?.(w, h);
  }

  _onResize() { this._onResizeRaw(); }

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

    // 効果量が 0 のモーションブラーはパスごと止める（無駄な全画面描画を省く）
    if (this.blurPass) {
      this.blurPass.enabled = this.motionBlurAllowed &&
        this.blurPass.uniforms.uStrength.value > 0.002;
    }

    this._updateAutoResolution(dt);

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

  /**
   * 現在のフレームを PNG データ URL として取り出す。
   * preserveDrawingBuffer が false のため、描き直した直後に読む必要がある。
   * @param {number} dt 描き直しに使う経過秒
   */
  captureFrame(dt = 0.016) {
    this.render(dt);
    return this.renderer.domElement.toDataURL('image/png');
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
