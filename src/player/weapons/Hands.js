import * as THREE from 'three';
import { roundedBox } from './GunParts.js';

/**
 * 手と腕。
 *
 * 一人称の画面で、銃だけが宙に浮いていた。
 * 常時画面の 3 割を占める要素なので、腕が無いと
 * リロードも構えも持ち替えも「浮いた物体の平行移動」になり、
 * 手触りが根こそぎ失われる。
 *
 * 見えるのは肘から先だけでよい。上腕まで作ると
 * 画面の下端で必ず胴とぶつかり、かえって不自然になる。
 * 袖口で切って、そこから先を画面外へ抜けさせる。
 */

/** 一人称向けの細かさ。銃と同じ密度で作ると手だけ角張って浮く */
const SEG = { bevelSegments: 2, curveSegments: 5 };
const rb = (w, h, d, r, b) => roundedBox(w, h, d, r, b, SEG);

/**
 * 片手（前腕 + 手のひら + 親指 + 指 4 本）。
 *
 * 指は 1 本ずつ関節を持たせず、「握った塊」と「第一関節」の
 * 2 段で作る。この距離では関節の 1 つ分しか判別できず、
 * それ以上入れても輪郭が濁るだけで面数だけ増える。
 *
 * @param {object} M   マテリアル一式（glove / skin / cuff）
 * @param {number} side  +1 = 右手, -1 = 左手
 * @param {object} opt  {grip:'pistol'|'support'} 握りの形
 */
export function buildHand(M, side = 1, opt = {}) {
  const { grip = 'pistol', forearm = 0.20 } = opt;
  const g = new THREE.Group();
  g.name = side > 0 ? 'handR' : 'handL';

  /*
   * 座標は「手首を原点、指先が -Z、手の甲が +Y」。
   * 銃側は握り位置に空の Object3D を置いておき、
   * そこへこの Group をそのまま差し込めるようにする。
   */

  // 袖口（腕は画面外へ抜けるので、ここから先だけ作る）
  const cuff = new THREE.Mesh(rb(0.082, 0.078, 0.055, 0.024, 0.010), M.cuff);
  cuff.position.set(0, 0, forearm);
  g.add(cuff);
  // 前腕（袖の中。手首へ向けて細くなる）
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.040, 0.033, forearm, 10, 1), M.sleeve
  );
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 0, forearm / 2 + 0.02);
  g.add(arm);

  // 手首
  const wrist = new THREE.Mesh(rb(0.062, 0.050, 0.045, 0.018, 0.008), M.glove);
  wrist.position.set(0, 0, 0.012);
  g.add(wrist);

  // 手のひら（小指側へわずかに厚い）
  const palm = new THREE.Mesh(rb(0.070, 0.046, 0.088, 0.020, 0.009), M.glove);
  palm.position.set(side * 0.004, -0.002, -0.038);
  g.add(palm);
  // 甲の補強パッド（戦術手袋の特徴。これがあると布に見えない）
  const back = new THREE.Mesh(rb(0.056, 0.014, 0.070, 0.008, 0.004), M.knuckle);
  back.position.set(side * 0.004, 0.026, -0.036);
  g.add(back);

  /* ---- 指 ---- */
  if (grip === 'pistol') {
    /*
     * 握り込み。
     * 指の付け根から第二関節までを 1 つの塊、
     * そこから先を折り返して 1 つの塊にする。
     */
    const knuckles = new THREE.Mesh(rb(0.066, 0.040, 0.036, 0.016, 0.007), M.glove);
    knuckles.position.set(side * 0.004, -0.008, -0.092);
    knuckles.rotation.x = -0.30;
    g.add(knuckles);
    const tips = new THREE.Mesh(rb(0.062, 0.036, 0.030, 0.014, 0.006), M.glove);
    tips.position.set(side * 0.004, -0.040, -0.078);
    tips.rotation.x = 0.55;
    g.add(tips);
    // 人差し指だけ伸ばす（引き金にかける）
    const trig = new THREE.Mesh(rb(0.017, 0.017, 0.062, 0.007, 0.003), M.glove);
    trig.position.set(side * -0.024, -0.004, -0.106);
    trig.rotation.x = -0.18;
    g.add(trig);
  } else {
    /*
     * 支え手。ハンドガードを上から包む形。
     * 指は前へ伸ばし、親指を反対側へ回す。
     */
    const fingers = new THREE.Mesh(rb(0.066, 0.034, 0.072, 0.015, 0.007), M.glove);
    fingers.position.set(side * 0.004, -0.020, -0.100);
    fingers.rotation.x = -0.62;
    g.add(fingers);
    const tips = new THREE.Mesh(rb(0.062, 0.030, 0.040, 0.013, 0.006), M.glove);
    tips.position.set(side * 0.004, -0.062, -0.116);
    tips.rotation.x = -0.10;
    g.add(tips);
  }

  // 親指（反対の手とは逆側へ）
  const thumb1 = new THREE.Mesh(rb(0.024, 0.026, 0.050, 0.011, 0.005), M.glove);
  thumb1.position.set(side * 0.036, -0.006, -0.052);
  thumb1.rotation.set(-0.25, side * -0.5, 0);
  g.add(thumb1);
  const thumb2 = new THREE.Mesh(rb(0.021, 0.022, 0.042, 0.010, 0.004), M.glove);
  thumb2.position.set(side * 0.050, -0.014, -0.086);
  thumb2.rotation.set(-0.55, side * -0.7, 0);
  g.add(thumb2);

  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
  });
  return g;
}

