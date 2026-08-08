import * as THREE from 'three';
import { Engine, QUALITY } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Settings } from './core/Settings.js';
import { AudioManager } from './core/AudioManager.js';
import { MaterialLibrary } from './render/MaterialLibrary.js';
import { Game } from './game/Game.js';
import { GAME_MODES } from './game/GameModes.js';
import { BOT_GATE } from './ai/Bot.js';
import { HUD } from './ui/HUD.js';
import { Menu } from './ui/Menu.js';
import { MobileControls } from './ui/MobileControls.js';
import { MAPS, getMap, DEFAULT_MAP } from './world/maps/index.js';

/**
 * OPERATION CRIMSON — エントリポイント。
 * 起動 → スプラッシュ → メニュー → 試合 の流れを統括する。
 */

const boot = window.__boot;
const container = document.getElementById('app');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _sway = { x: 0, y: 0 };

async function main() {
  if (window.__NO_WEBGL2__) return;

  const settings = new Settings();
  // 初回起動時は端末性能から画質を推定
  if (!localStorage.getItem('opcrimson.settings.v1')) {
    settings.set('quality', Settings.suggestQuality());
  }

  boot?.set(6, '描画エンジン初期化');
  await nextFrame();

  // ?rawgpu を付けるとソフトウェア描画時の自動降格を行わない（見た目の検証用）
  const qs = new URLSearchParams(location.search);
  const engine = new Engine(container, qs.get('quality') || settings.get('quality'), {
    ignoreSoftwareDowngrade: qs.has('rawgpu'),
  });
  // GPU 描画が使えていない場合は、そのまま遊ばせても 1fps 級になる。
  // 原因と対処を明示する（黙って重いのが一番わかりにくい）。
  // 見た目の検証時は自動調整も止める（画質が勝手に下がると比較できない）
  if (qs.has('rawgpu')) engine.autoResolution = false;
  if (engine.gpu?.software && !qs.has('rawgpu')) {
    settings.set('quality', 'low');
    showSoftwareWarning(container, engine.gpu.name);
  }
  const mats = new MaterialLibrary(engine.renderer);
  /*
   * マテリアルを 1 つも作る前に決めておく。
   * 後から切り替えるとシェーダを全部組み直すことになり、
   * 起動直後に数百 ms 固まる。
   */
  mats.dropRoughIBL = !!QUALITY[engine.quality]?.dropRoughIBL;
  mats.setCheapShadows(!!QUALITY[engine.quality]?.cheapShadows);
  mats.setCheapEnvMip(!!QUALITY[engine.quality]?.cheapEnvMip);
  const input = new Input(engine.renderer.domElement);
  const audio = new AudioManager(settings);

  applySettings(engine, input, settings, null);

  boot?.set(14, '大気と環境光を生成');
  await nextFrame();
  /*
   * 屋外の基準ライティング。
   * 太陽（暖色）が支配的になるよう、青い回り込み（半球光・フィル）は弱める。
   * 以前は半球光 0.42 ＋ フィル 0.45 が強すぎ、直射の当たらない面が
   * すべて青く染まっていた。
   */
  engine.tune({
    skyScale: 0.10,
    exposure: 0.92 * settings.get('brightness'),
    sunIntensity: 3.6, hemiIntensity: 0.26, fillIntensity: 0.22,
  });

  // --- UI ---
  const hud = new HUD(container);
  const isTouch = MobileControls.isTouch();
  const menu = new Menu(container, { settings, isTouch });
  const mobile = isTouch ? new MobileControls(container, input, settings) : null;

  const game = new Game({ engine, mats, input, audio });
  wireGame(game, hud, menu, mobile, settings, engine);
  // game ができてから、視野角など game 依存の設定を改めて適用する。
  // これをしないと、保存済みの視野角が「設定を触るまで反映されない」。
  applySettings(engine, input, settings, game);

  boot?.set(28, 'レベルを読み込み中');
  await nextFrame();

  // マップは起動時に一度だけ構築する（メニュー背景としても使う）
  // ?map=testbed のように指定すると、そのレベルで起動する
  const firstMap = qs.get('map') || settings.get('map') || DEFAULT_MAP;
  menu.sel.map = MAPS[firstMap] ? firstMap : DEFAULT_MAP;
  await game.loadMap(getMap(menu.sel.map), (p, label) => boot?.set(28 + p * 64, label));

  hud.setMapName(game.mapInfo.nameJa);
  hud.minimap.bake(game.physics, game.mapInfo.bounds);

  boot?.set(98, '準備完了');
  await nextFrame();
  boot?.done();

  // メニューの背景として、マップ上空をゆっくり周回させる
  const orbit = { t: 0, active: true };
  // 出撃処理は非同期なので、二重に走らせない
  let starting = false;
  engine.camera.position.set(0, 26, 44);
  engine.camera.lookAt(0, 3, 0);

  await menu.playIntro();

  // --- 入力の初期化（ユーザー操作後に音声を有効化） ---
  const kickAudio = () => { audio.init(); audio.resume(); };
  window.addEventListener('pointerdown', kickAudio, { once: true });
  window.addEventListener('keydown', kickAudio, { once: true });

  // --- ループ ---
  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0, fps = 0;
  const fpsEl = makeFpsEl(container);

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    input.update();

    if (game.running && !game.paused) {
      /*
       * 更新中の例外で描画まで巻き添えにしない。
       * ここを素通しにすると、例外が出たフレームは engine.render() まで
       * 到達せず画面がまったく更新されない。毎フレーム出る類の不具合だと
       * 「フリーズした」ようにしか見えず、原因も追えなくなる。
       * 握り潰さずコンソールへは必ず出す。
       */
      try {
        game.update(dt);
        hud.lightweight = engine.lightweight;
        updateHud(game, hud, mobile, dt);
        audio.setListener(engine.camera.position);
      } catch (err) {
        reportLoopError(err);
      }
    } else if (orbit.active) {
      // メニュー背景のカメラワーク
      orbit.t += dt * 0.045;
      const r = 46;
      engine.camera.position.set(Math.sin(orbit.t) * r, 24 + Math.sin(orbit.t * 0.7) * 4, Math.cos(orbit.t) * r);
      engine.camera.lookAt(0, 4, 0);
    }

    // ポーズ・スコアボードの入力
    handleMetaInput(game, hud, menu, input, mobile);

    engine.render(dt);
    input.lateUpdate();

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) {
      fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0;
      if (settings.get('showFps')) {
        fpsEl.style.display = 'block';
        fpsEl.textContent =
          `${fps} FPS · ${engine.renderSize} (x${engine.renderScale}) · ${engine.drawCalls} draws · ${(engine.triangles / 1000).toFixed(0)}k tris`;
      } else {
        fpsEl.style.display = 'none';
      }
    }
  }
  requestAnimationFrame(loop);

  // --- 開発用フック ---
  window.__DEV = { engine, mats, game, hud, menu, input, settings, audio, THREE, BOT_GATE,
    startMatch: (cfg) => menu.onStart(cfg || menu.sel) };

  /* ============ ここから下は上のスコープを使うヘルパ ============ */

  function wireGame(game, hud, menu, mobile, settings, engine) {
    menu.onStart = async (sel) => {
      if (starting) return;
      starting = true;
      orbit.active = false;
      menu.showLoading(getMap(sel.map).MAP_INFO);
      menu.setProgress(0.02, '準備中');
      await nextFrame();

      /*
       * 選ばれたレベルが今読み込んでいるものと違えば、組み直す。
       * レベルの構築は数百 ms かかるので、同じなら作り直さない。
       */
      if (sel.map && sel.map !== game.mapId) {
        await game.loadMap(getMap(sel.map), (p, label) => menu.setProgress(p * 0.6, label));
        hud.setMapName(game.mapInfo.nameJa);
        hud.minimap.bake(game.physics, game.mapInfo.bounds);
        settings.set('map', sel.map);
      }

      // 進捗は game.start() の実作業から受け取る（見せかけの進捗にしない）
      // モードが人数を指定していればそれに従う（マップ見学は 0 人）
      const modeCfg = GAME_MODES[sel.mode]?.cfg || {};
      await game.start({
        mode: sel.mode,
        difficulty: sel.difficulty,
        botCount: modeCfg.botCount ?? 8,
        loadout: { primary: sel.primary, secondary: sel.secondary },
        attachments: sel.attachments,
      }, (p, label) => menu.setProgress(p, label));

      menu.setProgress(1, '完了');
      await nextFrame();
      menu.hideLoading();
      menu.hide();
      hud.show();
      mobile?.show();
      starting = false;

      applySettings(engine, input, settings, game);
      hud.setModeName(GAME_MODES[sel.mode].nameJa);
      hud.setPlayerTeam(game.playerStats.team);
      // 「使用」操作があるモードでだけボタンを出す（見学モードでは浮遊の切り替え）
      mobile?.setUseVisible(sel.mode === 'snd' || sel.mode === 'mapview');
      mobile?.setUseLabel(sel.mode === 'mapview' ? '浮遊' : '使用');
      hud.announce(GAME_MODES[sel.mode].nameJa, game.mapInfo.nameJa);
      if (!isTouch) input.requestPointerLock();
      audio.init(); audio.resume();
    };

    menu.onResume = () => {
      menu.hidePause();
      menu.hide();
      game.resume();
      hud.show();
      mobile?.show();
      if (!isTouch) input.requestPointerLock();
    };

    menu.onQuit = () => {
      game.running = false;
      game.paused = false;
      game.mode?.dispose?.();
      hud.hide();
      hud.clearFeed();
      audio.stopAll();
      mobile?.hide();
      orbit.active = true;
      menu.showMenu();
    };

    menu.onSettingChange = (k, v) => applySettings(engine, input, settings, game, k, v);
    // 既定へ戻したときは、画質プリセットを含めて全項目を貼り直す
    menu.onSettingsReset = () => {
      engine.setQuality(settings.get('quality'));
      applySettings(engine, input, settings, game);
      mobile?.applyLayout?.();
    };

    // 解像度を下限まで落としてもフレーム時間が足りない場合、
    // エンジンが自動で画質を落とす。設定表示と食い違わないよう同期する。
    engine.onQualityAuto = (name) => {
      settings.set('quality', name);
      menu.syncQuality?.(name);
    };

    if (mobile) {
      mobile.onPause = () => pauseGame(game, hud, menu, mobile, input);
      mobile.onBoard = (on) => hud.setBoard(on, buildBoard(game));
      // 対戦中に縦画面へ回されたら、横に戻すまで進行を止める
      mobile.onOrientationBlock = (blocked) => {
        if (!game.running) return;
        if (blocked) { game.paused = true; input.clear(); mobile.resetButtons(); }
        else if (!menu.root.classList.contains('on')) game.paused = false;
      };
    }

    // 短い通知（浮遊の切り替えなど）は既存のアナウンス枠を使う
    game.onNotice = (text) => hud.announce(text, '');

    game.onKill = (info) => {
      hud.addKill(info);
      if (info.byPlayer) {
        const st = game.playerStats.streak;
        if (st >= 2) hud.showStreak(st);
      }
    };
    game.onHitmarker = (isKill) => hud.hitmarker(isKill);
    game.onPlayerDamage = (amount, dir) => {
      // 被弾方向を画面上の角度へ変換
      const yaw = Math.atan2(-dir.x, -dir.z);
      hud.damageFrom(yaw - game.player.yaw + Math.PI);
    };
    game.onPlayerDeath = (from, weapon) => {
      hud.showDeath(from?.name || '敵', weapon?.name || '');
      mobile?.resetAds();
    };
    game.onPlayerSpawn = () => hud.hideDeath();
    game.onScoreChange = (s) => hud.setScores(s);
    game.onMatchEnd = (r) => {
      hud.hide();
      hud.clearFeed();
      audio.stopAll();
      mobile?.hide();
      input.exitPointerLock();
      orbit.active = true;
      menu.showResult(r);
    };

    // 足音
    game.player.onFootstep = (surface, isRun) => audio.playFootstep(surface, isRun, game.player.position);
    game.player.onLand = (impact, surface) => audio.playFootstep(surface, true, game.player.position);
  }
}

