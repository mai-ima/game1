/**
 * 看板が「見る側」を向いているかを機械的に確かめる。
 *
 * 向きの取り違えは、コードを読んでも図を描いても気付きにくい。
 * yaw の符号ひとつで裏返るのに、裏返っても形は同じだからだ。
 * 目で見て気付けるのは、たまたまその角度から撮ったときだけになる。
 *
 * ここでは実際に歩く経路をカメラでたどり、
 * 視界に入った文字板それぞれについて
 *   板の法線 ・ 板からカメラへの向き
 * の内積を取る。正なら表、負なら裏。
 * 一度も表で見られない板は「どこからも読めない板」なので、
 * 置き方か向きが間違っている。
 *
 *   node tools/facing.mjs [url]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=high&map=testbed';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('ERR', e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});

const out = await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE;
  const cam = d.engine.camera;
  d.game.paused = true;

  /* 文字板を集める */
  const signs = [];
  d.engine.scene.traverse((o) => {
    if (o.isMesh && o.userData.signKind) signs.push(o);
  });

  /*
   * 歩く経路。
   * 十字の通路と、各区画の入口から奥へ。
   * 実際に人が通る所だけを辿る（区画の裏側は見に行かない）。
   */
  const route = [];
  const add = (x, z, look) => route.push({ x, z, look });
  // 東西通路を西から東へ
  for (let x = -86; x <= 86; x += 4) add(x, 0, 'x+');
  // 東西通路を東から西へ（反対を向いたときに読める板もある）
  for (let x = 86; x >= -86; x -= 4) add(x, 0, 'x-');
  // 南北通路
  for (let z = -74; z <= 78; z += 4) add(0, z, 'z+');
  for (let z = 78; z >= -74; z -= 4) add(0, z, 'z-');
  // 各区画の中を一巡り
  const areas = [
    [0, -46, 26, 12], [-58, -34, 22, 18], [58, -34, 22, 16],
    [-20, -17, 10, 12], [-52, 26, 30, 16], [34, 24, 24, 14],
    [-50, 64, 20, 14], [-12, 64, 44, 10],
  ];
  for (const [ax, az, hw, hd] of areas) {
    for (let x = ax - hw; x <= ax + hw; x += 5) {
      for (let z = az - hd; z <= az + hd; z += 5) {
        add(x, z, 'all');
      }
    }
  }

  const seen = new Map();       // mesh -> {front, back}
  for (const s of signs) seen.set(s, { front: 0, back: 0 });

  const camPos = new THREE.Vector3();
  const n = new THREE.Vector3();
  const to = new THREE.Vector3();
  const q = new THREE.Quaternion();

  for (const p of route) {
    camPos.set(p.x, 1.68, p.z);
    for (const s of signs) {
      if (s.userData.signKind === 'floor') continue;    // 床置きは上向き
      s.getWorldQuaternion(q);
      n.set(0, 0, 1).applyQuaternion(q);
      to.copy(s.position).sub(camPos);
      const dist = to.length();
      if (dist > 26 || dist < 0.6) continue;            // 遠すぎ・近すぎは判定しない
      to.divideScalar(dist);
      // 板の法線とカメラへの向き。正なら板の表がこちらを向いている
      const facing = -n.dot(to);
      const rec = seen.get(s);
      if (facing > 0.35) rec.front++;
      else if (facing < -0.35) rec.back++;
    }
  }

  const never = [];
  const mostlyBack = [];
  for (const [s, rec] of seen) {
    if (s.userData.signKind === 'floor') continue;
    const t = s.userData.signText || '(無題)';
    const pos = [+s.position.x.toFixed(1), +s.position.y.toFixed(1), +s.position.z.toFixed(1)];
    if (rec.front === 0 && rec.back > 0) never.push({ 文字: t, 位置: pos, 裏で見た回数: rec.back });
    else if (rec.front === 0 && rec.back === 0) never.push({ 文字: t, 位置: pos, 備考: '経路から一度も視界に入らない' });
    else if (rec.back > rec.front * 2.5) mostlyBack.push({ 文字: t, 位置: pos, 表: rec.front, 裏: rec.back });
  }

  return JSON.stringify({
    文字板の総数: signs.length,
    立て板: signs.filter((s) => s.userData.signKind !== 'floor').length,
    床置き: signs.filter((s) => s.userData.signKind === 'floor').length,
    経路の点数: route.length,
    表で読めない板: never,
    裏で見ることが多い板: mostlyBack,
  }, null, 1);
})()`);

const d = JSON.parse(out);
console.log(`文字板 ${d.文字板の総数} 枚（立て板 ${d.立て板} / 床置き ${d.床置き}）を、経路 ${d.経路の点数} 点から検査\n`);

if (!d.表で読めない板.length) {
  console.log('○ すべての立て板が、経路のどこかから表で読める');
} else {
  console.log(`× 表で読めない板が ${d.表で読めない板.length} 枚:`);
  for (const r of d.表で読めない板.slice(0, 25)) console.log('   ', JSON.stringify(r, null, 0));
}
if (d.裏で見ることが多い板.length) {
  console.log(`\n△ 裏から見る機会のほうが多い板 ${d.裏で見ることが多い板.length} 枚:`);
  for (const r of d.裏で見ることが多い板.slice(0, 15)) console.log('   ', JSON.stringify(r, null, 0));
}

await browser.close();
