#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)

: "${HOME:?HOME is required}"

AUTO_FOLDER_REFACTOR_BIN_DIR=${AUTO_FOLDER_REFACTOR_BIN_DIR:-$HOME/.local/bin}
AUTO_FOLDER_REFACTOR_BIN_NAME=${AUTO_FOLDER_REFACTOR_BIN_NAME:-auto-folder-refactor}
AUTO_FOLDER_REFACTOR_INSTALL_BACKUP=${AUTO_FOLDER_REFACTOR_INSTALL_BACKUP:-1}

timestamp=$(date +%Y%m%d%H%M%S)
src="$script_dir/auto-folder-refactor.sh"
dest="$AUTO_FOLDER_REFACTOR_BIN_DIR/$AUTO_FOLDER_REFACTOR_BIN_NAME"

if [ ! -f "$src" ]; then
  printf 'auto-folder-refactor install: source not found: %s\n' "$src" >&2
  exit 1
fi

mkdir -p "$AUTO_FOLDER_REFACTOR_BIN_DIR"

if [ "$AUTO_FOLDER_REFACTOR_INSTALL_BACKUP" != "0" ] && [ -e "$dest" ]; then
  cp -p "$dest" "$dest.bak.$timestamp"
  printf 'backup: %s -> %s\n' "$dest" "$dest.bak.$timestamp"
fi

tmp="$dest.tmp.$$"
cat > "$tmp" <<EOF
#!/usr/bin/env sh
exec "$src" "\$@"
EOF
install -m 0755 "$tmp" "$dest"
rm -f "$tmp"
printf 'installed wrapper: %s -> %s\n' "$dest" "$src"

case ":$PATH:" in
  *":$AUTO_FOLDER_REFACTOR_BIN_DIR:"*) ;;
  *)
    printf 'note: add %s to PATH to run %s directly.\n' "$AUTO_FOLDER_REFACTOR_BIN_DIR" "$AUTO_FOLDER_REFACTOR_BIN_NAME"
    ;;
esac

printf 'example: %s 10\n' "$AUTO_FOLDER_REFACTOR_BIN_NAME"
printf 'example: %s 10 internal\n' "$AUTO_FOLDER_REFACTOR_BIN_NAME"
