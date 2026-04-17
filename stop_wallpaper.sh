#!/usr/bin/env bash
# Kill the dual-monitor live wallpaper Chrome instances and the backend server.
# Matches only our isolated profiles so the user's regular browsing is untouched.

set -u

PROFILE_GALAXY="$HOME/.local/share/desktop-wallpaper-profile-galaxy"
PROFILE_CHART="$HOME/.local/share/desktop-wallpaper-profile-chart"
SERVER_PID_FILE="/tmp/desktop-wallpaper-server.pid"

killed=0
for profile in "$PROFILE_GALAXY" "$PROFILE_CHART"; do
  # -f matches against the full command line; Chrome processes carry the
  # --user-data-dir=<profile> argument, which is uniquely ours.
  if pgrep -f "$profile" >/dev/null; then
    pkill -f "$profile" || true
    killed=$((killed + 1))
  fi
done

# Backend server — kill via pidfile if present, then fall back to pattern
# match in case the pidfile was lost or the process orphaned.
if [[ -f "$SERVER_PID_FILE" ]]; then
  server_pid="$(cat "$SERVER_PID_FILE" 2>/dev/null || true)"
  if [[ -n "${server_pid:-}" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    killed=$((killed + 1))
  fi
  rm -f "$SERVER_PID_FILE"
fi
if pgrep -f 'wallpaper_server\.py' >/dev/null 2>&1; then
  pkill -f 'wallpaper_server\.py' || true
  killed=$((killed + 1))
fi

if [[ $killed -eq 0 ]]; then
  echo "No wallpaper instances running."
else
  # Give processes a moment to exit cleanly; force-kill anything left over.
  sleep 1
  for profile in "$PROFILE_GALAXY" "$PROFILE_CHART"; do
    pkill -9 -f "$profile" 2>/dev/null || true
  done
  pkill -9 -f 'wallpaper_server\.py' 2>/dev/null || true
  echo "Stopped."
fi
