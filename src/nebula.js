// Pre-generate big nebula tiles ONCE at startup.
// Then we just draw them translated — zero per-frame noise work.
//
// Technique:
//  - Generate a low-res (512x512) value-noise canvas with multiple octaves
//  - Color-ramp it through a nebula palette
//  - Soft-mask it to get organic "islands" of gas (not a blanket wash)
//  - Upscale when drawing; the softness hides the stretch

import { makeRng } from './rng.js';

// Tileable value noise — period p, so sampling at (x+p) equals (x).
function makeValueNoise2D(size, rng) {
  // Generate a size x size grid of random values in [0,1]
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  return function sample(x, y) {
    // Wrap
    const xi = ((x | 0) % size + size) % size;
    const yi = ((y | 0) % size + size) % size;
    const xi2 = (xi + 1) % size;
    const yi2 = (yi + 1) % size;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const a = grid[yi * size + xi];
    const b = grid[yi * size + xi2];
    const c = grid[yi2 * size + xi];
    const d = grid[yi2 * size + xi2];
    // Smoothstep
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const ab = a + (b - a) * ux;
    const cd = c + (d - c) * ux;
    return ab + (cd - ab) * uy;
  };
}

function fbm(sample, x, y, octaves, lacunarity = 2.0, gain = 0.5) {
  let v = 0, amp = 0.5, freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    v += amp * sample(x * freq, y * freq);
    freq *= lacunarity;
    amp *= gain;
  }
  return v;
}

// Smoothstep
function ss(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Tealy hard-sci-fi palette.
// Mostly deep space with pockets of cyan/teal nebula, tiny whisper of warm
// ember at the densest cores so it doesn't feel monochrome.
const PALETTE = {
  bg:       [3, 5, 12],          // near-black cool
  dim:      [6, 22, 32],         // deep teal shadow
  mid:      [20, 70, 85],        // teal midtone
  bright:   [70, 180, 180],      // cyan-teal bright
  hot:      [160, 220, 210],     // highlight
  ember:    [130, 70, 40],       // rare warm accent
};

// Render a nebula field to a canvas. Returns the canvas.
// size: pixels square
// seed: reproducible
// warmth: 0..1, how much ember shows
export function generateNebulaTile(size, seed, warmth = 0.15) {
  const rng = makeRng(seed);
  const noise = makeValueNoise2D(64, rng);
  const noise2 = makeValueNoise2D(64, makeRng(seed + 999));

  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  // Domain-warped fBM, evaluated at noise-grid scale (not pixel scale).
  // Scale so we get a few big blobs across the tile.
  const scale = 2.5; // how many "blob cycles" across the tile

  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;

      const nx = u * scale;
      const ny = v * scale;

      // warp
      const wx = fbm(noise2, nx + 5.2, ny + 1.3, 3) * 1.5;
      const wy = fbm(noise2, nx + 9.7, ny + 4.4, 3) * 1.5;

      const n = fbm(noise, nx + wx, ny + wy, 4);       // main density
      const n2 = fbm(noise2, nx * 1.7 + 3, ny * 1.7 - 1, 3); // color variation

      // Shape the density: threshold so most of the tile is empty space
      const density = ss(0.42, 0.78, n);

      if (density < 0.005) {
        // Pure background — transparent so we can composite
        const i = (py * size + px) * 4;
        d[i]   = 0;
        d[i+1] = 0;
        d[i+2] = 0;
        d[i+3] = 0;
        continue;
      }

      // Color ramp driven by n2 (spatial color variance)
      let col;
      if (n2 < 0.35) {
        col = lerp3(PALETTE.dim, PALETTE.mid, n2 / 0.35);
      } else if (n2 < 0.65) {
        col = lerp3(PALETTE.mid, PALETTE.bright, (n2 - 0.35) / 0.30);
      } else {
        col = lerp3(PALETTE.bright, PALETTE.hot, (n2 - 0.65) / 0.35);
      }

      // Rare ember highlights in very dense regions, if warmth permits
      if (density > 0.75 && n2 > 0.85 && warmth > 0) {
        const emberMix = (density - 0.75) * 4 * warmth;
        col = lerp3(col, PALETTE.ember, Math.min(1, emberMix));
      }

      // Density drives brightness AND alpha — strong so they show through stars
      const bright = 2.5 + density * 4.0;
      const alpha = Math.min(1, density * 2.2);

      const i = (py * size + px) * 4;
      d[i]   = Math.min(255, col[0] * bright);
      d[i+1] = Math.min(255, col[1] * bright);
      d[i+2] = Math.min(255, col[2] * bright);
      d[i+3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  return cvs;
}

// Background color — solid fill behind all nebula
export const BG_COLOR = `rgb(${PALETTE.bg[0]}, ${PALETTE.bg[1]}, ${PALETTE.bg[2]})`;
