/* =========================================================================
   config.js — ALL the balance numbers for Last Signal 3D live here.
   Want the game easier or harder? Change numbers in this file only.

   Units: distances are in metres, times in seconds, speeds in metres/second.
   ========================================================================= */

export const CONFIG = {
  // Endless campaign: survive this many waves in an AREA and the rescue ship
  // arrives and flies you to the next area (the next map). Only death ends the run.
  WAVES_PER_AREA: 10,
  AREA_CLEAR_BONUS: 1500,   // extra credits when an area is cleared

  // Size of the playable arena: it goes from -ARENA_HALF to +ARENA_HALF on X and Z.
  ARENA_HALF: 42,

  // Credits you start with, and the bonus paid when a wave is cleared.
  START_CREDITS: 800,
  WAVE_BONUS_BASE: 300,     // bonus = base + perWave * waveNumber
  WAVE_BONUS_PER_WAVE: 60,

  // Most enemies allowed alive at once (keeps the frame-rate smooth).
  MAX_ALIVE_ENEMIES: 28,

  PLAYER: {
    height: 1.7,            // eye height above the ground
    radius: 0.45,           // collision size
    walkSpeed: 6.0,
    sprintSpeed: 9.5,
    jumpSpeed: 7.0,
    gravity: 20,
    maxHp: 150,
    maxArmour: 100,
    armourAbsorb: 0.66,     // armour soaks up 66% of incoming damage while it lasts
    healBetweenWaves: 0.4,  // fraction of max HP restored after each wave
    mouseSensitivity: 1.0,
  },

  TOWER: {
    maxHp: 1000,
    radius: 2.4,            // collision radius of the tower base
  },

  // Market terminal: you can press B during a wave if you are this close to it.
  KIOSK: { position: [7, 0, 7], useRange: 4.0 },

  /* -----------------------------------------------------------------------
     WEAPONS
     type:   'melee' | 'hitscan' (instant bullet) | 'projectile'
     auto:   true = hold the mouse to keep firing
     rate:   seconds between shots
     mag:    rounds per magazine, reserve: spare rounds you start with
     maxReserve: most spare rounds you can carry
     spread: random inaccuracy (radians); aimSpread when aiming (right click)
     headMult: damage multiplier for headshots
     zoom:   camera field-of-view when aiming (smaller = more zoom)
     stats:  0..10 values only used to draw the bars in the market
     ----------------------------------------------------------------------- */
  WEAPONS: {
    knife: {
      name: 'Tactical Knife', short: 'KNIFE', slot: 1, price: 0, type: 'melee', auto: true,
      damage: 9999, rate: 0.42, range: 2.8, arc: 0.7, headMult: 1,
      // One slash kills any normal enemy. The boss is too big for that: it
      // loses this fraction of its max health per slash instead.
      bossFrac: 0.04,
      // Right click = heavy stab: slower, shorter, but hurts the boss more.
      heavyRate: 0.95, heavyRange: 2.4, heavyBossFrac: 0.10,
      desc: 'One-hit kill on normal enemies. Right click: heavy stab.',
      stats: { damage: 5, rate: 5, range: 1, mobility: 10 },
    },
    pistol: {
      name: 'Classic Pistol', short: 'PISTOL', slot: 2, price: 0, type: 'hitscan', auto: false,
      damage: 20, rate: 0.2, mag: 12, reserve: 999, maxReserve: 999, reload: 1.2,
      spread: 0.012, aimSpread: 0.004, headMult: 2.0, range: 120, zoom: 60, recoil: 0.012,
      desc: 'Reliable sidearm. Infinite spare ammo.',
      stats: { damage: 2, rate: 5, range: 5, mobility: 9 },
    },
    rifle: {
      name: 'Vandal-X Rifle', short: 'RIFLE', slot: 3, price: 1600, type: 'hitscan', auto: true,
      damage: 24, rate: 0.095, mag: 30, reserve: 120, maxReserve: 240, reload: 2.0,
      spread: 0.022, aimSpread: 0.006, headMult: 2.0, range: 160, zoom: 52, recoil: 0.01,
      desc: 'Fully automatic. The all-rounder.',
      stats: { damage: 4, rate: 9, range: 7, mobility: 6 },
    },
    sniper: {
      name: 'Operator S', short: 'SNIPER', slot: 4, price: 2400, type: 'hitscan', auto: false,
      damage: 160, rate: 1.25, mag: 5, reserve: 20, maxReserve: 40, reload: 3.0,
      spread: 0.06, aimSpread: 0.0, headMult: 2.5, range: 300, zoom: 18, recoil: 0.06,
      pierce: 3,              // a sniper round passes through up to 3 enemies
      desc: 'Scope with right click. Pierces enemies.',
      stats: { damage: 10, rate: 1, range: 10, mobility: 3 },
    },
    rpg: {
      name: 'Rocket Launcher', short: 'RPG', slot: 5, price: 3200, type: 'projectile', projectile: 'rocket', auto: false,
      damage: 160, splash: 130, splashRadius: 5.5, rate: 1.0, mag: 1, reserve: 8, maxReserve: 12, reload: 2.2,
      speed: 38, gravity: 0, spread: 0.0, aimSpread: 0, zoom: 55, recoil: 0.05, selfDamage: 0.35,
      desc: 'Rocket with big splash damage. Mind the blast.',
      stats: { damage: 10, rate: 2, range: 8, mobility: 2 },
    },
    grenade: {
      name: 'Grenade Launcher', short: 'GL', slot: 6, price: 2600, type: 'projectile', projectile: 'grenade', auto: false,
      damage: 60, splash: 95, splashRadius: 4.5, rate: 0.6, mag: 6, reserve: 24, maxReserve: 36, reload: 2.6,
      speed: 22, gravity: 18, fuse: 1.8, bounce: 0.45, spread: 0.01, aimSpread: 0.0, zoom: 55, recoil: 0.04, selfDamage: 0.35,
      desc: 'Arcing grenades that bounce, then explode.',
      stats: { damage: 8, rate: 4, range: 5, mobility: 5 },
    },
    bow: {
      name: 'Recon Bow', short: 'BOW', slot: 7, price: 1200, type: 'projectile', projectile: 'arrow', auto: false,
      damage: 30, maxDamage: 150, drawTime: 0.9, rate: 0.55, mag: 1, reserve: 30, maxReserve: 45, reload: 0.0,
      speed: 25, maxSpeed: 75, gravity: 12, spread: 0.0, aimSpread: 0, headMult: 2.0, zoom: 50, recoil: 0.02,
      desc: 'Hold to draw. Full draw = huge damage. Arrows drop.',
      stats: { damage: 9, rate: 3, range: 8, mobility: 8 },
    },
  },

  // Other things for sale in the market.
  ITEMS: {
    ammo:    { name: 'Ammo Refill',    price: 300,  desc: 'Fill every owned weapon to max ammo.' },
    light:   { name: 'Light Shields',  price: 400,  desc: '+50 armour (max 100).', armour: 50 },
    heavy:   { name: 'Heavy Shields',  price: 900,  desc: 'Armour to 100.', armour: 100 },
    medkit:  { name: 'Med Kit',        price: 300,  desc: 'Restore 75 HP.', heal: 75 },
    repair:  { name: 'Tower Repair',   price: 500,  desc: 'Restore 300 tower HP.', amount: 300 },
    turret:  { name: 'Auto-Turret',    price: 1500, desc: 'Guards the tower. Max 4.', max: 4 },
  },

  TURRET: { range: 26, rate: 0.35, damage: 14 },

  /* -----------------------------------------------------------------------
     ENEMIES
     target: 'tower' | 'player' | 'mixed' (each one picks randomly when it spawns)
     reward: credits for killing it
     ----------------------------------------------------------------------- */
  ENEMIES: {
    runner:  { hp: 35,   speed: 7.0, radius: 0.55, damage: 8,  attackRate: 0.8, reward: 40,  target: 'mixed',  color: 0xff2bd6 },
    brute:   { hp: 240,  speed: 2.6, radius: 1.2,  damage: 35, attackRate: 1.5, reward: 120, target: 'tower',  color: 0xff7a1a },
    spitter: { hp: 80,   speed: 3.8, radius: 0.8,  damage: 12, attackRate: 2.2, reward: 80,  target: 'mixed',  color: 0x7dff3a,
               range: 20, projectileSpeed: 16 },
    boss:    { hp: 5000, speed: 2.0, radius: 3.0,  damage: 60, attackRate: 1.8, reward: 2000, target: 'tower', color: 0xb44dff,
               range: 34, projectileSpeed: 18, summonEvery: 8 },
  },
};

