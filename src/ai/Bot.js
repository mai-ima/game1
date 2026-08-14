import * as THREE from 'three';
import { Character, buildSoldier, buildWorldWeapon, soldierMaterials, HIT_ZONE } from './Character.js';
import { WEAPONS, damageAt, fireInterval } from '../player/weapons/WeaponDefs.js';

/**
 * 対戦用ボット。
 *
 * 経路探索はナビメッシュを持たず、
 *   目標方向へのステアリング + ひげレイによる障害物回避
 * で解決する。屋内外が混在するコンパウンド規模では十分に機能し、
 * 事前ベイクが不要なためマップ追加が容易。
 */

export const BOT_STATE = {
  IDLE: 'idle', PATROL: 'patrol', SEEK: 'seek',
  ENGAGE: 'engage', COVER: 'cover', RELOAD: 'reload', DEAD: 'dead',
};

/**
 * 難易度プリセット。
 *
 * aimError   : 銃口の揺れ（ラジアン）。見た目の「狙いのブレ」だけを決める。
 *              大きくすると首や銃口がゆらゆらして落ち着かなく見えるため控えめに。
 * spread     : 1 発ごとの拡散の標準偏差（ラジアン）。命中率はほぼこの値で決まる。
 *              着弾は狙点まわりの 2 次元正規分布。12m 先での 1σ ≒ spread×12 m
 *              揺れと分けてあるのは、見た目を崩さずに命中率だけを調整するため。
 * dmgScale   : 与ダメージ倍率。同じ武器でもボットは人間より軽く撃つ。
 * reaction   : 敵を「見つけた」あと撃ち始めるまでの秒数
 * spotTime   : 視界に入ってから「見つけた」と判定するまでの基準秒数
 *              （距離・相手の動き・視野中心からのズレで増減する）
 * settleTime : 撃ち始めてから狙いが本来の精度に収束するまでの秒数
 *              最初の一連射は大きく外れる
 * burstPause : バースト間の休み（長いほど反撃の間が生まれる）
 * aimSpeed   : 照準の最大角速度（rad/s）
 *
 * dmgScale と sight の値は実測から決めた。
 * 5 分の試合を早回しして測ると、1 発あたりの与ダメージは 13.4 で、
 * 体力 100 を削り切るのに 7〜8 発。ボットの命中率は 17% なので
 * 45 発ぶんの交戦時間が要る計算になり、実際に「初弾から撃破まで
 * 55〜160 秒」という数字が出ていた。接敵が数秒で切れるこのゲームでは
 * 決着が付かない。1 発 25 前後（4 発で撃破）に寄せてある。
 *
 * 視認距離も、マップが 190m に広がったあとの値に合わせて上げた。
 * 敵味方の距離は 40〜90m にいちばん多く分布していたのに、
 * 正規兵の視界は 52m しかなく、見える前にすれ違っていた。
 *
 * spread も実測から詰めた。0.029rad は 40m 先で 1σ ≒ 1.16m。
 * 人の胴は幅 0.5m しかないので命中率は 8% にしかならず、
 * 交戦が数秒で切れるこのゲームでは決着が付かない。
 * 実際 15 分の試合で 1,440 発撃って命中 113 発だった。
 * 3 割ほど締めて、40m で 1σ ≒ 0.78m にしてある。
 */
export const DIFFICULTY = {
  recruit:  { name: '新兵',     aimError: 0.030, spread: 0.030, dmgScale: 0.72, reaction: 0.95, spotTime: 1.15, settleTime: 1.60, burstMin: 2, burstMax: 4, burstPause: [1.10, 1.90], aimSpeed: 2.4, hp: 100, fovDeg: 90,  sight: 55, lead: 0.15 },
  regular:  { name: '正規兵',   aimError: 0.022, spread: 0.0195, dmgScale: 0.86, reaction: 0.70, spotTime: 0.86, settleTime: 1.25, burstMin: 3, burstMax: 5, burstPause: [0.85, 1.50], aimSpeed: 3.4, hp: 100, fovDeg: 100, sight: 68, lead: 0.35 },
  veteran:  { name: '古参兵',   aimError: 0.016, spread: 0.0165, dmgScale: 0.96, reaction: 0.55, spotTime: 0.66, settleTime: 1.05, burstMin: 4, burstMax: 7, burstPause: [0.70, 1.25], aimSpeed: 4.6, hp: 100, fovDeg: 110, sight: 82, lead: 0.6 },
  elite:    { name: '特殊部隊', aimError: 0.011, spread: 0.0135, dmgScale: 1.05, reaction: 0.45, spotTime: 0.48, settleTime: 0.80, burstMin: 5, burstMax: 9, burstPause: [0.58, 1.00], aimSpeed: 6.2, hp: 100, fovDeg: 120, sight: 96, lead: 0.85 },
};

/**
 * 味方（プレイヤーと同じチーム）の練度補正。
 *
 * 同じ難易度をそのまま使うと、敵はプレイヤーという「よく動く的」に
 * 集中して有利に立つのに対し、味方は数でも押されて一方的に溶ける。
 * 味方だけ、狙いを締め・反応を速め・発見を早めて釣り合わせる。
 */
const ALLY_BONUS = { aim: 0.80, spread: 0.66, dmg: 1.25, reaction: 0.78, spot: 0.78, settle: 0.78, sight: 1.15 };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
// 注視先の控え（一時ベクトルの使い回しで壊れないように別に持つ）
const _glance = new THREE.Vector3();
// 射撃解決の専用一時領域（毎発の生成を避ける）
const _fOrigin = new THREE.Vector3();
const _fOrigin2 = new THREE.Vector3();
const _fAim = new THREE.Vector3();
const _fRight = new THREE.Vector3();
const _fUp = new THREE.Vector3();
const _fMuzzle = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

// 射撃が抑止された理由の計測用（調整ツールから参照する）
export const BOT_GATE = { pause: 0, state: 0, react: 0, notgt: 0, ammo: 0, los: 0, dot: 0, timer: 0, fire: 0, far: 0, dotSum: 0, dotN: 0 };

