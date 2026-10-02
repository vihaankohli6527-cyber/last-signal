/* =========================================================================
   effects.js — visual effects: particles (sparks, death bursts),
   explosions (flash sphere + shockwave ring + light), and bullet tracers.
   Everything uses fixed-size "pools" that are re-used, so no new objects
   are created while playing (that keeps the frame-rate smooth).
   ========================================================================= */
import * as THREE from '../lib/three.module.js';

const MAX_PARTICLES = 1600;

// Soft round dot texture for particles.
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;

    // ---------- particles ----------
    this.p = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.p.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1, grav: 0, drag: 0 });
    }
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(MAX_PARTICLES * 3).fill(-9999);
    this.colArr = new Float32Array(MAX_PARTICLES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); // never culled
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.28, map: dotTexture(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    // ---------- explosions ----------
    this.explosions = [];
    const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    for (let i = 0; i < 8; i++) {
      const ball = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ball.visible = ring.visible = false;
      scene.add(ball, ring);
      this.explosions.push({ ball, ring, t: 1, dur: 0.5, radius: 4 });
    }
    // One shared light for explosion flashes (light count never changes).
    this.flash = new THREE.PointLight(0xffa040, 0, 30, 1.5);
    scene.add(this.flash);

    // ---------- tracers ----------
    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    tracerGeo.translate(0, 0, 0.5); // so it starts at its origin and extends along +Z
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.tracers.push({ m, t: 0, dur: 0.07 });
    }
    this.tracerNext = 0;

    // ---------- bullet-hole decals (ring buffer, oldest gets reused) ----------
    this.decals = [];
    const holeMat = new THREE.MeshStandardMaterial({ map: holeTexture(), transparent: true, depthWrite: false, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const holeGeo = new THREE.PlaneGeometry(0.14, 0.14);
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(holeGeo, holeMat.clone()); m.visible = false; m.renderOrder = 1;
      scene.add(m); this.decals.push({ m, t: 0 });
    }
    this.decalNext = 0;

    // ---------- dust puffs (soft, normally blended sprites) ----------
    this.puffs = [];
    const smoke = dotTexture();
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: 0x9a948a, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; scene.add(s); this.puffs.push({ s, t: 1, vel: new THREE.Vector3() });
    }
    this.puffNext = 0;
  }

  /* Bullet hole stuck to a surface (point + world-space normal). */
  decal(pos, normal) {
    const d = this.decals[this.decalNext]; this.decalNext = (this.decalNext + 1) % this.decals.length;
    d.m.position.copy(pos).addScaledVector(normal, 0.01);
    d.m.lookAt(_v3.copy(d.m.position).add(normal));
    d.m.rotateZ(Math.random() * Math.PI * 2);
    d.m.scale.setScalar(0.7 + Math.random() * 0.6);
    d.m.material.opacity = 1; d.m.visible = true; d.t = 0;
  }

  /* Puff of dust / debris where a bullet hits stone, wood, dirt... */
  dust(pos, normal, color = 0x9a948a) {
    for (let k = 0; k < 2; k++) {
      const p = this.puffs[this.puffNext]; this.puffNext = (this.puffNext + 1) % this.puffs.length;
      p.s.position.copy(pos).addScaledVector(normal, 0.05);
      p.vel.copy(normal).multiplyScalar(0.8 + Math.random()).add(_v3.set((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
      p.s.material.color.setHex(color); p.t = 0; p.dur = 0.6 + Math.random() * 0.4; p.s.visible = true;
    }
    for (let i = 0; i < 5; i++) {  // a few dark chips
      const s = 1.5 + Math.random() * 2.5;
      this.spawn(pos.x, pos.y, pos.z, normal.x * 2 + (Math.random() - 0.5) * s, normal.y * 2 + Math.random() * s, normal.z * 2 + (Math.random() - 0.5) * s, 0.35, 0x3a3630, 14, 0.5);
    }
  }

  /* Spawn one particle. color is a THREE.Color or hex number. */
  spawn(x, y, z, vx, vy, vz, life, color, grav = 9, drag = 1.5) {
    const p = this.p[this.next];
    this.next = (this.next + 1) % MAX_PARTICLES;
    const c = typeof color === 'number' ? _c.setHex(color) : color;
    Object.assign(p, { alive: true, x, y, z, vx, vy, vz, life, max: life, r: c.r, g: c.g, b: c.b, grav, drag });
  }

  /* A burst of particles flying out in all directions. */
  burst(pos, color, count = 30, speed = 6, life = 0.7, grav = 9) {
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 2 - 1);
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(pos.x, pos.y, pos.z, Math.sin(v) * Math.cos(u) * s, Math.abs(Math.cos(v)) * s * 0.8 + 1, Math.sin(v) * Math.sin(u) * s,
        life * (0.5 + Math.random() * 0.5), color, grav);
    }
  }

  /* Little sparks where a bullet hits something. */
  impact(pos, normal, color = 0xffd27a) {
    for (let i = 0; i < 8; i++) {
      const s = 2 + Math.random() * 4;
      this.spawn(pos.x, pos.y, pos.z,
        (normal ? normal.x * 3 : 0) + (Math.random() - 0.5) * s, (normal ? normal.y * 3 : 0) + Math.random() * s, (normal ? normal.z * 3 : 0) + (Math.random() - 0.5) * s,
        0.25 + Math.random() * 0.2, color, 12);
    }
  }

  /* Big explosion: fire ball, shockwave ring, sparks, smoke and a light flash. */
  explode(pos, radius = 5, color = 0xffa040) {
    const e = this.explosions.find((x) => x.t >= 1) || this.explosions[0];
    e.t = 0; e.radius = radius;
    e.ball.position.copy(pos); e.ring.position.set(pos.x, Math.max(0.05, pos.y - 0.3), pos.z);
    e.ball.material.color.setHex(color);
    e.ball.visible = e.ring.visible = true;
    this.burst(pos, color, 60, radius * 2.2, 0.9, 6);
    this.burst(pos, 0xfff4c0, 30, radius * 2, 0.5, 4);
    for (let i = 0; i < 25; i++) // dark smoke puffs (dim colour = barely-visible with additive blending)
      this.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 1.5, 0x553322, -1, 1);
    this.flash.position.copy(pos);
    this.flash.color.setHex(color);
    this.flash.intensity = 70;
  }

  /* Bullet tracer from a to b. */
  tracer(a, b, color = 0xfff1a0) {
    const t = this.tracers[this.tracerNext];
    this.tracerNext = (this.tracerNext + 1) % this.tracers.length;
    t.m.position.copy(a);
    t.m.lookAt(b);
    t.m.scale.set(1, 1, a.distanceTo(b));
    t.m.material.color.setHex(color);
    t.m.visible = true;
    t.t = 0;
  }

  update(dt) {
    // particles
    const P = this.p, pa = this.posArr, ca = this.colArr;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = P[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; pa[i * 3 + 1] = -9999; ca[i * 3] = ca[i * 3 + 1] = ca[i * 3 + 2] = 0; continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const f = p.life / p.max;
      pa[i * 3] = p.x; pa[i * 3 + 1] = p.y; pa[i * 3 + 2] = p.z;
      ca[i * 3] = p.r * f; ca[i * 3 + 1] = p.g * f; ca[i * 3 + 2] = p.b * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    // explosions
    for (const e of this.explosions) {
      if (e.t >= 1) continue;
      e.t = Math.min(1, e.t + dt / e.dur);
      const s = e.radius * (0.2 + Math.pow(e.t, 0.4) * 0.5);
      e.ball.scale.setScalar(s);
      e.ball.material.opacity = (1 - e.t) * (1 - e.t) * 0.75;
      e.ring.scale.setScalar(e.radius * (0.2 + e.t * 1.3));
      e.ring.material.opacity = (1 - e.t);
      if (e.t >= 1) e.ball.visible = e.ring.visible = false;
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 250);

    // decals fade out after ~10 s
    for (const d of this.decals) {
      if (!d.m.visible) continue;
      d.t += dt;
      if (d.t > 10) { d.m.material.opacity = Math.max(0, 1 - (d.t - 10) / 2); if (d.t > 12) d.m.visible = false; }
    }
    // dust puffs grow and fade
    for (const p of this.puffs) {
      if (!p.s.visible) continue;
      p.t += dt;
      const f = p.t / p.dur;
      if (f >= 1) { p.s.visible = false; continue; }
      p.s.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(1 - dt * 2.5);
      p.s.scale.setScalar(0.25 + f * 0.9);
      p.s.material.opacity = (1 - f) * 0.55;
    }

    // tracers
    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.t += dt;
      t.m.material.opacity = Math.max(0, 1 - t.t / t.dur);
      if (t.t >= t.dur) t.m.visible = false;
    }
  }
}
const _c = new THREE.Color(), _v3 = new THREE.Vector3();

// Bullet hole: dark centre, scorched ring, soft transparent edge.
function holeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(5,5,5,1)'); grd.addColorStop(0.18, 'rgba(10,10,10,1)');
  grd.addColorStop(0.3, 'rgba(40,36,32,0.85)'); grd.addColorStop(0.6, 'rgba(30,28,25,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(15,15,15,0.6)'; g.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; g.beginPath(); g.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6); g.lineTo(32 + Math.cos(a) * (12 + Math.random() * 12), 32 + Math.sin(a) * (12 + Math.random() * 12)); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
