/**
 * 当たり判定のズレを洗い出す。
 *
 * 見えている面（描画メッシュ）と、弾や足が当たる面（物理コライダ）を
 * 同じレイで突き合わせ、食い違う場所を座標付きで並べる。
 *   ・上から真下へ  … 床の高さがズレていないか（浮く / めり込む）
 *   ・水平に        … 壁が見た目より手前 / 奥で止まらないか
 *
 *   node tools/collision.mjs [url] [格子の間隔m]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:4173/?rawgpu&quality=high';
const step = parseFloat(process.argv[3] || '2.0');
const execPath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: execPath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('ERR', e.message); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__DEV', null, { timeout: 300000 });
await page.evaluate('window.__DEV.startMatch()');
await page.waitForFunction('window.__DEV.game.running===true', null, { timeout: 300000 }).catch(() => {});

const out = await page.evaluate(`(() => {
  const d = window.__DEV, THREE = d.THREE, g = d.game;
  const scene = d.engine.scene;

  // 人物と空は対象外（動くもの・無限遠は比較しても意味がない）
  const targets = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let p = o, skip = false;
    while (p) {
      if (p.name === 'soldier' || p.name === 'Sky' || p.name === 'SkyBox') { skip = true; break; }
      p = p.parent;
    }
    if (!skip) targets.push(o);
  });

  const rc = new THREE.Raycaster();
  rc.far = 200;
  const down = new THREE.Vector3(0, -1, 0);

  const floorBad = [];
  const wallBad = [];
  let floorN = 0, wallN = 0;
  /*
   * 検査範囲はコライダ全体から求める。
   * マップごとに広さが違うので固定値にすると、
   * 広げた部分をまるごと見落とす。
   */
  const B = { min: { x: 1e9, z: 1e9 }, max: { x: -1e9, z: -1e9 } };
  for (const c of g.physics.colliders) {
    if (!c.active) continue;
    if (Math.max(c.half.x, c.half.z) > 40) continue;   // 地面や外周など巨大なものは除く
    B.min.x = Math.min(B.min.x, c.min.x); B.min.z = Math.min(B.min.z, c.min.z);
    B.max.x = Math.max(B.max.x, c.max.x); B.max.z = Math.max(B.max.z, c.max.z);
  }
  const STEP = ${step};

  for (let x = B.min.x + 1; x <= B.max.x - 1; x += STEP) {
    for (let z = B.min.z + 1; z <= B.max.z - 1; z += STEP) {
      /* --- 上から真下へ --- */
      const from = new THREE.Vector3(x, 40, z);
      rc.far = 60;                       // 水平検査で 12 に縮めたあとなので戻す
      rc.set(from, down);
      const vis = rc.intersectObjects(targets, false);
      const phy = g.physics.raycast(from, down, 60, { forBullets: false });
      if (vis.length && phy) {
        floorN++;
        const dy = vis[0].point.y - phy.point.y;
        // 描画のほうが高い＝足が浮く / 低い＝床にめり込む
        if (Math.abs(dy) > 0.14) {
          floorBad.push({ x: +x.toFixed(1), z: +z.toFixed(1), 差: +dy.toFixed(2),
            見た目y: +vis[0].point.y.toFixed(2), 判定y: +phy.point.y.toFixed(2) });
        }
      } else if (vis.length && !phy) {
        floorN++;
        floorBad.push({ x: +x.toFixed(1), z: +z.toFixed(1), 差: null, 内容: '見えるが判定なし',
          見た目y: +vis[0].point.y.toFixed(2) });
      }

      /* --- 水平（目線の高さで 4 方向） --- */
      const eye = new THREE.Vector3(x, (phy ? phy.point.y : 0) + 1.5, z);
      /*
       * 検査点が壁や箱の内部だと、物理は当たるのに描画は背面を
       * 拾わないため、必ず食い違って見える。人が立てない場所を
       * 数えても仕方がないので、めり込んでいる点は飛ばす。
       */
      if (g.physics._overlaps(eye, 0.16, 0.2)) continue;
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const dir = new THREE.Vector3(dx, 0, dz);
        rc.set(eye, dir);
        rc.far = 12;
        const v = rc.intersectObjects(targets, false);
        const p2 = g.physics.raycast(eye, dir, 12, { forBullets: true });
        /*
         * 金網や網戸は「弾は抜けるが体は止まる」ように作ってある。
         * 弾用のレイだけで見ると素通りに見えるので、
         * 移動用のレイでも当たらないときだけ問題として数える。
         */
        const pMove = g.physics.raycast(eye, dir, 12, { forBullets: false });
        if (!v.length && !p2 && !pMove) continue;
        wallN++;
        const vd = v.length ? v[0].distance : 99;
        const pd = p2 ? p2.dist : 99;
        const md = pMove ? pMove.dist : 99;
        // 弾は抜けても体が止まるなら、遮蔽としては成立している
        if (Math.abs(vd - md) < 0.30) continue;
        if (Math.abs(vd - pd) > 0.30 && Math.min(vd, pd) < 12) {
          /*
           * 食い違いを 3 種類に分ける。まとめて数えると、
           * 「わざと素通りさせている飾り」と「本当に位置がズレた壁」が
           * 同じ列に並んでしまい、直すべきものが埋もれる。
           *
           * 分ける軸は「どちらが手前か」。
           *   判定が手前   … 何も無い所で止まる。見えない壁。実害が最も大きい
           *   数十cm のズレ … 同じ壁を指しているのに面が合っていない。要修正
           *   大きく奥     … 見えている物をすり抜けて、その奥の壁で止まる。
           *                   細い柱や庇など、意図して判定を持たせていない飾りが大半
           *
           * 「両方当たったか」で分けてはいけない。飾りをすり抜けた先に
           * 別の壁があれば両方当たるので、素通りがズレに化けてしまう。
           */
          const kind = (pd + 0.30 < vd) ? '見えない壁'
            : (pd - vd <= 1.0) ? 'ズレ' : '素通り';
          const row = { 種別: kind, x: +x.toFixed(1), z: +z.toFixed(1), 向き: [dx, dz],
            見た目m: +vd.toFixed(2), 判定m: +pd.toFixed(2), 差: +(pd - vd).toFixed(2) };
          if (v.length) {
            const h = v[0];
            row.見えた物 = {
              名前: h.object.name || '(無名)',
              材質: h.object.material?.name || '?',
              点: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)],
            };
          }
          if (p2?.collider) {
            const c = p2.collider;
            row.当たった物 = {
              中心: [+c.center.x.toFixed(2), +c.center.y.toFixed(2), +c.center.z.toFixed(2)],
              半径: [+c.half.x.toFixed(2), +c.half.y.toFixed(2), +c.half.z.toFixed(2)],
              yaw: +c.yaw.toFixed(2), 面: c.surface, 札: c.tag || null,
            };
          }
          wallBad.push(row);
        }
      }
    }
  }

  const sortAbs = (a, b) => Math.abs(b.差 ?? 9) - Math.abs(a.差 ?? 9);
  floorBad.sort(sortAbs); wallBad.sort(sortAbs);
  const of = (k) => wallBad.filter((r) => r.種別 === k);
  const pct = (n, d) => (d ? +(n / d * 100).toFixed(1) + '%' : '-');
  const zure = of('ズレ'), inv = of('見えない壁'), thru = of('素通り');
  return JSON.stringify({
    格子間隔m: STEP,
    床の検査点: floorN,
    床のズレ件数: floorBad.length,
    床のズレ率: pct(floorBad.length, floorN),
    床のズレ上位: floorBad.slice(0, 10),
    壁の検査本数: wallN,
    要修正_位置ズレ: { 件数: zure.length, 率: pct(zure.length, wallN), 上位: zure.slice(0, 10) },
    要修正_見えない壁: { 件数: inv.length, 率: pct(inv.length, wallN), 上位: inv.slice(0, 10) },
    参考_素通りの飾り: { 件数: thru.length, 率: pct(thru.length, wallN), 上位: thru.slice(0, 6) },
  }, null, 1);
})()`);

console.log(out);
await browser.close();
