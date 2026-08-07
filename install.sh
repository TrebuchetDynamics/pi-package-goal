#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)

: "${HOME:?HOME is required}"
PATH="$HOME/.local/bin:$HOME/.local/share/pi-node/current/bin:$PATH"
export PATH

PI_TOOLSET_SOURCE=${PI_TOOLSET_SOURCE:-git:github.com/TrebuchetDynamics/pi-toolset}
PI_INSTALL_URL=${PI_INSTALL_URL:-https://pi.dev/install.sh}
RTK_INSTALL_URL=${RTK_INSTALL_URL:-https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh}
PI_TOOLSET_SKIP_OMNIROUTE=${PI_TOOLSET_SKIP_OMNIROUTE:-0}
dry_run=0

# Component selection. ids: pi package tmux understand rtk skills omniroute
want_pi=1
want_package=1
want_tmux=1
want_understand=1
want_rtk=1
want_skills=1
want_omniroute=1

usage() {
  cat <<'EOF'
Usage: sh install.sh [--dry-run]

Install the pi-toolset setup. When run in a terminal you can deselect any
component; non-interactive runs install everything unless PI_TOOLSET_SKIP is set.

Components:
  Pi coding agent, pi-toolset package, tmux and tx, Search Hub research
  extension, Understand-Anything, RTK, global Codex and Claude skill copies,
  OmniRoute daemon and Pi configuration

Options:
  --dry-run  Print the installation plan without changing the system
  -h, --help Show this help

Environment:
  PI_TOOLSET_SKIP="rtk,omniroute"  Comma-separated component ids to skip:
                                   pi, package, tmux, understand, rtk, skills, omniroute
  PI_TOOLSET_SKIP_OMNIROUTE=1         Skip OmniRoute installation and configuration
  RTK_VERSION=vX.Y.Z              Pin the RTK version used by its official installer
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

case "$PI_TOOLSET_SKIP_OMNIROUTE" in
  0|1) ;;
  *) printf 'install: PI_TOOLSET_SKIP_OMNIROUTE must be 0 or 1\n' >&2; exit 2 ;;
esac
if [ "$PI_TOOLSET_SKIP_OMNIROUTE" = "1" ]; then
  want_omniroute=0
fi

if [ -n "${PI_TOOLSET_SKIP:-}" ]; then
  for id in $(printf '%s\n' "$PI_TOOLSET_SKIP" | tr ',' ' '); do
    case "$id" in
      pi|package|tmux|understand|rtk|skills|omniroute) eval "want_$id=0" ;;
      *)
        printf 'install: unknown component in PI_TOOLSET_SKIP: %s\n' "$id" >&2
        printf 'install: valid ids: pi, package, tmux, understand, rtk, skills, omniroute\n' >&2
        exit 2
        ;;
    esac
  done
fi

# Minimal checkbox TUI in POSIX sh: no dialog/whiptail dependency.
# Up/down to move, space to toggle, enter to confirm, q to quit.
row_id() {
  case "$1" in
    0) printf pi ;;
    1) printf package ;;
    2) printf tmux ;;
    3) printf understand ;;
    4) printf rtk ;;
    5) printf skills ;;
    6) printf omniroute ;;
  esac
}

tui_select() {
  stty_saved=$(stty -g 2>/dev/null || true)
  restore() {
    stty "$stty_saved" 2>/dev/null || true
    printf '\033[?25h\033[0m'
  }
  trap 'restore; exit 1' EXIT HUP INT TERM
  stty -echo -icanon
  printf '\033[?25l'

  draw() {
    printf '\033[2J\033[H'
    printf 'pi-toolset installer - select components to install\n'
    printf 'arrows: move   space: toggle   enter: install   q: quit\n\n'
    i=0
    while IFS=: read -r id label; do
      eval "on=\${want_$id}"
      if [ "$on" = 1 ]; then mark='[x]'; else mark='[ ]'; fi
      if [ "$i" = "$selected" ]; then
        printf '\033[7m%s %s\033[0m\n' "$mark" "$label"
      else
        printf '%s %s\n' "$mark" "$label"
      fi
      i=$((i + 1))
    done <<EOF
pi:Pi coding agent
package:pi-toolset package
tmux:tmux and tx
understand:Understand-Anything
rtk:RTK
skills:Global Codex and Claude skills
omniroute:OmniRoute
EOF
  }

  esc=$(printf '\033')
  selected=0
  while :; do
    draw
    k=$(dd bs=1 count=1 2>/dev/null)
    case "$k" in
      "$esc")
        seq2=$(dd bs=1 count=2 2>/dev/null)
        case "$seq2" in
          '[A') selected=$((selected > 0 ? selected - 1 : 0)) ;;
          '[B') selected=$((selected < 6 ? selected + 1 : 6)) ;;
        esac
        ;;
      '')
        break
        ;;
      ' ')
        id=$(row_id "$selected")
        eval "on=\${want_$id}"
        if [ "$on" = 1 ]; then eval "want_$id=0"; else eval "want_$id=1"; fi
        ;;
      q|Q)
        restore
        trap - EXIT HUP INT TERM
        exit 1
        ;;
    esac
  done
  restore
  trap - EXIT HUP INT TERM
  printf '\033[2J\033[H'
}