/* ================= 補助 ================= */

/**
 * 設定値をエンジン・入力・ゲームへ反映する。
 * key を省略して呼ぶと全項目をまとめて適用する（起動時・試合開始時）。
 */
function applySettings(engine, input, settings, game, key, val) {
  const s = settings.values;
  input.sensitivity = s.sensitivity;
  input.adsSensitivity = s.adsSensitivity;
  input.touchSensitivity = s.touchSensitivity;
  input.invertY = s.invertY;

  // 視野角。game がまだ無い起動時でも、後で必ず再適用されるようにしている。
  if (game) {
    game.player.baseFov = s.fov;
    // 覗いていないときは即座に反映（覗き中は WeaponSystem が上書きする）
    if (game.weapons.adsProgress < 0.01) engine.setFov(s.fov);
  }
  engine.renderer.toneMappingExposure = 0.95 * s.brightness;

  if (engine.compositePass) {
    engine.compositePass.uniforms.uGrain.value = s.filmGrain ? 0.016 : 0;
  }
  // モーションブラーは効果量 0 のときエンジン側で自動的に止まる。ここでは可否だけ渡す。
  engine.motionBlurAllowed = s.motionBlur;

  engine.autoResolution = s.dynamicRes !== false;
  engine.setPerformanceMode(!!s.perfMode);

  if (key === 'quality' && QUALITY[val]) engine.setQuality(val);

  // ざらついた面の鏡面 IBL を省くか（画質段によって変わる）
  game?.mats?.setDropRoughIBL(!!QUALITY[engine.quality]?.dropRoughIBL);
  game?.mats?.setCheapShadows(!!QUALITY[engine.quality]?.cheapShadows);
  game?.mats?.setCheapEnvMip(!!QUALITY[engine.quality]?.cheapEnvMip);
}