/**
 * 撃ち始める距離。
 *
 * 拡散は角度で決まるので、遠いほど当たらない。
 * 正規兵の spread 0.0195rad は 20m 先で 1σ ≒ 0.39m（胴に半分は当たる）だが、
 * 68m では 1.33m になり、命中率は 5% を割る。
 *
 * ここを開けっ放しにすると、ボットは見えた瞬間から距離を問わず
 * 撃ち始め、当たらないまま弾をばら撒く。計測でも、湧き場を前に出して
 * 交戦が 4 倍に増えたとき、命中率が 14.7% から 2.3% へ落ちた。
 * 交戦が増えたのに当たらなくなる、という結果の主因がこれ。
 *
 * 実際の兵は、当たらない距離では撃たずに距離を詰める。
 * 射程の外では発砲を止め、_engagePositioning に前進させる。
 */
const ENGAGE_RANGE = {
  サブマシンガン: 30,
  ショットガン: 16,
  ハンドガン: 26,
  アサルトライフル: 48,
  軽機関銃: 58,
  スナイパーライフル: 130,
};
function engageRange(weapon) {
  const cls = weapon?.class || '';
  for (const k in ENGAGE_RANGE) if (cls.includes(k)) return ENGAGE_RANGE[k];
  return 45;
}

let _nextId = 1;

export class Bot {
  /**
   * @param {object} ctx {scene, physics, effects, mats, game}
   * @param {object} opt {team, difficulty, weaponId, name}
   */
  constructor(ctx, opt = {}) {
    this.id = _nextId++;
    this.ctx = ctx;
    this.team = opt.team ?? 'B';
    this.name = opt.name || `BOT-${String(this.id).padStart(2, '0')}`;
    const base = DIFFICULTY[opt.difficulty] || DIFFICULTY.regular;
    // 味方は少し強くする（詳細は ALLY_BONUS のコメント）
    this.diff = opt.ally
      ? {
        ...base,
        aimError: base.aimError * ALLY_BONUS.aim,
        spread: base.spread * ALLY_BONUS.spread,
        dmgScale: base.dmgScale * ALLY_BONUS.dmg,
        reaction: base.reaction * ALLY_BONUS.reaction,
        spotTime: base.spotTime * ALLY_BONUS.spot,
        settleTime: base.settleTime * ALLY_BONUS.settle,
        sight: base.sight * ALLY_BONUS.sight,
      }
      : base;
    this.weaponId = opt.weaponId || 'm4a1';
    this.weapon = WEAPONS[this.weaponId];

    const teamColor = this.team === 'A' ? 0x2f6fb8 : 0xb84a2f;
    const model = buildSoldier(soldierMaterials(ctx.mats, this.id % 3), teamColor, {
      weapon: buildWorldWeapon(ctx.mats, this.weapon?.model || 'm4a1'),
    });
    ctx.scene.add(model);
    this.char = new Character(model);
    // 被弾解決がこのボット本体へ辿り着けるようにする
    this.char.owner = this;
    this.char.model.visible = false;

    // ステータス
    this.hp = this.diff.hp;
    this.maxHp = this.diff.hp;
    this.alive = false;
    this.state = BOT_STATE.IDLE;
    this.kills = 0;
    this.deaths = 0;
    this.score = 0;

    // 移動
    this.radius = 0.34;
    this.height = 1.78;
    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.moveTarget = null;
    this.moveSpeed = 4.0;
    this._repathT = 0;
    this._stuckT = 0;
    /** 航行グラフで求めた通過点の列と、今どこを目指しているか */
    this._path = null;
    this._pathI = 0;
    this._pathGoal = new THREE.Vector3();
    this._pathT = 0;
    this._lastPos = new THREE.Vector3();
    this._strafeDir = Math.random() < 0.5 ? -1 : 1;
    this._strafeT = 0;

    // 知覚
    this.targetEnemy = null;
    this.lastSeenPos = new THREE.Vector3();
    this.lastSeenTime = -99;
    this._reactionT = 0;
    this._losT = 0;
    /** 索敵の蓄積量（相手 → 0..1）。1 を超えて初めて「見つけた」 */
    this._spot = new Map();
    /** 目標を見失ってからの経過。長いと再発見時にまた反応時間がかかる */
    this._sinceTarget = 99;
    /** 狙いの収束（1=まだ定まっていない → 0=本来の精度） */
    this._settle = 1;
    /** 照準の角速度（急に向きを変えないための慣性） */
    this._aimVelYaw = 0;
    this._aimVelPitch = 0;
    /** 交戦時の移動先を保持する時間（毎フレーム作り直すと震える） */
    this._posHoldT = 0;
    this._engageMove = new THREE.Vector3();
    /** 巡回中に首を振るための位相 */
    this._scanPhase = Math.random() * Math.PI * 2;
    /** 交戦中に動けなかった回数（続くと無理にでも動く） */
    this._stuckEngage = 0;
    /** 「何か見えた気がする」方向。索敵の途中で目を離さないための保持 */
    this._glancePos = new THREE.Vector3();
    this._glanceT = 0;
    /** 銃声を聞いた地点と、その警戒が続く残り時間 */
    this._alertPos = new THREE.Vector3();
    this._alertT = 0;
    /** その場に留まって撃つ時間（常時動き回るのは不自然） */
    this._standT = 0;

    // 射撃
    this.ammo = this.weapon.magSize;
    this.reserve = this.weapon.reserveAmmo;
    this._fireTimer = 0;
    this._burstLeft = 0;
    this._burstPauseT = 0;
    this._reloadT = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this._aimNoise = new THREE.Vector3();
    this._noisePhase = Math.random() * 100;

    this.respawnTimer = 0;
  }

  /*
   * ターゲットとしての共通インタフェース。
   * Game / 他のボットは「プレイヤーもボットも同じ形」で扱えることを前提に
   * position / getEyePosition を参照するため、char へ委譲しておく。
   */
  get position() { return this.char.position; }
  getEyePosition(out) { return this.char.getEyePosition(out); }

  /* ================= 生死 ================= */

  spawn(pos, yaw = 0) {
    this.char.position.copy(pos);
    this.char.yaw = this.aimYaw = yaw;
    this.char.pitch = this.aimPitch = 0;
    this.char.alive = true;
    this.char._deathT = 0;
    this.char.model.visible = true;
    this.char.model.rotation.set(0, yaw, 0);
    this.alive = true;
    this.hp = this.maxHp;
    this.velocity.set(0, 0, 0);
    this.state = BOT_STATE.PATROL;
    this.targetEnemy = null;
    this.ammo = this.weapon.magSize;
    this.reserve = this.weapon.reserveAmmo;
    this._reloadT = 0;
    this.moveTarget = null;
    this._lastPos.copy(pos);
    // 知覚・照準の状態も一から
    this._spot.clear();
    this._sinceTarget = 99;
    this._settle = 1;
    this._reactionT = 0;
    this._aimVelYaw = this._aimVelPitch = 0;
    this._posHoldT = 0;
    this._standT = 0;
    this._alertT = 0;
    this._glanceT = 0;
    this._stuckEngage = 0;
  }

