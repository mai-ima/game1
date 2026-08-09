import * as THREE from 'three';

/**
 * 大気遠近（エアリアルパースペクティブ）。
 *
 * three の霧は「距離だけで決まる単色」で、
 *   ・遠クリップ面より手前で必ず 100% に飽和する
 *   ・見上げても見下ろしても同じ濃さ
 *   ・空とは無関係な色
 * の 3 つが同時に効く。
 *
 * 実際にコンパウンドを俯瞰した絵では、これが最悪の形で出た。
 * 霧は near 55 / far 210 なので、外に建てた 118〜520m の街が
 * 例外なく霧の色そのものに塗り潰され、奥行きの差が 1 段も残らない。
 * しかも霧の色（砂色 0xc8b898）は空の水色と別物なので、
 * 地平線に沿って厚紙を立てたような帯ができていた。
 *
 * ここでは霧を 3 点で作り直す。
 *
 *   1. 高さで薄くなる。
 *      霞は地表付近に溜まり、上空は澄む。視線に沿って
 *      exp(-k·y) を積分すると、ビルは足元が霞んで頭が抜ける。
 *      「奥にある」ことより「大きい」ことが先に伝わるので、
 *      建物が板ではなく立体に見えるようになる。
 *
 *   2. 見上げる向きでは空の色へ寄る。
 *      地平線際は地表の霞の色、上へ向かうほど空の色。
 *      遠景の稜線が空へ溶けて、境目の帯が消える。
 *
 *   3. 太陽側は前方散乱で明るく暖かくなる。
 *      逆光の霞が白く飛び、順光側は落ち着く。
 *      これが無いと、どの方角を向いても同じ絵になる。
 *
 * 実装は three の霧チャンクの差し替え。
 * #include で展開されるので onBeforeCompile では手が届かず、
 * ShaderChunk 自体を置き換える必要がある。
 * 一方でユニフォームはマテリアルごとに複製されるため、
 * 共有したい値は onBeforeCompile で同じオブジェクトを差し込む。
 */

/* ------------------------------------------------------------------ *
 * 共有ユニフォーム
 *
 * three は ShaderLib のユニフォームをマテリアルごとに複製する。
 * ここで作ったオブジェクトを onBeforeCompile で差し込めば複製されず、
 * 1 か所の書き換えが全マテリアルへ届く。
 * ------------------------------------------------------------------ */
export const ATMO_UNIFORMS = {
  /** 地表の霞の色（線形。トーンマップ前の放射輝度） */
  atmoHaze: { value: new THREE.Color(0.42, 0.46, 0.52) },
  /** 見上げた先の色（同上） */
  atmoSky: { value: new THREE.Color(0.30, 0.40, 0.55) },
  /** 太陽側の前方散乱色（同上） */
  atmoSun: { value: new THREE.Color(0.90, 0.80, 0.66) },
  atmoSunDir: { value: new THREE.Vector3(0, 1, 0) },
  /**
   * x: 1/特性距離（この距離で 63% 霞む）
   * y: 高さ減衰 k（1/m。1/k がスケールハイト）
   * z: 霞の基準高さ（m）
   * w: 霞の上限（1 にすると遠景が完全に潰れて階調が消える）
   */
  atmoParams: { value: new THREE.Vector4(1 / 320, 0.009, 0, 0.96) },
};

/** onBeforeCompile を自前で持つマテリアル用。先頭で呼ぶ */
export function injectAtmosphere(shader) {
  Object.assign(shader.uniforms, ATMO_UNIFORMS);
}

const PARS_VERTEX = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif
`;

const VERTEX = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  /*
   * ワールド座標を出す。
   *
   * modelMatrix * transformed でも出せるが、それだと
   * インスタンス化・スキニング・スプライトで値が食い違う。
   * mvPosition は全部込みなので、ビュー行列の回転だけ戻せばよい。
   * 回転部は正規直交なので、逆行列＝転置で足りる。
   */
  vFogWorld = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif
`;

const PARS_FRAGMENT = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;

  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif

  uniform vec3 atmoHaze;
  uniform vec3 atmoSky;
  uniform vec3 atmoSun;
  uniform vec3 atmoSunDir;
  uniform vec4 atmoParams;
