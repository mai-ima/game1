import * as THREE from 'three';

/**
 * 航行グラフ。
 *
 * ボットの経路探索は「目標へ向かって進み、ひげレイで障害物を避ける」
 * だけだった。開けた場所では十分に働くが、建物のある 130m 級のマップでは
 * 壁に突き当たったところで進めなくなる。壁伝いに滑るだけなので、
 * 建物の反対側にいる相手には永久に辿り着けない。
 *
 * 実測でも、標的を捉えていながら「遠すぎて撃てない」フレームが
 * 1 試合で 66,967 に達し、そのあいだの発射はわずか 123 発だった。
 * 見えているのに近づけない、という状態が延々と続いていた。
 *
 * ここでは、既にある巡回点（床があることを確認済みの点群）を
 * 節点として使い、互いに直進できる組を辺で結んだ図を作る。
 * あとは A* で辿る。ナビメッシュを焼くほどの手間はかからず、
 * マップを足しても自動で付いてくる。
 *
 * 最後の数 m は従来どおりの操舵に任せる。
 * 節点を律儀に踏みに行くと、角で不自然に曲がるため。
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class NavGraph {
  /**
   * @param {THREE.Vector3[]} points 床の上にあることが確認済みの点
   * @param {import('../world/Physics.js').Physics} physics
   * @param {object} opt {linkDist, eye}
   */
  constructor(points, physics, opt = {}) {
    const { linkDist = 18, eye = 1.1 } = opt;
    this.physics = physics;
    this.points = points.map((p) => p.clone());
    this.eye = eye;
    /** 節点ごとの隣接（index の配列と、その距離） */
    this.links = this.points.map(() => []);

    const n = this.points.length;
    const maxSq = linkDist * linkDist;

    /*
     * 総当たりで結ぶと、点が 300 を超えたところで作れなくなる。
     * 5 万通りそれぞれにレイを 2 本撃つので、マップの読み込みが
     * 数分止まった（実際そうなった）。
     * 格子に振り分けて、隣の升だけを調べる。
     */
    const CELL = linkDist;
    const cells = new Map();
    const key = (cx, cz) => cx * 100003 + cz;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.points[i].x / CELL);
      const cz = Math.floor(this.points[i].z / CELL);
      const k = key(cx, cz);
      let arr = cells.get(k);
      if (!arr) { arr = []; cells.set(k, arr); }
      arr.push(i);
    }

    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.points[i].x / CELL);
      const cz = Math.floor(this.points[i].z / CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const arr = cells.get(key(cx + ox, cz + oz));
          if (!arr) continue;
          for (const j of arr) {
            if (j <= i) continue;
            const d2 = this.points[i].distanceToSquared(this.points[j]);
            if (d2 > maxSq) continue;
            /*
             * 通れるかは 2 段で見る。
             * 膝の高さだけだと机や柵の下をくぐる経路が通ってしまい、
             * 胸の高さだけだと段差の上を跨ぐ経路が落ちる。
             */
            if (!this._clear(this.points[i], this.points[j], 0.55)) continue;
            if (!this._clear(this.points[i], this.points[j], 1.45)) continue;
            const d = Math.sqrt(d2);
            this.links[i].push({ to: j, d });
            this.links[j].push({ to: i, d });
          }
        }
      }
    }

    // A* の作業領域（毎回確保しない）
    this._g = new Float32Array(n);
    this._f = new Float32Array(n);
    this._from = new Int32Array(n);
    this._closed = new Uint8Array(n);
    this._open = [];
  }

  _clear(p, q, h) {
    _a.set(p.x, p.y + h, p.z);
    _b.set(q.x, q.y + h, q.z).sub(_a);
    const len = _b.length();
    if (len < 0.01) return true;
    _b.divideScalar(len);
    return !this.physics.raycast(_a, _b, len - 0.15, { forBullets: false });
  }

  /** いちばん近い節点。to が与えられればそちらへ近い方を優先する */
  nearest(pos, exclude = -1) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      if (i === exclude) continue;
      const d = this.points[i].distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /**
   * 経路を求める。
   * @returns {THREE.Vector3[]|null} 通過点の配列（出発点は含まない）
   */
  findPath(from, to) {
    const n = this.points.length;
    if (!n) return null;
    const s = this.nearest(from);
    const t = this.nearest(to);
    if (s < 0 || t < 0) return null;
    if (s === t) return [this.points[t].clone()];

    this._g.fill(Infinity);
    this._closed.fill(0);
    this._from.fill(-1);
    const open = this._open;
    open.length = 0;

    this._g[s] = 0;
    this._f[s] = this.points[s].distanceTo(this.points[t]);
    open.push(s);

    let guard = 0;
    while (open.length && guard++ < 4000) {
      // 最小の f を取り出す（節点数が数百なので線形で足りる）
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (this._f[open[i]] < this._f[open[bi]]) bi = i;
      const cur = open[bi];
      open.splice(bi, 1);
      if (cur === t) break;
      if (this._closed[cur]) continue;
      this._closed[cur] = 1;

      for (const l of this.links[cur]) {
        if (this._closed[l.to]) continue;
        const ng = this._g[cur] + l.d;
        if (ng >= this._g[l.to]) continue;
        this._g[l.to] = ng;
        this._from[l.to] = cur;
        this._f[l.to] = ng + this.points[l.to].distanceTo(this.points[t]);
        open.push(l.to);
      }
    }
    if (this._from[t] < 0 && s !== t) return null;

    const path = [];
    for (let i = t; i >= 0; i = this._from[i]) {
      path.push(this.points[i].clone());
      if (i === s) break;
      if (path.length > 200) break;
    }
    path.reverse();
    // 出発点の節点は踏まなくてよい
    if (path.length > 1) path.shift();
    return path;
  }

  /** 統計（作った直後に妥当性を見るため） */
  stats() {
    let edges = 0, isolated = 0;
    for (const l of this.links) { edges += l.length; if (!l.length) isolated++; }
    return { 節点: this.points.length, 辺: edges / 2, 孤立: isolated };
  }
}
