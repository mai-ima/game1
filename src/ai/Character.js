import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roundedBox as roundedBoxHi } from '../player/weapons/GunParts.js';
import { MODEL_BUILDERS } from '../player/weapons/Models.js';

/*
 * 人物向けの分割数。
 *
 * roundedBox の既定はビューモデルの武器に合わせた細かさで、
 * これをそのまま使うと兵士 1 体が 34,000 面になっていた。
 * 7 体でシーン全体の 87% を占めており、内蔵 GPU では無視できない。
 * 兵士は画面上せいぜい数百ピクセルなので、角の分割はぐっと粗くてよい。
 */
const BODY_SEG = { bevelSegments: 1, curveSegments: 3 };
const roundedBox = (w, h, d, r, b) => roundedBoxHi(w, h, d, r, b, BODY_SEG);

/**
 * 兵士キャラクタ。
 * ボーン階層（Group）に部位メッシュをぶら下げ、歩行・射撃・被弾を
 * 手続き的なアニメーションで表現する（スキニング無し）。
 *
 * 当たり判定は部位ごとのカプセル/ボックスで、頭・胴・手足を判別する。
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** 部位ごとのダメージ倍率区分 */
export const HIT_ZONE = { HEAD: 'head', BODY: 'body', LIMB: 'limb' };

function part(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  for (const n of Object.keys(g.attributes)) {
    if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
  }
  if (!g.getAttribute('uv')) {
    const c = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c * 2), 2));
  }
  g.clearGroups();
  return g;
}

/*
 * 兵士のジオメトリは全員で共有する。
 *
 * buildSoldier は 1 体につき 30 個あまりのジオメトリを組み立てる。
 * 中身は 1 体目と完全に同じ（形は陣営や迷彩に依らない）のに、
 * 7 体ぶん別々に作っていた。生成に時間がかかるだけでなく、
 * GPU にも同じ頂点が 7 組載る。
 *
 * buildSoldier の中の mergeParts は毎回同じ順序で呼ばれるので、
 * 呼ばれた順に控えておけば、2 体目からはそれを配るだけで済む。
 * 参照を配るので dispose は共有側で 1 度だけ行う。
 */
const _geoCache = [];
let _geoIdx = -1;      // -1 = 記録も再利用もしない（単体で呼ばれたとき）
/** 影の代役（全員で同じ形・同じ材質） */
let _proxyGeo = null, _proxyMat = null;
/** 陣営色のマテリアル（色ごとに 1 つ） */
const _accentCache = new Map();
function _accentMat(teamColor) {
  let m = _accentCache.get(teamColor);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.55, metalness: 0.1 });
    // setTeamColor がこの印を頼りに陣営色だけを塗り替える
    m.userData.isAccent = true;
    _accentCache.set(teamColor, m);
  }
  return m;
}

function mergeParts(list) {
  if (_geoIdx >= 0 && _geoCache[_geoIdx] !== undefined) return _geoCache[_geoIdx++];
  const valid = list.filter(Boolean).map(part);
  const merged = !valid.length ? null
    : (valid.length === 1 ? valid[0] : BufferGeometryUtils.mergeGeometries(valid, false));
  if (_geoIdx >= 0) _geoCache[_geoIdx++] = merged;
  return merged;
}

/** 共有しているジオメトリをすべて解放する（マップを捨てるときだけ） */
export function disposeSoldierGeometry() {
  for (const g of _geoCache) g?.dispose();
  _geoCache.length = 0;
  _proxyGeo?.dispose(); _proxyGeo = null;
  _proxyMat?.dispose(); _proxyMat = null;
  for (const m of _accentCache.values()) m.dispose();
  _accentCache.clear();
}

/**
 * 三人称の武器。
 *
 * ビューモデルの銃をそのまま流用する。
 * 別に作ると「自分が持っている銃」と「敵が持っている銃」が
 * 違う形になり、何で撃たれたのかが読めなくなる。
 * ただしこの距離では光学サイトの中まで見えないので、
 * 付属品は付けず、影を落とす設定だけ入れ替える。
 *
 * @param {object} mats MaterialLibrary
 * @param {string} model WEAPONS[].model のキー
 */
/*
 * 三人称の銃も型ごとに 1 挺だけ組み、以降は複製で配る。
 *
 * Object3D.clone() は階層だけを作り直し、ジオメトリとマテリアルは
 * 元の参照をそのまま使う。7 体ぶん別々に組み立てる必要はない。
 */
const _weaponProto = new Map();

export function buildWorldWeapon(mats, model) {
  const cached = _weaponProto.get(model);
  if (cached) return cached.clone(true);
  const root = _buildWorldWeapon(mats, model);
  _weaponProto.set(model, root);
  return root.clone(true);
}

/** 共有している三人称武器を解放する */
export function disposeWorldWeapons() {
  for (const root of _weaponProto.values()) {
    root.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
  }
  _weaponProto.clear();
}

function _buildWorldWeapon(mats, model) {
  const builder = MODEL_BUILDERS[model] || MODEL_BUILDERS.m4a1;
  const M = {
    metal: mats.get('gunMetal', { repeat: [1, 1] }),
    darkMetal: mats.solid('darkSteel', { color: 0x15171a, roughness: 0.38, metalness: 1.0 }),
    polymer: mats.get('polymer', { repeat: [1, 1] }),
    wood: mats.get('woodDark', { repeat: [1, 1] }),
    accent: mats.solid('brass'),
    optic: mats.solid('darkSteel', { color: 0x101215, roughness: 0.30, metalness: 0.9 }),
    lens: mats.solid('darkSteel', { color: 0x1a2a3a, roughness: 0.10, metalness: 0.6 }),
    default: mats.solid('darkSteel'),
  };
  const root = builder().build(M);
  root.name = 'weapon';
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData.keepShadow = true;
  });
  return root;
}

/**
 * 兵士モデルを構築する。
 * @param {object} mats {uniform, gear, skin, boot, metal}
 * @param {number} teamColor 陣営色（アクセント）
 * @param {object} opt {weapon: THREE.Group} 右手に持たせる銃
 */
