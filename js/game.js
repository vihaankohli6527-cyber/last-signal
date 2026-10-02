/* =========================================================================
   game.js — the main game: state machine, input, wave logic,
   collisions, upgrades, HUD and screens.

   Game states (game.state):
     'title'    - title screen, waiting for the player to start
     'playing'  - a wave is in progress
     'upgrade'  - between waves, spend points in the shop
     'paused'   - game paused (P or Esc)
     'gameover' - tower or player destroyed
     'win'      - survived all waves, rescue arrived
   ========================================================================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = CONFIG.WIDTH;
const H = CONFIG.HEIGHT;

// ---------------------------------------------------------------------------
// Scale the canvas to fit the window while keeping the 16:9 shape.
// The game always "thinks" in 1280x720 units; only the display size changes.
// ---------------------------------------------------------------------------
function resize() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Input: keyboard + mouse. We only record what is pressed here;
// the update() function reads these values every frame.
// ---------------------------------------------------------------------------
const input = {
  keys: {},              // e.g. input.keys['KeyW'] === true while held
  mouseX: W / 2,
  mouseY: H / 2,
  mouseDown: false,
};

// Convert a mouse event's screen position into game-world coordinates.
function toGameCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height),
  };
}

window.addEventListener('keydown', (e) => {
  Sound.init();
  input.keys[e.code] = true;
  // Stop arrow keys / space from scrolling the page.
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  onKeyPress(e.code);
});
window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
// If the window loses focus, release everything so the player doesn't keep walking.
window.addEventListener('blur', () => { input.keys = {}; input.mouseDown = false; });

canvas.addEventListener('mousemove', (e) => {
  const p = toGameCoords(e);
  input.mouseX = p.x;
  input.mouseY = p.y;
});
canvas.addEventListener('mousedown', (e) => {
  Sound.init();
  const p = toGameCoords(e);
  input.mouseX = p.x;
  input.mouseY = p.y;
  input.mouseDown = true;
  onClick(p.x, p.y);
});
window.addEventListener('mouseup', () => { input.mouseDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------------------
// Game state. Everything that changes during play lives in this one object,
// which makes restarting easy (just call resetGame()).
// ---------------------------------------------------------------------------
const game = {
  state: 'title',
  wave: 0,
  points: 0,        // spendable currency
  score: 0,         // total score (never goes down)
  kills: 0,
  wavesCompleted: 0, // drives the signal-strength meter
  player: null,
  tower: null,
  aliens: [],
  bullets: [],
  turrets: [],
  particles: [],
  texts: [],
  spawnQueue: [],   // aliens still to spawn this wave
  spawnTimer: 0,
  waveInfo: null,
  shake: 0,         // "trauma" 0..1; the visible offset is maxOffset * shake² (see addShake)
  bannerTimer: 0,   // "WAVE 3" banner at wave start
  upgradeLevels: {},
  buttons: [],      // clickable rectangles on the current screen
  time: 0,
};
window.game = game; // handy for debugging in the browser console (and for tests)

// ---------------------------------------------------------------------------
// Settings (saved in the browser)
// ---------------------------------------------------------------------------
const SETTINGS_KEY = 'lastSignal2d.settings';
const settings = Object.assign({ shake: CONFIG.SHAKE.default }, (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { return {}; }
})());
if (!(settings.shake in CONFIG.SHAKE.levels)) settings.shake = CONFIG.SHAKE.default;
game.settings = settings;
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ } }
function cycleShake() {
  const order = ['off', 'low', 'normal'];
  settings.shake = order[(order.indexOf(settings.shake) + 1) % order.length];
  saveSettings();
  if (Sound.buy) Sound.buy();
}

/* Gentle screen shake. amount is added to a 0..1 "trauma" value that is
   capped (so hits can't stack into big jolts) and fades out quickly.
   The offset uses smooth sine noise instead of random jumps. */
function addShake(amount, cap = 1) {
  if (game.shake >= cap) return;
  game.shake = Math.min(cap, game.shake + amount);
}
function shakeOffset() {
  const k = CONFIG.SHAKE.levels[settings.shake] || 0;
  if (!k || game.shake <= 0) return null;
  const mag = CONFIG.SHAKE.maxOffset * k * game.shake * game.shake;
  const t = game.time;
  return {
    x: mag * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 31.7 + 1.3) * 0.4),
    y: mag * (Math.sin(t * 41.9 + 2.1) * 0.6 + Math.sin(t * 27.1 + 0.7) * 0.4),
  };
}
game.shakeOffset = shakeOffset;

