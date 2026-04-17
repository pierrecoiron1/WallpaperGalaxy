# Claude Code Kickoff — Deploy "Desktop Wallpaper.html" as a Live Dual-Monitor Wallpaper

> Paste this whole file into Claude Code as your opening message. It gives Claude everything it needs to get started.

---

## Who you are (for Claude Code)

You are helping me install a single HTML file (`Desktop Wallpaper.html`) as an **animated live wallpaper** spanning **two monitors** on my Linux desktop. The HTML renders a 3440×1440 star-map galaxy on the left monitor and a 1920×1080 procedural system chart on the right monitor. It is a pure HTML5 / Canvas2D app — no WebGL, no server, no build step. Opening it in Chrome makes it work.

Your job is to walk me through getting it behind the desktop icons, running automatically at login, and surviving suspend/resume.

---

## What I'm giving you

- `Desktop Wallpaper.html` at the repo root — the entire app, loads `src/*.js` as ES modules
- `src/` — the JS modules it depends on
- Any other assets in this repo (fonts, etc.)

**Do not modify the HTML's design or behavior.** Your work is purely environmental: file placement, launch commands, autostart, and display-layout plumbing.

---

## Facts I've already established

- The app is **Canvas2D only**, ~1–3% GPU, fine on integrated graphics.
- The galaxy pane is authored at **3440×1440**, the system-map pane at **1920×1080**.
- The HTML is self-scaling: whatever viewport you give it, it fills it.
- It reads/writes `localStorage` to persist the current tracked star. Don't launch it in incognito.
- It uses `window.claude.complete` guards internally but **no network calls are required** to run.

---

## What I need you to do, in order

### Step 0 — Ask me these questions first, then stop and wait

Before doing anything else, ask me:

1. **Distro + version?** (e.g. Ubuntu 24.04, Fedora 40, Arch…)
2. **Session type?** Run `echo $XDG_SESSION_TYPE` — tell me the output. **X11 and Wayland need completely different approaches.**
3. **Desktop environment / compositor?** GNOME / KDE / Hyprland / sway / i3 / XFCE / something else?
4. **Monitor layout:** which physical monitor is on the left, which is on the right, and what does `xrandr` (X11) or `wlr-randr` / `hyprctl monitors` (Wayland) report for their names and resolutions?
5. **Browser installed?** Chrome, Chromium, or Brave all work. I want the one that's already installed — don't install a new one without asking.
6. **Do I want it to autostart at login?** (Default: yes.)

Do not proceed past Step 0 until I answer. These answers determine the entire approach.

### Step 1 — Pick the right deployment strategy

Based on my answers, choose one of these paths. Tell me which one you're picking and why.

**X11 (any DE):** `xwinwrap` + Chrome kiosk pinned to the root window.
- Install `xwinwrap` (AUR on Arch, `xwinwrap-0.5-bin` on Ubuntu via a PPA or build from `mmhobi7/xwinwrap` source).
- Launch Chrome with `--kiosk --app=file://... --window-position=X,Y --window-size=W,H` wrapped by `xwinwrap -ni -b -nf -un -o 1.0 -fs -- chromium %WID%` or the equivalent for Chrome.
- One `xwinwrap` invocation per monitor, each pointing at the same HTML file (the app handles which pane to render based on window size — see Step 3).

**Hyprland:** use `hyprpaper` for static, but since this is animated, spawn Chrome windows and use a layer-shell rule to pin them to the `background` layer. There's also `linux-wallpaperengine` but it's overkill here.

**Sway / wlroots compositors:** `swaybg` can't animate. Use `mpvpaper` for a recorded loop **or** `waypaper` with a running Chrome window in a layer-shell namespace via `wlr-layer-shell` — harder. The pragmatic fallback on Wayland is to **record a 60-second seamless loop** of each pane and hand it to `mpvpaper`. I'm okay with that if live is too painful.

**GNOME on Wayland:** hardest case. There is no official way to put an arbitrary window behind the desktop. Options, ranked:
1. Switch the login session to "GNOME on Xorg" from the gear icon at the login screen, then use the X11 path. **This is what I'd pick.**
2. Use the "Desktop Live Wallpaper" or "Animated Backgrounds" GNOME extension — they accept video, not HTML. Requires recording a loop.
3. Use `gnome-shell` with a custom extension that injects an iframe — brittle.

**KDE Plasma:** has a "HTML5 Live Wallpaper" Plasmoid from the KDE store. Point it at `file://.../Desktop Wallpaper.html`. By far the easiest path if I'm on KDE — try this **first**.

### Step 2 — Stage the files

Copy this repo (or at least `Desktop Wallpaper.html` + `src/` + any assets) to a stable location outside the repo, e.g. `~/.local/share/desktop-wallpaper/`. Don't leave it in `~/Downloads` or a git checkout I might move.

### Step 3 — Per-monitor windowing

The HTML currently renders **both panes in one viewport** (the galaxy is positioned on the left 3440px, the chart on the right 1920px, total 5360×1440). For a dual-monitor setup that straddles a bezel, the cleanest approach is:

**Option A (recommended): one Chrome window per monitor**, each with a URL hash or query param telling the HTML which pane to show. If the HTML doesn't already support `?pane=galaxy` / `?pane=chart`, **ask me whether I want you to add that**, and if I say yes, do it as a small non-design change: read `location.search`, hide the other pane's canvas, resize. Don't touch the visual design.

**Option B:** one 5360×1440 window stretched across both monitors. This only works cleanly if the monitors are the same height and arranged side-by-side with no vertical offset. With my 1440+1080 stack, **don't do this.**

### Step 4 — Autostart

Wire up a `.desktop` file in `~/.config/autostart/` (for X11 / GNOME / KDE / XFCE) or a systemd user unit (`~/.config/systemd/user/desktop-wallpaper.service`) that runs the xwinwrap/Chrome command after graphical login. Include `Restart=on-failure` if using systemd.

### Step 5 — Sanity checks before we call it done

- Icons on the desktop are still clickable — the wallpaper sits *behind* them.
- Right-clicking the desktop still shows the file manager's menu, not Chrome's.
- Suspend → resume: the animation keeps running, time display is correct.
- Locking and unlocking: wallpaper survives.
- Opening a normal Chrome window doesn't interfere with the wallpaper instances.
- CPU usage at idle is under ~5% per pane.

If any of those fail, diagnose and fix before declaring it done.

---

## Conventions

- **Ask before installing packages.** Tell me the exact package name and why.
- **Show me every command before running it.** I'll approve or tweak.
- **If something needs sudo**, explain what it touches.
- **Never delete or rename files in the repo** — only copy them out.
- Don't open the HTML in my currently-focused browser session to test; spawn a fresh Chrome profile at `~/.local/share/desktop-wallpaper-profile/` via `--user-data-dir` so my bookmarks and tabs aren't touched.

---

## Start now

Begin with **Step 0**. Ask me the six questions, wait for my answers, then tell me which strategy you're picking.
