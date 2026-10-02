/* Map: GRAVEYARD — an old cemetery at midnight.
   Rows of tombstones, dead trees, mausoleums, an iron fence, moonlight and green mist. */
import { canvasTexture } from '../world.js?v=e898eff5dd';

export const MAP = {
  id: 'graveyard',
  name: 'Graveyard',
  desc: 'Moonlit cemetery. Tombstones, dead trees and a creeping green mist.',
  mood: 'Spooky · Low visibility', difficulty: 'Hard',   // shown on the map select screen
  card: ['#0b1a14', '#7dff9a'],
  halfX: 40, halfZ: 40, wallHeight: 2.6,
  playerSpawn: [0, 0, 10],
  palette: {
    background: 0x05080a, fog: 0x1a3328, fogDensity: 0.022,
    hemiSky: 0x7f9fc0, hemiGround: 0x10180f, hemiIntensity: 1.1,
    ambient: 0x305040, ambientIntensity: 0.5,
    sun: 0xc0d4ff, sunIntensity: 2.2, sunPosition: [-40, 50, -30],
    tower: 0x5cffb0, beacon: 0xff3d3d, kiosk: 0xffc23d,
  },

  build(w, THREE) {
    w.sky(0x1f4a3a, 0x0c1a2a, 0x02040a, 0.9);
    w.stars(1200, false, 1.5);
    w.moon(0xf4f8e0, -150, 150, -250, 22);

    // Patchy grass / dirt.
    const grass = canvasTexture(256, 256, (g, W, H) => {
      g.fillStyle = '#26382a'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = Math.random() < 0.5 ? '#2f4632' : '#1e2d22';
        g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 6, 3 + Math.random() * 6);
      }
    }, 12);
    w.floor(new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }), 30);

    // Iron fence on the boundary: stone base + many thin bars (one InstancedMesh = fast).
    const stoneMat = w.mat(0x6a6e72, { roughness: 0.95 });
    const iron = w.mat(0x15151a, { roughness: 0.5, metalness: 0.7 });
    const hx = w.halfX, hz = w.halfZ;
    for (const [x, z, sw, sd] of [[0, -hz - 0.3, hx * 2 + 0.6, 0.6], [0, hz + 0.3, hx * 2 + 0.6, 0.6], [-hx - 0.3, 0, 0.6, hz * 2], [hx + 0.3, 0, 0.6, hz * 2]]) {
      w.decor(new THREE.Mesh(new THREE.BoxGeometry(sw, 0.5, sd), stoneMat)).position.set(x, 0.25, z);
      w.decor(new THREE.Mesh(new THREE.BoxGeometry(sw, 0.08, sd * 0.3), iron)).position.set(x, 2.3, z);
    }
    const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4);
    const perim = (hx + hz) * 4, n = Math.floor(perim / 0.6);
    const bars = new THREE.InstancedMesh(barGeo, iron, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      let d = i * 0.6, x, z;
      if (d < hx * 2) { x = -hx + d; z = -hz - 0.3; } else if ((d -= hx * 2) < hz * 2) { x = hx + 0.3; z = -hz + d; }
      else if ((d -= hz * 2) < hx * 2) { x = hx - d; z = hz + 0.3; } else { d -= hx * 2; x = -hx - 0.3; z = hz - d; }
      m4.makeTranslation(x, 1.5, z); bars.setMatrixAt(i, m4);
    }
    bars.castShadow = true; w.scene.add(bars);

    // Tombstones in rows (with gaps so enemies can walk through).
    const graveMat = w.mat(0x8a8f94, { roughness: 0.9 });
    const graveDark = w.mat(0x5d6166, { roughness: 0.9 });
    const topGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.22, 12, 1, false, 0, Math.PI);
    topGeo.rotateX(Math.PI / 2).rotateZ(Math.PI / 2); // half-disc standing upright, round side up
    let k = 0;
    for (const rz of [-31, -24, -16, 16, 24, 31]) {
      for (let x = -34; x <= 34; x += 3.4) {
        k++;
        if (Math.abs(x) < 4 || k % 5 === 0) continue;           // paths
        const zz = rz + (Math.random() - 0.5) * 0.6, xx = x + (Math.random() - 0.5) * 0.5;
        const mat = k % 3 ? graveMat : graveDark;
        const h = 0.9 + Math.random() * 0.4;
        w.addBox(xx, zz, 0.8, h, 0.22, mat);
        const top = new THREE.Mesh(topGeo, mat);
        top.position.set(xx, h, zz);
        w.decor(top);
      }
    }
    // A few crosses & graves in the side areas.
    for (const [x, z] of [[-24, -6], [-28, 4], [26, -4], [30, 6], [-20, 8], [21, 9]]) {
      w.addBox(x, z, 0.25, 1.8, 0.25, graveMat);
      w.decor(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.25), graveMat)).position.set(x, 1.35, z);
    }

    // Mausoleums: stone houses with pointed roofs.
    const mauso = w.mat(0x7a7c86, { roughness: 0.85 });
    for (const [x, z] of [[-22, -22], [22, 22], [24, -24], [-24, 22]]) {
      w.addBox(x, z, 4.5, 3.6, 4.5, mauso);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2, 4), graveDark);
      roof.position.set(x, 4.6, z); roof.rotation.y = Math.PI / 4; w.decor(roof);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2), w.glow(0x2bff7a, 1.2));
      door.position.set(x, 1, z + (z < 0 ? 2.26 : -2.26)); if (z > 0) door.rotation.y = Math.PI; w.scene.add(door);
    }

    // Dead trees: crooked trunk + bare branches.
    const bark = w.mat(0x2b211c, { roughness: 1 });
    for (const [x, z, s] of [[-12, -10, 1], [13, 12, 1.2], [-33, 13, 1.3], [33, -14, 1.1], [9, -33, 1], [-9, 34, 1.2], [36, 30, 1], [-36, -30, 1.1], [-14, 13, 0.9], [14, -12, 0.9]]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.4 * s, 5 * s, 6), bark);
      trunk.position.set(x, 2.5 * s, z); trunk.rotation.z = 0.08;
      w.addPillar(x, z, 0.4 * s, 5 * s, bark, trunk);
      for (let b = 0; b < 4; b++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.12 * s, 2.4 * s, 5), bark);
        const a = b * 1.7 + x;
        br.position.set(x + Math.cos(a) * 0.7 * s, (3 + b * 0.6) * s, z + Math.sin(a) * 0.7 * s);
        br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        w.decor(br);
      }
    }

    // Green ghost lanterns.
    const lanternGlow = w.glow(0x5cff8a, 3);
    const lanterns = [];
    for (const [x, z] of [[4, -16], [-4, 16], [16, 4], [-16, -4], [0, -36], [0, 36]]) {
      w.addPillar(x, z, 0.12, 2.4, iron);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), lanternGlow);
      l.position.set(x, 2.6, z); w.scene.add(l); lanterns.push(l);
    }

    // Green mist layers.
    const mistTex = canvasTexture(128, 128, (g, W, H) => {
      const grd = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
      grd.addColorStop(0, 'rgba(120,255,160,0.45)'); grd.addColorStop(1, 'rgba(120,255,160,0)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    });
    const mists = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(20, 20),
        new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.12, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((Math.random() - 0.5) * 75, 0.3 + Math.random() * 0.9, (Math.random() - 0.5) * 75);
      w.scene.add(m); mists.push(m);
    }
    w.onUpdate((dt, t) => {
      lanternGlow.emissiveIntensity = 2.5 + Math.sin(t * 7) * 0.4 + Math.sin(t * 13) * 0.3; // flicker
      mists.forEach((m, i) => { m.position.z += Math.sin(t * 0.15 + i) * dt * 0.7; m.rotation.z += dt * 0.02; });
    });
  },
};
