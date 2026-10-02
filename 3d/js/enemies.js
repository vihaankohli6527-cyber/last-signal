/* =========================================================================
   enemies.js — the neon aliens.
     runner  : small, very fast, attacks tower or player
     brute   : big, slow, tanky, smashes the tower
     spitter : floats, keeps its distance and spits glowing projectiles
     boss    : giant crystal monster at the end of every area; shoots volleys
               and summons runners
   Every enemy is built from simple shapes with glowing (emissive) materials.
   ========================================================================= */
import * as THREE from '../lib/three.module.js';
import { surface } from './textures.js?v=e898eff5dd';
import { CONFIG } from './config.js?v=e898eff5dd';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Shared geometries (made once, used by every enemy = fast).
const GEO = {
  octa: new THREE.OctahedronGeometry(0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  smallSphere: new THREE.SphereGeometry(0.5, 8, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(1, 0.08, 6, 32),
  icosa: new THREE.IcosahedronGeometry(0.5, 0),
};

// Helper: add a mesh part to a group. head = true marks it as a weak spot (headshot).
function part(group, geo, mat, x, y, z, sx, sy, sz, head = false) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy ?? sx, sz ?? sx);
  m.castShadow = true;
  m.userData.head = head;
  group.add(m);
  return m;
}

const GLOW_I = 1.6, BODY_I = 0.03, SKIN_I = 0.07;   // emissive strengths (subtle)

