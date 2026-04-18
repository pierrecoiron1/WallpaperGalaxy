# Wallpaper Galaxy

A live, dual-monitor desktop wallpaper: a galaxy flythrough with a tracking
HUD on one monitor, a procedural star-system chart on the other, both
sync'd through a tiny local HTTP backend.

Pure Canvas2D + ES modules. Python stdlib backend. No build step, no
dependencies beyond what ships with your OS.

## Install

Pick your platform:

- **Linux** (Ubuntu 24.04 + GNOME on Xorg, tested) →
  [platforms/linux/README.md](platforms/linux/README.md)
- **Windows 10 / 11** (via Lively Wallpaper, *untested — help wanted*) →
  [platforms/windows/README.md](platforms/windows/README.md)

## Configure (location, units)

Two interchangeable ways to change settings — both hit the same backend
endpoints, so pick whichever suits the moment:

- **Browser:** open `http://127.0.0.1:43117/config.html` in a regular browser
  window (not the wallpaper itself — it's a desktop layer that can't take
  input).
- **Desktop app:** run the stdlib-only Tkinter GUI — works on Linux,
  Windows, macOS without extra packages beyond Python.

  ```bash
  python3 config_gui.py
  ```

  On Ubuntu you may need `sudo apt install python3-tk` once. Windows and
  macOS Python ships with tkinter bundled.

## Repo layout

```
.
├── Desktop Wallpaper.html   # app entry point (shared)
├── src/                     # ES modules (shared)
│   ├── galaxy3d.js          # forward-flight camera
│   ├── starfield3d.js       # star simulation
│   ├── galaxyhud.js         # overlay HUD on the galaxy canvas
│   ├── systemmap.js         # right-monitor star chart
│   ├── system.js            # procedural star+planet generator
│   └── nebula.js, rng.js, …
├── wallpaper_server.py      # local sync backend (shared; stdlib only)
├── config.html              # browser config page served by the backend
├── config_gui.py            # Tkinter desktop config app (cross-platform)
├── platforms/
│   ├── linux/               # bash launch scripts + GNOME autostart
│   └── windows/              # PowerShell scripts + Lively Wallpaper setup
└── README.md                # this file
```

## How it works

Two browser windows, one per monitor, each loading the same HTML with a
different `?pane=` query param:

- `?pane=galaxy` → full-screen galaxy flythrough + HUD
- `?pane=chart` → procedural system chart for the currently-tracked star

The two windows are isolated browser profiles, so they can't share
localStorage. Instead, a tiny Python server
(`wallpaper_server.py`, stdlib `http.server`) holds a single uint32 "current
seed":

- Galaxy pane POSTs `/api/rotate` when its reticle star drifts off-screen
  → server picks a new random seed → galaxy regenerates system locally
- Chart pane polls `GET /api/current` once a second → re-renders with the
  new system when the seed changes

Both the star simulation and the system-chart reveal animation are
deterministic on seed alone, so both panes always show the same system.

## Contributing

- **Linux bugs** → I have a repro machine.
- **Windows setup** → I don't. If you try it, please report back.
- **New platforms / installers / packaging** → very welcome. The
  `platforms/` directory is intentionally set up to fit more OSes without
  restructuring.