/* Builds the list of enemies for a wave.
   wave = wave number inside the current area (1..WAVES_PER_AREA)
   area = which area (1, 2, 3 ...). Every new area is harder than the last.
   Later waves are bigger and add tougher enemy types. */
export function buildWave(wave, area = 1) {
  const a = area - 1;                                   // 0 for the first area
  const globalWave = a * CONFIG.WAVES_PER_AREA + wave;  // counts up forever
  const list = [];
  const runners  = 6 + wave * 3 + a * 4;
  const brutes   = wave >= 2 || a > 0 ? Math.floor(wave * 0.8) + a : 0;
  const spitters = wave >= 3 || a > 0 ? Math.floor(wave * 0.9) + a : 0;
  for (let i = 0; i < runners; i++)  list.push('runner');
  for (let i = 0; i < brutes; i++)   list.push('brute');
  for (let i = 0; i < spitters; i++) list.push('spitter');
  // Shuffle so the types arrive mixed together.
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const isBossWave = wave === CONFIG.WAVES_PER_AREA;   // last wave of every area has a boss
  if (isBossWave) list.unshift('boss');
  return {
    enemies: list,
    isBossWave,
    spawnDelay: Math.max(0.3, 1.3 - wave * 0.09 - a * 0.1), // seconds between spawns
    hpScale: 1 + (globalWave - 1) * 0.1,                     // enemies get tougher...
    speedScale: Math.min(1.6, 1 + (globalWave - 1) * 0.02),  // ...and a bit faster
    damageScale: 1 + a * 0.2,                                // ...and hit harder each area
  };
}
