import * as THREE from 'three';
import { SURFACE } from '../Physics.js';

/**
 * 家具と、室内に散らばる物。
 *
 * interior.js が「動かせない設備」（便器・流し・洗濯機・エアコン）なのに対し、
 * ここは「引っ越しのときに運ぶもの」を集める。
 *
 * 部屋が空に見える原因は、たいてい大物が足りないことではない。
 * たんすとベッドを置いても、床に何も落ちておらず、壁に何も掛かっておらず、
 * スイッチもコンセントも無い部屋は、まだ誰も住んでいない。
 * 大物 1 点より、小物 5 点のほうが「使われている」感じは出る。
 *
 * 座標の規約は Props.js と同じ。
 *   at(lx, lz) はローカル（右, 手前）→ ワールド
 *   yaw は「その物の正面が向く向き」で、法線は (sin yaw, 0, cos yaw)
 *
 * 当たり判定の付けかた。
 *   ・腰より高い物 …… コライダを付ける（回り込ませる）
 *   ・膝より低い物 …… 付けない（またげる。座卓や座布団で足を止めない）
 *   ・壁に張り付く薄物 …… 付けない（部屋が狭くなるだけで得が無い）
 * 扉の正面 1.5m には何も置かないこと。ここを塞ぐと部屋へ入れなくなる。
 */

const local = (x, z, yaw) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
};

/* ================================================================= *
 *  床まわり（和室）
 * ================================================================= */

/**
 * 畳を敷く。
 *
 * 1 枚 91 × 182cm。長辺と短辺を交互に組み、隣り合う畳の
 * い草の向きを 90 度変える。この向きの違いが光を受けて
 * 市松に見えるのが畳敷きの見えかたで、
 * 同じ向きで敷き詰めるとただの緑の床になる。
 *
 * @param {object} o {x, z, w, d, y, yaw, edge}
 */
export function tatamiArea(b, o) {
  const { x, z, w = 3.64, d = 3.64, y = 0, edge = 'melamineDark' } = o;
  const MW = 0.91, ML = 1.82;
  const TH = 0.055;                     // 畳の厚み（縁を立たせるため薄めに）

  // 下地（畳の隙間から黒が覗く）
  b.box({ x, y: y + TH / 2, z, w, h: TH, d, mat: 'woodDark', surface: SURFACE.WOOD, collide: false });

  /*
   * 敷きかた。
   * 縦に 2 枚並べた列と、横に 2 枚重ねた列を交互にする。
   * 実際の「田の字」ではないが、向きが交互に入るので
   * 遠目には正しい市松に見える。
   */
  const cols = Math.max(1, Math.round(w / MW));
  const colW = w / cols;
  let placed = 0;
  for (let c = 0; c < cols; c++) {
    const cx = x - w / 2 + colW * (c + 0.5);
    const rows = Math.max(1, Math.round(d / ML));
    const rowD = d / rows;
    for (let r = 0; r < rows; r++) {
      const cz = z - d / 2 + rowD * (r + 0.5);
      // 1 枚ごとに 90 度回して、い草の向きを変える
      const turn = ((c + r) % 2) === 0;
      const mat = ((c * 3 + r * 5) % 4) === 0 ? 'tatamiWorn' : 'tatami';
      b.box({
        x: cx, y: y + TH + 0.008, z: cz,
        w: colW - 0.014, h: 0.018, d: rowD - 0.014,
        yaw: turn ? 0 : Math.PI / 2,
        mat, surface: SURFACE.FABRIC, collide: false,
      });
      // 縁（長辺の 2 本だけ。短辺には縁が付かない）
      const ex = turn ? colW - 0.014 : 0.045;
      const ed = turn ? 0.045 : rowD - 0.014;
      for (const s of [-1, 1]) {
        b.box({
          x: cx + (turn ? 0 : s * (colW / 2 - 0.03)),
          y: y + TH + 0.010,
          z: cz + (turn ? s * (rowD / 2 - 0.03) : 0),
          w: ex, h: 0.016, d: ed,
          mat: edge, surface: SURFACE.FABRIC, collide: false,
        });
      }
      placed++;
    }
  }
  // 床としての当たり判定は 1 枚にまとめる（畳ごとに持たせても意味が無い）
  b.physics.addBox(x, y + TH / 2, z, w / 2, TH / 2 + 0.02, d / 2, 0, { surface: SURFACE.FABRIC });
  return b;
}

/**
 * 座卓（こたつ）。
 *
 * 高さ 38cm。膝より低いので当たり判定は付けない。
 * 付けると、部屋の真ん中に見えない柵が立つことになる。
 */
export function lowTable(b, o) {
  const {
    x, y = 0, z, yaw = 0, w = 1.05, d = 0.75, h = 0.38,
    mat = 'woodFineDark', kotatsu = false,
  } = o;
  const at = local(x, z, yaw);

  if (kotatsu) {
    // 掛け布団（天板の下から四方へ垂れる）
    b.box({ x, y: y + 0.14, z, w: w + 0.62, h: 0.28, d: d + 0.62, yaw,
      mat: 'bedding', surface: SURFACE.FABRIC, collide: false });
    b.box({ x, y: y + 0.30, z, w: w + 0.50, h: 0.06, d: d + 0.50, yaw,
      mat: 'bedding', surface: SURFACE.FABRIC, collide: false });
  }
  // 天板（縁を面取りしたように 2 段）
  b.box({ x, y: y + h - 0.018, z, w, h: 0.036, d, yaw, mat, surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + h - 0.048, z, w: w - 0.05, h: 0.026, d: d - 0.05, yaw,
    mat, surface: SURFACE.WOOD, collide: false });
  // 脚（内側に寄せる）
  for (const lx of [-w / 2 + 0.11, w / 2 - 0.11]) {
    for (const lz of [-d / 2 + 0.10, d / 2 - 0.10]) {
      const [px, pz] = at(lx, lz);
      b.box({ x: px, y: y + (h - 0.07) / 2, z: pz, w: 0.052, h: h - 0.07, d: 0.052, yaw,
        mat, surface: SURFACE.WOOD, collide: false });
    }
  }
  // 貫（脚を繋ぐ横木。無いと 4 本の棒が浮いて見える）
  for (const s of [-1, 1]) {
    const [ax, az] = at(0, s * (d / 2 - 0.10));
    b.box({ x: ax, y: y + 0.11, z: az, w: w - 0.24, h: 0.028, d: 0.022, yaw,
      mat, surface: SURFACE.WOOD, collide: false });
  }
  return b;
}

