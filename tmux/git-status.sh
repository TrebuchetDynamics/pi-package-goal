#!/usr/bin/env sh
# Print a compact tmux status segment for the git repo containing $1.
# Green = clean/all committed; red = changed/untracked; no output outside git.

path=${1:-.}

git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

branch=$(git -C "$path" branch --show-current 2>/dev/null)
[ -n "$branch" ] || branch=$(git -C "$path" rev-parse --short HEAD 2>/dev/null)
[ -n "$branch" ] || exit 0

if [ -z "$(git -C "$path" status --porcelain --untracked-files=normal --ignore-submodules=dirty 2>/dev/null)" ]; then
  printf '#[bg=#0f3d2e,fg=#06d6a0,bold] %s ' "$branch"
else
  printf '#[bg=#3a1018,fg=#ef476f,bold] %s ' "$branch"
fi