print_plan() {
  if [ "$want_pi" = 1 ]; then printf '%s\n' 'would install: Pi coding agent'; fi
  if [ "$want_package" = 1 ]; then printf '%s\n' "would install: pi-toolset ($PI_TOOLSET_SOURCE)"; fi
  if [ "$want_tmux" = 1 ]; then printf '%s\n' 'would install: tmux and tx'; fi
  if [ "$want_understand" = 1 ]; then printf '%s\n' 'would install: Understand-Anything'; fi
  if [ "$want_rtk" = 1 ]; then printf '%s\n' 'would install: RTK'; fi
  if [ "$want_skills" = 1 ]; then printf '%s\n' 'would install: global Codex and Claude skill copies'; fi
  if [ "$want_omniroute" = 1 ]; then
    printf '%s\n' 'would install: OmniRoute'
  else
    printf '%s\n' 'would skip: OmniRoute'
  fi
  if [ "$want_skills" = 1 ] && [ "$want_package" = 1 ]; then
    printf '%s\n' 'would configure: Pi to use global skills without duplicate package skills'
  fi
}

if [ "$dry_run" = 1 ]; then
  print_plan
  exit 0
fi

if [ -t 0 ]; then
  tui_select
fi

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'install: required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

# Install Node.js 22 into ~/.local/share/pi-node/current when the system node
# is missing or too old (the settings step and OmniRoute need 22.22.2+).
# Same location Pi's own installer uses, already on PATH.
ensure_node() {
  if command -v node >/dev/null 2>&1 && node -e '
const [major, minor, patch] = process.versions.node.split(".").map(Number);
const supported = (major === 22 && (minor > 22 || (minor === 22 && patch >= 2))) || (major >= 24 && major < 27);
process.exit(supported ? 0 : 1);
'; then
    return 0
  fi
  [ "$(uname -s)" = "Linux" ] || {
    printf 'install: Node.js 22 is required; install it manually on this system\n' >&2
    exit 1
  }
  node_ver=22.22.2
  node_dir=$HOME/.local/share/pi-node
  node_arch=$(uname -m)
  case "$node_arch" in
    x86_64|amd64) node_arch=x64 ;;
    aarch64|arm64) node_arch=arm64 ;;
    armv7l) node_arch=armv7l ;;
    *)
      printf 'install: unsupported architecture for Node bootstrap: %s\n' "$node_arch" >&2
      exit 1
      ;;
  esac
  printf 'installing: Node.js %s into %s\n' "$node_ver" "$node_dir"
  require curl
  mkdir -p "$node_dir"
  download=$(mktemp "${TMPDIR:-/tmp}/pi-toolset-node.XXXXXX")
  trap 'rm -f "$download"' EXIT
  trap 'rm -f "$download"; exit 1' HUP INT TERM
  if ! curl -fsSL "https://nodejs.org/dist/v${node_ver}/node-v${node_ver}-linux-${node_arch}.tar.gz" -o "$download"; then
    printf 'install: failed to download Node.js\n' >&2
    exit 1
  fi
  rm -rf "$node_dir/current"
  tar -xzf "$download" -C "$node_dir"
  mv "$node_dir/node-v${node_ver}-linux-${node_arch}" "$node_dir/current"
  rm -f "$download"
  trap - EXIT HUP INT TERM
  hash -r
  if ! node --version >/dev/null 2>&1; then
    printf 'install: Node.js bootstrap failed\n' >&2
    exit 1
  fi
  printf 'installed: Node.js (%s)\n' "$(node --version)"
}

