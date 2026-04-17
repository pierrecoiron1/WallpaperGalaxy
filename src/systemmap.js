// System map renderer — 1920x1080 canvas showing the currently-selected
// star system. Hard-sci-fi HUD aesthetic: thin 1px strokes, monospace,
// teal palette, dense information density, ornamental frames.

const FG = '#9fdada';       // primary teal
const FG_DIM = '#4c7a7a';   // dim teal
const FG_HOT = '#d4f6f6';   // bright teal (emphasis)
const FG_GOLD = '#c8a66b';  // golden accent (colonization-era)
const BG = '#030810';
const GRID = 'rgba(120, 200, 200, 0.06)';

const FONT_MONO = '"IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace';
const FONT_DISPLAY = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';

// Smooth fade-in between reveal progress `start` and `start + duration`.
// Returns 1.0 after the window closes.
function sMoothSlot(rT, start, duration) {
  if (rT <= start) return 0;
  const local = Math.min(1, (rT - start) / duration);
  // smoothstep
  return local * local * (3 - 2 * local);
}

function rText(ctx, x, y, text, opts = {}) {
  // Reveal gating: if a reveal descriptor is supplied, this text may be
  // hidden, partially typed, or flickering, depending on progress `t` vs the
  // per-line [start..end] slot.
  let str = String(text);
  let cursor = false;
  let flickerAlpha = 1;
  if (opts.reveal) {
    const { t, start, end } = opts.reveal;
    if (t < start) { return; }
    if (t < end) {
      // Linear reveal of characters across the slot
      const local = (t - start) / Math.max(0.0001, end - start);
      const n = Math.max(1, Math.floor(local * str.length));
      str = str.slice(0, n);
      cursor = true;
      // Flicker: mostly fully-on with occasional short dips
      const phase = (t * 37 + x * 0.013 + y * 0.029) * 7;
      const noise = Math.sin(phase) * 0.5 + 0.5;
      flickerAlpha = noise > 0.82 ? 0.35 : 1.0;
    }
  }

  ctx.save();
  if (flickerAlpha < 1) ctx.globalAlpha *= flickerAlpha;
  ctx.fillStyle = opts.color || FG;
  ctx.font = `${opts.weight || 400} ${opts.size || 12}px ${opts.font || FONT_MONO}`;
  const align = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  if (opts.letterSpacing) {
    const spacing = opts.letterSpacing;
    let totalW = 0;
    for (const ch of str) totalW += ctx.measureText(ch).width + spacing;
    totalW -= spacing;
    let startX = x;
    if (align === 'right') startX = x - totalW;
    else if (align === 'center') startX = x - totalW / 2;
    ctx.textAlign = 'left';
    let cur = startX;
    for (const ch of str) {
      ctx.fillText(ch, cur, y);
      cur += ctx.measureText(ch).width + spacing;
    }
    if (cursor) {
      // Blinking caret block at end
      const blink = Math.floor(performance.now() / 90) % 2 === 0;
      if (blink) {
        const h = opts.size || 12;
        ctx.fillRect(cur, y - h + 2, Math.max(4, h * 0.5), h - 1);
      }
    }
  } else {
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
    if (cursor) {
      const m = ctx.measureText(str).width;
      const h = opts.size || 12;
      let cx = x;
      if (align === 'right') cx = x;
      else if (align === 'center') cx = x + m / 2;
      else cx = x + m;
      const blink = Math.floor(performance.now() / 90) % 2 === 0;
      if (blink) {
        ctx.fillRect(cx, y - h + 2, Math.max(4, h * 0.5), h - 1);
      }
    }
  }
  ctx.restore();
}

function rLine(ctx, x1, y1, x2, y2, color = FG_DIM, w = 1, dash = null) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function rRect(ctx, x, y, w, h, color = FG_DIM, lw = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();
}

