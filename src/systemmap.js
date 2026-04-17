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
    this.renderTelemetry(t, W, H, rT);
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
    // --- Top bar (revised layout) ---
    //   y=80   hero system name (left), "SYSTEM CHART ..." centered,
    //           "INTERSTELLAR COMMONWEALTH..." right-justified  — all same baseline
    //   y=100  divider line
    const TOP_RULE_Y = 100;
    const manifestRightEdge = W - 40;
    const HEADER_BASE_Y = 80;

    // Hero name — left side
    rText(ctx, 40, HEADER_BASE_Y, sys.fullName, {
      size: 42, weight: 300, color: FG_HOT, font: FONT_DISPLAY, letterSpacing: 2,
      reveal: { t: rT, start: 0.06, end: 0.22 },
    });

    // Coordinates — centered, same baseline as the hero name
    const coordAlpha = sMoothSlot(rT, 0.12, 0.06);
    ctx.save();
    ctx.globalAlpha *= coordAlpha;
    rText(ctx, W / 2, HEADER_BASE_Y, `SYSTEM CHART · ${sys.charterNumber} · ${sys.galCoord}`, {
      size: 11, color: FG_DIM, letterSpacing: 2, align: 'center',
      reveal: { t: rT, start: 0.12, end: 0.20 },
    });
    ctx.restore();

    // Commonwealth line — right-justified, same baseline
    const headerAlpha = sMoothSlot(rT, 0.02, 0.08);
    ctx.save();
    ctx.globalAlpha *= headerAlpha;
    rText(ctx, manifestRightEdge, HEADER_BASE_Y, 'INTERSTELLAR COMMONWEALTH · CARTOGRAPHIC SERVICE', {
      size: 11, color: FG_DIM, letterSpacing: 2, align: 'right',
      reveal: { t: rT, start: 0.03, end: 0.12 },
    });
    // Top divider, lowered to sit under the hero name
    rLine(ctx, 40, TOP_RULE_Y, W - 40, TOP_RULE_Y, FG_DIM);
    ctx.restore();

    // Status badge (top right) — flicker on
    const statusColor = {
      'CORE': FG_GOLD, 'SETTLED': FG_HOT, 'FRONTIER': FG, 'SURVEY': FG_DIM, 'UNCHARTED': '#c87070',
    }[sys.status] || FG_DIM;
    const statusText = sys.status;

    // Status badge is drawn later (between SYSTEM · AGGREGATE and PLANETARY
    // MANIFEST — see renderPlanetList). We still need the status color /
    // label available for that call.
    this._statusColor = statusColor;
    this._statusText = statusText;

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

    // Orbital plot.  Anchor the frame's left bracket at x=424 (24px gap from
    // the tables that end at x=400) rather than centering the view in the
    // available strip — the vertical-limited circle was leaving too much
    // empty space on the left.  The right column is still reserved.
    const TABLES_RIGHT = 40 + 360;
    const GAP = 24;
    const targetFrameX = TABLES_RIGHT + GAP;   // bracket sits here = 424
    const rightEdge = W - 40 - 360 - 20;       // preserve right-side reservation
    // Max radius is limited by whichever is smaller: available horizontal
    // room from targetFrameX+40 (inner orbit start) to rightEdge-40, OR the
    // vertical budget (H * 0.4).
    const availableWidth = rightEdge - (targetFrameX + 40) - 40; // room for diameter
    const maxR = Math.min(availableWidth / 2, H * 0.4);
    const cx = targetFrameX + 40 + maxR;       // center = leftInner + radius
    const cy = H * 0.54;

    // Outer frame brackets — appear mid-reveal.
    // Clamp the frame so its bottom brackets sit ABOVE the H-44 divider line
    // (leave ~24px gap so the bracket glyph is clearly above the rule).
    const frameAlpha = sMoothSlot(rT, 0.28, 0.06);
    let frameX = cx - maxR - 40;
    let frameY = cy - maxR - 40;
    let frameSize = (maxR + 40) * 2;
    const frameBottomLimit = H - 44 - 24;
    if (frameY + frameSize > frameBottomLimit) {
      frameSize = frameBottomLimit - frameY;
    }
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
    // Align the TOP of the header text with the top of the orbital view frame
    // (same y as the UNCHARTED badge). Mirror the orbital-view geometry here.
    const _cy = H * 0.54;
    const _leftE = 360 + 20;
    const _rightE = (W - 40 - 360) - 20;
    const _stripHalf = (_rightE - _leftE) / 2;
    const _maxR = Math.min(_stripHalf - 40, H * 0.4);
    const frameTopY = Math.round(_cy - _maxR - 40);
    // Baseline so cap-top sits at frameTopY (11px font → cap ≈ 8px).
    let y = frameTopY + 10;
    const rowH = 26;

    const headerAlpha = sMoothSlot(rT, 0.16, 0.04);
    ctx.save();
    ctx.globalAlpha *= headerAlpha;
    rText(ctx, colX, y, 'PRIMARY · STELLAR DATA', {
      size: 11, color: FG_DIM, letterSpacing: 2,
      reveal: { t: rT, start: 0.16, end: 0.22 },
    });
    y += 16;
    rLine(ctx, colX, y, colX + 360, y, FG_DIM);
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
        rText(ctx, colX + 360, y, String(v), {
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
    rLine(ctx, colX, y, colX + 360, y, FG_DIM);
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
        rText(ctx, colX + 360, y, String(v), { size: 13, color: FG_HOT, align: 'right',
          reveal: { t: rT, start: rowStart + 0.01, end: rowStart + 0.05 } });
        ctx.restore();
      }
      y += rowH;
    }
    // Remember where the aggregate table ends so the planet list can sit
    // below it on the same left column.
    this._aggregateEndY = y;
  }

  renderPlanetList(W, H, rT = 1) {
    const ctx = this.ctx;
    const sys = this.system;

    // Left column — planet table sits BELOW the system aggregate table,
    // using the same colX=40 as the stellar readouts.  Width matches the
    // stellar readouts / aggregate (colX + 360) so everything right-aligns,
    // and the SURVEY column doesn't bleed into the orbital view.
    const colX = 40;
    const colW = 360;
    let y = (this._aggregateEndY || 400) + 24;

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

    // Column geometry — fixed right-edges so long values don't overlap.
    //   NO:          [colX .. colX+32]
    //   DESIGNATION: [colX+44 .. typeRight - 8]
    //   TYPE:        right-aligned at typeRight
    //   SURVEY:      right-aligned at colX + colW
    const surveyRight = colX + colW;
    const typeRight = surveyRight - 96; // reserve 96px for SURVEY column

    // Table header
    rText(ctx, colX, y, 'NO.', { size: 10, color: FG_DIM, letterSpacing: 2 });
    rText(ctx, colX + 44, y, 'DESIGNATION', { size: 10, color: FG_DIM, letterSpacing: 2 });
    rText(ctx, typeRight, y, 'TYPE', { size: 10, color: FG_DIM, letterSpacing: 2, align: 'right' });
    rText(ctx, surveyRight, y, 'SURVEY', { size: 10, color: FG_DIM, letterSpacing: 2, align: 'right' });
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
      rText(ctx, colX + 44, y, p.name, {
        size: 12, color: FG_HOT,
        reveal: { t: rT, start: rowStart, end: rowStart + 0.05 },
      });
      rText(ctx, typeRight, y, p.typeLabel, {
        size: 10, color: FG_DIM, letterSpacing: 2, align: 'right',
        reveal: { t: rT, start: rowStart + 0.01, end: rowStart + 0.05 },
      });
      const surveyColor = p.survey === 'CHARTED' ? FG_GOLD : (p.survey === 'PRELIMINARY' ? FG : FG_DIM);
      rText(ctx, surveyRight, y, p.survey, {
        size: 10, color: surveyColor, letterSpacing: 2, align: 'right',
        reveal: { t: rT, start: rowStart + 0.02, end: rowStart + 0.06 },
      });
      ctx.restore();
      y += 24;
    }

    // --- Signal Intercepts block (below manifest) ---
    if (sys.signalIntercepts && sys.signalIntercepts.length) {
      y += 22;
      const siHeaderAlpha = sMoothSlot(rT, 0.78, 0.04);
      ctx.save();
      ctx.globalAlpha *= siHeaderAlpha;
      rText(ctx, colX, y, 'SIGNAL · INTERCEPTS', {
        size: 11, color: FG_DIM, letterSpacing: 2,
        reveal: { t: rT, start: 0.78, end: 0.84 },
      });
      y += 16;
      rLine(ctx, colX, y, colX + colW, y, FG_DIM);
      y += 18;
      ctx.restore();

      for (let i = 0; i < sys.signalIntercepts.length; i++) {
        const s = sys.signalIntercepts[i];
        const rowStart = 0.84 + (i / Math.max(1, sys.signalIntercepts.length)) * 0.10;
        const a = sMoothSlot(rT, rowStart, 0.04);
        if (a < 0.01) { y += 20; continue; }
        ctx.save();
        ctx.globalAlpha *= a;
        const stateColor = s.hot ? '#c87070' : FG_DIM;
        // band on the left, state right-aligned at typeRight, note
        // right-aligned at surveyRight.
        rText(ctx, colX, y, s.band, {
          size: 10, color: s.hot ? FG : FG_DIM, letterSpacing: 2,
          reveal: { t: rT, start: rowStart, end: rowStart + 0.04 },
        });
        rText(ctx, colX + colW, y, s.state, {
          size: 10, color: stateColor, letterSpacing: 2, align: 'right',
          reveal: { t: rT, start: rowStart + 0.01, end: rowStart + 0.05 },
        });
        y += 14;
        rText(ctx, colX, y, s.note, {
          size: 9, color: s.hot ? '#c87070' : FG_DIM, letterSpacing: 2,
          reveal: { t: rT, start: rowStart + 0.02, end: rowStart + 0.06 },
        });
        ctx.restore();
        y += 16;
      }
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

  // ==========================================================
  // Right-side telemetry column: 3 stacked panels with animated graphs.
  // Stellar spectrum, photometric light curve, signal waterfall.
  // ==========================================================
  renderTelemetry(t, W, H, rT) {
    const ctx = this.ctx;
    const sys = this.system;
    if (!sys) return;
    // Stretch telemetry column leftward so it sits ~24px to the right of the
    // orbital-view frame (mirror of the 24px gap between the left tables and
    // the orbital view's left bracket).  Must match renderOrbitalView geometry.
    const TABLES_RIGHT = 40 + 360;
    const ORB_GAP = 24;
    const targetFrameX = TABLES_RIGHT + ORB_GAP;
    const rightEdgeLegacy = W - 40 - 360 - 20;
    const availableWidth = rightEdgeLegacy - (targetFrameX + 40) - 40;
    const maxR = Math.min(availableWidth / 2, H * 0.4);
    const cx = targetFrameX + 40 + maxR;
    const orbFrameRight = cx + maxR + 40;
    const X = Math.round(orbFrameRight + 24);
    const COL_W = W - 40 - X;
    const TOP_Y = 108;
    const BOT_Y = H - 70;
    const GAP = 20;
    const PANEL_H = Math.floor((BOT_Y - TOP_Y - GAP * 2) / 3);

    this._renderSpectrumPanel(t, X, TOP_Y,                    COL_W, PANEL_H, rT);
    this._renderLightCurvePanel(t, X, TOP_Y + (PANEL_H + GAP),   COL_W, PANEL_H, rT);
    this._renderWaterfallPanel(t, X, TOP_Y + (PANEL_H + GAP) * 2, COL_W, PANEL_H, rT);
  }

  // Frame + title shared by telemetry panels
  _telemetryFrame(x, y, w, h, title, subtitle, rT, revealStart) {
    const ctx = this.ctx;
    const alpha = sMoothSlot(rT, revealStart, 0.06);
    if (alpha < 0.01) return false;
    ctx.save();
    ctx.globalAlpha *= alpha;
    rBracket(ctx, x, y, w, h, 14, FG_DIM);
    rText(ctx, x + 18, y + 14, title, {
      size: 10, color: FG_DIM, letterSpacing: 2,
      reveal: { t: rT, start: revealStart, end: revealStart + 0.05 },
    });
    if (subtitle) {
      rText(ctx, x + w - 18, y + 14, subtitle, {
        size: 10, color: FG_DIM, letterSpacing: 2, align: 'right',
        reveal: { t: rT, start: revealStart + 0.01, end: revealStart + 0.06 },
      });
    }
    ctx.restore();
    return true;
  }

  // ---- Panel 1: Stellar Spectrum (absorption lines) -------------------
  _renderSpectrumPanel(t, x, y, w, h, rT) {
    const ctx = this.ctx;
    const sys = this.system;
    const revealStart = 0.55;
    if (!this._telemetryFrame(x, y, w, h, 'SPECTRAL ANALYSIS',
        `${sys.spectralClass}-TYPE EMISSION`, rT, revealStart)) return;

    // Inner plot area
    const px = x + 32, py = y + 40;
    const pw = w - 56, ph = h - 64;
    const alpha = sMoothSlot(rT, revealStart + 0.04, 0.10);
    if (alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha *= alpha;

    // Wavelength axis — 380..740 nm
    const rng = (seedOff) => {
      // quick deterministic per-system jitter
      let s = (sys.seed ^ seedOff) >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return (s & 0xffffffff) / 0x100000000;
      };
    };
    const r = rng(0xA17E);

    // Axis
    ctx.strokeStyle = FG_DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, py + ph); ctx.lineTo(px + pw, py + ph); ctx.stroke();
    // Ticks
    for (let i = 0; i <= 6; i++) {
      const tx = px + (i / 6) * pw;
      ctx.beginPath(); ctx.moveTo(tx, py + ph); ctx.lineTo(tx, py + ph + 4); ctx.stroke();
      const nm = 380 + i * 60;
      rText(ctx, tx, py + ph + 16, `${nm}`, { size: 8, color: FG_DIM, align: 'center', letterSpacing: 1 });
    }
    rText(ctx, px + pw / 2, py + ph + 30, 'WAVELENGTH  nm', {
      size: 8, color: FG_DIM, letterSpacing: 3, align: 'center',
    });

    // Blackbody continuum — approximate curve peak based on temperature.
    // Peak wavelength (Wien): λ_max ≈ 2.898e6 / T (nm).  Normalize to plot.
    const T = sys.temperature || 5500;
    const peakNm = Math.max(380, Math.min(740, 2.898e6 / T));
    const sigma = 160;
    const samples = Math.floor(pw);
    const continuum = new Array(samples);
    for (let i = 0; i < samples; i++) {
      const nm = 380 + (i / samples) * 360;
      const gauss = Math.exp(-Math.pow((nm - peakNm) / sigma, 2));
      continuum[i] = gauss;
    }

    // Absorption lines (Fraunhofer-ish) — pick a few per spectral class.
    const classLines = {
      O: ['He II 454', 'He I 447', 'H β 486', 'C III 465'],
      B: ['He I 447', 'H β 486', 'H γ 434', 'Mg II 448'],
      A: ['H α 656', 'H β 486', 'H γ 434', 'Ca II 393'],
      F: ['H α 656', 'Ca II 393', 'Ca I 422', 'Fe I 527'],
      G: ['Na D 589', 'Ca II 393', 'Fe I 527', 'H α 656'],
      K: ['Na D 589', 'Mg I 518', 'Fe I 527', 'TiO 615'],
      M: ['TiO 615', 'TiO 665', 'Na D 589', 'Ca I 422'],
    };
    const lines = classLines[sys.spectralClass] || classLines.G;
    const dips = lines.map(label => {
      const m = label.match(/(\d+)/);
      const nm = m ? parseInt(m[1], 10) : 500;
      return { label, nm, depth: 0.35 + r() * 0.4, width: 4 + r() * 6 };
    });

    // Subtract absorption from continuum
    const flux = continuum.slice();
    for (let i = 0; i < samples; i++) {
      const nm = 380 + (i / samples) * 360;
      for (const d of dips) {
        const k = Math.exp(-Math.pow((nm - d.nm) / d.width, 2));
        flux[i] *= (1 - d.depth * k);
      }
    }

    // Tiny breathing jitter so it feels alive
    const jitter = Math.sin(t * 2.1) * 0.01 + Math.sin(t * 7.3) * 0.005;

    // Plot continuum (dim)
    ctx.strokeStyle = FG_DIM; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < samples; i++) {
      const vx = px + i;
      const vy = py + ph - continuum[i] * (ph - 20);
      if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.stroke();

    // Plot flux (hot)
    ctx.strokeStyle = FG_HOT; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < samples; i++) {
      const vx = px + i;
      const vy = py + ph - (flux[i] + jitter) * (ph - 20);
      if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.stroke();

    // Label the dips
    ctx.font = `8px ${FONT_MONO}`;
    for (const d of dips) {
      const lx = px + ((d.nm - 380) / 360) * pw;
      const gauss = Math.exp(-Math.pow((d.nm - peakNm) / sigma, 2));
      const dipY = py + ph - (gauss * (1 - d.depth)) * (ph - 20);
      ctx.strokeStyle = FG_DIM; ctx.lineWidth = 1;
      ctx.setLineDash([1, 2]);
      ctx.beginPath(); ctx.moveTo(lx, dipY); ctx.lineTo(lx, py + 6); ctx.stroke();
      ctx.setLineDash([]);
      rText(ctx, lx, py, d.label, {
        size: 8, color: FG_DIM, align: 'center', letterSpacing: 1,
      });
    }
    ctx.restore();
  }

  // ---- Panel 2: Orbital Phase / Transit Almanac ----------------------
  // Polar diagram showing each inner planet's orbital phase.  Concentric
  // dashed rings with a dot per planet that slowly sweeps around.  A short
  // arc on each ring marks the "transit zone" (observer line-of-sight), so
  // as a dot crosses the arc it visually reads as "transiting now".
  _renderLightCurvePanel(t, x, y, w, h, rT) {
    const ctx = this.ctx;
    const sys = this.system;
    const revealStart = 0.64;
    if (!this._telemetryFrame(x, y, w, h, 'ORBITAL PHASE ALMANAC',
        'INNER · LIVE', rT, revealStart)) return;

    const alpha = sMoothSlot(rT, revealStart + 0.04, 0.10);
    if (alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha *= alpha;

    // Geometry: polar diagram on the left, mini phase-bar legend on the right
    const padL = 24, padR = 16, padT = 38, padB = 22;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const polarSize = Math.min(innerH, innerW * 0.55);
    const cx = x + padL + polarSize / 2;
    const cy = y + padT + polarSize / 2;
    const rMax = polarSize / 2 - 6;

    // Pick up to 4 inner planets to visualise
    const picks = sys.planets.slice(0, Math.min(4, sys.planets.length));
    const n = picks.length;
    if (n === 0) { ctx.restore(); return; }

    // Transit zone: the observer sits to the right (+x axis); a narrow wedge
    // there is "in transit".  Wedge half-width in radians.
    const transitHalfWidth = 0.16;

    // Central star marker
    ctx.fillStyle = FG_HOT;
    ctx.globalAlpha *= 0.9;
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha /= 0.9;

    // Observer direction tick (small arrow outside max ring)
    ctx.strokeStyle = FG_DIM; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + rMax + 4, cy);
    ctx.lineTo(cx + rMax + 12, cy);
    ctx.stroke();
    rText(ctx, cx + rMax + 16, cy + 3, 'OBS', { size: 8, color: FG_DIM, letterSpacing: 1 });

    // Draw each orbit ring + transit wedge + planet dot
    for (let i = 0; i < n; i++) {
      const p = picks[i];
      const r = rMax * (0.28 + (i / Math.max(1, n - 1)) * 0.72);

      // Dashed orbit ring
      ctx.save();
      ctx.globalAlpha *= 0.55;
      ctx.strokeStyle = FG_DIM;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Transit zone arc (solid, brighter) — sits on +x axis
      ctx.save();
      ctx.strokeStyle = FG_GOLD;
      ctx.globalAlpha *= 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -transitHalfWidth, transitHalfWidth);
      ctx.stroke();
      ctx.restore();

      // Planet dot — phase driven by orbit period (slow, varied)
      const period = 28 + i * 18; // seconds per revolution (inner faster)
      const phase0 = (p.orbit || 1) * 0.9 + i * 1.3; // deterministic offset
      const theta = phase0 + (t / period) * Math.PI * 2;
      const dx = cx + Math.cos(theta) * r;
      const dy = cy + Math.sin(theta) * r;

      // Check if in transit — brighten dot when inside wedge
      const wrapped = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const inTransit = wrapped < transitHalfWidth || wrapped > (Math.PI * 2 - transitHalfWidth);

      ctx.save();
      if (inTransit) {
        ctx.fillStyle = FG_GOLD;
        ctx.shadowColor = FG_GOLD;
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = FG_HOT;
      }
      ctx.beginPath(); ctx.arc(dx, dy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Planet label just outside its ring, at its current angle
      const labelR = r + 9;
      const lx = cx + Math.cos(theta) * labelR;
      const ly = cy + Math.sin(theta) * labelR;
      // Nudge label away from star center
      const labelAlign = Math.cos(theta) < 0 ? 'right' : 'left';
      rText(ctx, lx + (labelAlign === 'right' ? -2 : 2), ly + 3, p.designation || `P${i+1}`, {
        size: 8, color: FG_DIM, letterSpacing: 1, align: labelAlign,
      });
    }

    // Right-side mini phase bars — one per planet showing fraction of orbit
    const barX = x + padL + polarSize + 18;
    const barW = x + w - padR - barX;
    if (barW > 60) {
      let by = y + padT + 4;
      rText(ctx, barX, by, 'PHASE', { size: 8, color: FG_DIM, letterSpacing: 2 });
      by += 12;
      const rowH = Math.min(22, (innerH - 16) / n);
      for (let i = 0; i < n; i++) {
        const p = picks[i];
        const period = 28 + i * 18;
        const phase0 = (p.orbit || 1) * 0.9 + i * 1.3;
        const theta = phase0 + (t / period) * Math.PI * 2;
        const wrapped = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const frac = wrapped / (Math.PI * 2);

        // Label (planet designation)
        rText(ctx, barX, by + 8, p.designation || `P${i+1}`, {
          size: 8, color: FG_DIM, letterSpacing: 1,
        });
        // Bar track
        const trackX = barX + 28;
        const trackW = barW - 28;
        const trackY = by + 4;
        ctx.strokeStyle = FG_DIM;
        ctx.globalAlpha *= 0.6;
        ctx.beginPath();
        ctx.moveTo(trackX, trackY + 4);
        ctx.lineTo(trackX + trackW, trackY + 4);
        ctx.stroke();
        ctx.globalAlpha /= 0.6;

        // Transit marker on track (at start — corresponds to wrapped==0)
        ctx.strokeStyle = FG_GOLD;
        ctx.globalAlpha *= 0.7;
        ctx.beginPath();
        ctx.moveTo(trackX, trackY); ctx.lineTo(trackX, trackY + 8);
        ctx.stroke();
        ctx.globalAlpha /= 0.7;

        // Fill position
        const fx = trackX + trackW * frac;
        ctx.fillStyle = FG_HOT;
        ctx.beginPath(); ctx.arc(fx, trackY + 4, 2.5, 0, Math.PI * 2); ctx.fill();

        by += rowH;
      }
    }

    ctx.restore();
  }

  // ---- Panel 3: Signal Waterfall (frequency × time) -------------------
  _renderWaterfallPanel(t, x, y, w, h, rT) {
    const ctx = this.ctx;
    const sys = this.system;
    const revealStart = 0.72;
    if (!this._telemetryFrame(x, y, w, h, 'INTERFEROMETRIC SIGNAL',
        '1.4 – 22 GHz', rT, revealStart)) return;

    const px = x + 32, py = y + 40;
    const pw = w - 56, ph = h - 64;
    const alpha = sMoothSlot(rT, revealStart + 0.04, 0.10);
    if (alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha *= alpha;

    // Axis ticks — frequency along x
    ctx.strokeStyle = FG_DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, py + ph); ctx.lineTo(px + pw, py + ph); ctx.stroke();
    const freqs = ['1.4', '5.0', '10', '22'];
    for (let i = 0; i < freqs.length; i++) {
      const fx = px + (i / (freqs.length - 1)) * pw;
      ctx.beginPath(); ctx.moveTo(fx, py + ph); ctx.lineTo(fx, py + ph + 4); ctx.stroke();
      rText(ctx, fx, py + ph + 16, freqs[i] + ' GHz', {
        size: 8, color: FG_DIM, align: 'center', letterSpacing: 1,
      });
    }

    // Waterfall pixels — time (y, older at bottom) × frequency (x).
    // Cheap render: N rows × M cols with per-cell intensity.
    const ROWS = 40;
    const COLS = Math.min(60, Math.floor(pw / 4));
    const cellW = pw / COLS;
    const cellH = ph / ROWS;

    // Pull anomalous intercept's approximate frequency, if any, for a vertical "bright line"
    const anom = (sys.signalIntercepts || []).find(s => s.hot);
    let anomCol = -1;
    if (anom) {
      // Map known bands to 1.4..22 GHz axis position
      const band = anom.band;
      let freqGHz = null;
      const m = band.match(/([\d.]+)\s*(GHz|MHz|kHz|keV|Hz)/i);
      if (m) {
        const v = parseFloat(m[1]);
        const u = m[2].toLowerCase();
        if (u === 'ghz') freqGHz = v;
        else if (u === 'mhz') freqGHz = v / 1000;
        else if (u === 'hz' || u === 'khz') freqGHz = 1.42; // fallback: H-line
        else freqGHz = null; // X-ray/gamma — no column
      }
      if (freqGHz !== null && freqGHz >= 1.4 && freqGHz <= 22) {
        // Log-ish axis: 1.4..22 → 0..1
        const a = Math.log(freqGHz / 1.4) / Math.log(22 / 1.4);
        anomCol = Math.floor(a * COLS);
      }
    }

    // Simple seeded noise
    const seed = (sys.seed ^ 0xBEEF) >>> 0;
    const noise = (i, j, frame) => {
      // cheap reproducible hash
      let s = (seed + i * 73856093 + j * 19349663 + frame * 83492791) >>> 0;
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17; s >>>= 0;
      s ^= s << 5;  s >>>= 0;
      return (s & 0xffff) / 0xffff;
    };

    const frame = Math.floor(t * 2);
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        let v = noise(i, j, frame) * 0.35;
        // Subtle band at 1.42 GHz (hydrogen) always present
        const hCol = Math.floor(Math.log(1.42 / 1.4) / Math.log(22 / 1.4) * COLS);
        if (Math.abs(i - hCol) < 1) v += 0.15;
        // Anomaly — bright coherent line
        if (anomCol >= 0 && Math.abs(i - anomCol) < 1) {
          v += 0.5 + Math.sin((j + t * 4) * 0.6) * 0.1;
        }
        v = Math.max(0, Math.min(1, v));
        // Colorize: hot → warm gold if anomaly column, otherwise teal
        let col;
        if (anomCol >= 0 && Math.abs(i - anomCol) < 1) {
          col = `rgba(200, 120, 100, ${v * 0.95})`;
        } else {
          col = `rgba(159, 218, 218, ${v * 0.4})`;
        }
        ctx.fillStyle = col;
        ctx.fillRect(px + i * cellW, py + j * cellH, cellW + 0.5, cellH + 0.5);
      }
    }

    // Top "arrow of time" label
    rText(ctx, px, py - 4, 'TIME ↓', {
      size: 8, color: FG_DIM, letterSpacing: 2,
    });
    rText(ctx, px + pw, py - 4, anom ? 'ANOMALY FLAGGED' : 'NO COHERENT SIGNAL', {
      size: 8, color: anom ? '#c87070' : FG_DIM, letterSpacing: 2, align: 'right',
    });

    ctx.restore();
  }
}
