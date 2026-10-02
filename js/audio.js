/* =========================================================================
   audio.js — tiny sound effects made with WebAudio oscillators.
   No sound files needed. Browsers only allow audio after a user click/key,
   so Sound.init() is called on the first input.
   ========================================================================= */

const Sound = {
  ctx: null,
  muted: false,

  // Create the audio context (must happen after a user gesture).
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // very old browser: just stay silent
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
  },

  /* Play a short beep.
     freq: start pitch (Hz), endFreq: pitch it slides to, dur: seconds,
     type: 'sine' | 'square' | 'sawtooth' | 'triangle', vol: 0..1 */
  beep(freq, endFreq, dur, type = 'square', vol = 0.08) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  // Named effects used by the game.
  shoot()      { this.beep(880, 300, 0.07, 'square', 0.03); },
  turret()     { this.beep(1200, 600, 0.05, 'triangle', 0.025); },
  hit()        { this.beep(300, 120, 0.06, 'sawtooth', 0.04); },
  alienDie()   { this.beep(500, 60, 0.18, 'sawtooth', 0.05); },
  towerHit()   { this.beep(120, 50, 0.2, 'sine', 0.12); },
  playerHit()  { this.beep(200, 90, 0.15, 'square', 0.07); },
  buy()        { this.beep(600, 1200, 0.12, 'triangle', 0.08); },
  denied()     { this.beep(180, 140, 0.15, 'square', 0.06); },
  waveStart()  { this.beep(220, 880, 0.5, 'sine', 0.1); },
  gameOver()   { this.beep(400, 40, 1.2, 'sawtooth', 0.12); },
  win()        { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, f, 0.3, 'triangle', 0.1), i * 160)); },
};