function pauseGame(game, hud, menu, mobile, input) {
  if (!game.running || game.paused) return;
  game.pause();
  input.exitPointerLock();
  hud.hide();
  mobile?.hide();
  menu.showPause();
}

function handleMetaInput(game, hud, menu, input, mobile) {
  if (!game.running) return;
  if (input.pressed('pause')) {
    if (game.paused) menu.onResume?.();
    else pauseGame(game, hud, menu, mobile, input);
  }
  if (!game.paused) {
    const open = input.down('scoreboard');
    if (open !== hud._boardOpen) {
      hud._boardOpen = open;
      hud.setBoard(open, buildBoard(game));
    }
  }
}

function buildBoard(game) {
  const rows = (team) => {
    const list = game.bots.filter((b) => b.team === team)
      .map((b) => ({ name: b.name, kills: b.kills, deaths: b.deaths, score: b.score, me: false }));
    if (game.playerStats.team === team) {
      list.push({
        name: game.playerStats.name, kills: game.playerStats.kills,
        deaths: game.playerStats.deaths, score: game.playerStats.score, me: true,
      });
    }
    return list.sort((a, b) => b.score - a.score);
  };
  const sc = game.mode?.getScores?.() || { A: 0, B: 0 };
  return {
    mode: game.mode?.cfg?.nameJa || '',
    map: game.mapInfo?.nameJa || '',
    teamA: rows('A'), teamB: rows('B'),
    scoreA: sc.A ?? 0, scoreB: sc.B ?? 0,
  };
}

