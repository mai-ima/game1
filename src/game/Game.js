import * as THREE from 'three';
import { Physics, SURFACE } from '../world/Physics.js';
import { MapBuilder } from '../world/MapBuilder.js';
import { PlayerController } from '../player/PlayerController.js';
import { WeaponSystem } from '../player/WeaponSystem.js';
import { Effects } from '../render/Effects.js';
import { Bot, DIFFICULTY } from '../ai/Bot.js';
import { HIT_ZONE } from '../ai/Character.js';
import { damageAt, WEAPONS } from '../player/weapons/WeaponDefs.js';
import { GAME_MODES } from './GameModes.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * 試合全体を統括するコントローラ。
 * マップ・プレイヤー・ボット・ゲームモード・エフェクトを繋ぐ。
 */
export class Game {
  /**
   * @param {object} ctx {engine, mats, input, audio}
   */
  constructor(ctx) {
    this.engine = ctx.engine;
    this.mats = ctx.mats;
    this.input = ctx.input;
    this.audio = ctx.audio;

    this.physics = new Physics(4);
    this.effects = new Effects(this.engine, this.physics);

    this.player = new PlayerController(this.engine, this.physics, this.input);
    this.player.baseFov = 80;
    this.weapons = new WeaponSystem(this.engine, this.physics, this.input, this.player, this.mats);

    this.bots = [];
    this.builder = null;
    this.mapInfo = null;
    this.mode = null;

    this.time = 0;
    this.running = false;
    this.paused = false;
    this.matchOver = false;

    // プレイヤーの状態
    this.playerStats = {
      name: 'あなた', team: 'A', hp: 100, maxHp: 100,
      kills: 0, deaths: 0, assists: 0, score: 0,
      streak: 0, bestStreak: 0, alive: false,
    };
    this._regenT = 0;
    this._respawnT = 0;
    this._damageFlash = 0;
    this._lastDamageDir = new THREE.Vector3();

    // イベント（UI へ通知）
    this.onKill = null;          // (killer, victim, weapon, headshot)
    this.onPlayerDamage = null;  // (amount, fromDir)
    this.onPlayerDeath = null;
    this.onPlayerSpawn = null;
    this.onHitmarker = null;     // (isKill, isHead)
    this.onScoreChange = null;
    this.onMatchEnd = null;
    this.onAnnounce = null;      // (text, subtext)

    this._wireWeapon();
  }

  /* ================= 構築 ================= */

  /**
   * マップを読み込む。
   * @param {{build:Function, MAP_INFO:object}} mapModule
   */
  async loadMap(mapModule, onProgress = () => {}) {
    this.mapInfo = mapModule.MAP_INFO;
    onProgress(0.05, 'レベルを構築中');

    this.engine.setSunAngle(this.mapInfo.sun.elevation, this.mapInfo.sun.azimuth);
    this.engine.refreshEnvironment();
    this.engine.scene.environmentIntensity = 0.40;
    this.mats.applyEnvironment(this.engine.envRT.texture, 1.0);
    this.engine.scene.fog = new THREE.Fog(this.mapInfo.fog.color, this.mapInfo.fog.near, this.mapInfo.fog.far);

    this.builder = new MapBuilder(this.engine.scene, this.physics, this.mats);
    mapModule.build(this.builder);

    onProgress(0.55, 'マテリアルを生成中');
    await nextFrame();
    this.builder.finalize();

    // 巡回点を生成（スポーン地点 + 目標地点 + グリッド）
    this._buildPatrolPoints();
    onProgress(0.9, '完了');
  }

  _buildPatrolPoints() {
    this.patrolPoints = [];
    const b = this.builder;
    for (const k of ['A', 'B']) {
      for (const s of b.spawnPoints[k] || []) this.patrolPoints.push(s.pos.clone());
    }
    for (const o of b.objectives) this.patrolPoints.push(o.pos.clone());

    // マップ上に格子状に候補を撒き、床がある場所だけ残す
    const R = 30;
    for (let x = -R; x <= R; x += 6) {
      for (let z = -R; z <= R; z += 6) {
        const p = _v.set(x, 6, z);
        const hit = this.physics.raycast(p, _v2.set(0, -1, 0), 12, { forBullets: false });
        if (hit && hit.point.y < 4.5) {
          this.patrolPoints.push(new THREE.Vector3(x, hit.point.y, z));
        }
      }
    }
  }