function resetGame() {
  game.wave = 0;
  game.points = 0;
  game.score = 0;
  game.kills = 0;
  game.wavesCompleted = 0;
  game.player = new Player(W / 2, H / 2 + 90);
  game.tower = new Tower(W / 2, H / 2);
  game.aliens = [];
  game.bullets = [];
  game.turrets = [];
  game.particles = [];
  game.texts = [];
  game.shake = 0;
  game.upgradeLevels = {};
  CONFIG.UPGRADES.forEach((u) => (game.upgradeLevels[u.id] = 0));
}

// Start the next wave: build its alien list and switch to 'playing'.
function startNextWave() {
  game.wave++;
  game.waveInfo = buildWave(game.wave);
  game.spawnQueue = game.waveInfo.aliens.slice();
  game.spawnTimer = 1.0; // short breather before the first alien
  game.bannerTimer = 2.0;
  game.bullets = [];
  game.state = 'playing';
  Sound.waveStart();
}

// Called when every alien of the wave has been spawned and killed.
function waveCleared() {
  game.wavesCompleted = game.wave;
  const bonus = 20 + game.wave * 10;
  game.points += bonus;
  game.score += bonus;
  // Heal the player a bit between waves.
  const p = game.player;
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * CONFIG.PLAYER.healBetweenWaves);

  if (game.wave >= CONFIG.TOTAL_WAVES) {
    game.state = 'win';
    Sound.win();
  } else {
    game.lastBonus = bonus;
    game.state = 'upgrade';
  }
}

function gameOver(reason) {
  game.state = 'gameover';
  game.gameOverReason = reason;
  Sound.gameOver();
}

// Pick a random point just outside one of the four map edges.
function randomEdgePoint() {
  const m = 30;
  switch (Math.floor(Math.random() * 4)) {
    case 0: return { x: rand(0, W), y: -m };      // top
    case 1: return { x: W + m, y: rand(0, H) };   // right
    case 2: return { x: rand(0, W), y: H + m };   // bottom
    default: return { x: -m, y: rand(0, H) };     // left
  }
}

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------
function upgradeCost(u) {
  return u.cost + u.costStep * game.upgradeLevels[u.id];
}

// Returns false if the upgrade can't be bought right now (and why).
function upgradeBlocked(u) {
  if (u.id === 'repair' && game.tower.hp >= game.tower.maxHp) return 'Tower at full HP';
  if (u.id === 'turret' && game.turrets.length >= CONFIG.TURRET.max) return 'Max turrets';
  if (game.points < upgradeCost(u)) return 'Not enough points';
  return false;
}

function buyUpgrade(index) {
  const u = CONFIG.UPGRADES[index];
  if (!u) return;
  if (upgradeBlocked(u)) { Sound.denied(); return; }

  game.points -= upgradeCost(u);
  game.upgradeLevels[u.id]++;
  const p = game.player;
  const t = game.tower;

  switch (u.id) {
    case 'fireRate': p.fireDelay *= 0.85; break;
    case 'damage':   p.damage += 5; break;
    case 'repair':   t.hp = Math.min(t.maxHp, t.hp + 150); break;
    case 'maxHp':    p.maxHp += 25; p.hp = p.maxHp; break;
    case 'turret': {
      // Turrets sit diagonally around the tower.
      const slot = game.turrets.length;
      const a = Math.PI / 4 + slot * (Math.PI / 2);
      game.turrets.push(new Turret(t.x + Math.cos(a) * 75, t.y + Math.sin(a) * 75));
      break;
    }
  }
  Sound.buy();
}

