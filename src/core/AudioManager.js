/**
 * 手続き型オーディオ。外部音源を持たず、WebAudio で合成する。
 *
 * 銃声は「初期のトランジェント（撃発）＋ボディ（膨張）＋テール（反響）」の
 * 3 層で構成すると、ノイズバーストだけより格段に実銃らしくなる。
 */

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this._lastShotAt = 0;
  }

  /** ユーザー操作の直後に呼ぶ（自動再生制限のため） */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings?.get('master') ?? 0.8;
    this.master.connect(this.ctx.destination);

    // 軽いリミッタ（連射時の歪みを抑える）
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 9;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.16;
    this.comp.connect(this.master);

    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.settings?.get('sfx') ?? 0.9;
    this.sfx.connect(this.comp);

    // 反響（畳み込み）用のインパルス応答を合成
    this.conv = this.ctx.createConvolver();
    this.conv.buffer = this._makeImpulse(1.5, 2.6);
    this.convGain = this.ctx.createGain();
    this.convGain.gain.value = 0.30;
    this.conv.connect(this.convGain);
    this.convGain.connect(this.comp);

    this.noiseBuf = this._makeNoise(2.0);
    this.ready = true;

    this.settings?.onChange((k, v) => {
      if (k === 'master' && this.master) this.master.gain.value = v;
      if (k === 'sfx' && this.sfx) this.sfx.gain.value = v;
    });
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  _makeNoise(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makeImpulse(sec, decay) {
    const rate = this.ctx.sampleRate;
    const n = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // 初期反射を疎に、後半を密にする
        const sparse = t < 0.08 ? (Math.random() < 0.16 ? 1 : 0.12) : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * sparse;
      }
    }
    return buf;
  }

  /** 距離減衰と定位を作る */
  _spatial(pos, refDist = 8) {
    const g = this.ctx.createGain();
    if (!pos) { g.gain.value = 1; g.connect(this.sfx); return { input: g, gain: g }; }
    const dx = pos.x - this.listenerPos.x;
    const dy = pos.y - this.listenerPos.y;
    const dz = pos.z - this.listenerPos.z;
    const d = Math.hypot(dx, dy, dz);
    g.gain.value = Math.min(1, refDist / Math.max(refDist, d)) * Math.exp(-d * 0.008);

    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) {
      // 聴取者の向きは考慮せず、左右方向のみ簡易に反映
      pan.pan.value = Math.max(-0.85, Math.min(0.85, dx / Math.max(6, d)));
      g.connect(pan);
      pan.connect(this.sfx);
      // 遠いほど残響を強く
      const send = this.ctx.createGain();
      send.gain.value = Math.min(0.55, d / 90);
      pan.connect(send);
      send.connect(this.conv);
      return { input: g, gain: g };
    }
    g.connect(this.sfx);
    return { input: g, gain: g };
  }

  _noiseSource(dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.85 + Math.random() * 0.3;
    return s;
  }

  /* ================= 銃声 ================= */

  /**
   * @param {object} def 武器定義
   * @param {{x,y,z}} pos 銃口位置
   * @param {boolean} silenced
   * @param {boolean} distant 他者の発砲か
   */
  playShot(def, pos, silenced = false, distant = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // 極端な連射で音が飽和しないよう最小間隔を設ける
    if (t - this._lastShotAt < 0.012) return;
    this._lastShotAt = t;

    const cls = def.class || '';
    // 口径感: 大口径ほど低く長い
    const heavy = cls.includes('スナイパー') || cls.includes('ショットガン') ? 1.0
      : cls.includes('アサルト') ? 0.7 : cls.includes('ハンドガン') ? 0.45 : 0.5;

    const out = this._spatial(pos, distant ? 14 : 6);
    const vol = silenced ? 0.30 : 1.0;

    /* --- 1. トランジェント（撃発の破裂） --- */
    {
      const src = this._noiseSource();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = silenced ? 900 : 1800 - heavy * 700;
      const g = this.ctx.createGain();
      const dur = silenced ? 0.035 : 0.045 + heavy * 0.02;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.95 * vol, t + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp); hp.connect(g); g.connect(out.input);
      src.start(t); src.stop(t + dur + 0.02);
    }

    /* --- 2. ボディ（膨張する低域） --- */
    if (!silenced) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const f0 = 150 - heavy * 60;
      osc.frequency.setValueAtTime(f0 * 2.4, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.09 + heavy * 0.05);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.55 * vol * (0.6 + heavy * 0.6), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13 + heavy * 0.08);
      osc.connect(g); g.connect(out.input);
      osc.start(t); osc.stop(t + 0.25);
    }

    /* --- 3. テール（機構音 / 反響） --- */
    {
      const src = this._noiseSource();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = silenced ? 1400 : 700 + Math.random() * 400;
      bp.Q.value = 0.9;
      const g = this.ctx.createGain();
      const dur = silenced ? 0.09 : 0.22 + heavy * 0.24;
      g.gain.setValueAtTime(0.0001, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.24 * vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(out.input);
      // 残響へ送る
      const send = this.ctx.createGain();
      send.gain.value = silenced ? 0.05 : 0.42;
      g.connect(send); send.connect(this.conv);
      src.start(t); src.stop(t + dur + 0.05);
    }

    // 機関部の金属音（薄く重ねると質感が出る）
    if (!silenced) this._tick(t + 0.028, 2600, 0.035, 0.10 * vol, out.input);
  }

  _tick(when, freq, dur, gain, dest) {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq * (0.9 + Math.random() * 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g); g.connect(dest || this.sfx);
    osc.start(when); osc.stop(when + dur + 0.02);
  }

  /* ================= その他 ================= */

  playImpact(surface, pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._spatial(pos, 4);
    const cfg = {
      metal: { f: 3200, q: 6, dur: 0.14, g: 0.30, type: 'bandpass' },
      concrete: { f: 900, q: 1.2, dur: 0.10, g: 0.26, type: 'bandpass' },
      wood: { f: 620, q: 2.0, dur: 0.11, g: 0.24, type: 'bandpass' },
      dirt: { f: 320, q: 0.8, dur: 0.09, g: 0.20, type: 'lowpass' },
      sand: { f: 260, q: 0.7, dur: 0.08, g: 0.18, type: 'lowpass' },
      glass: { f: 5200, q: 7, dur: 0.20, g: 0.28, type: 'bandpass' },
      gravel: { f: 700, q: 1.0, dur: 0.09, g: 0.20, type: 'bandpass' },
      fabric: { f: 400, q: 0.9, dur: 0.07, g: 0.14, type: 'lowpass' },
      rubber: { f: 300, q: 1.0, dur: 0.08, g: 0.14, type: 'lowpass' },
    }[surface] || { f: 900, q: 1.2, dur: 0.10, g: 0.24, type: 'bandpass' };

    const src = this._noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = cfg.type; f.frequency.value = cfg.f * (0.85 + Math.random() * 0.3); f.Q.value = cfg.q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(cfg.g, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + cfg.dur);
    src.connect(f); f.connect(g); g.connect(out.input);
    src.start(t); src.stop(t + cfg.dur + 0.03);
  }

  playHitmarker(isKill, isHead) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const base = isKill ? 1500 : (isHead ? 1900 : 1250);
    this._tick(t, base, 0.05, 0.24);
    if (isKill) this._tick(t + 0.055, base * 1.45, 0.09, 0.20);
    if (isHead && !isKill) this._tick(t + 0.04, base * 1.3, 0.05, 0.16);
  }

  playReload(def, empty) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const dur = empty ? def.reloadEmptyTime : def.reloadTime;
    // マガジン抜き → 挿入 → ボルト
    this._tick(t + 0.10, 900, 0.06, 0.16);
    this._tick(t + dur * 0.48, 620, 0.09, 0.20);
    this._tick(t + dur * 0.55, 1500, 0.05, 0.14);
    if (empty) this._tick(t + dur * 0.86, 2200, 0.07, 0.20);
  }

  playSwap() { if (this.ready) this._tick(this.ctx.currentTime + 0.05, 1100, 0.07, 0.14); }
  playDryFire() { if (this.ready) this._tick(this.ctx.currentTime, 2400, 0.04, 0.16); }

  playPlayerHit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.20);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(g); g.connect(this.sfx);
    osc.start(t); osc.stop(t + 0.28);
  }

  playFootstep(surface, isRun, pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._spatial(pos, 3);
    const cfg = {
      metal: { f: 2200, g: 0.10 }, concrete: { f: 800, g: 0.075 },
      wood: { f: 520, g: 0.075 }, dirt: { f: 300, g: 0.065 },
      sand: { f: 240, g: 0.055 }, gravel: { f: 1100, g: 0.085 },
      fabric: { f: 350, g: 0.045 },
    }[surface] || { f: 700, g: 0.07 };

    const src = this._noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = cfg.f * (0.8 + Math.random() * 0.4); f.Q.value = 1.1;
    const g = this.ctx.createGain();
    const gain = cfg.g * (isRun ? 1.6 : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(f); f.connect(g); g.connect(out.input);
    src.start(t); src.stop(t + 0.12);
  }

  /** カメラ位置を毎フレーム反映 */
  setListener(pos) {
    this.listenerPos.x = pos.x; this.listenerPos.y = pos.y; this.listenerPos.z = pos.z;
  }
}
