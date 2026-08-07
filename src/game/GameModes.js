import * as THREE from 'three';

/**
 * ゲームモード定義。
 * 各モードは start / update / onKill / isOver / getResult を実装する。
 */

class BaseMode {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.timeLimit = cfg.timeLimit ?? 600;
    this.remaining = this.timeLimit;
    this.scores = { A: 0, B: 0 };
    this.over = false;
    this.winner = null;
  }
  start() { this.remaining = this.timeLimit; this.scores = { A: 0, B: 0 }; this.over = false; }
  update(dt) {
    if (this.over) return;
    this.remaining -= dt;
    if (this.remaining <= 0) { this.remaining = 0; this._finish(); }
  }
  onKill() {}
  isOver() { return this.over; }
  getScores() { return { ...this.scores, remaining: this.remaining, limit: this.cfg.scoreLimit }; }
  _finish() {
    this.over = true;
    this.winner = this.scores.A === this.scores.B ? 'draw' : (this.scores.A > this.scores.B ? 'A' : 'B');
  }
  getResult() {
    const s = this.game.playerStats;
    return {
      mode: this.cfg.nameJa,
      winner: this.winner,
      playerTeam: s.team,
      victory: this.winner === s.team,
      draw: this.winner === 'draw',
      scores: { ...this.scores },
      player: { kills: s.kills, deaths: s.deaths, score: s.score, bestStreak: s.bestStreak },
    };
  }
}

/* ---------------- チームデスマッチ ---------------- */
class TeamDeathmatch extends BaseMode {
  onKill(team) {
    if (this.over) return;
    this.scores[team] = (this.scores[team] || 0) + 1;
    if (this.scores[team] >= this.cfg.scoreLimit) {
      this.over = true;
      this.winner = team;
    }
  }
}

/* ---------------- フリーフォーオール ---------------- */
class FreeForAll extends BaseMode {
  start() {
    super.start();
    this.playerScore = 0;
    this.botScores = new Map();
  }
  onKill(team, byPlayer) {
    if (this.over) return;
    if (byPlayer) {
      this.playerScore++;
      if (this.playerScore >= this.cfg.scoreLimit) { this.over = true; this.winner = 'player'; }
    }
  }
  getScores() {
    return { A: this.playerScore, B: Math.max(0, ...[...this.botScores.values()], 0), remaining: this.remaining, limit: this.cfg.scoreLimit };
  }
  getResult() {
    const r = super.getResult();
    r.victory = this.winner === 'player';
    return r;
  }
}

/* ---------------- 支配（ドミネーション） ---------------- */
class Domination extends BaseMode {
  start() {
    super.start();
    const objs = this.game.builder.objectives;
    this.zones = objs.map((o) => ({
      id: o.id, pos: o.pos.clone(), radius: o.radius,
      owner: null, progress: 0, contested: false,
    }));
    this._tick = 0;
  }

  update(dt) {
    super.update(dt);
    if (this.over) return;

    const _v = new THREE.Vector3();
    for (const z of this.zones) {
      // 各チームの人数を数える
      let a = 0, b = 0;
      if (this.game.playerStats.alive) {
        const d = this.game.player.position.distanceTo(z.pos);
        if (d < z.radius) (this.game.playerStats.team === 'A' ? a++ : b++);
      }
      for (const bot of this.game.bots) {
        if (!bot.alive) continue;
        if (bot.char.position.distanceTo(z.pos) < z.radius) (bot.team === 'A' ? a++ : b++);
      }

      z.contested = a > 0 && b > 0;
      if (z.contested || (a === 0 && b === 0)) continue;

      const capTeam = a > 0 ? 'A' : 'B';
      const rate = 0.34 * Math.min(3, a + b);
      if (z.owner === capTeam) {
        z.progress = Math.min(1, z.progress + rate * dt);
      } else {
        z.progress -= rate * dt;
        if (z.progress <= 0) { z.owner = capTeam; z.progress = 0.02; }
      }
    }

    // 所有拠点数に応じて加点
    this._tick += dt;
    if (this._tick >= 1) {
      this._tick -= 1;
      for (const z of this.zones) {
        if (z.owner && z.progress > 0.99) this.scores[z.owner] = (this.scores[z.owner] || 0) + 1;
      }
      for (const t of ['A', 'B']) {
        if (this.scores[t] >= this.cfg.scoreLimit) { this.over = true; this.winner = t; }
      }
    }
  }

  getScores() {
    return {
      ...this.scores, remaining: this.remaining, limit: this.cfg.scoreLimit,
      zones: this.zones.map((z) => ({ id: z.id, owner: z.owner, progress: z.progress, contested: z.contested })),
    };
  }
}

/* ---------------- キル確定（キルコンファームド） ---------------- */
class KillConfirmed extends TeamDeathmatch {
  start() {
    super.start();
    this.tags = [];   // {pos, team, t}
  }
  onKill(team, byPlayer, victimPos) {
    // ドッグタグを落とす（拾って初めて加点）
    if (victimPos) this.tags.push({ pos: victimPos.clone(), team: team === 'A' ? 'B' : 'A', t: 0 });
  }
  update(dt) {
    super.update(dt);
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const tag = this.tags[i];
      tag.t += dt;
      if (tag.t > 22) { this.tags.splice(i, 1); continue; }
      if (this.game.playerStats.alive && this.game.player.position.distanceTo(tag.pos) < 1.6) {
        const t = this.game.playerStats.team;
        this.scores[t] = (this.scores[t] || 0) + (tag.team === t ? 0 : 1);
        this.tags.splice(i, 1);
      }
    }
  }
}

