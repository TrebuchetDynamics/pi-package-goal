#!/usr/bin/env sh
set -eu

# Install this package's flattened skills for Codex and Claude Code.
#
# Usage:
#   sh install-agent-skills.sh
#   sh install-agent-skills.sh --codex-only
#   sh install-agent-skills.sh --claude-only
#
# Destination overrides:
#   CODEX_SKILLS_DIR=/path/to/skills
#   CLAUDE_SKILLS_DIR=/path/to/skills
#
# Existing same-name skills are backed up outside the active skill roots unless
# AGENT_SKILLS_BACKUP=0 or --no-backup is used. Set AGENT_SKILLS_DRY_RUN=1 or
# pass --dry-run to print the installation plan without writing files.

script_dir="$(CDPATH= cd "$(dirname "$0")" && pwd)"
src_root="${script_dir}/skills"

: "${HOME:?HOME is required}"

CODEX_SKILLS_DIR="${CODEX_SKILLS_DIR:-${HOME}/.agents/skills}"
CLAUDE_SKILLS_DIR="${CLAUDE_SKILLS_DIR:-${HOME}/.claude/skills}"
AGENT_SKILLS_BACKUP="${AGENT_SKILLS_BACKUP:-${CLAUDE_SKILLS_BACKUP:-1}}"
AGENT_SKILLS_DRY_RUN="${AGENT_SKILLS_DRY_RUN:-${CLAUDE_SKILLS_DRY_RUN:-0}}"

install_codex=1
install_claude=1

usage() {
  cat <<'EOF'
Usage: sh install-agent-skills.sh [options]

Install the bundled skills globally for Codex and Claude Code.

Options:
  --codex-only   Install only to CODEX_SKILLS_DIR (default: ~/.agents/skills)
  --claude-only  Install only to CLAUDE_SKILLS_DIR (default: ~/.claude/skills)
  --dry-run      Print planned changes without writing files
  --no-backup    Replace same-name skills without backing them up
  -h, --help     Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --codex-only)
      install_codex=1
      install_claude=0
      ;;
    --claude-only)
      install_codex=0
      install_claude=1
      ;;
    --dry-run)
      AGENT_SKILLS_DRY_RUN=1
      ;;
    --no-backup)
      AGENT_SKILLS_BACKUP=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'install-agent-skills: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

case "$AGENT_SKILLS_BACKUP" in
  0|1) ;;
  *)
    printf 'install-agent-skills: AGENT_SKILLS_BACKUP must be 0 or 1\n' >&2
    exit 2
    ;;
esac

case "$AGENT_SKILLS_DRY_RUN" in
  0|1) ;;
  *)
    printf 'install-agent-skills: AGENT_SKILLS_DRY_RUN must be 0 or 1\n' >&2
    exit 2
    ;;
esac

if [ ! -d "$src_root" ]; then
  printf 'install-agent-skills: source not found: %s\n' "$src_root" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d%H%M%S).$$"
state_root="${XDG_STATE_HOME:-${HOME}/.local/state}"
AGENT_SKILLS_BACKUP_DIR="${AGENT_SKILLS_BACKUP_DIR:-${state_root}/pi-package-goal/skill-backups/${timestamp}}"

skill_name() {
  awk '
    /^---$/ { fence += 1; next }
    fence == 1 && /^name:[[:space:]]*/ {
      sub(/^name:[[:space:]]*/, "")
      gsub(/^["'"'"']|["'"'"']$/, "")
      print
      exit
    }
  ' "$1"
}

install_dir() {
  src="$1"
  dest="$2"
  backup_root="$3"

  if [ "$AGENT_SKILLS_DRY_RUN" = "1" ]; then
    printf 'would install: %s -> %s\n' "$src" "$dest"
    return
  fi

  mkdir -p "$(dirname "$dest")"

  if [ "$AGENT_SKILLS_BACKUP" = "1" ] && [ -e "$dest" ]; then
    backup="${backup_root}/$(basename "$dest")"
    mkdir -p "$backup_root"
    if [ -e "$backup" ]; then
      printf 'install-agent-skills: backup already exists: %s\n' "$backup" >&2
      exit 1
    fi
    cp -R "$dest" "$backup"
    printf 'backup: %s -> %s\n' "$dest" "$backup"
  fi

  tmp_dest="${dest}.tmp.$$"
  rm -rf "$tmp_dest"
  mkdir -p "$tmp_dest"
  cp -R "$src"/. "$tmp_dest"/

  find "$tmp_dest" -type d \( -name .pi -o -name .understand-anything -o -name node_modules -o -name .git \) -prune -exec rm -rf {} + 2>/dev/null || true
  find "$tmp_dest" -type f -name '*.md' -exec sh -c '
    for file do
      tmp="${file}.tmp.$$"
      sed \
        -e "s#\.\./\.\./\.\./shared/#../../shared/#g" \
        -e "s#\.\./\.\./shared/#../shared/#g" \
        -e "s#\.\./\.\./\.\./\([^/][^/]*\)/\([^/][^/]*\)/#../../\2/#g" \
        -e "s#\.\./\.\./\([^/][^/]*\)/\([^/][^/]*\)/#../\2/#g" \
        "$file" > "$tmp"
      mv "$tmp" "$file"
    done
  ' sh {} +

  rm -rf "$dest"
  mv "$tmp_dest" "$dest"
  printf 'installed: %s\n' "$dest"
}

install_target() {
  label="$1"
  dest_root="$2"
  backup_root="${AGENT_SKILLS_BACKUP_DIR}/${label}"

  install_dir "${src_root}/shared" "${dest_root}/shared" "$backup_root"

  find "$src_root" -path '*/SKILL.md' -type f | sort | while IFS= read -r skill_file; do
    name="$(skill_name "$skill_file")"
    if [ -z "$name" ]; then
      printf 'install-agent-skills: missing name in %s\n' "$skill_file" >&2
      exit 1
    fi
    install_dir "$(dirname "$skill_file")" "${dest_root}/${name}" "$backup_root"
  done

  printf '\n%s skills dir: %s\n' "$label" "$dest_root"
}

if [ "$install_codex" = "1" ]; then
  install_target Codex "$CODEX_SKILLS_DIR"
fi

if [ "$install_claude" = "1" ]; then
  install_target Claude "$CLAUDE_SKILLS_DIR"
fi

if [ "$AGENT_SKILLS_DRY_RUN" = "0" ]; then
  if [ "$install_codex" = "1" ] && [ "$install_claude" = "1" ]; then
    printf 'Restart open Codex and Claude Code sessions to refresh skill discovery.\n'
  elif [ "$install_codex" = "1" ]; then
    printf 'Restart open Codex sessions to refresh skill discovery.\n'
  else
    printf 'Restart open Claude Code sessions to refresh skill discovery.\n'
  fi
fi
