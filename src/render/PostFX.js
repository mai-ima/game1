import * as THREE from 'three';

/**
 * 最終合成パス用シェーダ。
 * トーンマップ後の LDR 画像に対して以下を一括適用する:
 *  - 色収差 (radial chromatic aberration)
 *
 * 色収差の強さについて。
 *
 * 以前は 0.00052 だった。ずれ量は c·r²·強さ·12 なので、
 * 画面の角では UV で 0.00156、1000 画素幅なら 1.6 画素になる。
 * さらにアンシャープマスクが縁を持ち上げるため、
 * ブロック塀の目地・窓の桟・トタンの山といった細かい繰り返しが
 * どれも赤緑の縞に割れていた。実際に切って撮り比べると、
 * 街並みの絵が別物というほど締まる。
 *
 * 実際のレンズの倍率色収差は、画面の大半で 1 画素に遠く及ばない。
 * 1/5 に落として、隅にわずかな色の縁が残る程度にとどめる。
 *  - ビネット
 *  - フィルムグレイン
 *  - アンシャープマスクによるシャープ化
 *  - カラーグレーディング (lift / gamma / gain + 彩度 + コントラスト)
 *  - 被弾時の赤フラッシュ / 低体力時の脈動
 */
export const CompositeShader = {
  name: 'CompositeShader',
  uniforms: {
    tDiffuse:       { value: null },
    uTime:          { value: 0 },
    uResolution:    { value: new THREE.Vector2(1, 1) },
    uAberration:    { value: 0.00010 },
    uVignette:      { value: 0.34 },
    uGrain:         { value: 0.016 },
    uSharpen:       { value: 0.15 },
    uSaturation:    { value: 1.12 },
    uContrast:      { value: 1.12 },
    uLift:          { value: new THREE.Vector3(0.000, 0.003, 0.012) },
    uGain:          { value: new THREE.Vector3(1.015, 1.0, 0.995) },
    // スプリットトーン: 影に寒色・ハイライトに暖色を乗せて色の分離を作る
    /*
     * スプリットトーン。
     * 影へ寒色・ハイライトへ暖色を寄せて色相の分離を作るが、
     * 影側を青くしすぎると環境光の青みと二重に効いて、
     * 白い壁まで水色に転ぶ。控えめな値にとどめる。
     */
    uShadowTint:    { value: new THREE.Vector3(0.40, 0.44, 0.52) },
    uHighlightTint: { value: new THREE.Vector3(1.00, 0.86, 0.62) },
    uSplitStrength: { value: 0.05 },
    uSplitBalance:  { value: 0.34 },
    // 彩度の伸ばし方（低彩度部をより強く持ち上げる vibrance）
    // 強くしすぎると、わずかな青みが一気に水色まで持ち上がる。
    uVibrance:      { value: 0.14 },
    uDamage:        { value: 0.0 },   // 0..1 被弾フラッシュ
    uLowHealth:     { value: 0.0 },   // 0..1 低体力
    uFlash:         { value: 0.0 },   // 0..1 スタングレネード等
    uScopeVignette: { value: 0.0 },   // 0..1 スコープ時の周辺減光
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uVignette, uGrain, uSharpen;
    uniform float uSaturation, uContrast, uDamage, uLowHealth, uFlash, uScopeVignette;
    uniform float uSplitStrength, uSplitBalance, uVibrance;
    uniform vec2  uResolution;
    uniform vec3  uLift, uGain, uShadowTint, uHighlightTint;
    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c  = uv - 0.5;
      float r2 = dot(c, c);

      // --- 色収差: 画面端ほど RGB をずらす ---
      float ab = uAberration * (1.0 + uScopeVignette * 2.0);
      vec2 off = c * r2 * ab * 12.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;

      // --- アンシャープマスク ---
      if (uSharpen > 0.001) {
        vec2 px = 1.0 / uResolution;
        vec3 blur = (
          texture2D(tDiffuse, uv + vec2( px.x, 0.0)).rgb +
          texture2D(tDiffuse, uv + vec2(-px.x, 0.0)).rgb +
          texture2D(tDiffuse, uv + vec2(0.0,  px.y)).rgb +
          texture2D(tDiffuse, uv + vec2(0.0, -px.y)).rgb
        ) * 0.25;
        col += (col - blur) * uSharpen;
      }

      // --- カラーグレーディング ---
      col = max(col, 0.0);
      col = col * uGain + uLift;

      // スプリットトーン: 輝度を境に影へ寒色・ハイライトへ暖色を加算する。
      // AAA タイトルの「色が豊か」に見える最大の要因がこの色相分離。
      {
        float l = dot(col, LUMA);
        float hi = smoothstep(uSplitBalance, 1.0, l);
        float lo = 1.0 - smoothstep(0.0, uSplitBalance, l);
        vec3 sh = (uShadowTint * 2.0 - 1.0) * lo;
        vec3 hl = (uHighlightTint * 2.0 - 1.0) * hi;
        col += (sh + hl) * uSplitStrength * 0.5;
        col = max(col, 0.0);
      }

      // バイブランス: 既に鮮やかな色は据え置き、くすんだ色だけを持ち上げる
      {
        float l = dot(col, LUMA);
        float mx = max(col.r, max(col.g, col.b));
        float mn = min(col.r, min(col.g, col.b));
        float sat = mx - mn;
        col = mix(vec3(l), col, 1.0 + uVibrance * (1.0 - smoothstep(0.0, 0.55, sat)));
      }

      float luma = dot(col, LUMA);
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;

      // --- 低体力: 彩度を落として赤みを残す ---
      if (uLowHealth > 0.001) {
        float l = dot(col, LUMA);
        vec3 desat = mix(col, vec3(l), 0.55);
        desat.r += 0.045;
        float pulse = 0.5 + 0.5 * sin(uTime * 4.2);
        col = mix(col, desat, uLowHealth * (0.65 + pulse * 0.35));
      }

      // --- ビネット ---
      float vig = 1.0 - uVignette * smoothstep(0.18, 0.86, r2 * 1.9);
      col *= vig;

      // --- スコープ周辺減光 ---
      if (uScopeVignette > 0.001) {
        float d = length(c * vec2(uResolution.x / uResolution.y, 1.0));
        float sv = 1.0 - smoothstep(0.24, 0.52, d) * uScopeVignette;
        col *= sv;
      }

      // --- 被弾フラッシュ ---
      if (uDamage > 0.001) {
        float edge = smoothstep(0.05, 0.55, r2 * 2.2);
        col = mix(col, vec3(0.62, 0.045, 0.03), uDamage * edge * 0.85);
      }

      // --- スタングレネード等の白飛び ---
      col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));

      // --- フィルムグレイン (輝度に応じて減衰) ---
      float g = hash(uv * uResolution + fract(uTime) * 431.7) - 0.5;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += g * uGrain * (1.0 - lum * 0.65);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

