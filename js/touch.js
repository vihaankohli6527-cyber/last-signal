/* =========================================================================
   touch.js — phone / tablet controls (twin-stick).
   Left thumb: floating joystick to move. Right thumb: floating joystick to
   aim, auto-fires while pushed. Taps hit on-screen buttons (shop, home,
   pause...). Mouse + keyboard keep working; touch mode switches on as soon
   as a finger touches the screen (or on coarse-pointer devices).
   ========================================================================= */

const touch = {
  enabled: matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0),
  move: null,   // { id, ox, oy, x, y }  (game coordinates)
  aim: null,
  maxR: 70,     // joystick radius in game pixels
  // Results read by update():
  get moveVec() { return stickVec(this.move); },
  get aimVec() { return stickVec(this.aim); },
};

function stickVec(s) {
  if (!s) return { x: 0, y: 0, mag: 0 };
  let dx = s.x - s.ox, dy = s.y - s.oy;
  const len = Math.hypot(dx, dy);
  const mag = Math.min(1, len / touch.maxR);
  if (len < 1) return { x: 0, y: 0, mag: 0 };
  return { x: (dx / len) * mag, y: (dy / len) * mag, mag };
}

function hitButton(x, y) {
  for (const b of game.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  return null;
}

function onTouchStart(e) {
  e.preventDefault();
  Sound.init();
  touch.enabled = true;
  for (const t of e.changedTouches) {
    const p = toGameCoords(t);
    // Buttons first (Start, shop items, pause, restart...)
    const b = hitButton(p.x, p.y);
    if (b) { b.action(); continue; }
    if (game.state !== 'playing') continue;
    // Floating sticks: left half moves, right half aims + fires.
    if (p.x < W / 2 && !touch.move) touch.move = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
    else if (p.x >= W / 2 && !touch.aim) touch.aim = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
  }
}

function onTouchMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const p = toGameCoords(t);
    for (const s of [touch.move, touch.aim]) {
      if (!s || s.id !== t.identifier) continue;
      s.x = p.x; s.y = p.y;
      // Drag the base along if the thumb goes past the edge (stick never "runs out").
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), lim = touch.maxR * 1.4;
      if (d > lim) { s.ox = s.x - (dx / d) * lim; s.oy = s.y - (dy / d) * lim; }
    }
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (touch.move && touch.move.id === t.identifier) touch.move = null;
    if (touch.aim && touch.aim.id === t.identifier) touch.aim = null;
  }
}

function resetTouchSticks() { touch.move = null; touch.aim = null; }

// Called from game.js once the canvas exists.
function initTouch() {
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
  // Stop iOS pinch-zoom / double-tap zoom and page bounce everywhere.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
  document.addEventListener('touchmove', (e) => { if (e.target === canvas || e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // A real mouse switches the on-screen sticks off again (laptops with touchscreens).
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) touch.enabled = false; });

  // Portrait phones: suggest rotating (the game is 16:9), with a "play anyway" option.
  const rot = document.getElementById('rotate');
  let dismissed = false;
  const check = () => {
    const portrait = window.innerHeight > window.innerWidth * 1.1;
    const cramped = Math.min(window.innerWidth, window.innerHeight) < 820; // phones, small tablets
    rot.classList.toggle('show', touch.enabled && portrait && cramped && !dismissed);
  };
  document.getElementById('rotate-dismiss').addEventListener('click', () => { dismissed = true; check(); });
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', () => setTimeout(check, 200));
  window.addEventListener('touchstart', check, { passive: true });
  check();
}

// Draw the sticks (only while a thumb is down) and faint hints where to put thumbs.
function drawTouchControls() {
  if (!touch.enabled || game.state !== 'playing') return;
  const drawStick = (s, color, label, hx, hy) => {
    const ox = s ? s.ox : hx, oy = s ? s.oy : hy;
    ctx.globalAlpha = s ? 0.9 : 0.35;
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(10, 20, 30, 0.35)';
    ctx.beginPath(); ctx.arc(ox, oy, touch.maxR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const v = stickVec(s);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(ox + v.x * touch.maxR, oy + v.y * touch.maxR, 30, 0, Math.PI * 2); ctx.fill();
    if (!s) { ctx.fillStyle = '#e8f7ff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, ox, oy + touch.maxR + 24); }
    ctx.globalAlpha = 1;
  };
  drawStick(touch.move, '#4fc3ff', 'MOVE', 150, H - 150);
  drawStick(touch.aim, '#ff7a5a', 'AIM + FIRE', W - 150, H - 150);
}
