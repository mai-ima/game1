/**
 * マップを丸ごと、ブラウザを立てずに組んでみる。
 *
 * propsmoke は小物 1 点ずつを呼ぶので、小物の中の間違いは拾えるが、
 * 区画のコード（s_props.js など）は通らない。
 * 実際、今日はそこで 3 回止まった。
 *
 *   b.mats.chrome()            存在しないメソッド
 *   mat: 'emissive'            プリセットではない名前
 *   FACE_N is not defined      sed で import から消したのに使っていた
 *
 * どれもビルドは通る。バンドラは未定義の自由変数を実行時まで報告しない。
 * そしてソフトウェア描画では 1 回確かめるのに数分かかるので、
 * 「検査が遅い」のか「マップが壊れている」のか区別が付かない。
 *
 * ここでは MapBuilder の受け皿へマップを組み立てさせる。
 * 数秒で終わり、区画のコードまで含めて一度実行される。
 *
 *   node tools/mapsmoke.mjs
 */
import * as THREE from 'three';
import { PRESETS, SOLIDS } from '../src/render/MaterialLibrary.js';

const problems = [];
const warns = [];

function checkMat(where, name, via = 'batch') {
  if (name == null) return;
  const inP = name in PRESETS, inS = name in SOLIDS;
  if (via === 'get' && !inP) {
    problems.push(`${where}: mats.get に渡せない '${name}'`
      + (inS ? '（単色なので mats.solid を使う）' : '（そんな材質は無い）'));
  } else if (via === 'solid' && !inS) {
    problems.push(`${where}: mats.solid に渡せない '${name}'`
      + (inP ? '（テクスチャ付きなので mats.get を使う）' : '（そんな材質は無い）'));
  } else if (via === 'batch' && !inP && !inS) {
    problems.push(`${where}: 未定義の材質 '${name}'`);
  }
}

function checkNum(where, o, keys) {
  for (const k of keys) {
    const v = o[k];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      problems.push(`${where}: ${k} が数値でない (${v})`);
    }
  }
}

