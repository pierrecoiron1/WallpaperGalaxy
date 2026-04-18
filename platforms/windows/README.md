# Desktop Wallpaper — Windows Deployment

> **Status: untested by the author.** The Linux path is the battle-tested one;
> this Windows setup is the expected working path based on Lively Wallpaper's
> documentation and equivalent tooling. Please report back what works and
> what doesn't — issues and PRs welcome.

## What you get

Same as Linux: a galaxy flythrough on one monitor, a procedural star-system
chart on another, with both panes sync'd through a local Python backend.
Window pinning to the desktop layer is handled by **Lively Wallpaper**
instead of the bespoke X11 gymnastics the Linux version uses.

## Prerequisites

- Windows 10 or 11
- [Lively Wallpaper](https://www.rocksdanister.com/lively/) — free, available
  on Microsoft Store
- Python 3.8 or newer. Install via winget:
  ```powershell
  winget install Python.Python.3.12
  ```

## Install

1. **Clone or download** this repo to a stable path, e.g.
   `C:\Users\<you>\wallpaper-galaxy`.

2. **Start the backend server:**

   ```powershell
   cd C:\Users\<you>\wallpaper-galaxy
   .\platforms\windows\start_server.ps1
   ```

   If PowerShell blocks the script with an execution-policy error, invoke it
   explicitly:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\platforms\windows\start_server.ps1
   ```

   You should see `Backend running at http://127.0.0.1:43117`.

3. **Install Lively Wallpaper** from Microsoft Store and launch it.

4. **Add the wallpaper to Lively:**
   - Click **+ Add Wallpaper** → choose the **URL** input
   - **Primary monitor:**
     `http://127.0.0.1:43117/Desktop%20Wallpaper.html?pane=galaxy`
   - **Secondary monitor** (if any):
     `http://127.0.0.1:43117/Desktop%20Wallpaper.html?pane=chart`
   - In Lively's per-display settings, assign each URL to its intended
     monitor.

## Autostart at login

```powershell
.\platforms\windows\install_autostart.ps1
```

This creates a shortcut in your Startup folder that launches
`start_server.ps1` at login. Lively auto-starts on its own, so between the
two, the wallpaper should come back after a reboot.

Remove the shortcut by deleting:
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WallpaperGalaxyServer.lnk`

## Stop

```powershell
.\platforms\windows\stop_server.ps1
```

This stops the backend only. To remove the wallpaper itself, change or
clear it in Lively.

## Configure (location, units)

Two equivalent options — both write to the same config endpoint:

- **Browser:** open `http://127.0.0.1:43117/config.html` in any browser.
- **Desktop GUI:** run the Tkinter app (tkinter ships with Python on Windows).
  ```powershell
  python config_gui.py
  ```

## Known gaps / things to verify

- **Multi-monitor sync.** Both panes fetch from `http://127.0.0.1:43117` so
  they should stay aligned regardless of whether Lively hosts them in the
  same browser process. Please confirm.
- **Safe-area insets.** The Linux script auto-detects GNOME's top-panel and
  dock heights from X11; on Windows we default to zero, which should be
  right for most setups since Lively keeps wallpaper below the taskbar. If
  the HUD overlaps your taskbar, append `&top=0&bottom=<taskbar_height>`
  to the Lively URLs.
- **pythonw.exe vs python.exe.** `start_server.ps1` prefers `pythonw` so no
  console flashes. If your Python install omitted pythonw, the script falls
  back to `python`, which will flash a console — harmless but visible.
- **Firewall.** Windows Defender may prompt on first run asking whether
  Python should accept connections. Allow on Private networks only; the
  server binds to 127.0.0.1, so it's already unreachable from outside.
