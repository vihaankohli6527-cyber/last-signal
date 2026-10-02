/* =========================================================================
   viewmodels.js — the first-person weapon models you see in your hands.
   Each one is built from simple boxes/cylinders with a stylised colour
   scheme. Coordinates are in camera space: +X right, +Y up, -Z forward.
   Each builder returns a Group with userData.muzzle (where the flash goes).
   ========================================================================= */
import * as THREE from '../lib/three.module.js';

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35, ...opts });
const GLOW = (color, i = 1.3) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: i });

// Shared materials (the "skin" of our guns).
const MAT = {
  dark: M(0x24242e), mid: M(0x4a4b5c), light: M(0xe8e6ef, { metalness: 0.1 }),
  red: M(0xff4655, { metalness: 0.1 }), teal: M(0x2fd3c5, { metalness: 0.1 }), gold: M(0xffc23d, { metalness: 0.6, roughness: 0.3 }),
  wood: M(0x8a5a35, { metalness: 0 }), glove: M(0x2b2f3a, { roughness: 0.9, metalness: 0 }), sleeve: M(0x3a5a8a, { roughness: 0.9, metalness: 0 }),
  glowCyan: GLOW(0x29f0ff), glowRed: GLOW(0xff4655), glowGreen: GLOW(0x7dff3a), glowOrange: GLOW(0xff9a3d, 1.3),
  lens: M(0x112244, { metalness: 0.9, roughness: 0.1, emissive: 0x2244aa, emissiveIntensity: 0.6 }),
};

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

export function buildViewmodel(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'knife': {
      box(g, 0.035, 0.05, 0.14, MAT.dark, 0, 0, 0);                 // handle
      box(g, 0.06, 0.02, 0.025, MAT.gold, 0, 0, -0.08);              // guard
      const blade = box(g, 0.012, 0.045, 0.24, MAT.light, 0, 0.005, -0.21);
      blade.scale.set(1, 1, 1);
      box(g, 0.014, 0.008, 0.22, MAT.glowCyan, 0, 0.026, -0.2);      // glowing edge
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
      cyl(g, 0.012, 0.012, 0.04, MAT.dark, 0, 0.03, -0.19, 8);
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
      box(g, 0.064, 0.012, 0.12, MAT.glowCyan, 0, -0.03, -0.14);       // glow strip
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
      box(g, 0.13, 0.015, 0.4, MAT.glowOrange, 0, 0.066, -0.1);
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
