/* =========================================================================
   turrets.js — auto-turrets bought in the market. They sit around the
   tower, turn toward the nearest enemy in range and shoot it.
   ========================================================================= */
import * as THREE from '../lib/three.module.js';
import { CONFIG } from './config.js?v=b6498b4c8e';

const T = CONFIG.TURRET;
const _v = new THREE.Vector3();

export class Turrets {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.count = 0; // how many the player owns (kept when moving to a new area)
  }

  /** Build the 3D turret meshes for the current map (called after each area change). */
  rebuild() {
    this.list = [];
    for (let i = 0; i < this.count; i++) this.place(i);
  }

  add() { this.place(this.count); this.count++; }

  place(slot) {
    const game = this.game;
    const a = Math.PI / 4 + slot * (Math.PI / 2);
    const x = Math.cos(a) * 5.2, z = Math.sin(a) * 5.2;
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c40, roughness: 0.5, metalness: 0.5 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc23d, emissiveIntensity: 2.5 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.6, 8), dark); base.position.y = 0.3; g.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 24), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6; g.add(ring);
    const head = new THREE.Group(); head.position.y = 1.1; g.add(head);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.7), dark); head.add(body);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.02), glow); eye.position.set(0, 0.05, 0.36); head.add(eye);
    for (const sx of [-0.15, 0.15]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8).rotateX(Math.PI / 2), dark);
      barrel.position.set(sx, -0.05, 0.6); head.add(barrel);
    }
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    game.scene.add(g);
    game.world.circles.push({ x, z, r: 0.7, bottom: 0, top: 1.4 });
    this.list.push({ g, head, cd: Math.random() * T.rate, pos: new THREE.Vector3(x, 1.1, z) });
  }

  update(dt) {
    const game = this.game;
    for (const t of this.list) {
      t.cd -= dt;
      // find the closest enemy in range
      let best = null, bestD = T.range;
      for (const e of game.enemies.list) {
        const d = Math.hypot(e.pos.x - t.pos.x, e.pos.z - t.pos.z);
        if (d < bestD && e.alive) { bestD = d; best = e; }
      }
      if (!best) { t.head.rotation.y += dt * 0.6; continue; }
      const c = best.center(_v);
      const yaw = Math.atan2(c.x - t.pos.x, c.z - t.pos.z);
      let dy = Math.atan2(Math.sin(yaw - t.head.rotation.y), Math.cos(yaw - t.head.rotation.y));
      t.head.rotation.y += dy * Math.min(1, dt * 10);
      if (t.cd <= 0 && Math.abs(dy) < 0.3) {
        t.cd = T.rate;
        const from = t.pos.clone().add(new THREE.Vector3(Math.sin(t.head.rotation.y) * 0.9, 0, Math.cos(t.head.rotation.y) * 0.9));
        game.effects.tracer(from, c.clone(), 0xffc23d);
        game.effects.impact(c, null, 0xffc23d);
        game.hitEnemy(best, T.damage, false, c.clone(), 'turret');
        game.sound.turret();
      }
    }
  }
}
