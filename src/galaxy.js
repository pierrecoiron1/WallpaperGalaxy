// Galaxy flythrough renderer.
//
// Architecture:
//  - Background: solid deep color (BG_COLOR)
//  - Nebula: a handful of pre-rendered tiles positioned at fixed world coords,
//    moving with parallax. Since they're pre-rendered, drawing them is
//    just N drawImage calls per frame. Free.
//  - Stars: 4 parallax layers drawn on top.
//
// The camera drifts slowly. We don't do any per-frame procedural work beyond
// computing visible grid cells.

import { generateNebulaTile, BG_COLOR } from './nebula.js';
import { DEFAULT_LAYERS, renderLayer, pickVisibleStar } from './starfield.js';
import { makeRng, hash2 } from './rng.js';

// Place nebula "objects" at fixed world coordinates with given tile + parallax
function placeNebulae(rng) {
  // Nebulae live in world space. We scatter them densely across a moderate
  // extent so several are always visible at any camera position.
  // Camera drifts at ~6 px/s — after a year it covers ~200k px total but at
  // any moment the visible window is only ~3440 px wide. We tile uniformly.
  const out = [];
  const WORLD_EXTENT = 4000;    // smaller so density is high near origin
  const count = 60;
  for (let i = 0; i < count; i++) {
    out.push({
      x: (rng() - 0.5) * 2 * WORLD_EXTENT,
      y: (rng() - 0.5) * 2 * WORLD_EXTENT,
      size: 1800 + rng() * 2800,
      tileIdx: Math.floor(rng() * 4),
      parallax: 0.20 + rng() * 0.30,
      rotation: rng() * Math.PI * 2,
      alpha: 0.85 + rng() * 0.15,
    });
  }
  return out;
}

export class Galaxy {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.seed = opts.seed ?? 42;
    this.rng = makeRng(this.seed);

    // Pre-render nebula tiles. 4 variants for visual variety.
    this.tiles = [];
    for (let i = 0; i < 4; i++) {
      this.tiles.push(generateNebulaTile(512, this.seed + i * 31, 0.15 + (i % 2) * 0.1));
    }

    this.nebulae = placeNebulae(this.rng);
    this.layers = DEFAULT_LAYERS;

    // Camera — in "world" pixels. Very slow drift.
    this.camX = 0;
    this.camY = 0;
    // Speed in px/sec. At 3440x1440, 8 px/sec means you traverse the width
    // in ~7 minutes. Stars don't leave the frame too quickly.
    this.camVX = opts.camVX ?? 6;
    this.camVY = opts.camVY ?? 2.5;

    this.startTime = performance.now();
    this.lastTime = this.startTime;

    this.highlightStar = null;   // {cellX, cellY, starIdx, layerSeed, boost}
    this.highlightBoost = 0;     // 0..1 animated pulse
  }

  setSpeed(vx, vy) {
    this.camVX = vx;
    this.camVY = vy;
  }

  setHighlight(starRef) {
    // starRef from pickVisibleStar
    this.highlightStar = starRef;
  }

  // Get current star under a crosshair at viewport center, if any
  pickCenterStar() {
    // Use the mid-field layer (parallax 0.35) — feels right
    const layer = this.layers[1];
    return pickVisibleStar(
      layer,
      this.camX,
      this.camY,
      this.canvas.width,
      this.canvas.height,
      this.seed
    );
  }

  pickRandomVisibleStar() {
    // Prefer mid / near layer for visible pick
    const layer = this.layers[1];
    return pickVisibleStar(
      layer,
      this.camX,
      this.camY,
      this.canvas.width,
      this.canvas.height,
      this.seed ^ Math.floor(performance.now())
    );
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.camX += this.camVX * dt;
    this.camY += this.camVY * dt;

    // Animate highlight pulse
    if (this.highlightStar) {
      const t = (now - this.startTime) * 0.001;
      this.highlightBoost = 0.5 + 0.4 * Math.sin(t * 1.2);
      this.highlightStar.boost = this.highlightBoost;
    }

    this.render(now);
  }

  render(now) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    // --- Draw nebulae: big layered radial gradients ---
    // Spatial-hash cells; each cell has a ~60% chance of a nebula cluster,
    // which is drawn as 4-8 overlapping radial gradients in teal/cyan.
    const CELL = 1200;
    const margin = 1600;
    const parallax = 0.3;
    const ox = this.camX * parallax;
    const oy = this.camY * parallax;
    const minCx = Math.floor((ox - margin) / CELL);
    const maxCx = Math.ceil((ox + W + margin) / CELL);
    const minCy = Math.floor((oy - margin) / CELL);
    const maxCy = Math.ceil((oy + H + margin) / CELL);

    ctx.globalCompositeOperation = 'lighter';
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        let h = (cx * 374761393 + cy * 668265263 + 911) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
        const r1 = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        if (r1 > 0.60) continue;

        // Seeded RNG for this cell
        let seed = h >>> 0;
        const rng = () => {
          seed = (seed + 0x6D2B79F5) >>> 0;
          let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        const cellCx = cx * CELL + rng() * CELL - ox;
        const cellCy = cy * CELL + rng() * CELL - oy;
        const blobCount = 5 + Math.floor(rng() * 5);
        const spread = 600 + rng() * 400;

        // Palette picks: teal-dominant with occasional warm
        const palettes = [
          [[70, 180, 180], [160, 220, 210]],   // teal
          [[40, 140, 170], [90, 200, 220]],    // cyan
          [[30, 110, 140], [140, 200, 200]],   // deep teal
          [[160, 100, 60], [200, 140, 90]],    // warm (rare)
        ];
        const paletteIdx = rng() < 0.15 ? 3 : Math.floor(rng() * 3);
        const palette = palettes[paletteIdx];

        for (let b = 0; b < blobCount; b++) {
          const bx = cellCx + (rng() - 0.5) * spread * 2;
          const by = cellCy + (rng() - 0.5) * spread * 2;
          const br = 300 + rng() * 700;
          // Cull
          if (bx + br < 0 || bx - br > W || by + br < 0 || by - br > H) continue;

          const colorMix = rng();
          const col = [
            palette[0][0] + (palette[1][0] - palette[0][0]) * colorMix,
            palette[0][1] + (palette[1][1] - palette[0][1]) * colorMix,
            palette[0][2] + (palette[1][2] - palette[0][2]) * colorMix,
          ];
          const intensity = 0.8 + rng() * 0.6;

          const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          g.addColorStop(0, `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${intensity})`);
          g.addColorStop(0.5, `rgba(${col[0] * 0.5 | 0}, ${col[1] * 0.5 | 0}, ${col[2] * 0.5 | 0}, ${intensity * 0.3})`);
          g.addColorStop(1, `rgba(0, 0, 0, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // --- Draw star layers ---
    ctx.globalCompositeOperation = 'lighter';
    for (const layer of this.layers) {
      renderLayer(ctx, layer, this.camX, this.camY, W, H, now, this.highlightStar);
    }
    ctx.globalCompositeOperation = 'source-over';

    // --- Subtle vignette ---
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}
