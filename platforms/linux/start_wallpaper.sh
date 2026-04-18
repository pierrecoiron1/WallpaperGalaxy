#!/usr/bin/env bash
# Launch "Desktop Wallpaper.html" as a dual-monitor live wallpaper on X11.
# One Chrome --app window per monitor, then demoted to
# _NET_WM_WINDOW_TYPE_DESKTOP so Nautilus icons and the desktop context menu
# stay on top.

set -euo pipefail

APP_DIR="$HOME/.local/share/desktop-wallpaper"
HTML="$APP_DIR/Desktop Wallpaper.html"
SERVER_PY="$APP_DIR/wallpaper_server.py"
SERVER_HOST="127.0.0.1"
SERVER_PORT=43117
SERVER_PID_FILE="/tmp/desktop-wallpaper-server.pid"

if [[ ! -f "$HTML" ]]; then
  echo "HTML file not found at: $HTML" >&2
  exit 1
fi
if [[ ! -f "$SERVER_PY" ]]; then
  echo "Backend server script not found at: $SERVER_PY" >&2
  exit 1
fi

# Start the backend server (idempotent). The server holds the current target
# seed that both panes sync against.
start_server() {
  if [[ -f "$SERVER_PID_FILE" ]] && kill -0 "$(cat "$SERVER_PID_FILE")" 2>/dev/null; then
    return 0
  fi
  python3 "$SERVER_PY" >/dev/null 2>&1 &
  echo $! > "$SERVER_PID_FILE"
  # Poll /api/current up to ~3s to make sure it's listening before we launch Chromes.
  for _ in $(seq 1 30); do
    if curl -sfo /dev/null "http://${SERVER_HOST}:${SERVER_PORT}/api/current" 2>/dev/null; then
      return 0
    fi
    sleep 0.1
  done
  echo "Backend server didn't respond within 3s — aborting." >&2
  return 1
}
start_server

# The HTML is served by the backend now — no more file:// origin.
URL_BASE="http://${SERVER_HOST}:${SERVER_PORT}/Desktop%20Wallpaper.html"

