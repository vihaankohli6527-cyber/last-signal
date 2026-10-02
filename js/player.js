/* =========================================================================
   player.js — first-person movement: WASD, sprint, jump, gravity,
   collision with cover, standing on crates, health + armour, recoil and
   camera shake. Mouse-look itself is done by PointerLockControls (main.js).
   ========================================================================= */
import * as THREE from '../lib/three.module.js';
import { Sound } from './audio.js?v=5da3e5f8d0';
import { CONFIG } from './config.js?v=5da3e5f8d0';

const P = CONFIG.PLAYER;
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _eye = new THREE.Vector3();

export class Player {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';   // yaw first, then pitch: standard FPS camera
    this.pos = new THREE.Vector3();  // position of the FEET
    this.vel = new THREE.Vector3();
    this.reset(new THREE.Vector3(0, 0, 10));
  }

  reset(spawn, keepStats = false) {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    if (!keepStats) {
      this.maxHp = P.maxHp;
      this.hp = this.maxHp;
      this.armour = 0;
    }
    this.alive = true;
    this.onGround = true;
    this.moving = false;
    this.sprinting = false;
    this.recoil = 0;      // extra pitch from recoil that slowly recovers
    this.shake = 0;
    this.landImpact = 0;
    this.crouched = false; this.crouchK = 0; this.eyeHeight = P.height;
    this.slideT = 0; this.slideCd = 0; this.slideK = 0; this.slideDir = new THREE.Vector3(); this.slideRoll = 0;
    this.prevCrouchKey = false; this.slideBuffer = 0; this.coyote = 0; this.slideStartSpeed = P.slideSpeed;
    this.punchP = { x: 0, v: 0 }; this.punchR = { x: 0, v: 0 }; this.punchApplied = 0;
    this.syncCamera();
    // Face the tower: yaw angle from our position toward (0,0).
    this.camera.rotation.set(0, Math.atan2(this.pos.x, this.pos.z), 0);
  }

  /** World position of the eyes (camera). */
  eye(out = _eye) { return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }

  get sliding() { return this.slideT > 0; }

  /** Is there room to stand up here? (checks for low cover over our head) */
  canStand(world) {
    return !world.resolveCircle(this.pos.x, this.pos.z, P.radius * 0.8, this.pos.y + P.crouchHeight + 0.1, this.pos.y + P.height + 0.15).hit;
  }

  addRecoil(amount) {
    this.camera.rotation.x = Math.min(Math.PI / 2 - 0.01, this.camera.rotation.x + amount);
    this.recoil += amount;
  }

  /** Camera punch (recoil / melee feel): an impulse into springs that settle back. */
  punch(pitch, roll) {
    this.punchP.v += pitch * 30;
    this.punchR.v += roll * 30;
  }

  updatePunch(dt) {
    for (const s of [this.punchP, this.punchR]) {
      s.v += (-s.x * 220 - s.v * 20) * dt;
      s.x += s.v * dt;
    }
    const cam = this.camera;
    cam.rotation.x += this.punchP.x - this.punchApplied;   // apply only the change
    this.punchApplied = this.punchP.x;
    cam.rotation.z = this.punchR.x + this.slideRoll;
  }

  /** Apply damage. Armour soaks part of it. Returns damage actually taken by HP. */
  takeDamage(amount) {
    if (!this.alive) return 0;
    let toHp = amount;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, amount * P.armourAbsorb);
      this.armour -= absorbed;
      toHp -= absorbed;
    }
    this.hp -= toHp;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return toHp;
  }

  update(dt, keys, world) {
    this.lastDt = dt;
    const cam = this.camera;
    // Directions on the ground plane from where the camera looks.
    _fwd.set(-Math.sin(cam.rotation.y), 0, -Math.cos(cam.rotation.y));
    _right.set(-_fwd.z, 0, _fwd.x);
    const K = CONFIG.KEYS, down = (list) => list.some((c) => keys[c]);
    let mx = 0, mz = 0;
    const fwdKey = down(K.forward);
    if (fwdKey) { mx += _fwd.x; mz += _fwd.z; }
    if (down(K.back)) { mx -= _fwd.x; mz -= _fwd.z; }
    if (down(K.right)) { mx += _right.x; mz += _right.z; }
    if (down(K.left)) { mx -= _right.x; mz -= _right.z; }
    const len = Math.hypot(mx, mz);
    this.moving = len > 0;
    const crouchKey = down(K.crouch);
    // taps are latched by the keydown handler so a quick press is never missed at low FPS
    const crouchPressed = (crouchKey && !this.prevCrouchKey) || this.crouchTap;
    const jumpWanted = down(K.jump) || this.jumpTap;
    this.crouchTap = false; this.jumpTap = false;
    this.prevCrouchKey = crouchKey;
    const wantSprint = this.moving && down(K.sprint) && !this.aiming && fwdKey;

    // --- slide: press C while sprinting (or already moving forward fast) ---
    // The press is buffered for a moment so slightly early/late taps still count.
    this.slideCd = Math.max(0, this.slideCd - dt);
    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);
    this.slideBuffer = crouchPressed ? 0.2 : Math.max(0, (this.slideBuffer || 0) - dt);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const fwdSpeed = this.vel.x * _fwd.x + this.vel.z * _fwd.z;      // speed along where we look
    const fastForward = fwdSpeed > P.sprintSpeed * 0.8 || (wantSprint && hSpeed > P.walkSpeed * 0.5);
    const groundedish = this.onGround || this.coyote > 0;             // tiny bumps don't block it
    if (this.slideBuffer > 0 && fastForward && groundedish && this.slideCd <= 0 && !this.sliding) {
      this.slideBuffer = 0;
      this.slideT = P.slideTime;
      this.slideCd = P.slideTime + P.slideCooldown;
      this.slideDir.set(this.vel.x, 0, this.vel.z);
      if (this.slideDir.lengthSq() < 1) this.slideDir.set(mx, 0, mz);
      this.slideDir.normalize();
      Sound.slide();
      this.punch(-0.03, 0.02);                                         // camera kick as you drop
      this.slideStartSpeed = Math.max(P.slideSpeed, hSpeed * 1.5);     // always a clear burst
    }
    // --- crouch state (can't stand up under low cover) ---
    if (this.sliding || crouchKey) this.crouched = true;
    else if (this.crouched && this.canStand(world)) this.crouched = false;
    this.sprinting = wantSprint && !this.crouched;

    const speed = (this.crouched ? P.crouchSpeed : this.sprinting ? P.sprintSpeed : P.walkSpeed) * (this.aiming ? 0.6 : 1);
    if (len > 0) { mx = mx / len * speed; mz = mz / len * speed; }

    if (this.sliding) {
      this.slideT -= dt;
      const f = Math.max(0, this.slideT / P.slideTime);           // 1 -> 0
      const sp = P.crouchSpeed + (this.slideStartSpeed - P.crouchSpeed) * (f * f * (3 - 2 * f));  // decaying burst
      this.vel.x = this.slideDir.x * sp + mx * 0.15;               // a little steering
      this.vel.z = this.slideDir.z * sp + mz * 0.15;
    } else {
      // Grounded acceleration / deceleration; little control in the air.
      const accel = this.onGround ? (len > 0 ? 10 : 12) : 2;
      const k = Math.min(1, accel * dt);
      this.vel.x += (mx - this.vel.x) * k;
      this.vel.z += (mz - this.vel.z) * k;
    }

    // Jump + gravity (you can jump out of a slide and keep some momentum)
    if (jumpWanted && this.onGround && (this.canStand(world) || !this.crouched)) {
      this.vel.y = P.jumpSpeed; this.onGround = false;
      if (this.sliding) { this.slideT = 0; if (!crouchKey) this.crouched = false; }
    }
    this.vel.y -= P.gravity * dt;

    // Smooth eye height (crouch) + slide dip / tilt.
    this.crouchK += ((this.crouched ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
    this.slideK += ((this.sliding ? 1 : 0) - this.slideK) * Math.min(1, dt * (this.sliding ? 14 : 6));
    this.eyeHeight = P.height + (P.crouchHeight - P.height) * this.crouchK - this.slideK * 0.3;
    this.slideRoll = this.slideK * 0.12;

    // Move horizontally and collide with cover.
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    // (+0.35 = we can step up onto low things like the tower base)
    const res = world.resolveCircle(nx, nz, P.radius, this.pos.y + 0.35, this.pos.y + this.eyeHeight + 0.1);
    this.pos.x = res.x; this.pos.z = res.z;

    // Move vertically and land on the ground or on top of crates.
    this.pos.y += this.vel.y * dt;
    const ground = world.groundHeight(this.pos.x, this.pos.z, P.radius, this.pos.y + Math.max(0, -this.vel.y * dt) );
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -2) this.landImpact = -this.vel.y;
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > ground + 0.05) {
      this.onGround = false;
    }

    // Recoil slowly recovers back down.
    if (this.recoil > 0) {
      const back = Math.min(this.recoil, dt * 0.15 + this.recoil * dt * 4);
      cam.rotation.x -= back; this.recoil -= back;
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.updatePunch(dt);
    this.syncCamera();
  }

  syncCamera() {
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    // Subtle head bob from footsteps (none while sliding or airborne).
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.bobT = (this.bobT || 0) + (this.lastDt || 0) * hs * 1.6;
    const bk = this.onGround && !this.sliding ? Math.min(1, hs / P.sprintSpeed) : 0;
    this.bobK = (this.bobK || 0) + (bk - (this.bobK || 0)) * 0.15;
    this.camera.position.y += Math.sin(this.bobT) * 0.025 * this.bobK;
    if (this.shake > 0) {
      const s = this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
  }
}