function makeStub(where) {
  const dummyMat = () => new THREE.MeshBasicMaterial();
  const stat = { box: 0, collider: 0, extra: 0, light: 0, mats: new Set() };
  const stub = {
    stat,
    root: new THREE.Group(),
    extras: [],
    lights: [],
    spawnPoints: { FFA: [] },
    objectives: [],
    instances: new Map(),
    batches: new Map(),
    bounds: new THREE.Box3(),
    physics: {
      colliders: [],
      addBox(x, y, z, hx, hy, hz, yaw, opt) {
        checkNum(`${where} addBox`, { x, y, z, hx, hy, hz, yaw }, ['x', 'y', 'z', 'hx', 'hy', 'hz', 'yaw']);
        stat.collider++;
        const c = { x, y, z, hx, hy, hz, yaw, ...opt };
        stub.physics.colliders.push(c);
        return c;
      },
      addCylinder(x, y, z, r, h, opt) {
        checkNum(`${where} addCylinder`, { x, y, z, r, h }, ['x', 'y', 'z', 'r', 'h']);
        stat.collider++;
        return {};
      },
    },
    mats: {
      get(n, o = {}) { checkMat(`${where} mats.get`, n, 'get'); stat.mats.add(n); return dummyMat(); },
      solid(n, o = {}) { checkMat(`${where} mats.solid`, n, 'solid'); stat.mats.add(n); return dummyMat(); },
      label(t, o = {}) { return dummyMat(); },
      signboard(t, o = {}) { return dummyMat(); },
      windowGlass(o = {}) { return dummyMat(); },
      glass(o = {}) { return dummyMat(); },
      emissive(c, i, o = {}) { return dummyMat(); },
    },
    box(o) {
      stat.box++; if (o.mat) stat.mats.add(o.mat);
      checkMat(`${where} box`, o.mat);
      checkNum(`${where} box`, o, ['x', 'y', 'z', 'w', 'h', 'd', 'yaw', 'rx', 'rz']);
      return stub;
    },
    floor(o) { return stub.box(o); },
    wall(o) {
      stat.box++; if (o.mat) stat.mats.add(o.mat);
      checkMat(`${where} wall`, o.mat);
      checkNum(`${where} wall`, o, ['x1', 'z1', 'x2', 'z2', 'h', 'thickness', 'y']);
      return stub;
    },
    wallWithGap(o) { return stub.wall(o); },
    wallWithGaps(o) { return stub.wall(o); },
    cylinder(o) {
      stat.box++; if (o.mat) stat.mats.add(o.mat);
      checkMat(`${where} cylinder`, o.mat);
      checkNum(`${where} cylinder`, o, ['x', 'y', 'z', 'radius', 'height']);
      return stub;
    },
    mesh(k, geo, t = {}) {
      stat.box++; stat.mats.add(k);
      checkMat(`${where} mesh`, k);
      checkNum(`${where} mesh`, t, ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz']);
      return stub;
    },
    addExtra(m, c = null) {
      stat.extra++;
      if (m && m.position) checkNum(`${where} addExtra`, m.position, ['x', 'y', 'z']);
      if (c) stub.physics.addBox(c.x, c.y, c.z, c.hx, c.hy, c.hz, c.yaw || 0, c);
      return stub;
    },
    light(o) { stat.light++; checkNum(`${where} light`, o, ['x', 'y', 'z', 'intensity', 'distance']); return stub; },
    stairs(o) { stat.box++; checkMat(`${where} stairs`, o.mat); return stub; },
    ramp(o) { stat.box++; checkMat(`${where} ramp`, o.mat); return stub; },
    instance(k, geo, t) { stat.box++; checkMat(`${where} instance`, k); return stub; },
    spawn(team, x, y, z, yaw) { checkNum(`${where} spawn`, { x, y, z }, ['x', 'y', 'z']); return stub; },
    objective(id, x, y, z, r) { checkNum(`${where} objective`, { x, y, z, r }, ['x', 'y', 'z', 'r']); return stub; },
    /*
     * 動く仕掛けは b.mover(fn) の形で更新関数を預ける。
     * 受け皿では呼ばずに数えるだけにする（1 フレームも回さないので）。
     */
    mover(fn) { stat.mover = (stat.mover || 0) + 1; return stub; },
  };
  return stub;
}

/* マップ側の console.warn を拾う（区画の重なりの検査など） */
const realWarn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };

const maps = [
  ['テストベッド', '../src/world/maps/testbed/index.js', 'buildTestbed'],
  ['コンパウンド', '../src/world/maps/Map_Compound.js', null],
];

for (const [name, path, fnName] of maps) {
  let mod;
  try {
    mod = await import(path);
  } catch (e) {
    problems.push(`${name}: 読み込みに失敗 ${e.message}`);
    continue;
  }
  const build = fnName ? mod[fnName]
    : Object.entries(mod).find(([k, v]) => typeof v === 'function' && /^build/.test(k))?.[1];
  if (!build) { problems.push(`${name}: 組み立て関数が見つからない`); continue; }

  const b = makeStub(name);
  const t0 = Date.now();
  try {
    build(b);
  } catch (e) {
    problems.push(`${name}: 例外 ${e.message}`);
    console.warn = realWarn;
    console.log(e.stack?.split('\n').slice(0, 4).join('\n'));
    console.warn = (...a) => { warns.push(a.join(' ')); };
    continue;
  }
  console.warn = realWarn;
  console.log(`${name}: 部材 ${b.stat.box} / コライダ ${b.stat.collider}`
    + ` / 個別メッシュ ${b.stat.extra} / 光源 ${b.stat.light}`
    + ` / 材質 ${b.stat.mats.size} 種   ${Date.now() - t0}ms`);
  console.warn = (...a) => { warns.push(a.join(' ')); };
}
console.warn = realWarn;

if (warns.length) {
  console.log(`\nマップからの警告 ${warns.length} 件:`);
  for (const w of [...new Set(warns)].slice(0, 20)) console.log('  ', w);
}
if (!problems.length) {
  console.log('\n○ どのマップも例外なく組み上がる');
} else {
  console.log(`\n× ${problems.length} 件:`);
  for (const p of [...new Set(problems)].slice(0, 40)) console.log('  ', p);
  process.exitCode = 1;
}
