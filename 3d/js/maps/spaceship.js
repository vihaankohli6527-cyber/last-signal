/* Map: SPACE SHIP — a huge hangar bay inside a starship.
   Metal floor, bulkhead walls making corridors, blue/white light strips,
   and big windows in the walls showing the starfield outside. */
import { canvasTexture } from '../world.js?v=e898eff5dd';

export const MAP = {
  id: 'spaceship',
  name: 'Space Ship',
  desc: 'Hangar bay of the UNS Meridian. Bulkheads, cargo and a view of the void.',
  mood: 'Sci-fi · Tight corridors', difficulty: 'Medium',   // shown on the map select screen
  card: ['#0b1730', '#4fc3ff'],          // colours used for the menu card fallback
  halfX: 38, halfZ: 38, wallHeight: 13,
  playerSpawn: [0, 0, 10],
  palette: {
    background: 0x01020a, fog: 0x081226, fogDensity: 0.009,
    hemiSky: 0xa8c4ff, hemiGround: 0x141a2c, hemiIntensity: 1.0,
    ambient: 0x6080b0, ambientIntensity: 0.5,
    sun: 0xe8f2ff, sunIntensity: 1.8, sunPosition: [12, 60, 8],
    tower: 0x4fc3ff, beacon: 0xff4655, kiosk: 0xffd166,
  },

  build(w, THREE) {
    // Space: black sky, stars all around, a big planet.
    w.sky(0x0a1030, 0x03040e, 0x000000, 1);
    w.stars(2500, true, 1.8);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a4a9a, emissive: 0x0a1a50, roughness: 1, fog: false }));
    planet.position.set(160, 40, -260); w.scene.add(planet);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(74, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.15, fog: false, side: THREE.BackSide }));
    atmo.position.copy(planet.position); w.scene.add(atmo);

    // Metal floor panels with hazard stripes near the edges of each tile.
    const floorTex = canvasTexture(256, 256, (g, W, H) => {
      g.fillStyle = '#3a4258'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#454e68'; g.fillRect(6, 6, W - 12, H - 12);
      g.strokeStyle = '#2a3044'; g.lineWidth = 3;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(6, i * H / 4); g.lineTo(W - 6, i * H / 4); g.stroke(); }
      g.fillStyle = '#5a6482';
      for (const [x, y] of [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    }, 19);
    w.floor(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45, metalness: 0.6 }));

    // Glowing floor guide lines toward the tower.
    const lineMat = w.glow(0x4fc3ff, 2);
    for (const [x, z, len, rot] of [[0, 22, 26, 0], [0, -22, 26, 0], [22, 0, 26, 1], [-22, 0, 26, 1]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, len), lineMat);
      l.position.set(x, 0.02, z); l.rotation.y = rot * Math.PI / 2; w.decor(l, false);
    }

    // Hull walls with windows: solid bottom + top, glass in between.
    const hull = w.mat(0xb8c2d8, { roughness: 0.35, metalness: 0.5 });
    const hullDark = w.mat(0x2a3148, { roughness: 0.5, metalness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.9, depthWrite: false });
    const strip = w.glow(0xbfe4ff, 1.1);
    const H = 13, hx = w.halfX, hz = w.halfZ, T = 1.2;
    const sides = [[0, -hz - T / 2, hx * 2 + T * 2, T, 0], [0, hz + T / 2, hx * 2 + T * 2, T, 0],
                   [-hx - T / 2, 0, T, hz * 2, 1], [hx + T / 2, 0, T, hz * 2, 1]];
    for (const [x, z, sw, sd, vertical] of sides) {
      w.addCollider(x, z, sw, sd, H);
      w.decor(new THREE.Mesh(new THREE.BoxGeometry(sw, 2.6, sd), hull)).position.set(x, 1.3, z);
      w.decor(new THREE.Mesh(new THREE.BoxGeometry(sw, 4, sd), hull)).position.set(x, H - 2, z);
      const g2 = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? sd : sw, 8.4), glass);
      g2.position.set(x, 6.8, z); if (vertical) g2.rotation.y = Math.PI / 2; w.scene.add(g2);
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.05, 0.12, sd + 0.05), strip);
      s1.position.set(x, 2.65, z); w.scene.add(s1);
      // window frames (vertical ribs)
      const len = vertical ? sd : sw;
      for (let p = -len / 2; p <= len / 2; p += 7.6) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(vertical ? sw + 0.3 : 0.6, 8.6, vertical ? 0.6 : sd + 0.3), hullDark);
        rib.position.set(vertical ? x : x + p, 6.8, vertical ? z + p : z); w.decor(rib);
      }
    }
    // Ceiling beams (no solid ceiling so the moon-light/shadows still work).
    for (let p = -hz; p <= hz; p += 9.5) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.8, 0.8), hullDark);
      beam.position.set(0, H + 0.4, p); w.scene.add(beam);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.08, 0.3), strip);
      bl.position.set(0, H - 0.02, p); w.scene.add(bl);
    }

    // Bulkheads (tall interior walls that make corridors), each with a blue light strip.
    const bulk = w.mat(0x8792b0, { roughness: 0.4, metalness: 0.5 });
    const blue = w.glow(0x4fc3ff, 2.4);
    const bulkheads = [[-18, -8, 10, 1], [-18, 10, 8, 1], [18, 8, 10, 1], [18, -10, 8, 1],
                       [-6, -20, 10, 0], [8, -20, 8, 0], [6, 20, 10, 0], [-8, 20, 8, 0]];
    for (const [x, z, len, r] of bulkheads) {
      const rot = r * Math.PI / 2;
      w.addBox(x, z, len, 4, 0.8, bulk, 0, rot);
      const s = new THREE.Mesh(new THREE.BoxGeometry(len + 0.02, 0.15, 0.82), blue);
      s.position.set(x, 2.6, z); s.rotation.y = rot; w.scene.add(s);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.2, 1.0), hullDark);
      cap.position.set(x, 4.1, z); cap.rotation.y = rot; w.decor(cap);
    }

    // Cargo containers (white/blue) and crates.
    const cWhite = w.crateMaterial('#dfe6f2', '#8a96ad'), cBlue = w.crateMaterial('#3a6fd8', '#1d3a80');
    for (const [x, z, r, m] of [[28, 26, 0, cWhite], [-28, -26, 0, cBlue], [29, -27, 1, cBlue], [-27, 28, 1, cWhite], [31, 0, 1, cWhite], [-31, 2, 1, cBlue]]) {
      w.addBox(x, z, 5, 2.6, 2.6, m, 0, r * Math.PI / 2);
    }
    for (const [x, z] of [[12, -14], [-13, 15], [-12, -15], [25, 14], [-25, -12]]) {
      w.addBox(x, z, 1.4, 1.4, 1.4, cWhite); w.addBox(x + 1.4, z, 1.4, 1.4, 1.4, cBlue);
    }
    // Consoles with glowing screens.
    const screenMat = w.glow(0x7fe0ff, 1.8);
    for (const [x, z, r] of [[-10, -3, 1], [3, -12, 0], [-3, 13, 0]]) {
      w.addBox(x, z, 2.2, 1.1, 0.9, hullDark, 0, r * Math.PI / 2);
      const scr = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.6), screenMat);
      scr.position.set(x, 1.13, z); scr.rotation.y = r * Math.PI / 2; w.scene.add(scr);
    }
    // Blinking warning beacons on the walls.
    const warn = w.glow(0xff4655, 3);
    for (const [x, z] of [[0, -hz + 0.1], [0, hz - 0.1], [-hx + 0.1, 0], [hx - 0.1, 0]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), warn); b.position.set(x, 3.4, z); w.scene.add(b);
    }
    w.onUpdate((dt, t) => { warn.emissiveIntensity = Math.sin(t * 4) > 0 ? 4 : 0.3; planet.rotation.y = t * 0.02; });
  },
};
