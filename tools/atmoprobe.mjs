/**
 * 大気の実測値を読む。
 *
 * 霞の色は空を描いて読み取っているので、
 * 「実際にどんな値が入ったか」を見ないと、絵が変わった理由が
 * 霞なのか光なのか切り分けられない。
 *
 *   node tools/atmoprobe.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=compound';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.waitForTimeout(1500);

const out = await page.evaluate(`(async () => {
  const d = window.__DEV, e = d.engine, THREE = d.THREE;
  const A = await import('/assets/main.js').catch(() => null);
  const u = e._atmoUniforms || null;
  // ユニフォームは Atmosphere モジュール側にあるので、マテリアル経由で覗く
  let uni = null;
  e.scene.traverse((o) => {
    if (uni || !o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && m.fog && m.userData && m.userData.orm) {
      // three が保持しているプログラム側ユニフォーム
      const props = e.renderer.properties.get(m);
      if (props && props.uniforms && props.uniforms.atmoHaze) uni = props.uniforms;
    }
  });
  const c = (x) => x ? [ +x.r.toFixed(4), +x.g.toFixed(4), +x.b.toFixed(4) ] : null;
  const raw = e.sampleSkyRadiance([
    new THREE.Vector3(0, 0.05, -1).normalize(),
    new THREE.Vector3(0, 0.05, 1).normalize(),
    new THREE.Vector3(0, 1, 0),
  ]);
  return JSON.stringify({
    太陽の向き: [+e.sunPosition.x.toFixed(3), +e.sunPosition.y.toFixed(3), +e.sunPosition.z.toFixed(3)],
    '空の実測（-Z地平/+Z地平/天頂）': raw ? raw.map(c) : '読めなかった',
    霞: uni ? c(uni.atmoHaze.value) : 'ユニフォーム未検出',
    空: uni ? c(uni.atmoSky.value) : null,
    太陽側: uni ? c(uni.atmoSun.value) : null,
    係数: uni ? uni.atmoParams.value.toArray().map((v) => +v.toFixed(5)) : null,
    露出: e.renderer.toneMappingExposure,
  }, null, 1);
})()`);

console.log(out);
if (errors.length) console.log('\\nエラー:', [...new Set(errors)].slice(0, 6).join('\\n'));
await browser.close();
