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
    /*
     * start() を呼ぶまでは更新も採点もしない。
     * 生成から start() までの間に update / getScores が呼ばれても
     * 壊れないようにするための番人。
     */
    this.ready = false;
  }
  start() {
    this.remaining = this.timeLimit;
    this.scores = { A: 0, B: 0 };
    this.over = false;
    this.ready = true;
  }
  update(dt) {
    if (this.over || !this.ready) return;
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
  onKill(e) {
    if (this.over) return;
    const team = e.killerTeam;
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

  /**
   * 全員が敵。プレイヤーだけでなくボットのキルも数える。
   * 以前はプレイヤーのキルしか記録していなかったため、
   * 「規定キル数に最初に到達した者が勝つ」という規則が成立せず、
   * 相手側はいくら倒しても永久に 0 点のままだった。
   */
  onKill(e) {
    if (this.over) return;
    if (e.byPlayer) {
      this.playerScore++;
      if (this.playerScore >= this.cfg.scoreLimit) { this.over = true; this.winner = 'player'; }
      return;
    }
    const k = e.killer;
    if (!k || k === this.game.playerStats) return;
    const n = (this.botScores.get(k) || 0) + 1;
    this.botScores.set(k, n);
    if (n >= this.cfg.scoreLimit) { this.over = true; this.winner = 'bot'; this.topBot = k; }
  }

  getScores() {
    let top = 0;
    for (const v of (this.botScores?.values() || [])) if (v > top) top = v;
    return { A: this.playerScore || 0, B: top, remaining: this.remaining, limit: this.cfg.scoreLimit };
  }

  _finish() {
    // 時間切れ: 最多キルの者が勝ち
    let top = 0;
    for (const v of this.botScores.values()) if (v > top) top = v;
    this.over = true;
    this.winner = this.playerScore > top ? 'player' : (this.playerScore === top ? 'draw' : 'bot');
  }

  getResult() {
    const r = super.getResult();
    r.victory = this.winner === 'player';
    r.draw = this.winner === 'draw';
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
    if (this.over || !this.ready) return;

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
      zones: (this.zones || []).map((z) => ({ id: z.id, owner: z.owner, progress: z.progress, contested: z.contested })),
    };
  }
}

/* ---------------- キル確定（キルコンファームド） ---------------- */
/**
 * 倒すだけでは加点されず、落ちたドッグタグを回収して初めて確定する。
 *
 * 以前は onKill が座標を受け取れずタグが 1 つも落ちなかったため、
 * 双方のスコアが 0 のまま時間切れになるだけのモードだった。
 * 併せて、タグを画面に見せる（回収位置がわからないと成立しない）。
 */
class KillConfirmed extends BaseMode {
  start() {
    super.start();
    this.tags = [];   // {pos, team, t, mesh}
  }

  onKill(e) {
    if (this.over || !e.victimPos) return;
    // タグの所属は「倒された側」。敵のタグを拾えば加点、味方のタグは敵の加点を防ぐ。
    this.tags.push({
      pos: e.victimPos.clone().setY(e.victimPos.y + 0.12),
      team: e.victimTeam,
      t: 0,
      mesh: this._makeTag(e.victimTeam),
    });
  }

