#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)

: "${HOME:?HOME is required}"

AUTO_FOLDER_REFACTOR_BIN_DIR=${AUTO_FOLDER_REFACTOR_BIN_DIR:-$HOME/.local/bin}
AUTO_FOLDER_REFACTOR_BIN_NAME=${AUTO_FOLDER_REFACTOR_BIN_NAME:-autofolderrefactor}
AUTO_FOLDER_REFACTOR_INSTALL_DIR=${AUTO_FOLDER_REFACTOR_INSTALL_DIR:-$HOME/.local/share/autofolderrefactor}
AUTO_FOLDER_REFACTOR_INSTALL_BACKUP=${AUTO_FOLDER_REFACTOR_INSTALL_BACKUP:-1}
AUTO_FOLDER_REFACTOR_INSTALL_FORCE=${AUTO_FOLDER_REFACTOR_INSTALL_FORCE:-0}

timestamp=$(date +%Y%m%d%H%M%S)
src="$script_dir/autofolderrefactor"
dest="$AUTO_FOLDER_REFACTOR_BIN_DIR/$AUTO_FOLDER_REFACTOR_BIN_NAME"
app_dir="$AUTO_FOLDER_REFACTOR_INSTALL_DIR"

if [ ! -f "$src" ]; then
  printf 'autofolderrefactor install: source not found: %s\n' "$src" >&2
  exit 1
fi

case "$app_dir" in
  ""|"/"|"$HOME"|"$HOME/"|"$AUTO_FOLDER_REFACTOR_BIN_DIR"|"$AUTO_FOLDER_REFACTOR_BIN_DIR/")
    printf 'autofolderrefactor install: refusing unsafe install dir: %s\n' "$app_dir" >&2
    exit 2
    ;;
esac

if [ -e "$app_dir" ] && [ ! -f "$app_dir/.autofolderrefactor-install" ] && [ "$AUTO_FOLDER_REFACTOR_INSTALL_FORCE" != "1" ]; then
  if [ -n "$(find "$app_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    printf 'autofolderrefactor install: refusing to replace non-autofolderrefactor dir: %s\n' "$app_dir" >&2
    printf 'set AUTO_FOLDER_REFACTOR_INSTALL_FORCE=1 only if this directory is safe to replace.\n' >&2
    exit 2
  fi
fi

mkdir -p "$AUTO_FOLDER_REFACTOR_BIN_DIR" "$(dirname "$app_dir")"

if [ "$AUTO_FOLDER_REFACTOR_INSTALL_BACKUP" != "0" ] && [ -e "$dest" ]; then
  cp -p "$dest" "$dest.bak.$timestamp"
  printf 'backup: %s -> %s\n' "$dest" "$dest.bak.$timestamp"
fi
if [ "$AUTO_FOLDER_REFACTOR_INSTALL_BACKUP" != "0" ] && [ -e "$app_dir" ]; then
  rm -rf "$app_dir.bak.$timestamp"
  cp -R "$app_dir" "$app_dir.bak.$timestamp"
  printf 'backup: %s -> %s\n' "$app_dir" "$app_dir.bak.$timestamp"
fi

tmp_app="$app_dir.tmp.$$"
rm -rf "$tmp_app"
mkdir -p "$tmp_app"
cp -R "$script_dir"/. "$tmp_app"/
printf 'managed by autofolderrefactor install.sh\n' > "$tmp_app/.autofolderrefactor-install"
chmod +x "$tmp_app/autofolderrefactor"
rm -rf "$app_dir"
mv "$tmp_app" "$app_dir"

tmp="$dest.tmp.$$"
cat > "$tmp" <<EOF
#!/usr/bin/env sh
exec "$app_dir/autofolderrefactor" "\$@"
EOF
install -m 0755 "$tmp" "$dest"
rm -f "$tmp"
printf 'installed wrapper: %s -> %s\n' "$dest" "$app_dir/autofolderrefactor"

case ":$PATH:" in
  *":$AUTO_FOLDER_REFACTOR_BIN_DIR:"*) ;;
  *)
    printf 'note: add %s to PATH to run %s directly.\n' "$AUTO_FOLDER_REFACTOR_BIN_DIR" "$AUTO_FOLDER_REFACTOR_BIN_NAME"
    ;;
esac

printf 'example: %s 10\n' "$AUTO_FOLDER_REFACTOR_BIN_NAME"
printf 'example: %s 10 internal\n' "$AUTO_FOLDER_REFACTOR_BIN_NAME"