// ---------------------------------------------------------------------------
// Handling key presses and clicks that depend on the current screen.
// ---------------------------------------------------------------------------
function onKeyPress(code) {
  const confirm = code === 'Enter' || code === 'Space';
  switch (game.state) {
    case 'title':
      if (confirm) { resetGame(); startNextWave(); }
      if (code === 'KeyM') Sound.muted = !Sound.muted;
      break;
    case 'playing':
      if (code === 'KeyP' || code === 'Escape') game.state = 'paused';
      if (code === 'KeyM') Sound.muted = !Sound.muted;
      break;
    case 'paused':
      if (code === 'KeyP' || code === 'Escape' || confirm) game.state = 'playing';
      if (code === 'KeyM') Sound.muted = !Sound.muted;
      break;
    case 'upgrade':
      if (code.startsWith('Digit')) buyUpgrade(parseInt(code.slice(5), 10) - 1);
      if (confirm) startNextWave();
      break;
    case 'gameover':
    case 'win':
      if (confirm) { resetGame(); startNextWave(); }
      break;
  }
}

function onClick(x, y) {
  // Check the buttons drawn on the current screen.
  for (const b of game.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      input.mouseDown = false; // don't fire a shot from the same click
      b.action();
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// UPDATE — move everything forward by dt seconds.
// ---------------------------------------------------------------------------
function update(dt) {
  game.time += dt;
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * CONFIG.SHAKE.decay);
  if (game.state !== 'playing') {
    // Keep the tower animating on other screens so it feels alive.
    if (game.tower) game.tower.update(dt);
    updateEffects(dt);
    return;
  }

  const p = game.player;
  const t = game.tower;

  // --- Player movement (WASD or arrows) ---
  let mx = 0, my = 0;
  if (input.keys.KeyW || input.keys.ArrowUp) my -= 1;
  if (input.keys.KeyS || input.keys.ArrowDown) my += 1;
  if (input.keys.KeyA || input.keys.ArrowLeft) mx -= 1;
  if (input.keys.KeyD || input.keys.ArrowRight) mx += 1;
  if (mx || my) {
    const len = Math.hypot(mx, my); // normalise so diagonals aren't faster
    p.x += (mx / len) * p.speed * dt;
    p.y += (my / len) * p.speed * dt;
  }
  p.x = clamp(p.x, p.r, W - p.r);
  p.y = clamp(p.y, p.r, H - p.r);

  // The player can't walk through the tower: push them out.
  const dt2 = dist(p.x, p.y, t.x, t.y);
  if (dt2 < p.r + t.r && dt2 > 0) {
    p.x = t.x + ((p.x - t.x) / dt2) * (p.r + t.r);
    p.y = t.y + ((p.y - t.y) / dt2) * (p.r + t.r);
  }

  // --- Aiming and shooting ---
  p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  p.cooldown -= dt;
  if (p.flash > 0) p.flash -= dt;
  if (p.hurtTimer > 0) p.hurtTimer -= dt;
  if (input.mouseDown && p.cooldown <= 0) {
    p.cooldown = p.fireDelay;
    p.flash = 0.05;
    const spread = rand(-0.04, 0.04);
    game.bullets.push(new Bullet(
      p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24,
      p.angle + spread, CONFIG.PLAYER.bulletSpeed, p.damage, '#fff27a'
    ));
    Sound.shoot();
  }

  // --- Spawning aliens from the edges ---
  game.spawnTimer -= dt;
  if (game.spawnQueue.length && game.spawnTimer <= 0) {
    game.spawnTimer = game.waveInfo.spawnDelay;
    const type = game.spawnQueue.shift();
    const pos = randomEdgePoint();
    game.aliens.push(new Alien(type, pos.x, pos.y, game.waveInfo.hpScale, game.waveInfo.speedScale));
  }

  // --- Tower, turrets ---
  t.update(dt);
  for (const tur of game.turrets) {
    const b = tur.update(dt, game.aliens);
    if (b) { game.bullets.push(b); Sound.turret(); }
  }

  // --- Aliens move and attack ---
  for (const a of game.aliens) {
    const touching = a.update(dt, p, t);
    if (touching === 'tower') {
      t.hp -= a.damage * dt;
      if (t.hurtTimer <= 0) { Sound.towerHit(); t.hurtTimer = 0.25; }
      addShake(dt * 1.2, 0.5); // gentle rumble while the tower is under attack (capped)
    } else if (touching === 'player') {
      p.hp -= a.damage * dt;
      if (p.hurtTimer <= 0) { Sound.playerHit(); p.hurtTimer = 0.2; }
    }
  }

  // --- Bullets move and hit aliens ---
  for (const b of game.bullets) {
    b.update(dt);
    if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) b.dead = true;
    if (b.dead) continue;
    for (const a of game.aliens) {
      if (a.dead) continue;
      if (dist(b.x, b.y, a.x, a.y) < a.r + b.r) {
        b.dead = true;
        a.hp -= b.damage;
        a.hitFlash = 0.06;
        spawnParticles(b.x, b.y, '#d8ff9a', 5, 150);
        Sound.hit();
        if (a.hp <= 0) killAlien(a);
        break;
      }
    }
  }

  updateEffects(dt);

  // Remove dead things from the lists.
  game.aliens = game.aliens.filter((a) => !a.dead);
  game.bullets = game.bullets.filter((b) => !b.dead);

  if (game.bannerTimer > 0) game.bannerTimer -= dt;

  // --- Lose / win checks ---
  if (t.hp <= 0) { t.hp = 0; addShake(0.8); spawnParticles(t.x, t.y, '#4fc3ff', 60, 400); gameOver('The radio tower was destroyed.'); return; }
  if (p.hp <= 0) { p.hp = 0; spawnParticles(p.x, p.y, '#ff6b6b', 40, 300); gameOver('You were overrun.'); return; }
  if (!game.spawnQueue.length && !game.aliens.length) waveCleared();
}

