#!/usr/bin/env bash
# Cài shortcut Claude Studio vào menu ứng dụng (KDE/GNOME) cho user hiện tại.
#   ./install.sh            -> ưu tiên AppImage trong dist/, nếu không có thì chạy từ mã nguồn (npm start)
#   ./install.sh --source   -> luôn chạy từ mã nguồn
#   ./install.sh --uninstall
# Thêm cờ cho app qua biến môi trường, ví dụ:  CLAUDE_STUDIO_ARGS="--studio-no-gpu" ./install.sh
set -euo pipefail

APP_ID="claude-studio"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
BIN_DIR="$HOME/.local/bin"
DESKTOP_FILE="$APPS_DIR/$APP_ID.desktop"
EXTRA_ARGS="${CLAUDE_STUDIO_ARGS:-}"

refresh_menus() {
  update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
  gtk-update-icon-cache -q -t "$ICON_DIR" >/dev/null 2>&1 || true
  command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$DESKTOP_FILE" "$BIN_DIR/$APP_ID" "$BIN_DIR/$APP_ID.AppImage" \
        "$ICON_DIR/512x512/apps/$APP_ID.png" "$ICON_DIR/scalable/apps/$APP_ID.svg"
  refresh_menus
  echo "Đã gỡ shortcut Claude Studio. (Dữ liệu đăng nhập vẫn ở ~/.config/Claude Studio)"
  exit 0
fi

mkdir -p "$APPS_DIR" "$BIN_DIR" "$ICON_DIR/512x512/apps" "$ICON_DIR/scalable/apps"
install -m 644 "$SRC_DIR/assets/icon.png" "$ICON_DIR/512x512/apps/$APP_ID.png"
install -m 644 "$SRC_DIR/assets/icon.svg" "$ICON_DIR/scalable/apps/$APP_ID.svg"

APPIMAGE="$(ls -1t "$SRC_DIR"/dist/*.AppImage 2>/dev/null | head -n1 || true)"

if [[ "${1:-}" != "--source" && -n "$APPIMAGE" ]]; then
  install -m 755 "$APPIMAGE" "$BIN_DIR/$APP_ID.AppImage"
  EXEC="$BIN_DIR/$APP_ID.AppImage${EXTRA_ARGS:+ $EXTRA_ARGS}"
  MODE="AppImage ($APPIMAGE)"
else
  if [[ ! -x "$SRC_DIR/node_modules/.bin/electron" ]]; then
    echo "Chưa có node_modules. Chạy 'npm install' trong $SRC_DIR trước." >&2
    exit 1
  fi
  # Launcher nhỏ để .desktop không phải xử lý 'cd' và dấu cách trong đường dẫn.
  cat > "$BIN_DIR/$APP_ID" <<EOF
#!/usr/bin/env bash
cd "$SRC_DIR" && exec "$SRC_DIR/node_modules/.bin/electron" . $EXTRA_ARGS "\$@"
EOF
  chmod 755 "$BIN_DIR/$APP_ID"
  EXEC="$BIN_DIR/$APP_ID"
  MODE="mã nguồn ($SRC_DIR)"
fi

sed "s|@EXEC@|$EXEC|" "$SRC_DIR/claude-studio.desktop" > "$DESKTOP_FILE"
chmod 644 "$DESKTOP_FILE"
refresh_menus

echo "Đã cài Claude Studio -> $DESKTOP_FILE"
echo "Chế độ chạy: $MODE"
