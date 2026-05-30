#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: auto-folder-refactor.sh <loops> [scan-root]

Fully automatic loop:
  1. run candidates-folder-refactor scanner
  2. pick current top #1 candidate
  3. run /folder-refactor <top-candidate> through pi print mode
  4. repeat N times

Options via env:
  PI_AUTO_FOLDER_REFACTOR_PI       pi binary (default: pi)
  PI_AUTO_FOLDER_REFACTOR_PI_ARGS  extra pi args, shell-split simply on spaces
  PI_AUTO_FOLDER_REFACTOR_NO_LOCAL_RESOURCES=1  do not add this package's extension/skills paths

Examples:
  auto-folder-refactor.sh 3
  auto-folder-refactor.sh 5 go-bot/internal
  PI_AUTO_FOLDER_REFACTOR_PI_ARGS='--model sonnet:high' auto-folder-refactor.sh 2
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

loops="${1:-}"
scan_root="${2:-.}"
run_root="$(pwd -P)"
if [[ -z "${loops}" || ! "${loops}" =~ ^[1-9][0-9]*$ ]]; then
  usage >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
package_root="$(cd -- "${script_dir}/../../.." && pwd)"
scanner="${script_dir}/find-candidates.mjs"
extension="${package_root}/extensions/folder-refactor.js"
skills_dir="${package_root}/skills"
pi_bin="${PI_AUTO_FOLDER_REFACTOR_PI:-pi}"

if [[ ! -f "${scanner}" ]]; then
  echo "auto-folder-refactor: scanner not found: ${scanner}" >&2
  exit 1
fi

resolved_scan_root="$(node -e 'const fs=require("node:fs"); const path=require("node:path"); const target=path.resolve(process.argv[1] || "."); console.log(fs.realpathSync.native(target));' "${scan_root}")"
case "${resolved_scan_root}" in
  "${run_root}"|"${run_root}"/*) ;;
  *)
    echo "auto-folder-refactor: scan-root must be pwd or a subfolder of pwd" >&2
    echo "  pwd:       ${run_root}" >&2
    echo "  scan-root: ${resolved_scan_root}" >&2
    exit 2
    ;;
esac

extra_pi_args=()
if [[ -n "${PI_AUTO_FOLDER_REFACTOR_PI_ARGS:-}" ]]; then
  # Intentional simple space splitting for CLI flags like: --model sonnet:high
  read -r -a extra_pi_args <<< "${PI_AUTO_FOLDER_REFACTOR_PI_ARGS}"
fi

resource_args=(--session-dir "${run_root}/.pi/auto-folder-refactor-sessions")
resource_args+=(--append-system-prompt "AUTO_FOLDER_REFACTOR_SCOPE: You may inspect, edit, move, and validate only files under ${run_root}. Do not operate on parent directories or sibling trees. If a needed action escapes this scope, stop blocked.")
if [[ "${PI_AUTO_FOLDER_REFACTOR_NO_LOCAL_RESOURCES:-}" != "1" ]]; then
  resource_args+=(--extension "${extension}" --skill "${skills_dir}")
fi

latest_log_for_root() {
  node -e 'const path=require("node:path"); console.log(path.join(process.argv[1], ".pi", "candidates-folder-refactor", "latest.json"));' "${resolved_scan_root}"
}

candidate_from_log() {
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const file = process.argv[1];
    const runRoot = path.resolve(process.argv[2]);
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const candidate = report.candidates && report.candidates[0] && report.candidates[0].relative;
    if (!candidate) process.exit(3);
    const absolute = path.resolve(runRoot, candidate);
    const real = fs.realpathSync.native(absolute);
    const rel = path.relative(runRoot, real);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      console.error(`candidate escapes pwd: ${candidate}`);
      process.exit(4);
    }
    process.stdout.write(rel || ".");
  ' "$1" "${run_root}"
}

snapshot_scope() {
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const crypto = require("node:crypto");
    const root = fs.realpathSync.native(process.argv[1]);
    const skip = new Set([".git", ".pi", "node_modules", "dist", "build", "coverage"]);
    const hash = crypto.createHash("sha256");
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.isDirectory() && skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full);
        if (entry.isDirectory()) {
          hash.update(`d\0${rel}\0`);
          walk(full);
        } else if (entry.isFile()) {
          const stat = fs.statSync(full);
          hash.update(`f\0${rel}\0${stat.size}\0${Math.trunc(stat.mtimeMs)}\0`);
        }
      }
    }
    walk(root);
    process.stdout.write(hash.digest("hex"));
  ' "${run_root}"
}

for ((i = 1; i <= loops; i++)); do
  echo "=== auto-folder-refactor loop ${i}/${loops}: scanning ${scan_root} ===" >&2
  node "${scanner}" "${resolved_scan_root}" --top 1 >&2
  latest_log="$(latest_log_for_root)"
  if [[ ! -f "${latest_log}" ]]; then
    echo "auto-folder-refactor: missing scanner log: ${latest_log}" >&2
    exit 1
  fi
  if ! candidate="$(candidate_from_log "${latest_log}")"; then
    echo "auto-folder-refactor: no top candidate found in ${latest_log}" >&2
    exit 0
  fi

  echo "=== auto-folder-refactor loop ${i}/${loops}: /folder-refactor ${candidate} ===" >&2
  prompt="/folder-refactor ${candidate}

AUTO_FOLDER_REFACTOR loop ${i}/${loops}. Fully automatic mode scoped to pwd only: ${run_root}. Do not inspect, edit, move, or validate parent directories outside pwd; only operate on pwd and its subfolders. Use folder_refactor_scan, folder_refactor_state, and folder_refactor_audit. Keep taking safe validated slices. Do not stop with a safe next candidate; execute it. Stop only for failed validation, owner-risk blocker, generated/destructive risk, candidate outside pwd, or context exhaustion. If blocked, state the exact blocker and next command."

  before_snapshot="$(snapshot_scope)"
  "${pi_bin}" -p "${resource_args[@]}" "${extra_pi_args[@]}" "${prompt}"
  after_snapshot="$(snapshot_scope)"
  if [[ "${before_snapshot}" == "${after_snapshot}" ]]; then
    echo "auto-folder-refactor: no file changes under pwd after loop ${i}; stopping to avoid repeating the same candidate" >&2
    exit 0
  fi
done

echo "=== auto-folder-refactor complete: ${loops}/${loops} loops requested ===" >&2