function updateHud(game, hud, mobile, dt) {
  const ps = game.playerStats;
  hud.setHealth(ps.hp, ps.maxHp);
  hud.setStamina(game.player.stamina, 5.2);
  hud.setAmmo(game.weapons.getAmmo());
  hud.setReloading(game.weapons.reloading);
  mobile?.setReloading(game.weapons.reloading);
  hud.setScores(game.mode?.getScores?.());

  if (!ps.alive) hud.setRespawnTime(3.2 - game._respawnT);

  // 照準の広がり（実際の拡散量を画面ピクセルへ）
  const def = game.weapons.def;
  if (def) {
    const ads = game.weapons.adsProgress;
    const sp = def.spread;
    let spread = ads > 0.6 ? sp.ads : sp.hip;
    if (!game.player.grounded) spread *= sp.airMul;
    else if (game.player.speed2D > 0.6) spread *= 1 + (sp.moveMul - 1) * Math.min(1, game.player.speed2D / 4.4);
    const px = Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(game.engine.camera.fov) / 2) * (window.innerHeight / 2);
    hud.setCrosshair(px * 0.85 + 3, game.weapons.isScoped || ads > 0.85);

    // スコープ表示（覗き込み進行度と息づかいの揺れ）
    if (game.weapons.isScoped) {
      const sway = game.weapons.getScopeSway(_sway);
      hud.setScope(ads, sway.x, sway.y);
    } else {
      hud.setScope(0);
    }
  }

  // ミニマップ。敵の可視判定はボット 1 体につきレイキャスト 1 本かかるので、
  // ミニマップの描画頻度（30Hz）に合わせて間引く。
  _miniT += dt;
  if (_miniT >= 0.033) {
    _miniT = 0;
    const allies = [], enemies = [];
    const eye = game.player.getEyePosition(_v);
    for (const b of game.bots) {
      if (!b.alive) continue;
      const t = { x: b.char.position.x, z: b.char.position.z, yaw: b.char.yaw };
      if (b.team === game.playerStats.team) allies.push(t);
      else {
        // 発砲直後 or 視界内の敵だけを表示する
        const seen = !game.physics.losBlocked(eye, b.char.getEyePosition(_v2));
        const fresh = b._fireTimer > 0 ? 1 : (seen ? 0.9 : 0);
        if (fresh > 0.05) enemies.push({ ...t, fresh });
      }
    }
    const objectives = (game.mode?.getScores?.()?.zones || []).map((z, i) => {
      const o = game.builder.objectives[i];
      return { x: o.pos.x, z: o.pos.z, id: z.id, owner: z.owner };
    });

    /*
     * 見学モードで浮くと視野はどんどん広がるのに、
     * ミニマップだけ半径 34m のままでは何を見ているのか分からなくなる。
     * 高度に合わせて表示範囲を広げ、目とミニマップの縮尺を合わせる。
     */
    hud.minimap.worldRadius = game.freeCam
      ? Math.min(96, 34 + Math.max(0, game.player.position.y - 8) * 0.72)
      : 34;

    hud.updateMinimap({
      playerPos: game.player.position,
      playerYaw: game.player.yaw,
      fov: game.engine.camera.fov,
      allies, enemies, objectives,
    });
  }
}
let _miniT = 0;

