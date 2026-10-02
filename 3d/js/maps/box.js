/* Map: BOX — a clean, bright training map made of big blocks.
   Prototype "grid" textures, like a practice range / aim map. */
import { canvasTexture } from '../world.js?v=e898eff5dd';

// Grid texture like a level-designer prototype material.
function gridTex(base, line, repeat) {
  return canvasTexture(128, 128, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.strokeStyle = line; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
    g.globalAlpha = 0.35; g.lineWidth = 1;
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  }, repeat);
}

export const MAP = {
  id: 'box',
  name: 'Box',
  desc: 'Clean training arena. Big blocks, long sightlines, no excuses.',
  mood: 'Training · Open arena', difficulty: 'Easy',   // shown on the map select screen
  card: ['#cfe6ff', '#ff4655'],
  halfX: 36, halfZ: 36, wallHeight: 6,
  bloom: [0.25, 0.4, 1.2],   // bright daytime map: gentle glow only
  playerSpawn: [0, 0, 10],
  palette: {
    background: 0x9fd0ff, fog: 0xcfe6ff, fogDensity: 0.006,
    hemiSky: 0xffffff, hemiGround: 0x8899aa, hemiIntensity: 1.5,
    ambient: 0xffffff, ambientIntensity: 0.35,
    sun: 0xfff2dd, sunIntensity: 3.0, sunPosition: [30, 60, 20],
    tower: 0x00b3ff, beacon: 0xff4655, kiosk: 0xff4655,
  },

  build(w, THREE) {
    w.sky(0xe8f4ff, 0x9fd0ff, 0x4a8fe0, 1.0);

    w.floor(new THREE.MeshStandardMaterial({ map: gridTex('#c9ccd4', '#8e94a3', 36), roughness: 0.8 }));
    const wallTex = gridTex('#eceef3', '#a9afbd', 1);
    const wall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 });
    w.boundaryWalls(wall, 6, w.glow(0xff4655, 1.5));

    // Box materials: white, orange and blue grid.
    const tex = (b, l, r) => new THREE.MeshStandardMaterial({ map: gridTex(b, l, r), roughness: 0.75 });
    const white = tex('#f2f3f7', '#b2b8c6', 2), orange = tex('#ff8a3d', '#c4561b', 2), blue = tex('#3d8bff', '#1f55b0', 2);

    // Mirrored layout: every block appears in all 4 quadrants.
    const blocks = [
      // x, z, width, height, depth, material
      [22, 22, 6, 4, 6, white], [12, 4, 3, 3, 3, orange], [4, 16, 3, 1.5, 3, blue], [28, 9, 2, 5, 8, white],
      [17, 30, 8, 2.5, 2, blue], [10, 24, 2, 2, 2, orange], [31, 31, 3, 3, 3, orange],
    ];
    for (const [bx, bz, bw, bh, bd, m] of blocks) {
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = bx * sx, z = bz * sz;
        if (Math.hypot(x - w.kioskPos.x, z - w.kioskPos.z) < 4) continue;
        w.addBox(x, z, bw, bh, bd, m);
      }
    }
    // Step-up blocks next to the big boxes so you can climb on top of them.
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      w.addBox(18.4 * sx, 22 * sz, 1.2, 1.0, 1.2, blue);
      w.addBox(19.6 * sx, 22 * sz, 1.2, 2.0, 1.2, white);
      w.addBox(20.8 * sx, 22 * sz, 1.2, 3.0, 1.2, orange);
    }
    // Tall walls splitting the mid area.
    for (const [x, z, r] of [[0, 22, 0], [0, -22, 0], [22, 0, 1], [-22, 0, 1]]) w.addBox(x, z, 8, 4.5, 1, white, 0, r * Math.PI / 2);

    // Target boards on the walls for fun.
    const ring = canvasTexture(128, 128, (g, W, H) => {
      ['#ff4655', '#ffffff', '#ff4655', '#ffffff', '#ff4655'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(W / 2, H / 2, 60 - i * 12, 0, 7); g.fill(); });
    });
    const targetMat = new THREE.MeshStandardMaterial({ map: ring, roughness: 0.6 });
    for (let i = -2; i <= 2; i++) {
      const t = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), targetMat);
      t.position.set(i * 12, 3.5, -w.halfZ + 0.02); w.scene.add(t);
    }
  },
};