export function buildSoldier(mats, teamColor = 0x2f6fb8, opt = {}) {
  const root = new THREE.Group();
  root.name = 'soldier';
  // ここから先の mergeParts は、1 体目で記録し 2 体目以降は使い回す
  _geoIdx = 0;

  const M = {
    uniform: mats.uniform,
    gear: mats.gear,
    skin: mats.skin,
    boot: mats.boot,
    metal: mats.metal,
    /*
     * 陣営色。色は 2 種類しか無いので、体ごとに作らず色ごとに 1 つ持つ。
     * マテリアルを増やすと three はその数だけ描画をまとめ直せなくなる。
     */
    accent: _accentMat(teamColor),
  };

  /*
   * 向きを合わせるための中間層。
   *
   * この兵士は「胸のプレートとポーチが +Z、背嚢が −Z」で組んである。
   * つまりモデルのローカル正面は +Z。
   * 一方、射撃・視線・索敵はどれも
   *     前方 = (-sin yaw, 0, -cos yaw)
   * を使う。これは yaw=0 のとき −Z で、モデルの正面とちょうど真逆になる。
   *
   * Character.update() は model.rotation.y へ yaw をそのまま入れるので、
   * 以前はこのずれがそのまま画面に出ていた。実戦 30 秒で測ると
   * 「進行方向とモデル正面の内積 = −0.687（標本 511）」、
   * つまり全員が後ろ歩きで、背中から発砲していた。
   *
   * 直し方は 2 通りある。
   *   a) 全ジオメトリを rotateY(π) する  → 装備の左右が入れ替わる
   *   b) 中間の Group を 1 枚挟む         → 部位の座標はそのまま
   * ここでは b を採る。以後、部位を足すときも従来どおり
   * 「顔とポーチは +Z」で書けばよい。
   *
   * 回帰検査は tools/botfacing.mjs（内積が +0.9 を下回ったら失格）。
   */
  const body = new THREE.Group();
  body.name = 'facing';
  body.rotation.y = Math.PI;
  root.add(body);

  /* ---------- 骨格（Group 階層） ---------- */
  const hips = new THREE.Group(); hips.position.y = 0.94; body.add(hips);
  const spine = new THREE.Group(); spine.position.y = 0.13; hips.add(spine);
  const chest = new THREE.Group(); chest.position.y = 0.20; spine.add(chest);
  const neck = new THREE.Group(); neck.position.y = 0.25; chest.add(neck);
  const head = new THREE.Group(); head.position.y = 0.085; neck.add(head);

  const armL = new THREE.Group(); armL.position.set(0.195, 0.155, 0); chest.add(armL);
  const armR = new THREE.Group(); armR.position.set(-0.195, 0.155, 0); chest.add(armR);
  const foreL = new THREE.Group(); foreL.position.y = -0.27; armL.add(foreL);
  const foreR = new THREE.Group(); foreR.position.y = -0.27; armR.add(foreR);

  const legL = new THREE.Group(); legL.position.set(0.105, -0.06, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(-0.105, -0.06, 0); hips.add(legR);
  const shinL = new THREE.Group(); shinL.position.y = -0.42; legL.add(shinL);
  const shinR = new THREE.Group(); shinR.position.y = -0.42; legR.add(shinR);

  /* ==================================================================
   *  胴
   *
   *  以前は骨盤と胸のあいだに腹部が無く、12cm の隙間が空いて
   *  上半身と下半身が分離して見えていた。関節はすべて球で埋め、
   *  部位の境目に必ず「continuity を作る形」を置いてある。
   * ================================================================== */

  // 骨盤（座面に向かってすぼまる）
  addMesh(hips, mergeParts([
    translated(taper(0.148, 0.112, 0.20, 10), 0, -0.055, 0),
    translated(scaled(ball(0.143, 10, 7), 1.0, 0.60, 0.74), 0, 0.02, 0),
  ]), M.uniform);

  // 腹（骨盤と胸をつなぐ）
  addMesh(spine, mergeParts([
    translated(scaled(ball(0.145, 10, 7), 1.0, 0.90, 0.72), 0, -0.01, 0),
  ]), M.uniform);

  // 胸郭（肩に向かって広がる）
  addMesh(chest, mergeParts([
    translated(scaled(ball(0.175, 11, 9), 1.0, 1.15, 0.70), 0, 0.055, 0),
    // 僧帽筋（首の付け根の盛り上がり）
    translated(scaled(ball(0.125, 9, 6), 1.15, 0.5, 0.75), 0, 0.20, -0.008),
  ]), M.uniform);

  // 肩（三角筋）— これが無いと腕が胴から浮いて見える
  for (const s of [1, -1]) {
    addMesh(chest, mergeParts([
      translated(scaled(ball(0.076, 9, 7), 1.0, 1.10, 1.0), s * 0.176, 0.148, 0),
    ]), M.uniform);
  }

  /* ---------- 装備: プレートキャリア ---------- */
  addMesh(chest, mergeParts([
    // 前面プレート（上下 2 段。1 枚板だとのっぺりする）
    translated(roundedBox(0.29, 0.165, 0.070, 0.026, 0.011), 0, 0.122, 0.098),
    translated(roundedBox(0.30, 0.175, 0.078, 0.028, 0.012), 0, -0.038, 0.100),
    // 中央の留め具（バックル）
    translated(roundedBox(0.075, 0.052, 0.030, 0.010, 0.004), 0, 0.040, 0.140),
    // 背面プレート
    translated(roundedBox(0.30, 0.34, 0.065, 0.040, 0.016), 0, 0.045, -0.092),
    // 側面のカマーバンド（前後をつなぐ帯）
    translated(roundedBox(0.055, 0.20, 0.19, 0.02, 0.008), 0.152, 0.005, 0),
    translated(roundedBox(0.055, 0.20, 0.19, 0.02, 0.008), -0.152, 0.005, 0),
    // 肩ストラップ
    translated(roundedBox(0.072, 0.048, 0.215, 0.018, 0.007), 0.112, 0.208, -0.005),
    translated(roundedBox(0.072, 0.048, 0.215, 0.018, 0.007), -0.112, 0.208, -0.005),
  ]), M.gear);

  /* ---------- 装備: ポーチ類 ---------- */
  const pouches = [];
  // 前面のマガジンポーチ 3 連（フラップ付き）
  for (let i = 0; i < 3; i++) {
    const px = -0.088 + i * 0.088;
    pouches.push(translated(roundedBox(0.072, 0.108, 0.052, 0.013, 0.006), px, -0.035, 0.152));
    pouches.push(translated(roundedBox(0.076, 0.030, 0.056, 0.010, 0.004), px, 0.024, 0.153));
  }
  // ユーティリティポーチ（右胸）
  pouches.push(translated(roundedBox(0.092, 0.082, 0.055, 0.014, 0.006), 0.128, 0.095, 0.140));
  // 無線機（左胸）とアンテナ
  pouches.push(translated(roundedBox(0.062, 0.105, 0.045, 0.012, 0.005), -0.132, 0.100, 0.140));
  pouches.push(translated(rotated(tube(0.006, 0.005, 0.16, 7), -0.22, 0, 0.1), -0.132, 0.225, 0.128));
  // 腰のダンプポーチ（背面右）
  pouches.push(translated(roundedBox(0.115, 0.125, 0.085, 0.022, 0.009), 0.145, -0.145, -0.075));
  addMesh(chest, mergeParts(pouches), M.gear);

  // バックパック（体に沿う縦長。角を落として塊感を消す）
  addMesh(chest, mergeParts([
    translated(roundedBox(0.265, 0.335, 0.145, 0.052, 0.02), 0, 0.045, -0.185),
    translated(roundedBox(0.125, 0.095, 0.062, 0.022, 0.009), 0, -0.085, -0.278),
    // 上部のロールと圧縮ストラップ
    translated(rotated(tube(0.038, 0.038, 0.24, 7), 0, 0, Math.PI / 2), 0, 0.205, -0.185),
    translated(roundedBox(0.022, 0.30, 0.02, 0.006, 0.003), 0.082, 0.045, -0.258),
    translated(roundedBox(0.022, 0.30, 0.02, 0.006, 0.003), -0.082, 0.045, -0.258),
  ]), M.gear);

  // 腰のベルトとホルスター
  addMesh(hips, mergeParts([
    translated(scaled(ball(0.146, 10, 6), 1.0, 0.16, 0.78), 0, 0.055, 0),
    translated(roundedBox(0.078, 0.145, 0.058, 0.018, 0.007), 0.152, -0.062, 0.015),
  ]), M.gear);

  /* ==================================================================
   *  頭部
   *
   *  以前は「肌色の直方体にヘルメット」で顔が存在しなかった。
   *  目鼻を作り込むとローポリでは崩れるので、実際の装備どおり
   *  下半分をフェイスマスク、目元をゴーグルで覆う。
   *  露出するのは頬と顎のわずかな面積だけになり、
   *  少ない面数でも「装備を着けた人の顔」に見える。
   * ================================================================== */

  // 頭蓋・頬・顎
  addMesh(head, mergeParts([
    translated(scaled(ball(0.093, 11, 9), 1.0, 1.10, 1.08), 0, 0.028, 0),
    // 頬から顎へ（下すぼまり）
    translated(scaled(taper(0.082, 0.058, 0.10, 9), 1.0, 1.0, 1.05), 0, -0.062, 0.006),
    // 顎先
    translated(scaled(ball(0.055, 8, 6), 1.05, 0.7, 1.15), 0, -0.098, 0.012),
    // 耳
    translated(scaled(ball(0.026, 8, 6), 0.45, 1.0, 0.75), 0.092, -0.012, -0.004),
    translated(scaled(ball(0.026, 8, 6), 0.45, 1.0, 0.75), -0.092, -0.012, -0.004),
  ]), M.skin);

  /*
   * フェイスマスク（鼻から下を覆う）。
   * 上端は鼻の下（y ≒ -0.015）まで。ここを上げるとゴーグルとの
   * あいだに顔の面が一切残らず、のっぺりした塊になってしまう。
   */
  addMesh(head, mergeParts([
    /*
     * 上端を水平に切った殻にする。
     * 球どうしを交差させると、境界線が波打ってギザギザに見えた。
     * SphereGeometry の thetaStart で切ると縁がきれいな円になる。
     */
    translated(scaled(shell(0.089, 0.44, 0.62), 1.0, 1.0, 1.04), 0, -0.028, 0.008),
    translated(scaled(taper(0.079, 0.054, 0.070, 9), 1.0, 1.0, 1.04), 0, -0.100, 0.013),
    // 後頭部へ回るストラップ
    translated(rotated(tube(0.007, 0.007, 0.180, 7), 0, 0, Math.PI / 2), 0, -0.058, -0.030),
  ]), M.gear);

  /*
   * ヘルメット。
   * 縁が目より下まで来ると顔がまるごと隠れて「黒い卵」になる。
   * 開口部が眉の高さ（y ≒ +0.022）に来るよう、
   *   縁の高さ = 中心 - r*sin(thetaLength - 90°) * scaleY
   * を目安に置いている。
   */
  addMesh(head, mergeParts([
    // 本体
    translated(scaled(ball(0.104, 12, 9, Math.PI * 0.545), 1.03, 0.98, 1.12), 0, 0.038, -0.006),
    // 後頭部の張り出し（後ろだけ深く下りる）
    translated(scaled(ball(0.098, 10, 7, Math.PI * 0.60), 1.0, 0.92, 1.0), 0, 0.020, -0.040),
    // 前庇
    translated(scaled(ball(0.100, 10, 6, Math.PI * 0.5), 1.0, 0.34, 0.66), 0, 0.026, 0.056),
    // サイドレール
    translated(roundedBox(0.013, 0.016, 0.105, 0.004, 0.002), 0.107, 0.032, -0.010),
    translated(roundedBox(0.013, 0.016, 0.105, 0.004, 0.002), -0.107, 0.032, -0.010),
    // 後部カウンターウェイト
    translated(roundedBox(0.078, 0.048, 0.040, 0.013, 0.005), 0, 0.008, -0.104),
    /*
     * あご紐は入れていない。
     * この縮尺だと必ず「顔から突き出た棒」になってしまい、
     * かえって不自然に見える。代わりに、実際の装備どおり
     * ヘルメットに固定するヘッドセットを付ける。
     */
    // ヘッドセットのアーム（ヘルメット側面から耳へ下りる）
    translated(rotated(roundedBox(0.011, 0.070, 0.013, 0.004, 0.002), 0, 0, 0.22), 0.104, -0.010, -0.006),
    translated(rotated(roundedBox(0.011, 0.070, 0.013, 0.004, 0.002), 0, 0, -0.22), -0.104, -0.010, -0.006),
  ]), M.gear);

  // ヘッドセット（イヤーカップとマイクブーム）
  addMesh(head, mergeParts([
    translated(rotated(tube(0.031, 0.029, 0.022, 9), 0, 0, Math.PI / 2), 0.098, -0.042, -0.004),
    translated(rotated(tube(0.031, 0.029, 0.022, 9), 0, 0, Math.PI / 2), -0.098, -0.042, -0.004),
    // マイクブーム（左耳から口元へ）
    translated(rotated(tube(0.0055, 0.0055, 0.105, 7), 0, 0, -1.15), -0.075, -0.070, 0.050),
    translated(ball(0.011, 8, 6), -0.028, -0.088, 0.082),
  ]), M.gear);

  // NVG マウント（前面中央）
  addMesh(head, mergeParts([
    translated(roundedBox(0.042, 0.036, 0.026, 0.006, 0.003), 0, 0.070, 0.092),
    translated(roundedBox(0.024, 0.048, 0.020, 0.005, 0.002), 0, 0.094, 0.098),
  ]), M.metal);

  // ゴーグル（眉のすぐ下。バンドがヘルメット後方まで回る）
  addMesh(head, mergeParts([
    translated(scaled(ball(0.086, 10, 6), 1.04, 0.34, 0.98), 0, 0.010, 0.020),
    translated(rotated(tube(0.010, 0.010, 0.19, 7), 0, 0, Math.PI / 2), 0, 0.014, -0.054),
  ]), M.metal);

  /* ==================================================================
   *  腕
   * ================================================================== */
  for (const [g, s] of [[armL, 1], [armR, -1]]) {
    addMesh(g, mergeParts([
      translated(taper(0.052, 0.043, 0.27, 7), 0, -0.135, 0),
      translated(ball(0.049, 8, 6), 0, -0.268, 0),          // 肘
    ]), M.uniform);
  }
  for (const [g, s] of [[foreL, 1], [foreR, -1]]) {
    addMesh(g, mergeParts([
      translated(taper(0.045, 0.036, 0.235, 7), 0, -0.113, 0),
    ]), M.uniform);
    // 手袋（手首・手のひら・親指）
    addMesh(g, mergeParts([
      translated(scaled(roundedBox(0.062, 0.088, 0.048, 0.020, 0.008), 1, 1, 1), 0, -0.272, 0.008),
      translated(scaled(ball(0.030, 8, 6), 0.7, 1.0, 1.0), s * 0.030, -0.252, 0.018),
      translated(roundedBox(0.056, 0.036, 0.050, 0.014, 0.006), 0, -0.226, 0.006),
    ]), M.gear);
    // 肘パッド
    addMesh(g, mergeParts([
      translated(scaled(ball(0.055, 8, 6), 1.0, 0.9, 0.85), 0, 0.006, 0.012),
    ]), M.gear);
  }

  /* ==================================================================
   *  脚
   * ================================================================== */
  for (const g of [legL, legR]) {
    addMesh(g, mergeParts([
      translated(taper(0.086, 0.062, 0.43, 9), 0, -0.205, 0),
      translated(scaled(ball(0.082, 9, 7), 1.0, 0.9, 1.0), 0, 0.015, 0),   // 股関節
      translated(ball(0.063, 8, 6), 0, -0.418, 0),                          // 膝
    ]), M.uniform);
  }
  for (const g of [shinL, shinR]) {
    addMesh(g, mergeParts([
      translated(taper(0.060, 0.046, 0.395, 7), 0, -0.198, 0),
      translated(scaled(ball(0.050, 8, 6), 1.0, 0.85, 1.0), 0, -0.392, 0), // 足首
    ]), M.uniform);
    // ニーパッド（膝の球を覆う）
    addMesh(g, mergeParts([
      translated(scaled(ball(0.072, 9, 7), 1.0, 0.95, 0.85), 0, 0.008, 0.014),
      translated(roundedBox(0.115, 0.030, 0.055, 0.010, 0.004), 0, -0.052, 0.020),
    ]), M.gear);
    /*
     * ブーツ。
     * 以前はすねの下端より 5.5cm 下に置いていたため、
     * 足首から切り離されて宙に浮いて見えていた。
     * すねの下端（-0.395）に合わせ、爪先を前へ出す。
     */
    addMesh(g, mergeParts([
      // 甲
      translated(roundedBox(0.098, 0.098, 0.135, 0.030, 0.012), 0, -0.418, 0.028),
      // 爪先
      translated(scaled(roundedBox(0.092, 0.062, 0.115, 0.026, 0.010), 1, 1, 1), 0, -0.437, 0.108),
      // 踵
      translated(roundedBox(0.088, 0.075, 0.070, 0.022, 0.009), 0, -0.430, -0.052),
      // ソール
      translated(roundedBox(0.100, 0.026, 0.232, 0.010, 0.004), 0, -0.460, 0.038),
    ]), M.boot);
  }

  // 陣営色のアームバンド（上腕）
  for (const g of [armL, armR]) {
    addMesh(g, mergeParts([
      translated(tube(0.054, 0.053, 0.042, 7), 0, -0.075, 0),
    ]), M.accent);
  }

  /*
   * 遠距離用の簡易モデル。
   *
   * 兵士 1 体は部位ごとに 34 メッシュあり、実測では視界内の
   * ドローコール 171 のうち 136 が人物だった（残りはマップ全体で 35）。
   * 統合 GPU では 200 を超えたあたりから明確に落ち込むので、
   * ここを削らないと他を何度直しても届かない。
   *
   * 20m も離れれば手足の関節や装備の細部は判別できないため、
   * マテリアル 2 枚・静止姿勢の 2 メッシュに差し替える。
   * 34 → 2 draws。
   */
  const lod = new THREE.Group();
  lod.name = 'soldierLod';
  lod.visible = false;
  /*
   * 寸法は詳細モデルに合わせてある。
   * 遠目でも人だと分かるかどうかは肩幅と頭の大きさで決まるので、
   * そこだけは痩せさせない（細い円柱を並べると棒人間に見える）。
   */
  addMesh(lod, mergeParts([
    // 胴（肩から腰へ）
    translated(taper(0.175, 0.145, 0.68, 10), 0, 1.22, 0),
    // 肩まわり
    translated(scaled(ball(0.185, 10, 8), 1.0, 0.62, 0.78), 0, 1.44, 0),
    // 腕（胴に埋まらないよう外側へ）
    translated(taper(0.055, 0.044, 0.52, 7), 0.212, 1.17, 0.02),
    translated(taper(0.055, 0.044, 0.52, 7), -0.212, 1.17, 0.02),
    // 脚
    translated(taper(0.096, 0.062, 0.86, 7), 0.105, 0.46, 0),
    translated(taper(0.096, 0.062, 0.86, 7), -0.105, 0.46, 0),
    // 首
    translated(taper(0.055, 0.060, 0.09, 6), 0, 1.545, 0),
  ]), M.uniform);
  addMesh(lod, mergeParts([
    // 頭とヘルメット
    translated(scaled(ball(0.118, 10, 8), 1.02, 1.08, 1.10), 0, 1.625, -0.004),
    // プレートキャリア（胴より一回り大きく）
    translated(roundedBox(0.375, 0.335, 0.275, 0.055, 0.022), 0, 1.28, 0.004),
    // ブーツ
    translated(roundedBox(0.105, 0.095, 0.275, 0.03, 0.012), 0.105, 0.048, 0.035),
    translated(roundedBox(0.105, 0.095, 0.275, 0.03, 0.012), -0.105, 0.048, 0.035),
    /*
     * 遠景でも「武装しているか」は判らなければならない。
     * 詳細モデルの銃は前腕にぶら下がっていて、簡易モデルに
     * 切り替えた瞬間に消えてしまうので、輪郭だけの銃を持たせる。
     * 形は問わない。横に張り出した棒があれば、人は銃だと読む。
     */
    translated(roundedBox(0.055, 0.075, 0.60, 0.014, 0.006), -0.16, 1.16, 0.16),
    translated(roundedBox(0.045, 0.13, 0.10, 0.012, 0.005), -0.16, 1.09, 0.31),
  ]), M.gear);
  lod.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.keepShadow = true; } });
  body.add(lod);                       // 詳細モデルと同じ向きの層に置く
  root.userData.lod = lod;
  root.userData.detail = hips;

  /*
   * 銃。
   *
   * これが無かったので、敵は全員が手ぶらのまま撃ってきていた。
   * FPS では「相手が何を持っているか」が、距離を詰めるか下がるかを
   * 決める第一の情報なので、これが画面に無いのは成立していない。
   *
   * 右の前腕にぶら下げる。前腕は肘から下へ伸びているので、
   * その先端（手の位置）へ銃の握りが来るように置き、
   * 銃口が体の前を向くよう倒す。
   */
  /*
   * 銃を吊る座。
   *
   * 手にぶら下げるのではなく、胸に付ける。
   *
   * 前腕の先へ銃を付けると、腕を動かすたびに銃が振り回され、
   * 構えたときに銃口が明後日を向く。逆関節を解く仕組み（IK）が
   * 無いので、腕の角度から銃の位置を決めるのは無理がある。
   *
   * 実際、肩付けで構えているあいだ、銃は上半身に対してほぼ固定で、
   * 動いているのは腕のほう。だから「銃を胸に据えて、腕をそこへ
   * 添える」と考えたほうが、実物の動きにも近く、破綻もしない。
   *
   * 座は YXZ 順にしてある。まず向き（Y）を決め、そのあと
   * 上下（X）を足す、という順で書けるようにするため。
   */
  if (opt.weapon) {
    const mount = new THREE.Group();
    mount.name = 'weaponMount';
    mount.rotation.order = 'YXZ';
    chest.add(mount);
    const w = opt.weapon;
    /*
     * 銃のローカルは「銃口が -Z、上が +Y」。
     * 兵士のローカルは正面が +Z なので、座を Y 軸に 180 度回すと
     * 銃口が正面を向く。以降の姿勢は Character.update が決める。
     */
    mount.add(w);
    root.userData.weapon = w;
    root.userData.weaponMount = mount;
  }

  root.userData.bones = {
    hips, spine, chest, neck, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR,
    weaponMount: root.userData.weaponMount || null,
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData.keepShadow = true;      // 影の間引きは下のプロキシで行う
  });

  /*
   * 影だけを落とす代役。
   *
   * 兵士 1 体は部位ごとに約 30 メッシュあり、7 体いると影パスだけで
   * 200 を超えるドローコールになる（実測では影を落とすメッシュ 126 個の
   * うち 99 個が人物の部位だった）。
   * 影の形は人型のシルエットが分かれば十分なので、
   * 軽量モードではこのカプセル 1 個に肩代わりさせる。
   *
   * colorWrite を切ってあるので通常の描画では何も書かない。
   * visible を false にすると three は影パスでも飛ばしてしまうため、
   * 「見えているが色を書かないメッシュ」として置く必要がある。
   */
  // 代役のカプセルも全員で同じ形。1 つ作って使い回す
  _proxyGeo ??= new THREE.CapsuleGeometry(0.30, 1.02, 3, 10);
  _proxyMat ??= new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const proxy = new THREE.Mesh(_proxyGeo, _proxyMat);
  proxy.name = 'shadowProxy';
  proxy.position.y = 0.92;
  proxy.castShadow = true;
  proxy.receiveShadow = false;
  proxy.visible = false;               // 既定（高画質側）では使わない
  proxy.userData.shadowProxy = true;
  root.add(proxy);
  root.userData.shadowProxy = proxy;

  // ジオメトリは共有物なので、この兵士だけで捨ててはいけない目印
  root.userData.sharedGeometry = true;
  _geoIdx = -1;
  return root;
}

