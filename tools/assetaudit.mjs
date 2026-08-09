/**
 * アセットを 1 点ずつ組んで撮り、一覧表（コンタクトシート）にする。
 *
 * 実際のマップに置いてしまうと、隣の物や建物の陰に紛れて
 * 「そのアセット単体がどれだけ作り込まれているか」が判らない。
 * ここではテストベッドの試作場に 1 点だけ組み、
 * 大きさに合わせて寄って撮る。あわせて
 *   メッシュ数 / 三角形数 / 使っているマテリアル
 * を数え、手抜きの箇所を数字でも掴めるようにする。
 *
 *   node tools/assetaudit.mjs [出力先] [url]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const outDir = process.argv[2] || 'shots/assets';
const url = process.argv[3] || 'http://127.0.0.1:4173/?rawgpu&quality=ultra&map=testbed';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

/* 撮影台の位置（試作場のいちばん空いている所） */
const STAGE = { x: -50, z: 64 };

/**
 * 撮るアセットの一覧。
 *   [表示名, 種別(p=小物 / b=建物), 関数名, 引数]
 * 引数の x/y/z は撮影台の座標で上書きする。
 */
const ASSETS = [
  /* --- 資材・現場 --- */
  ['木箱', 'p', 'woodCrate', {}],
  ['弾薬箱', 'p', 'ammoCrate', {}],
  ['ドラム缶', 'p', 'barrel', {}],
  ['土嚢の積み', 'p', 'sandbagStack', { rows: 3, perRow: 4, length: 1.5 }],
  ['パレット', 'p', 'pallet', {}],
  ['タイヤ積み', 'p', 'tireStack', { count: 3 }],
  ['段ボール積み', 'p', 'cardboardStack', { count: 3 }],
  ['携行缶', 'p', 'jerryCan', {}],
  ['鉄筋束', 'p', 'rebarBundle', { count: 10, length: 2.4 }],
  ['型枠合板', 'p', 'formworkStack', { count: 7 }],
  ['ブロックパレット', 'p', 'blockPallet', { rows: 3 }],
  ['骨材の山', 'p', 'aggregatePile', { radius: 1.1, height: 0.8, mat: 'gravel' }],
  ['瓦礫', 'p', 'rubble', { radius: 1.2, count: 12 }],
  ['単管バリケード', 'p', 'siteBarrier', { x1: -3, z1: 0, x2: 3, z2: 0 }],
  ['足場', 'p', 'scaffold', { length: 8, levels: 3, levelH: 2.2, depth: 1.3 }],
  ['現場事務所', 'p', 'siteOffice', {}],
  ['コンテナ', 'p', 'container', {}],
  ['ゴミ', 'p', 'litter', { radius: 2.0, count: 14 }],

  /* --- 街の設備 --- */
  ['街灯', 'p', 'streetLight', {}],
  ['電柱', 'p', 'utilityPole', {}],
  ['貯水タンク', 'p', 'waterTank', { y: 0.55 }],
  ['室外機', 'p', 'acUnit', {}],
  ['屋上機器', 'p', 'rooftopClutter', {}],
  ['看板', 'p', 'sign', { y: 2.2, w: 2.0, h: 0.7, mat: 'plasticGlossRed' }],
  ['金網フェンス', 'p', 'chainFence', { x1: -3, z1: 0, x2: 3, z2: 0, h: 2.1 }],
  ['手すり', 'p', 'railing', { x1: -3, z1: 0, x2: 3, z2: 0, height: 1.1 }],
  ['配管', 'p', 'pipeRun', { x1: -3, z1: 0, x2: 3, z2: 0, y: 2.4 }],
  ['露店', 'p', 'marketStall', {}],
  ['物干し', 'p', 'clothesline', { x1: -3, z1: 0, x2: 3, z2: 0, y: 3.0 }],
  ['ごみ箱', 'p', 'trashBin', {}],
  ['車両（トラック）', 'p', 'vehicle', { type: 'truck' }],
  ['車両（乗用車）', 'p', 'vehicle', { type: 'car' }],

  /* --- 家具・屋内 --- */
  ['机', 'p', 'desk', {}],
  ['事務椅子', 'p', 'officeChair', {}],
  ['棚', 'p', 'shelfUnit', {}],
  ['ロッカー', 'p', 'lockerBank', {}],
  ['ソファ', 'p', 'sofa', {}],
  ['食卓', 'p', 'diningTable', {}],
  ['木の椅子', 'p', 'woodChair', {}],
  ['ベッド', 'p', 'bed', {}],
  ['洋服だんす', 'p', 'wardrobe', {}],
  ['冷蔵庫', 'p', 'fridge', {}],
  ['流し台', 'p', 'kitchenUnit', {}],
  ['テレビ', 'p', 'tvSet', {}],
  ['本棚', 'p', 'bookshelf', {}],
  ['ベンチ', 'p', 'bench', { w: 2.0 }],
  ['カウンター', 'p', 'counter', {}],
  ['鉢植え', 'p', 'potPlant', { height: 1.2 }],

  /* --- 建物 --- */
  ['窓', 'b', 'windowUnit', { y: 1.2, w: 1.2, h: 1.4 }],
  ['扉', 'b', 'door', {}],
  ['パラペット', 'b', 'parapet', { x1: -4, z1: -3, x2: 4, z2: 3, y: 3.0 }],
  ['切妻屋根', 'b', 'gableRoof', { w: 7, d: 5, y: 3.0, height: 1.6 }],
  ['壁看板', 'b', 'wallSign', { y: 3.0, text: 'テスト' }],
  ['小住宅', 'b', 'houseSmall', {}],
  ['商店', 'b', 'shopFront', {}],
  ['集合住宅', 'b', 'apartment', {}],
  ['倉庫', 'b', 'warehouse', {}],
  ['売店', 'b', 'kiosk', {}],
  ['自販機', 'b', 'vendingMachine', { name: 'つめたい' }],
];