function killAlien(a) {
  a.dead = true;
  game.points += a.points;
  game.score += a.points;
  game.kills++;
  spawnParticles(a.x, a.y, a.color, a.type === 'brute' ? 30 : 15, 260);
  game.texts.push(new FloatText(a.x, a.y - a.r, '+' + a.points, '#c6ff3d'));
  Sound.alienDie();
}

function spawnParticles(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) game.particles.push(new Particle(x, y, color, speed));
}

function updateEffects(dt) {
  for (const pt of game.particles) pt.update(dt);
  for (const tx of game.texts) tx.update(dt);
  game.particles = game.particles.filter((pt) => !pt.dead);
  game.texts = game.texts.filter((tx) => !tx.dead);
}

// ---------------------------------------------------------------------------
// DRAW — paint the current frame.
// ---------------------------------------------------------------------------

// The ground is drawn once into an off-screen canvas and reused every frame.
const groundCanvas = document.createElement('canvas');
groundCanvas.width = W;
groundCanvas.height = H;
(function paintGround() {
  const g = groundCanvas.getContext('2d');
  g.fillStyle = '#070b12';
  g.fillRect(0, 0, W, H);
  // Faint grid
  g.strokeStyle = 'rgba(60, 90, 120, 0.08)';
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // Random rocks and grass specks
  for (let i = 0; i < 350; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(40, 60, 50, 0.6)' : 'rgba(30, 40, 60, 0.6)';
    const s = rand(1, 4);
    g.fillRect(rand(0, W), rand(0, H), s, s);
  }
  // Dark vignette around the edges (it's night time)
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
})();

function draw() {
  game.buttons = []; // screens re-register their buttons every frame

  ctx.save();
  // Screen shake: offset the world by a small, smooth amount (HUD stays still).
  const so = shakeOffset();
  if (so) ctx.translate(so.x, so.y);

  ctx.drawImage(groundCanvas, 0, 0);

  if (game.state === 'title') {
    ctx.restore();
    drawTitle();
    return;
  }

  drawWorld();
  ctx.restore();

  drawHUD();
  if (game.state === 'upgrade') drawUpgradeScreen();
  if (game.state === 'paused') drawPause();
  if (game.state === 'gameover') drawGameOver();
  if (game.state === 'win') drawWin();
}

function drawWorld() {
  const signal = game.wave / CONFIG.TOTAL_WAVES;
  game.tower.draw(ctx, signal);
  for (const tur of game.turrets) tur.draw(ctx);
  for (const a of game.aliens) a.draw(ctx);
  for (const b of game.bullets) b.draw(ctx);
  if (game.player.hp > 0) game.player.draw(ctx);
  for (const pt of game.particles) pt.draw(ctx);
  for (const tx of game.texts) tx.draw(ctx);

  // Torch-light around the player for atmosphere
  const p = game.player;
  const light = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 160);
  light.addColorStop(0, 'rgba(120, 200, 255, 0.08)');
  light.addColorStop(1, 'rgba(120, 200, 255, 0)');
  ctx.fillStyle = light;
  ctx.fillRect(p.x - 160, p.y - 160, 320, 320);
}

