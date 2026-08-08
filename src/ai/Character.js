import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roundedBox as roundedBoxHi } from '../player/weapons/GunParts.js';

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

function mergeParts(list) {
  const valid = list.filter(Boolean).map(part);
  if (!valid.length) return null;
  return valid.length === 1 ? valid[0] : BufferGeometryUtils.mergeGeometries(valid, false);
}

/**
 * 兵士モデルを構築する。
 * @param {object} mats {uniform, gear, skin, boot, metal}
 * @param {number} teamColor 陣営色（アクセント）
 */
export function buildSoldier(mats, teamColor = 0x2f6fb8) {
  const root = new THREE.Group();
  root.name = 'soldier';

  const M = {
    uniform: mats.uniform,
    gear: mats.gear,
    skin: mats.skin,
    boot: mats.boot,
    metal: mats.metal,
    accent: new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.55, metalness: 0.1 }),
  };

  /* ---------- 骨格（Group 階層） ---------- */
  const hips = new THREE.Group(); hips.position.y = 0.94; root.add(hips);
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

  root.userData.bones = { hips, spine, chest, neck, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR };
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
  const proxy = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.30, 1.02, 3, 10),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  );
  proxy.name = 'shadowProxy';
  proxy.position.y = 0.92;
  proxy.castShadow = true;
  proxy.receiveShadow = false;
  proxy.visible = false;               // 既定（高画質側）では使わない
  proxy.userData.shadowProxy = true;
  root.add(proxy);
  root.userData.shadowProxy = proxy;

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
    this._deathT = 0;
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

  /** 被弾演出 */
  onHit() { this._hitFlash = 1; }

  /** 発砲演出 */
  onFire() { this._fireKick = 1; }

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
      const t = Math.min(1, this._deathT / 0.85);
      const e = 1 - Math.pow(1 - t, 3);
      // 崩れ落ちる
      this.model.rotation.x = e * 1.42;
      this.model.position.y = this.position.y + Math.sin(t * Math.PI) * 0.12;
      B.chest.rotation.x = e * 0.5;
      B.head.rotation.x = e * 0.6;
      B.armL.rotation.x = e * -1.1; B.armR.rotation.x = e * -0.9;
      B.legL.rotation.x = e * 0.35; B.legR.rotation.x = e * 0.15;
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

    // 腕：構えると武器を保持する姿勢へ
    const aim = this._aimT;
    const armSwing = moving ? -swing * 0.5 * amp * (1 - aim * 0.85) : 0;
    B.armR.rotation.set(-1.28 * aim + armSwing, 0, -0.20 - 0.16 * aim);
    B.armL.rotation.set(-1.34 * aim + (-armSwing), 0, 0.20 + 0.42 * aim);
    B.foreR.rotation.set(-0.30 - 0.32 * aim, 0, 0);
    B.foreL.rotation.set(-0.30 - 0.85 * aim, 0.42 * aim, 0);

    // 発砲の反動
    const kick = this._fireKick;
    B.chest.rotation.x -= kick * 0.10;
    B.armR.rotation.x += kick * 0.16;

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
