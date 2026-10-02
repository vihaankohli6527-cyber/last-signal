/* =========================================================================
   config.js — all the numbers that control game balance live here.
   Tweak these to make the game easier/harder without touching the logic.
   ========================================================================= */

const CONFIG = {
  // Logical size of the game world (the canvas is scaled to fit the window).
  WIDTH: 1280,
  HEIGHT: 720,

  // How many waves the player must survive before rescue arrives.
  TOTAL_WAVES: 10,

  PLAYER: {
    radius: 14,
    speed: 230,          // pixels per second
    maxHp: 100,
    fireDelay: 0.16,     // seconds between shots
    bulletSpeed: 720,
    bulletDamage: 10,
    healBetweenWaves: 0.35, // fraction of max HP restored after each wave
  },

  TOWER: {
    radius: 34,          // size at full health
    maxHp: 500,
    minScale: 0.45,      // the tower shrinks to this fraction of its size as health runs out
  },

  // Screen shake: 'off' | 'low' | 'normal' (players can change it on the home / pause screen).
  SHAKE: {
    default: 'low',
    maxOffset: 6,        // pixels at full strength on 'normal'
    levels: { off: 0, low: 0.45, normal: 1 },
    decay: 3.0,          // how fast the shake fades (per second)
  },

  TURRET: {
    range: 260,
    fireDelay: 0.55,
    damage: 8,
    max: 4,              // max number of auto-turrets
  },

  // Alien types. "target" decides what they walk toward:
  //   "tower"  - always go for the radio tower
  //   "player" - always chase the player
  //   "mixed"  - each one randomly picks tower or player when spawned
  ALIENS: {
    runner:  { radius: 10, speed: 120, hp: 14, damage: 10, points: 5,  color: '#7dff5a', target: 'mixed'  },
    brute:   { radius: 22, speed: 45,  hp: 90, damage: 30, points: 20, color: '#2fdc6a', target: 'tower'  },
    stalker: { radius: 13, speed: 85,  hp: 30, damage: 15, points: 10, color: '#c6ff3d', target: 'player' },
  },

  // Upgrade shop. cost grows by costStep each time you buy that upgrade.
  UPGRADES: [
    { id: 'fireRate', name: 'Faster Fire Rate', desc: 'Shoot 15% faster',          cost: 30, costStep: 20 },
    { id: 'damage',   name: 'More Damage',      desc: '+5 bullet damage',          cost: 30, costStep: 25 },
    { id: 'repair',   name: 'Repair Tower',     desc: 'Restore 150 tower HP',      cost: 25, costStep: 0  },
    { id: 'maxHp',    name: 'Tougher Suit',     desc: '+25 max HP and full heal',  cost: 35, costStep: 20 },
    { id: 'turret',   name: 'Auto-Turret',      desc: 'Turret that guards the tower', cost: 60, costStep: 40 },
  ],
};

/* Returns the alien list for a given wave number (1-based).
   Waves get bigger and later waves add tougher alien types. */
function buildWave(wave) {
  const list = [];
  const runners  = 5 + wave * 3;
  const brutes   = wave >= 2 ? Math.floor(wave * 0.8) : 0;
  const stalkers = wave >= 3 ? Math.floor(wave * 0.9) : 0;
  for (let i = 0; i < runners; i++)  list.push('runner');
  for (let i = 0; i < brutes; i++)   list.push('brute');
  for (let i = 0; i < stalkers; i++) list.push('stalker');
  // Shuffle so types arrive mixed together.
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return {
    aliens: list,
    spawnDelay: Math.max(0.25, 1.1 - wave * 0.08), // seconds between spawns
    hpScale: 1 + (wave - 1) * 0.12,                 // aliens get tougher
    speedScale: 1 + (wave - 1) * 0.03,
  };
}