const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const TILE_W = 460, TILE_H = 300;
const page = await browser.newPage({ viewport: { width: TILE_W, height: TILE_H } });
const errors = [];
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) errors.push(e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 600000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 600000 }).catch(() => {});
await page.evaluate(`(() => {
  const d = window.__DEV;
  d.game.paused = true; d.hud.hide(); d.engine.autoResolution = false;
  for (const c of d.engine.viewScene.children) c.visible = false;
  // 撮影台を作る（周りの物が写り込まない位置に、明るい床を敷く）
  window.__STAGE = { x: ${STAGE.x}, z: ${STAGE.z} };
})()`);

const rows = [];
const tiles = [];

for (const [name, kind, fn, args] of ASSETS) {
  const stat = await page.evaluate(`(() => {
    const d = window.__DEV, THREE = d.THREE, b = d.game.builder;
    const lib = kindOf('${kind}');
    function kindOf(k) { return k === 'b' ? d.buildings : d.props; }
    const f = lib['${fn}'];
    if (!f) return JSON.stringify({ err: '関数が無い' });

    const S = window.__STAGE;
    const before = b.root.children.slice();
    const args = ${JSON.stringify(args)};
    // 座標は撮影台へ。x1/z1/x2/z2 を持つものは相対値として足す。
    const o = { ...args };
    if ('x1' in o) { o.x1 += S.x; o.x2 += S.x; o.z1 += S.z; o.z2 += S.z; }
    else { o.x = S.x; o.z = S.z; o.y = o.y ?? 0; }
    if ('x1' in o) { o.y = o.y ?? 0; }
    try { f(b, o); } catch (e) { return JSON.stringify({ err: String(e.message) }); }
    b.finalize();

    const added = b.root.children.filter((c) => !before.includes(c));
    if (!added.length) return JSON.stringify({ err: '何も生成されなかった' });

    // 寸法と物量
    const box = new THREE.Box3();
    let tris = 0, meshes = 0;
    const matNames = new Set();
    for (const o2 of added) {
      o2.updateMatrixWorld(true);
      box.expandByObject(o2);
      o2.traverse((m) => {
        if (!m.isMesh) return;
        meshes++;
        const g = m.geometry;
        const n = g.index ? g.index.count : g.getAttribute('position').count;
        tris += n / 3 * (m.isInstancedMesh ? m.count : 1);
        matNames.add((m.name || '').replace(/^batch:|^inst:/, '') || (m.material?.name || '?'));
      });
    }
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(0.5, size.length() / 2);

    // 3/4 の高さから寄る
    const cam = d.engine.camera;
    cam.fov = 38; cam.updateProjectionMatrix();
    const dist = r / Math.tan(THREE.MathUtils.degToRad(19)) * 1.12;
    const a = Math.PI * 0.22;
    cam.position.set(c.x + Math.sin(a) * dist * 0.86, c.y + dist * 0.45, c.z + Math.cos(a) * dist * 0.86);
    cam.lookAt(c); cam.updateMatrixWorld();
    d.engine.lightPool.snap(cam.position);

    window.__ADDED = added;
    return JSON.stringify({
      名前: '${name}', 関数: '${fn}',
      寸法: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)],
      メッシュ: meshes, 三角形: Math.round(tris),
      マテリアル: [...matNames].sort(),
    });
  })()`);

  const s = JSON.parse(stat);
  if (s.err) { console.log(`× ${name}: ${s.err}`); rows.push({ 名前: name, エラー: s.err }); continue; }
  await page.waitForTimeout(2200);
  const buf = await page.screenshot({ timeout: 240000 });
  tiles.push({ name, b64: buf.toString('base64'), stat: s });
  rows.push(s);
  console.log(`${name}: ${s.メッシュ}メッシュ / ${s.三角形}面 / ${s.マテリアル.length}材 / ${s.寸法.join('×')}m`);

  // 片付ける（次のアセットに写り込ませない）
  await page.evaluate(`(() => {
    const b = window.__DEV.game.builder;
    for (const o of window.__ADDED) {
      b.root.remove(o);
      o.traverse((m) => { if (m.isMesh) m.geometry?.dispose(); });
      const i = b.extras.indexOf(o); if (i >= 0) b.extras.splice(i, 1);
    }
    window.__ADDED = [];
  })()`);
}

