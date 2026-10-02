/* Map: YACHT — the sun deck of a luxury yacht, alone on the ocean at sunset.
   Deck furniture is the cover, railings all round (you can't fall off:
   the arena edge stops you), and an animated low-poly sea. */
import { canvasTexture } from '../world.js?v=5da3e5f8d0';

export const MAP = {
  id: 'yacht',
  name: 'Yacht',
  desc: 'Sunset on the open sea. Defend the radar mast from the deck chairs.',
  card: ['#ff7a3a', '#3a1a5a'],
  halfX: 14, halfZ: 40, wallHeight: 1.2,
  bloom: [0.55, 0.5, 0.95],
  playerSpawn: [0, 0, 9],
  kiosk: [7, 0, 7],
  towerHeight: 13,
  palette: {
    background: 0x2a1530, fog: 0x8a4a6a, fogDensity: 0.006,
    hemiSky: 0xffb38a, hemiGround: 0x1a2a4a, hemiIntensity: 1.0,
    ambient: 0x6a4a8a, ambientIntensity: 0.45,
    sun: 0xff9a5a, sunIntensity: 2.3, sunPosition: [-60, 22, -40],
    tower: 0x29f0ff, beacon: 0xff3d6a, kiosk: 0xffc23d, exposure: 1.05,
  },

  build(w, THREE) {
    w.sky(0xff7a3a, 0x8a3a7a, 0x161848, 1.0);
    w.stars(400, false, 1.2).material.opacity = 0.5;
    w.moon(0xffb060, -250, 60, -170, 22);   // low setting sun

    // --- Ocean: a big grid whose vertices move up/down every frame ---
    const seaGeo = new THREE.PlaneGeometry(700, 700, 70, 70);
    seaGeo.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: 0x1d4f86, roughness: 0.25, metalness: 0.1, flatShading: true }));
    sea.position.y = -3.2; w.scene.add(sea);
    const base = seaGeo.attributes.position.array.slice();

    // --- Hull (white) under the deck, with a pointed bow at -Z ---
    const hullMat = w.mat(0xf2f4f8, { roughness: 0.35, metalness: 0.1 });
    const navy = w.mat(0x1b2340, { roughness: 0.4 });
    const hx = w.halfX + 0.6, hz = w.halfZ;
    w.decor(new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 4, hz * 2 + 4), hullMat)).position.set(0, -2, 2);
    w.decor(new THREE.Mesh(new THREE.BoxGeometry(hx * 2 + 0.05, 0.5, hz * 2 + 4.05), navy)).position.set(0, -2.9, 2);
    const bowShape = new THREE.Shape([new THREE.Vector2(-hx, -hz), new THREE.Vector2(hx, -hz), new THREE.Vector2(0, -hz - 16)]);
    const bow = new THREE.Mesh(new THREE.ExtrudeGeometry(bowShape, { depth: 4, bevelEnabled: false }), hullMat);
    bow.geometry.rotateX(Math.PI / 2); bow.position.y = 0; w.decor(bow);

    // --- Teak deck planks ---
    const teak = canvasTexture(256, 256, (g, W, H) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `hsl(26, 50%, ${24 + Math.random() * 8}%)`; g.fillRect(i * 32, 0, 32, H);
        g.fillStyle = '#2a1a10'; g.fillRect(i * 32, 0, 2, H);
        g.fillRect(i * 32, (i * 97) % H, 32, 2);
      }
    }, 4, 10);
    const deckMat = new THREE.MeshStandardMaterial({ map: teak, roughness: 0.7 });
    w.floor(deckMat, 0.6);
    const bowDeckShape = new THREE.Shape([new THREE.Vector2(-hx, hz), new THREE.Vector2(hx, hz), new THREE.Vector2(0, hz + 16)]);
    const bowDeck = new THREE.Mesh(new THREE.ShapeGeometry(bowDeckShape), deckMat);
    bowDeck.geometry.rotateX(-Math.PI / 2); bowDeck.position.y = 0.001; w.decor(bowDeck);

    // --- Railings: posts + top rail, plus string lights ---
    const chrome = w.mat(0xdfe4ee, { roughness: 0.2, metalness: 0.9 });
    const rails = [[0, -hz, hx * 2, 0.08], [0, hz, hx * 2, 0.08], [-hx, 0, 0.08, hz * 2], [hx, 0, 0.08, hz * 2]];
    for (const [x, z, sw, sd] of rails) {
      w.decor(new THREE.Mesh(new THREE.BoxGeometry(sw, 0.08, sd), chrome), false).position.set(x, 1.1, z);
      w.decor(new THREE.Mesh(new THREE.BoxGeometry(sw, 0.05, sd), chrome), false).position.set(x, 0.6, z);
    }
    const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6);
    const bulbGeo = new THREE.SphereGeometry(0.09, 6, 4);
    const posts = [], bulbs = [];
    for (let x = -hx; x <= hx; x += 2) { posts.push([x, -hz], [x, hz]); }
    for (let z = -hz + 2; z < hz; z += 2) { posts.push([-hx, z], [hx, z]); }
    const postMesh = new THREE.InstancedMesh(postGeo, chrome, posts.length);
    const bulbMesh = new THREE.InstancedMesh(bulbGeo, w.glow(0xffd28a, 3), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.55, z); postMesh.setMatrixAt(i, m4);
      m4.makeTranslation(x, 1.25, z); bulbMesh.setMatrixAt(i, m4);
    });
    w.scene.add(postMesh, bulbMesh);

    // --- Cabin superstructure at the bow (big cover block with glowing windows) ---
    w.addBox(0, -35.5, 20, 4, 9, hullMat);
    const win = w.glow(0x9fe6ff, 1.4);
    const winStrip = new THREE.Mesh(new THREE.BoxGeometry(20.05, 1.2, 9.05), win);
    winStrip.position.set(0, 2.4, -35.5); w.scene.add(winStrip);
    w.decor(new THREE.Mesh(new THREE.BoxGeometry(14, 2.6, 6), hullMat)).position.set(0, 5.3, -36.5);
    w.decor(new THREE.Mesh(new THREE.BoxGeometry(14.05, 0.8, 6.05), win)).position.set(0, 5.6, -36.5);
    w.decor(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), chrome)).position.set(0, 9.5, -37);

    // --- Deck furniture (cover) ---
    const cushion = w.mat(0xf6efe2, { roughness: 0.9 }), cushionB = w.mat(0x2a6fd8, { roughness: 0.9 });
    // Sun loungers in two rows near the stern.
    for (const z of [14, 18, 26, 30]) for (const x of [-9.5, 9.5]) {
      w.addBox(x, z, 1.0, 0.45, 2.2, cushion);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.9), cushionB);
      back.position.set(x, 0.75, z - 0.9); back.rotation.x = -0.6; w.decor(back);
    }
    // Hot tub (round) with glowing water.
    w.addPillar(0, 23, 2.4, 0.9, w.mat(0xe9edf3, { roughness: 0.3 }));
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.1, 24), w.glow(0x29d8ff, 1.6));
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.91, 23); w.scene.add(water);
    // Bar counter with neon strip and stools.
    w.addBox(-8, -14, 5, 1.2, 1.2, navy);
    w.decor(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 1.4), chrome)).position.set(-8, 1.24, -14);
    const neon = new THREE.Mesh(new THREE.BoxGeometry(5.02, 0.08, 1.22), w.glow(0xff3d9a, 2.5));
    neon.position.set(-8, 0.25, -14); w.scene.add(neon);
    for (let i = -2; i <= 2; i++) w.decor(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.8, 10), chrome)).position.set(-8 + i, 0.4, -12.8);
    // L-shaped sofas.
    for (const [x, z, f] of [[8, -20, 1], [-8, 4, -1], [8, -6, 1]]) {
      w.addBox(x, z, 3.2, 0.8, 1.0, cushion);
      w.addBox(x + f * 1.1, z - 1.6, 1.0, 0.8, 2.2, cushion);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.2), cushionB);
      pillow.position.set(x, 1.0, z - 0.35); w.decor(pillow);
    }
    // Planters with round bushes.
    const pot = w.mat(0x3a3a44), bush = w.mat(0x2f8a4a, { roughness: 1, flatShading: true });
    for (const [x, z] of [[-12.5, -25], [12.5, -25], [-12.5, 0], [12.5, 0], [-4, -26], [4, -26]]) {
      w.addBox(x, z, 1.2, 0.8, 1.2, pot);
      w.decor(new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), bush)).position.set(x, 1.3, z);
    }
    // Helipad painted at the stern.
    const pad = new THREE.Mesh(new THREE.RingGeometry(3.6, 4, 40), w.glow(0xffffff, 1.2));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.01, 35); w.scene.add(pad);
    const hBar = w.glow(0xffffff, 1.2);
    for (const [x, z, sw, sd] of [[-1, 35, 0.35, 3], [1, 35, 0.35, 3], [0, 35, 2, 0.35]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.02, sd), hBar); b.position.set(x, 0.01, z); w.scene.add(b);
    }

    // Animate the sea and bob the whole sea level a little.
    const pos = seaGeo.attributes.position;
    let acc = 0;
    w.onUpdate((dt, t) => {
      acc += dt;
      if (acc < 1 / 30) return; // waves update at 30 fps to save CPU
      acc = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        pos.array[i * 3 + 1] = Math.sin(x * 0.07 + t * 1.1) * 0.6 + Math.cos(z * 0.09 + t * 1.4) * 0.5 + Math.sin((x + z) * 0.15 + t * 2) * 0.2;
      }
      pos.needsUpdate = true;
      seaGeo.computeVertexNormals();
    });
  },
};
