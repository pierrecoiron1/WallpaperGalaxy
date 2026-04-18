// 3D-projected starfield — gives the true "forward flight" sensation.
//
// Every star has (x, y, z) in camera-local space.
// We project with focal length F:
//   sx = cx + (x / z) * F
//   sy = cy + (y / z) * F
// As time advances, z decreases (stars approach).
// Stars are in a ring buffer; when one passes z < Z_MIN, it's recycled to
// z = Z_MAX with a fresh deterministic hash so the system stays deterministic.
//
// Determinism: each star has a `seed` (uint32 hash). All its visual properties
// (color, base brightness, size multiplier) are derived from that seed.
// Recycling a star picks a new seed from a PRNG. This means which stars you
// see and which get picked as "targets" is reproducible for any given
// starting seed + elapsed time.

import { makeRng, hashToUnit } from './rng.js';

const Z_MAX = 2000;
const Z_MIN = 8;       // at this depth, star is "past" us and gets recycled
const FOCAL = 1400;    // focal length — higher = narrower FOV

// STAR_COUNT is density-normalized to a reference 3440×1440 canvas so larger
// monitors don't render sparser. Computed per-instance against canvas area.
const REFERENCE_STAR_COUNT = 2600;
const REFERENCE_AREA = 3440 * 1440;

// Per-monitor safe-area insets — keeps tracked stars (and the tracking
// reticle) from drifting behind the GNOME top panel or Ubuntu dock.
// Injected by the host page via window.__safeArea from URL query params.
const TOP_SAFE    = (typeof window !== 'undefined' && window.__safeArea?.top)    || 0;
const BOTTOM_SAFE = (typeof window !== 'undefined' && window.__safeArea?.bottom) || 0;

// Star color from a 0..1 hash — same palette as before
function starColorFromHash(h) {
  if (h < 0.45) return [255, 248, 230];
  if (h < 0.70) return [255, 238, 200];
  if (h < 0.82) return [200, 220, 255];
  if (h < 0.92) return [255, 200, 170];
  if (h < 0.97) return [255, 170, 150];
  return [180, 240, 255];
}

// Generate one star's intrinsic properties from its seed
function buildStar(seed, rng) {
  // Position: uniformly in a cube, but push to a ring so no stars directly in center
  const x = (rng() - 0.5) * 2 * Z_MAX;
  const y = (rng() - 0.5) * 2 * Z_MAX;
  const z = rng() * (Z_MAX - Z_MIN) + Z_MIN;
  // Intrinsic size/brightness
  const h1 = rng();
  const h2 = rng();
  const h3 = rng();
  // Most stars small, occasional giant
  let intrinsicRadius;
  const rarity = h3;
  if (rarity < 0.02) intrinsicRadius = 3.0 + h2 * 2.0;   // rare giants
  else if (rarity < 0.15) intrinsicRadius = 1.5 + h2 * 1.0;
  else if (rarity < 0.60) intrinsicRadius = 0.8 + h2 * 0.5;
  else intrinsicRadius = 0.4 + h2 * 0.4;
  const intrinsicBright = 0.7 + h1 * 0.3;
  return {
    seed,
    x, y, z,
    color: starColorFromHash(h1),
    radius: intrinsicRadius,
    bright: intrinsicBright,
    // Twinkle phase
    phase: h2 * Math.PI * 2,
  };
}