export class Enemy {
  constructor(type, scale, pos, manager) {
    const def = CONFIG.ENEMIES[type];
    this.type = type;
    this.def = def;
    this.manager = manager;
    this.maxHp = def.hp * scale.hp;
    this.hp = this.maxHp;
    this.speed = def.speed * scale.speed * (0.9 + Math.random() * 0.2);
    this.damage = def.damage * scale.damage;
    this.radius = def.radius;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.attackCd = 1 + Math.random();
    this.flash = 0;
    this.alive = true;
    this.anim = Math.random() * 10;
    this.avoidSide = Math.random() < 0.5 ? 1 : -1;
    this.stuckTimer = 0;
    this.stuckCount = 0;
    this.climbT = 0;
    this.step = 0.35;
    this.lastPos = pos.clone();
    this.summonCd = def.summonEvery || 0;
    // Who are we going after?
    this.target = def.target === 'mixed' ? (Math.random() < 0.5 ? 'tower' : 'player') : def.target;

    // Two materials per enemy (cloned so the hit-flash only affects this one).
    // Natural look: dark organic skin + chitin, with small glowing accents (eyes, sacs).
    const tex = surface('stone');
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: def.color, emissiveIntensity: GLOW_I, roughness: 0.4 });
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x17141b, emissive: def.color, emissiveIntensity: BODY_I, roughness: 0.42, metalness: 0.15,
      normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, normalScale: new THREE.Vector2(0.8, 0.8) });
    const skin = new THREE.Color(0x3a312c).lerp(new THREE.Color(def.color), 0.22);
    this.skinMat = new THREE.MeshStandardMaterial({ color: skin, emissive: def.color, emissiveIntensity: SKIN_I, roughness: 0.62, metalness: 0.0,
      map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, normalScale: new THREE.Vector2(1.2, 1.2) });
    this.eyeMat = manager.eyeMat;
    this.group = new THREE.Group();
    this.build();
    this.group.position.copy(this.pos);
    this.group.traverse((o) => { if (o.isMesh) o.userData.enemy = this; });
    manager.scene.add(this.group);

    // Floating health bar (two flat planes that always face the camera).
    this.bar = new THREE.Group();
    const bg = new THREE.Mesh(manager.barGeo, manager.barBgMat);
    this.barFg = new THREE.Mesh(manager.barGeo, new THREE.MeshBasicMaterial({ color: def.color, depthWrite: false }));
    this.barFg.position.z = 0.01;
    bg.scale.set(1.05, 1.4, 1);
    this.bar.add(bg, this.barFg);
    this.bar.visible = false;
    this.bar.scale.setScalar(type === 'boss' ? 3 : type === 'brute' ? 1.6 : 1);
    manager.scene.add(this.bar);
  }

  // Build the 3D model from simple shapes. Origin = feet.
  build() {
    const g = this.group, G = this.glowMat, B = this.bodyMat, E = this.eyeMat, S = this.skinMat;
    switch (this.type) {
      case 'runner':
        this.body = part(g, GEO.octa, S, 0, 0.95, 0, 0.9, 1.3, 0.9);
        part(g, GEO.octa, G, 0, 0.95, 0, 0.35, 1.36, 0.35);                   // glowing spine
        part(g, GEO.sphere, B, 0, 1.55, 0.05, 0.45, 0.4, 0.45, true);      // head
        part(g, GEO.box, E, -0.1, 1.6, 0.24, 0.08, 0.05, 0.03, true);       // eyes
        part(g, GEO.box, E, 0.1, 1.6, 0.24, 0.08, 0.05, 0.03, true);
        this.legs = [part(g, GEO.cone, B, -0.18, 0.3, 0, 0.18, -0.6, 0.18), part(g, GEO.cone, B, 0.18, 0.3, 0, 0.18, -0.6, 0.18)];
        for (let i = 0; i < 3; i++) { const s = part(g, GEO.cone, G, 0, 1.0 + i * 0.2, -0.3, 0.12, 0.4, 0.12); s.rotation.x = -1.1; }
        this.height = 1.8; this.headY = 1.35;
        break;
      case 'brute':
        this.body = part(g, GEO.box, B, 0, 1.5, 0, 1.9, 1.5, 1.3);
        part(g, GEO.sphere, G, 0, 1.6, 0.62, 0.6, 0.6, 0.3);               // glowing chest core
        part(g, GEO.icosa, B, -1.15, 2.1, 0, 0.9); part(g, GEO.icosa, B, 1.15, 2.1, 0, 0.9); // shoulders
        part(g, GEO.box, G, 0, 2.5, 0.15, 0.7, 0.5, 0.6, true);           // head
        part(g, GEO.box, E, 0, 2.55, 0.46, 0.5, 0.08, 0.03, true);
        this.arms = [part(g, GEO.box, B, -1.25, 1.2, 0.1, 0.5, 1.4, 0.5), part(g, GEO.box, B, 1.25, 1.2, 0.1, 0.5, 1.4, 0.5)];
        part(g, GEO.box, G, -1.25, 0.45, 0.1, 0.55, 0.2, 0.55); part(g, GEO.box, G, 1.25, 0.45, 0.1, 0.55, 0.2, 0.55);
        this.legs = [part(g, GEO.box, B, -0.5, 0.4, 0, 0.55, 0.8, 0.55), part(g, GEO.box, B, 0.5, 0.4, 0, 0.55, 0.8, 0.55)];
        this.height = 2.9; this.headY = 2.2;
        break;
      case 'spitter':
        this.float = new THREE.Group(); g.add(this.float);
        this.body = part(this.float, GEO.dodeca, S, 0, 0, 0, 1.2);
        part(this.float, GEO.sphere, E, 0, 0.1, 0.5, 0.3, 0.3, 0.2, true);   // big eye = weak spot
        const mouth = part(this.float, GEO.cone, B, 0, -0.2, 0.55, 0.25, 0.4, 0.25); mouth.rotation.x = Math.PI / 2;
        this.ring = part(this.float, GEO.torus, G, 0, 0, 0, 0.9); this.ring.rotation.x = Math.PI / 2;
        this.tentacles = [];
        for (let i = 0; i < 3; i++) {
          const t = part(this.float, GEO.cone, B, Math.cos(i * 2.1) * 0.3, -0.75, Math.sin(i * 2.1) * 0.3, 0.15, -0.8, 0.15);
          this.tentacles.push(t);
        }
        this.float.position.y = 1.7;
        this.height = 2.4; this.headY = 1.55;
        break;
      case 'boss':
        this.float = new THREE.Group(); g.add(this.float);
        this.body = part(this.float, GEO.octa, S, 0, 0, 0, 3.2, 4.2, 3.2);
        part(this.float, GEO.sphere, G, 0, 0, 0, 2.2);                          // glowing core
        part(this.float, GEO.sphere, E, 0, 1.9, 0.9, 0.9, 0.9, 0.9, true);  // eye = weak spot
        this.rings = [part(this.float, GEO.torus, G, 0, 0, 0, 2.8), part(this.float, GEO.torus, G, 0, 0, 0, 3.4)];
        this.shards = [];
        for (let i = 0; i < 6; i++) this.shards.push(part(this.float, GEO.octa, G, 0, 0, 0, 0.6, 1.2, 0.6));
        this.legs = [];
        for (let i = 0; i < 4; i++) {
          const l = part(g, GEO.cone, B, Math.cos(i * 1.57 + 0.78) * 1.8, 1.6, Math.sin(i * 1.57 + 0.78) * 1.8, 0.7, -3.2, 0.7);
          this.legs.push(l);
        }
        this.float.position.y = 4.6;
        this.height = 7.5; this.headY = 5.6;
        break;
    }
  }

  /** Centre of the body (for projectile hits, damage numbers, aiming). */
  center(out = _v2) { return out.set(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z); }

  /** Take damage. Returns true if this hit killed it. */
  hurt(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash = 0.1;
    this.bar.visible = true;
    if (this.hp <= 0) { this.alive = false; return true; }
    return false;
  }

  update(dt, game) {
    const world = game.world;
    this.anim += dt;
    // ---- choose target position ----
    const player = game.player;
    const toPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    // Runners and spitters get distracted by a player who comes close.
    if ((this.type === 'runner' || this.type === 'spitter') && toPlayer < 8 && player.alive) this.target = 'player';
    const goal = this.target === 'player' ? _v.set(player.pos.x, 0, player.pos.z) : _v.set(0, 0, 0);
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const surfaceDist = this.target === 'tower' ? dist - CONFIG.TOWER.radius : dist - CONFIG.PLAYER.radius;

    const ranged = this.def.range;
    const stopDist = ranged ? ranged * 0.75 : this.radius + 0.5;
    let wantMove = surfaceDist > stopDist;

    // ---- steering: head for the goal, slide around obstacles ----
    let dirX = dx / dist, dirZ = dz / dist;
    if (wantMove) {
      const probe = this.radius + 1.0;
      if (this.blocked(world, dirX, dirZ, probe)) {
        // Try turning 45°, 90°, 135° toward our preferred side, then the other side.
        let found = false;
        for (const ang of [0.8, 1.57, 2.3]) {
          for (const side of [this.avoidSide, -this.avoidSide]) {
            const c = Math.cos(ang * side), s = Math.sin(ang * side);
            const nx = dirX * c - dirZ * s, nz = dirX * s + dirZ * c;
            if (!this.blocked(world, nx, nz, probe)) { dirX = nx; dirZ = nz; found = true; this.avoidSide = side; break; }
          }
          if (found) break;
        }
      }
    }
    const spd = wantMove ? this.speed : 0;
    const k = Math.min(1, dt * 6);
    this.vel.x += (dirX * spd - this.vel.x) * k;
    this.vel.z += (dirZ * spd - this.vel.z) * k;
    // separation push (computed by the manager so enemies don't stack)
    let nx = this.pos.x + (this.vel.x + this.sepX) * dt;
    let nz = this.pos.z + (this.vel.z + this.sepZ) * dt;
    // step = how tall an obstacle we can step over. Normally small, but an
    // enemy that has been stuck for a while scrambles over low cover.
    if (this.climbT > 0) this.climbT -= dt;
    this.step = this.climbT > 0 ? 1.7 : 0.35;
    const res = world.resolveCircle(nx, nz, this.radius, this.step, this.height);
    this.pos.x = res.x; this.pos.z = res.z;

    // Stuck? (moving much slower than we want) -> switch avoidance side.
    this.stuckTimer += dt;
    if (this.stuckTimer > 0.8) {
      const moved = this.pos.distanceTo(this.lastPos);
      if (wantMove && moved < this.speed * 0.8 * 0.25) {
        this.avoidSide *= -1;
        if (++this.stuckCount >= 3) { this.climbT = 2; this.stuckCount = 0; }
      } else this.stuckCount = 0;
      this.lastPos.copy(this.pos); this.stuckTimer = 0;
    }

    // ---- face the direction we move / the target ----
    const faceX = wantMove ? this.vel.x : dx, faceZ = wantMove ? this.vel.z : dz;
    const yaw = Math.atan2(faceX, faceZ);
    let dy = yaw - this.group.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.group.rotation.y += dy * Math.min(1, dt * 8);
    this.group.position.copy(this.pos);

    // ---- attack ----
    this.attackCd -= dt;
    if (ranged) {
      if (surfaceDist < ranged && this.attackCd <= 0) {
        this.attackCd = this.def.attackRate * (0.8 + Math.random() * 0.4);
        const aim = this.target === 'player' ? player.eye() : world.towerAim;
        if (this.type === 'boss') {
          for (let i = -2; i <= 2; i++) this.manager.shoot(this, aim, i * 0.12);
          if (surfaceDist < this.radius + 1.5) game.damageTower(this.damage, this.pos);
        } else {
          this.manager.shoot(this, aim, 0);
        }
      }
    } else if (surfaceDist < this.radius + 0.7 && this.attackCd <= 0) {
      this.attackCd = this.def.attackRate;
      this.lunge = 0.25;
      if (this.target === 'tower') game.damageTower(this.damage, this.pos);
      else if (player.alive && Math.abs(player.pos.y - this.pos.y) < 2.5) game.damagePlayer(this.damage, this.pos);
    }
    // Boss summons runners now and then.
    if (this.type === 'boss') {
      this.summonCd -= dt;
      if (this.summonCd <= 0) { this.summonCd = this.def.summonEvery; this.manager.summon(this.pos, 3); }
    }

    this.animate(dt, wantMove);

    // ---- hit flash ----
    if (this.flash > 0) {
      this.flash -= dt;
      this.glowMat.emissive.setHex(0xffffff); this.bodyMat.emissive.setHex(0xffffff); this.bodyMat.emissiveIntensity = 1.2;
      this.skinMat.emissive.setHex(0xffffff); this.skinMat.emissiveIntensity = 1.5;
    } else {
      this.glowMat.emissive.setHex(this.def.color); this.bodyMat.emissive.setHex(this.def.color); this.bodyMat.emissiveIntensity = BODY_I;
      this.skinMat.emissive.setHex(this.def.color); this.skinMat.emissiveIntensity = SKIN_I;
    }

    // ---- health bar ----
    if (this.bar.visible) {
      this.bar.position.set(this.pos.x, this.pos.y + this.height + 0.35, this.pos.z);
      this.bar.quaternion.copy(game.camera.quaternion);
      const f = Math.max(0, this.hp / this.maxHp);
      this.barFg.scale.x = f; this.barFg.position.x = -(1 - f) * 0.5;
    }
  }

  // Would a step in direction (x,z) bump into something?
  blocked(world, x, z, probe) {
    const px = this.pos.x + x * probe, pz = this.pos.z + z * probe;
    return world.resolveCircle(px, pz, this.radius * 0.8, this.step, this.height).hit &&
      // the tower itself is the goal, it doesn't count as an obstacle
      !(this.target === 'tower' && Math.hypot(px, pz) < CONFIG.TOWER.radius + this.radius + 1.5);
  }

  animate(dt, moving) {
    const t = this.anim;
    const sp = moving ? 1 : 0.2;
    if (this.lunge > 0) this.lunge -= dt;
    const lunge = this.lunge > 0 ? Math.sin((0.25 - this.lunge) / 0.25 * Math.PI) * 0.5 : 0;
    switch (this.type) {
      case 'runner':
        this.legs[0].rotation.x = Math.sin(t * 16) * 0.8 * sp;
        this.legs[1].rotation.x = -Math.sin(t * 16) * 0.8 * sp;
        this.body.rotation.y = t * 3;
        this.group.position.y = this.pos.y + Math.abs(Math.sin(t * 16)) * 0.12 * sp;
        this.group.rotation.x = moving ? 0.25 + lunge : lunge;
        break;
      case 'brute':
        this.legs[0].position.z = Math.sin(t * 5) * 0.3 * sp;
        this.legs[1].position.z = -Math.sin(t * 5) * 0.3 * sp;
        this.arms[0].rotation.x = -Math.sin(t * 5) * 0.4 * sp - lunge * 2;
        this.arms[1].rotation.x = Math.sin(t * 5) * 0.4 * sp - lunge * 2;
        this.group.position.y = this.pos.y + Math.abs(Math.sin(t * 5)) * 0.1 * sp;
        break;
      case 'spitter':
        this.float.position.y = 1.7 + Math.sin(t * 2.5) * 0.25;
        this.ring.rotation.z = t * 3; this.ring.rotation.x = Math.PI / 2 + Math.sin(t) * 0.3;
        this.tentacles.forEach((te, i) => { te.rotation.x = Math.sin(t * 4 + i) * 0.4; });
        this.body.rotation.y = t;
        break;
      case 'boss':
        this.float.position.y = 4.6 + Math.sin(t * 1.5) * 0.4;
        this.body.rotation.y = t * 0.6;
        this.rings[0].rotation.set(t * 0.9, t * 0.5, 0);
        this.rings[1].rotation.set(-t * 0.6, 0, t * 0.8);
        this.shards.forEach((s, i) => {
          const a = t * 1.2 + i * Math.PI / 3;
          s.position.set(Math.cos(a) * 4.2, Math.sin(t * 2 + i) * 0.8, Math.sin(a) * 4.2);
          s.rotation.y = t * 3;
        });
        this.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 3 + i * 1.5) * 0.2 * sp; });
        break;
    }
  }

  dispose() {
    this.manager.scene.remove(this.group);
    this.manager.scene.remove(this.bar);
    this.glowMat.dispose(); this.bodyMat.dispose(); this.skinMat.dispose(); this.barFg.material.dispose();
  }
}

