/* =========================================================================
   viewmodels.js — the first-person weapon models you see in your hands.
   Each one is built from simple boxes/cylinders with a stylised colour
   scheme. Coordinates are in camera space: +X right, +Y up, -Z forward.
   Each builder returns a Group with userData.muzzle (where the flash goes).
   ========================================================================= */
import * as THREE from '../lib/three.module.js';
import { surface } from './textures.js';

// PBR materials: metal parts reflect the environment map, polymer has a fine
// stipple, paint and wood get their own grain (procedural textures).
const T = (type) => { const t = surface(type); return { normalMap: t.normalMap, roughnessMap: t.roughnessMap }; };
const M = (color, type, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.0, ...(type ? T(type) : {}), ...opts });
const GLOW = (color, i = 0.9) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: i });

// Shared materials (the "skin" of our guns).
const MAT = {
  metal: M(0x3a3d42, 'metal', { metalness: 0.9, roughness: 0.38 }),          // machined steel
  blued: M(0x1b1d22, 'metal', { metalness: 0.85, roughness: 0.42 }),         // dark finished steel
  dark: M(0x1e1f23, 'polymer', { roughness: 0.62 }),                          // black polymer
  mid: M(0x44464c, 'polymer', { roughness: 0.55, metalness: 0.2 }),
  light: M(0xcfcbc2, 'polymer', { roughness: 0.5, metalness: 0.05 }),         // painted cerakote
  red: M(0xa8323b, 'polymer', { roughness: 0.45, metalness: 0.05 }),
  teal: M(0x2c7f7a, 'polymer', { roughness: 0.5, metalness: 0.05 }),
  gold: M(0xc9a04a, 'metal', { metalness: 1, roughness: 0.28 }),              // brass
  wood: M(0x6b4428, 'wood', { roughness: 0.65 }),
  glove: M(0x2a2b2e, 'polymer', { roughness: 0.88 }),
  sleeve: M(0x3d4636, 'concrete', { roughness: 0.95 }),                       // olive fabric
  rubber: M(0x141414, 'polymer', { roughness: 0.9 }),
  glowCyan: GLOW(0x29f0ff), glowRed: GLOW(0xff4655, 1.4), glowGreen: GLOW(0x7dff3a, 1.2), glowOrange: GLOW(0xff9a3d, 0.8),
  lens: new THREE.MeshStandardMaterial({ color: 0x0a1426, metalness: 0.6, roughness: 0.04, emissive: 0x1a3a8a, emissiveIntensity: 0.25 }),
};

/** Normal/roughness detail on the guns follows the graphics setting. */
export function setViewmodelDetail(on) {
  for (const m of Object.values(MAT)) {
    if (!m.userData.detail) m.userData.detail = { normalMap: m.normalMap, roughnessMap: m.roughnessMap };
    const want = on ? m.userData.detail.normalMap : null;
    if (m.normalMap === want) continue;
    m.normalMap = want; m.roughnessMap = on ? m.userData.detail.roughnessMap : null; m.needsUpdate = true;
  }
}

function box(g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
function cyl(g, r1, r2, len, mat, x, y, z, seg = 12) {
  // Cylinder lying along the Z axis (barrels, tubes).
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m;
}
// A hand + forearm holding the grip.
function hand(g, x, y, z, rx = 0.2) {
  box(g, 0.07, 0.09, 0.1, MAT.glove, x, y, z, rx);
  box(g, 0.08, 0.08, 0.32, MAT.sleeve, x + 0.02, y - 0.05, z + 0.2, rx - 0.15);
}
function muzzle(g, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); g.userData.muzzle = o; }
// Where spent casings fly out (ejection port).
function eject(g, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); g.userData.eject = o; }
// Picatinny rail: a strip with evenly spaced ridges.
function rail(g, len, x, y, z, w = 0.026) {
  box(g, w, 0.008, len, MAT.blued, x, y, z);
  const n = Math.floor(len / 0.018);
  for (let i = 0; i < n; i++) box(g, w + 0.004, 0.007, 0.008, MAT.blued, x, y + 0.007, z - len / 2 + 0.009 + i * 0.018);
}
// A row of thin grooves (slide serrations, vents).
function serrations(g, n, w, h, x, y, z, step, mat = MAT.blued) { for (let i = 0; i < n; i++) box(g, w, h, 0.004, mat, x, y, z + i * step); }
function screw(g, x, y, z, side = 1) { const m = cyl(g, 0.006, 0.006, 0.004, MAT.metal, x, y, z, 8); m.rotation.set(0, 0, Math.PI / 2 * side); return m; }
function triggerGuard(g, y, z) {
  box(g, 0.012, 0.006, 0.07, MAT.dark, 0, y - 0.03, z);
  box(g, 0.012, 0.03, 0.006, MAT.dark, 0, y - 0.015, z - 0.035);
  box(g, 0.004, 0.022, 0.006, MAT.metal, 0, y - 0.012, z - 0.005, 0.3);   // trigger
}

