/* =========================================================================
   touch.js — phone / tablet controls for the 3D game.
   Left thumb: floating joystick (push far forward to sprint).
   Right half: drag to look. Buttons: fire (hold, drag to aim while firing),
   aim/scope (toggle), jump, crouch/slide (hold), reload, switch weapon,
   market, pause, fullscreen. Weapon slots in the HUD are tappable.
   No pointer lock on touch devices. Mouse + keyboard are untouched.
   ========================================================================= */

/** Phones / tablets (primary pointer is a finger), or ?touch=1 to force it. */
export function isTouchDevice() {
  const q = new URLSearchParams(location.search);
  if (q.has('touch')) return q.get('touch') !== '0';
  return matchMedia('(pointer: coarse)').matches;
}

const STICK_R = 60;          // joystick travel radius (CSS px)
const SPRINT_AT = 0.9;       // push this far (and mostly forward) to sprint

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.visible = false;
    this.stick = null;       // { id, ox, oy, x, y }
    this.looks = new Map();  // touch id -> { x, y }  (look zone + fire button)
    this.build();
    this.bind();
  }

  build() {
    const el = document.createElement('div');
    el.id = 'touch-ui';
    el.className = 'hidden';
    el.innerHTML = `
      <div id="t-move-zone"></div>
      <div id="t-look-zone"></div>
      <div id="t-stick" class="hidden"><div class="knob"></div></div>
      <div id="t-top">
        <button class="tb small" id="tb-market" aria-label="Market">🛒<span>MARKET</span></button>
        <button class="tb small" id="tb-pause" aria-label="Pause">❚❚</button>
        <button class="tb small hidden" id="tb-fs" aria-label="Fullscreen">⛶</button>
      </div>
      <button class="tb" id="tb-fire" aria-label="Fire">FIRE</button>
      <button class="tb" id="tb-aim" aria-label="Aim">AIM</button>
      <button class="tb" id="tb-jump" aria-label="Jump">JUMP</button>
      <button class="tb" id="tb-crouch" aria-label="Crouch / slide">SLIDE<span>CROUCH</span></button>
      <button class="tb" id="tb-reload" aria-label="Reload">↻<span>RELOAD</span></button>
      <button class="tb" id="tb-switch" aria-label="Switch weapon">⇄<span>SWITCH</span></button>`;
    document.body.appendChild(el);
    this.el = el;
    this.knob = el.querySelector('#t-stick .knob');
    this.stickEl = el.querySelector('#t-stick');
    const de = document.documentElement;
    this.fsReq = de.requestFullscreen ? () => de.requestFullscreen({ navigationUI: 'hide' }) : de.webkitRequestFullscreen ? () => de.webkitRequestFullscreen() : null;
    if (this.fsReq) el.querySelector('#tb-fs').classList.remove('hidden');
  }

  bind() {
    const g = this.game, $ = (id) => document.getElementById(id);
    const opt = { passive: false };
    const on = (id, start, end) => {
      const b = $(id);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); g.sound.init(); b.classList.add('down'); start && start(e); }, opt);
      const up = (e) => { e.preventDefault(); if (!e.touches || ![...e.touches].some((t) => t.target === b || b.contains(t.target))) b.classList.remove('down'); end && end(e); };
      b.addEventListener('touchend', up, opt);
      b.addEventListener('touchcancel', up, opt);
      // also usable with a mouse/pen (e.g. testing on desktop with ?touch=1)
      b.addEventListener('mousedown', (e) => { if (!e.sourceCapabilities || !e.sourceCapabilities.firesTouchEvents) { start && start(e); setTimeout(() => end && end(e), 120); } });
    };
    const playing = () => g.state === 'playing' && !g.market.open;

    // --- left joystick (floating: appears where the thumb lands) ---
    const mz = $('t-move-zone');
    mz.addEventListener('touchstart', (e) => {
      e.preventDefault(); g.sound.init();
      if (this.stick) return;
      const t = e.changedTouches[0];
      this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
      this.drawStick();
    }, opt);
    // --- look zone (right half) ---
    const lz = $('t-look-zone');
    lz.addEventListener('touchstart', (e) => {
      e.preventDefault(); g.sound.init();
      for (const t of e.changedTouches) this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
    }, opt);

    // Moves / ends are tracked on the whole overlay by touch id (multi-touch safe).
    const move = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) {
          const s = this.stick;
          s.x = t.clientX; s.y = t.clientY;
          const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), lim = STICK_R * 1.5;
          if (d > lim) { s.ox = s.x - dx / d * lim; s.oy = s.y - dy / d * lim; }   // base follows the thumb
          this.drawStick();
        }
        const l = this.looks.get(t.identifier);
        if (l) {
          const dx = t.clientX - l.x, dy = t.clientY - l.y;
          l.x = t.clientX; l.y = t.clientY;
          if (playing()) g.look(dx * g.settings.touchSens, dy * g.settings.touchSens);
        }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) { this.stick = null; this.drawStick(); }
        this.looks.delete(t.identifier);
      }
    };
    this.el.addEventListener('touchmove', move, opt);
    this.el.addEventListener('touchend', end, opt);
    this.el.addEventListener('touchcancel', end, opt);

    // --- buttons ---
    on('tb-fire', (e) => {
      if (!playing()) return;
      g.input.mouseL = true; g.input.mouseLPressed = true;
      for (const t of e.changedTouches || []) this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });   // drag to aim while firing
    }, () => { if (g.input.mouseL) g.input.mouseLReleased = true; g.input.mouseL = false; });
    on('tb-aim', () => { if (playing()) g.input.mouseR = !g.input.mouseR; this.sync(); });
    on('tb-jump', () => { if (playing()) g.player.jumpTap = true; });
    on('tb-crouch', () => { if (!playing()) return; g.keys.KeyC = true; g.player.crouchTap = true; }, () => { g.keys.KeyC = false; });
    on('tb-reload', () => { if (playing()) g.weapons.reload(); });
    on('tb-switch', () => { if (playing()) g.weapons.cycle(1); });
    on('tb-market', () => { if (g.state === 'playing') g.onKey('KeyB'); });
    on('tb-pause', () => g.pause());
    on('tb-fs', () => {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else if (this.fsReq) { const p = this.fsReq(); if (p && p.catch) p.catch(() => {}); }
    });

    // Tap a weapon slot in the HUD to equip it.
    $('weapon-slots').addEventListener('touchstart', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot || !playing()) return;
      e.preventDefault();
      const n = parseInt(slot.querySelector('b')?.textContent, 10);
      if (n) g.weapons.selectSlot(n);
    }, opt);

    // Stop pinch-zoom / double-tap zoom / page bounce (iOS ignores user-scalable=no).
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !e.target.closest('.settings, #market, .screen')) e.preventDefault(); }, opt);
    // Double-tap zoom is disabled with touch-action: manipulation in style.css.
  }

  drawStick() {
    const s = this.stick;
    this.stickEl.classList.toggle('hidden', !s);
    if (!s) return;
    const v = this.vector();
    this.stickEl.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
    this.knob.style.transform = `translate(${v.x * STICK_R}px, ${-v.y * STICK_R}px)`;
    this.stickEl.classList.toggle('sprint', v.sprint);
  }

  /** Stick as { x: strafe (-1..1), y: forward (-1..1), mag, sprint }. */
  vector() {
    const s = this.stick;
    if (!s) return { x: 0, y: 0, mag: 0, sprint: false };
    const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
    if (d < 4) return { x: 0, y: 0, mag: 0, sprint: false };
    const mag = Math.min(1, d / STICK_R), x = dx / d * mag, y = -dy / d * mag;
    return { x, y, mag, sprint: mag >= SPRINT_AT && y > 0.7 * mag };
  }

  /** Called every frame: show while playing, feed the stick to the player. */
  update() {
    const g = this.game;
    const want = g.touchMode && g.state === 'playing' && !g.market.open && !g.settingsOpen;
    if (want !== this.visible) {
      this.visible = want;
      this.el.classList.toggle('hidden', !want);
      document.body.classList.toggle('touch-playing', want);
      if (!want) this.release();
    }
    g.player.touchMove = want ? this.vector() : null;
    if (want) this.sync();
  }

  sync() {
    const g = this.game;
    this.el.querySelector('#tb-aim').classList.toggle('on', !!g.input.mouseR);
    this.el.querySelector('#tb-market').classList.toggle('glow', g.phase === 'intermission' || g.nearKiosk());
  }

  release() {
    const g = this.game;
    this.stick = null; this.looks.clear(); this.drawStick();
    g.input.mouseL = false; g.input.mouseR = false; g.keys.KeyC = false;
    g.player.touchMove = null;
    this.el.querySelectorAll('.tb.down').forEach((b) => b.classList.remove('down'));
  }
}
