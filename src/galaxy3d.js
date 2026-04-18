// Galaxy flythrough using 3D-projected starfield.
// Gives the "forward flight" sensation — stars start dim/small at high z,
// grow brighter and larger as z decreases, then get recycled.
//
// Exposes the same shape the HUD & main loop expect so it can be dropped in
// place of the 2D parallax Galaxy.

import { Starfield3D } from './starfield3d.js';
import { makeRng } from './rng.js';

const BG_COLOR = '#020609';

export class Galaxy3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.seed = opts.seed ?? 42;
    this.rng = makeRng(this.seed);

    this.starfield = new Starfield3D(canvas, { seed: this.seed, speed: opts.speed ?? 12 });

    // Pseudo-"camera" state for HUD compatibility. camX/camY represent
    // elapsed forward travel for the odometer display.
    this.camX = 0;
    this.camY = 0;
    this.camVX = 0;
    this.camVY = 0;
    this.totalTravel = 0;

    this.startTime = performance.now();
    this.lastTime = this.startTime;
  }

  setSpeed(vxIgnored, vyIgnored) {
    // Legacy signature — accept a multiplier in vx
    // Main HTML passes (6 * multiplier, 2.5 * multiplier); we map magnitude to z-speed.
    const mag = Math.hypot(vxIgnored, vyIgnored);
    // Base z-speed was 12 at multiplier 1.0 (mag ~= 6.5). Scale.
    this.starfield.setSpeed(Math.max(1, (mag / 6.5) * 12));
    this.camVX = vxIgnored;
    this.camVY = vyIgnored;
  }

  setDensity(mult) { this.starfield.setDensity(mult); }

  // ---- Compatibility shims for HUD ----
  // In 3D mode, the "tracked star" is an index into the starfield. The HUD
  // called via setTrackedStar(starRef, system); starRef here is the star object.

  pickRandomVisibleStar() {
    const star = this.starfield.pickTarget();
    if (!star) return null;
    // Return a HUD-facing reference
    return {
      star,
      seedHash: star.seed >>> 0,
      // The HUD expects worldX/worldY/layerSeed/parallax — we'll override
      // projection in Galaxy3D.projectTracked() and give the HUD a direct
      // getTrackedScreen method via setHighlight.
    };
  }

  setHighlight(starRef) {
    this.highlightStar = starRef;
  }

  // Returns {x, y, scale} of tracked star on screen, or null if off-screen/lost
  getTrackedScreen() {
    if (!this.highlightStar) return null;
    const s = this.highlightStar.star;
    return this.starfield.projectStar(s);
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Track travel distance for odometer
    this.totalTravel += this.starfield.speed * dt;
    this.camX = this.totalTravel;           // forward axis
    this.camY = this.totalTravel * 0.37;    // drift axis (fake — just for flavor)

    this.starfield.tick();
    this.render(now);
  }

  render(now) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;

    // Deep-black background with a hint of teal toward center
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    // Very subtle central atmospheric glow
    const cg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
    cg.addColorStop(0, 'rgba(20, 60, 80, 0.15)');
    cg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);

    // 3D stars
    this.starfield.render(now);

    // Subtle vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // Called each tick by main HTML — returns true if tracked star has left
  // the safe viewing area so main can schedule a new one.
  shouldHandover() {
    return this.starfield.targetOutOfBounds();
  }
}
