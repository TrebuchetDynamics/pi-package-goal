#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)

: "${HOME:?HOME is required}"

TMUX_CONF_TARGET=${TMUX_CONF_TARGET:-$HOME/.tmux.conf}
TMUX_HELPER_DIR=${TMUX_HELPER_DIR:-$HOME/.tmux}
TX_BIN_DIR=${TX_BIN_DIR:-$HOME/.local/bin}
TX_BIN_NAME=${TX_BIN_NAME:-tx}
TX_INSTALL_BACKUP=${TX_INSTALL_BACKUP:-1}

timestamp=$(date +%Y%m%d%H%M%S)

backup_file() {
  target=$1
  if [ "$TX_INSTALL_BACKUP" != "0" ] && [ -e "$target" ]; then
    cp -p "$target" "$target.bak.$timestamp"
    printf 'backup: %s -> %s\n' "$target" "$target.bak.$timestamp"
  fi
}

install_file() {
  mode=$1
  src=$2
  dest=$3
  backup_file "$dest"
  install -m "$mode" "$src" "$dest"
  printf 'installed: %s\n' "$dest"
}

mkdir -p "$(dirname "$TMUX_CONF_TARGET")" "$TMUX_HELPER_DIR" "$TX_BIN_DIR"

install_file 0644 "$script_dir/tmux.conf" "$TMUX_CONF_TARGET"
install_file 0755 "$script_dir/git-status.sh" "$TMUX_HELPER_DIR/git-status.sh"
install_file 0755 "$script_dir/short-path.sh" "$TMUX_HELPER_DIR/short-path.sh"
install_file 0755 "$script_dir/tx" "$TX_BIN_DIR/$TX_BIN_NAME"

case ":$PATH:" in
  *":$TX_BIN_DIR:"*) ;;
  *)
    printf 'note: add %s to PATH to run %s directly.\n' "$TX_BIN_DIR" "$TX_BIN_NAME"
    ;;
esac

printf 'next: tmux source-file %s\n' "$TMUX_CONF_TARGET"
printf 'next: %s init  # if you do not have a tx config yet\n' "$TX_BIN_DIR/$TX_BIN_NAME"