/** Y 軸方向の円錐台（手足のように先細りする部位に使う） */
function taper(rTop, rBot, len, seg = 12) {
  return new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
}
/** Y 軸方向の円筒 */
function tube(rTop, rBot, len, seg = 10) {
  return new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
}
/**
 * 球の一部（緯度で切り出した殻）。
 * t0/t1 は 0=北極 1=南極 の比率。上端・下端がきれいな円になるので、
 * 面覆いのように「縁の線をはっきり見せたい」ものに使う。
 */
function shell(r, t0, t1, wSeg = 12, hSeg = 8) {
  return new THREE.SphereGeometry(r, wSeg, hSeg, 0, Math.PI * 2, Math.PI * t0, Math.PI * (t1 - t0));
}

/** 球。phiLength を渡すと上半分だけの椀になる */
function ball(r, wSeg = 10, hSeg = 8, thetaLength = Math.PI) {
  return new THREE.SphereGeometry(r, wSeg, hSeg, 0, Math.PI * 2, 0, thetaLength);
}
function rotated(g, x, y, z) {
  if (x) g.rotateX(x);
  if (y) g.rotateY(y);
  if (z) g.rotateZ(z);
  return g;
}

function addMesh(parent, geo, mat) {
  if (!geo) return null;
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}
function translated(g, x, y, z) { g.translate(x, y, z); return g; }
function scaled(g, x, y, z) { g.scale(x, y, z); return g; }

