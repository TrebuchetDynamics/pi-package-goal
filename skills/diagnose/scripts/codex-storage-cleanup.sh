#!/usr/bin/env bash
set -euo pipefail

EXECUTE=0
if [ -n "${HOME:-}" ]; then
  CODEX_DIR="$HOME/.codex"
else
  CODEX_DIR=""
fi

usage() {
  cat <<'USAGE'
Usage: codex-storage-cleanup.sh [--execute] [--codex-dir PATH]

Safely prepares local Codex storage for repair after errors such as:
- No space left on device
- database or disk is full
- damaged ~/.codex/state_*.sqlite

Default mode is a dry run. With --execute, the script removes only transient
~/.codex/tmp and moves state_*.sqlite* files into ~/.codex/backup/<timestamp>/.
It never deletes the whole ~/.codex directory.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --execute)
      EXECUTE=1
      ;;
    --codex-dir)
      shift
      if [ "$#" -eq 0 ]; then
        echo "--codex-dir requires a path" >&2
        exit 2
      fi
      CODEX_DIR="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ -z "$CODEX_DIR" ]; then
  echo "HOME is not set; pass --codex-dir PATH explicitly" >&2
  exit 2
fi

if [ "$CODEX_DIR" = "/" ]; then
  echo "Refusing unsafe Codex directory: $CODEX_DIR" >&2
  exit 2
fi

if [ ! -d "$CODEX_DIR" ]; then
  echo "Codex directory not found: $CODEX_DIR"
  exit 0
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$CODEX_DIR/backup/codex-state-$TIMESTAMP"

shopt -s nullglob
STATE_FILES=("$CODEX_DIR"/state_*.sqlite*)
shopt -u nullglob

if [ "$EXECUTE" -ne 1 ]; then
  echo "Dry run: no files changed."
  echo "Would remove transient temp directory: $CODEX_DIR/tmp"
  if [ "${#STATE_FILES[@]}" -gt 0 ]; then
    echo "Would back up Codex state files to: $BACKUP_DIR"
    printf '  %s\n' "${STATE_FILES[@]}"
  else
    echo "No Codex state_*.sqlite files found to back up."
  fi
  echo "Run again with --execute after confirming enough free disk space."
  exit 0
fi

if [ -d "$CODEX_DIR/tmp" ]; then
  rm -rf "$CODEX_DIR/tmp"
  echo "Removed transient temp directory: $CODEX_DIR/tmp"
else
  echo "No transient temp directory found: $CODEX_DIR/tmp"
fi

if [ "${#STATE_FILES[@]}" -gt 0 ]; then
  mkdir -p "$BACKUP_DIR"
  mv "${STATE_FILES[@]}" "$BACKUP_DIR"/
  echo "Backed up Codex state files to: $BACKUP_DIR"
else
  echo "No Codex state_*.sqlite files found to back up."
fi

echo "Retry Codex. If it offers safe repair, accept it after free space is available."