#endif
`;

const FRAGMENT = /* glsl */`
#ifdef USE_FOG
  {
    vec3  aVec = vFogWorld - cameraPosition;
    float aLen = max(length(aVec), 1e-4);
    vec3  aDir = aVec / aLen;

    float k  = atmoParams.y;
    float y0 = max(cameraPosition.y - atmoParams.z, 0.0);

    /*
     * 視線に沿った霞の量。
     *
     *   τ = σ ∫₀ᴸ exp(-k·y(s)) ds
     *     = σ · exp(-k·y₀) · L · (1 - exp(-k·Δy)) / (k·Δy)
     *
     * 水平（Δy→0）では括弧が 1 に収束するので、
     * そのまま σ·L、つまり普通の距離霧に戻る。
     * 分母が 0 に近いところは 1 次近似へ切り替える。
     */
    float x = k * aVec.y;
    float shape = abs(x) < 1e-3 ? 1.0 - 0.5 * x : (1.0 - exp(-x)) / x;
    float tau = atmoParams.x * exp(-k * y0) * aLen * shape;

    /*
     * 二乗して指数に入れる。
     * 素の exp(-τ) は数 m 先から曇り始めて、戦闘距離の
     * コントラストを削ってしまう。二乗すると近距離がほぼ素通しになり、
     * 100m を越えたあたりから急に効き始める。
     */
    float fogFactor = 1.0 - exp(-tau * tau);
    // 上限を 1 未満にする。1 まで許すと遠景の階調が完全に消えて板になる
    fogFactor = min(fogFactor, atmoParams.w);

    /*
     * 霞の色。
     *
     * まず方位で決める。
     * 太陽と同じ方角の霞は前方散乱で白く明るく、反対側は落ち着く。
     * 内積をそのまま使うと太陽高度 42 度では最大でも 0.74 にしかならず、
     * 逆光でも太陽側の色が 1 割しか乗らなかった。
     * 水平に投影してから -1..1 を 0..1 へ写す。
     */
    vec2 hxz = aVec.xz;
    float az = length(hxz) > 1e-4 ? dot(normalize(hxz), atmoSunDir.xz) : 0.0;
    /*
     * 指数 2.8 は実測値に合わせたもの。
     * 太陽方位 132 度・高度 42 度の空を 45 度おきに測ると、
     * 地平線の放射輝度（G）は 0.90 → 0.60 → 0.37 → 0.28 → 0.26 と落ちる。
     * 前方散乱が鋭いので、線形補間では中間の方位が明るくなりすぎる。
     */
    vec3 hz = mix(atmoHaze, atmoSun, pow(az * 0.5 + 0.5, 2.8));

    /*
     * 見上げる向きだけ空の色へ寄せる。
     *
     * ここのしきい値を 0 から始めると、300m 先のビルの上端
     * （仰角 8 度ほど）にまで天頂の濃い青が乗り、頭が黒ずむ。
     * 霞は地表付近の層なので、通ってくる光の色は
     * 仰角が浅いうちは地平線際とほとんど変わらない。
     */
    hz = mix(hz, atmoSky, smoothstep(0.12, 0.62, aDir.y));

    gl_FragColor.rgb = mix(gl_FragColor.rgb, hz, fogFactor);
  }
