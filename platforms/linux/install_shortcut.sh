#!/usr/bin/env bash
# Install an app-menu entry for the Wallpaper Galaxy config GUI.
# Drops a .desktop file in ~/.local/share/applications/ and an icon in
# ~/.local/share/icons/. GNOME/KDE/XFCE all pick these up automatically.

set -euo pipefail

APP_DIR="$HOME/.local/share/desktop-wallpaper"
MENU_FILE="$HOME/.local/share/applications/wallpaper-galaxy-config.desktop"
# Reference the icon by absolute path — sidesteps theme-cache quirks that
# can leave GNOME Shell showing the generic gear until next login.
ICON_FILE="$APP_DIR/Assets/icon-256.png"
CONFIG_GUI="$APP_DIR/config_gui.py"

if [[ ! -f "$CONFIG_GUI" ]]; then
  echo "config_gui.py not found at: $CONFIG_GUI" >&2
  echo "Stage the files first (see platforms/linux/README.md)." >&2
  exit 1
fi
if [[ ! -f "$ICON_FILE" ]]; then
  echo "Icon missing at: $ICON_FILE" >&2
  echo "Make sure Assets/ was copied when staging." >&2
  exit 1
fi

# Menu entry.
mkdir -p "$(dirname "$MENU_FILE")"
cat > "$MENU_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Wallpaper Galaxy Config
Comment=Configure location, units, flight speed, and stellar density
Exec=python3 "$CONFIG_GUI"
Icon=$ICON_FILE
Terminal=false
Categories=Settings;
Keywords=wallpaper;galaxy;weather;
EOF
chmod +x "$MENU_FILE"

# Touch the applications directory so GNOME Shell re-scans without a logout
# (watches directory mtime). Quick no-op if already up-to-date.
touch "$(dirname "$MENU_FILE")"

echo "Installed shortcut:"
echo "  menu entry: $MENU_FILE"
echo "  icon:       $ICON_FILE"
echo
echo "Launch from GNOME's 'Show Apps' → search 'Wallpaper Galaxy Config',"
echo "or run directly: python3 \"$CONFIG_GUI\""
echo
echo "If the icon still shows as a gear, restart GNOME Shell with Alt+F2,"
echo "type 'r', press Enter — or just log out and back in."
