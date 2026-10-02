/* =========================================================================
   world.js — the shared "engine" part of the arena.
   It sets up lights from the map's colour palette, keeps the collision
   shapes, and provides helper functions (addBox, addPillar, sky, floor...)
   that the map files in js/maps/ use to build their own layout.
   The radio tower and the market kiosk are added to EVERY map here.
   ========================================================================= */
import * as THREE from '../lib/three.module.js';
import { CONFIG } from './config.js';

// Make a texture by drawing on a 2D canvas (no image files needed).
export function canvasTexture(w, h, draw, repeatX = 1, repeatY = repeatX) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

// Default palette — each map overrides what it wants.
const DEFAULT_PALETTE = {
  background: 0x0b0820, fog: 0x1b1440, fogDensity: 0.011,
  hemiSky: 0x8f86ff, hemiGround: 0x2a1830, hemiIntensity: 1.4,
  ambient: 0x404070, ambientIntensity: 0.5,
  sun: 0xc8d6ff, sunIntensity: 2.4, sunPosition: [-30, 55, -25],
  tower: 0x29f0ff, beacon: 0xff3d6a, kiosk: 0xffc23d,
  exposure: 1.1,
};

export class World {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.palette = { ...DEFAULT_PALETTE, ...(map.palette || {}) };
    this.halfX = map.halfX || CONFIG.ARENA_HALF;   // playable area: -halfX..halfX
    this.halfZ = map.halfZ || CONFIG.ARENA_HALF;   //                -halfZ..halfZ
    this.boxes = [];        // axis-aligned box colliders {minX,maxX,minZ,maxZ,bottom,top}
    this.circles = [];      // round colliders {x,z,r,bottom,top}
    this.solidMeshes = [];  // meshes that stop bullets (raycasting)
    this.updaters = [];     // functions called every frame (animated map bits)
    this.time = 0;
    this.rings = [];
    this.kioskPos = new THREE.Vector3(...(map.kiosk || CONFIG.KIOSK.position));
    this.playerSpawn = new THREE.Vector3(...(map.playerSpawn || [0, 0, 10]));

