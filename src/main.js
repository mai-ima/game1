import * as THREE from 'three';
import { Engine, QUALITY } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Settings } from './core/Settings.js';
import { AudioManager } from './core/AudioManager.js';
import { MaterialLibrary } from './render/MaterialLibrary.js';
import { Game } from './game/Game.js';
import { GAME_MODES } from './game/GameModes.js';
import { HUD } from './ui/HUD.js';
import { Menu } from './ui/Menu.js';
import { MobileControls } from './ui/MobileControls.js';
import { buildCompound, MAP_INFO } from './world/maps/Map_Compound.js';

/**
 * OPERATION CRIMSON — エントリポイント。
 * 起動 → スプラッシュ → メニュー → 試合 の流れを統括する。
 */

const boot = window.__boot;
const container = document.getElementById('app');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const _v = new THREE.Vector3();

async function main() {
  if (window.__NO_WEBGL2__) return;

  const settings = new Settings();
  // 初回起動時は端末性能から画質を推定
  if (!localStorage.getItem('opcrimson.settings.v1')) {
    settings.set('quality', Settings.suggestQuality());
  }

  boot?.set(6, '描画エンジン初期化');
  await nextFrame();

  const engine = new Engine(container, settings.get('quality'));
  const mats = new MaterialLibrary(engine.renderer);
  const input = new Input(engine.renderer.domElement);
  const audio = new AudioManager(settings);

  applySettings(engine, input, settings, null);

  boot?.set(14, '大気と環境光を生成');
  await nextFrame();
  engine.tune({ skyScale: 0.10, exposure: 0.95 * settings.get('brightness'), sunIntensity: 4.4, hemiIntensity: 0.42, fillIntensity: 0.45 });

  // --- UI ---
  const hud = new HUD(container);
  const menu = new Menu(container, { settings });
  const isTouch = MobileControls.isTouch();
  const mobile = isTouch ? new MobileControls(container, input) : null;

  const game = new Game({ engine, mats, input, audio });
  wireGame(game, hud, menu, mobile, settings, engine);

  boot?.set(28, 'レベルを読み込み中');
  await nextFrame();

  // マップは起動時に一度だけ構築する（メニュー背景としても使う）
  await game.loadMap(
    { build: buildCompound, MAP_INFO },
    (p, label) => boot?.set(28 + p * 64, label)
  );

  hud.setMapName(MAP_INFO.nameJa);
  hud.minimap.bake(game.physics, {
    min: { x: -38, z: -38 }, max: { x: 38, z: 38 },
  });

  boot?.set(98, '準備完了');
  await nextFrame();
  boot?.done();

  // メニューの背景として、マップ上空をゆっくり周回させる
  const orbit = { t: 0, active: true };
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
      game.update(dt);
      updateHud(game, hud, mobile, dt);
      audio.setListener(engine.camera.position);
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
        fpsEl.textContent = `${fps} FPS · ${engine.drawCalls} draws · ${(engine.triangles / 1000).toFixed(0)}k tris`;
      } else {
        fpsEl.style.display = 'none';
      }
    }
  }
  requestAnimationFrame(loop);

  // --- 開発用フック ---
  window.__DEV = { engine, mats, game, hud, menu, input, settings, audio, THREE,
    startMatch: (cfg) => menu.onStart(cfg || menu.sel) };

  /* ============ ここから下は上のスコープを使うヘルパ ============ */

  function wireGame(game, hud, menu, mobile, settings, engine) {
    menu.onStart = async (sel) => {
      orbit.active = false;
      menu.showLoading(MAP_INFO);
      for (let i = 0; i <= 10; i++) {
        menu.setProgress(i / 10, i < 10 ? '部隊を展開中' : '完了');
        await nextFrame();
      }
      menu.hideLoading();
      menu.hide();
      hud.show();
      mobile?.show();

      game.start({
        mode: sel.mode,
        difficulty: sel.difficulty,
        botCount: 8,
        loadout: { primary: sel.primary, secondary: sel.secondary },
        attachments: sel.attachments,
      });
      hud.setModeName(GAME_MODES[sel.mode].nameJa);
      hud.announce(GAME_MODES[sel.mode].nameJa, MAP_INFO.nameJa);
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
      hud.hide();
      mobile?.hide();
      orbit.active = true;
      menu.showMenu();
    };

    menu.onSettingChange = (k, v) => applySettings(engine, input, settings, game, k, v);

    if (mobile) {
      mobile.onPause = () => pauseGame(game, hud, menu, mobile, input);
      mobile.onBoard = (on) => hud.setBoard(on, buildBoard(game));
    }

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
      hud.showDeath(from?.name || from === game._pt ? game.playerStats.name : (from?.name || '敵'), weapon?.name || '');
      mobile?.resetAds();
    };
    game.onPlayerSpawn = () => hud.hideDeath();
    game.onScoreChange = (s) => hud.setScores(s);
    game.onMatchEnd = (r) => {
      hud.hide();
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

function applySettings(engine, input, settings, game, key, val) {
  const s = settings.values;
  input.sensitivity = s.sensitivity;
  input.adsSensitivity = s.adsSensitivity;
  input.touchSensitivity = s.touchSensitivity;
  input.invertY = s.invertY;

  if (game) game.player.baseFov = s.fov;
  engine.renderer.toneMappingExposure = 0.95 * s.brightness;

  if (engine.compositePass) {
    engine.compositePass.uniforms.uGrain.value = s.filmGrain ? 0.016 : 0;
  }
  if (engine.blurPass) engine.blurPass.enabled = s.motionBlur;

  if (key === 'quality' && QUALITY[val]) engine.setQuality(val);
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
    hud.setCrosshair(px * 0.9 + 4, game.weapons.isScoped || ads > 0.85);
  }

  // ミニマップ
  const allies = [], enemies = [];
  for (const b of game.bots) {
    if (!b.alive) continue;
    const t = { x: b.char.position.x, z: b.char.position.z, yaw: b.char.yaw };
    if (b.team === game.playerStats.team) allies.push(t);
    else {
      // 発砲直後 or 視界内の敵だけを表示する
      const seen = !game.physics.losBlocked(game.player.getEyePosition(_v), b.char.getEyePosition(new THREE.Vector3()));
      const fresh = b._fireTimer > 0 ? 1 : (seen ? 0.9 : 0);
      if (fresh > 0.05) enemies.push({ ...t, fresh });
    }
  }
  const objectives = (game.mode?.getScores?.()?.zones || []).map((z, i) => {
    const o = game.builder.objectives[i];
    return { x: o.pos.x, z: o.pos.z, id: z.id, owner: z.owner };
  });

  hud.updateMinimap({
    playerPos: game.player.position,
    playerYaw: game.player.yaw,
    fov: game.engine.camera.fov,
    allies, enemies, objectives,
  });
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
