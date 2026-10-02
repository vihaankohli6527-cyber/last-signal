/* =========================================================================
   weapons.js — everything about the guns: owning/switching weapons, ammo,
   reloading, firing (melee, instant "hitscan" bullets and real projectiles:
   rockets, bouncing grenades and arrows), explosions, and animating the
   first-person viewmodel (bob, sway, recoil, reload, aim).
   ========================================================================= */
import * as THREE from '../lib/three.module.js';
import { CONFIG } from './config.js';
import { buildViewmodel, setBowDraw } from './viewmodels.js';

const W = CONFIG.WEAPONS;
const SWAP_TIME = 0.45;   // seconds to pull out a weapon
const INSPECT_TIME = 2.6; // seconds for the Y inspect animation
export const WEAPON_ORDER = Object.keys(W).sort((a, b) => W[a].slot - W[b].slot);

const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class WeaponSystem {
  constructor(game, vmCamera) {
    this.game = game;
    this.vmCamera = vmCamera;
    this.raycaster = new THREE.Raycaster();
    this.models = {};
    for (const id of WEAPON_ORDER) {
      const m = buildViewmodel(id);
      m.visible = false;
      vmCamera.add(m);
      this.models[id] = m;
    }
    // Muzzle flash: a glowing star shape shown for a split second.
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
    this.flashMesh2 = this.flashMesh.clone(); this.flashMesh2.rotation.y = Math.PI / 2;
    this.flashMesh.add(this.flashMesh2);
    this.flashMesh.visible = false;
    this.flashT = 0;

    // Shared projectile meshes
    this.projGeo = {
      rocketBody: new THREE.CylinderGeometry(0.07, 0.07, 0.6, 10).rotateX(Math.PI / 2),
      rocketNose: new THREE.ConeGeometry(0.07, 0.2, 10).rotateX(Math.PI / 2),
      grenade: new THREE.SphereGeometry(0.12, 12, 8),
      arrowShaft: new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5).rotateX(Math.PI / 2),
      arrowHead: new THREE.ConeGeometry(0.03, 0.1, 6).rotateX(Math.PI / 2),
      glow: new THREE.SphereGeometry(0.1, 8, 6),
    };
    this.projMat = {
      white: new THREE.MeshStandardMaterial({ color: 0xe8e6ef, roughness: 0.4 }),
      red: new THREE.MeshStandardMaterial({ color: 0xff4655, roughness: 0.4 }),
      orange: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
      green: new THREE.MeshStandardMaterial({ color: 0x1a3a10, emissive: 0x7dff3a, emissiveIntensity: 2 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a5a35 }),
      cyan: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x29f0ff, emissiveIntensity: 3 }),
    };
    this.projectiles = [];
    this.reset();
  }

  /** Back to the starting loadout: knife + pistol. */
  reset() {
    this.owned = { knife: true, pistol: true };
    this.ammo = {};
    for (const id of WEAPON_ORDER) this.ammo[id] = { mag: W[id].mag || 0, reserve: W[id].reserve || 0 };
    for (const id of WEAPON_ORDER) this.models[id].visible = false;
    this.current = null;
    this.cooldown = 0; this.reloadT = 0; this.swapT = 0; this.charge = 0;
    this.aimT = 0; this.kick = 0; this.bobT = 0; this.swingT = 0;
    this.sway = new THREE.Vector2();
    this.clearProjectiles();
    this.select('pistol', true);
  }

  clearProjectiles() {
    for (const p of this.projectiles) p.mesh.parent && p.mesh.parent.remove(p.mesh);
    this.projectiles = [];
  }

  get def() { return W[this.current]; }
  get isAiming() { return this.aimT > 0.5; }
  get scoped() { return this.current === 'sniper' && this.aimT > 0.85; }

  give(id) { this.owned[id] = true; this.ammo[id] = { mag: W[id].mag || 0, reserve: W[id].reserve || 0 }; this.select(id); }

  /** Fill every owned weapon's ammo to the maximum. */
  refillAll() {
    for (const id of Object.keys(this.owned)) {
      const d = W[id];
      if (d.mag) { this.ammo[id].mag = d.mag; this.ammo[id].reserve = d.maxReserve; }
    }
  }

  select(id, instant = false) {
    if (!this.owned[id] || id === this.current) return;
    if (this.current) this.models[this.current].visible = false;
    this.current = id;
    const m = this.models[id];
    m.visible = true;
    if (m.userData.muzzle) m.userData.muzzle.add(this.flashMesh);
    this.reloadT = 0; this.charge = 0;
    this.swapT = instant ? 0 : SWAP_TIME;
    this.inspectT = 0;
    this.cooldown = Math.max(this.cooldown, instant ? 0 : 0.3);
    if (!instant) this.game.sound.swap();
    this.game.hud.weaponChanged();
  }

  /** Mouse wheel / Q: go to the next or previous owned weapon. */
  cycle(dir) {
    const owned = WEAPON_ORDER.filter((id) => this.owned[id]);
    let i = owned.indexOf(this.current);
    i = (i + dir + owned.length) % owned.length;
    this.select(owned[i]);
  }

  selectSlot(n) {
    const id = WEAPON_ORDER.find((k) => W[k].slot === n);
    if (id && this.owned[id]) this.select(id);
  }

  /** Y key: show off the weapon. */
  inspect() { if (this.reloadT <= 0 && this.swapT <= 0 && this.charge === 0) this.inspectT = INSPECT_TIME; }

  reload() {
    const d = this.def, a = this.ammo[this.current];
    if (!d.mag || d.reload <= 0 || this.reloadT > 0 || a.mag >= d.mag || a.reserve <= 0) return;
    this.reloadT = d.reload;
    this.charge = 0;
    this.inspectT = 0;
    this.game.sound.reload();
  }

  finishReload() {
    const d = this.def, a = this.ammo[this.current];
    const need = d.mag - a.mag;
    const take = Math.min(need, a.reserve);
    a.mag += take;
    if (d.maxReserve < 999) a.reserve -= take;
  }

  /** Current inaccuracy (radians) — used for bullets and for the crosshair size. */
  currentSpread() {
    const d = this.def, p = this.game.player;
    if (!d.spread && !d.aimSpread) return 0;
    let s = d.spread + (d.aimSpread - d.spread) * this.aimT;
    if (p.moving) s *= 1.6;
    if (!p.onGround) s *= 2.5;
    return s + this.kick * 0.05;
  }

  // ------------------------------------------------------------------ per frame
  update(dt, input) {
    const game = this.game, d = this.def, a = this.ammo[this.current];
    this.cooldown -= dt;
    if (this.swapT > 0) this.swapT -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }

    // Aiming (right mouse). The bow uses right-click to draw instead.
    const wantAim = input.mouseR && this.current !== 'knife' && this.reloadT <= 0 && this.swapT <= 0 && this.inspectT <= 0;
    // aimRaw moves linearly; aimT is the eased (smoothstep) value used everywhere.
    const aimSpeed = this.current === 'sniper' ? 4.5 : 6;
    this.aimRaw = THREE.MathUtils.clamp((this.aimRaw || 0) + (wantAim ? dt : -dt) * aimSpeed, 0, 1);
    this.aimT = this.aimRaw * this.aimRaw * (3 - 2 * this.aimRaw);
    if (this.inspectT > 0) { this.inspectT -= dt; if (input.mouseL || input.mouseR) this.inspectT = 0; }

    const ready = this.swapT <= 0 && this.reloadT <= 0 && this.cooldown <= 0 && game.player.alive;
    // A click slightly too early is remembered for a moment ("input buffer"),
    // so semi-auto weapons don't feel like they ignore you.
    this.fireBuffer = input.mouseLPressed && !ready ? 0.25 : Math.max(0, (this.fireBuffer || 0) - dt);

    if (this.current === 'knife') {
      // Left = fast slash (alternating left/right), right = heavy stab.
      if (ready && input.mouseR) this.fire(true);
      else if (ready && (input.mouseL || this.fireBuffer > 0)) { this.fireBuffer = 0; this.fire(false); }
    } else if (this.current === 'bow') {
      // Hold left OR right to draw; releasing LEFT shoots, releasing right alone cancels.
      const drawing = (input.mouseL || input.mouseR) && ready && a.mag > 0;
      if (drawing) {
        if (this.charge === 0) game.sound.bowDraw();
        this.charge = Math.min(1, this.charge + dt / d.drawTime);
      }
      if (input.mouseLReleased && this.charge > 0.05) this.fire();
      else if (!input.mouseL && !input.mouseR) this.charge = 0;
      if (a.mag <= 0 && a.reserve > 0 && this.cooldown <= 0) { a.mag = 1; a.reserve--; }
    } else if ((input.mouseL || this.fireBuffer > 0) && ready && (d.auto || input.mouseLPressed || this.fireBuffer > 0)) {
      this.fireBuffer = 0;
      if (d.mag && a.mag <= 0) {
        if (input.mouseLPressed) game.sound.dryFire();
        this.reload();
      } else this.fire();
    }
    // Auto-reload an empty magazine.
    if (d.mag && a.mag <= 0 && a.reserve > 0 && this.reloadT <= 0 && this.current !== 'bow' && this.cooldown <= 0) this.reload();

    this.updateProjectiles(dt);
    this.animateViewmodel(dt, input);
  }

  // ------------------------------------------------------------------ firing
  fire(heavy = false) {
    const game = this.game, d = this.def, id = this.current, a = this.ammo[id];
    this.cooldown = heavy ? d.heavyRate : d.rate;
    this.inspectT = 0;
    const cam = game.camera;
    cam.getWorldDirection(_dir);
    _right.setFromMatrixColumn(cam.matrixWorld, 0);
    _up.setFromMatrixColumn(cam.matrixWorld, 1);

    if (d.type === 'melee') {
      this.swingT = heavy ? 0.55 : 0.32;
      this.swingDur = this.swingT;
      this.swingHeavy = heavy;
      this.swingSide = heavy ? 0 : -(this.swingSide || 1); // alternate left / right slashes
      game.sound.knife();
      game.player.punch(heavy ? 0.03 : 0.012, heavy ? 0 : this.swingSide * 0.015);
      this.melee(d, heavy);
      return;
    }
    if (d.mag) a.mag--;
    this.kick = Math.min(1.5, this.kick + (id === 'sniper' ? 1.2 : id === 'rpg' ? 1.0 : 0.35));
    game.player.addRecoil(d.recoil * (1 - this.aimT * 0.5));
    game.player.punch(d.recoil * 0.25, (Math.random() - 0.5) * d.recoil * 0.3);
    this.kickV = (this.kickV || 0) + (id === 'sniper' || id === 'rpg' ? 9 : 4);
    if (id !== 'bow') { this.flashT = 0.05; game.muzzleFlash(); }
    game.sound[id === 'bow' ? 'bowShot' : id]();
    game.stats.shots++;

    if (d.type === 'hitscan') {
      const spread = this.currentSpread();
      const dir = _v.copy(_dir)
        .addScaledVector(_right, (Math.random() - 0.5) * 2 * spread)
        .addScaledVector(_up, (Math.random() - 0.5) * 2 * spread).normalize();
      this.hitscan(cam.position, dir, d, id);
    } else {
      this.spawnProjectile(d, id);
    }
  }

  // Knife: hit the closest enemy in front of us within range.
  melee(d, heavy) {
    const range = heavy ? d.heavyRange : d.range;
    const game = this.game, eye = game.player.eye();
    const fwd = _v2.set(_dir.x, 0, _dir.z).normalize();
    let best = null, bestD = Infinity;
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      const c = e.center(_v);
      const dx = c.x - eye.x, dz = c.z - eye.z;
      const dist = Math.hypot(dx, dz) - e.radius;
      if (dist > range || Math.abs(c.y - eye.y) > e.height) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / (Math.hypot(dx, dz) || 1);
      if (dot < Math.cos(d.arc)) continue;
      if (dist < bestD) { bestD = dist; best = e; }
    }
    if (best) {
      const c = best.center(new THREE.Vector3());
      // Normal enemies: always a one-hit kill. Boss: a big chunk of its health.
      const dmg = best.type === 'boss' ? best.maxHp * (heavy ? d.heavyBossFrac : d.bossFrac) : Math.max(d.damage, best.hp + 1);
      game.hitEnemy(best, dmg, false, c, 'knife');
      game.effects.impact(c, null, best.def.color);
    }
  }

  // Instant bullet: ray from the camera; hits enemies or the world.
  hitscan(origin, dir, d, id) {
    const game = this.game;
    const rc = this.raycaster;
    rc.set(origin, dir);
    rc.far = d.range;
    const targets = game.enemies.getHitMeshes().concat(game.world.solidMeshes);
    const hits = rc.intersectObjects(targets, false);
    // the floor (y = 0) as a simple plane
    let floorT = dir.y < 0 ? -origin.y / dir.y : Infinity;
    let pierce = d.pierce || 1;
    const already = new Set();
    let end = null;
    for (const h of hits) {
      if (h.distance > floorT) break;
      const e = h.object.userData.enemy;
      if (e) {
        if (already.has(e) || !e.alive) continue;
        already.add(e);
        const head = !!h.object.userData.head;
        game.hitEnemy(e, d.damage * (head ? d.headMult : 1), head, h.point, id);
        game.effects.impact(h.point, null, e.def.color);
        if (--pierce <= 0) { end = h.point; break; }
      } else {
        end = h.point;
        game.effects.impact(h.point, h.face ? h.face.normal : null);
        break;
      }
    }
    if (!end) {
      if (floorT < d.range) { end = origin.clone().addScaledVector(dir, floorT); game.effects.impact(end, _up.set(0, 1, 0)); }
      else end = origin.clone().addScaledVector(dir, Math.min(d.range, 120));
    }
    // Tracer starts near the gun, not the eye.
    const start = this.muzzleWorld();
    game.effects.tracer(start, end, id === 'sniper' ? 0x8ff8ff : 0xfff1a0);
  }

  /** Approximate world position of the gun barrel. */
  muzzleWorld() {
    const cam = this.game.camera;
    if (this.scoped) return cam.position.clone().addScaledVector(_up, -0.15).addScaledVector(_dir, 0.5);
    return cam.position.clone().addScaledVector(_dir, 0.6).addScaledVector(_right, 0.18 * (1 - this.aimT)).addScaledVector(_up, -0.15);
  }

  // ------------------------------------------------------------------ projectiles
  spawnProjectile(d, id) {
    const game = this.game;
    const pos = this.muzzleWorld();
    const dir = _dir.clone();
    // Aim at what the crosshair points at (corrects for the gun being off-centre).
    const target = game.camera.position.clone().addScaledVector(dir, 40);
    dir.copy(target).sub(pos).normalize();
    let speed = d.speed, damage = d.damage;
    if (id === 'bow') {
      const c = Math.max(0.15, this.charge);
      speed = d.speed + (d.maxSpeed - d.speed) * c;
      damage = d.damage + (d.maxDamage - d.damage) * c * c;
      this.charge = 0;
      this.ammo.bow.mag = 0;
    }
    const mesh = new THREE.Group();
    const G = this.projGeo, Mt = this.projMat;
    if (id === 'rpg') {
      mesh.add(new THREE.Mesh(G.rocketBody, Mt.white));
      const nose = new THREE.Mesh(G.rocketNose, Mt.red); nose.position.z = 0.4; mesh.add(nose);
      const tail = new THREE.Mesh(G.glow, Mt.orange); tail.position.z = -0.35; tail.scale.setScalar(1.4); mesh.add(tail);
    } else if (id === 'grenade') {
      mesh.add(new THREE.Mesh(G.grenade, Mt.green));
    } else {
      mesh.add(new THREE.Mesh(G.arrowShaft, Mt.wood));
      const head = new THREE.Mesh(G.arrowHead, Mt.cyan); head.position.z = 0.42; mesh.add(head);
    }
    mesh.position.copy(pos);
    mesh.lookAt(_v.copy(pos).add(dir));
    game.scene.add(mesh);
    this.projectiles.push({ id, d, mesh, pos: pos.clone(), vel: dir.multiplyScalar(speed), life: id === 'grenade' ? d.fuse : 6, damage, stuck: 0 });
  }

  updateProjectiles(dt) {
    const game = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.stuck > 0) { // arrow stuck in a wall: just wait, then vanish
        p.stuck -= dt;
        if (p.stuck <= 0) { game.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
        continue;
      }
      p.life -= dt;
      let done = false;
      // Move in small steps so fast projectiles can't pass through things.
      const steps = Math.ceil(p.vel.length() * dt / 0.4);
      const sdt = dt / steps;
      for (let s = 0; s < steps && !done; s++) {
        p.vel.y -= (p.d.gravity || 0) * sdt;
        const next = _v.copy(p.pos).addScaledVector(p.vel, sdt);
        // enemy hit?
        const e = this.enemyAt(next, p.id === 'bow' ? 0.15 : 0.25);
        if (e) {
          if (p.id === 'bow' || p.d.projectile === 'arrow') {
            const head = next.y > e.pos.y + e.headY;
            game.hitEnemy(e, p.damage * (head ? p.d.headMult : 1), head, next.clone(), 'bow');
            game.effects.impact(next, null, e.def.color);
            done = true;
          } else {
            game.hitEnemy(e, p.damage, false, next.clone(), p.id); // direct hit bonus
            this.explode(next, p.d, p.id);
            done = true;
          }
          break;
        }
        const solid = game.world.pointSolid(next);
        if (solid) {
          if (p.id === 'grenade') {
            // Bounce: figure out which direction we hit and flip that velocity.
            if (solid === 'ground' || next.y <= 0) { p.vel.y = Math.abs(p.vel.y) * p.d.bounce; p.vel.x *= 0.7; p.vel.z *= 0.7; next.y = 0.12; }
            else {
              const tx = _v2.set(next.x, p.pos.y, p.pos.z);
              if (game.world.pointSolid(tx)) p.vel.x *= -p.d.bounce;
              else if (game.world.pointSolid(_v2.set(p.pos.x, p.pos.y, next.z))) p.vel.z *= -p.d.bounce;
              else p.vel.y *= -p.d.bounce;
              next.copy(p.pos);
            }
            if (p.vel.length() > 2) game.sound.bounce();
          } else if (p.id === 'rpg') {
            this.explode(p.pos, p.d, p.id); done = true; break;
          } else { // arrow sticks in the wall
            p.stuck = 4; p.pos.copy(next); p.mesh.position.copy(next); done = false; break;
          }
        }
        p.pos.copy(next);
      }
      if (p.stuck > 0) continue;
      if (!done && p.life <= 0) {
        if (p.id === 'grenade') this.explode(p.pos, p.d, p.id);
        done = true;
      }
      if (done) { game.scene.remove(p.mesh); this.projectiles.splice(i, 1); continue; }
      p.mesh.position.copy(p.pos);
      if (p.id !== 'grenade') p.mesh.lookAt(_v.copy(p.pos).add(p.vel));
      else p.mesh.rotation.x += dt * 10;
      // trails
      const fx = game.effects;
      if (p.id === 'rpg') {
        fx.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.35, 0xffa040, 0, 2);
        fx.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 0.5, 0.5, (Math.random() - 0.5) * 0.5, 0.9, 0x444455, -0.5, 1);
      } else if (p.id === 'grenade') {
        if (Math.random() < 0.6) fx.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.3, 0x7dff3a, 0, 0);
      } else if (Math.random() < 0.7) fx.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.25, 0x29f0ff, 0, 0);
    }
  }

  // Find an enemy whose body contains point p (cylinder test).
  enemyAt(p, pad) {
    for (const e of this.game.enemies.list) {
      if (!e.alive) continue;
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z, r = e.radius + pad;
      if (dx * dx + dz * dz < r * r && p.y > e.pos.y - pad && p.y < e.pos.y + e.height + pad) return e;
    }
    return null;
  }

  /** Splash damage around pos (rockets & grenades). */
  explode(pos, d, id) {
    const game = this.game;
    const r = d.splashRadius;
    game.effects.explode(pos.clone(), r, id === 'grenade' ? 0x9dff5a : 0xff8a3a);
    game.sound.explosion(id === 'rpg' ? 0.8 : 0.6);
    for (const e of game.enemies.list.slice()) {
      if (!e.alive) continue;
      const c = e.center(_v2);
      const dist = Math.max(0, c.distanceTo(pos) - e.radius);
      if (dist < r) game.hitEnemy(e, d.splash * (1 - (dist / r) * 0.6), false, c.clone(), id, true);
    }
    // You can hurt yourself a bit if you're too close!
    const eye = game.player.eye();
    const pd = Math.min(eye.distanceTo(pos), _v2.copy(game.player.pos).setY(game.player.pos.y + 0.5).distanceTo(pos));
    if (pd < r) game.damagePlayer(d.splash * d.selfDamage * (1 - pd / r), pos, true);
    game.player.shake = Math.max(game.player.shake, Math.max(0, 1 - pd / (r * 4)) * 0.6);
  }

  // ------------------------------------------------------------------ viewmodel animation
  animateViewmodel(dt, input) {
    const m = this.models[this.current], d = this.def, p = this.game.player;
    const ud = m.userData;
    const t = (this.animTime = (this.animTime || 0) + dt);
    const S = this.springs || (this.springs = { swayX: spring(), swayY: spring(), kick: spring(), land: spring(), roll: spring() });

    // --- movement bob: speed-based, bigger when sprinting, tiny when aiming ---
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const speedK = p.onGround ? Math.min(1.3, speed / CONFIG.PLAYER.walkSpeed) : 0;
    this.bobT += dt * speed * 1.55;
    this.bobAmt = (this.bobAmt || 0) + (speedK * 0.014 - (this.bobAmt || 0)) * Math.min(1, dt * 8);
    const bob = this.bobAmt * (1 - this.aimT * 0.85);
    // --- idle breathing ---
    const breath = 1 - Math.min(1, speedK);
    const breathY = Math.sin(t * 1.7) * 0.004 * breath * (1 - this.aimT * 0.8);
    const breathX = Math.sin(t * 0.85) * 0.003 * breath * (1 - this.aimT * 0.8);
    // --- mouse-look sway: the gun lags behind the view (spring) ---
    S.swayX.step(THREE.MathUtils.clamp(-input.lookDX * 0.0009, -0.05, 0.05) * (1 - this.aimT * 0.7), 120, 14, dt);
    S.swayY.step(THREE.MathUtils.clamp(input.lookDY * 0.0009, -0.05, 0.05) * (1 - this.aimT * 0.7), 120, 14, dt);
    // --- recoil kick: impulse into a spring that settles back ---
    if (this.kickV) { S.kick.v += this.kickV; this.kickV = 0; }
    S.kick.step(0, 260, 18, dt);
    this.kick = Math.max(0, this.kick - dt * 5); // (used for crosshair bloom)
    // --- landing dip after a jump ---
    if (p.landImpact) { S.land.v -= Math.min(12, p.landImpact) * 0.06; p.landImpact = 0; }
    S.land.step(0, 140, 12, dt);
    // --- strafe roll ---
    const strafe = p.vel.x * Math.cos(this.game.camera.rotation.y) - p.vel.z * Math.sin(this.game.camera.rotation.y);
    S.roll.step(-strafe * 0.006 * (1 - this.aimT), 90, 14, dt);

    const rest = ud.rest, aim = ud.aim || rest;
    const pos = _v.copy(rest).lerp(aim, this.aimT);
    pos.x += Math.cos(this.bobT * 0.5) * bob + S.swayX.x + breathX;
    pos.y += -Math.abs(Math.sin(this.bobT * 0.5)) * bob * 1.2 + S.swayY.x + breathY + S.land.x;
    pos.z += S.kick.x * 0.012;
    const rr = ud.restRot || { x: 0, y: 0, z: 0 };
    let rx = rr.x + S.kick.x * 0.03 + S.swayY.x * 2 - S.land.x * 2;
    let ry = rr.y + S.swayX.x * 2.5;
    let rz = rr.z * (1 - this.aimT) + S.roll.x + S.swayX.x * 1.5;

    // --- sprint pose ---
    this.sprintK = (this.sprintK || 0) + (((p.sprinting && this.aimT < 0.1 && this.reloadT <= 0) ? 1 : 0) - (this.sprintK || 0)) * Math.min(1, dt * 8);
    pos.x -= this.sprintK * 0.04; pos.y -= this.sprintK * 0.03; ry += this.sprintK * 0.55; rz -= this.sprintK * 0.25;

    // --- reload: lower + tilt, magazine out and back in, rack at the end ---
    if (ud.mag) ud.mag.position.copy(ud.magBase), ud.mag.rotation.z = 0, ud.mag.visible = true;
    if (this.reloadT > 0 && d.reload > 0) {
      const r = 1 - this.reloadT / d.reload;                  // 0 -> 1 over the reload
      const env = smooth(r / 0.18) * (1 - smooth((r - 0.82) / 0.18));
      pos.y -= env * 0.05; pos.x -= env * 0.03; rz += env * 0.38; rx -= env * 0.08; ry -= env * 0.15;
      if (ud.mag) {
        const out = smooth((r - 0.2) / 0.2) * (1 - smooth((r - 0.5) / 0.22));
        ud.mag.position.y = ud.magBase.y - out * 0.28;
        ud.mag.rotation.z = out * 0.4;
        ud.mag.visible = out < 0.95;
        if (r > 0.42 && r < 0.48 && !this.magSound) { this.magSound = true; this.game.sound.reload(); }
      }
      if (ud.drum) ud.drum.rotation.y = smooth((r - 0.25) / 0.5) * Math.PI * 2; // spin the drum
      if (this.current === 'rpg') {       // new rocket slides into the front of the tube
        ud.loaded.visible = r > 0.35;
        ud.loaded.position.z = -(1 - smooth((r - 0.35) / 0.35)) * 0.35;
        rx -= env * 0.25;
      }
      const rack = Math.max(0, 1 - Math.abs(r - 0.86) / 0.05);  // little "slide rack" bump
      pos.z += rack * 0.025; rx += rack * 0.08;
    } else {
      this.magSound = false;
      if (this.current === 'rpg') { ud.loaded.visible = this.ammo.rpg.mag > 0; ud.loaded.position.z = 0; }
    }

    // --- equip / draw animation (ease-out-back from below) ---
    if (this.swapT > 0) {
      const e = easeOutBack(1 - this.swapT / SWAP_TIME), k = 1 - e;
      pos.y -= k * 0.32; pos.x += k * 0.05; rx -= k * 0.9; rz += k * 0.45;
    }

    // --- inspect (Y) ---
    if (this.inspectT > 0) {
      const q = 1 - this.inspectT / INSPECT_TIME;
      const env = smooth(q / 0.2) * (1 - smooth((q - 0.8) / 0.2));
      if (this.current === 'knife') {
        ry += env * 0.9; rx -= env * 0.3;
        rz += smooth((q - 0.3) / 0.35) * Math.PI * 2 * (q < 0.95 ? 1 : 1);   // flip the knife
      } else {
        ry += env * (1.1 + Math.sin(q * Math.PI * 2) * 0.25); rz += env * 0.55;
        pos.x -= env * 0.09; pos.y += env * 0.03; pos.z += env * 0.04;
      }
    }

    // --- knife slash arcs (alternating) and heavy stab ---
    if (this.current === 'knife' && this.swingT > 0) {
      this.swingT -= dt;
      const q = 1 - Math.max(0, this.swingT) / this.swingDur;
      if (this.swingHeavy) {
        const wind = smooth(q / 0.35), thrust = smooth((q - 0.35) / 0.2), back = smooth((q - 0.65) / 0.35);
        const f = wind * (1 - thrust) * 0.08 - thrust * (1 - back) * 0.28;
        pos.z += f; pos.y += thrust * (1 - back) * 0.03; rx += wind * 0.4 * (1 - thrust) - thrust * (1 - back) * 0.6;
        pos.x -= thrust * (1 - back) * 0.12;
      } else {
        const side = this.swingSide;
        const arc = Math.sin(q * Math.PI);               // out and back
        const sweep = easeInOut(q) * 2 - 1;              // -1 -> 1 across the screen
        pos.x += -side * sweep * 0.18 * arc - 0.05 * arc;
        pos.y += arc * 0.05 - Math.abs(sweep) * 0.02 * arc;
        pos.z -= arc * 0.12;
        ry += side * sweep * 1.0 * arc; rz += side * arc * 0.8; rx -= arc * 0.3;
      }
    }

    m.position.copy(pos);
    m.rotation.set(rx, ry, rz);

    // Bow: string/arrow follow the draw; a new arrow is nocked from below.
    if (this.current === 'bow') {
      const has = this.ammo.bow.mag > 0;
      if (has && !this.hadArrow) this.nockT = 0.3;
      this.hadArrow = has;
      setBowDraw(m, this.charge, has);
      if (this.nockT > 0) { this.nockT -= dt; ud.arrow.position.y = -Math.max(0, this.nockT / 0.3) * 0.15; ud.arrow.rotation.x = Math.max(0, this.nockT / 0.3) * 0.5; }
      else { ud.arrow.position.y = 0; ud.arrow.rotation.x = 0; }
      m.position.z += this.charge * 0.05;
    }
    // Hide the gun when looking through the sniper scope.
    m.visible = !this.scoped;

    this.flashT -= dt;
    this.flashMesh.visible = this.flashT > 0;
    if (this.flashMesh.visible) this.flashMesh.rotation.z = Math.random() * 3;
  }
}

// ---- small animation helpers ----
// A damped spring: x follows a target with a little overshoot (feels "physical").
function spring() {
  return { x: 0, v: 0, step(target, k, damp, dt) { this.v += ((target - this.x) * k - this.v * damp) * dt; this.x += this.v * dt; } };
}
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