# Read per-monitor work areas from mutter so the HUD auto-respects the GNOME
# top panel and Ubuntu dock. _GTK_WORKAREAS_D0 returns a flat list of 4-tuples
# (x, y, w, h), one per monitor in the virtual display.
safe_area_for() {
  local mx="$1" my="$2" mh="$3"   # monitor origin x,y and height
  local raw
  raw="$(xprop -root _GTK_WORKAREAS_D0 2>/dev/null | sed 's/.*= //; s/,//g')"
  [[ -z "$raw" ]] && { echo "0 0"; return; }
  # shellcheck disable=SC2206
  local arr=($raw)
  local i n=${#arr[@]}
  for ((i = 0; i + 3 < n; i += 4)); do
    local wx="${arr[i]}" wy="${arr[i+1]}" ww="${arr[i+2]}" wh="${arr[i+3]}"
    # Match by monitor origin x; struts typically only reserve top/bottom.
    if [[ "$wx" == "$mx" ]]; then
      local top=$(( wy - my ))
      local bottom=$(( mh - wh - top ))
      (( top < 0 )) && top=0
      (( bottom < 0 )) && bottom=0
      echo "$top $bottom"
      return
    fi
  done
  echo "0 0"
}

# Isolated Chrome profiles (don't touch the user's main browsing)
PROFILE_GALAXY="$HOME/.local/share/desktop-wallpaper-profile-galaxy"
PROFILE_CHART="$HOME/.local/share/desktop-wallpaper-profile-chart"

# Discover monitors from xrandr. Galaxy goes on the primary, chart on the
# first non-primary connected output. Format: "W H X Y" per match.
xrandr_geom() {
  local filter="$1"
  xrandr --query 2>/dev/null \
    | grep -E "$filter" \
    | grep -oE '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+' \
    | head -1 \
    | tr 'x+' ' '
}
PRIMARY_GEOM="$(xrandr_geom ' connected primary ')"
SECONDARY_GEOM="$(xrandr --query 2>/dev/null | grep ' connected ' | grep -v ' primary ' | grep -oE '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+' | head -1 | tr 'x+' ' ')"

if [[ -z "$PRIMARY_GEOM" ]]; then
  echo "No primary monitor found via xrandr — aborting." >&2
  exit 1
fi
read GALAXY_W GALAXY_H GALAXY_X GALAXY_Y <<< "$PRIMARY_GEOM"

HAS_CHART=1
if [[ -n "$SECONDARY_GEOM" ]]; then
  read CHART_W CHART_H CHART_X CHART_Y <<< "$SECONDARY_GEOM"
else
  # Single-monitor setup: skip chart pane rather than stacking it on galaxy.
  HAS_CHART=0
  CHART_W=0; CHART_H=0; CHART_X=0; CHART_Y=0
fi

# Derive HUD safe-area insets from the WM's declared work area per monitor.
read GALAXY_TOP GALAXY_BOTTOM <<< "$(safe_area_for "$GALAXY_X" "$GALAXY_Y" "$GALAXY_H")"
read CHART_TOP  CHART_BOTTOM  <<< "$(safe_area_for "$CHART_X"  "$CHART_Y"  "$CHART_H")"

URL_GALAXY="${URL_BASE}?pane=galaxy&top=${GALAXY_TOP}&bottom=${GALAXY_BOTTOM}"
URL_CHART="${URL_BASE}?pane=chart&top=${CHART_TOP}&bottom=${CHART_BOTTOM}"

# Unique WM_CLASS per pane so wmctrl can find the right window
CLASS_GALAXY="desktop-wallpaper-galaxy"
CLASS_CHART="desktop-wallpaper-chart"

# If already running, bail — stop script handles teardown.
if pgrep -f "$PROFILE_GALAXY" >/dev/null || pgrep -f "$PROFILE_CHART" >/dev/null; then
  echo "Wallpaper already running. Run stop_wallpaper.sh first." >&2
  exit 0
fi

launch() {
  local url="$1" profile="$2" class="$3" w="$4" h="$5" x="$6" y="$7"
  google-chrome-stable \
    --user-data-dir="$profile" \
    --class="$class" \
    --app="$url" \
    --window-position="${x},${y}" \
    --window-size="${w},${h}" \
    --no-first-run \
    --no-default-browser-check \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-features=TranslateUI,InfiniteSessionRestore \
    --autoplay-policy=no-user-gesture-required \
    >/dev/null 2>&1 &
}

launch "$URL_GALAXY" "$PROFILE_GALAXY" "$CLASS_GALAXY" "$GALAXY_W" "$GALAXY_H" "$GALAXY_X" "$GALAXY_Y"
if (( HAS_CHART )); then
  launch "$URL_CHART"  "$PROFILE_CHART"  "$CLASS_CHART"  "$CHART_W"  "$CHART_H"  "$CHART_X"  "$CHART_Y"
fi

# Find the top-level managed window for each WM_CLASS via wmctrl.
# wmctrl -lx reports only WM-managed windows so hidden Chrome helpers are
# filtered out. Columns: <hex-wid> <desktop> <wm_class> <hostname> <title...>
find_wid() {
  local class="$1"
  wmctrl -lx 2>/dev/null | awk -v c="$class" '$3 ~ c {print $1; exit}'
}

WID_GALAXY=""; WID_CHART=""
for _ in $(seq 1 30); do
  [[ -z "$WID_GALAXY" ]] && WID_GALAXY="$(find_wid "$CLASS_GALAXY")"
  if (( HAS_CHART )) && [[ -z "$WID_CHART" ]]; then
    WID_CHART="$(find_wid "$CLASS_CHART")"
  fi
  if [[ -n "$WID_GALAXY" ]] && { (( ! HAS_CHART )) || [[ -n "$WID_CHART" ]]; }; then
    break
  fi
  sleep 0.5
done

if [[ -z "$WID_GALAXY" ]] || { (( HAS_CHART )) && [[ -z "$WID_CHART" ]]; }; then
  echo "Warning: couldn't find one of the windows (galaxy=$WID_GALAXY chart=$WID_CHART)" >&2
  echo "Wallpaper may appear as a normal window — run stop_wallpaper.sh and retry." >&2
  exit 1
fi

# Demote each window:
#  - _NET_WM_WINDOW_TYPE_DESKTOP : mutter places this below Nautilus' icon layer
#  - sticky : visible on all workspaces
#  - below  : stays beneath normal windows
#  - skip_taskbar / skip_pager : doesn't appear in window switchers
# Then explicitly set geometry in case Brave/Chrome drifted it.
demote() {
  local wid="$1" w="$2" h="$3" x="$4" y="$5"
  xprop -id "$wid" -f _NET_WM_WINDOW_TYPE 32a \
        -set _NET_WM_WINDOW_TYPE _NET_WM_WINDOW_TYPE_DESKTOP
  wmctrl -i -r "$wid" -b add,sticky,below,skip_taskbar,skip_pager || true
  wmctrl -i -r "$wid" -e "0,${x},${y},${w},${h}" || true
}

demote "$WID_GALAXY" "$GALAXY_W" "$GALAXY_H" "$GALAXY_X" "$GALAXY_Y"
if (( HAS_CHART )); then
  demote "$WID_CHART"  "$CHART_W"  "$CHART_H"  "$CHART_X"  "$CHART_Y"
fi

# Our wallpaper windows and DING (GNOME's desktop-icons extension) are both
# type=DESKTOP, so mutter stacks them in mapping order. Since we just mapped
# ours, they're on top of DING — which means icons disappear and right-click
# hits Chrome. Cycling DING forces it to re-map above us.
if command -v gnome-extensions >/dev/null 2>&1; then
  if gnome-extensions list --enabled 2>/dev/null | grep -q '^ding@rastersoft.com$'; then
    gnome-extensions disable ding@rastersoft.com 2>/dev/null || true
    sleep 0.5
    gnome-extensions enable  ding@rastersoft.com 2>/dev/null || true
  fi
fi

echo "Wallpaper launched."
echo "  galaxy: WID=$WID_GALAXY  ${GALAXY_W}x${GALAXY_H}+${GALAXY_X}+${GALAXY_Y}"
if (( HAS_CHART )); then
  echo "  chart : WID=$WID_CHART  ${CHART_W}x${CHART_H}+${CHART_X}+${CHART_Y}"
else
  echo "  chart : (skipped — no secondary monitor detected)"
fi
