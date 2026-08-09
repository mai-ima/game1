import * as THREE from 'three';

/**
 * 雲。
 *
 * 空は画面の半分以上を占める。そこが単色のグラデーションのままだと、
 * 地上をどれだけ作り込んでも「作りかけ」に見える。
 * 実際、テストベッドを見渡した絵では画面の 55% が無地の青だった。
 *
 * three の Sky.js にも雲は入っているが、
 * 太陽高度 66 度・トーンマップ後ではほぼ白飛びして見えない。
 * ここでは雲だけを別の層として持ち、形と陰影を自分で決める。
 *
 * 作りは「薄いドームに 2 次元の密度場を描く」もの。
 * 本当のボリュームは焼かないが、
 *   ・高さの違う 3 枚を視差でずらして重ねる
 *   ・太陽側を明るく、底面を暗くする
 *   ・縁だけ透過を強めて銀色に光らせる
 * の 3 つで、平面には見えなくなる。
 *
 * 画素あたりの負荷は octaves で決まる。
 * 内蔵 GPU では 3、最高画質では 5 を使う。
 */

const VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vec4 p = projectionMatrix * viewMatrix * w;
    /*
     * 最遠面へ貼り付ける。
     *
     * ドームの半径は 5km あるが、カメラの遠クリップ面は
     * マップごとに 460〜800m しかない。素直に投影すると
     * まるごと切り落とされて、雲が一枚も出ない（実際そうなった）。
     * z を w に合わせると深度が必ず 1.0 になり、
     * 遠クリップ面の外でも消えず、かつ手前の物には必ず隠れる。
     * 空（Sky.js）も同じ手を使っている。
     */
    p.z = p.w;
    gl_Position = p;
  }
`;

const FRAG = /* glsl */`
  precision highp float;

  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  uniform vec3  uSkyColor;
  uniform vec3  uBaseColor;
  uniform float uTime;
  uniform float uCoverage;
  uniform float uDensity;
  uniform float uHeight;      // 雲底の高さ（m）
  uniform float uScale;       // 1m あたりの模様の細かさ
  uniform float uWind;
  uniform float uOpacity;

  varying vec3 vWorld;

  /* --- 値ノイズ --- */
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5, norm = 0.0;
    mat2 rot = mat2(0.86, 0.5, -0.5, 0.86);   // 層ごとに回すと格子が消える
    for (int i = 0; i < OCTAVES; i++) {
      v += a * vnoise(p);
      norm += a;
      p = rot * p * 2.03;
      a *= 0.5;
    }
    /*
     * 0..1 に正規化する。
     * ここを忘れると、4 オクターブでは値がほぼ 0.3〜0.6 に収まり、
     * どんなしきい値を置いても雲が出ないか一面が曇るかの
     * どちらかにしかならない（実際、最初は何も出なかった）。
     */
    return v / norm;
  }

  /**
   * ある高さの雲層を、視線と平面の交点でサンプルする。
   * 高さを変えて呼ぶと視差が付き、重なりが立体に見える。
   */
  float layer(vec3 dir, float h, float coverage, float warp) {
    /*
     * 平面との交点を取ると、仰角が下がるほど 1/dir.y が発散し、
     * 雲が地平線に向かって無限に引き伸ばされる。
     * 最初の版はこれで、塊ではなく横に流れた筋になっていた。
     * 分母に下限を置いて、伸びを 8 倍までに抑える。
     * 抑えた分だけ遠近感は減るが、筋よりはずっとよい。
     */
    float y = max(dir.y, 0.125);
    vec2 uv = dir.xz / y * h * uScale;
    uv += vec2(uTime * uWind, uTime * uWind * 0.35);

    /*
     * ドメインワープ。
     * そのままの FBM は「もやもやした灰色」にしかならない。
     * 座標自体を別のノイズで曲げると、積乱雲の塊のような
     * 丸みと切れ込みが出る。
     */
    vec2 q = vec2(fbm(uv * 0.5), fbm(uv * 0.5 + 3.7));
    float n = fbm(uv + q * warp);

    /*
     * 覆い率で切る。
     * 正規化した FBM は 0.5 を中心に釣り鐘状に分布するので、
     * しきい値も 0.5 のまわりで動かす。
     * 立ち上がりを緩くすると縁がふわりとほどける。
     */
    return smoothstep(coverage, coverage + 0.22, n);
  }

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);

    // 地平線の下と、真上へ向かうにつれての減衰
    float horizon = smoothstep(-0.02, 0.10, dir.y);
    if (horizon <= 0.001) discard;

    /*
     * uCoverage 0 = 快晴 / 1 = 一面の曇り。
     * 正規化後の FBM は 0.5 前後に集まるので、
     * しきい値は 0.72（ほとんど出ない）〜 0.30（一面）へ写す。
     */
    float cov = mix(0.72, 0.30, uCoverage);

    // 高さ違いの 3 枚。上の層ほど細かく、薄く
    float d0 = layer(dir, uHeight,        cov,        1.9);
    float d1 = layer(dir, uHeight * 1.28, cov + 0.06, 1.4);
    float d2 = layer(dir, uHeight * 1.62, cov + 0.13, 1.0);

    /*
     * 3 枚を足す。
     * 単純な加算だと霧のように均されるので、
     * いちばん下の層を主役にして、上の層は「厚みの足し」に使う。
     * 最後に pow で締めると、縁が立って塊になる。
     */
    float dens = d0 * 0.78 + d1 * 0.34 + d2 * 0.22;
    dens = clamp(dens * uDensity, 0.0, 1.0);
    dens = pow(dens, 0.72);
    if (dens < 0.004) discard;

    /*
     * 陰影。
     *
     * 平らに塗ると紙を貼ったようにしか見えない。
     * 「太陽に近い側の縁が明るく、塊の内側と底が暗い」
     * という当たり前の関係を作るだけで、厚みが出る。
     */
    float sun = max(0.0, dot(dir, uSunDir));
    // 縁（密度の低い所）は光を透かす
    float rim = 1.0 - smoothstep(0.0, 0.50, dens);
    float silver = pow(sun, 8.0) * rim * 1.6;

    /*
     * 塊の内側は光が届かない。
     *
     * ここの幅が狭いと、雲全体が同じ白さになって
     * 「空に貼った白い染み」にしか見えない。
     * 実際、最初は太陽高度が高い時間帯で真っ白に潰れていた。
     * 濃い所は 3 割程度まで落として、灰色の腹を作る。
     */
    float shade = mix(0.28, 1.0, 1.0 - smoothstep(0.16, 0.90, dens));

    /*
     * 陰の側は空の色を拾う。
     * 影を単に暗くするだけだと煤けて見える。
     * 実際の雲の底は、下から返ってくる空と地面の光で青みを帯びる。
     */
    vec3 shadow = mix(uBaseColor, uSkyColor, 0.35);
    vec3 col = mix(shadow, uSunColor, shade);
    col += uSunColor * silver;
    // 地平線際は大気に溶ける
    col = mix(uSkyColor, col, smoothstep(0.02, 0.30, dir.y));

    float alpha = dens * uOpacity * horizon;
    // 遠く（低い仰角）ほど薄く重なって見えるので、少し戻す
    alpha = min(1.0, alpha * (1.0 + (1.0 - horizon) * 0.5));

    gl_FragColor = vec4(col, alpha);
  }