    this.setupLights();
    map.build(this, THREE);       // <- the map file builds sky, floor, walls, cover
    this.buildTower();
    this.buildKiosk();
  }

  // ------------------------------------------------------------------ lights
  setupLights() {
    const P = this.palette, scene = this.scene;
    scene.background = new THREE.Color(P.background);
    scene.fog = new THREE.FogExp2(P.fog, P.fogDensity);
    // The NUMBER of lights is the same on every map and never changes during
    // play (changing it makes three.js recompile shaders = stutter).
    this.hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, P.hemiIntensity);
    scene.add(this.hemi);
    scene.add(new THREE.AmbientLight(P.ambient, P.ambientIntensity));
    const sun = new THREE.DirectionalLight(P.sun, P.sunIntensity);
    sun.position.set(...P.sunPosition);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = Math.max(this.halfX, this.halfZ) + 6;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 200 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    this.sun = sun;
  }

  // ------------------------------------------------------------------ helpers for map files
  /** Standard material shortcut. glow = emissive colour (bloom makes it shine). */
  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, ...opts });
  }
  glow(color, intensity = 2.5) {
    return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
  }

  /** Add any mesh as pure decoration (no collision). */
  decor(mesh, shadows = true) {
    if (shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
    this.scene.add(mesh);
    return mesh;
  }

  /** Solid box: added to the scene AND registered for collision + bullets.
      rotY must be a multiple of 90° for correct collision. */
  addBox(x, z, w, h, d, material, y = 0, rotY = 0, collide = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    if (collide) {
      const swap = Math.abs(Math.sin(rotY)) > 0.5;
      const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
      this.boxes.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, bottom: y, top: y + h });
      this.solidMeshes.push(m);
    }
    return m;
  }

  /** Round solid thing (pillar, rock, tree trunk). mesh is optional custom geometry. */
  addPillar(x, z, r, h, material, mesh = null, y = 0) {
    const m = mesh || new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), material);
    if (!mesh) m.position.set(x, y + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    this.circles.push({ x, z, r, bottom: y, top: y + h });
    this.solidMeshes.push(m);
    return m;
  }

  /** Register an invisible collider (for decorations made of several parts). */
  addCollider(x, z, w, d, h, y = 0) {
    this.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, bottom: y, top: y + h });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, y + h / 2, z);
    this.scene.add(m); this.solidMeshes.push(m);
  }

  /** Gradient sky dome. colors = [horizon, middle, top]. */
  sky(horizon, mid, top, brightness = 0.85) {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) },
        horizon: { value: new THREE.Color(horizon) }, bright: { value: brightness } },
      vertexShader: `varying vec3 vPos; void main(){ vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform float bright; varying vec3 vPos;
        void main(){ float h = vPos.y;
          vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.2, h));
          c = mix(c, top, smoothstep(0.2, 0.75, h));
          gl_FragColor = vec4(c * bright, 1.0); }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), mat);
    this.scene.add(m);
    return m;
  }

  /** Star field. full = stars all around (space), otherwise upper half only. */
  stars(count = 1500, full = false, size = 1.6) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = full ? Math.acos(Math.random() * 2 - 1) : Math.random() * 0.48 * Math.PI + 0.03;
      pos[i * 3] = Math.cos(u) * Math.sin(v) * 380;
      pos[i * 3 + 1] = Math.cos(v) * 380;
      pos[i * 3 + 2] = Math.sin(u) * Math.sin(v) * 380;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
    this.scene.add(pts);
    return pts;
  }

  /** Moon (or sun) disc in the sky. */
  moon(color, x, y, z, r = 14) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color, fog: false }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0);
    this.scene.add(m);
    return m;
  }

  /** Floor plane covering the playable area. texture = a canvasTexture (optional). */
  floor(material, extra = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry((this.halfX + extra) * 2, (this.halfZ + extra) * 2), material);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  /** Four walls around the playable area, with an optional glowing trim strip. */
  boundaryWalls(material, height = 5, trimMaterial = null, thickness = 1.2) {
    const hx = this.halfX, hz = this.halfZ, T = thickness;
    const sides = [[0, -hz - T / 2, hx * 2 + T * 2, T], [0, hz + T / 2, hx * 2 + T * 2, T],
                   [-hx - T / 2, 0, T, hz * 2], [hx + T / 2, 0, T, hz * 2]];
    for (const [x, z, w, d] of sides) {
      this.addBox(x, z, w, height, d, material);
      if (trimMaterial) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.16, d + 0.02), trimMaterial);
        strip.position.set(x, height - 0.4, z); this.scene.add(strip);
      }
    }
  }

  /** Wooden/metal crate with a painted frame texture. */
  crateMaterial(base, edge) {
    const tex = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.fillStyle = edge; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12); g.fillRect(0, 0, 12, h); g.fillRect(w - 12, 0, 12, h);
      g.strokeStyle = edge; g.lineWidth = 10; g.beginPath(); g.moveTo(12, h - 12); g.lineTo(w - 12, 12); g.stroke();
    });
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  }

  /** Call fn(dt, time) every frame (for waves, flickering lights...). */
  onUpdate(fn) { this.updaters.push(fn); }

  // ------------------------------------------------------------------ tower (shared by all maps)
  buildTower() {
    const P = this.palette;
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3c7, roughness: 0.4, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x252640, roughness: 0.5, metalness: 0.4 });
    this.towerGlowMat = this.glow(P.tower, 3);
    this.beaconMat = this.glow(P.beacon, 4);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 0.3, 8), dark);
    base.position.y = 0.15; base.receiveShadow = true; base.castShadow = true; g.add(base);
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.06, 6, 48), this.towerGlowMat);
    baseRing.rotation.x = Math.PI / 2; baseRing.position.y = 0.31; g.add(baseRing);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 2.4, 8), metal);
    core.position.y = 1.6; core.castShadow = true; g.add(core);
    const coreGlow = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.25, 8), this.towerGlowMat);
    coreGlow.position.y = 2.3; g.add(coreGlow);

    const H = this.map.towerHeight || 15;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const bx = Math.cos(a) * 2.0, bz = Math.sin(a) * 2.0;
      // A leg goes from a wide point on the ground to a narrow point at the top.
      const bottom = new THREE.Vector3(bx, 0, bz), top = new THREE.Vector3(bx * 0.15, H, bz * 0.15);
      const dir = top.clone().sub(bottom);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, dir.length(), 0.22), metal);
      leg.position.copy(bottom).addScaledVector(dir, 0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      leg.castShadow = true;
      g.add(leg);
    }
    let k = 0;
    for (let y = 3; y < H; y += 2.4, k++) {
      const r = 2.0 * 0.95 * (1 - y / H) + 0.3;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, 0.07, 4, 4), k % 2 ? metal : this.towerGlowMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = y;
      g.add(ring);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, H + 3, 6), this.towerGlowMat);
    mast.position.y = (H + 3) / 2; g.add(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), metal);
    dish.position.set(0, H - 2, 0); dish.rotation.x = -Math.PI / 2.5;
    const dishPivot = new THREE.Group(); dishPivot.add(dish); dish.position.z = 0.6; dishPivot.position.y = 0; g.add(dishPivot);
    this.dishPivot = dishPivot;
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), this.beaconMat);
    this.beacon.position.y = H + 3.2; g.add(this.beacon);

    this.scene.add(g);
    this.tower = g;
    this.towerTop = new THREE.Vector3(0, H + 3, 0);
    this.towerAim = new THREE.Vector3(0, 1.6, 0); // where enemies aim their shots
    this.circles.push({ x: 0, z: 0, r: CONFIG.TOWER.radius, bottom: 0, top: H + 3, isTower: true });
    this.circles.push({ x: 0, z: 0, r: 3.5, bottom: 0, top: 0.3 }); // low base you can step onto
    const hitCyl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, H, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hitCyl.position.y = H / 2; this.scene.add(hitCyl); this.solidMeshes.push(hitCyl);

    // Signal rings that pulse out from the top of the tower.
    const ringGeo = new THREE.TorusGeometry(1, 0.05, 6, 64);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: P.tower, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      const r = new THREE.Mesh(ringGeo, mat);
      r.rotation.x = Math.PI / 2;
      r.userData.phase = i / 3;
      this.scene.add(r);
      this.rings.push(r);
    }
    this.towerLight = new THREE.PointLight(P.tower, 60, 32, 1.6);
    this.towerLight.position.set(0, 4, 0);
    this.scene.add(this.towerLight);
  }

  // ------------------------------------------------------------------ kiosk (shared by all maps)
  buildKiosk() {
    const P = this.palette;
    const { x: kx, z: kz } = this.kioskPos;
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x2e2c4f, roughness: 0.5, metalness: 0.3 });
    const gold = this.glow(P.kiosk, 1.3);
    const screenTex = canvasTexture(256, 128, (c, w, h) => {
      const grd = c.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#ff4f6d'); grd.addColorStop(1, '#7a1a52');
      c.fillStyle = grd; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center';
      c.fillText('MARKET', w / 2, 62);
      c.font = 'bold 24px sans-serif'; c.fillText('PRESS [B]', w / 2, 102);
    });
    const screen = new THREE.MeshStandardMaterial({ map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.8 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.9), body);
    stand.position.y = 1.1; stand.castShadow = true; g.add(stand);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), screen);
    scr.position.set(0, 1.65, 0.46); g.add(scr);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.6), gold);
    counter.position.set(0, 1.05, 0.6); g.add(counter);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.8), body);
    roof.position.set(0, 2.9, 0.3); roof.castShadow = true; g.add(roof);
    const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.06, 1.82), gold);
    roofTrim.position.set(0, 2.82, 0.3); g.add(roofTrim);
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.9, 0.1), body);
      pole.position.set(sx * 1.1, 1.45, 1.1); g.add(pole);
    }
    this.kioskHolo = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), gold);
    this.kioskHolo.position.set(0, 3.5, 0.3); g.add(this.kioskHolo);
    g.position.set(kx, 0, kz);
    g.rotation.y = Math.atan2(-kx, -kz); // screen (+Z side) faces the tower
    this.scene.add(g);
    this.kiosk = g;
    this.boxes.push({ minX: kx - 0.9, maxX: kx + 0.9, minZ: kz - 0.9, maxZ: kz + 0.9, bottom: 0, top: 2.2 });
    this.solidMeshes.push(stand);
    this.kioskLight = new THREE.PointLight(P.kiosk, 8, 9, 1.8);
    this.kioskLight.position.set(kx, 2.5, kz);
    this.scene.add(this.kioskLight);
  }

  // ------------------------------------------------------------------ per-frame update
  update(dt, towerHpFrac) {
    this.time += dt;
    const t = this.time;
    for (const r of this.rings) {
      const p = (t * 0.45 + r.userData.phase) % 1;
      r.position.set(0, this.towerTop.y - 1 + p * 3, 0);
      const s = 0.6 + p * 5.5;
      r.scale.set(s, s, s);
      r.material.opacity = (1 - p) * 0.6;
      // Rings turn red when the tower is badly damaged.
      r.material.color.setHex(towerHpFrac < 0.3 ? 0xff3d3d : this.palette.tower);
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    this.towerGlowMat.emissiveIntensity = 1.2 + pulse * 1.3;
    this.beaconMat.emissiveIntensity = (Math.sin(t * 6) > 0 ? 6 : 1.5);
    this.towerLight.intensity = 35 + pulse * 25;
    this.dishPivot.rotation.y = t * 0.6;
    this.kioskHolo.rotation.y = t * 2;
    this.kioskHolo.position.y = 3.5 + Math.sin(t * 2) * 0.12;
    for (const fn of this.updaters) fn(dt, t);
  }

  // ------------------------------------------------------------------ collision helpers
  /* Push a circle (x,z,radius) out of every collider it overlaps.
     feetY/headY let you walk over low things and stand on crates.
     Returns {x, z, hit}. */
  resolveCircle(x, z, radius, feetY = 0, headY = 2) {
    let hit = false;
    for (const b of this.boxes) {
      if (feetY >= b.top - 0.05 || headY <= b.bottom) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * radius; z = cz + (dz / d) * radius;
        } else {
          const pl = x - b.minX, pr = b.maxX - x, pd = z - b.minZ, pu = b.maxZ - z;
          const m = Math.min(pl, pr, pd, pu);
          if (m === pl) x = b.minX - radius; else if (m === pr) x = b.maxX + radius;
          else if (m === pd) z = b.minZ - radius; else z = b.maxZ + radius;
        }
      }
    }
    for (const c of this.circles) {
      if (feetY >= c.top - 0.05 || headY <= c.bottom) continue;
      const dx = x - c.x, dz = z - c.z;
      const min = radius + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        hit = true;
        const d = Math.sqrt(d2) || 0.001;
        x = c.x + (dx / d) * min; z = c.z + (dz / d) * min;
      }
    }
    // Arena edge: nobody can leave (or fall off the yacht).
    const lx = this.halfX - radius, lz = this.halfZ - radius;
    if (x > lx) { x = lx; hit = true; } if (x < -lx) { x = -lx; hit = true; }
    if (z > lz) { z = lz; hit = true; } if (z < -lz) { z = -lz; hit = true; }
    return { x, z, hit };
  }

  /* Highest surface (ground = 0 or a crate top) under a circle with feet at feetY. */
  groundHeight(x, z, radius, feetY) {
    let h = 0;
    const r = radius * 0.6;
    for (const b of this.boxes) {
      if (b.top > feetY + 0.35) continue;
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) h = Math.max(h, b.top);
    }
    for (const c of this.circles) {
      if (c.top > feetY + 0.35) continue;
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < c.r * c.r) h = Math.max(h, c.top);
    }
    return h;
  }

  /* Is a 3D point inside something solid? Used by rockets/grenades/arrows. */
  pointSolid(p) {
    if (p.y <= 0) return 'ground';
    if (Math.abs(p.x) > this.halfX || Math.abs(p.z) > this.halfZ) return p.y < (this.map.wallHeight || 5) ? 'wall' : null;
    for (const b of this.boxes) {
      if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ && p.y < b.top && p.y > b.bottom) return b;
    }
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      if (p.y < c.top && p.y > c.bottom && dx * dx + dz * dz < c.r * c.r) return c;
    }
    return null;
  }

  /* Spawn point for an enemy: the map's own list, or a random edge point. */
  randomSpawnPoint(radius = 1.2) {
    const list = this.map.spawnPoints;
    for (let tries = 0; tries < 30; tries++) {
      let x, z;
      if (list && list.length) {
        const s = list[Math.floor(Math.random() * list.length)];
        x = s[0] + (Math.random() - 0.5) * 4; z = s[1] + (Math.random() - 0.5) * 4;
      } else {
        // Random point on the edge of the arena rectangle.
        const hx = this.halfX - 2.5, hz = this.halfZ - 2.5;
        const per = 2 * (hx + hz), d = Math.random() * per * 2;
        if (d < hx * 2) { x = -hx + d; z = -hz; }
        else if (d < hx * 2 + hz * 2) { x = hx; z = -hz + (d - hx * 2); }
        else if (d < hx * 4 + hz * 2) { x = hx - (d - hx * 2 - hz * 2); z = hz; }
        else { x = -hx; z = hz - (d - hx * 4 - hz * 2); }
      }
      const res = this.resolveCircle(x, z, radius);
      if ((!res.hit || tries > 25) && Math.hypot(res.x, res.z) > 12) return new THREE.Vector3(res.x, 0, res.z);
    }
    return new THREE.Vector3(0, 0, -this.halfZ + 3);
  }

  /** Free GPU memory when switching maps. */
  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); if (m.emissiveMap) m.emissiveMap.dispose(); m.dispose(); }
      }
    });
  }
}
