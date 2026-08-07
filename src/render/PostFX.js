import * as THREE from 'three';

/**
 * 最終合成パス用シェーダ。
 * トーンマップ後の LDR 画像に対して以下を一括適用する:
 *  - 色収差 (radial chromatic aberration)
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
    uAberration:    { value: 0.00052 },
    uVignette:      { value: 0.34 },
    uGrain:         { value: 0.016 },
    uSharpen:       { value: 0.20 },
    uSaturation:    { value: 1.24 },
    uContrast:      { value: 1.10 },
    uLift:          { value: new THREE.Vector3(0.000, 0.003, 0.012) },
    uGain:          { value: new THREE.Vector3(1.015, 1.0, 0.995) },
    // スプリットトーン: 影に寒色・ハイライトに暖色を乗せて色の分離を作る
    uShadowTint:    { value: new THREE.Vector3(0.26, 0.36, 0.58) },
    uHighlightTint: { value: new THREE.Vector3(1.00, 0.80, 0.46) },
    uSplitStrength: { value: 0.11 },
    uSplitBalance:  { value: 0.30 },
    // 彩度の伸ばし方（低彩度部をより強く持ち上げる vibrance）
    uVibrance:      { value: 0.26 },
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
