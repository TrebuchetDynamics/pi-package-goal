#!/usr/bin/env bash
set -euo pipefail

EXECUTE=0
TMP_ONLY=0
DELETE_STATE=0
CONFIRM_DELETE_STATE=0
if [ -n "${HOME:-}" ]; then
  CODEX_DIR="$HOME/.codex"
else
  CODEX_DIR=""
fi

usage() {
  cat <<'USAGE'
Usage: codex-storage-cleanup.sh [--execute] [--tmp-only] [--delete-state --i-understand-local-state-will-be-lost] [--codex-dir PATH]

Safely prepares local Codex storage for repair after errors such as:
- No space left on device
- database or disk is full
- damaged ~/.codex/state_*.sqlite

Default mode is a dry run. With --execute, the script removes only transient
~/.codex/tmp and moves state_*.sqlite* files into ~/.codex/backup/<timestamp>/.
Use --tmp-only to remove temp files and leave state_*.sqlite* untouched. Use
--delete-state only as a last resort; it also requires
--i-understand-local-state-will-be-lost. A custom --codex-dir path must end in
/.codex. The script never deletes the whole ~/.codex directory.
USAGE
}

print_disk_report() {
  echo "Disk space containing Codex directory:"
  df -h "$CODEX_DIR" 2>/dev/null || true
  echo "Inode usage containing Codex directory:"
  df -ih "$CODEX_DIR" 2>/dev/null || true

  local codex_children=()
  shopt -s nullglob
  codex_children=("$CODEX_DIR"/*)
  shopt -u nullglob

  if [ "${#codex_children[@]}" -gt 0 ]; then
    echo "Codex path sizes:"
    du -sh "${codex_children[@]}" 2>/dev/null | sort -h || true
  else
    echo "Codex path sizes: no entries found."
  fi

  if [ -n "${HOME:-}" ] && [ -d "$HOME" ]; then
    case "$CODEX_DIR" in
      "$HOME"/.codex|"$HOME"/.codex/*)
        echo "Top-level HOME path sizes:"
        du -x -h -d 1 "$HOME" 2>/dev/null | sort -h | tail -20 || true
        ;;
    esac
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --execute)
      EXECUTE=1
      ;;
    --tmp-only)
      TMP_ONLY=1
      ;;
    --delete-state)
      DELETE_STATE=1
      ;;
    --i-understand-local-state-will-be-lost)
      CONFIRM_DELETE_STATE=1
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

while [ "$CODEX_DIR" != "/" ] && [ "${CODEX_DIR%/}" != "$CODEX_DIR" ]; do
  CODEX_DIR="${CODEX_DIR%/}"
done

if [ "$CODEX_DIR" = "/" ]; then
  echo "Refusing unsafe Codex directory: $CODEX_DIR" >&2
  exit 2
fi

case "$CODEX_DIR" in
  .codex|*/.codex)
    ;;
  *)
    echo "Refusing unsafe Codex directory: $CODEX_DIR (path must end in /.codex)" >&2
    exit 2
    ;;
esac

if [ ! -d "$CODEX_DIR" ]; then
  echo "Codex directory not found: $CODEX_DIR"
  exit 0
fi

if [ "$TMP_ONLY" -eq 1 ] && [ "$DELETE_STATE" -eq 1 ]; then
  echo "--tmp-only cannot be combined with --delete-state" >&2
  exit 2
fi

if [ "$EXECUTE" -eq 1 ] && [ "$DELETE_STATE" -eq 1 ] && [ "$CONFIRM_DELETE_STATE" -ne 1 ]; then
  echo "--delete-state requires --i-understand-local-state-will-be-lost" >&2
  exit 2
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PARENT="$CODEX_DIR/backup"
BACKUP_TEMPLATE="$BACKUP_PARENT/codex-state-$TIMESTAMP.XXXXXX"

shopt -s nullglob
STATE_FILES=("$CODEX_DIR"/state_*.sqlite*)
shopt -u nullglob

if [ "$EXECUTE" -ne 1 ]; then
  echo "Dry run: no files changed."
  print_disk_report
  if [ -d "$CODEX_DIR/tmp" ]; then
    echo "Would remove transient temp directory: $CODEX_DIR/tmp"
  else
    echo "No transient temp directory found: $CODEX_DIR/tmp"
  fi
  if [ "${#STATE_FILES[@]}" -gt 0 ]; then
    if [ "$TMP_ONLY" -eq 1 ]; then
      echo "Would leave Codex state files unchanged because --tmp-only is set:"
    elif [ "$DELETE_STATE" -eq 1 ]; then
      echo "Would delete Codex state files:"
      echo "Executing --delete-state requires --i-understand-local-state-will-be-lost."
    else
      echo "Would back up Codex state files to a unique timestamped backup directory matching: $BACKUP_TEMPLATE"
    fi
    printf '  %s\n' "${STATE_FILES[@]}"
  else
    echo "No Codex state_*.sqlite files found to back up or delete."
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
  if [ "$TMP_ONLY" -eq 1 ]; then
    echo "Left Codex state files unchanged because --tmp-only is set:"
    printf '  %s\n' "${STATE_FILES[@]}"
  elif [ "$DELETE_STATE" -eq 1 ]; then
    rm -f -- "${STATE_FILES[@]}"
    echo "Deleted Codex state files from: $CODEX_DIR"
  else
    mkdir -p "$BACKUP_PARENT"
    BACKUP_DIR="$(mktemp -d "$BACKUP_TEMPLATE")"
    mv "${STATE_FILES[@]}" "$BACKUP_DIR"/
    echo "Backed up Codex state files to: $BACKUP_DIR"
  fi
else
  echo "No Codex state_*.sqlite files found to back up or delete."
fi

echo "Post-cleanup disk report:"
print_disk_report

echo "Retry Codex. If it offers safe repair, accept it after free space is available."
