#!/usr/bin/env bash
# Install an app-menu entry for the Wallpaper Galaxy config GUI.
# Drops a .desktop file in ~/.local/share/applications/ and an icon in
# ~/.local/share/icons/. GNOME/KDE/XFCE all pick these up automatically.

set -euo pipefail

APP_DIR="$HOME/.local/share/desktop-wallpaper"
MENU_FILE="$HOME/.local/share/applications/wallpaper-galaxy-config.desktop"
ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
ICON_FILE="$ICON_DIR/wallpaper-galaxy.png"

CONFIG_GUI="$APP_DIR/config_gui.py"
ICON_SRC="$APP_DIR/Assets/icon-256.png"

if [[ ! -f "$CONFIG_GUI" ]]; then
  echo "config_gui.py not found at: $CONFIG_GUI" >&2
  echo "Run platforms/linux/install_wallpaper.sh first (or stage the files)." >&2
  exit 1
fi
if [[ ! -f "$ICON_SRC" ]]; then
  echo "Icon source missing at: $ICON_SRC" >&2
  exit 1
fi

# Icon: copy into the standard hicolor path so the desktop environment
# finds it by name ("wallpaper-galaxy").
mkdir -p "$ICON_DIR"
cp "$ICON_SRC" "$ICON_FILE"

# Menu entry.
mkdir -p "$(dirname "$MENU_FILE")"
cat > "$MENU_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Wallpaper Galaxy Config
Comment=Configure location, units, flight speed, and stellar density
Exec=python3 "$CONFIG_GUI"
Icon=wallpaper-galaxy
Terminal=false
Categories=Settings;
Keywords=wallpaper;galaxy;weather;
EOF
chmod +x "$MENU_FILE"

# Refresh the icon cache so the launcher picks up the new icon immediately.
# Missing gtk-update-icon-cache is non-fatal — GNOME will notice on next login.
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache --quiet "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
fi

echo "Installed shortcut:"
echo "  menu entry: $MENU_FILE"
echo "  icon:       $ICON_FILE"
echo
echo "Launch from GNOME's 'Show Apps' → search 'Wallpaper Galaxy Config',"
echo "or run directly: python3 \"$CONFIG_GUI\""