/**
 * キャラクタの当たり判定・アニメーションを司る。
 */
export class Character {
  /**
   * @param {THREE.Group} model buildSoldier の戻り値
   */
  constructor(model) {
    this.model = model;
    this.bones = model.userData.bones;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.stance = 0;             // 0=立ち 1=しゃがみ
    this.speed = 0;
    this.alive = true;

    this._walkPhase = 0;
    this._aimT = 0;
    this._fireKick = 0;
    this._hitFlash = 0;
    this._hitFwd = 0;         // 被弾方向（体の前後成分）
    this._hitSide = 0;        // 同じく左右成分
    this._hitZone = HIT_ZONE.BODY;
    this._deathT = 0;
    this._deathKind = 0;      // 倒れ方の種類
    this._deathFwd = -1;      // 前のめりか仰向けか
    this._breath = Math.random() * 6.28;

    // 部位判定用のカプセル（ローカル座標・立ち姿勢基準）
    this.hitboxes = [
      { zone: HIT_ZONE.HEAD, y: 1.66, r: 0.135, h: 0.24 },
      { zone: HIT_ZONE.BODY, y: 1.22, r: 0.235, h: 0.62 },
      { zone: HIT_ZONE.BODY, y: 0.92, r: 0.20, h: 0.24 },
      { zone: HIT_ZONE.LIMB, y: 0.48, r: 0.24, h: 0.86 },
      { zone: HIT_ZONE.LIMB, y: 1.22, r: 0.36, h: 0.50 },   // 腕を含む広め
    ];
  }