  /**
   * 試合を開始する。
   * @param {object} cfg {mode, difficulty, botCount, loadout, attachments}
   */
  start(cfg = {}) {
    const modeId = cfg.mode || 'tdm';
    this.mode = GAME_MODES[modeId].create(this);
    this.difficulty = cfg.difficulty || 'regular';

    this.playerStats.kills = 0;
    this.playerStats.deaths = 0;
    this.playerStats.score = 0;
    this.playerStats.streak = 0;
    this.playerStats.bestStreak = 0;

    // 武器
    const lo = cfg.loadout || { primary: 'm4a1', secondary: 'pistol' };
    this.weapons.setLoadout([lo.primary, lo.secondary], cfg.attachments || {});

    // ボット生成
    this._spawnBots(cfg.botCount ?? 7, cfg.botWeapons);

    this.time = 0;
    this.matchOver = false;
    this.running = true;
    this.paused = false;

    this.mode.start();
    this.respawnPlayer(true);
  }

  _spawnBots(total, botWeapons) {
    for (const b of this.bots) b.dispose();
    this.bots.length = 0;

    const pool = botWeapons || ['m4a1', 'ak47', 'mp5', 'ak47', 'm4a1', 'shotgun', 'mp5', 'sniper'];
    const names = ['ヴィクター', 'ブラボー', 'デルタ', 'エコー', 'フォックス', 'ゴースト', 'ホーク', 'アイリス', 'ジャッカル', 'キロ', 'ライナ', 'マーロウ'];

    // 敵チーム（B）を多め、味方（A）も少し入れる
    const enemyCount = Math.ceil(total * 0.6);
    const allyCount = total - enemyCount;

    for (let i = 0; i < enemyCount; i++) {
      const bot = new Bot(
        { scene: this.engine.scene, physics: this.physics, effects: this.effects, mats: this.mats, game: this },
        { team: 'B', difficulty: this.difficulty, weaponId: pool[i % pool.length], name: names[i % names.length] }
      );
      this.bots.push(bot);
    }
    for (let i = 0; i < allyCount; i++) {
      const bot = new Bot(
        { scene: this.engine.scene, physics: this.physics, effects: this.effects, mats: this.mats, game: this },
        { team: 'A', difficulty: this.difficulty, weaponId: pool[(i + 3) % pool.length], name: names[(i + 6) % names.length] }
      );
      this.bots.push(bot);
    }

    for (const bot of this.bots) this.respawnBot(bot, true);
  }

  /* ================= スポーン ================= */

