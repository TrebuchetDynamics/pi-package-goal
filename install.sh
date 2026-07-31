#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)

: "${HOME:?HOME is required}"
PATH="$HOME/.local/bin:$HOME/.local/share/pi-node/current/bin:$PATH"
export PATH

PI_GOAL_SOURCE=${PI_GOAL_SOURCE:-git:github.com/TrebuchetDynamics/pi-package-goal}
PI_INSTALL_URL=${PI_INSTALL_URL:-https://pi.dev/install.sh}
RTK_INSTALL_URL=${RTK_INSTALL_URL:-https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh}
PI_GOAL_SKIP_OMNIROUTE=${PI_GOAL_SKIP_OMNIROUTE:-0}
dry_run=0

usage() {
  cat <<'EOF'
Usage: sh install.sh [--dry-run]

Install the complete pi-package-goal setup:
  - Pi coding agent and this Pi package
  - tmux and tx with the bundled tmux profile
  - Search Hub research extension and Understand-Anything skills
  - RTK binary
  - OmniRoute daemon and Pi configuration
  - Global Codex and Claude skill copies

Options:
  --dry-run  Print the installation plan without changing the system
  -h, --help Show this help

Environment:
  PI_GOAL_SKIP_OMNIROUTE=1  Skip OmniRoute installation and configuration
  RTK_VERSION=vX.Y.Z        Pin the RTK version used by its official installer
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'install: unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

case "$PI_GOAL_SKIP_OMNIROUTE" in
  0|1) ;;
  *) printf 'install: PI_GOAL_SKIP_OMNIROUTE must be 0 or 1\n' >&2; exit 2 ;;
esac

if [ "$dry_run" = 1 ]; then
  printf '%s\n' \
    'would install: Pi coding agent' \
    "would install: pi-package-goal ($PI_GOAL_SOURCE)" \
    'would install: tmux and tx' \
    'would install: Understand-Anything' \
    'would install: RTK' \
    'would install: OmniRoute' \
    'would install: global Codex and Claude skill copies'
  exit 0
fi

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'install: required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    printf 'install: sudo is required to install tmux with %s\n' "$1" >&2
    exit 1
  fi
}

install_tmux_package() {
  command -v tmux >/dev/null 2>&1 && return 0

  if command -v brew >/dev/null 2>&1; then
    brew install tmux
  elif command -v apt-get >/dev/null 2>&1; then
    as_root apt-get update
    as_root apt-get install -y tmux
  elif command -v dnf >/dev/null 2>&1; then
    as_root dnf install -y tmux
  elif command -v yum >/dev/null 2>&1; then
    as_root yum install -y tmux
  elif command -v pacman >/dev/null 2>&1; then
    as_root pacman -S --needed --noconfirm tmux
  elif command -v apk >/dev/null 2>&1; then
    as_root apk add tmux
  elif command -v pkg >/dev/null 2>&1; then
    pkg install -y tmux
  else
    printf 'install: tmux is missing and no supported package manager was found\n' >&2
    exit 1
  fi
}

if command -v pi >/dev/null 2>&1; then
  printf 'present: Pi coding agent (%s)\n' "$(pi --version)"
else
  require curl
  printf 'installing: Pi coding agent\n'
  curl -fsSL "$PI_INSTALL_URL" | sh
  hash -r
  require pi
fi

if pi list 2>/dev/null | grep -F "$PI_GOAL_SOURCE" >/dev/null 2>&1; then
  printf 'present: pi-package-goal\n'
else
  pi install "$PI_GOAL_SOURCE"
  printf 'installed: pi-package-goal\n'
fi

install_tmux_package
sh "$script_dir/tmux/install.sh"
printf 'installed: tmux and tx\n'

require git
understand_dir=${UA_DIR:-$HOME/.understand-anything/repo}
understand_url=${UA_REPO_URL:-https://github.com/Lum1104/Understand-Anything.git}
understand_ref=${UA_REF:-}
understand_plugin=$understand_dir/understand-anything-plugin
understand_skill=$understand_plugin/skills/understand/SKILL.md
understand_link=$HOME/.understand-anything-plugin

if [ ! -f "$understand_skill" ]; then
  if [ -e "$understand_dir" ]; then
    printf 'install: Understand target exists but is incomplete: %s\n' "$understand_dir" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$understand_dir")"
  git clone --depth 1 "$understand_url" "$understand_dir"
  if [ -n "$understand_ref" ]; then
    git -C "$understand_dir" fetch --depth 1 origin "$understand_ref"
    git -C "$understand_dir" checkout --detach FETCH_HEAD
  fi
fi

if [ -L "$understand_link" ] && [ ! -e "$understand_link" ]; then
  rm "$understand_link"
fi
if [ ! -e "$understand_link" ] && [ ! -L "$understand_link" ]; then
  ln -s "$understand_plugin" "$understand_link"
fi
printf 'installed: Understand-Anything (%s)\n' "$understand_dir"

if command -v rtk >/dev/null 2>&1; then
  printf 'present: RTK (%s)\n' "$(rtk --version)"
else
  require curl
  curl -fsSL "$RTK_INSTALL_URL" | sh
  hash -r
  require rtk
fi
printf 'installed: RTK\n'

sh "$script_dir/install-agent-skills.sh"
printf 'installed: global Codex and Claude skill copies\n'

if [ "$PI_GOAL_SKIP_OMNIROUTE" = "1" ]; then
  printf 'skipped: OmniRoute\n'
else
  sh "$script_dir/install-omniroute-pi.sh"
  printf 'installed: OmniRoute\n'
fi

printf '\ninstallation complete\n'
printf 'next: ensure %s is on PATH, then run pi and /login\n' "$HOME/.local/bin"
printf 'next: run tx init, then restart or /reload any open Pi session\n'
