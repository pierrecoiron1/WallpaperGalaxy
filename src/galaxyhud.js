// HUD overlay for the galaxy flythrough monitor — drawn on top of the
// galaxy canvas. Minimal, monospace, teal. Shows tracking reticle on the
// currently-selected star, drift info, corner frames, and a chrono ticker.

const FG = '#9fdada';
const FG_DIM = '#4c7a7a';
const FG_HOT = '#d4f6f6';
const FG_GOLD = '#c8a66b';
const FG_WARN = '#c87a5a';

const FONT_MONO = '"IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace';
const FONT_DISPLAY = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';

// Per-monitor safe-area insets (GNOME top panel height, Ubuntu dock height).
// Injected by the host page via window.__safeArea from URL query params.
const TOP_SAFE    = (typeof window !== 'undefined' && window.__safeArea?.top)    || 0;
const BOTTOM_SAFE = (typeof window !== 'undefined' && window.__safeArea?.bottom) || 0;

function txt(ctx, x, y, s, opts = {}) {
  ctx.save();
  ctx.fillStyle = opts.color || FG;
  ctx.font = `${opts.weight || 400} ${opts.size || 12}px ${opts.font || FONT_MONO}`;
  const align = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  const str = String(s);
  if (opts.letterSpacing) {
    // When letter-spacing, we lay out char-by-char so we must compute the
    // total width first and shift the start position ourselves — Canvas's
    // textAlign only applies per-fillText call.
    const spacing = opts.letterSpacing;
    let totalW = 0;
    for (const ch of str) totalW += ctx.measureText(ch).width + spacing;
    totalW -= spacing; // no trailing gap
    let startX = x;
    if (align === 'right') startX = x - totalW;
    else if (align === 'center') startX = x - totalW / 2;
    ctx.textAlign = 'left';
    let cur = startX;
    for (const ch of str) {
      ctx.fillText(ch, cur, y);
      cur += ctx.measureText(ch).width + spacing;
    }
  } else {
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }
  ctx.restore();
}

function line(ctx, x1, y1, x2, y2, c = FG_DIM, w = 1, dash = null) {
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function bracket(ctx, x, y, w, h, size = 20, color = FG_DIM) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + size); ctx.lineTo(x, y); ctx.lineTo(x + size, y);
  ctx.moveTo(x + w - size, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + size);
  ctx.moveTo(x + w, y + h - size); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - size, y + h);
  ctx.moveTo(x + size, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - size);
  ctx.stroke();
  ctx.restore();
}