/**
 * 座布団。
 * 4 隅を絞った形。ただの平板だと発泡スチロールに見える。
 */
export function floorCushion(b, o) {
  const { x, y = 0, z, yaw = 0, mat = 'upholstery', size = 0.55 } = o;
  const S = size;
  // 本体（中央が厚い）
  b.box({ x, y: y + 0.035, z, w: S, h: 0.07, d: S, yaw, mat, surface: SURFACE.FABRIC, collide: false });
  b.box({ x, y: y + 0.078, z, w: S - 0.10, h: 0.024, d: S - 0.10, yaw,
    mat, surface: SURFACE.FABRIC, collide: false });
  // 四隅の房
  const at = local(x, z, yaw);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = at(sx * (S / 2 - 0.03), sz * (S / 2 - 0.03));
      b.cylinder({ x: px, y: y + 0.055, z: pz, radius: 0.018, height: 0.03, segments: 6,
        mat: 'fabric', surface: SURFACE.FABRIC, collide: false });
    }
  }
  // 中央の締め（綴じ糸）
  b.cylinder({ x, y: y + 0.088, z, radius: 0.012, height: 0.012, segments: 6,
    mat: 'fabric', surface: SURFACE.FABRIC, collide: false });
  return b;
}

/* ================================================================= *
 *  建具
 * ================================================================= */

/**
 * 引き戸（襖・障子）。
 *
 * 開き戸と違って引き込むので、開いていても通路を塞がない。
 * 狭い部屋を仕切るのに要る。
 *
 * @param {object} o {x, y, z, yaw, w, h, open, kind}
 *   kind 'fusuma'（襖）| 'shoji'（障子）| 'glass'（ガラス戸）
 *   open 0=閉、1=片側へ引き切る
 */
export function slidingDoor(b, o) {
  const {
    x, y = 0, z, yaw = 0, w = 1.70, h = 1.95, open = 0.0, kind = 'fusuma',
  } = o;
  const at = local(x, z, yaw);
  const leafW = w / 2;

  // 敷居と鴨居
  b.box({ x, y: y + 0.012, z, w, h: 0.024, d: 0.10, yaw,
    mat: 'woodFineDark', surface: SURFACE.WOOD, collide: false });
  b.box({ x, y: y + h + 0.03, z, w: w + 0.08, h: 0.06, d: 0.10, yaw,
    mat: 'woodFineDark', surface: SURFACE.WOOD, collide: false });
  // 竪枠
  for (const s of [-1, 1]) {
    const [px, pz] = at(s * (w / 2 + 0.03), 0);
    b.box({ x: px, y: y + (h + 0.06) / 2, z: pz, w: 0.06, h: h + 0.06, d: 0.11, yaw,
      mat: 'woodFineDark', surface: SURFACE.WOOD, collide: false });
  }

  /*
   * 2 枚建て。閉のときは左右に 1 枚ずつ、
   * 開くと左の戸が右の戸の裏へ滑り込む。
   * 前後に 3cm ずらして、2 本の溝に入っているのを見せる。
   */
  const slide = open * leafW;
  for (let i = 0; i < 2; i++) {
    const front = i === 0;
    const lx = (i === 0 ? -leafW / 2 + slide : leafW / 2);
    const [px, pz] = at(lx, front ? 0.028 : -0.028);
    const face = kind === 'shoji' ? 'shojiPaper' : (kind === 'glass' ? 'windowGlass' : 'wallpaperWarm');

    if (kind === 'shoji' || kind === 'glass') {
      /*
       * 障子は框と組子（桟）が見えないと障子にならない。
       * 白い板を立てただけでは、白く塗った襖と区別が付かない。
       */
      if (kind === 'shoji') {
        b.box({ x: px, y: y + h / 2, z: pz, w: leafW - 0.02, h: h - 0.02, d: 0.008, yaw,
          mat: 'shojiPaper', surface: SURFACE.WOOD, collide: false });
      } else {
        const g = new THREE.BoxGeometry(leafW - 0.06, h - 0.10, 0.006);
        g.rotateY(yaw); g.translate(px, y + h / 2, pz);
        b.addExtra(new THREE.Mesh(g, b.mats.windowGlass({ opacity: 0.34 })));
      }
      // 組子（縦 3 本 / 横 7 本）
      const nV = 3, nH = 7;
      for (let k = 1; k <= nV; k++) {
        const ox = -leafW / 2 + (leafW / (nV + 1)) * k;
        const [gx, gz] = at(lx + ox, (front ? 0.028 : -0.028) + 0.008);
        b.box({ x: gx, y: y + h / 2, z: gz, w: 0.016, h: h - 0.09, d: 0.014, yaw,
          mat: 'woodFine', surface: SURFACE.WOOD, collide: false });
      }
      for (let k = 1; k <= nH; k++) {
        const oy = (h / (nH + 1)) * k;
        const [gx, gz] = at(lx, (front ? 0.028 : -0.028) + 0.008);
        b.box({ x: gx, y: y + oy, z: gz, w: leafW - 0.07, h: 0.014, d: 0.014, yaw,
          mat: 'woodFine', surface: SURFACE.WOOD, collide: false });
      }
    } else {
      // 襖（紙の面と、細い縁）
      b.box({ x: px, y: y + h / 2, z: pz, w: leafW - 0.02, h: h - 0.02, d: 0.020, yaw,
        mat: face, surface: SURFACE.WOOD, collide: false });
    }
    // 框（四周の縁。上下は太く、左右は細い）
    for (const s of [-1, 1]) {
      const [fx, fz] = at(lx + s * (leafW / 2 - 0.022), front ? 0.028 : -0.028);
      b.box({ x: fx, y: y + h / 2, z: fz, w: 0.036, h, d: 0.026, yaw,
        mat: 'woodFineDark', surface: SURFACE.WOOD, collide: false });
    }
    for (const oy of [0.022, h - 0.022]) {
      b.box({ x: px, y: y + oy, z: pz, w: leafW - 0.02, h: 0.044, d: 0.026, yaw,
        mat: 'woodFineDark', surface: SURFACE.WOOD, collide: false });
    }
    // 引き手（襖は椀型の窪み、障子は縦の欠き取り）
    const [hx, hz] = at(lx + (i === 0 ? leafW / 2 - 0.12 : -leafW / 2 + 0.12),
      (front ? 0.028 : -0.028) + 0.012);
    b.box({ x: hx, y: y + h * 0.42, z: hz, w: 0.075, h: 0.115, d: 0.006, yaw,
      mat: kind === 'fusuma' ? 'brass' : 'woodFineDark', surface: SURFACE.METAL, collide: false });
  }

  /*
   * 当たり判定は「閉まっている側」にだけ付ける。
   * 開いた戸は引き込まれて壁と重なるので、そこに壁を足すと
   * 開いているのに通れない戸になる。
   */
  if (open < 0.75) {
    const [cxx, czz] = at(-leafW / 2 + slide, 0);
    b.physics.addBox(cxx, y + h / 2, czz, (leafW - 0.02) / 2, h / 2, 0.035, yaw,
      { surface: SURFACE.WOOD, penetration: 0.9 });
  }
  const [c2x, c2z] = at(leafW / 2, 0);
  b.physics.addBox(c2x, y + h / 2, c2z, (leafW - 0.02) / 2, h / 2, 0.035, yaw,
    { surface: SURFACE.WOOD, penetration: 0.9 });
  return b;
}

