import * as THREE from 'three';

/**
 * 点光源のプール。
 *
 * マップには街灯・室内灯・投光器が数十個ある。
 * three の標準マテリアルは、シーンにある点光源の数だけ
 * 「画素ごとに」減衰と BRDF を計算する。27 灯あれば全画面で 27 回まわる。
 * 実測では、これが描画時間のおよそ半分を占めていた。
 *
 * ところが実際に画に効くのは、カメラの近くにある数灯だけ。
 * 遠くの光は減衰しきっていて、あっても無くても同じ絵になる。
 * そこで実体の PointLight は固定数だけ持ち、近い順に定義を割り当て直す。
 * 見える範囲の絵は変わらないまま、画素あたりの計算量が数分の一になる。
 *
 * 実体の数を「固定」するのが肝心なところ。
 * three はライトの数が変わるたびにシェーダを組み直すので、
 * 出し入れすると切り替わるたびに数百 ms 固まる。
 * 使わない枠は強度 0 のまま残し、数は動かさない。
 */
export class LightPool {
  /**
   * @param {THREE.Scene} scene
   * @param {number} count 実体として持つ点光源の数
   */
  constructor(scene, count = 4) {
    this.scene = scene;
    /** @type {Array<{x,y,z,color,intensity,distance,decay,id}>} 光源の定義 */
    this.defs = [];
    /** @type {Array<{light:THREE.PointLight, def:object|null, cur:number, target:number}>} */
    this.slots = [];

    this.group = new THREE.Group();
    this.group.name = 'LightPool';
    scene.add(this.group);

    /** 割り当てを見直す間隔（秒）。毎フレーム並べ替える必要はない */
    this.pickInterval = 0.10;
    /** 明るさの追従速度。速すぎると切り替えが目に付き、遅すぎると点灯が間に合わない */
    this.fadeSpeed = 7;

    this._acc = 1e9;
    this._tmp = [];
    this.setCount(count);
  }

  /**
   * マップから受け取った光源定義を差し替える。
   * @param {Array<object>} defs {x,y,z,color,intensity,distance,decay}
   */
  setDefs(defs) {
    this.defs = (defs || []).map((d, i) => ({
      x: d.x, y: d.y, z: d.z,
      intensity: d.intensity ?? 3,
      distance: d.distance ?? 9,
      decay: d.decay ?? 2,
      col: new THREE.Color(d.color ?? 0xffd9a0),
      id: i,
    }));
    for (const s of this.slots) { s.def = null; s.cur = 0; s.target = 0; s.light.intensity = 0; }
    this._acc = 1e9;
  }