#endif
`;

let installed = false;

/**
 * three の霧を差し替える。
 * マテリアルを 1 つでも作る前に呼ぶこと。
 */
export function installAtmosphere() {
  if (installed) return;
  installed = true;

  THREE.ShaderChunk.fog_pars_vertex = PARS_VERTEX;
  THREE.ShaderChunk.fog_vertex = VERTEX;
  THREE.ShaderChunk.fog_pars_fragment = PARS_FRAGMENT;
  THREE.ShaderChunk.fog_fragment = FRAGMENT;

  /*
   * 共有ユニフォームを全マテリアルへ届ける。
   *
   * onBeforeCompile を自前で設定したマテリアルはこの実装を隠すので、
   * そちら側では injectAtmosphere を明示的に呼ぶ。
   * （MaterialLibrary の ORM 詰め込みが該当する）
   */
  const proto = THREE.Material.prototype;
  const prev = proto.onBeforeCompile;
  proto.onBeforeCompile = function atmosphereOnBeforeCompile(shader, renderer) {
    if (this.fog) injectAtmosphere(shader);
    return prev.call(this, shader, renderer);
  };
}

/* ------------------------------------------------------------------ *
 * 設定
 * ------------------------------------------------------------------ */

const _tint = new THREE.Color();
const _tmp = new THREE.Color();

/**
 * マップごとの大気を設定する。
 *
 * @param {object} o
 *   sky        {THREE.Color} 見上げた先の放射輝度（線形）。空から実測した値
 *   horizon    {THREE.Color} 地平線際の放射輝度（線形）。同上
 *   sunGlow    {THREE.Color} 太陽方向の放射輝度（線形）。同上
 *   dust       {number}      霞に混ぜる色味（16 進。明るさは使わない）
 *   dustMix    {number}      0=空の色そのまま 1=完全に dust の色味
 *   hazeGain   {number}      霞の明るさ倍率。1 より上げると白っぽく霞む
 *   distance   {number}      特性距離（m）。この距離で 63% 霞む
 *   scaleHeight{number}      霞のスケールハイト（m）。小さいほど層が薄い
 *   groundY    {number}      霞の底の高さ（m）
 *   max        {number}      霞の上限（既定 0.96）
 */
export function setAtmosphere(o = {}) {
  const u = ATMO_UNIFORMS;
  const {
    sky, horizon, sunGlow,
    dust = 0xffffff, dustMix = 0,
    hazeGain = 1.0, skyGain = 1.0,
    distance = 320, scaleHeight = 110, groundY = 0, max = 0.96,
  } = o;

  if (sky) u.atmoSky.value.copy(sky).multiplyScalar(skyGain);
  if (horizon) u.atmoHaze.value.copy(horizon).multiplyScalar(hazeGain);
  if (sunGlow) u.atmoSun.value.copy(sunGlow);

  /*
   * 砂塵の色味を乗せる。
   *
   * 空の放射輝度は 1 を超えることがあり（トーンマップ前なので当然）、
   * 16 進で書いた砂色（0〜1）とそのまま混ぜると霞が急に暗くなる。
   * 明るさと色味を切り分けて、色味だけを補間する。
   *
   * 掛け算で寄せる作りも試したが、青い空の色に砂色を掛けても
   * 灰色になるだけで砂漠の霞にはならなかった。
   * 明るさを保ったまま色度を混ぜれば、比率どおりに色が動く。
   */
  if (dustMix > 0) {
    _tmp.setHex(dust, THREE.SRGBColorSpace);
    const dl = Math.max(1e-4, _tmp.r * 0.2126 + _tmp.g * 0.7152 + _tmp.b * 0.0722);
    for (const c of [u.atmoHaze.value, u.atmoSun.value]) {
      const bl = Math.max(1e-4, c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722);
      _tint.setRGB(
        (c.r / bl) + ((_tmp.r / dl) - (c.r / bl)) * dustMix,
        (c.g / bl) + ((_tmp.g / dl) - (c.g / bl)) * dustMix,
        (c.b / bl) + ((_tmp.b / dl) - (c.b / bl)) * dustMix,
      );
      c.setRGB(_tint.r * bl, _tint.g * bl, _tint.b * bl);
    }
  }

  u.atmoParams.value.set(1 / Math.max(1, distance), 1 / Math.max(1, scaleHeight), groundY, max);
}

/**
 * 太陽の向き。
 *
 * 霞の色は方位だけで決めるので、水平に投影して持つ。
 * 高度を残したまま内積を取ると、太陽が高い時間帯に
 * 逆光側でも値が伸びず、前方散乱がほとんど効かなくなる。
 */
export function setAtmosphereSun(dir) {
  const h = Math.hypot(dir.x, dir.z) || 1;
  ATMO_UNIFORMS.atmoSunDir.value.set(dir.x / h, 0, dir.z / h);
}