  _makeTag(team) {
    const g = new THREE.PlaneGeometry(0.34, 0.34);
    const m = new THREE.MeshBasicMaterial({
      color: team === 'A' ? 0x4a90d9 : 0xd9482f,
      transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 900;
    this.game.engine.scene.add(mesh);
    return mesh;
  }

  _dropTag(i) {
    const tag = this.tags[i];
    if (tag.mesh) {
      this.game.engine.scene.remove(tag.mesh);
      tag.mesh.geometry.dispose();
      tag.mesh.material.dispose();
    }
    this.tags.splice(i, 1);
  }

  update(dt) {
    super.update(dt);
    if (this.over || !this.ready) return;

    const ps = this.game.playerStats;
    const cam = this.game.engine.camera;

    for (let i = this.tags.length - 1; i >= 0; i--) {
      const tag = this.tags[i];
      tag.t += dt;
      if (tag.t > 24) { this._dropTag(i); continue; }

      if (tag.mesh) {
        // 上下にゆっくり漂わせ、常にカメラを向ける（見つけやすさ優先）
        tag.mesh.position.set(tag.pos.x, tag.pos.y + 0.55 + Math.sin(tag.t * 2.2) * 0.06, tag.pos.z);
        tag.mesh.quaternion.copy(cam.quaternion);
        tag.mesh.material.opacity = tag.t > 20 ? 0.95 * (1 - (tag.t - 20) / 4) : 0.95;
      }

      // プレイヤーの回収
      if (ps.alive && this.game.player.position.distanceTo(tag.pos) < 1.8) {
        this._collect(tag, ps.team);
        this._dropTag(i);
        continue;
      }
      // ボットの回収
      let taken = false;
      for (const b of this.game.bots) {
        if (!b.alive) continue;
        if (b.char.position.distanceTo(tag.pos) < 1.6) { this._collect(tag, b.team); taken = true; break; }
      }
      if (taken) this._dropTag(i);
    }
  }

  /** タグを拾ったチームへ加点する（敵のタグのみ得点になる） */
  _collect(tag, byTeam) {
    if (tag.team === byTeam) return;   // 味方のタグは回収するだけ（敵の加点を防ぐ）
    this.scores[byTeam] = (this.scores[byTeam] || 0) + 1;
    if (this.scores[byTeam] >= this.cfg.scoreLimit) { this.over = true; this.winner = byTeam; }
  }

  getScores() {
    return {
      ...this.scores, remaining: this.remaining, limit: this.cfg.scoreLimit,
      tags: (this.tags || []).length,
    };
  }

  dispose() { while (this.tags.length) this._dropTag(this.tags.length - 1); }
}

/* ---------------- 捜索と破壊（ラウンド制） ---------------- */
/**
 * リスポーン無しのラウンド制。攻撃側は爆弾設置、防衛側は阻止。
 *
 * 以前は planted を true にする経路が存在せず、
 * 「時間切れで必ず防衛側の勝ち」を繰り返すだけだった。
 * 設置・解除・導火線・攻守交代を実装して成立させる。
 */
class SearchAndDestroy extends BaseMode {
  start() {
    super.start();
    this.round = 1;
    this.roundTime = this.cfg.roundTime ?? 100;
    this.fuseTime = this.cfg.fuseTime ?? 45;
    this.plantTime = this.cfg.plantTime ?? 3.0;
    this.defuseTime = this.cfg.defuseTime ?? 4.5;
    this.remaining = this.roundTime;
    this.roundsWon = { A: 0, B: 0 };
    this.planted = false;
    this.plantTimer = 0;
    this.progress = 0;          // 設置／解除の進行度（0..1）
    this.action = null;         // 'plant' | 'defuse' | null
    this._roundEnding = 0;

    // 爆破目標は中央の拠点を使う
    const objs = this.game.builder.objectives;
    const site = objs[Math.floor(objs.length / 2)] || objs[0];
    this.site = {
      pos: site ? site.pos.clone() : new THREE.Vector3(),
      // 目標そのものの広さを使う。狭すぎると足がわずかにずれただけで
      // 設置が止まり、何度やっても終わらない。
      radius: Math.max(3.5, (site?.radius ?? 4) + 1.0),
    };
    this._setSides();
  }

  /** ラウンドごとに攻守を入れ替える（奇数ラウンドはプレイヤー側が攻撃） */
  _setSides() {
    const playerTeam = this.game.playerStats.team;
    const other = playerTeam === 'A' ? 'B' : 'A';
    const playerAttacks = this.round % 2 === 1;
    this.attackers = playerAttacks ? playerTeam : other;
    this.defenders = playerAttacks ? other : playerTeam;
  }

  /** ラウンド中は復活しない */
  allowRespawn() { return false; }

  update(dt) {
    if (this.over || !this.ready) return;

    // ラウンド間の間（次ラウンドの準備）
    if (this._roundEnding > 0) {
      this._roundEnding -= dt;
      if (this._roundEnding <= 0) this._beginRound();
      return;
    }

    if (this.planted) {
      this.plantTimer -= dt;
      this._updateDefuse(dt);
      if (this.plantTimer <= 0) this._endRound(this.attackers);
      return;
    }

    this.remaining -= dt;
    this._updatePlant(dt);

    if (this.remaining <= 0) this._endRound(this.defenders);
    else if (this._sideWipedOut(this.attackers)) this._endRound(this.defenders);
    else if (this._sideWipedOut(this.defenders)) this._endRound(this.attackers);
  }

  /** その陣営が全滅したか */
  _sideWipedOut(team) {
    if (this.game.playerStats.team === team && this.game.playerStats.alive) return false;
    for (const b of this.game.bots) if (b.team === team && b.alive) return false;
    return true;
  }

  /**
   * 目標地点の中に居るか。
   * 高さは 3m まで許容する。段差の上下で判定が切れると、
   * 押し続けているのに進行が止まる理由が分からず理不尽になる。
   */
  _onSite(pos) {
    const dx = pos.x - this.site.pos.x, dz = pos.z - this.site.pos.z;
    if (Math.abs(pos.y - this.site.pos.y) > 3) return false;
    return dx * dx + dz * dz < this.site.radius * this.site.radius;
  }

  /** 爆弾設置。攻撃側が目標地点で「使用」を押し続ける。 */
  _updatePlant(dt) {
    const ps = this.game.playerStats;
    const onSite = (pos) => this._onSite(pos);

    // プレイヤーが攻撃側なら手動設置
    if (ps.team === this.attackers && ps.alive && onSite(this.game.player.position)
        && this.game.input.down('interact')) {
      this.action = 'plant';
      this.progress = Math.min(1, this.progress + dt / this.plantTime);
      if (this.progress >= 1) this._plant();
      return;
    }

    // ボットが攻撃側なら、目標に留まっている間に自動で進行する
    let botOnSite = 0;
    for (const b of this.game.bots) {
      if (b.alive && b.team === this.attackers && onSite(b.char.position)) botOnSite++;
    }
    if (botOnSite > 0) {
      this.action = 'plant';
      this.progress = Math.min(1, this.progress + dt / (this.plantTime * 2.2));
      if (this.progress >= 1) this._plant();
      return;
    }

    this.action = null;
    this.progress = Math.max(0, this.progress - dt * 0.25);
  }

  /** 爆弾解除。防衛側が同じ操作で行う。 */
  _updateDefuse(dt) {
    const ps = this.game.playerStats;
    const onSite = (pos) => this._onSite(pos);

    if (ps.team === this.defenders && ps.alive && onSite(this.game.player.position)
        && this.game.input.down('interact')) {
      this.action = 'defuse';
      this.progress = Math.min(1, this.progress + dt / this.defuseTime);
      if (this.progress >= 1) this._endRound(this.defenders);
      return;
    }

    let botOnSite = 0;
    for (const b of this.game.bots) {
      if (b.alive && b.team === this.defenders && onSite(b.char.position)) botOnSite++;
    }
    if (botOnSite > 0) {
      this.action = 'defuse';
      this.progress = Math.min(1, this.progress + dt / (this.defuseTime * 2.4));
      if (this.progress >= 1) this._endRound(this.defenders);
      return;
    }

    this.action = null;
    this.progress = Math.max(0, this.progress - dt * 0.22);
  }

  _plant() {
    this.planted = true;
    this.plantTimer = this.fuseTime;
    this.progress = 0;
    this.action = null;
    this.game.onAnnounce?.('爆弾設置', '導火線作動');
  }

  _endRound(winner) {
    this.roundsWon[winner]++;
    this.scores = { ...this.roundsWon };
    if (this.roundsWon[winner] >= this.cfg.roundsToWin) {
      this.over = true;
      this.winner = winner;
      return;
    }
    this.round++;
    this._roundEnding = 4.0;   // 次ラウンドまでの間
  }

  /** 次ラウンドを始める。全員を復活させ、攻守を入れ替える。 */
  _beginRound() {
    this._setSides();
    this.remaining = this.roundTime;
    this.planted = false;
    this.plantTimer = 0;
    this.progress = 0;
    this.action = null;
    this.game.respawnAll?.();
  }

  getScores() {
    if (!this.ready) return { A: 0, B: 0, remaining: this.remaining, limit: this.cfg.roundsToWin };
    return {
      ...this.roundsWon,
      remaining: this.planted ? this.plantTimer : this.remaining,
      limit: this.cfg.roundsToWin,
      round: this.round, planted: this.planted,
      attackers: this.attackers, defenders: this.defenders,
      action: this.action, progress: this.progress,
      site: this.site ? { x: this.site.pos.x, z: this.site.pos.z } : null,
    };
  }
}

/* ---------------- ガンゲーム ---------------- */
class GunGame extends BaseMode {
  start() {
    super.start();
    this.ladder = this.cfg.ladder || ['pistol', 'mp5', 'm4a1', 'ak47', 'shotgun', 'sniper'];
    this.level = 0;
    // ボットも同じ梯子を上る（相手が居ないと競争にならない）
    this.botLevels = new Map();
    this._applyWeapon();
  }

  _applyWeapon() {
    const id = this.ladder[Math.min(this.level, this.ladder.length - 1)];
    // 予備弾を潤沢にしておく（キットごとに弾切れで詰まないように）
    this.game.weapons.setLoadout([id], {});
    const a = this.game.weapons.ammo[id];
    if (a) a.reserve = Math.max(a.reserve, 120);
  }

  onKill(e) {
    if (this.over) return;
    if (e.byPlayer) {
      this.level++;
      if (this.level >= this.ladder.length) {
        this.over = true;
        this.winner = this.game.playerStats.team;
        return;
      }
      this._applyWeapon();
      return;
    }
    // ボット側の進行
    const k = e.killer;
    if (!k || k === this.game.playerStats) return;
    const n = (this.botLevels.get(k) || 0) + 1;
    this.botLevels.set(k, n);
    if (n >= this.ladder.length) { this.over = true; this.winner = 'bot'; }
  }

  _finish() {
    let top = 0;
    for (const v of this.botLevels.values()) if (v > top) top = v;
    this.over = true;
    this.winner = this.level > top ? this.game.playerStats.team
      : (this.level === top ? 'draw' : 'bot');
  }

  getScores() {
    let top = 0;
    for (const v of (this.botLevels?.values() || [])) if (v > top) top = v;
    return {
      A: this.level || 0, B: top, remaining: this.remaining, limit: this.ladder.length,
      weapon: this.ladder[Math.min(this.level, this.ladder.length - 1)],
    };
  }

  getResult() {
    const r = super.getResult();
    r.victory = this.winner === this.game.playerStats.team;
    r.draw = this.winner === 'draw';
    return r;
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
    cfg: { roundsToWin: 4, roundTime: 100, fuseTime: 45, plantTime: 3.0, defuseTime: 4.5, timeLimit: 1800 },
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