/**
 * 武器ごとの手の位置。
 *
 * モデル側のアンカーには grip が 2 挺分しか無く、支え手の位置は
 * どこにも無い。銃ごとに握る所はまるで違う（P90 は本体上面を掴み、
 * M249 は提げ手を握り、拳銃は両手を重ねる）ので、
 * 「銃身の途中を機械的に選ぶ」やり方では必ずどこかが破綻する。
 * ここに実銃の持ち方を 1 挺ずつ書く。
 *
 *   grip     … 引き金を引く手。銃のローカル座標
 *   support  … 支える手
 *   gripRot / supportRot … 手首の傾き [x, y, z]
 *   supportGrip … 支え手の握りの種類
 */
export const HAND_POSE = {
  //           grip                     support                  gripRot            supportRot
  ak47:    { grip: [0, -0.058, 0.074], support: [0, -0.052, -0.208], gripRot: [0.16, 0, 0], supportRot: [0.30, 0, 0] },
  m4a1:    { grip: [0, -0.052, 0.082], support: [0, -0.046, -0.196], gripRot: [0.16, 0, 0], supportRot: [0.30, 0, 0] },
  scarh:   { grip: [0, -0.056, 0.080], support: [0, -0.048, -0.214], gripRot: [0.16, 0, 0], supportRot: [0.30, 0, 0] },
  mp5:     { grip: [0, -0.050, 0.036], support: [0, -0.044, -0.126], gripRot: [0.16, 0, 0], supportRot: [0.34, 0, 0] },
  // P90 は本体そのものを上から掴む。支え手は前方の窪みへ
  p90:     { grip: [0, -0.030, 0.052], support: [0, -0.026, -0.062], gripRot: [0.22, 0, 0], supportRot: [0.42, 0, 0] },
  // M249 は上部の提げ手を握り、支え手は二脚の付け根あたり
  m249:    { grip: [0, -0.052, 0.104], support: [0, 0.052, -0.150], gripRot: [0.16, 0, 0], supportRot: [0.55, 0, 0] },
  sniper:  { grip: [0, -0.056, 0.070], support: [0, -0.040, -0.242], gripRot: [0.16, 0, 0], supportRot: [0.28, 0, 0] },
  shotgun: { grip: [0, -0.052, 0.058], support: [0, -0.058, -0.214], gripRot: [0.16, 0, 0], supportRot: [0.24, 0, 0] },
  // 拳銃は両手を重ねる。支え手は握りのすぐ横
  pistol:  { grip: [0, -0.036, 0.038], support: [-0.052, -0.048, 0.016], gripRot: [0.10, 0, 0], supportRot: [0.10, 0, 0.30] },
  glock17: { grip: [0, -0.040, 0.036], support: [-0.052, -0.052, 0.014], gripRot: [0.10, 0, 0], supportRot: [0.10, 0, 0.30] },
};

/**
 * 手袋・袖のマテリアル一式。
 *
 * 手はカメラから 30cm ほどの所にあり、画面上でいちばん大きく映る。
 * 単色で塗ると必ずマネキンに見えるので、
 * 織り目のある材質（コーデュラ・迷彩布）を使う。
 * リピートは部材の実寸に合わせて詰めてある。
 */
export function handMaterials(mats) {
  return {
    glove: mats.get('corduraTan', { repeat: [7, 7] }),
    knuckle: mats.get('polymer', { repeat: [9, 9] }),
    sleeve: mats.get('camo', { repeat: [4.5, 4.5] }),
    cuff: mats.get('corduraOD', { repeat: [6, 6] }),
  };
}