// A labelled health bar.
function drawBar(x, y, w, h, value, max, color, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(value / max, 0, 1), h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${label}  ${Math.ceil(value)}/${max}`, x + 6, y + h - 4);
}

function drawHUD() {
  const p = game.player;
  const t = game.tower;

  // Top-left: health bars
  drawBar(20, 20, 260, 18, p.hp, p.maxHp, p.hp / p.maxHp < 0.3 ? '#ff4d4d' : '#4fc3ff', 'PLAYER');
  drawBar(20, 46, 260, 18, t.hp, t.maxHp, t.hp / t.maxHp < 0.3 ? '#ff4d4d' : '#3be0a0', 'TOWER');

  // Top-centre: wave
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8f7ff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`WAVE ${game.wave} / ${CONFIG.TOTAL_WAVES}`, W / 2, 34);
  if (game.state === 'playing') {
    const left = game.spawnQueue.length + game.aliens.length;
    ctx.font = '13px monospace';
    ctx.fillStyle = '#9fdcff';
    ctx.fillText(`Aliens remaining: ${left}`, W / 2, 54);
  }

  // Top-right: score, points and signal strength
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#fff27a';
  ctx.fillText(`POINTS ${game.points}`, W - 20, 30);
  ctx.fillStyle = '#c0c8d0';
  ctx.fillText(`SCORE ${game.score}`, W - 20, 52);

  // Signal strength: 10 little bars, one lights up per completed wave.
  const done = game.wavesCompleted;
  const bx = W - 20 - CONFIG.TOTAL_WAVES * 12;
  for (let i = 0; i < CONFIG.TOTAL_WAVES; i++) {
    const bh = 6 + i * 2;
    ctx.fillStyle = i < done ? '#4fc3ff' : 'rgba(79,195,255,0.15)';
    ctx.fillRect(bx + i * 12, 86 - bh, 8, bh);
  }
  ctx.font = '12px monospace';
  ctx.fillStyle = '#9fdcff';
  const wavesLeft = CONFIG.TOTAL_WAVES - done;
  ctx.fillText(wavesLeft > 0 ? `SIGNAL ${done * 10}% — Rescue in ${wavesLeft} wave${wavesLeft > 1 ? 's' : ''}` : 'RESCUE INBOUND', W - 20, 104);

  // Wave start banner
  if (game.state === 'playing' && game.bannerTimer > 0) {
    ctx.globalAlpha = Math.min(1, game.bannerTimer);
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px monospace';
    ctx.fillStyle = '#7dff5a';
    ctx.shadowColor = '#7dff5a';
    ctx.shadowBlur = 20;
    ctx.fillText(`WAVE ${game.wave}`, W / 2, H / 2 - 120);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // Bottom hint
  if (game.state === 'playing') {
    ctx.textAlign = 'left';
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(200,220,240,0.4)';
    ctx.fillText('P: pause   M: mute', 20, H - 16);
  }
}

// Draws a clickable button and registers it in game.buttons.
function drawButton(x, y, w, h, label, action, enabled = true, sub = '') {
  const hover = input.mouseX >= x && input.mouseX <= x + w && input.mouseY >= y && input.mouseY <= y + h;
  ctx.fillStyle = enabled ? (hover ? '#1f4a63' : '#14303f') : '#1a1d22';
  ctx.strokeStyle = enabled ? '#4fc3ff' : '#3a4048';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'left';
  ctx.fillStyle = enabled ? '#e8f7ff' : '#6a7480';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(label, x + 14, y + (sub ? 24 : h / 2 + 6));
  if (sub) {
    ctx.font = '12px monospace';
    ctx.fillStyle = enabled ? '#9fdcff' : '#555d66';
    ctx.fillText(sub, x + 14, y + 44);
  }
  game.buttons.push({ x, y, w, h, action });
}

function dimBackground(alpha = 0.7) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// HOME SCREEN — explains the story, the aliens, the shop and the controls.
// ---------------------------------------------------------------------------

// Word-wrap text inside a width; returns the y after the last line.
function wrapText(text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lineH; }
    else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lineH; }
  return y;
}

// Rounded panel with a coloured header.
function drawPanel(x, y, w, h, title, color = '#4fc3ff') {
  ctx.fillStyle = 'rgba(8, 16, 26, 0.88)';
  ctx.strokeStyle = 'rgba(79, 195, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 10); else ctx.rect(x, y, w, h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(x + 18, y + 40, 46, 3);
  ctx.textAlign = 'left';
  ctx.font = 'bold 17px monospace';
  ctx.fillText(title, x + 18, y + 30);
}

// A keyboard key cap with a label inside.
function drawKey(x, y, label, w = 34) {
  const h = 32;
  ctx.fillStyle = '#1b2a3a';
  ctx.strokeStyle = '#7fd4ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x + 3, y + 3, w - 6, 8);
  ctx.fillStyle = '#e8f7ff';
  ctx.font = `bold ${label.length > 2 ? 12 : 15}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 21);
  return x + w;
}

