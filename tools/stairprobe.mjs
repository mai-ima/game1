/**
 * 階段を実際に登れるか確かめる。
 *
 * 「階段の形をしているが登れない」は目で見ても判りにくい。
 * 段の高さが許容を超えている、上り切った先に床が無い、
 * 頭上に床があってつかえる——どれも見た目は普通の階段に見える。
 *
 * ここではプレイヤーを階段の下に立たせ、指定の向きへ歩かせて、
 * 高さがどこまで上がったかを測る。
 *
 *   node tools/stairprobe.mjs [url] "名前|x,y,z|向き(度)|秒"
 *
 * 向きはワールドの yaw（0 で -Z、90 で +X）。
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low&map=testbed';
const runs = process.argv.slice(3).map((s) => {
  const [name, pos, yaw, sec] = s.split('|');
  return { name, pos: pos.split(',').map(Number), yaw: +yaw, sec: +(sec || 8) };
});

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.waitForTimeout(1500);

for (const r of runs) {
  /*
   * 描画を待たずに game.update を直接回す。
   * ソフトウェア描画では実時間 8 秒でゲーム内 0.5 秒も進まない。
   */
  const out = await page.evaluate(`(async () => {
    const d = window.__DEV, g = d.game, p = g.player;
    p.position.set(${r.pos.join(',')});
    p.velocity.set(0, 0, 0);
    p.yaw = ${(r.yaw * Math.PI / 180).toFixed(6)};
    p.pitch = 0;
    /*
     * 入力の入れ方。
     *
     * input.move を組み立てるのは input.update() だが、
     * それを呼んでいるのは main.js のフレームループで、
     * game.update() の中ではない。ここでは rAF を回さず
     * game.update() だけを直接叩くので、_dirs を立てても
     * move は 0 のままだった（実際その状態で「一歩も動かない」
     * という計測結果が出た）。
     * move を毎フレーム自分で書き込む。
     */
    d.input._dirs.forward = false;

    const DT = 1 / 60, N = Math.round(${r.sec} / DT);
    const track = [];
    let maxY = -1e9, minY = 1e9, stuck = 0, lastX = p.position.x, lastZ = p.position.z;
    for (let i = 0; i < N; i++) {
      d.input.move.x = 0; d.input.move.y = 1;
      g.update(DT);
      maxY = Math.max(maxY, p.position.y);
      minY = Math.min(minY, p.position.y);
      const moved = Math.hypot(p.position.x - lastX, p.position.z - lastZ);
      if (moved < 0.004) stuck++;
      lastX = p.position.x; lastZ = p.position.z;
      if (i % 30 === 0) track.push([+(i * DT).toFixed(1), +p.position.y.toFixed(2)]);
      if (i % 600 === 0) await new Promise((res) => setTimeout(res, 0));
    }
    d.input.move.x = d.input.move.y = 0;
    return JSON.stringify({
      開始: [${r.pos.join(',')}],
      終了: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)],
      到達高さ: +maxY.toFixed(2),
      最低高さ: +minY.toFixed(2),
      上昇: +(maxY - ${r.pos[1]}).toFixed(2),
      '止まっていたフレーム': stuck,
      推移: track,
    });
  })()`);
  const j = JSON.parse(out);
  console.log(`\n== ${r.name} ==`);
  console.log(`  開始 ${j.開始.join(', ')} → 終了 ${j.終了.join(', ')}`);
  console.log(`  上昇 ${j.上昇}m（到達 ${j.到達高さ} / 最低 ${j.最低高さ}）  停止フレーム ${j['止まっていたフレーム']}`);
  console.log('  高さの推移:', j.推移.map(([t, y]) => `${t}s:${y}`).join('  '));
}

if (errors.length) console.log('\nエラー:', [...new Set(errors)].slice(0, 5).join('\n'));
await browser.close();