/* ================================================================= *
 *  壁に付くもの
 * ================================================================= */

/**
 * スイッチとコンセント。
 *
 * これが無いのが、室内が「模型」に見える最大の理由。
 * 実際の部屋には、扉の脇に必ずスイッチがあり、
 * 壁の下端 25cm にコンセントが並んでいる。
 * 1 点 3cm の物だが、有無で部屋の説得力が変わる。
 *
 * @param {object} o {x, y, z, yaw, kind}
 *   kind 'switch'（スイッチ）| 'outlet'（コンセント）
 */
export function switchPlate(b, o) {
  const { x, y = 1.2, z, yaw = 0, kind = 'switch', gangs = 1 } = o;
  const at = local(x, z, yaw);
  const W = kind === 'switch' ? 0.070 + (gangs - 1) * 0.036 : 0.070;
  const H = kind === 'switch' ? 0.120 : 0.120;

  // 化粧プレート（壁から 8mm）
  const [px, pz] = at(0, 0.005);
  b.box({ x: px, y, z: pz, w: W, h: H, d: 0.010, yaw,
    mat: 'plasticGloss', surface: SURFACE.METAL, collide: false });
  if (kind === 'switch') {
    for (let i = 0; i < gangs; i++) {
      const ox = -W / 2 + (W / gangs) * (i + 0.5);
      const [sx, sz] = at(ox, 0.012);
      // 押し板（下側がわずかに出る＝消灯の状態）
      b.box({ x: sx, y, z: sz, w: W / gangs - 0.010, h: H - 0.026, d: 0.008, yaw, rx: 0.06,
        mat: 'plasticGloss', surface: SURFACE.METAL, collide: false });
      // ほたる（消灯時に光る小窓）
      const [nx2, nz2] = at(ox, 0.017);
      b.box({ x: nx2, y: y - 0.030, z: nz2, w: 0.010, h: 0.005, d: 0.003, yaw,
        mat: 'emissive', surface: SURFACE.GLASS, collide: false });
    }
  } else {
    // 差込口 2 口（縦長の穴を 2 対）
    for (const oy of [0.026, -0.026]) {
      for (const ox of [-0.0105, 0.0105]) {
        const [hx, hz] = at(ox, 0.013);
        b.box({ x: hx, y: y + oy, z: hz, w: 0.0055, h: 0.017, d: 0.004, yaw,
          mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
      }
    }
  }
  return b;
}

/**
 * 住宅用火災警報器。
 * 天井に付く直径 10cm の円盤。無いと天井がのっぺりする。
 */
export function smokeAlarm(b, o) {
  const { x, y, z } = o;
  b.cylinder({ x, y: y - 0.032, z, radius: 0.050, height: 0.032, segments: 16,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: y - 0.046, z, radius: 0.034, height: 0.015, segments: 14,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  // 通気の溝と、赤い作動表示
  b.mesh('plasticBlack', new THREE.TorusGeometry(0.042, 0.004, 4, 18),
    { x, y: y - 0.030, z, rx: Math.PI / 2 });
  b.box({ x: x + 0.026, y: y - 0.048, z, w: 0.008, h: 0.004, d: 0.008,
    mat: 'reflectorRed', surface: SURFACE.GLASS, collide: false });
  return b;
}

/**
 * 額縁（絵・写真）。
 * 掛け軸にもできるよう、縦横比と縁の太さを外から決める。
 */
export function framedPicture(b, o) {
  const {
    x, y = 1.55, z, yaw = 0, w = 0.46, h = 0.60,
    frame = 'woodFineDark', art = 'posterWall',
  } = o;
  const at = local(x, z, yaw);
  const F = Math.max(0.022, Math.min(w, h) * 0.075);

  // 額の外枠（4 本）
  for (const s of [-1, 1]) {
    const [px, pz] = at(s * (w / 2 - F / 2), 0.014);
    b.box({ x: px, y, z: pz, w: F, h, d: 0.028, yaw, mat: frame, surface: SURFACE.WOOD, collide: false });
    b.box({ x, y: y + s * (h / 2 - F / 2), z: at(0, 0.014)[1], w, h: F, d: 0.028, yaw,
      mat: frame, surface: SURFACE.WOOD, collide: false });
  }
  {
    const [px, pz] = at(0, 0.014);
    b.box({ x: px, y: y + (h / 2 - F / 2), z: pz, w, h: F, d: 0.028, yaw,
      mat: frame, surface: SURFACE.WOOD, collide: false });
    b.box({ x: px, y: y - (h / 2 - F / 2), z: pz, w, h: F, d: 0.028, yaw,
      mat: frame, surface: SURFACE.WOOD, collide: false });
    // 台紙と絵
    b.box({ x: px, y, z: pz, w: w - F * 1.6, h: h - F * 1.6, d: 0.006, yaw,
      mat: 'paperPrint', surface: SURFACE.WOOD, collide: false });
    const [ax, az] = at(0, 0.018);
    b.box({ x: ax, y, z: az, w: w - F * 3.0, h: h - F * 3.0, d: 0.004, yaw,
      mat: art, surface: SURFACE.WOOD, collide: false });
  }
  return b;
}

/** 壁付けの棚（1 枚板とブラケット） */
export function wallShelf(b, o) {
  const { x, y = 1.35, z, yaw = 0, w = 0.80, d = 0.22, mat = 'woodFine' } = o;
  const at = local(x, z, yaw);
  const [px, pz] = at(0, d / 2);
  b.box({ x: px, y, z: pz, w, h: 0.024, d, yaw, mat, surface: SURFACE.WOOD, collide: false });
  for (const s of [-1, 1]) {
    const [bx, bz] = at(s * (w / 2 - 0.09), d / 2 - 0.02);
    // L 字の金物（縦と横の 2 本で近似）
    b.box({ x: bx, y: y - 0.055, z: bz, w: 0.014, h: 0.10, d: 0.018, yaw,
      mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
    const [cx2, cz2] = at(s * (w / 2 - 0.09), d / 2 - 0.06);
    b.box({ x: cx2, y: y - 0.014, z: cz2, w: 0.014, h: 0.014, d: d - 0.06, yaw,
      mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/* ================================================================= *
 *  収納
 * ================================================================= */

/**
 * カラーボックス。
 * 3 段の棚に、本と収納箱がまばらに入る。
 * 空の棚は「置いただけ」に見えるので、中身は必ず入れる。
 */
export function cubeShelf(b, o) {
  const { x, y = 0, z, yaw = 0, tiers = 3, mat = 'melaminePale', seed = 1 } = o;
  const at = local(x, z, yaw);
  const W = 0.42, D = 0.29, T = 0.018;
  const cell = 0.29;
  const H = cell * tiers + T * (tiers + 1);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  // 側板・天板・地板・棚板
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (W / 2 - T / 2), 0);
    b.box({ x: px, y: y + H / 2, z: pz, w: T, h: H, d: D, yaw, mat, surface: SURFACE.WOOD, collide: false });
  }
  for (let i = 0; i <= tiers; i++) {
    const sy = y + T / 2 + i * (cell + T);
    b.box({ x, y: sy, z, w: W, h: T, d: D, yaw, mat, surface: SURFACE.WOOD, collide: false });
  }
  // 背板（薄いベニヤ。無いと向こうが透けて張りぼてに見える）
  const [bx, bz] = at(0, -D / 2 + 0.004);
  b.box({ x: bx, y: y + H / 2, z: bz, w: W - T, h: H - T, d: 0.005, yaw,
    mat: 'plywood', surface: SURFACE.WOOD, collide: false });

  // 中身
  const bookMats = ['paperPrint', 'cardboard', 'melamineDark', 'woodFine', 'plasticGloss'];
  for (let i = 0; i < tiers; i++) {
    const base = y + T + i * (cell + T);
    if (rnd() < 0.3) {
      // 収納箱
      const [ox, oz] = at(0, 0.01);
      b.box({ x: ox, y: base + 0.115, z: oz, w: W - 0.05, h: 0.23, d: D - 0.05, yaw,
        mat: rnd() < 0.5 ? 'cardboard' : 'plasticGrey', surface: SURFACE.WOOD, collide: false });
      continue;
    }
    // 本を左から詰める（右端は空けて、倒れた本を寝かせる）
    let cur = -W / 2 + T + 0.012;
    while (cur < W / 2 - T - 0.10) {
      const t = 0.014 + rnd() * 0.032;
      const bh = 0.17 + rnd() * 0.075;
      const [px, pz] = at(cur + t / 2, 0.012);
      b.box({ x: px, y: base + bh / 2, z: pz, w: t, h: bh, d: D - 0.07, yaw,
        mat: bookMats[Math.floor(rnd() * bookMats.length)], surface: SURFACE.WOOD, collide: false });
      cur += t + 0.002;
      if (rnd() < 0.12) break;                    // 途中で途切れる棚もある
    }
    if (rnd() < 0.45) {
      // 余りに寝かせた本
      const [px, pz] = at(W / 2 - T - 0.075, 0.012);
      b.box({ x: px, y: base + 0.021, z: pz, w: 0.13, h: 0.042, d: D - 0.08, yaw,
        mat: bookMats[Math.floor(rnd() * bookMats.length)], surface: SURFACE.WOOD, collide: false });
    }
  }
  b.physics.addBox(x, y + H / 2, z, W / 2, H / 2, D / 2, yaw, { surface: SURFACE.WOOD, penetration: 0.65 });
  return b;
}

/**
 * 衣装ケースの積み（透明の引き出し）。
 * 押入れや部屋の隅にある。3 段くらい積まれているのが普通。
 */
export function storageBins(b, o) {
  const { x, y = 0, z, yaw = 0, tiers = 3, w = 0.52, d = 0.40 } = o;
  const at = local(x, z, yaw);
  const H = 0.23;
  for (let i = 0; i < tiers; i++) {
    const base = y + i * (H + 0.006);
    // 枠（半透明の乳白色）
    b.box({ x, y: base + H / 2, z, w, h: H, d, yaw,
      mat: 'plasticGrey', surface: SURFACE.RUBBER, collide: false });
    // 引き出しの前板（少しだけ手前に出る）
    const [fx, fz] = at(0, d / 2 + 0.008);
    b.box({ x: fx, y: base + H / 2, z: fz, w: w - 0.02, h: H - 0.022, d: 0.014, yaw,
      mat: 'acrylic', surface: SURFACE.GLASS, collide: false });
    // 取っ手
    const [hx, hz] = at(0, d / 2 + 0.022);
    b.box({ x: hx, y: base + H - 0.05, z: hz, w: w * 0.42, h: 0.026, d: 0.016, yaw,
      mat: 'plasticGrey', surface: SURFACE.RUBBER, collide: false });
    // 中身（畳んだ衣類がぼんやり透ける）
    b.box({ x, y: base + 0.075, z, w: w - 0.06, h: 0.11, d: d - 0.06, yaw,
      mat: i % 2 ? 'fabric' : 'upholsteryBlue', surface: SURFACE.FABRIC, collide: false });
  }
  const H2 = tiers * (H + 0.006);
  b.physics.addBox(x, y + H2 / 2, z, w / 2, H2 / 2, d / 2, yaw, { surface: SURFACE.RUBBER, penetration: 0.85 });
  return b;
}

/**
 * ハンガーラック。
 * 掛かっている服の裾がそろっていないほど本物に見える。
 */
export function clothesRack(b, o) {
  const { x, y = 0, z, yaw = 0, w = 1.05, h = 1.65, seed = 3 } = o;
  const at = local(x, z, yaw);
  let s = seed * 7919 + 13;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  // 脚（キャスター付きの T 字）
  for (const sx of [-1, 1]) {
    const [px, pz] = at(sx * (w / 2 - 0.03), 0);
    b.cylinder({ x: px, y, z: pz, radius: 0.016, height: h, segments: 8,
      mat: 'chrome', surface: SURFACE.METAL, collide: false });
    b.box({ x: px, y: y + 0.035, z: pz, w: 0.045, h: 0.028, d: 0.52, yaw,
      mat: 'chrome', surface: SURFACE.METAL, collide: false });
    for (const sz of [-1, 1]) {
      const [wx, wz] = at(sx * (w / 2 - 0.03), sz * 0.24);
      b.cylinder({ x: wx, y, z: wz, radius: 0.017, height: 0.035, segments: 7,
        mat: 'plasticBlack', surface: SURFACE.RUBBER, collide: false });
    }
  }
  // 横棒
  b.box({ x, y: y + h - 0.02, z, w, h: 0.032, d: 0.032, yaw,
    mat: 'chrome', surface: SURFACE.METAL, collide: false });

  // 掛かった服
  const cloth = ['fabric', 'upholsteryBlue', 'upholsteryOlive', 'bedding', 'corduraOD', 'burlap'];
  let cur = -w / 2 + 0.10;
  while (cur < w / 2 - 0.10) {
    const t = 0.045 + rnd() * 0.05;
    const len = 0.62 + rnd() * 0.45;
    const [px, pz] = at(cur + t / 2, 0);
    // ハンガーの肩
    b.box({ x: px, y: y + h - 0.09, z: pz, w: t + 0.05, h: 0.055, d: 0.10, yaw, rz: (rnd() - 0.5) * 0.1,
      mat: cloth[Math.floor(rnd() * cloth.length)], surface: SURFACE.FABRIC, collide: false });
    // 身頃
    b.box({ x: px, y: y + h - 0.09 - len / 2, z: pz, w: t, h: len, d: 0.125, yaw,
      mat: cloth[Math.floor(rnd() * cloth.length)], surface: SURFACE.FABRIC, collide: false });
    // フック
    b.mesh('chrome', new THREE.TorusGeometry(0.019, 0.0035, 4, 10),
      { x: px, y: y + h - 0.035, z: pz, ry: yaw });
    cur += t + 0.008 + rnd() * 0.02;
  }
  b.physics.addBox(x, y + h / 2, z, w / 2, h / 2, 0.28, yaw, { surface: SURFACE.FABRIC, penetration: 0.9 });
  return b;
}

/** 床に積んだ本と雑誌（膝より低いので当たり判定は付けない） */
export function bookStack(b, o) {
  const { x, y = 0, z, yaw = 0, count = 7, seed = 11 } = o;
  let s = seed * 4703 + 91;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const mats = ['paperPrint', 'cardboard', 'melamineDark', 'woodFine', 'plasticGloss', 'posterWall'];
  let cy = y;
  for (let i = 0; i < count; i++) {
    const t = 0.012 + rnd() * 0.026;
    const w = 0.15 + rnd() * 0.055;
    const d = 0.21 + rnd() * 0.045;
    // 積むほど少しずつずれる
    b.box({
      x: x + (rnd() - 0.5) * 0.035, y: cy + t / 2, z: z + (rnd() - 0.5) * 0.035,
      w, h: t, d, yaw: yaw + (rnd() - 0.5) * 0.30,
      mat: mats[Math.floor(rnd() * mats.length)], surface: SURFACE.WOOD, collide: false,
    });
    cy += t;
  }
  return b;
}

/* ================================================================= *
 *  照明・鏡
 * ================================================================= */

/** フロアランプ（3 本脚・布のシェード・点灯） */
export function floorLamp(b, o) {
  const { x, y = 0, z, h = 1.55, lit = true } = o;
  // 台
  b.cylinder({ x, y, z, radius: 0.15, height: 0.022, segments: 16,
    mat: 'darkSteel', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: y + 0.022, z, radius: 0.028, height: h - 0.30, segments: 10,
    mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  // シェード（上が細い円錐台。円柱 2 段で近似）
  const sy = y + h - 0.28;
  b.mesh('curtainFabric', new THREE.CylinderGeometry(0.13, 0.20, 0.26, 18, 1, true),
    { x, y: sy + 0.13, z });
  // 内側（明るい面。開口から覗く）
  b.mesh('whitePaint', new THREE.CylinderGeometry(0.128, 0.198, 0.255, 18, 1, true),
    { x, y: sy + 0.13, z, sx: -1 });
  if (lit) {
    b.cylinder({ x, y: sy + 0.05, z, radius: 0.05, height: 0.10, segments: 10,
      mat: 'emissive', surface: SURFACE.GLASS, collide: false });
    b.light({ x, y: sy + 0.10, z, color: 0xffd9a4, intensity: 0.85, distance: 4.2 });
  }
  return b;
}

/** 姿見（立て掛ける鏡。映り込みは環境マップに任せる） */
export function standingMirror(b, o) {
  const { x, y = 0, z, yaw = 0, w = 0.44, h = 1.50, frame = 'woodFine' } = o;
  const at = local(x, z, yaw);
  // 少し後ろへ倒す
  const tilt = -0.07;
  b.box({ x, y: y + h / 2, z, w: w + 0.06, h: h + 0.06, d: 0.035, yaw, rx: tilt,
    mat: frame, surface: SURFACE.WOOD, collide: false });
  const [px, pz] = at(0, 0.024);
  const g = new THREE.BoxGeometry(w, h, 0.008);
  g.rotateX(tilt); g.rotateY(yaw); g.translate(px, y + h / 2, pz);
  const mm = b.mats.chrome();
  b.addExtra(new THREE.Mesh(g, mm));
  // 突っ張りの脚
  const [lx, lz] = at(0, -0.18);
  b.box({ x: lx, y: y + 0.30, z: lz, w: 0.05, h: 0.60, d: 0.03, yaw, rx: 0.36,
    mat: frame, surface: SURFACE.WOOD, collide: false });
  b.physics.addBox(x, y + h / 2, z, (w + 0.06) / 2, h / 2, 0.16, yaw,
    { surface: SURFACE.GLASS, penetration: 0.95 });
  return b;
}

/* ================================================================= *
 *  家電
 * ================================================================= */

/** 扇風機（首振りの支柱・羽根・ガード） */
export function electricFan(b, o) {
  const { x, y = 0, z, yaw = 0, h = 0.78 } = o;
  const at = local(x, z, yaw);
  // 台
  b.cylinder({ x, y, z, radius: 0.16, height: 0.045, segments: 18,
    mat: 'applianceWhite', surface: SURFACE.RUBBER, collide: false });
  // 操作ボタン（台の上面に 4 つ並ぶ）
  for (let i = 0; i < 4; i++) {
    const [bx, bz] = at(-0.06 + i * 0.04, 0.075);
    b.box({ x: bx, y: y + 0.052, z: bz, w: 0.026, h: 0.012, d: 0.026, yaw,
      mat: i === 0 ? 'plasticGlossRed' : 'plasticGrey', surface: SURFACE.METAL, collide: false });
  }
  // 支柱（伸縮の継ぎ目を出す）
  b.cylinder({ x, y: y + 0.045, z, radius: 0.030, height: h * 0.45, segments: 12,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: y + 0.045 + h * 0.45, z, radius: 0.022, height: h * 0.42, segments: 12,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  const hy = y + h;
  // モーター
  const [mx, mz] = at(0, -0.03);
  b.cylinder({ x: mx, y: hy - 0.075, z: mz, radius: 0.055, height: 0.15, segments: 14,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  // 羽根（4 枚。傾けて放射に並べる）
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = 0.085;
    const [px, pz] = at(Math.cos(a) * r, 0.045);
    b.box({ x: px, y: hy + Math.sin(a) * r, z: pz, w: 0.10, h: 0.10, d: 0.006,
      yaw, rz: a + 0.5, rx: 0.22,
      mat: 'acrylic', surface: SURFACE.RUBBER, collide: false });
  }
  // ガード（同心の輪 3 本 + 中央の飾り）
  for (const rr of [0.085, 0.135, 0.180]) {
    const [gx, gz] = at(0, 0.055);
    b.mesh('chrome', new THREE.TorusGeometry(rr, 0.0035, 4, 22), { x: gx, y: hy, z: gz, ry: yaw + Math.PI / 2 });
  }
  {
    const [gx, gz] = at(0, 0.058);
    b.cylinder({ x: gx, y: hy - 0.022, z: gz, radius: 0.030, height: 0.044, segments: 12,
      mat: 'plasticGloss', surface: SURFACE.METAL, collide: false });
  }
  b.physics.addBox(x, y + h / 2, z, 0.19, h / 2, 0.19, 0, { surface: SURFACE.RUBBER, penetration: 0.95 });
  return b;
}

/** 炊飯器（蓋・蒸気口・操作パネル） */
export function riceCooker(b, o) {
  const { x, y, z, yaw = 0 } = o;
  const at = local(x, z, yaw);
  const W = 0.27, D = 0.34, H = 0.22;
  b.box({ x, y: y + H / 2, z, w: W, h: H, d: D, yaw,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  // 蓋（少しだけ小さく、上に載る）
  b.box({ x, y: y + H + 0.018, z, w: W - 0.02, h: 0.036, d: D - 0.02, yaw,
    mat: 'applianceGrey', surface: SURFACE.METAL, collide: false });
  // 蒸気口
  const [sx, sz] = at(0, -D / 2 + 0.07);
  b.cylinder({ x: sx, y: y + H + 0.036, z: sz, radius: 0.030, height: 0.022, segments: 12,
    mat: 'applianceGrey', surface: SURFACE.METAL, collide: false });
  // 操作パネルと表示窓
  const [px, pz] = at(0, D / 2 + 0.004);
  b.box({ x: px, y: y + H * 0.55, z: pz, w: W - 0.05, h: 0.075, d: 0.010, yaw,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  const [dx2, dz2] = at(-0.04, D / 2 + 0.010);
  b.box({ x: dx2, y: y + H * 0.57, z: dz2, w: 0.055, h: 0.028, d: 0.004, yaw,
    mat: 'screenPanel', surface: SURFACE.GLASS, collide: false });
  // 蓋を開けるボタン
  const [bx, bz] = at(0, D / 2 + 0.010);
  b.box({ x: bx, y: y + H - 0.022, z: bz, w: 0.05, h: 0.022, d: 0.008, yaw,
    mat: 'applianceGrey', surface: SURFACE.METAL, collide: false });
  return b;
}

/** 電気ポット（保温ポット。台所の定番） */
export function kettlePot(b, o) {
  const { x, y, z, yaw = 0 } = o;
  const at = local(x, z, yaw);
  b.cylinder({ x, y, z, radius: 0.098, height: 0.235, segments: 18,
    mat: 'applianceWhite', surface: SURFACE.METAL, collide: false });
  b.cylinder({ x, y: y + 0.235, z, radius: 0.104, height: 0.036, segments: 18,
    mat: 'applianceGrey', surface: SURFACE.METAL, collide: false });
  // 注ぎ口と、給湯ボタン
  const [sx, sz] = at(0, 0.098);
  b.box({ x: sx, y: y + 0.055, z: sz, w: 0.055, h: 0.075, d: 0.030, yaw,
    mat: 'applianceGrey', surface: SURFACE.METAL, collide: false });
  const [bx, bz] = at(0, 0.086);
  b.box({ x: bx, y: y + 0.185, z: bz, w: 0.05, h: 0.024, d: 0.020, yaw,
    mat: 'plasticGrey', surface: SURFACE.METAL, collide: false });
  // 水位窓
  const [wx, wz] = at(0.085, 0.048);
  b.box({ x: wx, y: y + 0.115, z: wz, w: 0.014, h: 0.15, d: 0.014, yaw,
    mat: 'acrylic', surface: SURFACE.GLASS, collide: false });
  // 取っ手
  b.mesh('plasticBlack', new THREE.TorusGeometry(0.055, 0.010, 5, 14),
    { x: at(0, -0.075)[0], y: y + 0.20, z: at(0, -0.075)[1], rx: Math.PI / 2, rz: Math.PI / 2, ry: yaw });
  return b;
}

/* ================================================================= *
 *  台所（設備というより什器に近いもの）
 * ================================================================= */

/**
 * ガスコンロ（2 口）。
 * 五徳と受け皿が無いと、黒い板を置いただけに見える。
 */
export function gasStove(b, o) {
  const { x, y, z, yaw = 0, w = 0.59, d = 0.45 } = o;
  const at = local(x, z, yaw);
  // 天板
  b.box({ x, y: y + 0.022, z, w, h: 0.044, d, yaw,
    mat: 'stainless', surface: SURFACE.METAL, collide: false });
  for (const sx of [-1, 1]) {
    const [bx, bz] = at(sx * w * 0.24, -0.02);
    // バーナー（受け皿・バーナーヘッド・五徳）
    b.cylinder({ x: bx, y: y + 0.040, z: bz, radius: 0.085, height: 0.008, segments: 18,
      mat: 'darkSteel', surface: SURFACE.METAL, collide: false });
    b.cylinder({ x: bx, y: y + 0.046, z: bz, radius: 0.048, height: 0.020, segments: 14,
      mat: 'castIron', surface: SURFACE.METAL, collide: false });
    b.cylinder({ x: bx, y: y + 0.064, z: bz, radius: 0.030, height: 0.012, segments: 12,
      mat: 'brass', surface: SURFACE.METAL, collide: false });
    // 五徳（4 本の爪）
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const [gx, gz] = at(sx * w * 0.24 + Math.cos(a) * 0.062, -0.02 + Math.sin(a) * 0.062);
      b.box({ x: gx, y: y + 0.072, z: gz, w: 0.070, h: 0.014, d: 0.014, yaw: yaw - a,
        mat: 'castIron', surface: SURFACE.METAL, collide: false });
    }
  }
  // グリルの扉
  const [fx, fz] = at(0, d / 2 + 0.005);
  b.box({ x: fx, y: y - 0.10, z: fz, w: w * 0.62, h: 0.17, d: 0.014, yaw,
    mat: 'darkSteel', surface: SURFACE.METAL, collide: false });
  const [hx, hz] = at(0, d / 2 + 0.020);
  b.box({ x: hx, y: y - 0.045, z: hz, w: w * 0.5, h: 0.020, d: 0.016, yaw,
    mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  // 点火つまみ
  for (const sx of [-1, 1]) {
    const [kx, kz] = at(sx * w * 0.30, d / 2 + 0.018);
    b.cylinder({ x: kx, y: y - 0.005, z: kz, radius: 0.024, height: 0.028, segments: 12,
      mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  }
  return b;
}

/**
 * レンジフード。
 * 台所の天井近くの空白を埋める。
 * 整流板・照明・ダクトの 3 点がそろって初めて換気設備に見える。
 */
export function rangeHood(b, o) {
  const { x, y = 1.55, z, yaw = 0, w = 0.75, d = 0.60, ceiling = 2.5 } = o;
  const at = local(x, z, yaw);
  // 幕板（フードから天井まで）
  b.box({ x, y: (y + 0.42 + ceiling) / 2, z: at(0, -d / 2 + 0.14)[1], w,
    h: Math.max(0.02, ceiling - y - 0.42), d: 0.28, yaw,
    mat: 'stainless', surface: SURFACE.METAL, collide: false });
  // 本体（傾いた面を持つ箱）
  b.box({ x, y: y + 0.21, z, w, h: 0.42, d, yaw,
    mat: 'stainless', surface: SURFACE.METAL, collide: false });
  // 整流板（下面から 2cm 下がって吊る）
  const [fx, fz] = at(0, 0.02);
  b.box({ x: fx, y: y - 0.022, z: fz, w: w - 0.05, h: 0.014, d: d - 0.06, yaw,
    mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  // 手前の縁（油受け）
  const [ex, ez] = at(0, d / 2 - 0.012);
  b.box({ x: ex, y: y + 0.012, z: ez, w, h: 0.028, d: 0.024, yaw,
    mat: 'brushedMetal', surface: SURFACE.METAL, collide: false });
  // 操作スイッチ
  const [sx2, sz2] = at(w / 2 - 0.13, d / 2 + 0.004);
  b.box({ x: sx2, y: y + 0.10, z: sz2, w: 0.18, h: 0.045, d: 0.010, yaw,
    mat: 'plasticGrey', surface: SURFACE.METAL, collide: false });
  // 照明（下向き。台所は必ずここが点いている）
  const [lx, lz] = at(0, d / 2 - 0.10);
  b.box({ x: lx, y: y - 0.030, z: lz, w: w * 0.42, h: 0.010, d: 0.075, yaw,
    mat: 'emissive', surface: SURFACE.GLASS, collide: false });
  b.light({ x: lx, y: y - 0.12, z: lz, color: 0xfff0d2, intensity: 0.55, distance: 2.6 });
  return b;
}

/* ================================================================= *
 *  机まわり
 * ================================================================= */

/**
 * 机の上の一式（画面・キーボード・本体・小物）。
 *
 * 机だけ置いても事務室にはならない。
 * 面の上に物が載っていることが、その机が使われている証拠になる。
 *
 * @param {object} o {x, y（天板の高さ）, z, yaw, seed}
 */
export function deskSetup(b, o) {
  const { x, y = 0.74, z, yaw = 0, seed = 2, tower = true } = o;
  const at = local(x, z, yaw);
  let s = seed * 6971 + 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  // 画面（台・支柱・パネル。わずかに内を向ける）
  const tilt = (rnd() - 0.5) * 0.22;
  const [mx, mz] = at(0.02, -0.20);
  b.box({ x: mx, y: y + 0.008, z: mz, w: 0.20, h: 0.016, d: 0.15, yaw: yaw + tilt,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  b.box({ x: mx, y: y + 0.10, z: mz, w: 0.045, h: 0.18, d: 0.035, yaw: yaw + tilt,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  b.box({ x: mx, y: y + 0.29, z: mz, w: 0.55, h: 0.33, d: 0.020, yaw: yaw + tilt, rx: -0.05,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  const [px, pz] = at(0.02, -0.20 + 0.013);
  b.box({ x: px, y: y + 0.295, z: pz, w: 0.52, h: 0.30, d: 0.006, yaw: yaw + tilt, rx: -0.05,
    mat: 'screenPanel', surface: SURFACE.GLASS, collide: false });

  // キーボードとマウス
  const [kx, kz] = at(0.0, 0.02);
  b.box({ x: kx, y: y + 0.011, z: kz, w: 0.40, h: 0.022, d: 0.135, yaw: yaw + (rnd() - 0.5) * 0.14, rx: -0.03,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });
  const [mox, moz] = at(0.29, 0.02);
  b.box({ x: mox, y: y + 0.014, z: moz, w: 0.058, h: 0.028, d: 0.098, yaw: yaw + (rnd() - 0.5) * 0.3,
    mat: 'plasticBlack', surface: SURFACE.METAL, collide: false });

  // 書類とマグ
  const [dx2, dz2] = at(-0.34, 0.03);
  for (let i = 0; i < 3 + Math.floor(rnd() * 4); i++) {
    b.box({ x: dx2 + (rnd() - 0.5) * 0.03, y: y + 0.002 + i * 0.0022, z: dz2 + (rnd() - 0.5) * 0.03,
      w: 0.21, h: 0.0022, d: 0.297, yaw: yaw + (rnd() - 0.5) * 0.22,
      mat: 'paperPrint', surface: SURFACE.WOOD, collide: false });
  }
  const [cx2, cz2] = at(-0.31, -0.16);
  b.cylinder({ x: cx2, y, z: cz2, radius: 0.041, height: 0.095, segments: 14,
    mat: 'porcelain', surface: SURFACE.GLASS, collide: false });
  b.mesh('porcelain', new THREE.TorusGeometry(0.028, 0.007, 4, 12),
    { x: cx2 + Math.cos(yaw) * 0.048, y: y + 0.055, z: cz2 - Math.sin(yaw) * 0.048, ry: yaw });

  // 本体（床置き）
  if (tower) {
    const [tx, tz] = at(0.42, -0.10);
    b.box({ x: tx, y: 0.20, z: tz, w: 0.19, h: 0.40, d: 0.42, yaw,
      mat: 'applianceGrey', surface: SURFACE.METAL, collide: false });
    const [fx2, fz2] = at(0.42 - 0.10, -0.10);
    b.box({ x: fx2, y: 0.20, z: fz2, w: 0.012, h: 0.36, d: 0.38, yaw,
      mat: 'perforatedMetal', surface: SURFACE.METAL, collide: false });
    b.box({ x: fx2, y: 0.35, z: fz2, w: 0.014, h: 0.010, d: 0.010, yaw,
      mat: 'emissive', surface: SURFACE.GLASS, collide: false });
  }
  return b;
}
