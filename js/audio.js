/* =========================================================================
   audio.js — every sound is generated live with WebAudio (oscillators +
   white noise). No audio files needed.
   Browsers only allow sound after a click/key press, so Sound.init() is
   called on the first user input.
   ========================================================================= */

export const Sound = {
  ctx: null,
  master: null,
  noiseBuffer: null,
  muted: false,
  volume: 0.6,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // One second of random values = "white noise", reused for gunshots/explosions.
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  },

  /** Overall output level = master volume x SFX volume. */
  setVolume(master, sfx) {
    this.volume = 0.6 * master * sfx;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  },

  ok() { return this.ctx && !this.muted; },

  /* A tone that slides from freq to endFreq over dur seconds. */
  tone(freq, endFreq, dur, type = 'square', vol = 0.1, delay = 0) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  /* A burst of filtered noise (gunshots, explosions, whooshes).
     filter: 'lowpass' | 'highpass' | 'bandpass', freq: filter frequency. */
  noise(dur, vol = 0.2, filter = 'lowpass', freq = 2000, endFreq = null, delay = 0) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  },

  // ---- Weapon sounds ----
  knife()   { this.noise(0.12, 0.25, 'highpass', 3000, 6000); this.tone(900, 400, 0.08, 'triangle', 0.04); },
  pistol()  { this.noise(0.12, 0.35, 'lowpass', 3500, 600); this.tone(500, 120, 0.08, 'square', 0.06); },
  rifle()   { this.noise(0.09, 0.3, 'lowpass', 4000, 800); this.tone(300, 90, 0.07, 'sawtooth', 0.05); },
  sniper()  { this.noise(0.45, 0.6, 'lowpass', 5000, 200); this.tone(160, 40, 0.4, 'sawtooth', 0.12); },
  rpg()     { this.noise(0.6, 0.35, 'bandpass', 900, 200); this.tone(120, 60, 0.5, 'sawtooth', 0.08); },
  grenade() { this.noise(0.15, 0.3, 'lowpass', 1200, 300); this.tone(240, 120, 0.12, 'square', 0.08); },
  bowDraw() { this.tone(180, 320, 0.5, 'triangle', 0.03); },
  bowShot() { this.noise(0.15, 0.25, 'bandpass', 1800, 600); this.tone(420, 180, 0.12, 'triangle', 0.07); },
  dryFire() { this.tone(1400, 1300, 0.03, 'square', 0.04); },
  reload()  { this.tone(700, 500, 0.05, 'square', 0.04); this.tone(900, 1100, 0.05, 'square', 0.04, 0.25); },
  swap()    { this.tone(500, 800, 0.06, 'triangle', 0.04); },
  explosion(vol = 0.7) { this.noise(1.1, vol, 'lowpass', 1800, 60); this.tone(90, 30, 0.9, 'sine', vol * 0.5); },
  bounce()  { this.tone(300, 260, 0.04, 'triangle', 0.05); },

  // ---- Feedback ----
  hit()       { this.tone(1600, 1200, 0.05, 'square', 0.035); },
  headshot()  { this.tone(2200, 1800, 0.08, 'triangle', 0.08); this.tone(3300, 3000, 0.06, 'sine', 0.05, 0.03); },
  kill()      { this.tone(1200, 2400, 0.12, 'triangle', 0.06); },
  enemyDie()  { this.tone(500, 60, 0.25, 'sawtooth', 0.05); this.noise(0.2, 0.1, 'bandpass', 1500, 400); },
  spit()      { this.tone(260, 520, 0.18, 'sine', 0.06); },
  playerHit() { this.tone(180, 80, 0.18, 'square', 0.08); },
  towerHit()  { this.tone(110, 50, 0.25, 'sine', 0.12); },
  turret()    { this.tone(1500, 700, 0.05, 'square', 0.025); },
  buy()       { this.tone(700, 1400, 0.1, 'triangle', 0.08); this.tone(1400, 1400, 0.08, 'triangle', 0.05, 0.08); },
  denied()    { this.tone(180, 140, 0.18, 'square', 0.06); },
  ui()        { this.tone(900, 900, 0.03, 'sine', 0.04); },
  waveStart() { this.tone(220, 880, 0.6, 'sine', 0.12); this.tone(330, 1320, 0.6, 'sine', 0.06, 0.1); },
  waveClear() { [523, 659, 784].forEach((f, i) => this.tone(f, f, 0.25, 'triangle', 0.09, i * 0.12)); },
  bossRoar()  { this.tone(90, 40, 1.5, 'sawtooth', 0.15); this.noise(1.2, 0.2, 'lowpass', 500, 80); },
  gameOver()  { this.tone(400, 40, 1.4, 'sawtooth', 0.12); },
  win()       { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, f, 0.4, 'triangle', 0.1, i * 0.16)); },
};