// A little mouse icon; side = 'left' highlights the left button.
function drawMouseIcon(x, y, side) {
  ctx.strokeStyle = '#7fd4ff';
  ctx.lineWidth = 1.5;
  ctx.fillStyle = '#1b2a3a';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, 26, 38, 13); else ctx.rect(x, y, 26, 38);
  ctx.fill(); ctx.stroke();
  if (side === 'left') { ctx.fillStyle = '#ff7a5a'; ctx.fillRect(x + 3, y + 3, 9, 13); }
  ctx.beginPath(); ctx.moveTo(x + 13, y + 2); ctx.lineTo(x + 13, y + 16); ctx.stroke();
}

const homeAliens = {};
function homeAlien(type) {
  if (!homeAliens[type]) homeAliens[type] = new Alien(type, 0, 0, 1, 1);
  return homeAliens[type];
}

function drawTitle() {
  // Animated tower behind everything for atmosphere.
  if (!game.tower) game.tower = new Tower(W / 2, H / 2 + 40);
  ctx.globalAlpha = 0.35;
  game.tower.draw(ctx, 0.5 + 0.5 * Math.sin(game.time));
  ctx.globalAlpha = 1;

  // Title
  ctx.textAlign = 'center';
  ctx.shadowColor = '#4fc3ff';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#e8f7ff';
  ctx.font = 'bold 64px monospace';
  ctx.fillText('LAST SIGNAL', W / 2, 78);
  ctx.shadowBlur = 0;
  ctx.font = '17px monospace';
  ctx.fillStyle = '#9fdcff';
  ctx.fillText('Hold the line. Keep the signal alive. Rescue is coming.', W / 2, 108);

  const top = 130, ph = 300, pw = 386, gap = 21, x0 = (W - (pw * 3 + gap * 2)) / 2;

  // --- 1. Mission ---
  let x = x0;
  drawPanel(x, top, pw, ph, 'YOUR MISSION', '#4fc3ff');
  ctx.font = '14px monospace';
  ctx.fillStyle = '#d6e9f5';
  ctx.textAlign = 'left';
  let y = top + 70;
  y = wrapText('You are stranded on an alien world. The radio tower in the centre is sending a distress signal.', x + 18, y, pw - 36, 20);
  y += 8;
  ctx.fillStyle = '#7dff5a';
  y = wrapText(`WIN: survive ${CONFIG.TOTAL_WAVES} alien waves. Every wave cleared boosts the signal, and after wave ${CONFIG.TOTAL_WAVES} the rescue ship arrives.`, x + 18, y, pw - 36, 20);
  y += 8;
  ctx.fillStyle = '#ff7a7a';
  y = wrapText('LOSE: if YOUR health or the TOWER\'s health reaches 0. The tower shrinks as it gets damaged.', x + 18, y, pw - 36, 20);

  // --- 2. Aliens ---
  x = x0 + pw + gap;
  drawPanel(x, top, pw, ph, 'THE ALIENS', '#7dff5a');
  const info = [
    ['runner', 'RUNNER', 'Small and fast. Most rush the tower, some chase you.'],
    ['brute', 'BRUTE', 'Slow and tough. Smashes the tower hard. Focus fire!'],
    ['stalker', 'STALKER', 'Hunts YOU. Keep moving and shoot it down.'],
  ];
  info.forEach(([type, name, desc], i) => {
    const ay = top + 92 + i * 70;
    const a = homeAlien(type);
    a.wobble = game.time * 8 + i;
    a.x = x + 40; a.y = ay;
    a.draw(ctx);
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = CONFIG.ALIENS[type].color;
    ctx.fillText(name, x + 80, ay - 10);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#c8dcea';
    wrapText(desc, x + 80, ay + 9, pw - 100, 17);
  });

  // --- 3. Upgrade shop ---
  x = x0 + (pw + gap) * 2;
  drawPanel(x, top, pw, ph, 'UPGRADE SHOP', '#fff27a');
  ctx.font = '14px monospace';
  ctx.fillStyle = '#d6e9f5';
  ctx.textAlign = 'left';
  y = wrapText('Kill aliens to earn points. Between waves the shop opens. Spend points on:', x + 18, top + 70, pw - 36, 20);
  y += 6;
  ctx.font = '13px monospace';
  CONFIG.UPGRADES.forEach((u, i) => {
    ctx.fillStyle = '#fff27a';
    ctx.fillText(`${i + 1}`, x + 22, y);
    ctx.fillStyle = '#e8f7ff';
    ctx.fillText(u.name, x + 42, y);
    ctx.fillStyle = '#8fb4c8';
    ctx.fillText('— ' + u.desc, x + 42, y + 16);
    y += 36;
  });

  // --- Controls strip with key icons ---
  const cy = top + ph + 16, ch = 124;
  drawPanel(x0, cy, pw * 3 + gap * 2, ch, 'CONTROLS', '#ff9a5a');
  const ky = cy + 78;
  ctx.textAlign = 'left';
  // Move: WASD + arrows
  let kx = x0 + 22;
  drawKey(kx + 36, ky - 34, 'W'); drawKey(kx, ky, 'A'); drawKey(kx + 36, ky, 'S'); drawKey(kx + 72, ky, 'D');
  ctx.fillStyle = '#8fb4c8'; ctx.font = '13px monospace'; ctx.textAlign = 'center'; ctx.fillText('or', kx + 128, ky + 21);
  kx += 150;
  drawKey(kx + 36, ky - 34, '↑'); drawKey(kx, ky, '←'); drawKey(kx + 36, ky, '↓'); drawKey(kx + 72, ky, '→');
  const label = (lx, t1, t2) => {
    ctx.textAlign = 'left'; ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#e8f7ff'; ctx.fillText(t1, lx, ky + 12);
    ctx.font = '12px monospace'; ctx.fillStyle = '#8fb4c8'; ctx.fillText(t2, lx, ky + 28);
  };
  label(kx + 116, 'MOVE', 'WASD / arrows');
  // Aim + shoot
  kx = x0 + 400;
  drawMouseIcon(kx, ky - 12, 'left');
  label(kx + 36, 'AIM + SHOOT', 'mouse aims, hold left click');
  // Pause / mute / shop
  kx = x0 + 650;
  drawKey(kx, ky, 'P'); drawKey(kx + 38, ky, 'Esc', 42);
  label(kx + 90, 'PAUSE', '');
  kx += 170;
  drawKey(kx, ky, 'M');
  label(kx + 42, 'MUTE', '');
  kx += 110;
  drawKey(kx, ky, '1-5', 40); drawKey(kx + 44, ky, 'Enter', 54);
  label(kx + 106, 'SHOP', 'buy / next wave');

  // --- Start button + shake setting ---
  const blink = Math.sin(game.time * 4) > 0;
  drawButton(W / 2 - 140, H - 70, 280, 50, blink ? '▶   START GAME' : '    START GAME', () => { resetGame(); startNextWave(); });
  drawButton(x0 + pw * 3 + gap * 2 - 250, H - 62, 250, 36, `Screen shake: ${settings.shake.toUpperCase()}`, cycleShake);
  ctx.textAlign = 'left';
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(200,220,240,0.55)';
  ctx.fillText('Press Enter / Space to start', x0, H - 38);
  ctx.fillText(Sound.muted ? 'Sound: OFF (M)' : 'Sound: ON (M)', x0, H - 20);
}

