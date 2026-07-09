#!/usr/bin/env sh
set -eu

# Backward-compatible Claude-only entry point.

script_dir="$(CDPATH= cd "$(dirname "$0")" && pwd)"
exec sh "${script_dir}/install-agent-skills.sh" --claude-only "$@"
