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
 * 同時に自機を狙えるボットの上限。
 * これを超える数に囲まれると、遮蔽へ入る間もなく削り切られてしまう。
 */


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
    /** リスポーン保護の残り時間（秒）。0 より大きい間は被弾しない。 */
    this._spawnProtect = 0;
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

    // GPU コンテキストが復帰したら、自前で作った環境マップを貼り直す
    this.engine.onContextRestored = () => {
      if (this.engine.envRT) this.mats.applyEnvironment(this.engine.envRT.texture, 1.0);
    };
  }

  /* ================= 構築 ================= */

  /**
   * マップを読み込む。
   * @param {{build:Function, MAP_INFO:object}} mapModule
   */
  async loadMap(mapModule, onProgress = () => {}) {
    this.mapInfo = mapModule.MAP_INFO;
    this.mapId = this.mapInfo.id;
    onProgress(0.05, 'レベルを構築中');

    /*
     * 前のレベルを片付ける。
     * 2 枚目以降を読むときに残しておくと、ジオメトリもコライダも
     * 二重に積み上がる（マップを切り替えるたびに重くなる）。
     */
    if (this.builder) {
      this.builder.dispose();
      this.builder = null;
      this.engine.lightPool.setDefs([]);
    }

    this.engine.setSunAngle(this.mapInfo.sun.elevation, this.mapInfo.sun.azimuth);
    this.engine.refreshEnvironment();
    // 環境マップ（青空）の効きを抑える。強いと全面が青みを帯びる。
    this.engine.scene.environmentIntensity = this.mapInfo.light?.env ?? 0.26;

    /*
     * 光の作りはレベルごとに変えられる。
     * 砂漠の廃墟は夕方寄りの暖色が似合うが、検証用の場では
     * 色が偏ると材質の色を読み違える。既定は共通の屋外設定のまま、
     * MAP_INFO.light が指定されていればそれで上書きする。
     */
    const L = this.mapInfo.light;
    this.engine.tune(L ? {
      sunColor: L.sun ?? 0xffdcae,
      sunIntensity: L.sunIntensity ?? 3.6,
      hemiSky: L.hemiSky ?? 0xa9c2d8,
      hemiGround: L.hemiGround ?? 0x8a6f4a,
      hemiIntensity: L.hemiIntensity ?? 0.26,
      fillColor: L.fillColor ?? 0xa6bacd,
      fillIntensity: L.fillIntensity ?? 0.22,
    } : {
      sunColor: 0xffdcae, sunIntensity: 3.6,
      hemiSky: 0xa9c2d8, hemiGround: 0x8a6f4a, hemiIntensity: 0.26,
      fillColor: 0xa6bacd, fillIntensity: 0.22,
    });
    this.mats.applyEnvironment(this.engine.envRT.texture, 1.0);
    this.engine.scene.fog = new THREE.Fog(this.mapInfo.fog.color, this.mapInfo.fog.near, this.mapInfo.fog.far);

    this.builder = new MapBuilder(this.engine.scene, this.physics, this.mats);
    mapModule.build(this.builder);

    onProgress(0.55, 'マテリアルを生成中');
    await nextFrame();
    this.builder.finalize();

    // 街灯や室内灯はプールへ渡す。実体になるのは近い数灯だけ
    this.engine.lightPool.setDefs(this.builder.lights);
    this.engine.fitLightCount(this.mapInfo.bounds);

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
   *
   * 兵士モデルの生成は 1 体あたり数百の頂点バッファ生成を伴うため、
   * 8 体をまとめて作ると 1 フレームが数秒〜十数秒ブロックし、
   * 端末によっては「フリーズした」ように見える（実際 iOS では
   * ウォッチドッグに落とされることもある）。
   * そのため 1 体ごとにフレームを跨いで生成し、その間もローディング画面を
   * 描き続けられるようにしている。
   *
   * @param {object} cfg {mode, difficulty, botCount, loadout, attachments}
   * @param {(p:number, label:string)=>void} onProgress 進捗通知（0..1）
   */
  async start(cfg = {}, onProgress = () => {}) {
    /*
     * 準備中は更新ループを止める。
     * start() はフレームを跨いで進むため、ここで止めておかないと
     * 「新しいモードを差し替えたが start() はまだ呼んでいない」状態で
     * update が回り、初期化前のフィールド（zones や tags）を触って
     * 毎フレーム例外になる。実際、試合を開始し直すたびに発生していた。
     */
    this.running = false;
    this.paused = false;
    this.matchOver = false;

    const modeId = cfg.mode || 'tdm';
    this.modeId = modeId;
    this.mode?.dispose?.();
    this.mode = GAME_MODES[modeId].create(this);
    // 見学モードは浮遊の切り替えを持つ。他のモードでは必ず切っておく
    this.freeCam = false;
    this.player.noclip = false;
    this.weapons.holder.visible = true;
    this.difficulty = cfg.difficulty || 'regular';

    this.playerStats.kills = 0;
    this.playerStats.deaths = 0;
    this.playerStats.score = 0;
    this.playerStats.streak = 0;
    this.playerStats.bestStreak = 0;

    // 武器
    onProgress(0.05, '装備を準備中');
    await nextFrame();
    const lo = cfg.loadout || { primary: 'm4a1', secondary: 'pistol' };
    this.weapons.setLoadout([lo.primary, lo.secondary], cfg.attachments || {});

    // ボット生成（フレームを跨ぎながら 1 体ずつ）
    await this._spawnBots(cfg.botCount ?? 7, cfg.botWeapons, onProgress);

    /*
     * 影の方針はボットを作ってから適用する。
     * マップ構築の直後だと人物がまだ居らず、部位メッシュに
     * 方針が行き渡らない（影パスの大半は人物なので効果が出ない）。
     */
    this.engine.applyShadowCasterPolicy(this.engine.lightweight);

    // 試合中のカクつきを避けるため、シェーダはここで作り切っておく
    onProgress(0.95, 'シェーダを準備中');
    await nextFrame();
    await this.engine.precompile();

    this.time = 0;
    this.matchOver = false;
    this.running = true;
    this.paused = false;

    this.mode.start();
    this.respawnPlayer(true);
  }

  async _spawnBots(total, botWeapons, onProgress = () => {}) {
    for (const b of this.bots) b.dispose();
    this.bots.length = 0;

    const pool = botWeapons || ['m4a1', 'ak47', 'mp5', 'ak47', 'm4a1', 'shotgun', 'mp5', 'sniper'];
    const names = ['ヴィクター', 'ブラボー', 'デルタ', 'エコー', 'フォックス', 'ゴースト', 'ホーク', 'アイリス', 'ジャッカル', 'キロ', 'ライナ', 'マーロウ'];

    /*
     * チーム人数を揃える。
     * 自機を人数に数えるので、1 チームぶんは
     *   敵ボット = perTeam / 味方ボット = perTeam - 1 (+ 自機)
     * になる。要求されたボット数が偶数だと必ずどちらかが 1 人多くなるため、
     * 均衡する側へ切り下げる（要求より 1 体少ないボット数で始まる）。
     * 以前は allyCount = total - enemyCount - 1 としており、
     * total=7 のとき 敵4・味方2・自機1 の 4 対 3 になっていた。
     * 「味方が弱すぎる」という体感の主因はこの人数差だった。
     * total が 0 のとき（マップ見学）は誰も出さない。
     */
    if (total <= 0) { onProgress(0.92, 'マップを確認中'); return; }
    const perTeam = Math.max(1, Math.floor((total + 1) / 2));
    const enemyCount = perTeam;
    const allyCount = perTeam - 1;      // 残る 1 枠が自機
    const ctx = { scene: this.engine.scene, physics: this.physics, effects: this.effects, mats: this.mats, game: this };

    const myTeam = this.playerStats.team;
    const plan = [];
    for (let i = 0; i < enemyCount; i++) {
      plan.push({
        team: 'B', difficulty: this.difficulty, ally: myTeam === 'B',
        weaponId: pool[i % pool.length], name: names[i % names.length],
      });
    }
    for (let i = 0; i < allyCount; i++) {
      plan.push({
        team: 'A', difficulty: this.difficulty, ally: myTeam === 'A',
        weaponId: pool[(i + 3) % pool.length], name: names[(i + 6) % names.length],
      });
    }

    for (let i = 0; i < plan.length; i++) {
      // 生成前にフレームを譲る。これで 1 体ぶん（十数 ms）ずつに分割される。
      await nextFrame();
      onProgress(0.10 + 0.80 * (i / plan.length), `部隊を展開中 ${i + 1}/${plan.length}`);
      this.bots.push(new Bot(ctx, plan[i]));
    }

    await nextFrame();
    onProgress(0.92, '配置中');
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
    const pos = this._safeSpawnPos(s.pos);
    this.player.spawn(pos, s.yaw);
    this.playerStats.hp = this.playerStats.maxHp;
    this.playerStats.alive = true;
    this.playerStats.streak = 0;
    this.player.alive = true;
    this.player.enabled = true;
    this.weapons.enabled = true;
    // 覗き込み・近接・リロードの途中状態を残さない
    this.weapons.resetState();
    this.weapons.equip(0, true);
    const id = this.weapons.loadout[0];
    if (id) this.weapons.ammo[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserveAmmo };
    this._respawnT = 0;
    this._damageFlash = 0;
    this._regenT = 0;
    // 別の場所へ湧くので、点光源の割り当ても即座に付け替える
    this.engine.lightPool.snap(pos);
    // 湧いた直後に撃たれ続けると何もできないので、短い保護を与える
    this._spawnProtect = 1.6;
    this.onPlayerSpawn?.();
  }

  /**
   * スポーン地点を安全な位置へ補正する。
   *
   * 地形の作りが変わったり、スポーン定義の y がずれていると、
   * 床の下や壁の中に湧いて落下し続ける（＝何も映らない）ことがある。
   * 真上から地面を探し、見つからなければ他の候補へ逃がす。
   */
  _safeSpawnPos(src) {
    const out = src.clone();
    const probe = _v.set(out.x, out.y + 4, out.z);
    const hit = this.physics.raycast(probe, _v2.set(0, -1, 0), 12, { forBullets: false });
    if (hit) out.y = hit.point.y + 0.05;
    else out.y = Math.max(out.y, 0) + 0.05;

    // それでも壁などに埋まっている場合は周囲へずらす
    if (this.physics._overlaps(out, 0.34, 1.8)) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        _v.set(out.x + Math.cos(a) * 1.2, out.y, out.z + Math.sin(a) * 1.2);
        if (!this.physics._overlaps(_v, 0.34, 1.8)) { out.copy(_v); break; }
      }
    }
    return out;
  }

  /** 全員をその場で復活させる（ラウンド制モードの仕切り直し用） */
  respawnAll() {
    for (const b of this.bots) this.respawnBot(b, true);
    this.respawnPlayer(true);
  }

  respawnBot(bot, instant = false) {
    const s = this.pickSpawn(bot.team);
    bot.spawn(s.pos.clone(), s.yaw);
  }

  /**
   * 指定チームから見た敵を列挙する。
   *
   * プレイヤーは常に見える。
   * 以前は「同時に自機を狙える人数」に上限を設け、溢れた分には自機を
   * 見せない実装にしていたが、これは目の前に立っている相手を無視して
   * 巡回を続けるボットを生むだけだった。人数の圧は playerPressure()
   * 側（＝溢れた者は制圧射撃に回る）で調整する。
   */
  *enemiesOf(team) {
    if (this.playerStats.team !== team && this.playerStats.alive) {
      yield this._playerAsTarget();
    }
    for (const b of this.bots) {
      if (b.team !== team && b.alive) yield b;
    }
  }

  /**
   * 自機を狙っているボットのうち、自分より近い者の数を返す。
   *
   * 全員が正確に撃ってくると四方から同時に倒されて何もできないので、
   * 近い数人だけが本気で狙い、後ろの者は制圧射撃（大きく散らす）に回る。
   * 「撃ってはいるが当たらない」状態を作ることで、包囲されている緊張感を
   * 残したまま理不尽さだけを取り除く。
   */
  playerPressure(bot) {
    const pt = this._pt;
    if (!pt || bot.targetEnemy !== pt) return 0;
    const my = bot.position.distanceToSquared(this.player.position);
    let closer = 0;
    for (const b of this.bots) {
      if (!b.alive || b === bot || b.targetEnemy !== pt) continue;
      if (b.position.distanceToSquared(this.player.position) < my) closer++;
    }
    return closer;
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
    this._pt.team = this.playerStats.team;
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
      const tracerP = this.engine.lightweight ? 0.6 : 1.0;
      for (const h of hits) {
        if (Math.random() < (pellets > 1 ? 0.35 : 0.42) * tracerP) {
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

      /*
       * 自機の銃声もボットに届ける。
       * これがないと、目の前で撃っても背を向けているボットは
       * まったく反応せず「置物」に見える。
       * サプレッサー付きは音が小さいので届かないことにする。
       */
      if (!stats.silent) {
        const pt = this._playerAsTarget();
        for (const b of this.bots) b.hearShot(origin, pt);
      }
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
    this.weapons.onMelee = () => this.audio?.playMelee();
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
    if (Math.random() < (this.engine.lightweight ? 0.3 : 0.5)) {
      this.effects.tracer(muzzle, endPoint, weapon.muzzleVelocity);
    }
    this.audio?.playShot(weapon, muzzle, false, true);

    // 周囲のボットに銃声を届ける（音は「気にする方向」として扱われる）
    for (const b of this.bots) b.hearShot(origin, shooter);

    if (!first) return;

    if (first.kind === 'world') {
      this.effects.impact(first.data.point, first.data.normal, first.data.collider.surface);
      this.audio?.playImpact(first.data.collider.surface, first.data.point);
    } else if (first.kind === 'player') {
      const dmg = damageAt(weapon, first.t, first.data.zone) * (shooter.diff?.dmgScale ?? 1);
      this._damagePlayer(dmg, shooter, dir, first.data.zone, weapon);
    } else {
      const bot = first.data.target;
      this.effects.bloodImpact(first.data.point, first.data.normal, first.data.zone === HIT_ZONE.HEAD);
      // ボット同士の撃ち合いにも練度倍率を効かせる（味方が一方的に溶けないように）
      const dmg = damageAt(weapon, first.t, first.data.zone) * (shooter.diff?.dmgScale ?? 1);
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
    if (this._spawnProtect > 0) return;   // リスポーン直後は無敵
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
      // 覗き込みを畳む。残したままだとスコープの黒縁が画面を覆い続ける。
      this.weapons.resetState();
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

    /*
     * モードへは「誰が誰を、どこで倒したか」まで渡す。
     * 以前はチームと byPlayer しか渡しておらず、
     * キルコンファームドはドッグタグを落とす座標を得られないため
     * 加点が一切発生せず、モードとして成立していなかった。
     */
    const victimPos = victimIsPlayer
      ? this.player.position.clone()
      : (victim.char?.position?.clone?.() || victim.position?.clone?.() || null);
    this.mode?.onKill?.({
      killerTeam,
      victimTeam: victimIsPlayer ? this.playerStats.team : victim.team,
      byPlayer: isPlayerKiller,
      againstPlayer: victimIsPlayer,
      victimPos, killer, victim, weapon, headshot,
    });
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
    /*
     * 死亡中も player / weapons の更新は回し続ける。
     * 止めてしまうと覗き込みの進行度が固まったままになり、
     * スコープを覗いた状態で倒されると画面を覆う黒い縁が残り続けて
     * 「復帰しても何も描画されない」状態になる。
     * 入力の受け付けは enabled = false 側で止めているので、
     * 更新を回しても操作はできない。
     */
    this.player.update(dt);
    this.weapons.update(dt);

    if (this.playerStats.alive) {
      // 体力の自然回復（COD 系のリジェネ）
      this._regenT += dt;
      if (this._regenT > 4.2 && this.playerStats.hp < this.playerStats.maxHp) {
        this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + 32 * dt);
      }
      // リスポーン直後の保護（撃つか一定時間で解除）
      if (this._spawnProtect > 0) {
        this._spawnProtect -= dt;
        if (this.weapons.firing) this._spawnProtect = 0;
      }
    } else {
      this._respawnT += dt;
      const allowed = this.mode?.allowRespawn ? this.mode.allowRespawn(this.playerStats.team) : true;
      if (this._respawnT > 3.2 && !this.matchOver && allowed) this.respawnPlayer();
    }

    /*
     * 見学モードの浮遊切り替え。
     * 使用キー（F）は他のモードでは爆弾設置などに使うので、
     * このモードのときだけ拾う。
     */
    if (this.modeId === 'mapview' && this.input.pressed('interact')) {
      this.freeCam = !this.freeCam;
      this.player.noclip = this.freeCam;
      // 浮遊中は手元の銃が視界の 1/4 を潰すので下げる
      this.weapons.holder.visible = !this.freeCam;
      this.onNotice?.(this.freeCam ? '浮遊: オン（F で解除 / Shift で加速）' : '浮遊: オフ');
    }

    // --- ボット ---
    /*
     * 思考の間引きと影の距離は描画設定に合わせる。
     * 内蔵 GPU 向けの設定では、近くのボットだけ毎フレーム考えさせ、
     * 遠いボットは 20Hz / 10Hz に落とす。索敵は敵の人数ぶん
     * レイキャストを撃つので、ここが CPU 側では一番効く。
     */
    const camPos = this.engine.camera.position;
    const lw = this.engine.lightweight;
    const near2 = lw ? 18 * 18 : 40 * 40;
    const mid2 = lw ? 40 * 40 : 90 * 90;
    const shadowDist = lw ? 16 : 26;
    /*
     * 簡易モデルへ落とす距離（0 なら常に詳細）。
     * 覗き込み中は画角が狭まって相手が大きく写るため、
     * 同じ距離でも粗さが目に付く。切り替え距離を倍に伸ばす。
     */
    const ads = (this.weapons?.adsT ?? 0) > 0.35;
    const lodDist = lw ? (ads ? 48 : 22) : 0;
    for (const b of this.bots) {
      const d2 = b.char.position.distanceToSquared(camPos);
      const lod = d2 < near2 ? 0 : (d2 < mid2 ? 1 : 2);
      b.update(dt, this, lod);
      b.updateShadowLod(camPos, shadowDist, lodDist);
      // respawnTimer は Bot.update 内で加算される
      if (!b.alive && b.respawnTimer > 5.5 && !this.matchOver
          && (this.mode?.allowRespawn ? this.mode.allowRespawn(b.team) : true)) {
        this.respawnBot(b);
      }
    }

    // --- 動く仕掛け（昇降機・可動扉など） ---
    if (this.builder?.movers.length) {
      this._moverT = (this._moverT || 0) + dt;
      for (const m of this.builder.movers) m.update(this._moverT, dt, m);
    }

    // --- 点光源の割り当て（近い数灯だけを実体にする） ---
    this.engine.lightPool.update(dt, camPos);

    // --- エフェクト・ポスト ---
    this.effects.update(dt, this.engine.camera);
    this._updatePostFx(dt);

    // --- シャドウ追従 ---
    this.engine.updateShadowFollow(this.player.position);

    // --- ゲームモード ---
    this.mode?.update(dt);
    if (this.mode?.isOver() && !this.matchOver) {
      this.matchOver = true;
      const result = this.mode.getResult();
      this.mode.dispose?.();
      this.onMatchEnd?.(result);
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