function drawPause() {
  drawCenterMessage('PAUSED', 'Press P or Esc to continue   •   M to mute');
  drawButton(W / 2 - 125, H / 2 + 20, 250, 44, `Screen shake: ${settings.shake.toUpperCase()}`, cycleShake);
  drawButton(W / 2 - 125, H / 2 + 74, 250, 44, '▶  RESUME', () => { game.state = 'playing'; });
}

function drawUpgradeScreen() {
  dimBackground(0.75);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7dff5a';
  ctx.font = 'bold 40px monospace';
  ctx.fillText(`WAVE ${game.wave} CLEARED`, W / 2, 150);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#fff27a';
  ctx.fillText(`Wave bonus +${game.lastBonus}   •   Points to spend: ${game.points}`, W / 2, 185);

  const bw = 420, bh = 58, gap = 10;
  const x = W / 2 - bw / 2;
  let y = 215;
  CONFIG.UPGRADES.forEach((u, i) => {
    const blocked = upgradeBlocked(u);
    let sub = u.desc;
    if (u.id === 'turret') sub += ` (${game.turrets.length}/${CONFIG.TURRET.max})`;
    if (blocked && blocked !== 'Not enough points') sub += ` — ${blocked}`;
    drawButton(x, y, bw, bh, `[${i + 1}] ${u.name}`, () => buyUpgrade(i), !blocked, sub);
    // Price tag on the right of the button
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = blocked ? '#6a5a30' : '#fff27a';
    ctx.fillText(`${upgradeCost(u)} pts`, x + bw - 14, y + 24);
    y += bh + gap;
  });

  drawButton(W / 2 - 150, y + 15, 300, 50, `START WAVE ${game.wave + 1}  ▶`, startNextWave);
  ctx.textAlign = 'center';
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(200,220,240,0.5)';
  ctx.fillText('Keys 1-5 to buy, Enter to continue', W / 2, y + 90);
}

