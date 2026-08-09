import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p=>existsSync(p));
const browser = await chromium.launch({ executablePath: execPath,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page = await browser.newPage({ viewport:{width:900,height:520} });
page.on('pageerror', e=>console.log('[err]', e.message));
const url = process.argv[2] || 'http://127.0.0.1:4173/';
await page.goto(url, {waitUntil:'domcontentloaded'});
await page.waitForFunction('!!window.__DEV', null, {timeout:300000});

// 計測フックを仕込む
await page.evaluate(`
  window.__PERF = { frames:0, t0:performance.now(), marks:{} };
  const g = window.__DEV.game;
  const origUpdate = g.update.bind(g);
  window.__PERF.gameMs = 0; window.__PERF.n = 0;
  g.update = (dt) => { const a=performance.now(); origUpdate(dt); window.__PERF.gameMs += performance.now()-a; window.__PERF.n++; };
  const phys = g.physics;
  let rc = 0; const origRay = phys.raycast.bind(phys);
  phys.__rayMs = 0;
  phys.raycast = (o,d,m,opt) => { rc++; const a=performance.now(); const r=origRay(o,d,m,opt); phys.__rayMs += performance.now()-a; return r; };
  window.__PERF.rayCount = () => rc;
`);

const sample = async (label) => {
  await page.evaluate(`(()=>{const p=window.__PERF;p.gameMs=0;p.n=0;window.__DEV.game.physics.__rayMs=0;p._rc0=p.rayCount();p._t0=performance.now();})()`);
  await page.waitForTimeout(6000);
  const r = await page.evaluate(`(()=>{const p=window.__PERF,g=window.__DEV.game;
    const el=(performance.now()-p._t0)/1000;
    return JSON.stringify({
      label:'x', fps:+(p.n/el).toFixed(1),
      gameMsPerFrame:+(p.gameMs/Math.max(1,p.n)).toFixed(2),
      rayMsPerFrame:+(g.physics.__rayMs/Math.max(1,p.n)).toFixed(2),
      raysPerFrame:Math.round((p.rayCount()-p._rc0)/Math.max(1,p.n)),
      draws:window.__DEV.engine.drawCalls, tris:Math.round(window.__DEV.engine.triangles/1000),
      bots:g.bots.length, alive:g.bots.filter(b=>b.alive).length,
    });})()`);
  console.log(label, r);
};

await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, {timeout:300000}).catch(()=>{});
await page.waitForTimeout(9000);
await sample('開始直後  ');
await page.waitForTimeout(15000);
await sample('15秒後    ');
await page.evaluate('window.__DEV.input.setAction("fire",true)');
await sample('射撃中    ');
await page.evaluate('window.__DEV.input.setAction("fire",false)');
await page.waitForTimeout(20000);
await sample('45秒後    ');
await browser.close();