`;

export class Clouds {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opt {octaves, radius}
   */
  constructor(scene, opt = {}) {
    const { octaves = 4, radius = 5200 } = opt;
    this.scene = scene;
    this._octaves = octaves;

    const geo = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff6ea) },
      uSkyColor: { value: new THREE.Color(0xbcd2e8) },
      uBaseColor: { value: new THREE.Color(0x6f7c8e) },
      uTime: { value: 0 },
      uCoverage: { value: 0.58 },
      uDensity: { value: 1.35 },
      uHeight: { value: 1150 },
      uScale: { value: 0.00060 },
      uWind: { value: 0.9 },
      uOpacity: { value: 1.0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: `#define OCTAVES ${octaves}\n${FRAG}`,
      transparent: true,
      depthWrite: false,
      // 深度は 1.0 に固定してあるので、手前の建物には隠れる
      depthTest: true,
      side: THREE.BackSide,
      fog: false,
      toneMapped: true,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'Clouds';
    this.mesh.frustumCulled = false;
    // 空（renderOrder 1000）を塗ったあとに重ねる
    this.mesh.renderOrder = 1001;
    scene.add(this.mesh);
  }

  /** 太陽の向きと、空の色に合わせて雲の色を決める */
  setSun(dir, sunColor, skyColor) {
    this.uniforms.uSunDir.value.copy(dir).normalize();
    if (sunColor) this.uniforms.uSunColor.value.copy(sunColor);
    if (skyColor) this.uniforms.uSkyColor.value.copy(skyColor);

    /*
     * 雲の底の色。
     * 白い雲を白いまま塗ると、曇り空でも快晴でも同じに見える。
     * 太陽が低いほど底が暗く、赤みを帯びる。
     */
    const h = Math.max(0, dir.y);
    const base = this.uniforms.uBaseColor.value;
    base.setRGB(0.22, 0.25, 0.31).lerp(new THREE.Color(0.46, 0.48, 0.53), h);
    if (h < 0.35) base.lerp(new THREE.Color(0.42, 0.29, 0.26), (0.35 - h) / 0.35 * 0.55);
  }

  /** 覆い率（0=快晴 1=一面の曇り） */
  setWeather(coverage, density = 1.05) {
    this.uniforms.uCoverage.value = coverage;
    this.uniforms.uDensity.value = density;
  }

  setVisible(v) { this.mesh.visible = v; }

  update(dt) {
    // カメラに追従させて、歩いても雲との距離が変わらないようにする
    this.uniforms.uTime.value += dt;
  }

  /** カメラの位置へ中心を移す（毎フレーム呼ぶ） */
  follow(camPos) {
    this.mesh.position.set(camPos.x, 0, camPos.z);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
