# Desktop Wallpaper — Linux Deployment

This document describes how `Desktop Wallpaper.html` is deployed as a live,
dual-monitor animated wallpaper on Linux. It reflects **what actually ships
in this repo**, not the original brainstorm.

## What you get

Two Chrome `--app` windows, one per monitor, pinned to the desktop layer:

- **Primary monitor** → galaxy flythrough + HUD (`?pane=galaxy`)
- **Secondary monitor** → system chart (`?pane=chart`)

Desktop icons stay clickable on top, right-click still hits Nautilus, and the
windows survive suspend/resume without intervention. A tiny local Python
backend keeps both panes showing the same tracked star system.

## Tested environment

- **Ubuntu 24.04.4 LTS**
- **GNOME on Xorg** (session type `x11`)
- Any resolution on the primary; secondary is optional and also arbitrary.

Wayland is **not** supported — mutter under Wayland doesn't honor
`_NET_WM_WINDOW_TYPE_DESKTOP` for arbitrary X11 clients. Switch your session
to "Ubuntu on Xorg" at the login screen.

## Architecture

```
┌──────────────────────────┐       ┌──────────────────────────┐
│  Chrome --app galaxy     │       │  Chrome --app chart      │
│  (isolated profile)      │       │  (isolated profile)      │
│  http://127.0.0.1:43117  │       │  http://127.0.0.1:43117  │
└────────────┬─────────────┘       └────────────┬─────────────┘
             │ POST /api/rotate                 │ GET /api/current
             │ (when reticle star drifts off)   │ (polls every 1s)
             └──────────────┬───────────────────┘
                            ▼
                ┌──────────────────────────┐
                │  wallpaper_server.py     │
                │  stdlib http.server      │
                │  state: one uint32 seed  │
                └──────────────────────────┘
```

- **Backend** (`wallpaper_server.py`): Python 3 stdlib, ~60 lines. Serves the
  static files *and* holds the current system seed. No deps.
- **Sync model**: galaxy pane is authoritative — it asks the server for a new
  seed only when its reticle star drifts off screen. Chart pane is a passive
  follower that polls.
- **Window pinning**: each Chrome window gets `_NET_WM_WINDOW_TYPE_DESKTOP`
  via `xprop` plus `below`/`sticky`/`skip_taskbar`/`skip_pager` via `wmctrl`.
  The GNOME "Desktop Icons NG" (DING) extension is then cycled off/on so it
  re-maps above our wallpaper (both are `DESKTOP` type — mutter uses mapping
  order among peers).

## Prerequisites

Install these once (Chrome requires sudo, the X11 utilities usually ship
with a GNOME install):

```bash
# Google Chrome .deb (non-snap — snap Brave/Chromium routes --user-data-dir
# invocations back to the running instance, which breaks profile isolation).
wget -O /tmp/chrome.deb \
  https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y /tmp/chrome.deb

# X11 utilities for window reparenting (usually already present)
sudo apt install -y xdotool wmctrl x11-utils
```

Python 3 and the DING GNOME extension are present by default on Ubuntu 24.04.

## Install

1. **Stage the files** outside the repo so runtime paths are stable.
   Run from the repo root:

   ```bash
   STAGE=~/.local/share/desktop-wallpaper
   mkdir -p "$STAGE"
   cp -r "Desktop Wallpaper.html" config.html src/ Assets/ \
         wallpaper_server.py config_gui.py \
         "$STAGE/"
   cp platforms/linux/start_wallpaper.sh \
      platforms/linux/stop_wallpaper.sh \
      platforms/linux/install_shortcut.sh \
      "$STAGE/"
   chmod +x "$STAGE"/*.sh "$STAGE"/wallpaper_server.py "$STAGE"/config_gui.py
   ```

2. **Start it:**

   ```bash
   ~/.local/share/desktop-wallpaper/start_wallpaper.sh
   ```

3. **Autostart at login** (optional but recommended):

   ```bash
   cat > ~/.config/autostart/desktop-wallpaper.desktop <<'EOF'
   [Desktop Entry]
   Type=Application
   Name=Desktop Wallpaper (Galaxy + System)
   Exec=/home/YOUR_USER/.local/share/desktop-wallpaper/start_wallpaper.sh
   X-GNOME-Autostart-enabled=true
   X-GNOME-Autostart-Delay=5
   Terminal=false
   NoDisplay=true
   EOF
   ```

   Replace `YOUR_USER` with your login name. `.desktop` files can't expand
   `$HOME`, so the absolute path is required.

## Usage

- **Start**: `~/.local/share/desktop-wallpaper/start_wallpaper.sh`
- **Stop**: `~/.local/share/desktop-wallpaper/stop_wallpaper.sh`
- **Backend health check**: `curl -s http://127.0.0.1:43117/api/current`
- **Force a new target system**: `curl -sX POST http://127.0.0.1:43117/api/rotate`

## Configure (location, units, flight speed, stellar density)

Two equivalent options — both write to the same config endpoint:

- **Browser:** open `http://127.0.0.1:43117/config.html` in Brave/Chrome.
- **Desktop GUI:** install it once to your GNOME app menu, then launch it
  like any other app:

  ```bash
  sudo apt install python3-tk       # once — provides tkinter
  ~/.local/share/desktop-wallpaper/install_shortcut.sh
  ```

  That drops a `.desktop` entry in `~/.local/share/applications/` and the
  icon in `~/.local/share/icons/hicolor/256x256/apps/`. Hit <kbd>Super</kbd>
  and search "Wallpaper Galaxy Config".

  To run without an app-menu entry: `python3 ~/.local/share/desktop-wallpaper/config_gui.py`

## Safe-area handling

The galaxy HUD auto-avoids the GNOME top panel and Ubuntu dock by reading
`_GTK_WORKAREAS_D0` at launch and passing the per-monitor insets to the HTML
as URL query parameters (`?top=32&bottom=66` etc.). If you resize the dock,
restart the wallpaper and it adapts.

## Monitor topology

The launch script auto-detects monitors via `xrandr`:

- **Primary monitor** → galaxy pane, sized to the primary's full geometry
- **First non-primary** → chart pane, sized to that monitor's geometry
- **Single-monitor setup** → galaxy only, chart skipped

Change which monitor is primary with `xrandr --output DP-0 --primary` or
GNOME Settings → Displays.

## Troubleshooting

**Wallpaper visible but desktop icons are gone / right-click shows Chrome menu.**
DING got out of sync with our window mapping. The launch script tries to fix
this automatically by cycling DING, but a manual fix is:

```bash
gnome-extensions disable ding@rastersoft.com
gnome-extensions enable  ding@rastersoft.com
```

**Wallpaper didn't come up at login.** Check:

```bash
systemctl --user status gnome-session-monitor  # or check journalctl
curl -s http://127.0.0.1:43117/api/current      # is the server listening?
cat /tmp/desktop-wallpaper-server.pid           # is there a stale pidfile?
```

If the pidfile points to a non-existent PID, delete it and re-run
`start_wallpaper.sh`.

**CPU usage is too high.** The galaxy pane is Canvas2D with per-frame radial
gradients; on integrated GPUs it can hit 5–15% CPU steady-state. Lower the
drift speed or reduce `REFERENCE_STAR_COUNT` in `src/starfield3d.js`.

**Snap Brave instead of Google Chrome?** Won't work — snap-confined Brave
routes every new `brave ...` invocation to the already-running instance and
ignores `--user-data-dir`, so we can't isolate the two panes into separate
processes. Chrome `.deb` spawns one process per profile, as required.
