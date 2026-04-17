#!/usr/bin/env bash
# Launch "Desktop Wallpaper.html" as a dual-monitor live wallpaper on X11.
# One Chrome --app window per monitor, then demoted to
# _NET_WM_WINDOW_TYPE_DESKTOP so Nautilus icons and the desktop context menu
# stay on top.

set -euo pipefail

APP_DIR="$HOME/.local/share/desktop-wallpaper"
HTML="$APP_DIR/Desktop Wallpaper.html"

if [[ ! -f "$HTML" ]]; then
  echo "HTML file not found at: $HTML" >&2
  exit 1
fi

# file:// URL with spaces encoded
URL_BASE="file://$(python3 -c 'import sys,urllib.parse as u; print(u.quote(sys.argv[1]))' "$HTML")"

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

# Monitor geometries — from xrandr at setup time:
#   DP-0    3440x1440+0+0     (left, ultrawide)
#   HDMI-0  1920x1080+3440+0  (right)
GALAXY_W=3440; GALAXY_H=1440; GALAXY_X=0;    GALAXY_Y=0
CHART_W=1920;  CHART_H=1080;  CHART_X=3440;  CHART_Y=0

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
  # --allow-file-access-from-files is required so the HTML can import its
  # ES modules from sibling src/*.js files over file://.
  google-chrome-stable \
    --user-data-dir="$profile" \
    --class="$class" \
    --app="$url" \
    --window-position="${x},${y}" \
    --window-size="${w},${h}" \
    --allow-file-access-from-files \
    --no-first-run \
    --no-default-browser-check \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-features=TranslateUI,InfiniteSessionRestore \
    --autoplay-policy=no-user-gesture-required \
    >/dev/null 2>&1 &
}

launch "$URL_GALAXY" "$PROFILE_GALAXY" "$CLASS_GALAXY" "$GALAXY_W" "$GALAXY_H" "$GALAXY_X" "$GALAXY_Y"
launch "$URL_CHART"  "$PROFILE_CHART"  "$CLASS_CHART"  "$CHART_W"  "$CHART_H"  "$CHART_X"  "$CHART_Y"

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
  [[ -z "$WID_CHART"  ]] && WID_CHART="$(find_wid "$CLASS_CHART")"
  if [[ -n "$WID_GALAXY" && -n "$WID_CHART" ]]; then break; fi
  sleep 0.5
done

if [[ -z "$WID_GALAXY" || -z "$WID_CHART" ]]; then
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
demote "$WID_CHART"  "$CHART_W"  "$CHART_H"  "$CHART_X"  "$CHART_Y"

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
echo "  chart : WID=$WID_CHART  ${CHART_W}x${CHART_H}+${CHART_X}+${CHART_Y}"
