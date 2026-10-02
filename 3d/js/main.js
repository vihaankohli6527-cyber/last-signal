/* =========================================================================
   main.js — the Game: screens (title, map select, pause, game over),
   input, the endless campaign (waves -> areas -> next map), the market
   rules, damage, the rescue cutscene, and the render loop.

   Game states (game.state):
     'title'     title screen (a map slowly orbits in the background)
     'mapselect' choosing the starting area
     'playing'   in game. game.phase is 'intermission' (buy phase) or 'wave'
     'paused'    Esc menu
     'cutscene'  rescue ship arriving between areas
     'gameover'  tower or player destroyed
   ========================================================================= */
import * as THREE from '../lib/three.module.js';
import { PointerLockControls } from '../lib/addons/controls/PointerLockControls.js';
import { EffectComposer } from '../lib/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/addons/postprocessing/OutputPass.js';
import { GTAOPass } from '../lib/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from '../lib/addons/environments/RoomEnvironment.js';
import { CONFIG, buildWave } from './config.js?v=0c35b74f43';
import { Sound } from './audio.js?v=0c35b74f43';
import { World } from './world.js?v=0c35b74f43';
import { MAPS } from './maps/index.js?v=0c35b74f43';
import { Effects } from './effects.js?v=0c35b74f43';
import { EnemyManager } from './enemies.js?v=0c35b74f43';
import { Player } from './player.js?v=0c35b74f43';
import { WeaponSystem } from './weapons.js?v=0c35b74f43';
import { Turrets } from './turrets.js?v=0c35b74f43';
import { HUD } from './hud.js?v=0c35b74f43';
import { Market } from './market.js?v=0c35b74f43';
import { setViewmodelDetail } from './viewmodels.js?v=0c35b74f43';

const $ = (id) => document.getElementById(id);
const DEFAULT_SETTINGS = {
  sens: 1, adsMult: 1, invertY: false, fov: 75,
  master: 0.8, sfx: 1,
  quality: 'high', res: 1, shadows: true, bloom: true, ao: true, detail: true, reflections: true, fps: false,
  chColor: '#5cfff0', chSize: 7,
};
const QUALITY = {
  low: { res: 0.6, shadows: false, bloom: false, ao: false, detail: false, reflections: false },
  medium: { res: 0.85, shadows: true, bloom: false, ao: false, detail: false, reflections: false },
  high: { res: 1, shadows: true, bloom: true, ao: true, detail: true, reflections: true },
};
/* Physical key (layout independent, ignores Shift/Caps: Shift+C is still 'KeyC').
   Falls back to e.key for the rare keyboards/IMEs that report an empty code. */
function keyCode(e) {
  if (e.code) return e.code;
  const k = e.key || '';
  if (k === ' ') return 'Space';
  if (k === 'Shift') return 'ShiftLeft';
  if (k.length === 1 && /[a-z]/i.test(k)) return 'Key' + k.toUpperCase();
  if (/^[0-9]$/.test(k)) return 'Digit' + k;
  return k;
}
const SETTINGS_KEY = 'lastSignal3d.settings';
const BEST_KEY = 'lastSignal3d.best';

// Show any crash on screen (helps when something goes wrong).
window.addEventListener('error', (e) => { const el = $('error'); el.textContent = 'Error: ' + e.message; el.classList.remove('hidden'); });

class Game {
  constructor() {
    this.testMode = new URLSearchParams(location.search).has('test');
    this.sound = Sound;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (saved.ao === undefined && QUALITY[this.settings.quality]) Object.assign(this.settings, QUALITY[this.settings.quality]);

    // ---------- renderer & cameras ----------
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, 900);
    this.camera.rotation.order = 'YXZ';