// Draw a corner bracket (hard-sci-fi HUD frame style)
function rBracket(ctx, x, y, w, h, size = 14, color = FG_DIM) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  // TL
  ctx.moveTo(x, y + size); ctx.lineTo(x, y); ctx.lineTo(x + size, y);
  // TR
  ctx.moveTo(x + w - size, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + size);
  // BR
  ctx.moveTo(x + w, y + h - size); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - size, y + h);
  // BL
  ctx.moveTo(x + size, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - size);
  ctx.stroke();
  ctx.restore();
}

// Dashed ring
function rRing(ctx, cx, cy, r, color = FG_DIM, dash = null, lw = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Planet glyph: small disc with type-color, thin dark limb
function drawPlanet(ctx, x, y, radius, color) {
  // shadow / terminator suggestion
  const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(0.7, color);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // rim
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawStar(ctx, x, y, radius, color) {
  // Multi-layer radial gradient for a soft luminous body
  const outer = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
  outer.addColorStop(0, color);
  outer.addColorStop(0.2, color);
  outer.addColorStop(0.5, 'rgba(255, 220, 180, 0.15)');
  outer.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
  ctx.fill();

  // Bright core
  const core = ctx.createRadialGradient(x, y, 0, x, y, radius);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.4, color);
  core.addColorStop(1, color);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Tick marks around a ring at intervals
function drawTicks(ctx, cx, cy, r, count, tickLen, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * (r + tickLen);
    const y2 = cy + Math.sin(a) * (r + tickLen);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

export class SystemMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.system = null;
    this.t0 = performance.now();
    // For crossfade when switching systems
    this.transitionT = 1; // 0..1
    this.prevSystem = null;
    // Reveal state: when a new system is set we play a streaming/flicker reveal
    this.revealStart = -Infinity;
    this.revealDuration = 3.6; // seconds
    // Stable per-reveal RNG seed for deterministic flicker noise
    this.revealSeed = 1;
  }

  setSystem(system, animate = true) {
    if (animate && this.system) {
      this.prevSystem = this.system;
      this.transitionT = 0;
    }
    this.system = system;
    // Kick off the reveal
    this.revealStart = (performance.now() - this.t0) * 0.001;
    this.revealSeed = (Math.random() * 1e9) | 0;
  }

  // Normalized reveal progress 0..1 based on current tick time `t`.
  _revealT(t) {
    if (!isFinite(this.revealStart)) return 1;
    return Math.max(0, Math.min(1, (t - this.revealStart) / this.revealDuration));
  }

  tick() {
    if (this.transitionT < 1) {
      this.transitionT = Math.min(1, this.transitionT + 0.02);
    }
    this.render();
  }

  render() {
    const { ctx, canvas, system } = this;
    const W = canvas.width, H = canvas.height;
    const t = (performance.now() - this.t0) * 0.001;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    if (this.warpIn) {
      this.renderWarpIn(t, W, H);
      return;
    }

    if (!system) return;

    const rT = this._revealT(t);

    // Faint grid background
    ctx.save();
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    const GRID_STEP = 80;
    for (let x = 0; x < W; x += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    // Crossfade opacity (now mostly handled via reveal — but keep a small fade
    // so the whole chart doesn't pop instantly).
    const fadeIn = Math.min(1, rT * 6); // 0..1 over first ~0.17 of reveal
    const opacity = this.transitionT * fadeIn;
    ctx.save();
    ctx.globalAlpha = opacity;
    this.renderHUD(t, W, H, rT);
    this.renderOrbitalView(t, W, H, rT);
    this.renderReadouts(W, H, rT);
    this.renderPlanetList(W, H, rT);
    ctx.restore();

    // Rising scanline — subtle anime sci-fi touch
    const scanY = (t * 40) % H;
    const scan = ctx.createLinearGradient(0, scanY - 60, 0, scanY + 60);
    scan.addColorStop(0, 'rgba(120, 220, 220, 0)');
    scan.addColorStop(0.5, 'rgba(120, 220, 220, 0.05)');
    scan.addColorStop(1, 'rgba(120, 220, 220, 0)');
    ctx.fillStyle = scan;
    ctx.fillRect(0, scanY - 60, W, 120);

    // Reveal-time CRT overlay: fast downward sweep + faint flicker strobes.
    if (rT < 1) {
      this._renderRevealOverlay(t, rT, W, H);
    }
  }

  // Flicker + fast sweep bar shown during reveal.
  _renderRevealOverlay(t, rT, W, H) {
    const ctx = this.ctx;
    // Full-screen alpha strobe for first 0.15 — quick CRT warm-up flashes
    if (rT < 0.15) {
      const phase = rT * 60; // fast
      const s = Math.sin(phase * 11) * 0.5 + 0.5;
      if (s > 0.55) {
        ctx.save();
        ctx.fillStyle = `rgba(160, 220, 220, ${(0.15 - rT) * 0.8})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
    // Fast downward sweep bar traversing once during rT 0..0.55
    if (rT < 0.55) {
      const local = rT / 0.55;
      const sy = local * (H + 240) - 120;
      ctx.save();
      const grad = ctx.createLinearGradient(0, sy - 80, 0, sy + 80);
      grad.addColorStop(0, 'rgba(210,246,246,0)');
      grad.addColorStop(0.5, 'rgba(210,246,246,0.22)');
      grad.addColorStop(1, 'rgba(210,246,246,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, sy - 80, W, 160);
      ctx.fillStyle = 'rgba(210,246,246,0.6)';
      ctx.fillRect(0, sy, W, 1);
      ctx.restore();
    }
    // Horizontal glitch bars — rare
    const seed = this.revealSeed;
    for (let i = 0; i < 3; i++) {
      const prob = 0.015;
      const jitter = Math.sin((t * 17 + i * 37 + seed) * 13);
      if (jitter > 1 - prob * 2 && rT < 0.8) {
        const by = ((jitter + 1) * H) % H;
        ctx.save();
        ctx.fillStyle = 'rgba(200,240,240,0.12)';
        ctx.fillRect(0, by, W, 2 + Math.abs(jitter * 8));
        ctx.restore();
      }
    }
  }

  renderHUD(t, W, H, rT = 1) {
    const ctx = this.ctx;
    const sys = this.system;

    // --- Top bar --- (slot 0.02..0.10 for chrome/small text, 0.06..0.22 for big name)
    const headerAlpha = sMoothSlot(rT, 0.02, 0.08);
    ctx.save();
    ctx.globalAlpha *= headerAlpha;
    rLine(ctx, 40, 60, W - 40, 60, FG_DIM);
    rText(ctx, 40, 40, 'INTERSTELLAR COMMONWEALTH · CARTOGRAPHIC SERVICE', {
      size: 11, color: FG_DIM, letterSpacing: 2,
      reveal: { t: rT, start: 0.03, end: 0.12 },
    });
    ctx.restore();

    // Hero name — types in slowly
    rText(ctx, 40, 88, sys.fullName, {
      size: 42, weight: 300, color: FG_HOT, font: FONT_DISPLAY, letterSpacing: 2,
      reveal: { t: rT, start: 0.06, end: 0.22 },
    });

    ctx.save();
    ctx.globalAlpha *= sMoothSlot(rT, 0.12, 0.06);
    rText(ctx, 40, 112, `SYSTEM CHART · ${sys.charterNumber} · ${sys.galCoord}`, {
      size: 11, color: FG_DIM, letterSpacing: 2,
      reveal: { t: rT, start: 0.12, end: 0.20 },
    });
    ctx.restore();

    // Status badge (top right) — flicker on
    const statusColor = {
      'CORE': FG_GOLD, 'SETTLED': FG_HOT, 'FRONTIER': FG, 'SURVEY': FG_DIM, 'UNCHARTED': '#c87070',
    }[sys.status] || FG_DIM;
    const statusText = sys.status;
    ctx.save();
    ctx.font = `500 14px ${FONT_MONO}`;
    const statusW = ctx.measureText(statusText).width + 40;
    ctx.restore();

    const badgeAlpha = sMoothSlot(rT, 0.18, 0.04);
    // Blink the badge on during flicker window
    const badgeFlicker = rT < 0.24 ? (Math.sin(rT * 180) > 0.3 ? 1 : 0.2) : 1;
    ctx.save();
    ctx.globalAlpha *= badgeAlpha * badgeFlicker;
    rRect(ctx, W - 40 - statusW, 34, statusW, 28, statusColor);
    rText(ctx, W - 40 - statusW + 20, 53, statusText, {
      size: 14, color: statusColor, letterSpacing: 3, weight: 500,
    });
    rText(ctx, W - 40 - statusW, 82, sys.surveyYear ? `SURVEYED ${sys.surveyYear} IC` : 'NO SURVEY ON RECORD', {
      size: 10, color: FG_DIM, letterSpacing: 2,
    });
    ctx.restore();

    // Rolling timestamp ticker (bottom)
    const time = new Date();
    const stardate = (time.getUTCFullYear() + 300) + '.' + (time.getUTCMonth() + 1) + '.' + time.getUTCDate();
    ctx.save();
    ctx.globalAlpha *= sMoothSlot(rT, 0.85, 0.10);
    rLine(ctx, 40, H - 44, W - 40, H - 44, FG_DIM);
    rText(ctx, 40, H - 22, `TRANSMISSION STABLE · COMMONWEALTH STANDARD ${stardate}`, {
      size: 10, color: FG_DIM, letterSpacing: 2,
    });
    rText(ctx, W - 40, H - 22, `CH·VII //  PRIME CATALOGUE`, {
      size: 10, color: FG_DIM, letterSpacing: 2, align: 'right',
    });
    ctx.restore();
  }

  renderOrbitalView(t, W, H, rT = 1) {
    const ctx = this.ctx;
    const sys = this.system;

    // Orbital plot in right-center — leave left for readouts
    const cx = W * 0.58;
    const cy = H * 0.54;
    const maxR = Math.min(W * 0.36, H * 0.4);

    // Outer frame brackets — appear mid-reveal
    const frameAlpha = sMoothSlot(rT, 0.28, 0.06);
    const frameX = cx - maxR - 40;
    const frameY = cy - maxR - 40;
    const frameSize = (maxR + 40) * 2;
    ctx.save();
    ctx.globalAlpha *= frameAlpha;
    rBracket(ctx, frameX, frameY, frameSize, frameSize, 18, FG_DIM);
    rText(ctx, frameX + 24, frameY + 14, 'ORBITAL VIEW — PLANE OF ECLIPTIC', {
      size: 10, color: FG_DIM, letterSpacing: 2,
      reveal: { t: rT, start: 0.30, end: 0.40 },
    });
    rText(ctx, frameX + frameSize - 24, frameY + 14, `SCALE 1:${Math.floor(8 + sys.planets.length * 2)} AU`, {
      size: 10, color: FG_DIM, letterSpacing: 2, align: 'right',
      reveal: { t: rT, start: 0.32, end: 0.42 },
    });
    ctx.restore();

    // Compute orbit radii in pixels
    const maxOrbit = sys.planets[sys.planets.length - 1].orbit;
    const scale = maxR / (maxOrbit * 1.1);

    // Draw rings — sweep in from inner to outer
    for (let i = 0; i < sys.planets.length; i++) {
      const p = sys.planets[i];
      const r = p.orbit * scale;
      const ringStart = 0.38 + (i / sys.planets.length) * 0.18;
      const ringAlpha = sMoothSlot(rT, ringStart, 0.06);
      if (ringAlpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha *= ringAlpha;
      const isHab = p.type === 'terra' || p.type === 'ocean';
      rRing(ctx, cx, cy, r, isHab ? 'rgba(200, 166, 107, 0.35)' : 'rgba(159, 218, 218, 0.18)',
            isHab ? null : [2, 4], 1);
      ctx.restore();
    }

    // Ticks at outermost orbit — gated with frame
    ctx.save();
    ctx.globalAlpha *= frameAlpha;
    drawTicks(ctx, cx, cy, maxR + 2, 24, 6, FG_DIM);
    drawTicks(ctx, cx, cy, maxR + 2, 8, 12, FG);
    rText(ctx, cx, cy - maxR - 20, '0°', { size: 10, color: FG_DIM, align: 'center' });
    rText(ctx, cx + maxR + 24, cy + 4, '90°', { size: 10, color: FG_DIM });
    rText(ctx, cx, cy + maxR + 32, '180°', { size: 10, color: FG_DIM, align: 'center' });
    rText(ctx, cx - maxR - 28, cy + 4, '270°', { size: 10, color: FG_DIM, align: 'right' });
    ctx.restore();

    // Draw the star — pops in with a flash at rT ~0.32
    const starAlpha = sMoothSlot(rT, 0.34, 0.06);
    const starFlash = rT < 0.42 ? 1 + Math.max(0, (0.42 - rT) / 0.08) * 2 : 1;
    if (starAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha *= starAlpha;
      const starR = (14 + sys.starRadius * 8) * starFlash;
      drawStar(ctx, cx, cy, starR, sys.starColor);
      ctx.restore();
    }

    // Draw planets at current angle — staggered spawn with a brief flash each
    for (let i = 0; i < sys.planets.length; i++) {
      const p = sys.planets[i];
      const r = p.orbit * scale;
      const speed = 0.08 / Math.pow(p.orbit, 0.5);
      const a = p.angle + t * speed;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      const pr = Math.max(3, Math.min(14, 3 + p.radius * 2));

      // Planet-level stagger: 0.60 .. 0.90
      const pStart = 0.60 + (i / Math.max(1, sys.planets.length)) * 0.28;
      const pAlpha = sMoothSlot(rT, pStart, 0.04);
      if (pAlpha <= 0.01) continue;
      // Flash as each planet locks
      const flashWin = 0.06;
      const flash = (rT > pStart && rT < pStart + flashWin)
        ? 1 - (rT - pStart) / flashWin : 0;

      ctx.save();
      ctx.globalAlpha *= pAlpha;

      // Rings behind the planet
      if (p.hasRings) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-0.4);
        ctx.scale(1, 0.25);
        ctx.strokeStyle = 'rgba(255, 220, 180, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, pr * 1.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, pr * 2.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      drawPlanet(ctx, px, py, pr * (1 + flash * 0.4), p.color);
      if (flash > 0) {
        ctx.save();
        ctx.globalAlpha *= flash;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(px, py, pr * (1 + flash * 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Planet designation (I, II, III ...)
      const labelOffset = pr + 10;
      const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X'][i] || (i + 1);
      rText(ctx, px + labelOffset, py + 4, roman, {
        size: 11, color: FG, letterSpacing: 1,
      });
      rLine(ctx, px, py, px + labelOffset - 4, py, FG_DIM);

      if (p.type === 'terra' || p.type === 'ocean') {
        rBracket(ctx, px - pr - 5, py - pr - 5, (pr + 5) * 2, (pr + 5) * 2, 4, FG_GOLD);
      }
      ctx.restore();
    }

    // Ecliptic line (horizontal)
    ctx.save();
    ctx.globalAlpha *= frameAlpha;
    rLine(ctx, cx - maxR, cy, cx + maxR, cy, 'rgba(159, 218, 218, 0.08)', 1);
    rLine(ctx, cx, cy - maxR, cx, cy + maxR, 'rgba(159, 218, 218, 0.08)', 1);
    ctx.restore();
  }

  renderReadouts(W, H, rT = 1) {
    const ctx = this.ctx;
    const sys = this.system;

    // Left column — star readouts.  Section header flickers in first.
    const colX = 40;
    let y = 180;
    const rowH = 26;

    const headerAlpha = sMoothSlot(rT, 0.16, 0.04);
    ctx.save();
    ctx.globalAlpha *= headerAlpha;
    rText(ctx, colX, y, 'PRIMARY · STELLAR DATA', {
      size: 11, color: FG_DIM, letterSpacing: 2,
      reveal: { t: rT, start: 0.16, end: 0.22 },
    });
    y += 16;
    rLine(ctx, colX, y, colX + 320, y, FG_DIM);
    y += 20;
    ctx.restore();

    const rows = [
      ['DESIGNATION', sys.designation],
      ['SPECTRAL CLASS', sys.spectralClass + 'V'],
      ['EFF. TEMPERATURE', `${sys.temperature.toLocaleString()} K`],
      ['MASS (SOL ☉)', `${sys.mass.toFixed(2)}`],
      ['RADIUS (SOL ☉)', `${sys.starRadius.toFixed(2)}`],
      ['LUMINOSITY (SOL ☉)', `${sys.luminosity.toFixed(2)}`],
      ['PROPER MOTION', sys.proper],
      ['DISTANCE', sys.distance],
    ];

    // Each row staggers in between 0.22 and 0.48
    for (let i = 0; i < rows.length; i++) {
      const [k, v] = rows[i];
      const rowStart = 0.22 + (i / rows.length) * 0.20;
      const a = sMoothSlot(rT, rowStart, 0.05);
      if (a > 0.01) {
        ctx.save();
        ctx.globalAlpha *= a;
        rText(ctx, colX, y, k, {
          size: 11, color: FG_DIM, letterSpacing: 2,
          reveal: { t: rT, start: rowStart, end: rowStart + 0.04 },
        });
        rText(ctx, colX + 320, y, String(v), {
          size: 13, color: FG_HOT, align: 'right',
          reveal: { t: rT, start: rowStart + 0.01, end: rowStart + 0.06 },
        });
        ctx.restore();
      }
      y += rowH;
    }

    // Sub-frame for system-wide metrics
    y += 20;
    const aggHeaderAlpha = sMoothSlot(rT, 0.45, 0.04);
    ctx.save();
    ctx.globalAlpha *= aggHeaderAlpha;
    rText(ctx, colX, y, 'SYSTEM · AGGREGATE', {
      size: 11, color: FG_DIM, letterSpacing: 2,
      reveal: { t: rT, start: 0.45, end: 0.50 },
    });
    y += 16;
    rLine(ctx, colX, y, colX + 320, y, FG_DIM);
    y += 20;
    ctx.restore();

    const totalMoons = sys.planets.reduce((a, p) => a + p.moons, 0);
    const habCount = sys.planets.filter(p => p.type === 'terra' || p.type === 'ocean').length;

    const sysRows = [
      ['PLANETARY BODIES', String(sys.planets.length)],
      ['NATURAL SATELLITES', String(totalMoons)],
      ['HABITABLE ZONES', String(habCount)],
      ['CHARTER', sys.charterNumber],
    ];
    for (let i = 0; i < sysRows.length; i++) {
      const [k, v] = sysRows[i];
      const rowStart = 0.48 + (i / sysRows.length) * 0.10;
      const a = sMoothSlot(rT, rowStart, 0.04);
      if (a > 0.01) {
        ctx.save();
        ctx.globalAlpha *= a;
        rText(ctx, colX, y, k, { size: 11, color: FG_DIM, letterSpacing: 2,
          reveal: { t: rT, start: rowStart, end: rowStart + 0.04 } });
        rText(ctx, colX + 320, y, String(v), { size: 13, color: FG_HOT, align: 'right',
          reveal: { t: rT, start: rowStart + 0.01, end: rowStart + 0.05 } });
        ctx.restore();
      }
      y += rowH;
    }
  }

  renderPlanetList(W, H, rT = 1) {
    const ctx = this.ctx;
    const sys = this.system;

    // Right column — planet table
    const colX = W - 40 - 360;
    const colW = 360;
    let y = 180;

    const headerAlpha = sMoothSlot(rT, 0.20, 0.04);
    ctx.save();
    ctx.globalAlpha *= headerAlpha;
    rText(ctx, colX, y, 'PLANETARY MANIFEST', {
      size: 11, color: FG_DIM, letterSpacing: 2,
      reveal: { t: rT, start: 0.20, end: 0.25 },
    });
    y += 16;
    rLine(ctx, colX, y, colX + colW, y, FG_DIM);
    y += 20;

    // Table header
    rText(ctx, colX, y, 'NO.', { size: 10, color: FG_DIM, letterSpacing: 2 });
    rText(ctx, colX + 36, y, 'DESIGNATION', { size: 10, color: FG_DIM, letterSpacing: 2 });
    rText(ctx, colX + colW - 80, y, 'TYPE', { size: 10, color: FG_DIM, letterSpacing: 2 });
    rText(ctx, colX + colW, y, 'SURVEY', { size: 10, color: FG_DIM, letterSpacing: 2, align: 'right' });
    y += 10;
    rLine(ctx, colX, y, colX + colW, y, FG_DIM, 1, [2, 2]);
    y += 18;
    ctx.restore();

    const romanNums = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
    for (let i = 0; i < sys.planets.length; i++) {
      const p = sys.planets[i];
      // Each row staggers in 0.25 .. 0.78
      const rowStart = 0.25 + (i / Math.max(1, sys.planets.length)) * 0.50;
      const a = sMoothSlot(rT, rowStart, 0.05);
      if (a <= 0.01) { y += 24; continue; }

      ctx.save();
      ctx.globalAlpha *= a;

      // color swatch with a brief "power on" flash
      const flashWin = 0.05;
      const flash = (rT > rowStart && rT < rowStart + flashWin)
        ? 1 - (rT - rowStart) / flashWin : 0;
      ctx.fillStyle = p.color;
      ctx.fillRect(colX, y - 9, 10, 10);
      if (flash > 0) {
        ctx.save();
        ctx.globalAlpha *= flash;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(colX - 2, y - 11, 14, 14);
        ctx.restore();
      }

      rText(ctx, colX + 16, y, romanNums[i] || String(i + 1), {
        size: 12, color: FG, letterSpacing: 1,
      });
      rText(ctx, colX + 48, y, p.name, {
        size: 12, color: FG_HOT,
        reveal: { t: rT, start: rowStart, end: rowStart + 0.05 },
      });
      rText(ctx, colX + colW - 80, y, p.typeLabel, {
        size: 10, color: FG_DIM, letterSpacing: 2,
        reveal: { t: rT, start: rowStart + 0.01, end: rowStart + 0.05 },
      });
      const surveyColor = p.survey === 'CHARTED' ? FG_GOLD : (p.survey === 'PRELIMINARY' ? FG : FG_DIM);
      rText(ctx, colX + colW, y, p.survey, {
        size: 10, color: surveyColor, letterSpacing: 2, align: 'right',
        reveal: { t: rT, start: rowStart + 0.02, end: rowStart + 0.06 },
      });
      ctx.restore();
      y += 24;
    }
  }

  renderWarpIn(t, W, H) {
    const ctx = this.ctx;

    // Faint background grid
    ctx.save();
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    const STEP = 80;
    for (let x = 0; x < W; x += STEP) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += STEP) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
    }
    ctx.restore();

    // Top & bottom frame
    rText(ctx, 40, 40, 'INTERSTELLAR COMMONWEALTH · CARTOGRAPHIC SERVICE', {
      size: 11, color: FG_DIM, letterSpacing: 2,
    });
    rLine(ctx, 40, 60, W - 40, 60, FG_DIM);
    rLine(ctx, 40, H - 44, W - 40, H - 44, FG_DIM);
    rText(ctx, 40, H - 22, 'TELEMETRY LINK · ESTABLISHING', {
      size: 10, color: FG_DIM, letterSpacing: 2,
    });
    rText(ctx, W - 40, H - 22, 'NO TARGET LOCK', {
      size: 10, color: FG_DIM, letterSpacing: 2, align: 'right',
    });

    // Center content
    const cx = W / 2, cy = H / 2;

    // Rotating compass / reticle
    ctx.save();
    ctx.translate(cx, cy - 120);
    ctx.strokeStyle = FG_GOLD;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 140, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Inner solid ring
    ctx.strokeStyle = 'rgba(200, 166, 107, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, Math.PI * 2);
    ctx.stroke();
    // Rotating tick marks
    ctx.rotate(t * 0.8);
    for (let i = 0; i < 24; i++) {
      ctx.rotate((Math.PI * 2) / 24);
      ctx.beginPath();
      ctx.moveTo(0, -140);
      ctx.lineTo(0, -150);
      ctx.strokeStyle = i % 6 === 0 ? FG_GOLD : FG_DIM;
      ctx.stroke();
    }
    ctx.restore();

    // Crosshair at center of reticle
    ctx.save();
    ctx.strokeStyle = FG_HOT;
    ctx.lineWidth = 1;
    const cxX = cx, cxY = cy - 120;
    ctx.beginPath();
    ctx.moveTo(cxX - 30, cxY); ctx.lineTo(cxX - 8, cxY);
    ctx.moveTo(cxX + 8, cxY); ctx.lineTo(cxX + 30, cxY);
    ctx.moveTo(cxX, cxY - 30); ctx.lineTo(cxX, cxY - 8);
    ctx.moveTo(cxX, cxY + 8); ctx.lineTo(cxX, cxY + 30);
    ctx.stroke();
    ctx.restore();

    // Big "initiating" headline
    rText(ctx, cx, cy + 60, 'LIGHT-SPEED TRANSIT', {
      size: 52, weight: 200, color: FG_HOT, font: FONT_DISPLAY,
      letterSpacing: 10, align: 'center',
    });
    rText(ctx, cx, cy + 100, 'INITIATING', {
      size: 14, color: FG_GOLD, letterSpacing: 12, align: 'center',
    });

    // Progress bar
    const barW = 520, barH = 4;
    const barX = cx - barW / 2, barY = cy + 150;
    // Outline
    ctx.strokeStyle = FG_DIM;
    ctx.strokeRect(barX - 0.5, barY - 0.5, barW + 1, barH + 1);
    // Fill — sync with real warmup elapsed. We don't have that here directly,
    // so animate based on t modulo — the external warmup manager will set
    // this.warpIn=false when done, so we just need a motion effect.
    const progPhase = (t * 0.12) % 1;
    const fillW = Math.min(barW, progPhase * barW);
    ctx.fillStyle = FG_GOLD;
    ctx.fillRect(barX, barY, fillW, barH);

    // Status scroll (animated text lines)
    const lines = [
      'CATALOGING VICINITY',
      'GRAVITATIONAL WAKE · STABLE',
      'BOW SHOCK SUPPRESSION · ENGAGED',
      'ASTROGATION LOCK · RESOLVING',
      'HOPPERCRAFT "ARDENT" · UNDERWAY',
      'PARSING FOREWARD STAR DENSITY',
      'SHIELD HARMONICS NOMINAL',
      'CHARTER NAV CORRIDORS ACQUIRED',
    ];
    const lineY = cy + 190;
    for (let i = 0; i < 4; i++) {
      const idx = (Math.floor(t * 1.8) + i) % lines.length;
      const alpha = 1 - (i / 4) * 0.7;
      rText(ctx, cx, lineY + i * 18, '▸ ' + lines[idx], {
        size: 11, color: FG_DIM, letterSpacing: 2, align: 'center',
      });
      ctx.globalAlpha = 1;
    }

    // Corner brackets
    rBracket(ctx, 40, 80, W - 80, H - 140, 24, FG_DIM);
  }
}