export class Starfield3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.seed = opts.seed ?? 42;
    this.rng = makeRng(this.seed);
    this.nextStarSeed = this.seed;

    this.speed = opts.speed ?? 8;   // z units per second
    this.baseSpeed = this.speed;    // cruise speed
    this.stars = [];
    this.densityMultiplier = opts.densityMultiplier ?? 1.0;
    // Seed stars with a bias toward CLOSER z, so the sky isn't empty on load.
    // Cube-root distribution makes distance feel uniform in screen density.
    const starCount = this._targetStarCount();
    for (let i = 0; i < starCount; i++) {
      this._appendStar();
    }

    // Target tracking
    this.targetIdx = null;
    this.lastTime = performance.now();

    // When a star is recycled, its z goes to Z_MAX — but we keep its IDENTITY
    // (seed-derived properties) so that the SAME star at the same z behaves
    // consistently. Recycled stars get brand-new seeds however.
  }

  setSpeed(s) { this.speed = s; }

  _targetStarCount() {
    const area = (this.canvas.width || REFERENCE_AREA) * (this.canvas.height || 1);
    return Math.max(
      100,
      Math.round(REFERENCE_STAR_COUNT * this.densityMultiplier * area / REFERENCE_AREA)
    );
  }

  _appendStar() {
    const s = buildStar(this.nextStarSeed++, this.rng);
    // Remap z so ~60% of stars are within Z_MAX*0.4 (close-ish).
    s.z = Z_MIN + Math.pow(this.rng(), 2.2) * (Z_MAX - Z_MIN);
    this.stars.push(s);
  }

  setDensity(mult) {
    if (!Number.isFinite(mult) || mult <= 0) return;
    if (mult === this.densityMultiplier) return;
    this.densityMultiplier = mult;
    const target = this._targetStarCount();
    while (this.stars.length < target) this._appendStar();
    if (this.stars.length > target) {
      this.stars.length = target;
      if (this.targetIdx !== null && this.targetIdx >= target) this.targetIdx = null;
    }
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Advance: decrease z for every star
    const dz = this.speed * dt;
    const { canvas } = this;
    const W = canvas.width, H = canvas.height;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.z -= dz;
      // Recycle if past camera, OR if projected way off-screen with no hope
      let recycle = s.z < Z_MIN;
      if (!recycle) {
        const sx = W / 2 + (s.x / s.z) * FOCAL;
        const sy = H / 2 + (s.y / s.z) * FOCAL;
        if (sx < -W || sx > 2 * W || sy < -H || sy > 2 * H) recycle = true;
      }
      if (recycle) {
        const newStar = buildStar(this.nextStarSeed++, this.rng);
        newStar.z = Z_MAX;
        this.stars[i] = newStar;
        if (this.targetIdx === i) this.targetIdx = null;
      }
    }
  }

  render(now) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const t = now * 0.001;

    // Streak factor — when speed is far above baseSpeed, stars stretch radially
    // outward, giving the Star Trek warp effect.
    const streakFactor = Math.max(0, (this.speed / this.baseSpeed) - 1.5) * 0.25;

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const z = s.z;
      if (z < Z_MIN) continue;

      const sx = cx + (s.x / z) * FOCAL;
      const sy = cy + (s.y / z) * FOCAL;
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

      // Perspective size + brightness
      const scale = FOCAL / z;
      const r = s.radius * scale * 0.25 + 0.6;    // px radius
      // Brightness falloff: very far = dim, close = bright
      let alpha = s.bright * Math.min(1, scale * 0.5 + 0.15);
      // Twinkle
      alpha *= 0.93 + 0.07 * Math.sin(t * 2 + s.phase);

      const col = s.color;

      // If this is the tracked target, give it extra glow
      const isTarget = (this.targetIdx === i);

      if (streakFactor > 0.05) {
        // Draw streak: a line from where the star WAS to where it IS,
        // fading toward the tail. Direction = radial from center.
        const dx = sx - cx, dy = sy - cy;
        const distFromCenter = Math.hypot(dx, dy);
        if (distFromCenter > 1) {
          const ux = dx / distFromCenter, uy = dy / distFromCenter;
          // Length proportional to streakFactor and distance from center
          const len = Math.min(distFromCenter * streakFactor * 1.2, 300);
          const tailX = sx - ux * len;
          const tailY = sy - uy * len;
          const grad = ctx.createLinearGradient(tailX, tailY, sx, sy);
          grad.addColorStop(0, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0)`);
          grad.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha * 0.9})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = Math.max(1, r * 0.8);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
      }

      // Halo
      const haloR = r * (6 + (isTarget ? 10 : 0));
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
      halo.addColorStop(0, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha * 0.45})`);
      halo.addColorStop(0.3, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${alpha * 0.12})`);
      halo.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${Math.min(1, alpha)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Project a star to screen coords — for use by HUD
  projectStar(star) {
    if (!star || star.z < Z_MIN) return null;
    const { canvas } = this;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const sx = cx + (star.x / star.z) * FOCAL;
    const sy = cy + (star.y / star.z) * FOCAL;
    return { x: sx, y: sy, z: star.z, scale: FOCAL / star.z };
  }

  // Pick a "target" star — one that's currently far-ish (high z) and near the
  // viewport center, so it'll grow toward us over a long time before reaching
  // the edge. Returns the star object (not a copy) so we can track it.
  pickTarget() {
    const W = this.canvas.width, H = this.canvas.height;
    const cx = W / 2, cy = H / 2;
    // Center box where we'll accept candidates (central 40% of screen)
    const inX = W * 0.20, inY = H * 0.20;

    // We want candidates that are FAR away so they last a long time
    const Z_CANDIDATE_MIN = Z_MAX * 0.55;

    const candidates = [];
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (s.z < Z_CANDIDATE_MIN) continue;
      const proj = this.projectStar(s);
      if (!proj) continue;
      if (proj.x < inX || proj.x > W - inX) continue;
      if (proj.y < inY + TOP_SAFE || proj.y > H - inY - BOTTOM_SAFE) continue;
      candidates.push(i);
    }
    if (candidates.length === 0) return null;
    // Pick randomly
    const pick = candidates[Math.floor(this.rng() * candidates.length)];
    this.targetIdx = pick;
    return this.stars[pick];
  }

  // Get current tracked star (or null if lost / recycled)
  getTarget() {
    if (this.targetIdx === null) return null;
    return this.stars[this.targetIdx];
  }

  // Check if current target has left the visible area OR is too close (z< some threshold)
  targetOutOfBounds() {
    const s = this.getTarget();
    if (!s) return true;
    const proj = this.projectStar(s);
    if (!proj) return true;
    const W = this.canvas.width, H = this.canvas.height;
    const margin = 50;
    if (proj.x < margin || proj.x > W - margin) return true;
    if (proj.y < margin + TOP_SAFE || proj.y > H - margin - BOTTOM_SAFE) return true;
    // Also recycle if it got very close (flew past)
    if (s.z < Z_MAX * 0.08) return true;
    return false;
  }

  // Time-until-out estimate (seconds) — based on current angular velocity
  // A star at (x, y, z) moves radially outward on screen as z decreases.
  // dr/dt relative to center: r = sqrt(x^2+y^2)/z * F; dr/dt = (r/z) * (dz/dt) = (r * speed / z)
  estimateTargetLifetime() {
    const s = this.getTarget();
    if (!s) return 0;
    const proj = this.projectStar(s);
    if (!proj) return 0;
    const W = this.canvas.width, H = this.canvas.height;
    const cx = W / 2, cy = H / 2;
    const distFromCenter = Math.hypot(proj.x - cx, proj.y - cy);
    // Screen-radial speed (px/s): distFromCenter * speed / z
    const radialSpeed = (distFromCenter * this.speed) / s.z + 0.001;
    // Time until it reaches nearest edge
    const toEdgeX = proj.x < cx ? proj.x : (W - proj.x);
    const toEdgeY = proj.y < cy ? proj.y : (H - proj.y);
    const toEdge = Math.min(toEdgeX, toEdgeY);
    return toEdge / radialSpeed;
  }
}