export function buildViewmodel(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'knife': {
      box(g, 0.035, 0.05, 0.14, MAT.dark, 0, 0, 0);                 // handle
      box(g, 0.06, 0.02, 0.025, MAT.gold, 0, 0, -0.08);              // guard
      const blade = box(g, 0.012, 0.045, 0.24, MAT.metal, 0, 0.005, -0.21);
      blade.scale.set(1, 1, 1);
      box(g, 0.004, 0.006, 0.22, MAT.metal, 0, -0.018, -0.2);        // sharpened edge bevel
      serrations(g, 6, 0.04, 0.006, 0, 0.0, -0.05, 0.016, MAT.rubber); // handle grip rings
      box(g, 0.03, 0.03, 0.012, MAT.metal, 0, 0, 0.075);                // pommel
      box(g, 0.07, 0.09, 0.1, MAT.glove, 0, -0.01, 0.02);
      box(g, 0.08, 0.08, 0.32, MAT.sleeve, 0.02, -0.06, 0.22, -0.1);
      g.userData.rest = new THREE.Vector3(0.22, -0.2, -0.38);
      g.rotation.set(0.2, 0.3, -0.4);
      g.userData.restRot = new THREE.Euler(0.2, 0.3, -0.4);
      break;
    }
    case 'pistol': {
      box(g, 0.05, 0.06, 0.24, MAT.dark, 0, 0.03, -0.06);           // slide
      box(g, 0.052, 0.012, 0.2, MAT.red, 0, 0.066, -0.06);           // accent stripe
      box(g, 0.045, 0.12, 0.06, MAT.mid, 0, -0.05, 0.03, 0.25);       // grip
      g.userData.mag = box(g, 0.036, 0.05, 0.045, MAT.dark, 0, -0.105, 0.045, 0.25); // magazine base
      box(g, 0.01, 0.015, 0.01, MAT.glowGreen, 0, 0.08, -0.16);       // sight dot
      cyl(g, 0.012, 0.012, 0.04, MAT.metal, 0, 0.03, -0.19, 8);
      serrations(g, 7, 0.054, 0.04, 0, 0.035, 0.02, 0.008);          // rear slide serrations
      box(g, 0.03, 0.012, 0.012, MAT.blued, 0, 0.067, 0.045);         // rear sight
      box(g, 0.012, 0.01, 0.02, MAT.blued, 0.026, 0.035, -0.04);       // ejection port
      box(g, 0.006, 0.012, 0.03, MAT.metal, 0.026, 0.005, -0.01);      // slide release
      triggerGuard(g, 0.0, -0.03);
      for (let i = 0; i < 5; i++) box(g, 0.047, 0.005, 0.062, MAT.rubber, 0, -0.03 - i * 0.018, 0.03 + i * 0.0046, 0.25); // grip texture bands
      eject(g, 0.03, 0.04, -0.04);
      hand(g, 0, -0.07, 0.04);
      muzzle(g, 0, 0.03, -0.21);
      g.userData.rest = new THREE.Vector3(0.2, -0.17, -0.38);
      g.userData.aim = new THREE.Vector3(0, -0.105, -0.3);
      break;
    }
    case 'rifle': {
      box(g, 0.06, 0.09, 0.42, MAT.light, 0, 0, -0.05);              // receiver
      box(g, 0.062, 0.03, 0.3, MAT.red, 0, 0.05, -0.08);              // top rail accent
      cyl(g, 0.016, 0.016, 0.3, MAT.dark, 0, 0.01, -0.4);             // barrel
      box(g, 0.05, 0.06, 0.1, MAT.dark, 0, 0.0, -0.32);               // handguard
      g.userData.mag = box(g, 0.04, 0.14, 0.06, MAT.dark, 0, -0.1, -0.12, -0.2); // magazine
      box(g, 0.04, 0.1, 0.05, MAT.mid, 0, -0.08, 0.06, 0.3);          // grip
      box(g, 0.05, 0.08, 0.16, MAT.light, 0, -0.01, 0.22);            // stock
      box(g, 0.03, 0.04, 0.06, MAT.dark, 0, 0.08, -0.02);             // sight
      box(g, 0.012, 0.012, 0.01, MAT.glowRed, 0, 0.105, -0.02);       // red dot
      box(g, 0.064, 0.006, 0.12, MAT.glowCyan, 0, -0.03, -0.14);       // accent strip
      rail(g, 0.26, 0, 0.068, -0.08);                                   // top rail
      box(g, 0.002, 0.02, 0.06, MAT.blued, 0.031, 0.02, -0.04);         // ejection port
      box(g, 0.012, 0.01, 0.03, MAT.metal, 0.035, 0.03, -0.02);         // charging handle
      cyl(g, 0.022, 0.022, 0.05, MAT.blued, 0, 0.01, -0.56, 10);        // muzzle brake
      serrations(g, 3, 0.046, 0.004, 0, 0.01, -0.575, 0.02, MAT.metal);
      box(g, 0.006, 0.03, 0.006, MAT.blued, 0, 0.04, -0.5);             // front sight post
      serrations(g, 5, 0.052, 0.01, 0, -0.015, -0.36, 0.016, MAT.rubber); // handguard vents
      triggerGuard(g, -0.045, 0.02);
      screw(g, 0.031, -0.01, 0.05); screw(g, 0.031, -0.01, -0.2); screw(g, 0.026, 0.0, 0.2);
      box(g, 0.052, 0.085, 0.015, MAT.rubber, 0, -0.01, 0.305);          // butt pad
      box(g, 0.044, 0.02, 0.06, MAT.metal, 0, -0.03, -0.12, -0.2);      // mag well
      eject(g, 0.035, 0.02, -0.04);
      hand(g, 0, -0.1, 0.07);
      box(g, 0.07, 0.07, 0.1, MAT.glove, -0.03, -0.05, -0.3);          // left hand on handguard
      muzzle(g, 0, 0.01, -0.56);
      g.userData.rest = new THREE.Vector3(0.2, -0.19, -0.42);
      g.userData.aim = new THREE.Vector3(0, -0.105, -0.3);
      break;
    }
    case 'sniper': {
      box(g, 0.06, 0.08, 0.5, MAT.dark, 0, 0, -0.05);
      box(g, 0.062, 0.02, 0.45, MAT.teal, 0, -0.035, -0.05);
      cyl(g, 0.014, 0.018, 0.5, MAT.mid, 0, 0.01, -0.55);             // long barrel
      cyl(g, 0.026, 0.026, 0.06, MAT.dark, 0, 0.01, -0.8);            // muzzle brake
      cyl(g, 0.03, 0.03, 0.26, MAT.dark, 0, 0.1, -0.05, 14);          // scope tube
      cyl(g, 0.042, 0.035, 0.05, MAT.dark, 0, 0.1, -0.19, 14);
      const lens = cyl(g, 0.036, 0.036, 0.005, MAT.lens, 0, 0.1, -0.215, 14);
      box(g, 0.04, 0.12, 0.05, MAT.mid, 0, -0.08, 0.08, 0.3);
      g.userData.mag = box(g, 0.04, 0.07, 0.07, MAT.mid, 0, -0.07, -0.06);  // magazine
      box(g, 0.05, 0.09, 0.2, MAT.teal, 0, -0.02, 0.28);
      cyl(g, 0.034, 0.034, 0.02, MAT.metal, 0, 0.065, 0.03, 12);        // scope rings
      cyl(g, 0.034, 0.034, 0.02, MAT.metal, 0, 0.065, -0.12, 12);
      box(g, 0.016, 0.03, 0.02, MAT.blued, 0, 0.05, 0.03); box(g, 0.016, 0.03, 0.02, MAT.blued, 0, 0.05, -0.12);
      cyl(g, 0.01, 0.01, 0.03, MAT.metal, 0.11, 0.13, 0.0, 8).rotation.set(0, 0, Math.PI / 2); // turret knob
      const bolt = cyl(g, 0.006, 0.006, 0.06, MAT.metal, 0.045, 0.02, 0.06, 8); bolt.rotation.set(0, 0, Math.PI / 2.3);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), MAT.metal); knob.position.set(0.075, 0.005, 0.06); g.add(knob);
      triggerGuard(g, -0.04, 0.03);
      serrations(g, 6, 0.04, 0.006, 0, 0.012, -0.72, 0.008, MAT.blued); // fluting
      box(g, 0.052, 0.095, 0.015, MAT.rubber, 0, -0.02, 0.385);          // butt pad
      box(g, 0.008, 0.06, 0.012, MAT.blued, 0.02, -0.06, -0.35, 0.5); box(g, 0.008, 0.06, 0.012, MAT.blued, -0.02, -0.06, -0.35, 0.5); // folded bipod
      eject(g, 0.035, 0.03, -0.02);
      hand(g, 0, -0.1, 0.09);
      muzzle(g, 0, 0.01, -0.84);
      g.userData.rest = new THREE.Vector3(0.2, -0.2, -0.45);
      g.userData.aim = new THREE.Vector3(0, -0.15, -0.25);
      break;
    }
    case 'rpg': {
      cyl(g, 0.065, 0.065, 0.8, MAT.mid, 0, 0, -0.1, 14);             // launch tube
      cyl(g, 0.075, 0.075, 0.08, MAT.dark, 0, 0, -0.5, 14);
      cyl(g, 0.08, 0.06, 0.1, MAT.dark, 0, 0, 0.32, 14);              // back flare
      box(g, 0.035, 0.12, 0.05, MAT.dark, 0, -0.12, 0.0, 0.2);        // grip
      box(g, 0.035, 0.1, 0.05, MAT.dark, 0, -0.1, -0.25, 0.1);
      box(g, 0.02, 0.07, 0.04, MAT.gold, -0.07, 0.07, -0.1);          // sight
      const head = new THREE.Group(); g.add(head);
      cyl(head, 0.04, 0.06, 0.16, MAT.light, 0, 0, -0.62, 10);        // warhead
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 10), MAT.red); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.76; head.add(tip);
      g.userData.loaded = head;
      box(g, 0.02, 0.008, 0.4, MAT.glowOrange, 0, 0.068, -0.1);
      for (const z of [-0.35, 0.05, 0.25]) cyl(g, 0.07, 0.07, 0.02, MAT.blued, 0, 0, z, 14);   // tube bands
      box(g, 0.03, 0.04, 0.12, MAT.metal, -0.075, 0.045, -0.1);           // sight mount
      triggerGuard(g, -0.08, 0.0);
      hand(g, 0, -0.14, 0.02);
      muzzle(g, 0, 0, -0.6);
      g.userData.rest = new THREE.Vector3(0.22, -0.2, -0.38);
      g.userData.aim = new THREE.Vector3(0.07, -0.14, -0.32);
      break;
    }
    case 'grenade': {
      const drum = new THREE.Group(); drum.position.set(0, -0.02, -0.05); g.add(drum);
      cyl(drum, 0.11, 0.11, 0.16, MAT.mid, 0, 0, 0, 6);               // revolver drum (spins on reload)
      cyl(drum, 0.112, 0.112, 0.02, MAT.glowGreen, 0, 0, 0, 6);
      g.userData.drum = drum;
      cyl(g, 0.05, 0.05, 0.36, MAT.dark, 0, 0.03, -0.3, 12);          // fat barrel
      box(g, 0.05, 0.05, 0.3, MAT.teal, 0, 0.09, -0.15);
      box(g, 0.04, 0.12, 0.05, MAT.dark, 0, -0.12, 0.06, 0.3);
      box(g, 0.05, 0.07, 0.2, MAT.mid, 0, 0, 0.18);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(drum, 0.022, 0.022, 0.165, MAT.blued, Math.cos(a) * 0.065, Math.sin(a) * 0.065, 0, 8); } // chambers
      rail(g, 0.18, 0, 0.12, -0.15);
      triggerGuard(g, -0.08, 0.04);
      cyl(g, 0.056, 0.056, 0.03, MAT.metal, 0, 0.03, -0.47, 12);
      hand(g, 0, -0.14, 0.08);
      muzzle(g, 0, 0.03, -0.5);
      g.userData.rest = new THREE.Vector3(0.21, -0.19, -0.4);
      g.userData.aim = new THREE.Vector3(0, -0.12, -0.32);
      break;
    }
    case 'bow': {
      // The bow body (limbs + grip) sits in a pivot turned a little sideways,
      // so you can see its curve. The arrow always points straight ahead.
      const body = new THREE.Group(); body.position.z = -0.2; body.rotation.y = 0.5; g.add(body);
      // Limbs: part of a torus standing upright, bulging forward, tips up/down.
      const limb = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.014, 6, 24, Math.PI * 0.75), MAT.dark);
      limb.rotation.z = -Math.PI * 0.375; limb.rotation.y = Math.PI / 2;
      limb.position.set(0, 0, 0.32);
      body.add(limb);
      const glowLimb = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.006, 4, 24, Math.PI * 0.75), MAT.glowCyan);
      glowLimb.rotation.copy(limb.rotation); glowLimb.position.set(0, 0, 0.31); body.add(glowLimb);
      box(body, 0.035, 0.12, 0.04, MAT.wood, 0, 0, 0);                  // grip
      box(body, 0.06, 0.09, 0.07, MAT.glove, 0, -0.01, 0.0);            // bow hand
      // Limb tip positions in the main group's space (used for the string).
      const tips = [new THREE.Vector3(0, 0.296, 0.32 - 0.122), new THREE.Vector3(0, -0.296, 0.32 - 0.122)];
      body.updateMatrix(); tips.forEach((t) => t.applyMatrix4(body.matrix));
      const s1 = box(g, 0.004, 1, 0.004, MAT.light, 0, 0, 0), s2 = box(g, 0.004, 1, 0.004, MAT.light, 0, 0, 0);
      g.userData.string = { segs: [s1, s2], tips };
      // Arrow
      const arrow = new THREE.Group(); g.add(arrow);
      cyl(arrow, 0.006, 0.006, 0.7, MAT.wood, 0, 0, -0.3, 6);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6), MAT.glowCyan); head.rotation.x = -Math.PI / 2; head.position.z = -0.68; arrow.add(head);
      box(arrow, 0.002, 0.03, 0.08, MAT.red, 0, 0.01, 0.02);
      g.userData.arrow = arrow;
      muzzle(g, 0, 0, -0.6);
      g.userData.rest = new THREE.Vector3(0.08, -0.12, -0.5);
      g.userData.aim = new THREE.Vector3(0.02, -0.07, -0.45);
      g.userData.restRot = new THREE.Euler(0, 0, 0.2);
      break;
    }
  }
  if (g.userData.mag) g.userData.magBase = g.userData.mag.position.clone();
  g.scale.setScalar(0.75); // overall size of the guns on screen
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  return g;
}

/* Update the bow string + arrow position for a draw amount 0..1. */
export function setBowDraw(g, draw, hasArrow) {
  const s = g.userData.string;
  if (!s) return;
  const nock = _nock.set(0, 0, 0.05 + draw * 0.28);  // string pulled back toward the camera
  s.segs.forEach((seg, i) => {
    const tip = s.tips[i];
    _d.copy(nock).sub(tip);
    seg.scale.y = _d.length();
    seg.position.copy(tip).addScaledVector(_d, 0.5);
    seg.quaternion.setFromUnitVectors(_up, _d.normalize()); // turn the box so it spans tip -> nock
  });
  g.userData.arrow.visible = hasArrow;
  g.userData.arrow.position.z = nock.z - 0.05; // back of the arrow sits on the string
}
const _nock = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