    // The gun is drawn in its own little scene on top of the world, so it
    // never pokes through walls and isn't affected by the zoom.
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 10);
    this.vmScene.add(this.vmCamera);
    this.vmHemi = new THREE.HemisphereLight(0xffffff, 0x404060, 1.6);
    this.vmSun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.vmSun.position.set(1, 2, 1.5);
    this.vmFlash = new THREE.PointLight(0xffc070, 0, 3, 1);
    this.vmFlash.position.set(0.2, -0.1, -0.8);
    this.vmScene.add(this.vmHemi, this.vmSun);
    this.vmHemi.intensity = 0.8; this.vmSun.intensity = 1.3;

    // Image-based lighting: a pre-filtered (PMREM) studio environment gives
    // metal and glossy surfaces something real to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.vmScene.environment = this.envMap;
    this.vmScene.environmentIntensity = 0.3;
    this.vmCamera.add(this.vmFlash);

    // Post-processing (bloom). RenderPass #2 draws the gun on top.
    this.composer = new EffectComposer(this.renderer);
    this.scenePass = new RenderPass(new THREE.Scene(), this.camera);
    this.vmPass = new RenderPass(this.vmScene, this.vmCamera);
    this.vmPass.clear = false;
    this.vmPass.clearDepth = true;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.9);
    // Ambient occlusion (GTAO) — only on the HIGH preset.
    this.aoPass = new GTAOPass(this.scenePass.scene, this.camera, innerWidth, innerHeight);
    this.aoPass.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
    this.aoPass.updatePdMaterial({ radius: 6, rings: 2, samples: 12 });
    this.aoPass.blendIntensity = 0.9;
    const aoSize = this.aoPass.setSize.bind(this.aoPass);
    this.aoPass.setSize = (w, h) => aoSize(Math.ceil(w / 2), Math.ceil(h / 2));   // half-res AO = much cheaper
    const aoHide = this.aoPass._overrideVisibility.bind(this.aoPass);
    this.aoPass._overrideVisibility = function () {   // transparent fx (mist, glows) should not cast AO
      aoHide();
      this.scene.traverse((o) => { if (o.isMesh && o.visible && o.material && o.material.transparent) { o.visible = false; this._visibilityCache.push(o); } });
    };
    this.composer.addPass(this.scenePass);
    this.composer.addPass(this.aoPass);
    this.composer.addPass(this.vmPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // ---------- game systems ----------
    this.controls = new PointerLockControls(this.camera, this.canvas);
    this.controls.disconnect();               // replace the noisy error handler with a friendly hint
    this.controls._onPointerlockError = () => { this.hud && this.hud.hint('Click to capture the mouse'); };
    this.controls.connect(this.canvas);
    this.controls.enabled = false;            // we do mouse-look ourselves (invert Y, ADS sensitivity...)
    this.controls.addEventListener('unlock', () => this.onUnlock());
    this.controls.addEventListener('lock', () => { this.hud.hint(''); });

    this.player = new Player(this.camera);
    this.hud = new HUD(this);
    this.stats = { shots: 0, hits: 0 };
    this.weapons = new WeaponSystem(this, this.vmCamera);
    this.turrets = new Turrets(this);
    this.credits = 0; this.score = 0; this.area = 1; this.wave = 0; this.towerHp = CONFIG.TOWER.maxHp;
    this.phase = 'intermission';
    this.market = new Market(this);
    this.hurtFlash = 0;
    this.counts = { summoned: 0 };

    this.input = { mouseL: false, mouseR: false, mouseLPressed: false, mouseLReleased: false, lookDX: 0, lookDY: 0 };
    this.noInput = { mouseL: false, mouseR: false, mouseLPressed: false, mouseLReleased: false, lookDX: 0, lookDY: 0 };
    this.keys = {};
    this.selectedMap = 0;
    this.previews = {};

    this.setupInput();
    this.setupUI();
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.loadMap(0);
    this.setState('title');
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ================================================================== maps
  /** Build a map from js/maps/. Throws away the previous one. */
  loadMap(index) {
    if (this.world) {
      this.enemies.clear();
      this.weapons.clearProjectiles();
      this.world.dispose();
    }
    this.mapIndex = index;
    const map = MAPS[index];
    this.scene = new THREE.Scene();
    this.world = new World(this.scene, map);
    this.effects = new Effects(this.scene);
    this.enemies = new EnemyManager(this.scene, this);
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 14, 2);
    this.scene.add(this.muzzleLight);
    this.scenePass.scene = this.scene;
    this.aoPass.scene = this.scene;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = map.envIntensity ?? 0.14;
    this.applyDetail();
    const P = this.world.palette;
    this.renderer.toneMappingExposure = P.exposure;
    const bloom = map.bloom || [0.55, 0.5, 0.9];  // [strength, radius, threshold]
    this.bloomPass.strength = bloom[0]; this.bloomPass.radius = bloom[1]; this.bloomPass.threshold = bloom[2];
    this.vmHemi.color.setHex(P.hemiSky); this.vmHemi.groundColor.setHex(P.hemiGround);
    this.vmSun.color.setHex(P.sun);
    this.turrets.rebuild();
  }

  // ================================================================== state / screens
  setState(s) {
    this.state = s;
    for (const id of ['title', 'mapselect', 'pause', 'gameover']) $(id).classList.toggle('hidden', id !== s && !(id === 'pause' && s === 'paused'));
    this.hud.show(s === 'playing' || s === 'paused');
    if (s !== 'playing') this.hud.hint('');
  }

  setupUI() {
    $('btn-play').onclick = () => { Sound.init(); Sound.ui(); this.openMapSelect(); };
    $('btn-map-back').onclick = () => { Sound.ui(); this.setState('title'); };
    $('btn-map-go').onclick = () => { Sound.init(); this.startRun(this.selectedMap); };
    $('btn-resume').onclick = () => this.resume();
    $('btn-quit').onclick = () => { this.market.hide(); this.loadMap(this.selectedMap); this.setState('title'); this.showBest(); };
    $('btn-retry').onclick = () => this.startRun(this.startMap);
    $('btn-go-maps').onclick = () => this.openMapSelect();
    $('btn-mk-close').onclick = () => this.closeMarket();
    $('btn-mk-ready').onclick = () => this.startWave();
    this.setupSettingsUI();

    // Map cards
    const wrap = $('map-cards');
    MAPS.forEach((m, i) => {
      const c = document.createElement('div');
      c.className = 'map-card';
      c.innerHTML = `<div class="pv" style="background-image:linear-gradient(135deg, ${m.card[0]}, ${m.card[1]})"><span class="num">${i + 1}</span></div>
        <div class="info"><div class="nm">${m.name}</div><div class="ds">${m.desc}</div></div>`;
      c.onclick = () => this.selectMap(i);
      c.ondblclick = () => this.startRun(i);
      wrap.appendChild(c);
    });
    this.showBest();
  }

  // ---------------------------------------------------------------- settings screen
  setupSettingsUI() {
    const s = this.settings;
    $('btn-title-settings').onclick = () => { Sound.init(); Sound.ui(); this.openSettings(); };
    $('btn-pause-settings').onclick = () => { Sound.ui(); this.openSettings(); };
    $('btn-settings-back').onclick = () => { Sound.ui(); this.closeSettings(); };
    $('btn-settings-reset').onclick = () => { Object.assign(s, DEFAULT_SETTINGS); this.applySettings(); Sound.ui(); };
    const range = (id, key, custom) => { $(id).oninput = (e) => { s[key] = parseFloat(e.target.value); if (custom) s.quality = 'custom'; this.applySettings(); }; };
    const check = (id, key, custom) => { $(id).onchange = (e) => { s[key] = e.target.checked; if (custom) s.quality = 'custom'; this.applySettings(); }; };
    range('opt-sens', 'sens'); range('opt-ads', 'adsMult'); range('opt-fov', 'fov');
    range('opt-master', 'master'); range('opt-sfx', 'sfx');
    range('opt-res', 'res', true); range('opt-chsize', 'chSize');
    check('opt-invert', 'invertY'); check('opt-shadows', 'shadows', true); check('opt-bloom', 'bloom', true); check('opt-ao', 'ao', true); check('opt-detail', 'detail', true); check('opt-refl', 'reflections', true); check('opt-fps', 'fps');
    $('opt-mute').onchange = () => { Sound.toggleMute(); };
    $('opt-quality').onchange = (e) => {
      s.quality = e.target.value;
      if (QUALITY[s.quality]) Object.assign(s, QUALITY[s.quality]);
      this.applySettings();
    };
    $('opt-chcolor').onchange = (e) => { s.chColor = e.target.value; this.applySettings(); };
    $('opt-chcustom').oninput = (e) => { s.chColor = e.target.value; this.applySettings(); };
  }

  /** Surface detail (normal/roughness maps, HIGH) + reflections (env map, MEDIUM+). */
  applyDetail() {
    if (!this.world || !this.scene) return;
    this.world.setDetail(this.settings.detail !== false);
    setViewmodelDetail(this.settings.detail !== false);
    this.scene.environment = this.settings.reflections !== false ? this.envMap : null;
  }

  openSettings() {
    this.settingsOpen = true;
    $('settings').classList.remove('hidden');
    this.applySettings();
  }

  closeSettings() {
    this.settingsOpen = false;
    $('settings').classList.add('hidden');
  }

  applySettings() {
    const s = this.settings;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
    // reflect values in the controls
    const val = (id, v, txt) => { $('opt-' + id).value = v; if ($('val-' + id)) $('val-' + id).textContent = txt; };
    val('sens', s.sens, s.sens.toFixed(2)); val('ads', s.adsMult, s.adsMult.toFixed(2) + '×');
    val('fov', s.fov, s.fov + '°');
    val('master', s.master, Math.round(s.master * 100) + '%'); val('sfx', s.sfx, Math.round(s.sfx * 100) + '%');
    val('res', s.res, Math.round(s.res * 100) + '%'); val('chsize', s.chSize, s.chSize + 'px');
    $('opt-invert').checked = s.invertY; $('opt-shadows').checked = s.shadows; $('opt-bloom').checked = s.bloom; $('opt-ao').checked = s.ao; $('opt-detail').checked = s.detail; $('opt-refl').checked = s.reflections;
    this.applyDetail();
    $('opt-fps').checked = s.fps; $('opt-mute').checked = Sound.muted; $('opt-quality').value = s.quality;
    const preset = [...$('opt-chcolor').options].some((o) => o.value === s.chColor);
    $('opt-chcolor').value = preset ? s.chColor : '#5cfff0';
    $('opt-chcustom').value = s.chColor;
    // apply live
    document.documentElement.style.setProperty('--ch-color', s.chColor);
    document.documentElement.style.setProperty('--ch-size', s.chSize + 'px');
    Sound.setVolume(s.master, s.sfx);
    if (this.renderer.shadowMap.enabled !== s.shadows) {
      this.renderer.shadowMap.enabled = s.shadows;
      // materials must be recompiled when shadows are switched
      if (this.scene) this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
    if (this.state !== 'playing' && this.state !== 'cutscene') { this.camera.fov = s.fov; this.camera.updateProjectionMatrix(); }
    $('fps').classList.toggle('hidden', !s.fps);
    this.resize();
  }

  showBest() {
    const b = JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
    $('best-score').textContent = b ? `HIGH SCORE ${b.score.toLocaleString()} — ${b.areas} areas cleared, ${b.waves} waves` : '';
  }

  async openMapSelect() {
    this.setState('mapselect');
    this.selectMap(this.selectedMap);
    // Make preview pictures of every map once (render each map and grab the image).
    if (Object.keys(this.previews).length < MAPS.length && !this.makingPreviews) {
      this.makingPreviews = true;
      for (let i = 0; i < MAPS.length; i++) {
        if (this.state !== 'mapselect') break;
        this.loadMap(i);
        this.orbitCamera(0.8);
        await new Promise((r) => requestAnimationFrame(r));
        this.render();
        this.previews[i] = this.canvas.toDataURL('image/jpeg', 0.8);
        $('map-cards').children[i].querySelector('.pv').style.backgroundImage = `url(${this.previews[i]})`;
      }
      this.makingPreviews = false;
      this.loadMap(this.selectedMap);
    }
  }

  selectMap(i) {
    this.selectedMap = i;
    [...$('map-cards').children].forEach((c, k) => c.classList.toggle('selected', k === i));
    if (!this.makingPreviews && this.mapIndex !== i) this.loadMap(i);
    Sound.ui();
  }

  // Slowly circling camera for the title / map select background.
  orbitCamera(t) {
    const r = Math.min(this.world.halfX, this.world.halfZ) * 0.85 + 6;
    const a = t * 0.1 + 0.8;
    this.camera.position.set(Math.cos(a) * r, 9, Math.sin(a) * r);
    this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 5, 0);
  }

  // ================================================================== run / waves / areas
  /** Start a brand new run on the chosen map. */
  startRun(mapIndex) {
    this.startMap = mapIndex;
    this.selectedMap = mapIndex;
    this.area = 1; this.wave = 0; this.totalWaves = 0; this.areasCleared = 0;
    this.credits = CONFIG.START_CREDITS; this.score = 0; this.kills = 0;
    this.stats = { shots: 0, hits: 0 };
    this.turrets.count = 0;
    this.loadMap(mapIndex);
    this.weapons.reset();
    this.towerHp = CONFIG.TOWER.maxHp;
    this.player.reset(this.world.playerSpawn);
    this.phase = 'intermission';
    this.queue = [];
    this.setState('playing');
    this.hud.weaponChanged();
    this.hud.banner(`AREA ${this.area}`, MAPS[mapIndex].name.toUpperCase(), 3);
    this.marketDelay = 1.2;
    this.lockPointer();
  }

  startWave() {
    if (this.phase === 'wave') return;
    if (this.market.open) this.market.hide();
    this.lockPointer();
    this.wave++;
    const info = buildWave(this.wave, this.area);
    this.waveInfo = info;
    this.enemies.scale = { hp: info.hpScale, speed: info.speedScale, damage: info.damageScale };
    this.queue = info.enemies.slice();
    this.waveTotal = this.queue.length;
    this.waveKills = 0;
    this.counts.summoned = 0;
    this.spawnTimer = 1.2;
    this.phase = 'wave';
    this.marketDelay = 0;
    this.hud.banner(`WAVE ${this.wave}`, info.isBossWave ? '⚠ BOSS INCOMING ⚠' : `AREA ${this.area} · ${MAPS[this.mapIndex].name.toUpperCase()}`);
    Sound.waveStart();
    if (info.isBossWave) setTimeout(() => Sound.bossRoar(), 900);
  }

  enemiesRemaining() { return (this.queue ? this.queue.length : 0) + this.enemies.list.length; }

  /** 0..1 progress toward rescue in this area (fills as waves are cleared). */
  signalProgress() {
    const W = CONFIG.WAVES_PER_AREA;
    if (this.phase !== 'wave') return Math.min(1, this.wave / W);
    const total = this.waveTotal + this.counts.summoned;
    return Math.min(1, (this.wave - 1 + this.waveKills / Math.max(1, total)) / W);
  }

  waveCleared() {
    this.totalWaves++;
    const bonus = CONFIG.WAVE_BONUS_BASE + CONFIG.WAVE_BONUS_PER_WAVE * this.wave + (this.area - 1) * 100;
    this.credits += bonus;
    this.score += bonus;
    const p = this.player;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * CONFIG.PLAYER.healBetweenWaves);
    this.phase = 'intermission';
    Sound.waveClear();
    if (this.wave >= CONFIG.WAVES_PER_AREA) { this.areaCleared(); return; }
    this.hud.banner('WAVE CLEARED', `+${bonus} CREDITS`);
    this.marketDelay = 1.8; // open the market shortly
  }

  areaCleared() {
    this.areasCleared++;
    this.credits += CONFIG.AREA_CLEAR_BONUS;
    this.score += CONFIG.AREA_CLEAR_BONUS * this.area;
    this.hud.banner('AREA CLEARED', `+${CONFIG.AREA_CLEAR_BONUS} CREDITS`, 3);
    this.startCutscene();
  }

  // ================================================================== rescue cutscene
  startCutscene() {
    this.state = 'cutscene';
    this.market.hide();
    this.cs = { t: 0, switched: false, ship: this.buildShip() };
    this.scene.add(this.cs.ship);
    this.hud.show(false);
    $('cutscene').classList.remove('hidden');
    $('cs-text').querySelector('.cs-main').textContent = 'RESCUE HAS ARRIVED';
    const next = MAPS[(this.mapIndex + 1) % MAPS.length];
    $('cs-text').querySelector('.cs-sub').textContent = `RELOCATING TO AREA ${this.area + 1}: ${next.name.toUpperCase()}...`;
    Sound.win();
  }

  // A chunky dropship made of primitives, with glowing engines and a tractor beam.
  buildShip() {
    const g = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0xd8dce8, roughness: 0.4, metalness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e40, roughness: 0.5, metalness: 0.5 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x29f0ff, emissiveIntensity: 4 });
    const red = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff4655, emissiveIntensity: 4 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 8, 6, 12).rotateX(Math.PI / 2), hull); g.add(body);
    const cock = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 10), glow); cock.position.set(0, 0.9, -4.6); cock.scale.set(1, 0.6, 1.2); g.add(cock);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 3.5), dark); wing.position.set(s * 5, 0, 1); wing.rotation.z = s * -0.12; g.add(wing);
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 3, 12).rotateX(Math.PI / 2), hull); eng.position.set(s * 8, 0, 1.5); g.add(eng);
      const flame = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), glow); flame.position.set(s * 8, 0, 3.05); g.add(flame);
      const down = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 12), glow); down.position.set(s * 8, -1.2, 1.5); g.add(down);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), red); tip.position.set(s * 8.6, 0.2, 0); g.add(tip);
    }
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x29f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 6, 1, 24, 1, true), beamMat);
    g.add(beam);
    g.userData.beam = beam;
    g.position.set(0, 80, -90);
    return g;
  }

  updateCutscene(dt) {
    const cs = this.cs, ship = cs.ship;
    cs.t += dt;
    const t = cs.t;
    this.world.update(dt, 1);
    this.effects.update(dt);
    // ship flies in and hovers above the tower
    const k = Math.min(1, t / 3.5), e = 1 - Math.pow(1 - k, 3);
    ship.position.set(0, 80 + (26 - 80) * e + Math.sin(t * 2) * 0.3, -90 + 90 * e);
    ship.rotation.x = (1 - e) * 0.25;
    // tractor beam from the ship down to the ground
    const beam = ship.userData.beam;
    const bh = ship.position.y;
    beam.scale.y = bh; beam.position.y = -bh / 2;
    beam.material.opacity = THREE.MathUtils.clamp((t - 3.2) * 0.6, 0, 0.45);
    if (t > 3.2 && Math.random() < 0.6) this.effects.spawn((Math.random() - 0.5) * 6, 0.2, (Math.random() - 0.5) * 6, 0, 6 + Math.random() * 6, 0, 2.5, 0x29f0ff, 0, 0);
    // camera turns to watch the ship and is lifted by the beam
    if (!cs.switched) {
      const target = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(this.camera.position, ship.position, new THREE.Vector3(0, 1, 0)));
      this.camera.quaternion.slerp(target, Math.min(1, dt * 2.5));
      if (t > 4.3) this.camera.position.y += dt * (t - 4.3) * 6;
    }
    if (t > 5.4) $('fade').classList.add('on');
    if (t > 6.4 && !cs.switched) {
      cs.switched = true;
      // ---- move to the next area: keep credits, weapons, turrets, score ----
      this.area++;
      this.wave = 0;
      this.loadMap((this.mapIndex + 1) % MAPS.length);
      this.towerHp = CONFIG.TOWER.maxHp;
      this.player.reset(this.world.playerSpawn, true);
      this.player.hp = this.player.maxHp;
      this.weapons.refillAll();
    }
    if (t > 7.2 && cs.switched) {
      $('fade').classList.remove('on');
      $('cutscene').classList.add('hidden');
      this.cs = null;
      this.state = 'playing';
      this.phase = 'intermission';
      this.queue = [];
      this.hud.show(true);
      this.hud.banner(`AREA ${this.area}`, MAPS[this.mapIndex].name.toUpperCase(), 3);
      this.marketDelay = 2.2;
    }
  }

  // ================================================================== market
  buyBlocked(id) {
    const W = CONFIG.WEAPONS[id], I = CONFIG.ITEMS[id];
    const price = W ? W.price : I.price;
    if (W && this.weapons.owned[id]) return 'Owned';
    if (id === 'ammo' && !Object.keys(this.weapons.owned).some((w) => CONFIG.WEAPONS[w].mag && CONFIG.WEAPONS[w].maxReserve < 999 &&
      (this.weapons.ammo[w].reserve < CONFIG.WEAPONS[w].maxReserve || this.weapons.ammo[w].mag < CONFIG.WEAPONS[w].mag))) return 'Ammo already full';
    if ((id === 'light' || id === 'heavy') && this.player.armour >= CONFIG.PLAYER.maxArmour) return 'Armour full';
    if (id === 'medkit' && this.player.hp >= this.player.maxHp) return 'Health full';
    if (id === 'repair' && this.towerHp >= CONFIG.TOWER.maxHp) return 'Tower at full health';
    if (id === 'turret' && this.turrets.count >= I.max) return 'Max turrets';
    if (this.credits < price) return 'Not enough credits';
    return false;
  }

  /** Try to buy a weapon or item. Returns true on success. */
  buy(id) {
    if (this.buyBlocked(id)) { Sound.denied(); return false; }
    const W = CONFIG.WEAPONS[id], I = CONFIG.ITEMS[id];
    this.credits -= W ? W.price : I.price;
    const p = this.player;
    if (W) this.weapons.give(id);
    else switch (id) {
      case 'ammo': this.weapons.refillAll(); break;
      case 'light': p.armour = Math.min(CONFIG.PLAYER.maxArmour, p.armour + I.armour); break;
      case 'heavy': p.armour = CONFIG.PLAYER.maxArmour; break;
      case 'medkit': p.hp = Math.min(p.maxHp, p.hp + I.heal); break;
      case 'repair': this.towerHp = Math.min(CONFIG.TOWER.maxHp, this.towerHp + I.amount); break;
      case 'turret': this.turrets.add(); break;
    }
    Sound.buy();
    this.hud.weaponChanged();
    return true;
  }

  nearKiosk() {
    const k = this.world.kioskPos, p = this.player.pos;
    return Math.hypot(k.x - p.x, k.z - p.z) < CONFIG.KIOSK.useRange;
  }

  tryOpenMarket() {
    if (this.phase === 'intermission' || this.nearKiosk()) this.openMarket();
    else { Sound.denied(); this.hud.banner('MARKET LOCKED', 'Only between waves — or at the terminal by the tower', 1.6); }
  }

  openMarket() {
    this.market.show(this.phase === 'intermission');
    this.input.mouseL = this.input.mouseR = false;
    this.suppressUnlock = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.hint('');
  }

  closeMarket() {
    this.market.hide();
    this.lockPointer();
  }

  // ================================================================== damage
  hitEnemy(e, dmg, head, point, weaponId, splash = false) {
    if (!e.alive) return false;
    const killed = e.hurt(dmg);
    const byPlayer = weaponId !== 'turret';
    if (byPlayer) {
      this.stats.hits++;
      this.hud.damageNumber(point, dmg, head);
      this.hud.hitMarker(killed ? 'kill' : head ? 'head' : 'hit');
      if (head) Sound.headshot(); else Sound.hit();
    }
    if (killed) {
      const reward = e.def.reward;
      this.credits += reward;
      this.score += reward * this.area;
      this.kills++;
      this.waveKills++;
      this.hud.killFeed(weaponId, e.type, reward, head);
      Sound.enemyDie();
      if (byPlayer) Sound.kill();
    }
    return killed;
  }

  damagePlayer(amount, src, selfInflicted = false) {
    if (!this.player.alive || this.state !== 'playing') return;
    if (this.godMode) { this.hurtFlash = 0.5; return; } // test/debug helper: invulnerable
    this.player.takeDamage(amount);
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.5);
    this.player.shake = Math.max(this.player.shake, 0.3);
    Sound.playerHit();
    if (!selfInflicted && src) this.hud.damageIndicator(src);
  }

  damageTower(amount, src) {
    if (this.state !== 'playing' || this.godMode) return;
    this.towerHp = Math.max(0, this.towerHp - amount);
    const now = performance.now();
    if (!this.lastTowerSound || now - this.lastTowerSound > 250) { Sound.towerHit(); this.lastTowerSound = now; }
    if (src) {
      const dir = new THREE.Vector3(src.x, 0, src.z).normalize();
      this.effects.impact(new THREE.Vector3(dir.x * 2.2, 1.5, dir.z * 2.2), dir, this.world.palette.tower);
    }
  }

  muzzleFlash() { this.muzzleLight.intensity = 25; this.vmFlash.intensity = 6; }

  gameOver(reason) {
    this.state = 'gameover';
    this.market.hide();
    this.suppressUnlock = true;
    if (document.pointerLockElement) document.exitPointerLock();
    Sound.gameOver();
    const best = JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
    const isBest = !best || this.score > best.score;
    if (isBest) localStorage.setItem(BEST_KEY, JSON.stringify({ score: this.score, areas: this.areasCleared, waves: this.totalWaves, map: MAPS[this.startMap].name }));
    const acc = this.stats.shots ? Math.round(Math.min(1, this.stats.hits / this.stats.shots) * 100) : 0;
    $('go-reason').textContent = reason;
    $('go-stats').innerHTML = [
      ['AREAS CLEARED', this.areasCleared], ['WAVES SURVIVED', this.totalWaves], ['SCORE', this.score.toLocaleString()],
      ['KILLS', this.kills], ['REACHED', `AREA ${this.area} · W${this.wave}`], ['ACCURACY', acc + '%'],
    ].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    const b = JSON.parse(localStorage.getItem(BEST_KEY));
    $('go-best').textContent = isBest ? '★ NEW HIGH SCORE! ★' : `HIGH SCORE ${b.score.toLocaleString()} (${b.areas} areas, ${b.waves} waves)`;
    this.setState('gameover');
    this.showBest();
  }

  // ================================================================== pause / pointer lock
  lockPointer() {
    if (this.testMode) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => this.hud.hint('Click to capture the mouse'));
    } catch (e) { /* ignore */ }
  }

  onUnlock() {
    if (this.suppressUnlock) { this.suppressUnlock = false; return; }
    if (this.state === 'playing' && !this.market.open) this.pause();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.input.mouseL = this.input.mouseR = false;
    this.keys = {};
    this.setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.setState('playing');
    this.lockPointer();
  }

  // ================================================================== input
  setupInput() {
    window.addEventListener('keydown', (e) => {
      const code = keyCode(e);
      Sound.init();
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(code) || (this.state === 'playing' && CONFIG.KEYS.crouch.includes(code))) e.preventDefault();
      if (e.repeat) return;
      this.keys[code] = true;
      this.onKey(code);
      if (this.state === 'playing' && !this.market.open) {
        if (CONFIG.KEYS.crouch.includes(code)) this.player.crouchTap = true;
        if (CONFIG.KEYS.jump.includes(code)) this.player.jumpTap = true;
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[keyCode(e)] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.input.mouseL = this.input.mouseR = false; });
    this.canvas.addEventListener('mousedown', (e) => {
      Sound.init();
      if (this.state !== 'playing' || this.market.open) return;
      if (!document.pointerLockElement && !this.testMode) { this.lockPointer(); return; }
      if (e.button === 0) { this.input.mouseL = true; this.input.mouseLPressed = true; }
      if (e.button === 2) this.input.mouseR = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { if (this.input.mouseL) this.input.mouseLReleased = true; this.input.mouseL = false; }
      if (e.button === 2) this.input.mouseR = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.state === 'playing' && !this.market.open) this.weapons.cycle(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      this.input.lookDX += e.movementX; this.input.lookDY += e.movementY;
      if (this.state === 'playing' && !this.market.open) this.look(e.movementX, e.movementY);
    });
  }

  /** Mouse-look: yaw/pitch the camera using the sensitivity settings. */
  look(dx, dy) {
    const s = this.settings, cam = this.camera;
    let k = 0.002 * s.sens * CONFIG.PLAYER.mouseSensitivity;
    if (this.weapons.isAiming) k *= s.adsMult;
    k *= this.camera.fov / s.fov;            // slower when zoomed in, so aim feels consistent
    cam.rotation.y -= dx * k;
    cam.rotation.x -= dy * k * (s.invertY ? -1 : 1);
    cam.rotation.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, cam.rotation.x));
  }

  onKey(code) {
    if (this.settingsOpen) { if (code === 'Escape') this.closeSettings(); return; }
    if (code === 'KeyM') { Sound.toggleMute(); $('opt-mute').checked = Sound.muted; }
    switch (this.state) {
      case 'title': if (code === 'Enter') this.openMapSelect(); break;
      case 'mapselect':
        if (code === 'Enter') this.startRun(this.selectedMap);
        if (code.startsWith('Digit')) { const n = +code.slice(5) - 1; if (MAPS[n]) this.selectMap(n); }
        if (code === 'Escape') this.setState('title');
        break;
      case 'paused': if (code === 'Escape' || code === 'KeyP') this.resume(); break;
      case 'gameover': if (code === 'Enter') this.startRun(this.startMap); break;
      case 'playing':
        if (this.market.open) {
          if (code === 'KeyB' || code === 'Escape') this.closeMarket();
          else if (code === 'Enter' && this.phase === 'intermission') this.startWave();
          else this.market.key(code);
          return;
        }
        if (code.startsWith('Digit')) this.weapons.selectSlot(+code.slice(5));
        else if (CONFIG.KEYS.reload.includes(code)) this.weapons.reload();
        else if (CONFIG.KEYS.inspect.includes(code)) this.weapons.inspect();
        else if (code === 'KeyQ') this.weapons.cycle(-1);
        else if (code === 'KeyB') this.tryOpenMarket();
        else if ((code === 'Enter' || code === 'KeyN') && this.phase === 'intermission') this.startWave();
        else if (code === 'KeyG') { this.settings.bloom = !this.settings.bloom; this.settings.quality = 'custom'; this.applySettings(); }
        else if (code === 'Escape' || code === 'KeyP') this.pause();
        break;
    }
  }

  // ================================================================== loop
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time = (this.time || 0) + dt;

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'cutscene') this.updateCutscene(dt);
    else if (this.state === 'title' || this.state === 'mapselect') {
      if (!this.makingPreviews) this.orbitCamera(this.time);
      this.world.update(dt, 1);
    }
    this.input.mouseLPressed = false; this.input.mouseLReleased = false;
    this.input.lookDX = 0; this.input.lookDY = 0;

    if (!this.makingPreviews) this.render();

    if (this.settings.fps) {
      this.fpsAcc += dt; this.fpsFrames++;
      if (this.fpsAcc > 0.5) { $('fps').textContent = Math.round(this.fpsFrames / this.fpsAcc) + ' FPS'; this.fpsAcc = 0; this.fpsFrames = 0; }
    }
  }

  update(dt) {
    const marketOpen = this.market.open;
    this.world.update(dt, this.towerHp / CONFIG.TOWER.maxHp);

    // Open the market automatically shortly after a wave ends.
    if (this.marketDelay > 0) {
      this.marketDelay -= dt;
      if (this.marketDelay <= 0 && this.phase === 'intermission' && !marketOpen) this.openMarket();
    }

    const p = this.player;
    p.aiming = this.weapons.isAiming;
    p.update(dt, marketOpen ? {} : this.keys, this.world);
    this.weapons.update(dt, marketOpen ? this.noInput : this.input);

    // Field of view: zoom when aiming, widen slightly when sprinting.
    const d = this.weapons.def;
    const baseFov = this.settings.fov;
    const zoomFov = d.zoom ? Math.min(d.zoom, baseFov) : baseFov - 8;   // ADS zooms a little even without a scope
    const targetFov = baseFov + (zoomFov - baseFov) * this.weapons.aimT + (p.sprinting ? 5 : 0) + (p.slideK || 0) * 10;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 15);
      this.camera.updateProjectionMatrix();
    }

    // Spawning
    if (this.phase === 'wave') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.queue.length && this.enemies.list.length < CONFIG.MAX_ALIVE_ENEMIES) {
        const type = this.queue.shift();
        const e = this.enemies.spawn(type);
        this.effects.burst(e.center(), e.def.color, 25, 4, 0.6);
        this.spawnTimer = this.waveInfo.spawnDelay;
        if (type === 'boss') this.hud.banner('⚠ HIVE COLOSSUS ⚠', 'Shoot the glowing eye!', 2.5);
      }
    }
    this.enemies.update(dt);
    this.turrets.update(dt);
    this.effects.update(dt);
    this.muzzleLight.position.copy(this.weapons.muzzleWorld());
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 400);
    this.vmFlash.intensity = Math.max(0, this.vmFlash.intensity - dt * 100);

    if (this.phase === 'wave' && this.queue.length === 0 && this.enemies.list.length === 0) this.waveCleared();

    // Hints
    if (marketOpen) this.hud.hint('');
    else if (!document.pointerLockElement && !this.testMode) this.hud.hint('<b>CLICK</b> to capture the mouse');
    else if (this.phase === 'intermission') this.hud.hint(`<b>[B]</b> Market &nbsp;·&nbsp; <b>[ENTER]</b> Start wave ${this.wave + 1}`);
    else if (this.nearKiosk()) this.hud.hint('<b>[B]</b> Use market terminal');
    else this.hud.hint('');

    if (this.market.open && Math.random() < 0.1) this.market.refresh();
    this.hud.update(dt);

    if (!p.alive) this.gameOver('You were overrun. The signal went dark.');
    else if (this.towerHp <= 0) this.gameOver('The radio tower was destroyed. The signal went dark.');
  }

  render() {
    const showGun = this.state === 'playing' || this.state === 'paused';
    if (this.settings.bloom || this.settings.ao) {
      this.vmPass.enabled = showGun;
      this.bloomPass.enabled = this.settings.bloom;
      this.aoPass.enabled = this.settings.ao;
      this.composer.render();
    } else {
      this.renderer.autoClear = true;
      this.renderer.render(this.scene, this.camera);
      if (showGun) {
        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        this.renderer.render(this.vmScene, this.vmCamera);
      }
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 1.5) * this.settings.res;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = this.vmCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.updateProjectionMatrix();
  }

  // ================================================================== test helpers
  /** Point the camera at a world position (used by automated tests). */
  lookAt(x, y, z) {
    const eye = this.camera.position;
    const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
    this.camera.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0);
  }
}

window.game = new Game();
