/**
 * ミニマップ。
 * レベルのコライダから俯瞰の地形図を一度だけ焼き込み、
 * 毎フレームは自機・敵・味方・目標だけを描く（負荷を抑えるため）。
 */

const TAU = Math.PI * 2;

export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opt {size, worldRadius, tokens}
   */
  constructor(canvas, opt = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = opt.size || 176;
    this.worldRadius = opt.worldRadius || 34;   // 表示半径(m)
    this.rotateWithPlayer = true;
    this.tokens = opt.tokens || {};

    this.terrain = null;      // 焼き込み済みの地形（OffscreenCanvas）
    this.terrainScale = 1;
    this.terrainOrigin = { x: 0, z: 0 };
    this.bounds = { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } };

    this.resize(this.size);
  }

  resize(size) {
    this.size = size;
    const c = this.canvas;
    c.width = Math.round(size * this.dpr);
    c.height = Math.round(size * this.dpr);
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
  }

  /**
   * レベルの当たり判定から地形図を焼く。
   * @param {import('../world/Physics.js').Physics} physics
   * @param {object} bounds {min:{x,z}, max:{x,z}}
   */
  bake(physics, bounds) {
    this.bounds = bounds;
    const W = bounds.max.x - bounds.min.x;
    const H = bounds.max.z - bounds.min.z;
    const RES = 1024;
    const scale = RES / Math.max(W, H);
    this.terrainScale = scale;
    this.terrainOrigin = { x: bounds.min.x, z: bounds.min.z };

    const cv = document.createElement('canvas');
    cv.width = cv.height = RES;
    const g = cv.getContext('2d');

    g.fillStyle = 'rgba(10,11,13,0)';
    g.fillRect(0, 0, RES, RES);

    // 高さ別に色を変えて立体感を出す
    const colliders = [...physics.colliders].sort((a, b) => (a.max.y - b.max.y));
    for (const c of colliders) {
      if (!c.blocksMovement) continue;
      const top = c.max.y;
      const h = c.max.y - c.min.y;
      // 床（薄い板）は下地、壁や箱は明るく
      const isFloor = h < 0.5 && top < 0.6;
      const isLow = top < 1.3;

      let fill;
      if (isFloor) fill = 'rgba(58,63,70,0.85)';
      else if (isLow) fill = 'rgba(96,104,114,0.9)';
      else if (top < 4.2) fill = 'rgba(146,156,168,0.95)';
      else fill = 'rgba(192,200,210,0.98)';

      g.save();
      const cx = (c.center.x - bounds.min.x) * scale;
      const cz = (c.center.z - bounds.min.z) * scale;
      g.translate(cx, cz);
      g.rotate(c.yaw);
      g.fillStyle = fill;
      const w = c.half.x * 2 * scale;
      const d = c.half.z * 2 * scale;
      g.fillRect(-w / 2, -d / 2, w, d);
      g.restore();
    }

    this.terrain = cv;
  }

  /**
   * 毎フレーム描画。
   * @param {object} s {playerPos, playerYaw, allies:[{x,z,yaw}], enemies:[{x,z,yaw,visible}], objectives:[{x,z,id,owner}]}
   */
  draw(s) {
    const g = this.ctx;
    const S = this.size;
    const D = this.dpr;
    const R = S / 2;

    g.setTransform(D, 0, 0, D, 0, 0);
    g.clearRect(0, 0, S, S);

    // --- 背景 ---
    g.save();
    g.beginPath();
    g.arc(R, R, R - 1, 0, TAU);
    g.clip();

    g.fillStyle = 'rgba(9,10,12,0.82)';
    g.fillRect(0, 0, S, S);

    /*
     * 地図の回転角。
     *
     * ワールドの前方は (-sin yaw, -cos yaw)、画面は X が右・Z が下。
     * 前方を画面の上（0,-1）へ持っていく回転は +yaw であって -yaw ではない。
     * 符号が逆だと、南北を向いているときだけ偶然一致し、
     * 東西を向くと前後が入れ替わる（実際そうなっていた）。
     */
    const rot = this.rotateWithPlayer ? s.playerYaw : 0;
    const pxPerM = R / this.worldRadius;

    // --- 地形 ---
    if (this.terrain) {
      g.save();
      g.translate(R, R);
      g.rotate(rot);
      const sc = pxPerM / this.terrainScale;
      g.scale(sc, sc);
      g.translate(
        -(s.playerPos.x - this.terrainOrigin.x) * this.terrainScale,
        -(s.playerPos.z - this.terrainOrigin.z) * this.terrainScale
      );
      g.globalAlpha = 0.9;
      g.drawImage(this.terrain, 0, 0);
      g.globalAlpha = 1;
      g.restore();
    }

    // ワールド座標 → 画面座標
    const toScreen = (wx, wz) => {
      const dx = (wx - s.playerPos.x) * pxPerM;
      const dz = (wz - s.playerPos.z) * pxPerM;
      const c = Math.cos(rot), sn = Math.sin(rot);
      return [R + dx * c - dz * sn, R + dx * sn + dz * c];
    };

    // --- 目標地点 ---
    for (const o of s.objectives || []) {
      const [x, y] = toScreen(o.x, o.z);
      const col = o.owner === 'A' ? '#4a90d9' : o.owner === 'B' ? '#d9482f' : '#8b9299';
      g.strokeStyle = col;
      g.lineWidth = 1.6;
      g.globalAlpha = 0.9;
      g.beginPath(); g.arc(x, y, 9, 0, TAU); g.stroke();
      g.fillStyle = col;
      g.globalAlpha = 0.22;
      g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = col;
      g.font = '700 10px ui-monospace, "SF Mono", Menlo, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(o.id, x, y + 0.5);
    }

    // --- 味方 ---
    // 矢印は「画面上向きから時計回りに yaw-rot」で描く（rot と同じ向きに回す）
    for (const a of s.allies || []) {
      const [x, y] = toScreen(a.x, a.z);
      this._drawArrow(g, x, y, a.yaw - rot, '#4a90d9', 4.2);
    }

    // --- 敵（発砲・視認時のみ） ---
    for (const e of s.enemies || []) {
      const [x, y] = toScreen(e.x, e.z);
      const alpha = e.fresh !== undefined ? Math.max(0.25, e.fresh) : 1;
      g.globalAlpha = alpha;
      this._drawArrow(g, x, y, e.yaw - rot, '#d9482f', 4.6);
      g.globalAlpha = 1;
    }

    g.restore();

    // --- 自機（常に中心・上向き） ---
    g.save();
    g.translate(R, R);
    // 視野コーン
    const fov = (s.fov || 80) * Math.PI / 180;
    const coneR = R * 0.52;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, coneR);
    grd.addColorStop(0, 'rgba(242,239,233,0.24)');
    grd.addColorStop(1, 'rgba(242,239,233,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, coneR, -Math.PI / 2 - fov / 2, -Math.PI / 2 + fov / 2);
    g.closePath();
    g.fill();

    // 自機マーカー
    g.fillStyle = '#f2efe9';
    g.beginPath();
    g.moveTo(0, -6.2);
    g.lineTo(4.4, 5.0);
    g.lineTo(0, 2.8);
    g.lineTo(-4.4, 5.0);
    g.closePath();
    g.fill();
    g.restore();

    // --- 外周リング + 方位 ---
    g.strokeStyle = 'rgba(242,239,233,0.30)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(R, R, R - 1, 0, TAU); g.stroke();

    // 目盛り
    g.strokeStyle = 'rgba(242,239,233,0.22)';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2;
      const long = i % 3 === 0;
      const r0 = R - (long ? 7 : 4), r1 = R - 1.5;
      g.beginPath();
      g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0);
      g.lineTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1);
      g.stroke();
    }

    // 北の表示（回転する）
    const nAng = rot - Math.PI / 2;
    g.fillStyle = '#d97757';
    g.font = '700 9px ui-monospace, "SF Mono", Menlo, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', R + Math.cos(nAng) * (R - 12), R + Math.sin(nAng) * (R - 12));
  }

  _drawArrow(g, x, y, yaw, color, size) {
    g.save();
    g.translate(x, y);
    g.rotate(-yaw);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, -size);
    g.lineTo(size * 0.72, size * 0.78);
    g.lineTo(0, size * 0.4);
    g.lineTo(-size * 0.72, size * 0.78);
    g.closePath();
    g.fill();
    g.restore();
  }
}
