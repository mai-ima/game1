/**
 * 空の放射輝度を方位・仰角ごとに測る。
 *
 * 霞の色は「そこにある空の色」と一致していなければならない。
 * 一致しているかは、同じ向きの空を実測して、
 * 画面に出る 8bit まで通してから比べるしかない。
 *
 *   node tools/skyscan.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { aces } from './tonecheck.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=compound';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.waitForTimeout(1200);

const out = JSON.parse(await page.evaluate(`(() => {
  const d = window.__DEV, e = d.engine, THREE = d.THREE;
  const dirs = [], labels = [];
  for (const el of [0.02, 0.20, 0.50, 0.90]) {
    for (let a = 0; a < 360; a += 45) {
      const r = THREE.MathUtils.degToRad(a);
      const c = Math.sqrt(Math.max(0, 1 - el * el));
      dirs.push(new THREE.Vector3(Math.sin(r) * c, el, Math.cos(r) * c).normalize());
      labels.push('仰角' + Math.round(THREE.MathUtils.radToDeg(Math.asin(el))) + '/方位' + a);
      if (el > 0.85) break;
    }
  }
  const s = e.sampleSkyRadiance(dirs) || [];
  return JSON.stringify({
    太陽: [+e.sunPosition.x.toFixed(3), +e.sunPosition.y.toFixed(3), +e.sunPosition.z.toFixed(3)],
    太陽方位: Math.round(THREE.MathUtils.radToDeg(Math.atan2(e.sunPosition.x, e.sunPosition.z))),
    露出: e.renderer.toneMappingExposure,
    値: s.map((c, i) => [labels[i], +c.r.toFixed(4), +c.g.toFixed(4), +c.b.toFixed(4)]),
  });
})()`));

const srgb = (x) => Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255);
console.log('太陽:', out.太陽.join(', '), '方位', out.太陽方位, '度   露出', out.露出);
console.log('向き'.padEnd(18), '線形'.padEnd(26), '画面 8bit');
for (const [l, r, g, b] of out.値) {
  const t = aces([r, g, b], out.露出).map(srgb);
  console.log(l.padEnd(20), `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`.padEnd(24), t.join(', '));
}
await browser.close();
