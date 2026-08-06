#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)

: "${HOME:?HOME is required}"

AUTO_FOLDER_REFACTOR_BIN_DIR=${AUTO_FOLDER_REFACTOR_BIN_DIR:-$HOME/.local/bin}
AUTO_FOLDER_REFACTOR_BIN_NAME=${AUTO_FOLDER_REFACTOR_BIN_NAME:-autofolderrefactor}
AUTO_FOLDER_REFACTOR_INSTALL_DIR=${AUTO_FOLDER_REFACTOR_INSTALL_DIR:-$HOME/.local/share/autofolderrefactor}
AUTO_FOLDER_REFACTOR_INSTALL_BACKUP=${AUTO_FOLDER_REFACTOR_INSTALL_BACKUP:-1}
AUTO_FOLDER_REFACTOR_INSTALL_FORCE=${AUTO_FOLDER_REFACTOR_INSTALL_FORCE:-0}

timestamp=$(date +%Y%m%d%H%M%S).$$
src="$script_dir/autofolderrefactor"
dest="$AUTO_FOLDER_REFACTOR_BIN_DIR/$AUTO_FOLDER_REFACTOR_BIN_NAME"
app_dir="$AUTO_FOLDER_REFACTOR_INSTALL_DIR"

shell_quote() {
  printf "'"
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
  printf "'"
}

if [ ! -f "$src" ]; then
  printf 'autofolderrefactor install: source not found: %s\n' "$src" >&2
  exit 1
fi

case "$AUTO_FOLDER_REFACTOR_INSTALL_BACKUP" in
  0|1) ;;
  *) printf 'autofolderrefactor install: AUTO_FOLDER_REFACTOR_INSTALL_BACKUP must be 0 or 1\n' >&2; exit 2 ;;
esac
case "$AUTO_FOLDER_REFACTOR_INSTALL_FORCE" in
  0|1) ;;
  *) printf 'autofolderrefactor install: AUTO_FOLDER_REFACTOR_INSTALL_FORCE must be 0 or 1\n' >&2; exit 2 ;;
esac
if [ "$AUTO_FOLDER_REFACTOR_INSTALL_FORCE" = "1" ] && [ "$AUTO_FOLDER_REFACTOR_INSTALL_BACKUP" = "0" ]; then
  printf 'autofolderrefactor install: forced replacement requires backups\n' >&2
  exit 2
