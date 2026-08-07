/**
 * 設定の保持と永続化（localStorage）。
 */

const KEY = 'opcrimson.settings.v1';

const DEFAULTS = {
  sensitivity: 1.0,
  adsSensitivity: 0.62,
  touchSensitivity: 1.25,
  invertY: false,
  leftHanded: false,
  fov: 80,
  quality: 'high',
  brightness: 1.0,
  motionBlur: true,
  filmGrain: true,
  showFps: false,
  master: 0.8,
  sfx: 0.9,
  music: 0.5,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.load();
    this.listeners = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch { /* 保存領域が使えない環境では既定値のまま動かす */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* 無視 */ }
  }

  get(k) { return this.values[k]; }

  set(k, v) {
    this.values[k] = v;
    this.save();
    for (const fn of this.listeners) fn(k, v);
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  reset() { this.values = { ...DEFAULTS }; this.save(); }

  /** 端末に応じた初期画質を推定する */
  static suggestQuality() {
    const dm = navigator.deviceMemory || 4;
    const hc = navigator.hardwareConcurrency || 4;
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    // 端末性能は事前に当てられない。ここでは控えめに始め、
    // 実際のフレーム時間を見てエンジン側の動的解像度が上下させる。
    // ultra は GTAO まで有効になるため、明示的に選んだときだけ使う。
    if (mobile) return (dm >= 6 && hc >= 6) ? 'high' : 'medium';
    if (dm >= 8 && hc >= 8) return 'high';
    if (dm >= 4) return 'medium';
    return 'low';
  }
}

export { DEFAULTS };