run_remote_installer() {
  url=$1
  label=$2
  require curl
  download=$(mktemp "${TMPDIR:-/tmp}/pi-toolset-install.XXXXXX")
  trap 'rm -f "$download"' EXIT
  trap 'rm -f "$download"; exit 1' HUP INT TERM
  if ! curl -fsSL "$url" -o "$download"; then
    printf 'install: failed to download %s installer\n' "$label" >&2
    exit 1
  fi
  sh "$download"
  rm -f "$download"
  trap - EXIT HUP INT TERM
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

if [ "$want_pi" = 1 ]; then
  if command -v pi >/dev/null 2>&1; then
    printf 'present: Pi coding agent (%s)\n' "$(pi --version)"
  else
    printf 'installing: Pi coding agent\n'
    ensure_node
    run_remote_installer "$PI_INSTALL_URL" Pi
    hash -r
    require pi
  fi
fi

if [ "$want_package" = 1 ]; then
  if ! pi_packages=$(pi list); then
    printf 'install: failed to list Pi packages\n' >&2
    exit 1
  fi
  if printf '%s\n' "$pi_packages" | awk -v source="$PI_TOOLSET_SOURCE" '
    { line = $0; sub(/^[[:space:]]+/, "", line) }
    line == source || index(line, source " ") == 1 { found = 1 }
    END { exit found ? 0 : 1 }
  '; then
    printf 'present: pi-toolset\n'
  else
    pi install "$PI_TOOLSET_SOURCE"
    printf 'installed: pi-toolset\n'
  fi
fi

if [ "$want_tmux" = 1 ]; then
  install_tmux_package
  sh "$script_dir/tmux/install.sh"
  printf 'installed: tmux and tx\n'
fi

if [ "$want_understand" = 1 ]; then
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

  if [ -L "$understand_link" ]; then
    if [ "$(readlink "$understand_link")" != "$understand_plugin" ]; then
      rm "$understand_link"
    fi
  elif [ -e "$understand_link" ]; then
    printf 'install: Understand link path exists and is not a symlink: %s\n' "$understand_link" >&2
    exit 1
  fi
  if [ ! -L "$understand_link" ]; then
    ln -s "$understand_plugin" "$understand_link"
  fi
  printf 'installed: Understand-Anything (%s)\n' "$understand_dir"
fi

if [ "$want_rtk" = 1 ]; then
  if command -v rtk >/dev/null 2>&1; then
    printf 'present: RTK (%s)\n' "$(rtk --version)"
  else
    run_remote_installer "$RTK_INSTALL_URL" RTK
    hash -r
    require rtk
  fi
  printf 'installed: RTK\n'
fi

if [ "$want_skills" = 1 ]; then
  sh "$script_dir/install-agent-skills.sh"
  printf 'installed: global Codex and Claude skill copies\n'
fi

if [ "$want_skills" = 1 ] && [ "$want_package" = 1 ] && [ "${AGENT_SKILLS_DRY_RUN:-0}" = "0" ]; then
  ensure_node
  pi_settings="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"
  PI_SETTINGS_FILE="$pi_settings" PI_TOOLSET_SOURCE="$PI_TOOLSET_SOURCE" node <<'NODE'
import fs from "node:fs";

const file = process.env.PI_SETTINGS_FILE;
const source = process.env.PI_TOOLSET_SOURCE;
const before = fs.readFileSync(file, "utf8");
const settings = JSON.parse(before);
let found = false;
settings.packages = (settings.packages ?? []).map((entry) => {
  const entrySource = typeof entry === "string" ? entry : entry?.source;
  if (entrySource !== source) return entry;
  found = true;
  return typeof entry === "string" ? { source: entry, skills: [] } : { ...entry, skills: [] };
});
if (!found) throw new Error(`Pi package setting not found: ${source}`);
const after = `${JSON.stringify(settings, null, 2)}\n`;
if (after !== before) {
  const backup = `${file}.bak.${Date.now()}`;
  fs.copyFileSync(file, backup);
  fs.chmodSync(backup, 0o600);
  const temporary = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, after, { mode: 0o600 });
  fs.renameSync(temporary, file);
}
fs.chmodSync(file, 0o600);
NODE
  printf 'configured: disabled duplicate package skills; using global Codex skill copies\n'
fi

if [ "$want_omniroute" = 1 ]; then
  ensure_node
  sh "$script_dir/install-omniroute-pi.sh"
  printf 'installed: OmniRoute\n'
else
  printf 'skipped: OmniRoute\n'
fi

printf '\ninstallation complete\n'
printf 'next: ensure %s is on PATH, then run pi and /login\n' "$HOME/.local/bin"
printf 'next: run tx init, then restart or /reload any open Pi session\n'
