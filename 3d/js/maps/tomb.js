/* Map: ALIEN TOMB — ruins of an ancient alien temple.
   Stone pillars with glowing purple/teal runes, sarcophagi as cover, thick mist. */
import { canvasTexture } from '../world.js?v=e898eff5dd';

export const MAP = {
  id: 'tomb',
  name: 'Alien Tomb',
  desc: 'A buried temple of a dead race. Runes still pulse in the mist.',
  mood: 'Eerie · Misty ruins', difficulty: 'Hard',   // shown on the map select screen
  card: ['#1a0f2e', '#2fffd2'],
  halfX: 40, halfZ: 40, wallHeight: 7,
  playerSpawn: [0, 0, 10],
  palette: {
    background: 0x07040f, fog: 0x2a1840, fogDensity: 0.022,
    hemiSky: 0x8c6cff, hemiGround: 0x1a1020, hemiIntensity: 1.2,
    ambient: 0x503070, ambientIntensity: 0.5,
    sun: 0x9be8ff, sunIntensity: 1.6, sunPosition: [25, 60, 30],
    tower: 0x2fffd2, beacon: 0xc04dff, kiosk: 0xffc23d,
  },

  build(w, THREE) {
    w.sky(0x3a1a5a, 0x150a2a, 0x05030c, 0.9);
    w.stars(900, false, 1.4);
    w.moon(0xbfffee, 150, 140, -260, 10);

    // Big worn stone tiles.
    const stone = canvasTexture(256, 256, (g, W, H) => {
      g.fillStyle = '#4a4058'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const l = 52 + Math.random() * 18;
        g.fillStyle = `hsl(270, 12%, ${l * 0.6}%)`;
        g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
      }
      g.strokeStyle = 'rgba(47,255,210,0.25)'; g.lineWidth = 2;
      g.beginPath(); g.arc(W / 2, H / 2, 40, 0, 7); g.stroke();
    }, 10);
    w.floor(new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }));

    const rock = w.mat(0x6a5a7a, { roughness: 0.95 });
    const rockDark = w.mat(0x3e3450, { roughness: 0.95 });
    const runeP = w.glow(0xc04dff, 2.5), runeT = w.glow(0x2fffd2, 2.5);

    // Temple walls (two tiers) with a rune strip.
    w.boundaryWalls(rock, 7, runeP, 2);
    for (const [x, z, sw, sd] of [[0, -w.halfZ - 3, w.halfX * 2 + 8, 2], [0, w.halfZ + 3, w.halfX * 2 + 8, 2], [-w.halfX - 3, 0, 2, w.halfZ * 2], [w.halfX + 3, 0, 2, w.halfZ * 2]]) {
      w.decor(new THREE.Mesh(new THREE.BoxGeometry(sw, 11, sd), rockDark)).position.set(x, 5.5, z);
    }

    // Inner ring of 8 square pillars with glowing runes.
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * 14, z = Math.sin(a) * 14;
      if (Math.hypot(x - w.kioskPos.x, z - w.kioskPos.z) < 4) continue;
      w.addBox(x, z, 1.5, 8, 1.5, rock);
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(1.52, 2.2, 0.2), i % 2 ? runeT : runeP);
      r1.position.set(x, 3.2, z); r1.rotation.y = -a + Math.PI / 2; w.scene.add(r1);
      w.decor(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 2.1), rockDark)).position.set(x, 8.2, z);
    }
    // Outer pillars — some broken (shorter, tilted top block).
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const x = Math.cos(a) * 29, z = Math.sin(a) * 29;
      const h = i % 3 === 0 ? 2.5 : 6.5;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, h, 8), rock);
      col.position.set(x, h / 2, z);
      w.addPillar(x, z, 1.1, h, rock, col);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.25, 8), i % 2 ? runeP : runeT);
      band.position.set(x, Math.min(h - 0.5, 2), z); w.scene.add(band);
    }

    // Sarcophagi (cover). Stone box + slightly bigger lid + rune line.
    const sarcs = [[20, 6, 0], [-20, -6, 0], [6, -21, 1], [-6, 21, 1], [22, -18, 1], [-22, 18, 1], [17, 22, 0], [-17, -22, 0], [33, 14, 1], [-33, -14, 1]];
    for (const [x, z, r] of sarcs) {
      const rot = r * Math.PI / 2;
      w.addBox(x, z, 2.8, 1.0, 1.3, rockDark, 0, rot);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 1.5), rock);
      lid.position.set(x, 1.15, z); lid.rotation.y = rot; w.decor(lid);
      const rl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.12), runeT);
      rl.position.set(x, 1.32, z); rl.rotation.y = rot; w.scene.add(rl);
      w.boxes[w.boxes.length - 1].top = 1.3;
    }
    // Corner obelisks with glowing tips.
    for (const [x, z] of [[34, 34], [-34, 34], [34, -34], [-34, -34]]) {
      w.addBox(x, z, 2, 9, 2, rockDark);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.5, 4), runeP);
      tip.position.set(x, 10.2, z); tip.rotation.y = Math.PI / 4; w.scene.add(tip);
    }
    // Altar steps around the tower (decor only, very low).
    const step = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.3, 0.12, 8), rockDark);
    step.position.y = 0.06; w.decor(step);

    // Low drifting mist layers.
    const mistTex = canvasTexture(128, 128, (g, W, H) => {
      const grd = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
      grd.addColorStop(0, 'rgba(180,140,255,0.55)'); grd.addColorStop(1, 'rgba(180,140,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    });
    const mists = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 22),
        new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.18, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((Math.random() - 0.5) * 70, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 70);
      w.scene.add(m); mists.push(m);
    }
    w.onUpdate((dt, t) => {
      runeP.emissiveIntensity = 2 + Math.sin(t * 1.5) * 1.2;
      runeT.emissiveIntensity = 2 + Math.cos(t * 1.3) * 1.2;
      mists.forEach((m, i) => { m.position.x += Math.sin(t * 0.2 + i) * dt * 0.6; m.rotation.z += dt * 0.03; });
    });
  },
};
