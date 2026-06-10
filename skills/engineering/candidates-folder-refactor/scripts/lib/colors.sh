#!/usr/bin/env bash
# Colors and formatting helpers for autofolderrefactor

if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
  bold="$(tput bold 2>/dev/null || true)"
  dim="$(tput dim 2>/dev/null || true)"
  red="$(tput setaf 1 2>/dev/null || true)"
  green="$(tput setaf 2 2>/dev/null || true)"
  yellow="$(tput setaf 3 2>/dev/null || true)"
  blue="$(tput setaf 4 2>/dev/null || true)"
  magenta="$(tput setaf 5 2>/dev/null || true)"
  cyan="$(tput setaf 6 2>/dev/null || true)"
  reset="$(tput sgr0 2>/dev/null || true)"
else
  bold="" dim="" red="" green="" yellow="" blue="" magenta="" cyan="" reset=""
fi

info()    { printf '%s◆%s %s\n' "${cyan}"   "${reset}" "$*" >&2; }
success() { printf '%s✓%s %s\n' "${green}"  "${reset}" "$*" >&2; }
warn()    { printf '%s⚠%s %s\n' "${yellow}" "${reset}" "$*" >&2; }
error()   { printf '%s✗%s %s\n' "${red}"    "${reset}" "$*" >&2; }
section() { printf '\n%s╭─ %s%s%s\n%s╰%s%s\n' "${magenta}" "${bold}" "$*" "${reset}" "${magenta}" "${reset}" "${dim}────────────────────────────────────────────────────────${reset}" >&2; }
kv()      { printf '  %s%-12s%s %s\n' "${dim}" "$1:" "${reset}" "$2" >&2; }
badge()   { printf '%s[%s]%s' "$1" "$2" "${reset}"; }