/**
 * ソフトウェア描画（SwiftShader 等）で動いていることを知らせる。
 * Chrome の「ハードウェア アクセラレーションが使用可能な場合は使用する」が
 * 無効だと必ずこの状態になり、どんな軽量化をしても改善しない。
 */
function showSoftwareWarning(parent, rendererName) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:120;
    max-width:min(560px,92vw);padding:14px 16px;border-radius:4px;
    background:rgba(28,14,10,.96);border:1px solid rgba(217,119,87,.55);
    color:#f2efe9;font:400 12.5px/1.75 -apple-system,"Hiragino Sans",sans-serif;
    box-shadow:0 18px 48px rgba(0,0,0,.6)`;
  el.innerHTML = `
    <div style="font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#d97757;margin-bottom:9px">
      GPU アクセラレーションが無効です
    </div>
    ブラウザが GPU ではなく CPU で描画しています（<span style="color:#8b9299">${esc(rendererName)}</span>）。
    この状態では動作が極端に遅くなります。<br>
    Chrome の <b>設定 → システム</b> で「グラフィック アクセラレーションが使用可能な場合は使用する」を有効にし、
    ブラウザを再起動してください。<br>
    <span style="color:#8b9299">画質は自動的に最低設定へ切り替えました。</span>
    <button style="margin-top:11px;padding:8px 16px;border:1px solid rgba(242,239,233,.28);border-radius:2px;
      background:none;color:#f2efe9;font:500 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;cursor:pointer">
      閉じる</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  parent.appendChild(el);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * ゲームループ内の例外を記録する。
 * 同じ例外が毎フレーム出てもログを埋め尽くさないよう、種類ごとに最初の数回だけ出す。
 */
const _loopErrs = new Map();
function reportLoopError(err) {
  const key = String(err && err.message || err);
  const n = (_loopErrs.get(key) || 0) + 1;
  _loopErrs.set(key, n);
  if (n <= 3) console.error('[ゲーム更新]', err);
  else if (n === 4) console.error(`[ゲーム更新] 同一の例外が繰り返し発生しています: ${key}`);
}

function makeFpsEl(parent) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:8px;bottom:8px;z-index:80;display:none;
    font:500 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#8b9299;
    background:rgba(9,10,12,.6);padding:5px 8px;border-radius:3px;pointer-events:none`;
  parent.appendChild(el);
  return el;
}

main().catch((e) => {
  console.error(e);
  boot?.fail('起動失敗: ' + e.message);
});
