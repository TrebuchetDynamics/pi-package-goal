#!/usr/bin/env sh
set -eu

# Install this package's skills for Claude Code.
#
# Usage:
#   sh install-claude-skills.sh
#
# Installs flattened Claude skills to ~/.claude/skills by default. Override with:
#   CLAUDE_SKILLS_DIR=/path/to/.claude/skills sh install-claude-skills.sh
#
# Existing same-name skills are backed up unless CLAUDE_SKILLS_BACKUP=0.

script_dir="$(CDPATH= cd "$(dirname "$0")" && pwd)"
src_root="${script_dir}/skills"

: "${HOME:?HOME is required}"

CLAUDE_SKILLS_DIR="${CLAUDE_SKILLS_DIR:-${HOME}/.claude/skills}"
CLAUDE_SKILLS_BACKUP="${CLAUDE_SKILLS_BACKUP:-1}"
CLAUDE_SKILLS_DRY_RUN="${CLAUDE_SKILLS_DRY_RUN:-0}"

timestamp="$(date +%Y%m%d%H%M%S)"

if [ ! -d "$src_root" ]; then
  printf 'install-claude-skills: source not found: %s\n' "$src_root" >&2
  exit 1
fi

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

  if [ "$CLAUDE_SKILLS_DRY_RUN" = "1" ]; then
    printf 'would install: %s -> %s\n' "$src" "$dest"
    return
  fi

  mkdir -p "$(dirname "$dest")"

  if [ "$CLAUDE_SKILLS_BACKUP" != "0" ] && [ -e "$dest" ]; then
    backup="${dest}.bak.${timestamp}"
    rm -rf "$backup"
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

install_dir "${src_root}/shared" "${CLAUDE_SKILLS_DIR}/shared"

find "$src_root" -path '*/SKILL.md' -type f | sort | while IFS= read -r skill_file; do
  name="$(skill_name "$skill_file")"
  if [ -z "$name" ]; then
    printf 'install-claude-skills: missing name in %s\n' "$skill_file" >&2
    exit 1
  fi
  install_dir "$(dirname "$skill_file")" "${CLAUDE_SKILLS_DIR}/${name}"
done

printf '\nClaude skills dir: %s\n' "$CLAUDE_SKILLS_DIR"
printf 'Restart Claude Code or start a new session to load installed skills.\n'
