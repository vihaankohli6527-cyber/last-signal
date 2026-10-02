/* =========================================================================
   player.js — first-person movement: WASD, sprint, jump, gravity,
   collision with cover, standing on crates, health + armour, recoil and
   camera shake. Mouse-look itself is done by PointerLockControls (main.js).
   ========================================================================= */
import * as THREE from '../lib/three.module.js';
import { CONFIG } from './config.js';

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
    this.punchP = { x: 0, v: 0 }; this.punchR = { x: 0, v: 0 }; this.punchApplied = 0;
    this.syncCamera();
    // Face the tower: yaw angle from our position toward (0,0).
    this.camera.rotation.set(0, Math.atan2(this.pos.x, this.pos.z), 0);
  }

  /** World position of the eyes (camera). */
  eye(out = _eye) { return out.set(this.pos.x, this.pos.y + P.height, this.pos.z); }

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
    cam.rotation.z = this.punchR.x;
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
    const cam = this.camera;
    // Directions on the ground plane from where the camera looks.
    _fwd.set(-Math.sin(cam.rotation.y), 0, -Math.cos(cam.rotation.y));
    _right.set(-_fwd.z, 0, _fwd.x);
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) { mx += _fwd.x; mz += _fwd.z; }
    if (keys.KeyS || keys.ArrowDown) { mx -= _fwd.x; mz -= _fwd.z; }
    if (keys.KeyD || keys.ArrowRight) { mx += _right.x; mz += _right.z; }
    if (keys.KeyA || keys.ArrowLeft) { mx -= _right.x; mz -= _right.z; }
    const len = Math.hypot(mx, mz);
    this.moving = len > 0;
    this.sprinting = this.moving && (keys.ShiftLeft || keys.ShiftRight) && !this.aiming && (keys.KeyW || keys.ArrowUp);
    const speed = (this.sprinting ? P.sprintSpeed : P.walkSpeed) * (this.aiming ? 0.6 : 1);
    if (len > 0) { mx = mx / len * speed; mz = mz / len * speed; }

    // Smooth acceleration on the ground, less control in the air.
    const accel = this.onGround ? 14 : 3;
    const k = Math.min(1, accel * dt);
    this.vel.x += (mx - this.vel.x) * k;
    this.vel.z += (mz - this.vel.z) * k;

    // Jump + gravity
    if (keys.Space && this.onGround) { this.vel.y = P.jumpSpeed; this.onGround = false; }
    this.vel.y -= P.gravity * dt;

    // Move horizontally and collide with cover.
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    // (+0.35 = we can step up onto low things like the tower base)
    const res = world.resolveCircle(nx, nz, P.radius, this.pos.y + 0.35, this.pos.y + P.height);
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
    this.camera.position.set(this.pos.x, this.pos.y + P.height, this.pos.z);
    if (this.shake > 0) {
      const s = this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
  }
}
