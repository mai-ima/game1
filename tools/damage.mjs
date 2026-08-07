/**
 * 被弾・撃破の経路が最後まで通るかを直接確認する。
 * ソフトウェア描画では実プレイで撃破まで到達するのに時間がかかるため、
 * 射撃解決を直接呼んで検証する。
 *
 *   node tools/damage.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });

const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(3000);

const r = await page.evaluate(`(() => {
  const { game, THREE } = window.__DEV;
  const out = {};

  // --- 1. プレイヤーの弾がボットに当たる経路 ---
  const enemy = game.bots.find((b) => b.alive && b.team !== game.playerStats.team);
  out['敵を検出'] = !!enemy;
  if (!enemy) return JSON.stringify(out);

  const eye = enemy.char.getEyePosition(new THREE.Vector3());
  const origin = eye.clone().add(new THREE.Vector3(0, 0, 6));
  const dir = eye.clone().sub(origin).normalize();

  const hit = game.weapons.characterRaycast(origin, dir, 50);
  out['レイキャスト命中'] = !!hit;
  out['target がボット'] = !!(hit && typeof hit.target?.damage === 'function');

  if (hit) {
    const before = hit.target.hp;
    game.weapons.onHit({
      type: 'char', target: hit.target, point: hit.point, normal: hit.normal,
      zone: hit.zone, damage: 40, surface: 'fabric',
    });
    out['体力が減った'] = hit.target.hp < before;
    out['体力'] = \`\${before} → \${hit.target.hp}\`;

    // 撃破まで撃ち込む
    let guard = 0;
    while (hit.target.alive && guard++ < 20) {
      game.weapons.onHit({
        type: 'char', target: hit.target, point: hit.point, normal: hit.normal,
        zone: hit.zone, damage: 40, surface: 'fabric',
      });
    }
    out['撃破できた'] = !hit.target.alive;
    out['自分のキル数'] = game.playerStats.kills;
  }

  // --- 2. ボット同士の射撃解決（resolveShot） ---
  const a = game.bots.find((b) => b.alive && b.team === 'A');
  const t = game.bots.find((b) => b.alive && b.team === 'B');
  out['ボット同士を検出'] = !!(a && t);
  if (a && t) {
    const te = t.char.getEyePosition(new THREE.Vector3());
    const o2 = te.clone().add(new THREE.Vector3(0, 0, 5));
    const d2 = te.clone().sub(o2).normalize();
    const hpBefore = t.hp;
    game.resolveShot({ shooter: a, origin: o2, dir: d2, weapon: a.weapon, muzzle: o2 });
    out['resolveShot で体力減'] = t.hp < hpBefore;
    out['ボット体力'] = \`\${hpBefore} → \${t.hp}\`;
  }
  return JSON.stringify(out, null, 2);
})()`);

console.log(r);
await page.waitForTimeout(3000);
console.log(errors.length ? '\nエラー:\n' + [...new Set(errors)].slice(0, 6).join('\n') : '\nJS エラーなし');
await browser.close();
process.exit(errors.length ? 1 : 0);