/* ---------------- 捜索と破壊（ラウンド制） ---------------- */
class SearchAndDestroy extends BaseMode {
  start() {
    super.start();
    this.round = 1;
    this.roundTime = this.cfg.roundTime ?? 100;
    this.remaining = this.roundTime;
    this.roundsWon = { A: 0, B: 0 };
    this.planted = false;
    this.plantTimer = 0;
  }
  update(dt) {
    if (this.over) return;
    this.remaining -= dt;
    if (this.planted) {
      this.plantTimer -= dt;
      if (this.plantTimer <= 0) this._endRound('B');
    } else if (this.remaining <= 0) {
      this._endRound('A');
    }
  }
  _endRound(winner) {
    this.roundsWon[winner]++;
    this.scores = { ...this.roundsWon };
    if (this.roundsWon[winner] >= this.cfg.roundsToWin) {
      this.over = true; this.winner = winner;
    } else {
      this.round++;
      this.remaining = this.roundTime;
      this.planted = false;
    }
  }
  getScores() {
    return { ...this.roundsWon, remaining: this.remaining, limit: this.cfg.roundsToWin, round: this.round, planted: this.planted };
  }
}

/* ---------------- ガンゲーム ---------------- */
class GunGame extends BaseMode {
  start() {
    super.start();
    this.ladder = this.cfg.ladder || ['pistol', 'mp5', 'm4a1', 'ak47', 'shotgun', 'sniper'];
    this.level = 0;
    this._applyWeapon();
  }
  _applyWeapon() {
    const id = this.ladder[Math.min(this.level, this.ladder.length - 1)];
    this.game.weapons.setLoadout([id], {});
  }
  onKill(team, byPlayer) {
    if (!byPlayer || this.over) return;
    this.level++;
    if (this.level >= this.ladder.length) { this.over = true; this.winner = this.game.playerStats.team; return; }
    this._applyWeapon();
  }
  getScores() {
    return { A: this.level, B: 0, remaining: this.remaining, limit: this.ladder.length, weapon: this.ladder[Math.min(this.level, this.ladder.length - 1)] };
  }
}

/* ================================================================= */

export const GAME_MODES = {
  tdm: {
    id: 'tdm',
    name: 'TEAM DEATHMATCH',
    nameJa: 'チームデスマッチ',
    desc: '2チームに分かれて撃ち合う基本ルール。先に規定キル数へ到達したチームの勝利。',
    icon: '⚔',
    cfg: { scoreLimit: 75, timeLimit: 600 },
    create(game) { return new TeamDeathmatch(game, { ...this.cfg, nameJa: this.nameJa }); },
  },
  ffa: {
    id: 'ffa',
    name: 'FREE FOR ALL',
    nameJa: 'フリーフォーオール',
    desc: '全員が敵。個人技が全て。規定キル数に最初に到達した者が勝つ。',
    icon: '☠',
    cfg: { scoreLimit: 30, timeLimit: 480 },
    create(game) { return new FreeForAll(game, { ...this.cfg, nameJa: this.nameJa }); },
  },
  dom: {
    id: 'dom',
    name: 'DOMINATION',
    nameJa: 'ドミネーション',
    desc: '3つの拠点を確保し続けてポイントを稼ぐ。維持した拠点数だけ毎秒加点される。',
    icon: '⚑',
    cfg: { scoreLimit: 200, timeLimit: 720 },
    create(game) { return new Domination(game, { ...this.cfg, nameJa: this.nameJa }); },
  },
  kc: {
    id: 'kc',
    name: 'KILL CONFIRMED',
    nameJa: 'キルコンファームド',
    desc: '倒しただけでは加点されない。落ちたドッグタグを回収して初めてキルが確定する。',
    icon: '⬢',
    cfg: { scoreLimit: 50, timeLimit: 600 },
    create(game) { return new KillConfirmed(game, { ...this.cfg, nameJa: this.nameJa }); },
  },
  snd: {
    id: 'snd',
    name: 'SEARCH & DESTROY',
    nameJa: '捜索と破壊',
    desc: 'リスポーン無しのラウンド制。攻撃側は爆弾設置、防衛側は阻止を目指す。',
    icon: '✱',
    cfg: { roundsToWin: 4, roundTime: 100, timeLimit: 1800 },
    create(game) { return new SearchAndDestroy(game, { ...this.cfg, nameJa: this.nameJa }); },
  },
  gungame: {
    id: 'gungame',
    name: 'GUN GAME',
    nameJa: 'ガンゲーム',
    desc: 'キルするたび武器が変わる。全ての武器で1キットずつ倒し切れば勝利。',
    icon: '⟐',
    cfg: { timeLimit: 600, ladder: ['pistol', 'mp5', 'm4a1', 'ak47', 'shotgun', 'sniper'] },
    create(game) { return new GunGame(game, { ...this.cfg, nameJa: this.nameJa }); },
  },
};

export const MODE_LIST = Object.values(GAME_MODES);