  /**
   * ダメージを与える。
   * @returns {boolean} これで倒れたか
   */
  damage(amount, from, zone = HIT_ZONE.BODY) {
    if (!this.alive) return false;
    this.hp -= amount;
    /*
     * 撃たれた向きを渡す。
     * これが無いと、どこから撃たれても同じ方向へ同じ形に倒れる。
     */
    const src = from?.position ?? from?.char?.position ?? null;
    if (src) {
      this.char.onHit(this.char.position.x - src.x, this.char.position.z - src.z, zone);
      // 撃たれた方向にも敵がいる。仲間へ回す
      this.ctx.game?.awareness?.report(this.team, src, 'damage');
    } else {
      this.char.onHit(0, 0, zone);
    }

    // 撃たれたら反撃対象にする（背後からでも気づく）
    if (from && !this.targetEnemy) {
      this.targetEnemy = from;
      this.lastSeenPos.copy(from.position ?? from.char?.position ?? this.char.position);
      this.lastSeenTime = this.ctx.game?.time ?? 0;
      this._reactionT = this.diff.reaction * 0.55;
    }

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    this.hp = 0;
    this.deaths++;
    this.state = BOT_STATE.DEAD;
    // 倒れ方の決定は Character 側（被弾の向きと部位を見る）
    this.char.die();
    this.velocity.set(0, 0, 0);
    this.respawnTimer = 0;
  }

  hide() { this.char.model.visible = false; }

  /**
   * 銃声を聞く。
   *
   * 目だけに頼らせると、10m 先で撃ち合いが起きていても後ろを向いていれば
   * 何事もなかったように巡回を続けてしまい、いかにも「置物」に見える。
   * 音は「敵の位置」ではなく「気にする方向」として扱う。
   * 発見そのものは従来どおり視線と索敵時間で決まるので、
   * 聞こえた瞬間に撃ってくる、といった理不尽にはならない。
   *
   * @param {THREE.Vector3} pos  発砲位置
   * @param {object} shooter     撃った者（自分と同じ陣営なら小さく扱う）
   */
  hearShot(pos, shooter) {
    if (!this.alive || shooter === this) return;
    const d = this.char.position.distanceTo(pos);
    /*
     * 聞こえる距離。
     *
     * 以前は敵の銃声でも 52m までしか届かなかった。
     * マップが 190m に広がったあとでは、隣の区画の撃ち合いにすら
     * 気付けない。屋外の小銃の発砲は数百 m 届くので、
     * 「気付く」だけならもっと広くてよい。
     * 見つけたことにはならない（発見は視線と索敵時間で決まる）ので、
     * 広げても理不尽にはならない。
     */
    const range = shooter?.team === this.team ? 55 : 130;
    if (d > range) return;
    // 遠いほど方向が曖昧になる（気付く確率が下がる）
    if (Math.random() > 1 - (d / range) * 0.55) return;

    // 陣営の共有地図へ入れる。交戦中でもここは入れる
    if (shooter && shooter.team && shooter.team !== this.team) {
      this.ctx.game?.awareness?.report(this.team, pos, 'gunfire');
    }
    // 今の相手に集中しているなら、自分の行き先は変えない
    if (this.targetEnemy) return;
    this._alertPos.copy(pos);
    this._alertT = 5.0 + Math.random() * 3.0;
  }

  /**
   * 次の巡回先。
   *
   * マップ全体から一様に選ぶと、広い場では互いに出会わない。
   * 5 分の試合で撃破が 7 しか出ず、撃てなかった理由の 84% が
   * 「交戦状態ではない」だった。撃ち合いが弱いのではなく、
   * 撃ち合いが始まっていなかった。
   *
   * 陣営で共有している接触の記録へ寄せる。
   * ただし毎回いちばん濃い所へ行くと全員が一列になるので、
   * 抽選と散らしを入れてある（Awareness.patrolTarget）。
   */
  _nextPatrol(world) {
    const aw = this.ctx.game?.awareness;
    const fallback = (from) => world.randomPatrolPoint(from);
    if (!aw) return fallback(this.char.position);
    return aw.patrolTarget(this.team, this.char.position, fallback, Math.random());
  }

  /**
   * 行き先までの道順を引く。
   *
   * moveTarget は「最終的に行きたい場所」。そこへ直進できないとき、
   * 操舵だけでは建物に突き当たって止まってしまう。
   * 直進で届かないと分かったら航行グラフで道順を求め、
   * moveTarget を次の通過点に差し替える。
   *
   * 最後の数 m は従来どおり操舵に任せる。
   * 通過点を律儀に踏みに行くと、角で不自然に曲がるため。
   */
  _routeTo(dt) {
    const nav = this.ctx.game?.nav;
    const goal = this.moveTarget;
    if (!nav || !goal) { this._path = null; return; }

    const me = this.char.position;
    const dist = Math.hypot(goal.x - me.x, goal.z - me.z);

    // 近い、または直進できるなら道順は要らない
    if (dist < 12 || this._canWalkTo(goal)) { this._path = null; return; }

    this._pathT -= dt;
    const goalMoved = this._pathGoal.distanceToSquared(goal) > 25;
    if (!this._path || goalMoved || this._pathT <= 0) {
      this._path = nav.findPath(me, goal);
      this._pathI = 0;
      this._pathGoal.copy(goal);
      this._pathT = 2.5;
      if (!this._path || !this._path.length) { this._path = null; return; }
    }

    // 届いた通過点は捨てる。先の点へ直進できるならまとめて飛ばす
    while (this._pathI < this._path.length) {
      const w = this._path[this._pathI];
      if (Math.hypot(w.x - me.x, w.z - me.z) < 2.2) { this._pathI++; continue; }
      break;
    }
    for (let k = this._path.length - 1; k > this._pathI; k--) {
      if (this._canWalkTo(this._path[k])) { this._pathI = k; break; }
    }
    if (this._pathI >= this._path.length) { this._path = null; return; }

    this._routeTarget = this._routeTarget || new THREE.Vector3();
    this.moveTarget = this._routeTarget.copy(this._path[this._pathI]);
  }

