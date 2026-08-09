/**
 * 移動まわりを 1 項目ずつ確かめる。
 *
 * 遊んでみて「走っても速くならない」「跳んでも上がらない」と
 * 感じたときに、どの条件で弾かれているのかを数字で出す。
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=low';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: execPath,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 240 } });
page.on('pageerror', e => { if(!/Pointer Lock/.test(e.message)) console.log('ERR', e.message); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(()=>{});
await page.waitForTimeout(2500);

const probe = async (label, setup, ms = 3000) => {
  await page.evaluate(`(() => { const W = { maxSpeed:0, maxY:-9, minY:9, n:0, sprint:0, tac:0, ground:0, mvy:0, stam:9 };
    window.__P = W;
    const g = window.__DEV.game, p = g.player;
    const o = g.update.bind(g);
    if (!window.__HOOKED) { window.__HOOKED = true;
      window.__ORIG = o;
      g.update = (dt) => { window.__ORIG(dt); const W2 = window.__P; if (!W2) return;
        W2.n++;
        W2.maxSpeed = Math.max(W2.maxSpeed, Math.hypot(p.velocity.x, p.velocity.z));
        W2.maxY = Math.max(W2.maxY, p.position.y); W2.minY = Math.min(W2.minY, p.position.y);
        if (p.sprinting) W2.sprint++;
        if (p.tacSprinting) W2.tac++;
        if (p.grounded) W2.ground++;
        W2.mvy = Math.max(W2.mvy, window.__DEV.input.move ? window.__DEV.input.move.y : (window.__DEV.input.axis?.y ?? 0));
        W2.stam = Math.min(W2.stam, p.stamina ?? -1);
      };
    }
  })()`);
  await setup();
  await page.waitForTimeout(ms);
  const r = await page.evaluate('JSON.stringify(window.__P)');
  const d = JSON.parse(r);
  console.log(`${label}: 最高速度 ${d.maxSpeed.toFixed(2)} / y ${d.minY.toFixed(2)}〜${d.maxY.toFixed(2)} / `
    + `走り ${d.sprint}/${d.n} / 戦術走り ${d.tac} / 接地 ${d.ground} / mv.y ${(+d.mvy).toFixed(2)} / スタミナ最小 ${(+d.stam).toFixed(2)}`);
  return d;
};

await probe('歩き', async () => { await page.keyboard.down('KeyW'); }, 3000);
await page.keyboard.up('KeyW');
await page.waitForTimeout(600);
await probe('走り', async () => { await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); }, 4000);
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
await page.waitForTimeout(600);
await probe('跳躍(押しっぱなし)', async () => { await page.keyboard.down('Space'); }, 2500);
await page.keyboard.up('Space');
await page.waitForTimeout(500);
await probe('跳躍(一瞬押す)', async () => { await page.keyboard.press('Space'); }, 2000);
await page.waitForTimeout(400);
await probe('しゃがみ', async () => { await page.keyboard.down('ControlLeft'); await page.keyboard.down('KeyW'); }, 2500);
await page.keyboard.up('KeyW'); await page.keyboard.up('ControlLeft');

// 入力が届いているかを直接確認
const inp = await page.evaluate(`(() => { const i = window.__DEV.input;
  return JSON.stringify({ move: i.move ?? null, axis: i.axis ?? null,
    down: { jump: i.down('jump'), sprint: i.down('sprint'), crouch: i.down('crouch') } }); })()`);
console.log('入力の状態:', inp);
await browser.close();