fi
case "$AUTO_FOLDER_REFACTOR_BIN_NAME" in
  ''|.|..|*/*) printf 'autofolderrefactor install: AUTO_FOLDER_REFACTOR_BIN_NAME must be a file name\n' >&2; exit 2 ;;
esac

case "$app_dir" in
  ""|"/"|"$HOME"|"$HOME/"|"$AUTO_FOLDER_REFACTOR_BIN_DIR"|"$AUTO_FOLDER_REFACTOR_BIN_DIR/")
    printf 'autofolderrefactor install: refusing unsafe install dir: %s\n' "$app_dir" >&2
    exit 2
    ;;
esac

if [ -L "$app_dir" ]; then
  printf 'autofolderrefactor install: refusing symlink install dir: %s\n' "$app_dir" >&2
  exit 2
fi
if [ -e "$app_dir" ] && [ ! -d "$app_dir" ]; then
  printf 'autofolderrefactor install: install path exists and is not a directory: %s\n' "$app_dir" >&2
  exit 2
fi

if [ -e "$app_dir" ] && [ ! -f "$app_dir/.autofolderrefactor-install" ]; then
  legacy_exec="exec $(shell_quote "$app_dir/autofolderrefactor") \"\$@\""
  legacy_exec_double="exec \"$app_dir/autofolderrefactor\" \"\$@\""
  if [ ! -f "$app_dir/autofolderrefactor" ] || [ ! -f "$dest" ] || { ! grep -Fqx "$legacy_exec" "$dest" && ! grep -Fqx "$legacy_exec_double" "$dest"; }; then
    if [ -n "$(find "$app_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
      if [ "$AUTO_FOLDER_REFACTOR_INSTALL_FORCE" = "1" ]; then
        home_real=$(CDPATH= cd -P "$HOME" && pwd)
        app_real=$(CDPATH= cd -P "$app_dir" && pwd)
        case "$app_real" in
          "$home_real")
            printf 'autofolderrefactor install: refusing unsafe install dir: %s\n' "$app_dir" >&2
            exit 2
            ;;
          "$home_real"/*) ;;
          *)
            printf 'autofolderrefactor install: force replacement is limited to HOME: %s\n' "$app_dir" >&2
            exit 2
            ;;
        esac
        if [ -d "$AUTO_FOLDER_REFACTOR_BIN_DIR" ]; then
          bin_real=$(CDPATH= cd -P "$AUTO_FOLDER_REFACTOR_BIN_DIR" && pwd)
          case "$bin_real" in
            "$app_real"|"$app_real"/*)
              printf 'autofolderrefactor install: refusing install dir containing bin dir: %s\n' "$app_dir" >&2
              exit 2
              ;;
          esac
        fi
      else
        printf 'autofolderrefactor install: refusing to replace non-autofolderrefactor dir: %s\n' "$app_dir" >&2
        printf 'set AUTO_FOLDER_REFACTOR_INSTALL_FORCE=1 only for a directory inside HOME that is safe to replace.\n' >&2
        exit 2
      fi
    fi
  fi
fi

mkdir -p "$AUTO_FOLDER_REFACTOR_BIN_DIR" "$(dirname "$app_dir")"

tmp=
tmp_app=$(mktemp -d "${app_dir}.tmp.XXXXXX")
cleanup() {
  rm -rf "$tmp_app"
  [ -z "$tmp" ] || rm -f "$tmp"
}
trap cleanup EXIT
trap 'cleanup; exit 1' HUP INT TERM
tmp=$(mktemp "${dest}.tmp.XXXXXX")
cp -R "$script_dir"/. "$tmp_app"/
printf 'managed by autofolderrefactor install.sh\n' > "$tmp_app/.autofolderrefactor-install"
chmod +x "$tmp_app/autofolderrefactor"

app_exec=$(shell_quote "$app_dir/autofolderrefactor")
cat > "$tmp" <<EOF
#!/usr/bin/env sh
exec $app_exec "\$@"
EOF

if [ -d "$app_dir" ] && [ -f "$dest" ] && diff -qr "$tmp_app" "$app_dir" >/dev/null 2>&1 && cmp -s "$tmp" "$dest"; then
  chmod +x "$app_dir/autofolderrefactor" "$dest"
  rm -rf "$tmp_app"
  rm -f "$tmp"
  printf 'unchanged wrapper: %s -> %s\n' "$dest" "$app_dir/autofolderrefactor"
else
  if [ "$AUTO_FOLDER_REFACTOR_INSTALL_BACKUP" != "0" ] && [ -e "$dest" ]; then
    cp -p "$dest" "$dest.bak.$timestamp"
    printf 'backup: %s -> %s\n' "$dest" "$dest.bak.$timestamp"
  fi
  if [ "$AUTO_FOLDER_REFACTOR_INSTALL_BACKUP" != "0" ] && [ -e "$app_dir" ]; then
    cp -R "$app_dir" "$app_dir.bak.$timestamp"
    printf 'backup: %s -> %s\n' "$app_dir" "$app_dir.bak.$timestamp"
  fi
  rm -rf "$app_dir"
  mv "$tmp_app" "$app_dir"
  install -m 0755 "$tmp" "$dest"
  rm -f "$tmp"
  printf 'installed wrapper: %s -> %s\n' "$dest" "$app_dir/autofolderrefactor"
fi

case ":$PATH:" in
  *":$AUTO_FOLDER_REFACTOR_BIN_DIR:"*) ;;
  *)
    printf 'note: add %s to PATH to run %s directly.\n' "$AUTO_FOLDER_REFACTOR_BIN_DIR" "$AUTO_FOLDER_REFACTOR_BIN_NAME"
    ;;
esac

printf 'example: %s 10\n' "$AUTO_FOLDER_REFACTOR_BIN_NAME"
printf 'example: %s 10 internal\n' "$AUTO_FOLDER_REFACTOR_BIN_NAME"
