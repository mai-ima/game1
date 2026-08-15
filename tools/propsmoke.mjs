/**
 * 小物と建物を、ブラウザを立てずに全部呼んでみる。
 *
 * 今日、姿見の中で b.mats.chrome() と書いた。
 * プリセットは自動でメソッドにならないので、これは存在しない関数で、
 * 呼ばれた瞬間にマップの組み立てが止まる。
 * 画面は「読み込み中」のまま何も出ず、検査の道具はどれも
 * 10 分待って黙って終わった。原因に辿り着くまで 1 時間かかった。
 *
 * ビルドは通る（構文は正しい）。ソフトウェア描画で 1 回確かめるには
 * 数分かかる。その間にこういう間違いは何度でも入る。
 *
 * ここでは MapBuilder の代わりに受け皿を置いて、
 * 全部の小物・建物を既定の引数で 1 回ずつ呼ぶ。
 * 数秒で終わり、次のことが判る。
 *
 *   ・存在しないメソッドを呼んでいないか
 *   ・存在しない材質名を渡していないか
 *   ・NaN や undefined を座標に入れていないか
 *
 *   node tools/propsmoke.mjs
 */
import * as THREE from 'three';
import { PRESETS, SOLIDS } from '../src/render/MaterialLibrary.js';
import * as P from '../src/world/Props.js';
import * as B from '../src/world/Buildings.js';

const problems = [];
let calls = 0;

/** 材質名が実在するか確かめる */
function checkMat(where, name) {
  if (name == null) return;
  if (!(name in PRESETS) && !(name in SOLIDS)) {
    problems.push(`${where}: 未定義の材質 '${name}'`);
  }
}

/** 座標に NaN や undefined が混ざっていないか */
function checkNum(where, o, keys) {
  for (const k of keys) {
    const v = o[k];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      problems.push(`${where}: ${k} が数値でない (${v})`);
    }
  }
}

/** MapBuilder の受け皿 */
function makeStub(where) {
  const dummyMat = () => new THREE.MeshBasicMaterial();
  const stub = {
    root: new THREE.Group(),
    extras: [],
    lights: [],
    bounds: new THREE.Box3(),
    physics: {
      colliders: [],
      addBox(x, y, z, hx, hy, hz, yaw, opt) {
        checkNum(`${where} addBox`, { x, y, z, hx, hy, hz, yaw }, ['x', 'y', 'z', 'hx', 'hy', 'hz', 'yaw']);
        const c = { x, y, z, hx, hy, hz, yaw, ...opt };
        stub.physics.colliders.push(c);
        return c;
      },
      addCylinder(x, y, z, r, h, opt) {
        checkNum(`${where} addCylinder`, { x, y, z, r, h }, ['x', 'y', 'z', 'r', 'h']);
        const c = { x, y, z, r, h, ...opt };
        stub.physics.colliders.push(c);
        return c;
      },
    },
    mats: {
      /*
       * 手で書いてあるメソッドだけを生やす。
       * プリセット名をメソッドとして呼ぶ間違いを、ここで落とす。
       */
      get(name, opt = {}) { checkMat(`${where} mats.get`, name); return dummyMat(); },
      label(text, opt = {}) { return dummyMat(); },
      signboard(text, opt = {}) { return dummyMat(); },
      windowGlass(opt = {}) { return dummyMat(); },
      glass(opt = {}) { return dummyMat(); },
      solid(name, opt = {}) { checkMat(`${where} mats.solid`, name); return dummyMat(); },
      emissive(opt = {}) { return dummyMat(); },
    },
    box(o) {
      calls++;
      checkMat(`${where} box`, o.mat);
      checkNum(`${where} box`, o, ['x', 'y', 'z', 'w', 'h', 'd', 'yaw', 'rx', 'rz']);
      return stub;
    },
    floor(o) { return stub.box(o); },
    wall(o) {
      calls++;
      checkMat(`${where} wall`, o.mat);
      checkNum(`${where} wall`, o, ['x1', 'z1', 'x2', 'z2', 'h', 'thickness', 'y']);
      return stub;
    },
    wallWithGap(o) { return stub.wall(o); },
    wallWithGaps(o) { return stub.wall(o); },
    cylinder(o) {
      calls++;
      checkMat(`${where} cylinder`, o.mat);
      checkNum(`${where} cylinder`, o, ['x', 'y', 'z', 'radius', 'height']);
      return stub;
    },
    mesh(matKey, geo, t = {}) {
      calls++;
      checkMat(`${where} mesh`, matKey);
      checkNum(`${where} mesh`, t, ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz']);
      return stub;
    },
    addExtra(m, collider = null) {
      calls++;
      if (m && m.position) checkNum(`${where} addExtra`, m.position, ['x', 'y', 'z']);
      return stub;
    },
    light(o) { checkNum(`${where} light`, o, ['x', 'y', 'z', 'intensity', 'distance']); return stub; },
    stairs(o) { calls++; checkMat(`${where} stairs`, o.mat); return stub; },
    ramp(o) { calls++; checkMat(`${where} ramp`, o.mat); return stub; },
    spawn() { return stub; },
    objective() { return stub; },
    mover: { add() {} },
  };
  return stub;
}

/** 既定の引数。位置・向き・両端をひととおり渡す */
const ARGS = {
  x: 0, y: 0, z: 0, yaw: 0,
  x1: -1.5, z1: 0, x2: 1.5, z2: 0,
  w: 1.2, d: 0.8, h: 1.0, width: 1.2, height: 1.0, length: 2.0,
  seed: 3, count: 4, tiers: 3, floors: 2, levels: 2, steps: 8,
  text: '見本', sub: 'SAMPLE', name: '見本',
};

const skip = new Set(['powerLine']);          // 2 点を別に要するもの
const run = (mod, label) => {
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn !== 'function' || skip.has(name)) continue;
    const where = `${label}.${name}`;
    const b = makeStub(where);
    try {
      fn(b, { ...ARGS });
    } catch (e) {
      problems.push(`${where}: 例外 ${e.message}`);
    }
  }
};

run(P, '小物');
run(B, '建物');

console.log(`小物 ${Object.keys(P).filter((k) => typeof P[k] === 'function').length} 点 / `
  + `建物 ${Object.keys(B).filter((k) => typeof B[k] === 'function').length} 点を呼び出し`
  + `（部材 ${calls} 個）`);
if (!problems.length) {
  console.log('○ 例外なし・未定義の材質なし・座標に NaN なし');
} else {
  console.log(`× ${problems.length} 件:`);
  for (const p of [...new Set(problems)].slice(0, 40)) console.log('  ', p);
  process.exitCode = 1;
}