  /**
   * 実体の数を変える。
   * シェーダを組み直すので、設定を変えたときだけ呼ぶこと。
   */
  setCount(n) {
    n = Math.max(0, n | 0);
    if (n === this.slots.length) return;
    for (const s of this.slots) this.group.remove(s.light);
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.name = `poolLight${i}`;
      this.group.add(l);
      this.slots.push({ light: l, def: null, cur: 0, target: 0 });
    }
    this._acc = 1e9;
  }

  /**
   * このマップで実際に要る枠数を見積もって、上限より少なければ減らす。
   *
   * 空いている枠も、画素ごとの計算はきっちり走る。
   * 光源が疎なマップで上限いっぱいの枠を抱えると、
   * 一度も点かない光の減衰計算を全画面ぶん払うことになる。
   *
   * @param {number} max 画質設定の上限
   * @param {{min:{x,z},max:{x,z}}} bounds 遊べる範囲
   */
  fitCount(max, bounds) {
    if (!this.defs.length) { this.setCount(0); return 0; }
    let need = 1;
    const STEP = 4;
    // 目の高さと、2 階ぶんの高さで見る
    for (const y of [1.7, 4.9]) {
      for (let x = bounds.min.x; x <= bounds.max.x; x += STEP) {
        for (let z = bounds.min.z; z <= bounds.max.z; z += STEP) {
          let n = 0;
          for (const d of this.defs) {
            const dx = d.x - x, dy = d.y - y, dz = d.z - z;
            const reach = d.distance + 3;
            if (dx * dx + dy * dy + dz * dz <= reach * reach) n++;
          }
          if (n > need) { need = n; if (need >= max) { this.setCount(max); return max; } }
        }
      }
    }
    this.setCount(Math.min(max, need));
    return this.slots.length;
  }

  /**
   * 一時的な光源（爆発など）を割り込ませる。
   * 実体を足すとシェーダを組み直してしまうので、必ずプールから借りる。
   * @returns {object|null} 消すときに releaseTemp へ渡す定義
   */
  addTemp(x, y, z, color, intensity, distance) {
    const d = {
      x, y, z, intensity, distance, decay: 2,
      col: new THREE.Color(color), id: -(this.defs.length + 1) - Math.random(),
      temp: true,
    };
    this.defs.push(d);
    this._acc = 1e9;       // すぐ割り当て直す
    return d;
  }

  /** 一時的な光源を取り下げる */
  releaseTemp(d) {
    const i = this.defs.indexOf(d);
    if (i >= 0) this.defs.splice(i, 1);
    for (const s of this.slots) if (s.def === d) s.target = 0;
  }

  /** 一時的な光源の強さを更新する（減衰の演出） */
  setTempIntensity(d, intensity) {
    d.intensity = intensity;
    for (const s of this.slots) if (s.def === d) s.target = intensity;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} camPos
   */
  update(dt, camPos) {
    if (!this.slots.length) return;
    this._acc += dt;
    if (this._acc >= this.pickInterval) { this._acc = 0; this._pick(camPos); }

    const k = Math.min(1, dt * this.fadeSpeed);
    for (const s of this.slots) {
      if (s.cur !== s.target) {
        s.cur += (s.target - s.cur) * k;
        if (Math.abs(s.cur - s.target) < 0.015) s.cur = s.target;
        s.light.intensity = s.cur;
      }
      // 消えきった枠は解放して、次の光を受け入れられるようにする
      if (s.cur === 0 && s.target === 0 && s.def) s.def = null;
    }
  }

  /**
   * 場面が飛んだときに、フェードを待たず今の位置で確定させる。
   * 出撃・復帰・視点の瞬間移動で使う。
   */
  snap(camPos) {
    for (const s of this.slots) { s.def = null; s.cur = 0; s.target = 0; s.light.intensity = 0; }
    this._acc = 0;
    this._pick(camPos);
    for (const s of this.slots) { s.cur = s.target; s.light.intensity = s.cur; }
  }

  /** カメラに近い順へ割り当て直す */
  _pick(camPos) {
    const n = this.slots.length;
    if (!n) return;
    const scored = this._tmp;
    scored.length = 0;

    for (const d of this.defs) {
      const dx = d.x - camPos.x, dy = d.y - camPos.y, dz = d.z - camPos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      // 減衰半径の外は、点いていても画に出ない
      const reach = d.distance + 3;
      if (d2 > reach * reach) continue;
      // 点光源は距離の 2 乗で減る。寄与の見積もりもその形に合わせる
      scored.push({ d, score: d.intensity / (1 + d2 * 0.06) });
    }
    if (!scored.length) {
      for (const s of this.slots) if (s.def) s.target = 0;
      return;
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length > n) scored.length = n;

    const want = new Set();
    for (const w of scored) want.add(w.d);

    /*
     * 1) 圏外になった枠を落とす。
     *
     * ほぼ消えている枠は、消えきるのを待たずに空けてしまう。
     * 待つと「先に消えてから次が点く」順序になり、
     * 部屋に入った瞬間だけ暗いままになる。
     */
    for (const s of this.slots) {
      if (s.def && !want.has(s.def)) {
        s.target = 0;
        if (s.cur < 0.05) { s.cur = 0; s.light.intensity = 0; s.def = null; }
      }
    }
    // 2) 点いたままのものは目標を更新するだけ
    const held = new Set();
    for (const s of this.slots) {
      if (s.def && want.has(s.def)) { s.target = s.def.intensity; held.add(s.def); }
    }
    // 3) 空いた枠へ新しい光を入れる
    for (const w of scored) {
      if (held.has(w.d)) continue;
      const s = this.slots.find((q) => !q.def);
      if (!s) break;
      s.def = w.d;
      s.light.position.set(w.d.x, w.d.y, w.d.z);
      s.light.color.copy(w.d.col);
      s.light.distance = w.d.distance;
      s.light.decay = w.d.decay;
      s.target = w.d.intensity;
      held.add(w.d);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.slots = [];
    this.defs = [];
  }
}