// extra: optional function that draws something behind the text (after dimming).
function drawCenterMessage(title, sub, color = '#e8f7ff', extra = null) {
  dimBackground(0.6);
  if (extra) extra();
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 25;
  ctx.font = 'bold 64px monospace';
  ctx.fillText(title, W / 2, H / 2 - 60);
  ctx.shadowBlur = 0;
  ctx.font = '18px monospace';
  ctx.fillStyle = '#c0d8e8';
  ctx.fillText(sub, W / 2, H / 2 - 15);
}

function drawGameOver() {
  drawCenterMessage('SIGNAL LOST', game.gameOverReason || '', '#ff5a5a');
  ctx.fillText(`Reached wave ${game.wave}   •   Kills ${game.kills}   •   Score ${game.score}`, W / 2, H / 2 + 20);
  drawButton(W / 2 - 120, H / 2 + 55, 240, 50, '↻  RESTART', () => { resetGame(); startNextWave(); });
}

function drawWin() {
  drawCenterMessage('RESCUE HAS ARRIVED', `You held the tower for all ${CONFIG.TOTAL_WAVES} waves!`, '#7dff5a', drawRescueShip);
  ctx.fillText(`Kills ${game.kills}   •   Final score ${game.score}`, W / 2, H / 2 + 20);
  drawButton(W / 2 - 120, H / 2 + 55, 240, 50, '↻  PLAY AGAIN', () => { resetGame(); startNextWave(); });
}

// A simple rescue ship hovering over the tower with a searchlight.
function drawRescueShip() {
  const sx = W / 2 + Math.sin(game.time) * 40;
  const sy = 120 + Math.sin(game.time * 2) * 8;
  ctx.fillStyle = '#c0d8e8';
  ctx.beginPath();
  ctx.moveTo(sx, sy - 25); ctx.lineTo(sx + 60, sy + 15); ctx.lineTo(sx - 60, sy + 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 240, 150, 0.15)';
  ctx.beginPath();
  ctx.moveTo(sx - 20, sy + 15); ctx.lineTo(sx + 20, sy + 15);
  ctx.lineTo(W / 2 + 90, H / 2 + 200); ctx.lineTo(W / 2 - 90, H / 2 + 200);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// MAIN LOOP — runs ~60 times per second via requestAnimationFrame.
// ---------------------------------------------------------------------------
let lastTime = performance.now();
function loop(now) {
  // dt = seconds since last frame, capped so a slow frame/tab switch can't break physics.
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
