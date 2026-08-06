#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)

: "${HOME:?HOME is required}"

TMUX_CONF_TARGET=${TMUX_CONF_TARGET:-$HOME/.tmux.conf}
TMUX_HELPER_DIR=${TMUX_HELPER_DIR:-$HOME/.tmux}
TX_BIN_DIR=${TX_BIN_DIR:-$HOME/.local/bin}
TX_BIN_NAME=${TX_BIN_NAME:-tx}
TX_INSTALL_BACKUP=${TX_INSTALL_BACKUP:-1}
TX_INSTALL_COMPLETIONS=${TX_INSTALL_COMPLETIONS:-1}
TX_BASH_COMPLETION_DIR=${TX_BASH_COMPLETION_DIR:-$HOME/.local/share/bash-completion/completions}
TX_FISH_COMPLETION_DIR=${TX_FISH_COMPLETION_DIR:-$HOME/.config/fish/completions}
TX_ZSH_COMPLETION_DIR=${TX_ZSH_COMPLETION_DIR:-$HOME/.zsh/completions}
TX_INSTALL_BASHRC_COMPLETION=${TX_INSTALL_BASHRC_COMPLETION:-1}

for setting in TX_INSTALL_BACKUP TX_INSTALL_COMPLETIONS TX_INSTALL_BASHRC_COMPLETION; do
  eval "value=\${$setting}"
  case "$value" in
    0|1) ;;
    *) printf 'tmux install: %s must be 0 or 1\n' "$setting" >&2; exit 2 ;;
  esac
done
case "$TX_BIN_NAME" in
  ''|.|..|*/*) printf 'tmux install: TX_BIN_NAME must be a file name\n' >&2; exit 2 ;;
esac

timestamp=$(date +%Y%m%d%H%M%S).$$

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
  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    chmod "$mode" "$dest"
    printf 'unchanged: %s\n' "$dest"
    return
  fi
  backup_file "$dest"
  install -m "$mode" "$src" "$dest"
  printf 'installed: %s\n' "$dest"
}

install_file_if_missing() {
  mode=$1
  src=$2
  dest=$3
  if [ -e "$dest" ]; then
    printf 'kept existing: %s\n' "$dest"
    return 0
  fi
  install -m "$mode" "$src" "$dest"
  printf 'installed: %s\n' "$dest"
}

shell_quote() {
  printf "'"
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
  printf "'"
}

sed_replacement_escape() {
  printf '%s' "$1" | sed 's/[&|\\]/\\&/g'
}

install_tmux_conf() {
  src=$1
  dest=$2
  short_path_cmd=$(sed_replacement_escape "$(shell_quote "$TMUX_HELPER_DIR/short-path.sh")")
  git_status_cmd=$(sed_replacement_escape "$(shell_quote "$TMUX_HELPER_DIR/git-status.sh")")
  tmp=$(mktemp "${TMPDIR:-/tmp}/tx-tmux.conf.XXXXXX")
  trap 'rm -f "$tmp"' EXIT
  trap 'rm -f "$tmp"; exit 1' HUP INT TERM
  sed \
    -e "s|~/.tmux/short-path.sh|$short_path_cmd|g" \
    -e "s|~/.tmux/git-status.sh|$git_status_cmd|g" \
    "$src" > "$tmp"
  install_file 0644 "$tmp" "$dest"
  rm -f "$tmp"
  trap - EXIT HUP INT TERM
}

install_completion() {
  shell=$1
  dest=$2
  tmp=$(mktemp "${TMPDIR:-/tmp}/tx-completion.XXXXXX")
  trap 'rm -f "$tmp"' EXIT
  trap 'rm -f "$tmp"; exit 1' HUP INT TERM
  TX_COMPLETION_COMMAND=$TX_BIN_NAME "$script_dir/tx" completion "$shell" > "$tmp"
  install_file 0644 "$tmp" "$dest"
  rm -f "$tmp"
  trap - EXIT HUP INT TERM
}

install_completions() {
  [ "$TX_INSTALL_COMPLETIONS" = "1" ] || return 0

  mkdir -p "$TX_BASH_COMPLETION_DIR" "$TX_FISH_COMPLETION_DIR" "$TX_ZSH_COMPLETION_DIR"
  install_completion bash "$TX_BASH_COMPLETION_DIR/$TX_BIN_NAME"
  install_completion fish "$TX_FISH_COMPLETION_DIR/$TX_BIN_NAME.fish"
  install_completion zsh "$TX_ZSH_COMPLETION_DIR/_$TX_BIN_NAME"

  bashrc="$HOME/.bashrc"
  if [ "$TX_INSTALL_BASHRC_COMPLETION" = "1" ] && [ -f "$bashrc" ] && ! grep -F "# tx completion" "$bashrc" >/dev/null 2>&1; then
    backup_file "$bashrc"
    completion_file=$(shell_quote "$TX_BASH_COMPLETION_DIR/$TX_BIN_NAME")
    {
      printf '\n# tx completion\n'
      printf '[ -r %s ] && . %s\n' "$completion_file" "$completion_file"
    } >> "$bashrc"
    printf 'updated shell rc: %s\n' "$bashrc"
  fi
}

mkdir -p "$(dirname "$TMUX_CONF_TARGET")" "$HOME/.tmux" "$TMUX_HELPER_DIR" "$TX_BIN_DIR"

install_tmux_conf "$script_dir/tmux.conf" "$TMUX_CONF_TARGET"
install_file_if_missing 0644 "$script_dir/style.tmux" "$HOME/.tmux/style.tmux"
install_file 0755 "$script_dir/git-status.sh" "$TMUX_HELPER_DIR/git-status.sh"
install_file 0755 "$script_dir/short-path.sh" "$TMUX_HELPER_DIR/short-path.sh"
install_file 0755 "$script_dir/tx" "$TX_BIN_DIR/$TX_BIN_NAME"
install_completions

case ":$PATH:" in
  *":$TX_BIN_DIR:"*) ;;
  *)
    printf 'note: add %s to PATH to run %s directly.\n' "$TX_BIN_DIR" "$TX_BIN_NAME"
    ;;
esac

printf 'next: tmux source-file %s\n' "$(shell_quote "$TMUX_CONF_TARGET")"
printf 'next: %s init  # if you do not have a tx config yet\n' "$(shell_quote "$TX_BIN_DIR/$TX_BIN_NAME")"
if [ "$TX_INSTALL_COMPLETIONS" = "1" ]; then
  printf 'next: source %s  # enable tx alias completion in this shell\n' "$(shell_quote "$TX_BASH_COMPLETION_DIR/$TX_BIN_NAME")"
fi