  get eyeHeight() { return this.stance ? 1.06 : 1.62; }

  /**
   * 遠距離用の簡易モデルに切り替える。
   * @param {boolean} far true で簡易、false で詳細
   */
  setFarLod(far) {
    const u = this.model.userData;
    if (!u.lod || this._farLod === far) return;
    this._farLod = far;
    u.lod.visible = far;
    u.detail.visible = !far;
  }

  /** 影の代役の高さを姿勢に合わせる */
  _updateShadowProxy() {
    const p = this.model.userData.shadowProxy;
    if (!p || !p.visible) return;
    const crouch = this.stance ? 0.66 : 1.0;
    p.scale.set(1, crouch, 1);
    p.position.y = 0.92 * crouch;
  }

  /** 目の位置（射撃・視線の基点） */
  getEyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  /**
   * レイとの交差判定。
   * @returns {{dist:number, point:THREE.Vector3, normal:THREE.Vector3, zone:string}|null}
   */
  raycast(origin, dir, maxDist) {
    if (!this.alive) return null;
    const scale = this.stance ? 0.68 : 1.0;
    let best = null;

    for (const hb of this.hitboxes) {
      // 垂直カプセルを円柱で近似
      const cy = this.position.y + hb.y * scale;
      const half = (hb.h * scale) / 2;
      const r = hb.r;

      // XZ 平面で円 vs レイ
      const ox = origin.x - this.position.x, oz = origin.z - this.position.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      if (a < 1e-9) continue;
      const b = 2 * (ox * dir.x + oz * dir.z);
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a);
      if (t < 0) t = (-b + sq) / (2 * a);
      if (t < 0.01 || t > maxDist) continue;

      const hy = origin.y + dir.y * t;
      if (hy < cy - half || hy > cy + half) continue;

      if (!best || t < best.dist) {
        const point = new THREE.Vector3(origin.x + dir.x * t, hy, origin.z + dir.z * t);
        const normal = new THREE.Vector3(point.x - this.position.x, 0, point.z - this.position.z).normalize();
        /*
         * target は「弾を受けた主体」。Character は見た目と当たり判定だけを
         * 持つ部品で、体力や撃破処理は所有者（Bot）側にある。
         * ここで Character 自身を返すと呼び出し側が target.damage() を
         * 呼べず、着弾のたびに例外で更新が止まる。
         */
        best = { dist: t, point, normal, zone: hb.zone, target: this.owner || this };
      }
    }
    return best;
  }

  /**
   * 被弾演出。
   *
   * これまで _hitFlash は代入して減衰させるだけで、どこからも
   * 参照されていなかった。つまり撃っても敵は何も反応せず、
   * 手応えが一切無かった。
   *
   * 大げさに仰け反らせると、連射のたびに痙攣して滑稽になる。
   * 撃たれた向きへ上体をわずかに送り、頭を振らせる程度に留める。
   *
   * @param {number} dirX  弾が飛んできた向き（ワールド、正規化不要）
   * @param {number} dirZ
   * @param {string} zone  当たった部位
   */
  onHit(dirX = 0, dirZ = 0, zone = HIT_ZONE.BODY) {
    this._hitFlash = 1;
    this._hitZone = zone;
    // 体の向きに直して「前後」「左右」に分解する
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const len = Math.hypot(dirX, dirZ) || 1;
    const fx = dirX / len, fz = dirZ / len;
    this._hitFwd = -(fx * s + fz * c);      // 正 = 前から受けた
    this._hitSide = fx * c - fz * s;
  }

  /** 発砲演出 */
  onFire() { this._fireKick = 1; }

  /**
   * 倒れる。
   * 最後に受けた被弾の向きと部位から、倒れ方を決める。
   */
  die() {
    if (!this.alive) return;
    this.alive = false;
    this._deathT = 0;
    // 前から撃たれれば仰向け、後ろからなら前のめり
    this._deathFwd = this._hitFwd > 0 ? -1 : 1;
    this._deathKind = this._hitZone === HIT_ZONE.HEAD ? 1 : 0;
  }

  /**
   * 姿勢アニメーション。
   * @param {number} dt
   * @param {boolean} aiming 構えているか
   */
  update(dt, aiming = false) {
    const B = this.bones;
    this.model.position.copy(this.position);
    this.model.rotation.y = this.yaw;
    this._updateShadowProxy();

    if (!this.alive) {
      this._deathT += dt;
      /*
       * 倒れ方。
       *
       * 以前は「前へ 1.42rad 回して終わり」の一種類しか無く、
       * どこから撃たれても同じ向きへ、同じ速さで、同じ形に倒れていた。
       * しかも脚を伸ばしたまま回すので、最後は仰向けで手足が
       * 突っ張った姿になっていた。
       *
       * ラグドールは入れられないが、
       *   ・撃たれた向きへ倒れる
       *   ・頭を撃たれたら膝から崩れる
       *   ・腰・胸・首がそれぞれ違う速さで遅れて追従する
       * の 3 つを入れるだけで「倒れた」に見える。
       */
      const t = Math.min(1, this._deathT / 1.05);
      const e = 1 - Math.pow(1 - t, 3);
      // 各部位が時間差で追いつく
      const lag = (d) => 1 - Math.pow(1 - Math.min(1, Math.max(0, (t - d) / (1 - d))), 3);
      const fwd = this._deathFwd;          // +1 = 前のめり / -1 = 仰向け
      const kind = this._deathKind;

      if (kind === 1) {
        /* 頭部被弾。力が抜けて、その場で膝から落ちる */
        const drop = e;
        this.model.rotation.x = fwd * drop * 0.95;
        this.model.rotation.z = this._hitSide * drop * 0.35;
        this.model.position.y = this.position.y - drop * 0.12;
        B.hips.position.y = (this.stance ? 0.62 : 0.95) - drop * 0.42;
        B.legL.rotation.x = drop * 1.5; B.shinL.rotation.x = -drop * 1.9;
        B.legR.rotation.x = drop * 1.3; B.shinR.rotation.x = -drop * 1.7;
        B.chest.rotation.x = lag(0.15) * fwd * 0.55;
        B.head.rotation.x = lag(0.05) * fwd * 0.8;
        B.armL.rotation.set(lag(0.2) * -0.5, 0, 0.5);
        B.armR.rotation.set(lag(0.25) * -0.4, 0, -0.5);
      } else {
        /* 通常。撃たれた向きへ体ごと倒れる */
        this.model.rotation.x = fwd * e * 1.48;
        this.model.rotation.z = this._hitSide * e * 0.55;
        // 倒れる途中で一度浮いて、着地でわずかに沈む
        this.model.position.y = this.position.y
          + Math.sin(t * Math.PI) * 0.10 - Math.max(0, t - 0.85) * 0.20;
        B.hips.position.y = (this.stance ? 0.62 : 0.95) - e * 0.10;
        B.chest.rotation.x = lag(0.10) * fwd * -0.45;
        B.head.rotation.x = lag(0.20) * fwd * -0.55;
        // 腕は体より遅れて振られる
        B.armL.rotation.set(lag(0.12) * (fwd > 0 ? -1.25 : 0.75), 0, 0.35 + lag(0.3) * 0.4);
        B.armR.rotation.set(lag(0.18) * (fwd > 0 ? -1.05 : 0.60), 0, -0.35 - lag(0.3) * 0.4);
        B.foreL.rotation.set(lag(0.25) * -0.9, 0, 0);
        B.foreR.rotation.set(lag(0.30) * -0.7, 0, 0);
        // 脚は畳まれる（伸ばしたままだと棒が転がっているように見える）
        B.legL.rotation.x = lag(0.05) * (fwd > 0 ? -0.55 : 0.85);
        B.legR.rotation.x = lag(0.15) * (fwd > 0 ? -0.30 : 0.55);
        B.shinL.rotation.x = lag(0.2) * (fwd > 0 ? 1.1 : -0.9);
        B.shinR.rotation.x = lag(0.3) * (fwd > 0 ? 0.8 : -0.7);
      }
      // 銃は手から離れる直前まで下がっていく
      if (B.weaponMount) {
        B.weaponMount.position.set(-0.205, -0.075 - e * 0.08, 0.135 - e * 0.05);
        B.weaponMount.rotation.set(0.62 + e * 0.7, Math.PI + 0.42, 0.30 + e * 0.5);
      }
      return;
    }

    this._aimT += ((aiming ? 1 : 0) - this._aimT) * Math.min(1, 8 * dt);
    this._fireKick *= Math.pow(0.02, dt / 0.09);
    this._hitFlash *= Math.pow(0.02, dt / 0.16);
    this._breath += dt * 1.6;

    const moving = this.speed > 0.4;
    const runK = Math.min(1, this.speed / 5.5);
    if (moving) this._walkPhase += dt * (5.2 + runK * 5.0);

    const swing = moving ? Math.sin(this._walkPhase) : 0;
    const swing2 = moving ? Math.sin(this._walkPhase * 2) : 0;
    const amp = 0.34 + runK * 0.42;

    // 脚
    B.legL.rotation.x = swing * amp;
    B.legR.rotation.x = -swing * amp;
    B.shinL.rotation.x = Math.max(0, -swing * 0.5) * amp * 1.5;
    B.shinR.rotation.x = Math.max(0, swing * 0.5) * amp * 1.5;

    // 腰の上下動と捻り
    B.hips.position.y = (this.stance ? 0.62 : 0.95) + (moving ? Math.abs(swing2) * 0.035 * runK : Math.sin(this._breath) * 0.006);
    B.hips.rotation.y = swing * 0.10 * runK;
    B.spine.rotation.y = -swing * 0.07 * runK;
    B.chest.rotation.y = swing * 0.05 * runK;
    B.chest.rotation.x = this.stance ? 0.30 : (0.06 + runK * 0.16 - this._aimT * 0.04);

    /*
     * 腕と銃。
     *
     * 銃は胸に据えてあるので、まず銃の位置を決め、
     * 腕はそこへ添える形で角度を作る。
     *
     *   下げ（aim=0） … 銃口を斜め下へ。右手だけで提げ、左手は空く
     *   構え（aim=1） … 右肩に付けて水平。左手をハンドガードへ
     */
    const aim = this._aimT;
    const armSwing = moving ? -swing * 0.5 * amp * (1 - aim * 0.85) : 0;
    const kick = this._fireKick;
    const lerp = (a, c, t) => a + (c - a) * t;

    if (B.weaponMount) {
      const m = B.weaponMount;
      // 右肩の前（モデルのローカルでは -X が右）
      m.position.set(
        lerp(-0.205, -0.115, aim),
        lerp(-0.075, 0.070, aim),
        lerp(0.135, 0.235, aim)
      );
      m.rotation.set(
        // 構えると視線のピッチに乗る。下げているときは銃口が斜め下
        lerp(0.62, 0, aim) - this.pitch * (0.35 + 0.55 * aim) + kick * 0.16,
        Math.PI + lerp(0.42, 0.05, aim),
        lerp(0.30, 0.02, aim)
      );
      // 反動で銃が後ろへ逃げる
      m.position.z -= kick * 0.045 * (0.4 + aim * 0.6);
    }

    /*
     * 腕。
     * 右は握りへ、左はハンドガードへ届く角度を実測で詰めてある。
     * 逆関節を解いていないので、値そのものに意味は無い。
     * 変えるときは必ず画面で確かめること。
     */
    /*
     * 肘は「上腕を X で倒し、前腕をさらに X で折る」だけで作る。
     * 上腕・前腕とも既定では真下（-Y）を向いているので、
     * X 回転 t のあとの向きは (0, -cos t, -sin t)。
     * 握りは胸から見て前 0.23m・上 0.07m あたりに来るので、
     * 前腕は深く折り込む（合計で -2.4rad 前後）ことになる。
     */
    B.armR.rotation.set(lerp(-0.14, -0.34, aim) + armSwing, lerp(0, -0.16, aim), lerp(-0.16, -0.30, aim));
    B.foreR.rotation.set(lerp(-0.24, -2.05, aim), lerp(0, 0.25, aim), 0);
    // 支え手は体を横切ってハンドガードへ。ほぼ伸びきる
    B.armL.rotation.set(lerp(-0.12, -1.28, aim) + (-armSwing), lerp(0, -0.80, aim), lerp(0.16, 0.22, aim));
    B.foreL.rotation.set(lerp(-0.26, -0.34, aim), lerp(0, -0.25, aim), 0);

    // 発砲の反動（上半身が押し戻される）
    B.chest.rotation.x -= kick * 0.10;
    B.armR.rotation.x += kick * 0.16;

    /*
     * 被弾の身じろぎ。
     *
     * 撃たれた向きへ上体が送られ、頭が振れる。
     * 大きくすると連射のたびに痙攣して滑稽になるので、
     * 「当たったことが判る」ぎりぎりまで小さくしてある。
     * 頭は胴より大きく振れる（首のほうが軽い）。
     */
    const hit = this._hitFlash;
    if (hit > 0.01) {
      const h = hit * (this._hitZone === HIT_ZONE.HEAD ? 1.6 : 1.0);
      B.chest.rotation.x += this._hitFwd * h * 0.16;
      B.chest.rotation.z += this._hitSide * h * 0.12;
      B.spine.rotation.z += this._hitSide * h * 0.07;
      B.head.rotation.x += this._hitFwd * h * 0.30;
      B.head.rotation.y += this._hitSide * h * 0.22;
      // 銃口が跳ね上がる
      if (B.weaponMount) B.weaponMount.rotation.x -= h * 0.10;
    }

    // 頭は視線方向へ（ピッチを上半身と頭で配分）
    B.chest.rotation.x += this.pitch * 0.22;
    B.head.rotation.x = this.pitch * 0.55 + (moving ? -swing2 * 0.02 : 0);
    B.head.rotation.y = moving ? -swing * 0.06 : Math.sin(this._breath * 0.6) * 0.03;
  }

  setTeamColor(color) {
    this.model.traverse((o) => {
      if (o.isMesh && o.material?.userData?.isAccent) o.material.color.set(color);
    });
  }
}

/** 兵士用マテリアル一式を作る */
export function soldierMaterials(mats, variant = 0) {
  const uniforms = ['camo', 'camo', 'fabric'];
  return {
    uniform: mats.get(uniforms[variant % uniforms.length], { repeat: [2.6, 2.6] }),
    gear: mats.solid('odGreen', { color: variant % 2 ? 0x2a2c26 : 0x3a3529, roughness: 0.72 }),
    skin: mats.solid('tan', { color: 0x8a6a52, roughness: 0.78, metalness: 0 }),
    boot: mats.solid('black', { color: 0x141414, roughness: 0.62 }),
    metal: mats.solid('darkSteel', { color: 0x181a1d, roughness: 0.35, metalness: 0.9 }),
  };
}
