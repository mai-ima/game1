import * as THREE from 'three';

/**
 * 陣営ごとの状況把握。
 *
 * ボットは巡回先を「マップ全体から一様にランダムで選ぶ」だけだった。
 * マップが 190 × 160m まで広がったあと、これでは 7 体が別々の方向へ
 * ばらけていくだけで、めったに出会わない。
 * 5 分間の試合を計測すると
 *
 *   発射弾数 475 / 撃破 7 / 1 分あたり 1.6 撃破
 *   撃てなかった理由の 84% が「交戦状態ではない」
 *
 * つまり撃ち合いが弱いのではなく、撃ち合いが始まらなかった。
 *
 * 実際の分隊は、誰かが敵を見たらそれを共有し、皆がそちらへ寄る。
 * 銃声も同じ働きをする。ここではその「共有された地図」を持つ。
 *
 *   ・接触（敵を見た / 撃たれた / 銃声を聞いた）を陣営ごとに記録する
 *   ・古い接触は時間で薄れる
 *   ・巡回先を選ぶとき、記録の濃い所へ寄せる
 *
 * こうすると戦線が自然に生まれ、遭遇が続くようになる。
 * 一方で全員が一点に集まってしまうと、それはそれで不自然なので、
 * 寄せる強さは距離と鮮度で加減する。
 */

/** 接触 1 件の寿命（秒）。これを過ぎると忘れる */
const LIFETIME = 26;

/** 接触の種類ごとの重み */
const WEIGHT = { sight: 1.0, damage: 1.2, gunfire: 0.55, death: 0.9 };

export class Awareness {
  constructor() {
    /** team -> 接触の配列 */
    this._byTeam = new Map();
    /** 陣営を問わない「今いちばん熱い場所」 */
    this.hot = new THREE.Vector3();
    this.hotWeight = 0;
    this._tmp = new THREE.Vector3();
  }

  _list(team) {
    let l = this._byTeam.get(team);
    if (!l) { l = []; this._byTeam.set(team, l); }
    return l;
  }

  /**
   * 接触を記録する。
   * @param {string} team  この情報を持つ陣営（＝報告した側）
   * @param {THREE.Vector3} pos 敵がいた位置
   * @param {string} kind 'sight' | 'damage' | 'gunfire' | 'death'
   */
  report(team, pos, kind = 'sight') {
    if (!team || !pos) return;
    const l = this._list(team);
    /*
     * 近い所の報告はまとめる。
     * 交戦中は毎フレーム「見えた」が飛んでくるので、
     * そのまま積むと配列が延々と伸びる。
     */
    for (const c of l) {
      if (c.pos.distanceToSquared(pos) < 36) {
        c.pos.lerp(pos, 0.4);
        c.t = 0;
        c.w = Math.min(3, c.w + WEIGHT[kind] * 0.35);
        return;
      }
    }
    l.push({ pos: pos.clone().setY(0), t: 0, w: WEIGHT[kind] ?? 1 });
    if (l.length > 12) l.shift();
  }

  /** 試合開始・ラウンド交代でまっさらに戻す */
  clear() {
    this._byTeam.clear();
    this.hotWeight = 0;
  }

  update(dt) {
    let hx = 0, hz = 0, hw = 0;
    for (const l of this._byTeam.values()) {
      for (let i = l.length - 1; i >= 0; i--) {
        const c = l[i];
        c.t += dt;
        if (c.t > LIFETIME) { l.splice(i, 1); continue; }
        const fresh = 1 - c.t / LIFETIME;
        hx += c.pos.x * c.w * fresh;
        hz += c.pos.z * c.w * fresh;
        hw += c.w * fresh;
      }
    }
    if (hw > 0.05) {
      this.hot.set(hx / hw, 0, hz / hw);
      this.hotWeight = hw;
    } else {
      this.hotWeight *= Math.max(0, 1 - dt * 0.5);
    }
  }

  /**
   * 巡回先を決める。
   *
   * @param {string} team    そのボットの陣営
   * @param {THREE.Vector3} from 現在地
   * @param {function} fallback 何も情報が無いときに使う（world.randomPatrolPoint）
   * @param {number} rng     0..1 の乱数
   */
  patrolTarget(team, from, fallback, rng = Math.random()) {
    const l = this._list(team);

    /*
     * 自陣が掴んでいる接触があれば、その中から選ぶ。
     * 近くて新しいものほど選ばれやすい。
     * ただし毎回いちばん濃い所へ行くと全員が一列になるので、
     * 重みつきの抽選にして散らす。
     */
    if (l.length) {
      let total = 0;
      const w = [];
      for (const c of l) {
        const fresh = 1 - c.t / LIFETIME;
        const d = Math.hypot(c.pos.x - from.x, c.pos.z - from.z);
        // 60m を超えると遠すぎて向かう気にならない
        const near = 1 / (1 + Math.max(0, d - 20) / 45);
        const s = c.w * fresh * near;
        w.push(s); total += s;
      }
      if (total > 0.02) {
        let r = rng * total;
        for (let i = 0; i < l.length; i++) {
          r -= w[i];
          if (r <= 0) {
            // 目標そのものではなく、その周囲へ散らす（同じ穴に固まらない）
            const a = rng * Math.PI * 2;
            const rad = 5 + rng * 11;
            return this._tmp.set(
              l[i].pos.x + Math.cos(a) * rad, 0, l[i].pos.z + Math.sin(a) * rad
            ).clone();
          }
        }
      }
    }

    /*
     * 情報が無いときは、直近まで戦っていた所（陣営を問わない熱源）へ。
     * それも無ければ従来どおりランダム。
     */
    if (this.hotWeight > 0.4 && rng < 0.6) {
      const a = rng * Math.PI * 2;
      const rad = 8 + rng * 18;
      return this._tmp.set(this.hot.x + Math.cos(a) * rad, 0, this.hot.z + Math.sin(a) * rad).clone();
    }
    return fallback ? fallback(from) : null;
  }
}
