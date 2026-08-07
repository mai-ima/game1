import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p=>existsSync(p));
const browser = await chromium.launch({ executablePath: execPath,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page = await browser.newPage({ viewport:{width:900,height:520} });
page.on('pageerror', e=>{ if(!/Pointer Lock/.test(e.message)) console.log('[err]', e.message); });
await page.goto('http://localhost:4173/', {waitUntil:'domcontentloaded'});
await page.waitForFunction('!!window.__DEV', {timeout:300000});
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true',{timeout:300000}).catch(()=>{});
await page.waitForTimeout(9000);

await page.evaluate(`window.__F={n:0}; (function(){const e=window.__DEV.engine; const o=e.render.bind(e); e.render=(dt)=>{window.__F.n++; o(dt);};})();`);

const measure = async (label, setup) => {
  if (setup) await page.evaluate(setup);
  await page.evaluate('window.__F.n=0; window.__F.t=performance.now();');
  await page.waitForTimeout(7000);
  const r = await page.evaluate(`(()=>{const f=window.__F,e=window.__DEV.engine;
    const el=(performance.now()-f.t)/1000;
    let lights=0; e.scene.traverse(o=>{if(o.isLight)lights++;});
    return JSON.stringify({fps:+(f.n/el).toFixed(2), draws:e.drawCalls, tris:Math.round(e.triangles/1000), lights});})()`);
  console.log(label.padEnd(26), r);
};

await measure('A: 現状', null);
await measure('B: 点光源オフ', `window.__DEV.engine.scene.traverse(o=>{if(o.isPointLight){o.userData._i=o.intensity;o.intensity=0;o.visible=false;}});`);
await measure('C: +GTAOオフ', `window.__DEV.engine.gtaoPass.enabled=false;`);
await measure('D: +影オフ', `window.__DEV.engine.renderer.shadowMap.enabled=false;`);
await measure('E: +ボット非表示', `window.__DEV.game.bots.forEach(b=>b.char.model.visible=false);`);
await measure('F: +ポスト全オフ', `const e=window.__DEV.engine;e.bloomPass.enabled=false;e.compositePass.enabled=false;e.smaaPass.enabled=false;e.blurPass.enabled=false;`);
await browser.close();