/* -------------------------------------------------------------------------
   EnemyManager: spawns enemies, keeps them apart, handles their projectiles.
   ------------------------------------------------------------------------- */
export class EnemyManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.list = [];
    this.hitMeshes = [];   // every mesh that can be shot (rebuilt when enemies change)
    this.dirty = true;
    this.shots = [];       // enemy projectiles
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.barGeo = new THREE.PlaneGeometry(1, 0.1);
    this.barBgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
    this.shotGeo = new THREE.SphereGeometry(0.22, 10, 8);
    this.shotMats = {};
    this.scale = { hp: 1, speed: 1, damage: 1 };
  }

  spawn(type, pos) {
    const e = new Enemy(type, this.scale, pos || this.game.world.randomSpawnPoint(CONFIG.ENEMIES[type].radius), this);
    this.list.push(e);
    this.dirty = true;
    return e;
  }

  // Boss ability: spawn runners around a point.
  summon(pos, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = new THREE.Vector3(pos.x + Math.cos(a) * 5, 0, pos.z + Math.sin(a) * 5);
      const r = this.game.world.resolveCircle(p.x, p.z, 0.6);
      const e = this.spawn('runner', new THREE.Vector3(r.x, 0, r.z));
      e.target = 'player';
      this.game.effects.burst(e.center(), CONFIG.ENEMIES.boss.color, 20, 5);
      this.game.counts.summoned++;
    }
  }

  // Fire a glowing glob from enemy e toward aim (with a sideways spread angle).
  shoot(e, aim, spread) {
    const from = e.center(new THREE.Vector3());
    if (e.type === 'spitter') from.y = e.pos.y + e.float.position.y;
    if (e.type === 'boss') from.y = e.pos.y + 5.5;
    const dir = aim.clone().sub(from).normalize();
    if (spread) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    const color = e.def.color;
    if (!this.shotMats[color]) this.shotMats[color] = new THREE.MeshBasicMaterial({ color });
    const m = new THREE.Mesh(this.shotGeo, this.shotMats[color]);
    m.position.copy(from);
    if (e.type === 'boss') m.scale.setScalar(2);
    this.scene.add(m);
    this.shots.push({ m, vel: dir.multiplyScalar(e.def.projectileSpeed), life: 4, damage: e.damage, color });
    if (this.game.sound) this.game.sound.spit();
  }

  /** Remove every enemy and shot (used when changing area). */
  clear() {
    for (const e of this.list) e.dispose();
    for (const s of this.shots) this.scene.remove(s.m);
    this.list = []; this.shots = []; this.dirty = true;
  }

  getHitMeshes() {
    if (this.dirty) {
      this.hitMeshes = [];
      for (const e of this.list) e.group.traverse((o) => { if (o.isMesh) this.hitMeshes.push(o); });
      this.dirty = false;
    }
    return this.hitMeshes;
  }

  update(dt) {
    const game = this.game;
    const L = this.list;
    // Separation: push overlapping enemies apart.
    for (const e of L) { e.sepX = 0; e.sepZ = 0; }
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
        const min = a.radius + b.radius + 0.2;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) / min * 6;
          const ux = dx / d, uz = dz / d;
          // heavier enemies get pushed less
          const wa = b.radius / (a.radius + b.radius), wb = 1 - wa;
          a.sepX += ux * push * wa * 2; a.sepZ += uz * push * wa * 2;
          b.sepX -= ux * push * wb * 2; b.sepZ -= uz * push * wb * 2;
        }
      }
    }
    for (const e of L) e.update(dt, game);

    // Enemy projectiles
    const pEye = game.player.eye();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.m.position.addScaledVector(s.vel, dt);
      const p = s.m.position;
      if (Math.random() < 0.5) game.effects.spawn(p.x, p.y, p.z, 0, 0, 0, 0.3, s.color, 0, 0);
      let hit = false;
      // hit player? (capsule approx: distance to the vertical line of the body)
      const pdx = p.x - pEye.x, pdz = p.z - pEye.z;
      const pr = game.player.crouched ? 0.42 : 0.55;   // crouching = smaller target
      if (game.player.alive && pdx * pdx + pdz * pdz < pr * pr && p.y < pEye.y + 0.25 && p.y > game.player.pos.y - 0.1) {
        game.damagePlayer(s.damage, p); hit = true;
      } else if (Math.hypot(p.x, p.z) < CONFIG.TOWER.radius + 0.3 && p.y < game.world.towerTop.y) {
        game.damageTower(s.damage, p); hit = true;
      } else if (game.world.pointSolid(p) || s.life <= 0) hit = true;
      if (hit) {
        game.effects.burst(p, s.color, 12, 3, 0.4);
        this.scene.remove(s.m);
        this.shots.splice(i, 1);
      }
    }

    // Remove dead enemies (with a particle burst).
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i];
      if (!e.alive) {
        const c = e.center(new THREE.Vector3());
        const n = e.type === 'boss' ? 200 : e.type === 'brute' ? 70 : 40;
        game.effects.burst(c, e.def.color, n, e.type === 'boss' ? 16 : 7, 0.9);
        game.effects.burst(c, 0xffffff, n / 4, 5, 0.4);
        if (e.type === 'boss') game.effects.explode(c, 9, e.def.color);
        e.dispose();
        L.splice(i, 1);
        this.dirty = true;
      }
    }
  }
}