  /** チームのスポーン地点から、敵から遠いものを選ぶ */
  pickSpawn(team) {
    const list = this.builder.spawnPoints[team] || this.builder.spawnPoints.FFA;
    if (!list || !list.length) return { pos: new THREE.Vector3(0, 1, 0), yaw: 0 };

    let best = list[0], bestScore = -Infinity;
    for (const s of list) {
      let minDist = Infinity;
      for (const e of this.enemiesOf(team)) {
        if (!e.alive) continue;
        const ep = e.getEyePosition ? e.getEyePosition(_v) : _v.copy(e.position);
        minDist = Math.min(minDist, s.pos.distanceTo(ep));
      }
      if (minDist === Infinity) minDist = 999;
      const score = minDist + Math.random() * 6;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  respawnPlayer(instant = false) {
    const s = this.pickSpawn(this.playerStats.team);
    this.player.spawn(s.pos.clone().setY(s.pos.y + 0.05), s.yaw);
    this.playerStats.hp = this.playerStats.maxHp;
    this.playerStats.alive = true;
    this.playerStats.streak = 0;
    this.player.alive = true;
    this.player.enabled = true;
    this.weapons.enabled = true;
    this.weapons.equip(0, true);
    const id = this.weapons.loadout[0];
    if (id) this.weapons.ammo[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserveAmmo };
    this._respawnT = 0;
    this._damageFlash = 0;
    this.onPlayerSpawn?.();
  }

  respawnBot(bot, instant = false) {
    const s = this.pickSpawn(bot.team);
    bot.spawn(s.pos.clone(), s.yaw);
  }

  /** 指定チームの敵を列挙（プレイヤーを含む） */
  *enemiesOf(team) {
    if (this.playerStats.team !== team && this.playerStats.alive) {
      yield this._playerAsTarget();
    }
    for (const b of this.bots) {
      if (b.team !== team && b.alive) yield b;
    }
  }

  /** ボットから見たプレイヤーの疑似ターゲット */
  _playerAsTarget() {
    this._pt ??= {
      isPlayer: true,
      position: this.player.position,
      velocity: this.player.velocity,
      alive: true,
      getEyePosition: (out) => this.player.getEyePosition(out),
      char: null,
    };
    this._pt.position = this.player.position;
    this._pt.velocity = this.player.velocity;
    this._pt.alive = this.playerStats.alive;
    return this._pt;
  }

  /** ボットの巡回目標 */
  randomPatrolPoint(from) {
    if (!this.patrolPoints?.length) return null;
    for (let i = 0; i < 8; i++) {
      const p = this.patrolPoints[Math.floor(Math.random() * this.patrolPoints.length)];
      if (p.distanceToSquared(from) > 64) return p.clone();
    }
    return this.patrolPoints[Math.floor(Math.random() * this.patrolPoints.length)].clone();
  }

  /* ================= 射撃解決 ================= */

  _wireWeapon() {
    // プレイヤーの弾がキャラクタに当たるかを WeaponSystem へ供給する
    this.weapons.characterRaycast = (origin, dir, maxDist) => {
      let best = null;
      for (const b of this.bots) {
        if (!b.alive || b.team === this.playerStats.team) continue;
        const h = b.char.raycast(origin, dir, maxDist);
        if (h && (!best || h.dist < best.dist)) best = h;
      }
      return best;
    };

    this.weapons.onFire = (def, origin, dir, muzzle, hits, stats) => {
      // マズルフラッシュ（ビューモデル側の銃口に合わせる）
      if (!stats.hideMuzzleFlash) {
        const local = this.weapons.model
          ? this.weapons.model.anchors.muzzle.clone().applyMatrix4(this.weapons.model.root.matrix)
          : null;
        this.effects.muzzleFlash(muzzle, def.class.includes('ショットガン') ? 1.5 : 1.0, local);
      }
      // 曳光弾（数発に1発）
      const pellets = def.pellets || 1;
      for (const h of hits) {
        if (Math.random() < (pellets > 1 ? 0.35 : 0.42)) {
          this.effects.tracer(muzzle, h.point, def.muzzleVelocity);
        }
      }
      if (hits.length === 0) {
        const end = _v.copy(origin).addScaledVector(dir, 90);
        if (Math.random() < 0.4) this.effects.tracer(muzzle, end, def.muzzleVelocity);
      }
      // 排莢
      const right = _v2.set(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
      const ejectPos = this.player.getEyePosition(_v).addScaledVector(right, 0.16).add(new THREE.Vector3(0, -0.12, 0));
      this.effects.ejectCasing(ejectPos, right, this.player.velocity);

      this.audio?.playShot(def, muzzle, stats.silent);
    };

    this.weapons.onHit = (info) => {
      if (info.type === 'world') {
        this.effects.impact(info.point, info.normal, info.surface);
        this.audio?.playImpact(info.surface, info.point);
      } else {
        const bot = info.target;
        this.effects.bloodImpact(info.point, info.normal, info.zone === HIT_ZONE.HEAD);
        const killed = bot.damage(info.damage, this._playerAsTarget(), info.zone);
        this.onHitmarker?.(killed, info.zone === HIT_ZONE.HEAD);
        this.audio?.playHitmarker(killed, info.zone === HIT_ZONE.HEAD);
        if (killed) this._registerKill(this.playerStats, bot, this.weapons.def, info.zone === HIT_ZONE.HEAD);
      }
    };

    this.weapons.onReloadStart = (def, empty) => this.audio?.playReload(def, empty);
    this.weapons.onSwap = (def) => this.audio?.playSwap(def);
    this.weapons.onDryFire = () => this.audio?.playDryFire();
  }

  /** ボットの発砲を解決する */
  resolveShot({ shooter, origin, dir, weapon, muzzle }) {
    // 世界との衝突
    const worldHit = this.physics.raycast(origin, dir, 200);
    // プレイヤーとの衝突
    let playerHit = null;
    if (this.playerStats.alive && shooter.team !== this.playerStats.team) {
      playerHit = this._raycastPlayer(origin, dir, 200);
    }
    // 味方誤射は無効化（同士討ち無し）
    let botHit = null;
    for (const b of this.bots) {
      if (!b.alive || b.team === shooter.team) continue;
      const h = b.char.raycast(origin, dir, 200);
      if (h && (!botHit || h.dist < botHit.dist)) botHit = h;
    }

    // 最も近いものを採用
    const cands = [];
    if (worldHit) cands.push({ t: worldHit.dist, kind: 'world', data: worldHit });
    if (playerHit) cands.push({ t: playerHit.dist, kind: 'player', data: playerHit });
    if (botHit) cands.push({ t: botHit.dist, kind: 'bot', data: botHit });
    cands.sort((a, b) => a.t - b.t);
    const first = cands[0];

    const endPoint = first ? (first.data.point) : _v.copy(origin).addScaledVector(dir, 120).clone();
    if (Math.random() < 0.5) this.effects.tracer(muzzle, endPoint, weapon.muzzleVelocity);
    this.audio?.playShot(weapon, muzzle, false, true);

    if (!first) return;

    if (first.kind === 'world') {
      this.effects.impact(first.data.point, first.data.normal, first.data.collider.surface);
      this.audio?.playImpact(first.data.collider.surface, first.data.point);
    } else if (first.kind === 'player') {
      const dmg = damageAt(weapon, first.t, first.data.zone);
      this._damagePlayer(dmg, shooter, dir, first.data.zone, weapon);
    } else {
      const bot = first.data.target;
      this.effects.bloodImpact(first.data.point, first.data.normal, first.data.zone === HIT_ZONE.HEAD);
      const dmg = damageAt(weapon, first.t, first.data.zone);
      const killed = bot.damage(dmg, shooter, first.data.zone);
      if (killed) this._registerKill(shooter, bot, weapon, first.data.zone === HIT_ZONE.HEAD);
    }
  }

  /** プレイヤーの当たり判定（立ち/しゃがみで高さが変わる） */
  _raycastPlayer(origin, dir, maxDist) {
    const p = this.player.position;
    const h = this.player.height;
    const zones = [
      { zone: HIT_ZONE.HEAD, y: h - 0.11, r: 0.14, half: 0.12 },
      { zone: HIT_ZONE.BODY, y: h * 0.68, r: 0.24, half: h * 0.20 },
      { zone: HIT_ZONE.LIMB, y: h * 0.28, r: 0.26, half: h * 0.28 },
    ];
    let best = null;
    for (const z of zones) {
      const ox = origin.x - p.x, oz = origin.z - p.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      if (a < 1e-9) continue;
      const b = 2 * (ox * dir.x + oz * dir.z);
      const c = ox * ox + oz * oz - z.r * z.r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a);
      if (t < 0) t = (-b + sq) / (2 * a);
      if (t < 0.05 || t > maxDist) continue;
      const hy = origin.y + dir.y * t;
      const cy = p.y + z.y;
      if (hy < cy - z.half || hy > cy + z.half) continue;
      if (!best || t < best.dist) {
        best = { dist: t, zone: z.zone, point: new THREE.Vector3(origin.x + dir.x * t, hy, origin.z + dir.z * t) };
      }
    }
    return best;
  }

  _damagePlayer(amount, from, dir, zone, weapon) {
    if (!this.playerStats.alive) return;
    this.playerStats.hp -= amount;
    this._regenT = 0;
    this._damageFlash = Math.min(1, this._damageFlash + amount / 55);
    this._lastDamageDir.copy(dir).setY(0).normalize();
    this.player.addShake(0.5 + amount / 120, 0.22);
    this.onPlayerDamage?.(amount, this._lastDamageDir, from);
    this.audio?.playPlayerHit();

    if (this.playerStats.hp <= 0) {
      this.playerStats.hp = 0;
      this.playerStats.alive = false;
      this.playerStats.deaths++;
      this.player.enabled = false;
      this.weapons.enabled = false;
      this._respawnT = 0;
      from.deaths ??= 0;
      this._registerKill(from, this._playerAsTarget(), weapon, zone === HIT_ZONE.HEAD, true);
      this.onPlayerDeath?.(from, weapon, zone);
    }
  }

  _registerKill(killer, victim, weapon, headshot, victimIsPlayer = false) {
    const isPlayerKiller = killer === this.playerStats || killer?.isPlayer;
    if (isPlayerKiller) {
      this.playerStats.kills++;
      this.playerStats.streak++;
      this.playerStats.bestStreak = Math.max(this.playerStats.bestStreak, this.playerStats.streak);
      this.playerStats.score += headshot ? 150 : 100;
    } else if (killer.kills !== undefined) {
      killer.kills++;
      killer.score += 100;
    }

    const killerName = isPlayerKiller ? this.playerStats.name : (killer.name || '不明');
    const victimName = victimIsPlayer ? this.playerStats.name : (victim.name || '不明');
    const killerTeam = isPlayerKiller ? this.playerStats.team : killer.team;

    this.mode?.onKill?.(killerTeam, isPlayerKiller);
    this.onKill?.({
      killerName, victimName, killerTeam,
      victimTeam: victimIsPlayer ? this.playerStats.team : victim.team,
      weapon, headshot, byPlayer: isPlayerKiller, againstPlayer: victimIsPlayer,
    });
    this.onScoreChange?.(this.mode?.getScores?.());
  }

  /* ================= 更新 ================= */

  update(dt) {
    if (!this.running || this.paused) return;
    this.time += dt;

    // --- プレイヤー ---
    if (this.playerStats.alive) {
      this.player.update(dt);
      this.weapons.update(dt);

      // 体力の自然回復（COD 系のリジェネ）
      this._regenT += dt;
      if (this._regenT > 4.2 && this.playerStats.hp < this.playerStats.maxHp) {
        this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + 32 * dt);
      }
    } else {
      this._respawnT += dt;
      if (this._respawnT > 3.2 && !this.matchOver) this.respawnPlayer();
    }

    // --- ボット ---
    for (const b of this.bots) {
      b.update(dt, this);
      if (!b.alive) {
        b.respawnTimer += 0; // update 内で加算済み
        if (b.respawnTimer > 5.5 && !this.matchOver) this.respawnBot(b);
      }
    }

    // --- エフェクト・ポスト ---
    this.effects.update(dt, this.engine.camera);
    this._updatePostFx(dt);

    // --- シャドウ追従 ---
    this.engine.updateShadowFollow(this.player.position);

    // --- ゲームモード ---
    this.mode?.update(dt);
    if (this.mode?.isOver() && !this.matchOver) {
      this.matchOver = true;
      this.onMatchEnd?.(this.mode.getResult());
    }
  }

  _updatePostFx(dt) {
    const c = this.engine.compositePass?.uniforms;
    if (!c) return;

    this._damageFlash = Math.max(0, this._damageFlash - dt * 1.8);
    c.uDamage.value = this._damageFlash;

    const hpFrac = this.playerStats.hp / this.playerStats.maxHp;
    c.uLowHealth.value = this.playerStats.alive ? Math.max(0, 1 - hpFrac / 0.45) : 0;

    // スコープ時の周辺減光
    const scoped = this.weapons.isScoped ? this.weapons.adsProgress : 0;
    c.uScopeVignette.value = scoped;

    // 速度に応じた径方向ブラー
    if (this.engine.blurPass) {
      const target = this.playerStats.alive ? this.player.getMotionBlur() : 0;
      const cur = this.engine.blurPass.uniforms.uStrength.value;
      this.engine.blurPass.uniforms.uStrength.value = cur + (target - cur) * Math.min(1, 6 * dt);
    }
  }

  /* ================= 制御 ================= */

  pause() { this.paused = true; this.input.clear(); }
  resume() { this.paused = false; }

  dispose() {
    this.running = false;
    for (const b of this.bots) b.dispose();
    this.bots.length = 0;
    this.weapons.dispose();
    this.effects.dispose();
    this.builder?.dispose();
    this.engine.scene.fog = null;
  }
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