/* ---- コンタクトシートを組む ---- */
const COLS = 4, ROWS = 3, PER = COLS * ROWS;
for (let s = 0; s * PER < tiles.length; s++) {
  const group = tiles.slice(s * PER, (s + 1) * PER);
  const dataUrl = await page.evaluate(async (g) => {
    const cv = document.createElement('canvas');
    cv.width = 460 * 4; cv.height = (300 + 30) * Math.ceil(g.length / 4);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#141414'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < g.length; i++) {
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + g[i].b64; });
      const x = (i % 4) * 460, y = Math.floor(i / 4) * 330;
      ctx.drawImage(img, x, y);
      ctx.fillStyle = '#000'; ctx.fillRect(x, y + 300, 460, 30);
      ctx.fillStyle = '#eee'; ctx.font = '15px sans-serif';
      const st = g[i].stat;
      ctx.fillText(`${st.名前}  ${st.メッシュ}m / ${st.三角形}面 / ${st.マテリアル.length}材`, x + 8, y + 321);
      ctx.strokeStyle = '#333'; ctx.strokeRect(x, y, 460, 330);
    }
    return cv.toDataURL('image/png');
  }, group);
  const file = `${outDir}/sheet${s + 1}.png`;
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('一覧表:', file);
}

writeFileSync(`${outDir}/report.json`, JSON.stringify(rows, null, 1));
console.log(errors.length ? 'JS エラー: ' + [...new Set(errors)].slice(0, 5).join(' / ') : 'JS エラーなし');
await browser.close();
