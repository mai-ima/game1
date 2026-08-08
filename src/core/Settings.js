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
  /** 実測フレーム時間に応じて描画解像度を自動調整する */
  dynamicRes: true,
  /** 解像度を下げても足りないとき、画質設定そのものを自動で落とす */
  perfMode: false,
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

  /** すべて既定値へ戻し、購読者へ通知する */
  reset() {
    this.values = { ...DEFAULTS };
    this.save();
    for (const k of Object.keys(DEFAULTS)) {
      for (const fn of this.listeners) fn(k, this.values[k]);
    }
  }

  /** 端末に応じた初期画質を推定する */
  static suggestQuality() {
    const dm = navigator.deviceMemory || 4;
    const hc = navigator.hardwareConcurrency || 4;
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    // 端末性能は事前に当てられない。実際のフレーム時間を見て
    // エンジン側の動的解像度が上下させるので、推奨値は強気に取る。
    if (mobile) return (dm >= 6 && hc >= 6) ? 'high' : 'medium';
    if (dm >= 8 && hc >= 8) return 'ultra';
    if (dm >= 4) return 'high';
    return 'medium';
  }
}

export { DEFAULTS };
