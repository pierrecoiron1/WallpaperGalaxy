// Spatial-hash starfield.
// Stars live in an infinite grid of cells; each cell deterministically
// contains N stars based on its (cx, cy) hash. To render, we compute
// which cells are visible and draw just those. Memory: O(visible), not O(world).
//
// Parallax: we have several "layers", each with its own cell grid and its own
// parallax factor. Near layers move fast, far layers drift slowly — this
// creates the flythrough illusion without actually moving a camera through 3D.

import { hash2, hashToUnit, rngFrom } from './rng.js';

// Star color palette based on spectral class approximations
// Keyed by a hash value in [0,1]
function starColor(h) {
  // Most stars: warm white / pale yellow (main-sequence)
  // Some: blue-white (hot)
  // Some: orange/red (cool)
  // Tiny fraction: exotic tints — cyan (fits our palette)
  if (h < 0.45) return [255, 248, 230];  // warm white
  if (h < 0.70) return [255, 238, 200];  // pale yellow
  if (h < 0.82) return [200, 220, 255];  // blue-white
  if (h < 0.92) return [255, 200, 170];  // orange
  if (h < 0.97) return [255, 170, 150];  // red-orange
  return [180, 240, 255];                 // exotic cyan (rare)
}

// Describes one parallax layer
// cellSize: world-space size of a cell (in the layer's coordinate space)
// density: stars per cell (average)
// parallax: camera offset multiplier (1 = normal, 0.1 = very distant)
// brightRange: [min, max] alpha/intensity
// sizeRange: [min, max] pixel size at draw time
export const DEFAULT_LAYERS = [
  // Deep far starfield — barely moves
  { cellSize: 180, density: 2.2, parallax: 0.15, brightRange: [0.25, 0.55], sizeRange: [0.6, 1.2], seed: 101 },
  // Mid field
  { cellSize: 140, density: 1.4, parallax: 0.35, brightRange: [0.4, 0.8], sizeRange: [0.8, 1.6], seed: 102 },
  // Near field
  { cellSize: 120, density: 0.9, parallax: 0.65, brightRange: [0.6, 1.0], sizeRange: [1.0, 2.4], seed: 103 },
  // Foreground — bright, few, big — these are the "close" stars whooshing by
  { cellSize: 260, density: 0.25, parallax: 1.0, brightRange: [0.8, 1.0], sizeRange: [2.0, 4.0], seed: 104 },
];

// Render a layer into `ctx` given camera position (cx, cy) and viewport size.
// Stars within the viewport (+ a small margin) are drawn.
// `starHighlight` is an optional {cellX, cellY, starIdx, boost} that renders
// one specific star extra-bright (the "selected" star on the system-map monitor).
export function renderLayer(ctx, layer, camX, camY, viewW, viewH, time, starHighlight = null) {
  const ox = camX * layer.parallax;
  const oy = camY * layer.parallax;

  const margin = layer.cellSize;
  const minCx = Math.floor((ox - margin) / layer.cellSize);
  const maxCx = Math.ceil((ox + viewW + margin) / layer.cellSize);
  const minCy = Math.floor((oy - margin) / layer.cellSize);
  const maxCy = Math.ceil((oy + viewH + margin) / layer.cellSize);

  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const h = hash2(cx, cy, layer.seed);
      const rng = rngFrom(h);
      // Determine # of stars in this cell (Poisson-ish)
      const count = Math.floor(layer.density + rng() * 1.5);
      for (let i = 0; i < count; i++) {
        const sx = cx * layer.cellSize + rng() * layer.cellSize;
        const sy = cy * layer.cellSize + rng() * layer.cellSize;
        const colorPick = rng();
        const bright = layer.brightRange[0] + rng() * (layer.brightRange[1] - layer.brightRange[0]);
        const size = layer.sizeRange[0] + rng() * (layer.sizeRange[1] - layer.sizeRange[0]);
        // Gentle twinkle — tiny, per-star phase
        const twinkle = 0.92 + 0.08 * Math.sin(time * 0.0015 + (cx * 12.9898 + cy * 78.233 + i));

        const px = sx - ox;
        const py = sy - oy;
        if (px < -10 || px > viewW + 10 || py < -10 || py > viewH + 10) continue;

        const col = starColor(colorPick);
        const a = bright * twinkle;

        // Is this the highlighted star?
        let boost = 0;
        if (starHighlight &&
            starHighlight.cellX === cx &&
            starHighlight.cellY === cy &&
            starHighlight.starIdx === i &&
            starHighlight.layerSeed === layer.seed) {
          boost = starHighlight.boost;
        }

        drawStar(ctx, px, py, size * (1 + boost * 0.6), a, col, boost);
      }
    }
  }
}

function drawStar(ctx, x, y, size, alpha, col, boost = 0) {
  // Core + halo — drawn with radial gradient for real glow
  const r = size;
  const haloR = size * (4 + boost * 8);

  // Halo
  const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  halo.addColorStop(0, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha * 0.35})`);
  halo.addColorStop(0.3, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha * 0.10})`);
  halo.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Core
  ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Highlighted — draw crosshair spikes
  if (boost > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, boost);
    ctx.strokeStyle = `rgba(160, 240, 240, 0.7)`;
    ctx.lineWidth = 1;
    const spike = haloR * 1.4;
    ctx.beginPath();
    ctx.moveTo(x - spike, y); ctx.lineTo(x + spike, y);
    ctx.moveTo(x, y - spike); ctx.lineTo(x, y + spike);
    ctx.stroke();
    ctx.restore();
  }
}

// Pick a random star that's currently visible in the given layer + viewport.
// Returns {cellX, cellY, starIdx, worldX, worldY, layerSeed, seedHash} or null.
export function pickVisibleStar(layer, camX, camY, viewW, viewH, globalSeed) {
  const ox = camX * layer.parallax;
  const oy = camY * layer.parallax;
  const minCx = Math.floor(ox / layer.cellSize);
  const maxCx = Math.ceil((ox + viewW) / layer.cellSize);
  const minCy = Math.floor(oy / layer.cellSize);
  const maxCy = Math.ceil((oy + viewH) / layer.cellSize);

  // Collect candidates that are comfortably away from the edges so the
  // star stays on-screen for the full 10 minutes.
  const edgeInsetX = viewW * 0.2;
  const edgeInsetY = viewH * 0.2;
  const candidates = [];

  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const h = hash2(cx, cy, layer.seed);
      const rng = rngFrom(h);
      const count = Math.floor(layer.density + rng() * 1.5);
      for (let i = 0; i < count; i++) {
        const sx = cx * layer.cellSize + rng() * layer.cellSize;
        const sy = cy * layer.cellSize + rng() * layer.cellSize;
        rng(); // consume colorPick for consistency with renderLayer
        rng(); // consume bright
        rng(); // consume size
        const px = sx - ox;
        const py = sy - oy;
        if (px > edgeInsetX && px < viewW - edgeInsetX &&
            py > edgeInsetY && py < viewH - edgeInsetY) {
          candidates.push({
            cellX: cx, cellY: cy, starIdx: i,
            worldX: sx, worldY: sy,
            layerSeed: layer.seed,
            seedHash: hash2(cx * 1000 + i, cy, globalSeed + layer.seed),
          });
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  // Deterministic pick based on globalSeed+time-bucket
  const picked = candidates[Math.floor(Math.abs(hash2(Math.floor(camX / 100), Math.floor(camY / 100), globalSeed)) % candidates.length)];
  return picked;
}
