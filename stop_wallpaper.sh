#!/usr/bin/env bash
# Kill the dual-monitor live wallpaper Brave instances.
# Matches only our isolated profiles so the user's regular Brave is untouched.

set -u

PROFILE_GALAXY="$HOME/.local/share/desktop-wallpaper-profile-galaxy"
PROFILE_CHART="$HOME/.local/share/desktop-wallpaper-profile-chart"

killed=0
for profile in "$PROFILE_GALAXY" "$PROFILE_CHART"; do
  # -f matches against the full command line; Brave processes carry the
  # --user-data-dir=<profile> argument, which is uniquely ours.
  if pgrep -f "$profile" >/dev/null; then
    pkill -f "$profile" || true
    killed=$((killed + 1))
  fi
done

if [[ $killed -eq 0 ]]; then
  echo "No wallpaper instances running."
else
  # Give Brave a moment to exit cleanly; force-kill anything left over.
  sleep 1
  for profile in "$PROFILE_GALAXY" "$PROFILE_CHART"; do
    pkill -9 -f "$profile" 2>/dev/null || true
  done
  echo "Stopped."
fi
