/* =========================================================================
   textures.js — procedurally generated PBR detail textures (no downloads).
   Each "surface" gives a near-white albedo (tinted by the material colour),
   a normal map and a roughness map, all drawn on canvases at load time and
   cached. Used by the world (concrete, metal, stone, wood, grass) and guns.
   ========================================================================= */
import * as THREE from '../lib/three.module.js';

// Small seeded RNG so textures look the same every time.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Tileable value noise, summed over octaves (fbm). Returns Float32Array size*size in 0..1.
function fbm(size, seed, octaves = 5, base = 4, persistence = 0.5) {
  const out = new Float32Array(size * size);
  const r = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = base << o;
    const grid = new Float32Array(cells * cells).map(() => r());
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      const y1 = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const x1 = (x0 + 1) % cells;
        const a = grid[y0 * cells + x0], b = grid[y0 * cells + x1], c = grid[y1 * cells + x0], d = grid[y1 * cells + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    total += amp; amp *= persistence;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvasFrom(size, fn) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const [r, gg, b] = fn(i); img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}

// Height field -> tangent-space normal map (Sobel, wraps around so it tiles).
function normalFrom(h, size, strength) {
  return canvasFrom(size, (i) => {
    const x = i % size, y = (i / size) | 0;
    const H = (xx, yy) => h[((yy + size) % size) * size + ((xx + size) % size)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  });
}

function tex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const RECIPES = {
  // Poured concrete: soft blotches + fine grain + pits.
  concrete: (S) => {
    const big = fbm(S, 11, 4, 3), fine = fbm(S, 12, 3, 32), r = rng(13);
    const h = new Float32Array(S * S);
    for (let i = 0; i < h.length; i++) h[i] = big[i] * 0.5 + fine[i] * 0.5 - (r() < 0.004 ? 0.5 : 0);
    return { h, albedo: (i) => 0.78 + big[i] * 0.3 - fine[i] * 0.12, rough: (i) => 0.8 + fine[i] * 0.2 - big[i] * 0.1, normal: 2.2 };
  },
  // Brushed / scuffed metal: horizontal streaks + scratches.
  metal: (S) => {
    const r = rng(21), streak = new Float32Array(S), blot = fbm(S, 22, 3, 3);
    for (let y = 0; y < S; y++) streak[y] = r();
    const h = new Float32Array(S * S);
    for (let i = 0; i < h.length; i++) h[i] = streak[(i / S) | 0] * 0.15 + blot[i] * 0.1;
    const c = document.createElement('canvas'); // scratches
    for (let k = 0; k < 90; k++) { const x = r() * S, y = r() * S, a = r() * Math.PI, l = 4 + r() * 30; for (let t = 0; t < l; t++) { const xx = (x + Math.cos(a) * t + S) % S | 0, yy = (y + Math.sin(a) * t + S) % S | 0; h[yy * S + xx] -= 0.25; } }
    return { h, albedo: (i) => 0.82 + blot[i] * 0.2 + streak[(i / S) | 0] * 0.06, rough: (i) => 0.3 + blot[i] * 0.35 + (h[i] < 0 ? 0.2 : 0), normal: 2 };
  },
  // Rough stone / rock.
  stone: (S) => {
    const a = fbm(S, 31, 6, 4, 0.55), b = fbm(S, 32, 3, 8);
    const h = new Float32Array(S * S);
    for (let i = 0; i < h.length; i++) h[i] = a[i] + Math.abs(b[i] - 0.5) * 0.6;
    return { h, albedo: (i) => 0.7 + a[i] * 0.4, rough: () => 0.92, normal: 4 };
  },
  // Wood grain (planks are drawn by the maps; this adds grain + pores).
  wood: (S) => {
    const n = fbm(S, 41, 4, 4), f = fbm(S, 42, 2, 64);
    const h = new Float32Array(S * S);
    for (let i = 0; i < h.length; i++) { const y = (i / S) | 0; h[i] = Math.sin((y / S) * 60 + n[i] * 12) * 0.3 + f[i] * 0.2; }
    return { h, albedo: (i) => 0.8 + h[i] * 0.3, rough: (i) => 0.65 + f[i] * 0.2, normal: 1.5 };
  },
  // Grass / dirt ground.
  grass: (S) => {
    const a = fbm(S, 51, 5, 4), f = fbm(S, 52, 2, 96);
    const h = new Float32Array(S * S);
    for (let i = 0; i < h.length; i++) h[i] = a[i] * 0.4 + f[i] * 0.8;
    return { h, albedo: (i) => 0.65 + f[i] * 0.45 + a[i] * 0.15, rough: () => 1, normal: 4 };
  },
  // Gun polymer: fine stipple grain.
  polymer: (S) => {
    const f = fbm(S, 61, 2, 64), b = fbm(S, 62, 3, 4);
    const h = new Float32Array(S * S);
    for (let i = 0; i < h.length; i++) h[i] = f[i] * 0.6;
    return { h, albedo: (i) => 0.9 + b[i] * 0.1, rough: (i) => 0.55 + f[i] * 0.25, normal: 2.5 };
  },
};

const cache = {};
/** Get {map, normalMap, roughnessMap} for a surface type (textures are shared; clone to change repeat). */
export function surface(type, size = 256) {
  const key = type + size;
  if (cache[key]) return cache[key];
  const R = RECIPES[type](size);
  const n = size * size;
  const map = tex(canvasFrom(size, (i) => { const v = Math.max(0, Math.min(1, R.albedo(i))) * 255; return [v, v, v]; }), true);
  const roughnessMap = tex(canvasFrom(size, (i) => { const v = Math.max(0, Math.min(1, R.rough(i))) * 255; return [v, v, v]; }), false);
  const normalMap = tex(normalFrom(R.h, size, R.normal), false);
  void n;
  return (cache[key] = { map, normalMap, roughnessMap });
}

/** Same textures with a different repeat (shares the image, separate transform). */
export function surfaceRepeat(type, rx, ry = rx) {
  const s = surface(type), out = {};
  for (const k of Object.keys(s)) { const t = s[k].clone(); t.repeat.set(rx, ry); t.needsUpdate = true; out[k] = t; }
  return out;
}

/* Re-map a geometry's UVs as a box projection in metres (1 tile = `tile` m),
   so detail textures keep a constant scale on any box/cylinder size. */
export function boxProjectUVs(geo, scale, tile = 2) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!pos || !nor) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * scale.x, y = pos.getY(i) * scale.y, z = pos.getZ(i) * scale.z;
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