  /** そこまで歩いて行けるか（腰と胸の高さで見る） */
  _canWalkTo(p) {
    const me = this.char.position;
    for (const h of [0.55, 1.45]) {
      _v.set(me.x, me.y + h, me.z);
      _v2.set(p.x - me.x, 0, p.z - me.z);
      const len = _v2.length();
      if (len < 0.2) return true;
      _v2.divideScalar(len);
      if (this.ctx.physics.raycast(_v, _v2, len - 0.3, { forBullets: false })) return false;
    }
    return true;
  }

  /* ================= 更新 ================= */

  /**
   * 影を落とすかを距離で切り替える。
   * 影パスは本描画と同じ数のドローコールを消費するため、
   * 遠方のボットまで影を出すと描画コストが倍増する。
   */
  updateShadowLod(cameraPos, maxDist = 26, lodDist = 0) {
    const d2 = this.char.position.distanceToSquared(cameraPos);
    // 遠い相手は簡易モデルへ（ドローコールが 34 → 2 になる）
    if (lodDist > 0) this.char.setFarLod(this.alive && d2 > lodDist * lodDist);
    const on = this.alive && d2 < maxDist * maxDist;
    // 影の代役が有効なら、部位ではなくそちらに影を担わせる
    const proxy = this.char.model.userData.shadowProxy;
    const viaProxy = !!(proxy && proxy.visible);
    if (on === this._shadowOn && viaProxy === this._shadowViaProxy) return;
    this._shadowOn = on;
    this._shadowViaProxy = viaProxy;
    this.char.model.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.shadowProxy) { o.castShadow = on; return; }
      o.castShadow = viaProxy ? false : on;
    });
  }

  /**
   * @param {number} lod 思考の間引き段階。0=毎フレーム 1=20Hz 2=10Hz
   *
   * 索敵（_perceive）は敵の人数ぶんレイキャストを撃つため、
   * ボットの処理の中で群を抜いて重い。遠くのボットまで毎フレーム
   * 回す必要はないので、距離に応じて間隔を空ける。
   * 移動・照準・射撃は毎フレーム回すので、見た目の滑らかさや
   * 撃ち合いの手触りは変わらない。
   */
  update(dt, world, lod = 0) {
    if (!this.alive) {
      this.char.update(dt, false);
      this.respawnTimer += dt;
      // 一定時間後にモデルを隠す（死体は残しすぎない）
      if (this.respawnTimer > 6) this.hide();
      return;
    }

    if (lod > 0) {
      this._thinkAcc = (this._thinkAcc || 0) + dt;
      const interval = lod === 1 ? 0.05 : 0.1;
      if (this._thinkAcc >= interval) {
        this._perceive(this._thinkAcc, world);
        this._think(this._thinkAcc, world);
        this._thinkAcc = 0;
      }
    } else {
      this._perceive(dt, world);
      this._think(dt, world);
    }
    // 遠い行き先は、航行グラフで道順に分ける
    this._routeTo(dt);
    this._move(dt);
    this._aim(dt);
    this._shoot(dt, world);

    this.char.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.char.update(dt, this.state === BOT_STATE.ENGAGE || this.state === BOT_STATE.COVER);
  }

  /* ---------------- 知覚 ---------------- */

  /**
   * 索敵。
   *
   * 「視線が通った瞬間に発見」ではなく、条件に応じて発見までの時間を積む。
   * 以前は視界に入った次のフレームには標的化され、しかも同じ相手を
   * 見失って再発見しても反応時間が入らなかったため、
   * 物陰から出た瞬間に撃たれて即死する状態になっていた。
   *
   * 発見が早くなる条件 : 近い / 視野の正面 / 相手が走っている
   * 発見が遅くなる条件 : 遠い / 視野の端 / 相手がしゃがんで静止している
   */
  _perceive(dt, world) {
    const now = world.time;
    const myEye = this.char.getEyePosition(_v);
    const cosFov = Math.cos(THREE.MathUtils.degToRad(this.diff.fovDeg) / 2);
    const fwd = _v3.set(-Math.sin(this.aimYaw), 0, -Math.cos(this.aimYaw));

    let best = null, bestScore = -Infinity;
    let glanceAt = null, glanceBest = 0;
    /*
     * 使い捨てを作らない。
     *
     * 索敵はボットの数だけ毎フレーム回る。ここで Set と
     * ジェネレータのイテレータを作ると、それだけで毎秒千個近い
     * 短命オブジェクトが出て、GC が細かく走る原因になる。
     * 対象はせいぜい 7 体なので、使い回しの配列で足りる。
     */
    const seenNow = this._seenBuf ??= [];
    seenNow.length = 0;
    const foes = world.enemiesInto
      ? world.enemiesInto(this.team, this._foeBuf ??= [])
      : [...world.enemiesOf(this.team)];

    for (const e of foes) {
      if (!e.alive) continue;
      const ep = e.getEyePosition ? e.getEyePosition(_v2) : _v2.copy(e.position);
      const d = myEye.distanceTo(ep);
      if (d > this.diff.sight) continue;

      _dir.copy(ep).sub(myEye).normalize();
      const dot = fwd.x * _dir.x + fwd.z * _dir.z;
      const inFov = dot > cosFov;
      const close = d < 5;                       // 至近は視野外でも気配で気づく
      if (!inFov && !close) continue;
      if (this.ctx.physics.losBlocked(myEye, ep)) continue;

      seenNow.push(e);

      /* --- 発見までの速さを決める --- */
      // 距離: 近いほど速い
      const distF = 1.6 - Math.min(1.3, d / this.diff.sight * 1.6);
      // 視野中心からのズレ: 正面ほど速い
      const centerF = 0.45 + Math.max(0, (dot - cosFov) / Math.max(0.05, 1 - cosFov)) * 0.85;
      // 相手の動き: 走っていると見つかりやすい、しゃがんで静止だと見つかりにくい
      const spd = e.velocity ? Math.hypot(e.velocity.x, e.velocity.z) : 0;
      const moveF = 0.78 + Math.min(1.0, spd / 4.5) * 0.75;
      const crouch = (e.stance ?? e.char?.stance ?? 0) > 0 ? 0.7 : 1.0;

      // 銃声で警戒しているあいだは少しだけ気づきやすい
      const alerted = this._alertT > 0 ? 1.3 : 1.0;
      const rate = (distF * centerF * moveF * crouch * alerted) / Math.max(0.05, this.diff.spotTime);
      const cur = Math.min(1.4, (this._spot.get(e) || 0) + rate * dt);
      this._spot.set(e, cur);

      /*
       * まだ確信には至らない段階でも、視界の隅に何か動いた以上は
       * そちらを見続ける。これがないと、索敵が溜まりきる前に巡回先へ
       * 顔を向けてしまい、目の前に立っている相手を延々と見落とす。
       * 実測でも「12m 先に棒立ちの相手を 25 秒間まったく発見しない」
       * という結果になっていた。
       */
      /*
       * 注視先は座標を控える。
       *
       * ep は使い回しの一時ベクトルなので、参照を持ち回ると
       * ループの続きで別の相手の座標に書き換わってしまう。
       * 実際、首を振る先が「いちばん気配の強い相手」ではなく
       * 「最後に評価した相手」になっていた。
       */
      if (cur > 0.18 && cur > glanceBest) { glanceBest = cur; glanceAt = _glance.copy(ep); }

      /*
       * 発見済みの相手だけが標的候補。近いほど優先。
       *
       * 今狙っている相手には下駄を履かせる。
       * 乱戦になると「いちばん近い相手」が数フレームごとに入れ替わり、
       * そのたびに反応時間と狙いの収束が入り直して、
       * いつまでも狙いが定まらないまま撃ち続けることになる。
       * 実際、湧き場を前に出して交戦が 4 倍に増えたとき、
       * 命中率が 14.7% から 2.3% まで落ちた。
       * 撃ち合いが増えたのに当たらなくなる、という妙な結果の原因がこれ。
       *
       * 25 点ぶんは、距離にして 25m の差に相当する。
       * それ以上に近い相手が現れて初めて乗り換える。
       */
      if (cur >= 1) {
        const score = 100 - d + (e === this.targetEnemy ? 25 : 0);
        if (score > bestScore) { bestScore = score; best = e; }
      }
    }

    if (glanceAt) { this._glancePos.copy(glanceAt); this._glanceT = 1.1; }
    else if (this._glanceT > 0) this._glanceT -= dt;

    // 見えていない相手の索敵蓄積は少しずつ抜ける
    for (const [e, v] of this._spot) {
      if (seenNow.indexOf(e) < 0) {
        const nv = v - dt * 0.55;
        if (nv <= 0) this._spot.delete(e); else this._spot.set(e, nv);
      }
    }

    if (best) {
      /*
       * 標的を切り替えたときだけでなく、しばらく標的を失っていた場合も
       * 反応時間を入れ直す。ここを入れないと、物陰から出た瞬間に
       * 待ち構えていたかのように撃たれる。
       */
      if (this.targetEnemy !== best || this._sinceTarget > 1.2) {
        const known = this.targetEnemy != null && this._sinceTarget < 1.2;
        /*
         * すでに撃ち合いの最中で、別の相手へ向き直しただけなら、
         * 反応も狙いも一からにはしない。銃はもう構えているし、
         * 交戦中であることも把握している。
         * ここを毎回 1 に戻すと、乱戦で永久に狙いが定まらない。
         */
        this._reactionT = this.diff.reaction * (known ? 0.35 : 0.75 + Math.random() * 0.55);
        this._settle = known ? Math.max(this._settle, 0.55) : 1;
      }
      this.targetEnemy = best;
      this._sinceTarget = 0;
      const ep = best.getEyePosition ? best.getEyePosition(_v2) : _v2.copy(best.position);
      this.lastSeenPos.copy(ep);
      this.lastSeenTime = now;
      this._losT = 0;
      /*
       * 見つけた敵を仲間へ知らせる。
       * 実際の分隊は必ず声に出すし、これが無いと
       * 隣で撃ち合っていても他の全員が別方向を巡回し続ける。
       */
      this.ctx.game?.awareness?.report(this.team, ep, 'sight');
    } else {
      this._losT += dt;
      this._sinceTarget += dt;
      if (this._losT > 5.5) this.targetEnemy = null;
    }

    if (this._reactionT > 0) this._reactionT -= dt;
    // 狙いの収束（撃てる状態で狙い続けている間だけ締まっていく）
    if (this.targetEnemy && this._reactionT <= 0) {
      this._settle = Math.max(0, this._settle - dt / Math.max(0.05, this.diff.settleTime));
    }
  }

  /* ---------------- 意思決定 ---------------- */

  _think(dt, world) {
    const now = world.time;
    if (this._alertT > 0) this._alertT -= dt;
    const hasTarget = !!this.targetEnemy && this.targetEnemy.alive;
    const seenRecently = now - this.lastSeenTime < 1.2;

    // リロード
    if (this._reloadT > 0) {
      this._reloadT -= dt;
      this.state = BOT_STATE.RELOAD;
      if (this._reloadT <= 0) {
        const need = this.weapon.magSize - this.ammo;
        const give = Math.min(need, this.reserve);
        this.ammo += give; this.reserve -= give;
      }
      return;
    }
    /*
     * 弾切れ。
     *
     * 予備弾は spawn でしか戻らないので、なかなか倒されないボットは
     * 150〜210 発を撃ち尽くしたあと、二度と撃てない案山子になっていた。
     * 15 分の試合を計測すると「弾切れで撃てなかった」が 6,235 フレーム
     * 出ており、試合が進むほど静かになる原因がこれだった。
     *
     * ボットに弾薬の管理をさせても、プレイヤーからは
     * 「途中から敵が撃ってこなくなった」としか見えない。
     * 補給に戻った、という扱いで一定時間後に補充する。
     * リロードの所作と間合いはそのまま残るので、手触りは変わらない。
     */
    if (this.ammo <= 0) {
      if (this.reserve <= 0) {
        this._resupplyT = (this._resupplyT ?? 12) - dt;
        if (this._resupplyT > 0) {
          // 弾が無いあいだは物陰へ下がる
          this.state = BOT_STATE.COVER;
          return;
        }
        this.reserve = this.weapon.reserveAmmo;
        this._resupplyT = 12;
      }
      this._reloadT = this.weapon.reloadEmptyTime;
      this.state = BOT_STATE.RELOAD;
      return;
    }

    if (hasTarget && seenRecently) {
      this.state = BOT_STATE.ENGAGE;
      this._engagePositioning(dt);
    } else if (hasTarget) {
      this.state = BOT_STATE.SEEK;
      // 毎フレーム clone すると GC が細かく走る。専用の器に持つ。
      this._seekTarget = this._seekTarget || new THREE.Vector3();
      this.moveTarget = this._seekTarget.copy(this.lastSeenPos).setY(0);
    } else if (this._alertT > 0) {
      // 銃声のした方へ確かめに行く
      this.state = BOT_STATE.SEEK;
      if (!this.moveTarget || this.moveTarget !== this._alertPos) this.moveTarget = this._alertPos;
    } else {
      if (this.state !== BOT_STATE.PATROL || !this.moveTarget) {
        this.state = BOT_STATE.PATROL;
        this._repathT -= dt;
        if (this._repathT <= 0 || !this.moveTarget) {
          this.moveTarget = this._nextPatrol(world);
          this._repathT = 6 + Math.random() * 6;
        }
      } else {
        this._repathT -= dt;
        if (this._repathT <= 0) {
          this.moveTarget = this._nextPatrol(world);
          this._repathT = 6 + Math.random() * 6;
        }
      }
    }

    // 目標に着いたら次へ
    if (this.moveTarget) {
      const d = Math.hypot(this.moveTarget.x - this.char.position.x, this.moveTarget.z - this.char.position.z);
      if (d < 1.4) {
        if (this.moveTarget === this._alertPos) this._alertT = 0;   // 確かめ終えた
        this.moveTarget = null;
        this._repathT = 0;
      }
    }
  }

  /**
   * 交戦中の立ち回り。
   *
   * 以前は毎フレーム移動先を作り直していたため、目標が細かく揺れて
   * 「その場で小刻みに震える」不自然な動きになっていた。
   * ここでは一定時間ごとに行き先を決め、その間は保持する。
   * また、常に横移動し続けるのもロボット的なので、
   * ときどき足を止めて撃つ「据え撃ち」の時間を挟む。
   */
  _engagePositioning(dt) {
    const t = this.targetEnemy;
    const tp = t.getEyePosition ? t.getEyePosition(_v2) : _v2.copy(t.position);
    const d = this.char.position.distanceTo(tp);

    _dir.copy(tp).sub(this.char.position).setY(0).normalize();
    const right = _v3.set(-_dir.z, 0, _dir.x);

    // 低 HP なら遮蔽へ退く（最優先）
    if (this.hp < this.maxHp * 0.32) {
      this.state = BOT_STATE.COVER;
      this._standT = 0;
      if (this._posHoldT <= 0) {
        this._posHoldT = 1.2 + Math.random() * 0.8;
        this._engageMove.copy(this.char.position)
          .addScaledVector(_dir, -5.5)
          .addScaledVector(right, this._strafeDir * 2.0);
      }
      this._posHoldT -= dt;
      this.moveTarget = this._engageMove;
      return;
    }

    /*
     * 撃てない距離なら、止まらずに詰める。
     *
     * 据え撃ちは「その場で撃つ」ための動作なので、
     * そもそも撃てない距離で発動すると、ただ突っ立って
     * 相手を眺めているだけになる。
     * 計測では、標的を持ちながら「遠すぎて撃てない」フレームが
     * 69,664 に達し、その間の発射はわずか 98 発だった。
     */
    const tooFar = d > engageRange(this.weapon) * 0.95;
    if (tooFar) {
      this._standT = 0;
      if (this._posHoldT <= 0) {
        this._posHoldT = 0.7 + Math.random() * 0.5;
        // まっすぐ突っ込むと的になるので、少し斜めに寄る
        this._engageMove.copy(this.char.position)
          .addScaledVector(_dir, Math.min(14, d - engageRange(this.weapon) * 0.6))
          .addScaledVector(right, this._strafeDir * 2.5);
      }
      this._posHoldT -= dt;
      this.moveTarget = this._engageMove;
      return;
    }

    // 据え撃ち中は動かない
    if (this._standT > 0) {
      this._standT -= dt;
      this.moveTarget = null;
      return;
    }

    this._posHoldT -= dt;
    if (this._posHoldT > 0) {
      this.moveTarget = this._engageMove;
      return;
    }

    // 次の行動を決める
    this._strafeDir = Math.random() < 0.5 ? -1 : 1;
    // 3 回に 1 回くらいは足を止めて撃つ
    if (Math.random() < 0.34) {
      this._standT = 0.8 + Math.random() * 1.2;
      this.moveTarget = null;
      return;
    }

    // 武器の得意距離を保つ
    const ideal = this.weapon.class.includes('サブマシンガン') ? 10
      : this.weapon.class.includes('スナイパー') ? 34
        : this.weapon.class.includes('軽機関銃') ? 24 : 18;
    const approach = (d > ideal * 1.25) ? 1 : (d < ideal * 0.6 ? -1 : 0);

    /*
     * 行き先は「そこから相手が見えるか」で選ぶ。
     * これを見ないと、撃ち合いの最中に横へ動いた先が物陰で、
     * そのまま相手を見失って巡回に戻ってしまう。
     * 実際「12m 先に棒立ちの相手がいるのに 8 割の時間を巡回に使う」
     * という計測結果になっていた。
     * 左右どちらもだめなら足を止めてその場で撃つ。
     */
    const eyeY = this.char.getEyePosition(_v).y - this.char.position.y;
    const canSeeFrom = (p) => {
      _v.set(p.x, this.char.position.y + eyeY, p.z);
      return !this.ctx.physics.losBlocked(_v, tp);
    };
    const plan = (sign, scale) => this._engageMove.copy(this.char.position)
      .addScaledVector(_dir, approach * 4.5 * scale)
      .addScaledVector(right, sign * 3.2 * scale);

    let ok = false;
    for (const [sign, scale] of [[this._strafeDir, 1], [-this._strafeDir, 1], [this._strafeDir, 0.45], [-this._strafeDir, 0.45]]) {
      plan(sign, scale);
      if (canSeeFrom(this._engageMove)) { this._strafeDir = sign; ok = true; break; }
    }
    if (!ok) {
      /*
       * どこへ動いても相手が見えなくなる位置（狭い射線から撃っている）。
       * その場に留まるのは戦術的には正しいが、何度も続くとまったく
       * 動かない置物になってしまうので、続いたら射線を捨てて詰める。
       */
      this._stuckEngage++;
      if (this._stuckEngage >= 3) {
        this._stuckEngage = 0;
        this._posHoldT = 0.9 + Math.random() * 0.7;
        this._engageMove.copy(this.char.position).addScaledVector(_dir, 4.0);
        this.moveTarget = this._engageMove;
        return;
      }
      this._standT = 0.6 + Math.random() * 0.8;
      this.moveTarget = null;
      return;
    }
    this._stuckEngage = 0;

    this._posHoldT = 1.0 + Math.random() * 1.4;
    this.moveTarget = this._engageMove;
  }

  /* ---------------- 移動 ---------------- */

  _move(dt) {
    const phys = this.ctx.physics;
    const pos = this.char.position;

    let wishX = 0, wishZ = 0;
    if (this.moveTarget) {
      const dx = this.moveTarget.x - pos.x, dz = this.moveTarget.z - pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.2) {
        wishX = dx / len; wishZ = dz / len;

        // --- ひげレイによる障害物回避 ---
        const eye = _v.set(pos.x, pos.y + 0.9, pos.z);
        const probe = (ang) => {
          const c = Math.cos(ang), s = Math.sin(ang);
          _v2.set(wishX * c - wishZ * s, 0, wishX * s + wishZ * c);
          return phys.raycast(eye, _v2, 2.4, { forBullets: false });
        };
        const center = probe(0);
        if (center) {
          const left = probe(-0.72), right = probe(0.72);
          const lDist = left ? left.dist : 99;
          const rDist = right ? right.dist : 99;
          const turn = lDist > rDist ? -1.05 : 1.05;
          const c = Math.cos(turn), s = Math.sin(turn);
          const nx = wishX * c - wishZ * s, nz = wishX * s + wishZ * c;
          wishX = nx; wishZ = nz;
        }
      }
    }

    // 交戦中はやや遅く（狙いを付けるため）
    let speed = this.moveSpeed;
    if (this.state === BOT_STATE.ENGAGE) speed *= 0.62;
    if (this.state === BOT_STATE.RELOAD) speed *= 0.5;

    const accel = 34;
    this.velocity.x += (wishX * speed - this.velocity.x) * Math.min(1, accel * dt / speed);
    this.velocity.z += (wishZ * speed - this.velocity.z) * Math.min(1, accel * dt / speed);
    if (!this.grounded) this.velocity.y += phys.gravity * dt;
    else if (this.velocity.y < 0) this.velocity.y = 0;

    const delta = _v.set(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);
    const res = phys.moveCharacter(pos, this.radius, this.height, delta, { stepHeight: 0.45 });
    this.grounded = res.grounded;
    if (res.grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (res.hitWall) { this.velocity.x *= 0.5; this.velocity.z *= 0.5; }

    // スタック検出（壁に押し付けられ続けたら別方向へ）
    const moved = this._lastPos.distanceTo(pos);
    this._lastPos.copy(pos);
    if (moved < 0.012 && this.moveTarget) {
      this._stuckT += dt;
      if (this._stuckT > 0.7) {
        this._stuckT = 0;
        this.moveTarget = null;
        this._repathT = 0;
        this._strafeDir *= -1;
      }
    } else {
      this._stuckT = 0;
    }

    // 落下復帰
    if (pos.y < -12) { this.die(); }
  }

  /* ---------------- 照準 ---------------- */

  _aim(dt) {
    let wantYaw = this.aimYaw, wantPitch = 0;

    if (this.targetEnemy && this.targetEnemy.alive) {
      const t = this.targetEnemy;
      const tp = t.getEyePosition ? t.getEyePosition(_v2) : _v2.copy(t.position);
      // 移動先を先読み（難易度で精度が変わる）
      if (t.velocity && this.diff.lead > 0) {
        const d = this.char.position.distanceTo(tp);
        const flight = d / (this.weapon.muzzleVelocity || 800);
        tp.addScaledVector(t.velocity, flight * this.diff.lead);
      }
      const me = this.char.getEyePosition(_v);
      _dir.copy(tp).sub(me);
      const horiz = Math.hypot(_dir.x, _dir.z);
      wantYaw = Math.atan2(-_dir.x, -_dir.z);
      wantPitch = Math.atan2(_dir.y, horiz);
    } else if (this._glanceT > 0) {
      // 気配のした方から目を離さない
      wantYaw = Math.atan2(-(this._glancePos.x - this.char.position.x), -(this._glancePos.z - this.char.position.z));
      wantPitch = 0;
    } else if (this.moveTarget) {
      /*
       * 進行方向だけを見つめて歩かせると、真横に敵が立っていても
       * 視野に入らないまま通り過ぎてしまう。
       * ゆっくり首を振らせることで、周囲を警戒している見た目になり、
       * 索敵としても機能する。
       */
      this._scanPhase += dt * 0.9;
      wantYaw = Math.atan2(-(this.moveTarget.x - this.char.position.x), -(this.moveTarget.z - this.char.position.z))
        + Math.sin(this._scanPhase) * 0.62;
      wantPitch = 0;
    }

    // 照準の揺らぎ（人間らしさ）。狙いが定まる前ほど大きく揺れる。
    this._noisePhase += dt;
    const n = this.diff.aimError * (1 + this._settle * 1.8);
    const nx = Math.sin(this._noisePhase * 2.3) * 0.5 + Math.sin(this._noisePhase * 5.7) * 0.3;
    const ny = Math.cos(this._noisePhase * 1.9) * 0.5 + Math.cos(this._noisePhase * 4.3) * 0.3;
    wantYaw += nx * n;
    wantPitch += ny * n * 0.7;

    /*
     * 追従は「角速度」で行い、さらにその角速度自体をなまして加速させる。
     * 単純な線形補間だと、標的を見つけた瞬間に首だけ機械的に飛ぶ動きになり、
     * 人が銃を向け直しているようには見えない。
     * 立ち上がりを鈍らせ、最大角速度で頭打ちにすることで
     * 「振り向いて、狙いを付ける」動作になる。
     */
    let dy = wantYaw - this.aimYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;

    const maxVel = this.diff.aimSpeed;
    // 目標角速度: 残り角度に比例させ、上限で頭打ちにする
    const desiredYawVel = THREE.MathUtils.clamp(dy * 4.2, -maxVel, maxVel);
    const accelK = Math.min(1, 7.5 * dt);
    this._aimVelYaw += (desiredYawVel - this._aimVelYaw) * accelK;
    this.aimYaw += this._aimVelYaw * dt;
    const dp = wantPitch - this.aimPitch;
    const desiredPitchVel = THREE.MathUtils.clamp(dp * 4.2, -maxVel, maxVel);
    this._aimVelPitch += (desiredPitchVel - this._aimVelPitch) * accelK;
    this.aimPitch += this._aimVelPitch * dt;
    this.aimPitch = Math.max(-1.2, Math.min(1.2, this.aimPitch));

    this.char.yaw = this.aimYaw;
    this.char.pitch = this.aimPitch;
  }

  /* ---------------- 射撃 ---------------- */

  _shoot(dt, world) {
    if (this._fireTimer > 0) this._fireTimer -= dt;
    if (this._burstPauseT > 0) { this._burstPauseT -= dt; BOT_GATE.pause++; return; }
    if (this.state !== BOT_STATE.ENGAGE) { BOT_GATE.state++; return; }
    if (this._reactionT > 0) { BOT_GATE.react++; return; }
    if (!this.targetEnemy || !this.targetEnemy.alive) { BOT_GATE.notgt++; return; }
    if (this.ammo <= 0) { BOT_GATE.ammo++; return; }

    const me = this.char.getEyePosition(_v);
    const t = this.targetEnemy;
    const tp = t.getEyePosition ? t.getEyePosition(_v2) : _v2.copy(t.position);

    // 遮蔽があれば撃たない
    if (this.ctx.physics.losBlocked(me, tp)) { BOT_GATE.los++; return; }

    /*
     * 当たらない距離では撃たない。
     * 撃たずに詰めたほうが、結果として早く決着する。
     * 遠くから撃ってくる敵がいなくなるわけではなく、
     * スナイパーは 130m まで撃つ。
     */
    if (me.distanceTo(tp) > engageRange(this.weapon)) { BOT_GATE.far++; return; }

    // 狙いが十分合っているか
    _dir.copy(tp).sub(me).normalize();
    const fwd = _v3.set(
      -Math.sin(this.aimYaw) * Math.cos(this.aimPitch),
      Math.sin(this.aimPitch),
      -Math.cos(this.aimYaw) * Math.cos(this.aimPitch)
    );
    // 大まかに向いていれば撃つ。命中の当たり外れは拡散側で決める。
    const _d = fwd.dot(_dir);
    BOT_GATE.dotSum += _d; BOT_GATE.dotN++;
    if (_d < 0.965) { BOT_GATE.dot++; return; }

    if (this._fireTimer > 0) { BOT_GATE.timer++; return; }
    BOT_GATE.fire++;

    // バースト管理
    if (this._burstLeft <= 0) {
      this._burstLeft = this.diff.burstMin + Math.floor(Math.random() * (this.diff.burstMax - this.diff.burstMin + 1));
      this._shotsInBurst = 0;
    }

    this._fire(world, fwd);
    this._burstLeft--;
    this._shotsInBurst = (this._shotsInBurst || 0) + 1;
    this._fireTimer = fireInterval(this.weapon);
    if (this._burstLeft <= 0) {
      const [lo, hi] = this.diff.burstPause || [0.25, 0.8];
      this._burstPauseT = lo + Math.random() * (hi - lo);
      this._shotsInBurst = 0;
    }
  }

  /**
   * 1 発撃つ。
   *
   * 以前は「命中ロールに勝ったら照準方向へ寸分違わず飛ぶ」実装だった。
   * ボットは相手の目の位置を狙うため、これは事実上「確定ヘッドショット」で、
   * 正規兵でも 100 の体力を 0.3 秒で削り切ってしまい勝負にならなかった。
   *
   * 実銃と同じく、常に拡散を持たせる方式へ変える:
   *   - 狙点は胸（目より少し下）。頭に当たるのは拡散が上振れしたときだけ。
   *   - 拡散は難易度と距離で決まり、遠いほど当てにくい。
   *   - 連射するほど拡散が広がる（反動の再現）。
   */
  _fire(world, fwd) {
    this.ammo--;
    this.char.onFire();

    const origin = this.char.getEyePosition(_fOrigin);
    const t = this.targetEnemy;
    const tp = t?.getEyePosition ? t.getEyePosition(_fAim) : _fAim.copy(t?.position || origin);
    // 目ではなく胸を狙う
    tp.y -= 0.28;
    const dist = origin.distanceTo(tp);

    const dir = _dir.copy(tp).sub(origin).normalize();
    /*
     * 拡散の内訳:
     *   aimError          … 難易度ごとの基準
     *   settle            … 撃ち始めの狙いの甘さ（最初の一連射は大きく外す）
     *   burstSpread       … 連射で広がる分
     *   距離              … 遠いほど当てにくい
     * これで「見つけた瞬間に頭へ吸い込まれる」ことがなくなる。
     */
    const settleSpread = 1 + this._settle * 3.0;
    const burstSpread = Math.min(1, this._shotsInBurst * 0.16);
    // 走りながらだと当たらない
    const moveSpread = 1 + Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / 4.5) * 0.65;
    // 自機を大勢で囲んだときは、近い数人以外は制圧射撃（大きく散らす）
    const press = world.playerPressure ? world.playerPressure(this) : 0;
    const pressSpread = 1 + Math.max(0, press - 2) * 0.55;
    // 遠距離で無限に広がらないよう頭打ちにする
    const sigma = Math.min(0.075, this.diff.spread * settleSpread * (1 + burstSpread)
      * moveSpread * pressSpread * (1 + Math.max(0, dist - 12) * 0.014));

    /*
     * 着弾は狙点まわりの 2 次元正規分布（Box-Muller）。
     * 以前は r = rand*rand*spread としていたが、この分布は中心に寄りすぎで、
     * 拡散を 1.4 倍に広げても命中率が 36%→31% までしか落ちなかった。
     * （解析するとこの式の命中率は拡散にほぼ反比例しかしない）
     * 正規分布なら「わずかに外す弾が多く、大きく外す弾もたまに出る」という
     * 実際の射撃らしいばらつきになり、命中率も σ で素直に調整できる。
     */
    const u = Math.max(1e-6, Math.random());
    const mag = Math.sqrt(-2 * Math.log(u)) * sigma;
    const a = Math.random() * Math.PI * 2;
    const r = Math.min(mag, sigma * 3.5);      // 極端な暴発だけは切る
    _fRight.crossVectors(dir, _UP).normalize();
    _fUp.crossVectors(_fRight, dir).normalize();
    dir.addScaledVector(_fRight, Math.cos(a) * r)
      .addScaledVector(_fUp, Math.sin(a) * r)
      .normalize();

    // 銃口位置はおおよそ胸の前
    const muzzle = _fMuzzle.copy(origin).addScaledVector(dir, 0.45);
    muzzle.y -= 0.12;

    world.resolveShot({
      shooter: this, origin: _fOrigin2.copy(origin), dir, weapon: this.weapon, muzzle,
    });
  }

  dispose() {
    this.ctx.scene.remove(this.char.model);
  }
}