/**
 * 速度ベース径方向モーションブラー（低コスト近似）。
 * ADS 解除やスプリント時に画面周辺を放射状にぼかす。
 */
export const RadialBlurShader = {
  name: 'RadialBlurShader',
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: CompositeShader.vertexShader,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform vec2 uCenter;
    varying vec2 vUv;
    void main() {
      if (uStrength < 0.0005) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec2 dir = vUv - uCenter;
      float d = length(dir);
      vec3 sum = vec3(0.0);
      const int N = 8;
      for (int i = 0; i < N; i++) {
        float t = float(i) / float(N - 1) - 0.5;
        vec2 uv = vUv - dir * t * uStrength * smoothstep(0.05, 0.7, d);
        sum += texture2D(tDiffuse, uv).rgb;
      }
      gl_FragColor = vec4(sum / float(N), 1.0);
    }
  `,
};

/* ==================================================================
 *  内蔵 GPU 向けの統合最終パス
 *
 *  Intel UHD のような統合 GPU で効くのは「解像度を下げること」より
 *  「全画面パスの本数を減らすこと」である。
 *  1920×1080 なら 1 パスあたり 200 万画素の読み書きが発生し、
 *  帯域を CPU と共有する統合 GPU ではこれが支配的になる。
 *
 *  通常の経路は
 *      OutputPass（トーンマップ + sRGB）→ Composite → FXAA
 *  の 3 パスだが、ここでは 1 パスに畳んである。
 *  さらにブルームの加算も同じパスで行うので、実質 4 パスぶんが 1 本になる。
 *
 *  入力はトーンマップ前のリニア HDR。
 *  FXAA は本来 LDR に掛けるものなので、隣接タップ側でも
 *  トーンマップしてから輝度を取っている（ACES は十分安い）。
 * ================================================================== */
export const FusedFinalShader = {
  name: 'FusedFinalShader',
  uniforms: {
    tDiffuse:       { value: null },
    tBloom:         { value: null },
    uBloomStrength: { value: 0.0 },
    uExposure:      { value: 1.0 },
    uFxaa:          { value: 1.0 },
    uTime:          { value: 0 },
    uResolution:    { value: new THREE.Vector2(1, 1) },
    uAberration:    { value: 0.00010 },
    uVignette:      { value: 0.34 },
    uGrain:         { value: 0.016 },
    uSharpen:       { value: 0.15 },
    uSaturation:    { value: 1.12 },
    uContrast:      { value: 1.12 },
    uLift:          { value: new THREE.Vector3(0.000, 0.003, 0.012) },
    uGain:          { value: new THREE.Vector3(1.015, 1.0, 0.995) },
    uShadowTint:    { value: new THREE.Vector3(0.40, 0.44, 0.52) },
    uHighlightTint: { value: new THREE.Vector3(1.00, 0.86, 0.62) },
    uSplitStrength: { value: 0.05 },
    uSplitBalance:  { value: 0.34 },
    uVibrance:      { value: 0.14 },
    uDamage:        { value: 0.0 },
    uLowHealth:     { value: 0.0 },
    uFlash:         { value: 0.0 },
    uScopeVignette: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision mediump float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform float uBloomStrength, uExposure, uFxaa;
    uniform float uTime, uAberration, uVignette, uGrain, uSharpen;
    uniform float uSaturation, uContrast, uDamage, uLowHealth, uFlash, uScopeVignette;
    uniform float uSplitStrength, uSplitBalance, uVibrance;
    uniform vec2  uResolution;
    uniform vec3  uLift, uGain, uShadowTint, uHighlightTint;
    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    /*
     * ACES フィルミック。
     *
     * three の ACESFilmicToneMapping と同じ式にしてある。
     * よく使われる Narkowicz の近似（x *= 0.6 してから有理式）に
     * 置き換えると、three 側は逆に /0.6 しているため画面全体が
     * 目に見えて暗くなる。通常経路と並べたときに差が出ないよう、
     * マトリクスと RRTAndODTFit をそのまま持ってきている。
     */
    const mat3 ACES_IN = mat3(
      0.59719, 0.07600, 0.02840,
      0.35458, 0.90834, 0.13383,
      0.04823, 0.01566, 0.83777
    );
    const mat3 ACES_OUT = mat3(
       1.60475, -0.10208, -0.00327,
      -0.53108,  1.10813, -0.07276,
      -0.07367, -0.00605,  1.07602
    );
    vec3 rrtAndOdtFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 color) {
      color /= 0.6;
      color = ACES_IN * color;
      color = rrtAndOdtFit(color);
      color = ACES_OUT * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }

    /*
     * HDR を 1 点読む。
     *
     * ここでトーンマップまで済ませてしまうと、FXAA・シャープ・色収差の
     * タップごとに ACES のマトリクス 2 回と pow が走る。実測では
     * このパスだけで全体の 4 割を占めていた。
     * 処理はすべて HDR のまま行い、トーンマップは最後の 1 回だけにする。
     */
    vec3 hdrAt(vec2 uv) {
      return texture2D(tDiffuse, uv).rgb * uExposure;
    }
    /** エッジ検出用の圧縮輝度（0..1 に収めれば順序さえ合えばよい） */
    float lum(vec3 c) {
      float l = dot(c, LUMA);
      return l / (l + 1.0);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c  = uv - 0.5;
      float r2 = dot(c, c);
      vec2 px = 1.0 / uResolution;

      vec3 m  = hdrAt(uv);
      vec3 nw = hdrAt(uv + vec2(-px.x, -px.y));
      vec3 ne = hdrAt(uv + vec2( px.x, -px.y));
      vec3 sw = hdrAt(uv + vec2(-px.x,  px.y));
      vec3 se = hdrAt(uv + vec2( px.x,  px.y));

      /*
       * FXAA（コンソール版・4 タップ）。
       * フル版は 12 タップ以上あり統合 GPU では割に合わない。
       * 斜めのジャギーを均すだけならこれで十分効く。
       */
      vec3 col = m;
      if (uFxaa > 0.5) {
        float lnw = lum(nw), lne = lum(ne), lsw = lum(sw), lse = lum(se), lm = lum(m);
        float lMin = min(lm, min(min(lnw, lne), min(lsw, lse)));
        float lMax = max(lm, max(max(lnw, lne), max(lsw, lse)));

        vec2 dir = vec2(
          -((lnw + lne) - (lsw + lse)),
           ((lnw + lsw) - (lne + lse))
        );
        float reduce = max((lnw + lne + lsw + lse) * 0.03125, 0.0078125);
        dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * px;

        vec3 a = 0.5 * (hdrAt(uv + dir * (1.0 / 3.0 - 0.5)) + hdrAt(uv + dir * (2.0 / 3.0 - 0.5)));
        vec3 b = a * 0.5 + 0.25 * (hdrAt(uv + dir * -0.5) + hdrAt(uv + dir * 0.5));
        float lb = lum(b);
        col = (lb < lMin || lb > lMax) ? a : b;
      }

      // --- アンシャープマスク（4 隅のタップを使い回す） ---
      if (uSharpen > 0.001) {
        col += (col - (nw + ne + sw + se) * 0.25) * uSharpen;
      }

      // --- 色収差: 画面端ほど RGB をずらす ---
      if (uAberration > 0.000001) {
        float ab = uAberration * (1.0 + uScopeVignette * 2.0);
        vec2 off = c * r2 * ab * 12.0;
        col.r = hdrAt(uv + off).r;
        col.b = hdrAt(uv - off).b;
      }

      // --- ブルーム加算 → トーンマップ → sRGB（ここで 1 回だけ） ---
      if (uBloomStrength > 0.0001) {
        col += texture2D(tBloom, uv).rgb * uBloomStrength;
      }
      col = toSRGB(aces(col));

      // --- カラーグレーディング ---
      col = max(col, 0.0);
      col = col * uGain + uLift;
      {
        float l = dot(col, LUMA);
        float hi = smoothstep(uSplitBalance, 1.0, l);
        float lo = 1.0 - smoothstep(0.0, uSplitBalance, l);
        vec3 sh = (uShadowTint * 2.0 - 1.0) * lo;
        vec3 hl = (uHighlightTint * 2.0 - 1.0) * hi;
        col += (sh + hl) * uSplitStrength * 0.5;
        col = max(col, 0.0);
      }
      {
        float l = dot(col, LUMA);
        float mx = max(col.r, max(col.g, col.b));
        float mn = min(col.r, min(col.g, col.b));
        col = mix(vec3(l), col, 1.0 + uVibrance * (1.0 - smoothstep(0.0, 0.55, mx - mn)));
      }
      float luma = dot(col, LUMA);
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;

      if (uLowHealth > 0.001) {
        float l = dot(col, LUMA);
        vec3 desat = mix(col, vec3(l), 0.55);
        desat.r += 0.045;
        float pulse = 0.5 + 0.5 * sin(uTime * 4.2);
        col = mix(col, desat, uLowHealth * (0.65 + pulse * 0.35));
      }

      col *= 1.0 - uVignette * smoothstep(0.18, 0.86, r2 * 1.9);

      if (uScopeVignette > 0.001) {
        float d = length(c * vec2(uResolution.x / uResolution.y, 1.0));
        col *= 1.0 - smoothstep(0.24, 0.52, d) * uScopeVignette;
      }
      if (uDamage > 0.001) {
        col = mix(col, vec3(0.62, 0.045, 0.03), uDamage * smoothstep(0.05, 0.55, r2 * 2.2) * 0.85);
      }
      col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));

      float g = hash(uv * uResolution + fract(uTime) * 431.7) - 0.5;
      col += g * uGrain * (1.0 - dot(col, LUMA) * 0.65);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

/**
 * 軽量ブルーム（しきい値抽出）。
 * UnrealBloomPass は 5 段のミップを往復するため 11 パスになる。
 * 統合 GPU ではそれだけでフレーム予算を使い切るので、
 * 1/4 解像度で 1 回抽出 → 十字 2 回ぼかし、の 3 パスで代替する。
 */
export const BloomThresholdShader = {
  name: 'BloomThresholdShader',
  uniforms: {
    tDiffuse:   { value: null },
    uThreshold: { value: 2.2 },
    uKnee:      { value: 0.6 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    precision mediump float;
    uniform sampler2D tDiffuse;
    uniform float uThreshold, uKnee;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = max(c.r, max(c.g, c.b));
      // しきい値の立ち上がりを滑らかにする（硬いと輪郭がちらつく）
      float t = clamp((l - uThreshold) / max(uKnee, 0.0001), 0.0, 1.0);
      gl_FragColor = vec4(c * t * t, 1.0);
    }
  `,
};

/** 1 方向のガウスぼかし（9 タップ・線形補間で 5 回の読み取りに畳む） */
export const BlurDirShader = {
  name: 'BlurDirShader',
  uniforms: {
    tDiffuse: { value: null },
    uTexel:   { value: new THREE.Vector2(1, 0) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    precision mediump float;
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      // 線形補間を利用して 9 タップぶんを 5 回の読み取りで済ませる
      vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
      vec2 o1 = uTexel * 1.3846153846;
      vec2 o2 = uTexel * 3.2307692308;
      c += texture2D(tDiffuse, vUv + o1).rgb * 0.3162162162;
      c += texture2D(tDiffuse, vUv - o1).rgb * 0.3162162162;
      c += texture2D(tDiffuse, vUv + o2).rgb * 0.0702702703;
      c += texture2D(tDiffuse, vUv - o2).rgb * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