export class GalaxyHUD {
  constructor(canvas, galaxy) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.galaxy = galaxy;
    this.system = null;
    this.targetScreen = null;   // {x, y} — where the tracked star is on screen
    this.startT = performance.now();
    this.nextLockTime = Date.now() + 10 * 60 * 1000;
    this.weather = null;        // last snapshot fetched from /api/weather
  }

  setWeather(wx) { this.weather = wx; }

  setTrackedStar(starRef, system) {
    this.trackedStar = starRef;
    this.system = system;
    this.nextLockTime = Date.now() + 10 * 60 * 1000;
  }

  tick() {
    this.render();
  }

  render() {
    const { ctx, canvas, galaxy } = this;
    const W = canvas.width, H = canvas.height;
    const t = (performance.now() - this.startT) * 0.001;

    ctx.clearRect(0, 0, W, H);

    // --- Compute tracked star screen position ---
    let sx = null, sy = null;
    if (this.trackedStar) {
      // Prefer Galaxy3D's live projection if available — the star actually
      // moves toward the camera in real time.
      if (typeof galaxy.getTrackedScreen === 'function') {
        const p = galaxy.getTrackedScreen();
        if (p) { sx = p.x; sy = p.y; }
      } else if (galaxy.layers) {
        // Legacy parallax galaxy
        const layer = galaxy.layers.find(l => l.seed === this.trackedStar.layerSeed);
        if (layer) {
          sx = this.trackedStar.worldX - galaxy.camX * layer.parallax;
          sy = this.trackedStar.worldY - galaxy.camY * layer.parallax;
        }
      }
    }

    // --- Corner frame brackets ---
    bracket(ctx, 24, 24 + TOP_SAFE, W - 48, H - 48 - TOP_SAFE - BOTTOM_SAFE, 40, FG_DIM);

    // --- Top-left header block ---
    this.renderHeader(W, H, t);

    // --- Top-right: tracked system brief ---
    if (this.system) this.renderTrackedBrief(W, H);

    // --- Bottom strip: drift + chrono + catalog ---
    this.renderBottomStrip(W, H, t);

    // --- Tracking reticle on the selected star ---
    if (sx !== null && sy !== null && sx > 0 && sx < W && sy > 0 && sy < H) {
      this.renderReticle(sx, sy, t);
    }

    // --- Side gauges (ultrawide-friendly) ---
    this.renderSideGauges(W, H, t);
  }

  renderHeader(W, H, t) {
    const ctx = this.ctx;
    const T = TOP_SAFE;
    txt(ctx, 60, 64 + T, 'COMMONWEALTH DEEP SURVEY', {
      size: 11, color: FG_DIM, letterSpacing: 3,
    });
    txt(ctx, 60, 110 + T, 'GALACTIC FLYTHROUGH', {
      size: 36, weight: 200, color: FG_HOT, font: FONT_DISPLAY, letterSpacing: 6,
    });
    txt(ctx, 60, 138 + T, 'SECTOR VI · ORION–CYGNUS ARM · OUTBOUND', {
      size: 11, color: FG_DIM, letterSpacing: 3,
    });

    // Thin divider line
    line(ctx, 60, 156 + T, 420, 156 + T, FG_DIM);

    // Continuous-scroll coords (driven by galaxy.camX/Y)
    const { galaxy } = this;
    // Forward-flight mode: show parsec odometer + flight time instead of X/Y
    if (typeof galaxy.getTrackedScreen === 'function') {
      const pcs = (galaxy.totalTravel / 3.26).toFixed(1).padStart(9);
      const elapsed = Math.floor((performance.now() - this.startT) / 1000);
      const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      txt(ctx, 60, 180 + T, `ODO  ${pcs} pc`, { size: 12, color: FG });
      txt(ctx, 60, 200 + T, `T+   ${hh}:${mm}:${ss}`, { size: 12, color: FG });
      txt(ctx, 60, 220 + T, `WARP ${(galaxy.starfield.speed / 10).toFixed(2)} c-equiv`, { size: 12, color: FG_DIM });
    } else {
      const gx = galaxy.camX.toFixed(1).padStart(8);
      const gy = galaxy.camY.toFixed(1).padStart(8);
      txt(ctx, 60, 180 + T, `GAL-X ${gx}`, { size: 12, color: FG });
      txt(ctx, 60, 200 + T, `GAL-Y ${gy}`, { size: 12, color: FG });
      txt(ctx, 60, 220 + T, `DRIFT Vx ${galaxy.camVX.toFixed(2)}  Vy ${galaxy.camVY.toFixed(2)}`, {
        size: 12, color: FG_DIM,
      });
    }
  }

  renderTrackedBrief(W, H) {
    const ctx = this.ctx;
    const sys = this.system;
    const x = W - 60;
    const T = TOP_SAFE;

    txt(ctx, x, 64 + T, 'TRACKING · TELEMETRY LINK ACTIVE', {
      size: 11, color: FG_DIM, letterSpacing: 3, align: 'right',
    });
    txt(ctx, x, 104 + T, sys.fullName, {
      size: 26, weight: 200, color: FG_HOT, font: FONT_DISPLAY, letterSpacing: 2, align: 'right',
    });
    txt(ctx, x, 130 + T, `${sys.spectralClass}-CLASS · ${sys.temperature.toLocaleString()} K`, {
      size: 11, color: FG, letterSpacing: 3, align: 'right',
    });
    txt(ctx, x, 150 + T, sys.galCoord, {
      size: 11, color: FG_DIM, letterSpacing: 3, align: 'right',
    });

    line(ctx, W - 420, 162 + T, W - 60, 162 + T, FG_DIM);

    // Planet count / habitability quick-glance
    const habCount = sys.planets.filter(p => p.type === 'terra' || p.type === 'ocean').length;
    txt(ctx, x, 186 + T, `${sys.planets.length} PLANETS · ${habCount} IN HAB. ZONE`, {
      size: 12, color: FG, letterSpacing: 2, align: 'right',
    });

    // Survey breakdown across the planetary manifest. Derived locally from
    // sys.planets[i].survey — generateSystem() is deterministic on seed so
    // both panes see identical values.
    let charted = 0, prelim = 0, unsurveyed = 0;
    for (const p of sys.planets) {
      if (p.survey === 'CHARTED') charted++;
      else if (p.survey === 'PRELIMINARY') prelim++;
      else unsurveyed++;
    }
    txt(ctx, x, 206 + T, `CHARTED ${charted} · PRELIM ${prelim} · UNSURV ${unsurveyed}`, {
      size: 11, color: FG_DIM, letterSpacing: 3, align: 'right',
    });
  }

  renderReticle(x, y, t) {
    const ctx = this.ctx;
    // Animated diameter
    const r = 40 + Math.sin(t * 1.5) * 3;

    ctx.save();
    ctx.strokeStyle = FG_GOLD;
    ctx.lineWidth = 1;

    // 4 corner brackets rotated 45°
    ctx.translate(x, y);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(r, -8); ctx.lineTo(r, 0); ctx.lineTo(r + 12, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Inner thin ring
    ctx.strokeStyle = 'rgba(200, 166, 107, 0.4)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshair ticks
    ctx.strokeStyle = FG_GOLD;
    ctx.beginPath();
    ctx.moveTo(-r - 14, 0); ctx.lineTo(-r, 0);
    ctx.moveTo(r, 0); ctx.lineTo(r + 14, 0);
    ctx.moveTo(0, -r - 14); ctx.lineTo(0, -r);
    ctx.moveTo(0, r); ctx.lineTo(0, r + 14);
    ctx.stroke();

    ctx.restore();

    // Label offset from reticle
    txt(ctx, x + r + 24, y - 12, 'TRACK LOCK', {
      size: 10, color: FG_GOLD, letterSpacing: 3,
    });
    if (this.system) {
      txt(ctx, x + r + 24, y + 4, this.system.designation, {
        size: 11, color: FG_HOT, letterSpacing: 1,
      });
      txt(ctx, x + r + 24, y + 20, this.system.spectralClass + ' · ' + this.system.temperature.toLocaleString() + 'K', {
        size: 10, color: FG_DIM, letterSpacing: 2,
      });
    }
  }

  renderBottomStrip(W, H, t) {
    const ctx = this.ctx;
    const B = H - BOTTOM_SAFE;

    line(ctx, 60, B - 80, W - 60, B - 80, FG_DIM);

    // Left: local weather (two-line) — replaces the old CHRONO / FLIGHT
    // RECORDER rows since the center column already shows wall-clock time.
    const now = new Date();
    const h24 = now.getHours();
    const h12 = ((h24 + 11) % 12) + 1;
    const ampm = h24 < 12 ? 'AM' : 'PM';
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const hh12 = String(h12).padStart(2, '0');
    const bigTime = `${hh12}:${mm}:${ss} ${ampm}`;   // used on the center display
    const wx = this.weather;
    if (wx && wx.temp !== undefined && !wx.error) {
      const deg = wx.units === 'metric' ? '°C' : '°F';
      // Precip rounded to nearest 10% — weather forecasts aren't precise
      // enough for single-percent detail to mean anything.
      const precip10 = Math.round((wx.precip || 0) / 10) * 10;
      txt(ctx, 60, B - 56, `${wx.temp}${deg} · ${wx.condition}`, {
        size: 11, color: FG, letterSpacing: 3,
      });
      txt(ctx, 60, B - 38, `HI ${wx.high} · LO ${wx.low} · PRECIP ${precip10}%`, {
        size: 10, color: FG_DIM, letterSpacing: 3,
      });
    } else {
      txt(ctx, 60, B - 56, `WEATHER LINK PENDING`, {
        size: 11, color: FG_DIM, letterSpacing: 3,
      });
      txt(ctx, 60, B - 38, `SET LOCATION IN CONFIG`, {
        size: 10, color: FG_DIM, letterSpacing: 3,
      });
    }

    // Center: wall-clock date + time (replaces the previous handover countdown)
    const weekday = now.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase();
    const dateStr = now.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
    }).toUpperCase().replace(/,/g, '');
    txt(ctx, W / 2, B - 56, `${weekday} · ${dateStr}`, {
      size: 10, color: FG_DIM, letterSpacing: 3, align: 'center',
    });
    txt(ctx, W / 2, B - 34, bigTime, {
      size: 22, color: FG_HOT, letterSpacing: 6, align: 'center', font: FONT_MONO,
    });

    // Right
    txt(ctx, W - 60, B - 56, `AUX · TELEMETRY NOMINAL`, {
      size: 11, color: FG, letterSpacing: 3, align: 'right',
    });
    txt(ctx, W - 60, B - 38, `SIGNAL INTEGRITY 99.8 %`, {
      size: 10, color: FG_DIM, letterSpacing: 3, align: 'right',
    });
  }

  renderSideGauges(W, H, t) {
    const ctx = this.ctx;

    // Right side: vertical spectral graph — decorative
    const baseX = W - 60;
    const barY = H * 0.35;
    const barH = H * 0.30;
    line(ctx, baseX, barY, baseX, barY + barH, FG_DIM);

    // Tick marks every 20% of barH
    for (let i = 0; i <= 5; i++) {
      const yy = barY + (i / 5) * barH;
      line(ctx, baseX - 6, yy, baseX, yy, FG_DIM);
      txt(ctx, baseX - 12, yy + 4, String(1000 - i * 200), {
        size: 9, color: FG_DIM, align: 'right',
      });
    }
    txt(ctx, baseX - 12, barY - 8, 'PARALLAX · ARCSEC', {
      size: 9, color: FG_DIM, letterSpacing: 2, align: 'right',
    });

    // Animated needle
    const needleY = barY + barH * (0.3 + 0.3 * Math.sin(t * 0.4));
    line(ctx, baseX - 20, needleY, baseX + 4, needleY, FG_GOLD);

    // Left side decoration — thin compass
    const lx = 60;
    line(ctx, lx, H * 0.42, lx, H * 0.58, FG_DIM);
    for (let i = 0; i < 5; i++) {
      const yy = H * 0.42 + (i / 4) * H * 0.16;
      line(ctx, lx, yy, lx + 6, yy, FG_DIM);
    }
    txt(ctx, lx + 14, H * 0.42, 'BEARING', {
      size: 9, color: FG_DIM, letterSpacing: 3,
    });
    txt(ctx, lx + 14, H * 0.58 + 14, 'OUTBOUND', {
      size: 9, color: FG_DIM, letterSpacing: 3,
    });
  }
}
