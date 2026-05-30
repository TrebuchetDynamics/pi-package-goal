#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  auto-folder-refactor.sh <loops> [scan-root]
  auto-folder-refactor.sh ignore [scan-root]

Fully automatic loop:
  1. run candidates-folder-refactor scanner
  2. pick current top #1 candidate
  3. run the folder-refactor prompt for <top-candidate> through pi print mode
  4. commit current pwd changes, run relevant validation, commit loop changes, repeat N times

Options via env:
  PI_AUTO_FOLDER_REFACTOR_PI       pi binary (default: pi)
  PI_AUTO_FOLDER_REFACTOR_PI_ARGS  extra pi args, shell-split simply on spaces
  PI_AUTO_FOLDER_REFACTOR_WITH_LOCAL_RESOURCES=1  explicitly add this checkout's extension/skills paths
  PI_AUTO_FOLDER_REFACTOR_HEARTBEAT_SECONDS  progress heartbeat while pi is quiet (default: 30)
  PI_AUTO_FOLDER_REFACTOR_TIMEOUT_SECONDS    kill a single pi run after N seconds (default: 0/off)
  PI_AUTO_FOLDER_REFACTOR_SCAN_TOP           candidates to keep per scan (default: 25)
  PI_AUTO_FOLDER_REFACTOR_NO_COMMIT=1        validate but do not commit after changed loops
  PI_AUTO_FOLDER_REFACTOR_NO_PRECOMMIT=1     do not auto-commit pre-existing pwd changes before loops

Examples:
  auto-folder-refactor.sh ignore
  auto-folder-refactor.sh 3
  auto-folder-refactor.sh 5 go-bot/internal
  PI_AUTO_FOLDER_REFACTOR_PI_ARGS='--model sonnet:high' auto-folder-refactor.sh 2
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

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

info() { printf '%s◆%s %s\n' "${cyan}" "${reset}" "$*" >&2; }
success() { printf '%s✓%s %s\n' "${green}" "${reset}" "$*" >&2; }
warn() { printf '%s⚠%s %s\n' "${yellow}" "${reset}" "$*" >&2; }
error() { printf '%s✗%s %s\n' "${red}" "${reset}" "$*" >&2; }
section() { printf '\n%s╭─ %s%s%s\n%s╰%s%s\n' "${magenta}" "${bold}" "$*" "${reset}" "${magenta}" "${reset}" "${dim}────────────────────────────────────────────────────────${reset}" >&2; }
kv() { printf '  %s%-12s%s %s\n' "${dim}" "$1:" "${reset}" "$2" >&2; }
badge() { printf '%s[%s]%s' "$1" "$2" "${reset}"; }

mode="run"
loops="${1:-}"
scan_root="${2:-.}"
run_root="$(pwd -P)"
if [[ "${loops}" == "ignore" ]]; then
  mode="ignore"
  scan_root="${2:-.}"
elif [[ -z "${loops}" || ! "${loops}" =~ ^[1-9][0-9]*$ ]]; then
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
    error "scan-root must be pwd or a subfolder of pwd"
    kv "pwd" "${run_root}"
    kv "scan-root" "${resolved_scan_root}"
    exit 2
    ;;
esac

extra_pi_args=()
if [[ -n "${PI_AUTO_FOLDER_REFACTOR_PI_ARGS:-}" ]]; then
  # Intentional simple space splitting for CLI flags like: --model sonnet:high
  read -r -a extra_pi_args <<< "${PI_AUTO_FOLDER_REFACTOR_PI_ARGS}"
fi

scope_args=(--session-dir "${run_root}/.pi/auto-folder-refactor-sessions")
scope_args+=(--append-system-prompt "AUTO_FOLDER_REFACTOR_SCOPE: You may inspect, edit, move, and validate only files under ${run_root}. Do not operate on parent directories or sibling trees. If a needed action escapes this scope, stop blocked.")
package_args=()
if [[ "${PI_AUTO_FOLDER_REFACTOR_WITH_LOCAL_RESOURCES:-}" == "1" ]]; then
  package_args+=(--extension "${extension}" --skill "${skills_dir}")
fi

latest_log_for_root() {
  node -e 'const path=require("node:path"); console.log(path.join(process.argv[1], ".pi", "candidates-folder-refactor", "latest.json"));' "${resolved_scan_root}"
}

establish_refactorignore() {
  section "establish .refactorignore"
  kv "scan" "${scan_root}"
  kv "scope" "${run_root}"
  info "scanning all folders for generated/artifact/vendor trees"
  node "${scanner}" "${resolved_scan_root}" --top 1 --suggestions all >/dev/null
  local latest_log ignore_file added
  latest_log="$(latest_log_for_root)"
  ignore_file="${run_root}/.refactorignore"
  added="$(C_BOLD="${bold}" C_DIM="${dim}" C_GREEN="${green}" C_YELLOW="${yellow}" C_CYAN="${cyan}" C_RESET="${reset}" node -e '
    const fs = require("node:fs");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const ignoreFile = process.argv[2];
    const existing = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, "utf8").split(/\r?\n/).map((line) => line.trim()) : [];
    const existingSet = new Set(existing.filter((line) => line && !line.startsWith("#")));
    const suggestions = report.refactorIgnoreSuggestions || [];
    const missing = suggestions.map((item) => item.pattern).filter((pattern) => !existingSet.has(pattern));
    if (missing.length) {
      const header = existing.length ? "\n# auto-folder-refactor smart ignores\n" : "# auto-folder-refactor smart ignores\n";
      fs.appendFileSync(ignoreFile, `${header}${missing.join("\n")}\n`);
    }
    const c = {
      bold: process.env.C_BOLD || "",
      dim: process.env.C_DIM || "",
      green: process.env.C_GREEN || "",
      yellow: process.env.C_YELLOW || "",
      cyan: process.env.C_CYAN || "",
      reset: process.env.C_RESET || "",
    };
    const counts = { added: 0, kept: 0 };
    const currentPatterns = fs.existsSync(ignoreFile)
      ? fs.readFileSync(ignoreFile, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))
      : [];
    console.log(`${c.bold}${c.cyan}.refactorignore${c.reset} ${c.dim}${ignoreFile}${c.reset}`);
    for (const item of suggestions) {
      const status = missing.includes(item.pattern) ? "added" : "kept";
      counts[status] += 1;
      const color = status === "added" ? c.green : c.dim;
      console.log(`${color}${status}${c.reset} ${String(item.confidence).padStart(2)} ${item.pattern}`);
    }
    if (!suggestions.length) console.log(`${c.dim}no new smart suggestions${c.reset}`);
    if (currentPatterns.length) {
      console.log(`${c.dim}current (${currentPatterns.length}):${c.reset}`);
      for (const pattern of currentPatterns.slice(0, 40)) console.log(`${c.dim}- ${pattern}${c.reset}`);
      if (currentPatterns.length > 40) console.log(`${c.dim}… ${currentPatterns.length - 40} more${c.reset}`);
    } else {
      console.log(`${c.dim}current: empty${c.reset}`);
    }
    console.log(`${c.green}+${counts.added}${c.reset} ${c.dim}kept ${counts.kept}${c.reset}`);
  ' "${latest_log}" "${ignore_file}")"
  if [[ -n "${added}" ]]; then
    printf '%s\n' "${added}" >&2
  else
    warn "no smart ignore suggestions found"
  fi
  success ".refactorignore ready: ${ignore_file}"
}

print_candidate_table() {
  C_BOLD="${bold}" C_DIM="${dim}" C_GREEN="${green}" C_YELLOW="${yellow}" C_CYAN="${cyan}" C_MAGENTA="${magenta}" C_RESET="${reset}" node -e '
    const fs = require("node:fs");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const skipped = new Set((process.argv[2] || "").split("\n").filter(Boolean));
    const c = {
      bold: process.env.C_BOLD || "",
      dim: process.env.C_DIM || "",
      green: process.env.C_GREEN || "",
      yellow: process.env.C_YELLOW || "",
      cyan: process.env.C_CYAN || "",
      magenta: process.env.C_MAGENTA || "",
      reset: process.env.C_RESET || "",
    };
    const suggestedIgnores = new Set((report.refactorIgnoreSuggestions || []).map((item) => item.path));
    const rows = report.candidates || [];
    const widths = { n: 3, path: 34, score: 7, files: 6, churn: 6, dup: 6, sub: 5, roles: 5 };
    const trunc = (value, width) => {
      const text = String(value);
      return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text.padEnd(width);
    };
    const line = `${c.dim}${"─".repeat(112)}${c.reset}`;
    console.error(`${c.bold}${c.cyan}┌ Candidates${c.reset} ${c.dim}${report.target} · ${rows.length} shown${c.reset}`);
    console.error(`${c.dim}│ generated ${report.generatedAt || "unknown"}${c.reset}`);
    console.error(line);
    console.error(`${c.dim} #  ${"path".padEnd(widths.path)} ${"score".padStart(widths.score)} ${"files".padStart(widths.files)} ${"churn".padStart(widths.churn)} ${"dups".padStart(widths.dup)} ${"sub".padStart(widths.sub)} ${"role".padStart(widths.roles)}  extensions${c.reset}`);
    console.error(line);
    for (const [index, item] of rows.entries()) {
      const wasSkipped = skipped.has(item.relative);
      const skippedMark = wasSkipped ? `${c.yellow} skipped${c.reset}` : "";
      const rankColor = index === 0 ? c.green : index < 5 ? c.cyan : c.dim;
      const rank = String(index + 1).padStart(2);
      const path = trunc(item.relative, widths.path);
      const exts = (item.extensions || []).join(" ") || "none";
      console.error(`${rankColor}${rank}.${c.reset} ${wasSkipped ? c.dim : c.bold}${path}${c.reset} ${String(item.score.toFixed ? item.score.toFixed(1) : item.score).padStart(widths.score)} ${String(item.files).padStart(widths.files)} ${String(item.churn).padStart(widths.churn)} ${String(item.duplicates).padStart(widths.dup)} ${String(item.subdirs).padStart(widths.sub)} ${String(item.roles).padStart(widths.roles)}  ${c.dim}${exts}${c.reset}${skippedMark}`);
    }
    console.error(line);
    const best = rows.find((item) => !skipped.has(item.relative));
    if (best) console.error(`${c.green}next:${c.reset} ${c.bold}${best.relative}${c.reset} ${c.dim}(score ${best.score})${c.reset}`);
    if (suggestedIgnores.size) {
      console.error(`${c.yellow}refactorignore:${c.reset} ${suggestedIgnores.size} artifact/generated-looking folder(s) omitted from candidates`);
      for (const item of (report.refactorIgnoreSuggestions || []).slice(0, 5)) console.error(`${c.dim}  - ${item.pattern} — confidence ${item.confidence}; ${item.reason}${c.reset}`);
    }
    console.error(`${c.dim}log:  ${process.argv[1]}${c.reset}`);
  ' "$1" "$2"
}

candidate_from_log() {
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const file = process.argv[1];
    const runRoot = path.resolve(process.argv[2]);
    const skipped = new Set((process.argv[3] || "").split("\n").filter(Boolean));
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const ignored = (report.refactorIgnoreSuggestions || []).map((item) => item.path.split(/[\\/]/).join("/"));
    const candidates = report.candidates || [];
    const isIgnored = (relative) => ignored.some((path) => {
      const normalized = relative.split(/[\\/]/).join("/");
      return normalized === path || normalized.startsWith(`${path}/`);
    });
    const picked = candidates.find((item) => item && item.relative && !skipped.has(item.relative) && !isIgnored(item.relative));
    const candidate = picked && picked.relative;
    if (!candidate) process.exit(3);
    const absolute = path.resolve(runRoot, candidate);
    const real = fs.realpathSync.native(absolute);
    const rel = path.relative(runRoot, real);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      console.error(`candidate escapes pwd: ${candidate}`);
      process.exit(4);
    }
    process.stdout.write(rel || ".");
  ' "$1" "${run_root}" "$2"
}

run_pi_capture() {
  local prompt=$1 mode=$2 output_file pid tail_pid status started now elapsed heartbeat timeout next_heartbeat bytes changed_summary last_line
  output_file="$(mktemp "${TMPDIR:-/tmp}/auto-folder-refactor-pi.XXXXXX")"
  heartbeat="${PI_AUTO_FOLDER_REFACTOR_HEARTBEAT_SECONDS:-30}"
  timeout="${PI_AUTO_FOLDER_REFACTOR_TIMEOUT_SECONDS:-0}"
  started="$(date +%s)"
  next_heartbeat="${heartbeat}"

  if [[ "${mode}" == "with-package" ]]; then
    "${pi_bin}" -p "${scope_args[@]}" "${package_args[@]}" "${extra_pi_args[@]}" "${prompt}" >"${output_file}" 2>&1 &
  else
    "${pi_bin}" -p "${scope_args[@]}" "${extra_pi_args[@]}" "${prompt}" >"${output_file}" 2>&1 &
  fi
  pid=$!
  tail -n +1 --pid="${pid}" -f "${output_file}" &
  tail_pid=$!
  info "pi running $(badge "${blue}" "pid ${pid}") $(badge "${dim}" "heartbeat ${heartbeat}s")"

  while kill -0 "${pid}" 2>/dev/null; do
    sleep 2
    if ! kill -0 "${pid}" 2>/dev/null; then
      break
    fi
    now="$(date +%s)"
    elapsed=$((now - started))
    if [[ "${heartbeat}" =~ ^[1-9][0-9]*$ ]] && (( elapsed >= next_heartbeat )); then
      bytes="$(wc -c <"${output_file}" 2>/dev/null || printf '0')"
      changed_summary="$(git_scope_status | awk '
        BEGIN { modified=0; added=0; deleted=0; other=0 }
        /^ M|^M |^MM/ { modified++ ; next }
        /^A |^\?\?/ { added++ ; next }
        /^ D|^D / { deleted++ ; next }
        { other++ }
        END { printf "modified:%d added:%d deleted:%d other:%d", modified, added, deleted, other }
      ')"
      last_line="$(tail -n 1 "${output_file}" 2>/dev/null | tr -d '\r' | cut -c 1-120 || true)"
      if [[ -n "${last_line}" ]]; then
        info "${elapsed}s $(badge "${blue}" "pid ${pid}") $(badge "${yellow}" "${changed_summary}") ${dim}${last_line}${reset}"
      else
        info "${elapsed}s $(badge "${blue}" "pid ${pid}") $(badge "${yellow}" "${changed_summary}") ${dim}thinking/no stdout yet${reset}"
      fi
      next_heartbeat=$((next_heartbeat + heartbeat))
    fi
    if [[ "${timeout}" =~ ^[1-9][0-9]*$ ]] && (( elapsed >= timeout )); then
      warn "timeout ${timeout}s reached; killing $(badge "${blue}" "pid ${pid}")"
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
      wait "${tail_pid}" 2>/dev/null || true
      rm -f "${output_file}"
      return 124
    fi
  done

  set +e
  wait "${pid}"
  status=$?
  set -e
  wait "${tail_pid}" 2>/dev/null || true
  rm -f "${output_file}"
  return "${status}"
}

run_pi_prompt() {
  local prompt=$1 output_file status
  output_file="$(mktemp "${TMPDIR:-/tmp}/auto-folder-refactor-pi.XXXXXX")"
  set +e
  run_pi_capture "${prompt}" with-package | tee "${output_file}"
  status=${PIPESTATUS[0]}
  set -e
  if [[ ${status} -eq 0 ]]; then
    rm -f "${output_file}"
    return 0
  fi
  if [[ ${#package_args[@]} -gt 0 ]] && grep -Eq 'Tool "folder_refactor_(scan|audit|state)" conflicts' "${output_file}"; then
    warn "local folder-refactor extension already loaded by Pi; retrying without local resources"
    rm -f "${output_file}"
    run_pi_capture "${prompt}" without-package
    return $?
  fi
  rm -f "${output_file}"
  return "${status}"
}

git_scope_status() {
  git -C "${run_root}" status --porcelain --untracked-files=all -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**' 2>/dev/null || true
}

run_candidate_validation() {
  local candidate=$1 module_dir rel pattern
  section "validation ${candidate}"
  if [[ -d "${run_root}/${candidate}" ]] && find "${run_root}/${candidate}" -type f -name '*.go' -print -quit | grep -q .; then
    module_dir="${run_root}"
    while [[ "${module_dir}" == "${run_root}" || "${module_dir}" == "${run_root}"/* ]]; do
      if [[ -f "${module_dir}/go.mod" ]]; then
        break
      fi
      [[ "${module_dir}" == "${run_root}" ]] && break
      module_dir="$(dirname -- "${module_dir}")"
    done
    rel="$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "${run_root}/${candidate}" "${module_dir}")"
    pattern="./${rel}/..."
    [[ "${rel}" == "." ]] && pattern="./..."
    info "go test ${pattern} -count=1"
    (cd "${module_dir}" && go test "${pattern}" -count=1)
    success "go test passed"
  else
    info "no Go package validation inferred for ${candidate}"
  fi
  info "git diff --check"
  git -C "${run_root}" diff --check -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**'
  success "diff check passed"
}

commit_preexisting_changes() {
  if [[ "${PI_AUTO_FOLDER_REFACTOR_NO_COMMIT:-}" == "1" || "${PI_AUTO_FOLDER_REFACTOR_NO_PRECOMMIT:-}" == "1" ]]; then
    return 0
  fi
  if ! git -C "${run_root}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi
  local status
  status="$(git_scope_status)"
  if [[ -z "${status}" ]]; then
    return 0
  fi
  section "pre-commit existing changes"
  warn "committing pre-existing changes under pwd so auto refactor can continue"
  printf '%s\n' "${status}" >&2
  git -C "${run_root}" add -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**'
  if git -C "${run_root}" diff --cached --quiet -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**'; then
    warn "no staged pre-existing changes after excludes"
    return 0
  fi
  git -C "${run_root}" commit -m "Checkpoint pre-existing changes before auto refactor"
  success "committed pre-existing changes $(git -C "${run_root}" rev-parse --short HEAD)"
}

commit_scope_changes() {
  local candidate=$1 message
  if [[ "${PI_AUTO_FOLDER_REFACTOR_NO_COMMIT:-}" == "1" ]]; then
    warn "PI_AUTO_FOLDER_REFACTOR_NO_COMMIT=1; leaving validated changes uncommitted"
    return 0
  fi
  if ! git -C "${run_root}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    error "cannot commit: ${run_root} is not inside a git worktree"
    return 1
  fi
  section "commit ${candidate}"
  git -C "${run_root}" add -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**'
  if git -C "${run_root}" diff --cached --quiet -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**'; then
    warn "no staged changes to commit after validation"
    return 0
  fi
  message="Refactor ${candidate} topology"
  git -C "${run_root}" commit -m "${message}"
  success "committed $(git -C "${run_root}" rev-parse --short HEAD) ${message}"
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

skipped_candidates=()
scan_top="${PI_AUTO_FOLDER_REFACTOR_SCAN_TOP:-25}"
if [[ ! "${scan_top}" =~ ^[1-9][0-9]*$ ]]; then
  scan_top=25
fi

if [[ "${mode}" == "ignore" ]]; then
  establish_refactorignore
  exit 0
fi

for ((i = 1; i <= loops; i++)); do
  section "auto-folder-refactor ${i}/${loops}"
  kv "scan" "${scan_root}"
  kv "scope" "${run_root}"
  kv "pool" "top ${scan_top} candidates"
  kv "skipped" "${#skipped_candidates[@]} this run"
  info "scanning candidates"
  node "${scanner}" "${resolved_scan_root}" --top "${scan_top}" >/dev/null
  latest_log="$(latest_log_for_root)"
  if [[ ! -f "${latest_log}" ]]; then
    error "missing scanner log: ${latest_log}"
    exit 1
  fi
  skipped_text="$(printf '%s\n' "${skipped_candidates[@]:-}")"
  print_candidate_table "${latest_log}" "${skipped_text}"
  if ! candidate="$(candidate_from_log "${latest_log}" "${skipped_text}")"; then
    warn "no untried candidate found in ${latest_log}"
    section "summary"
    kv "requested" "${loops} loops"
    kv "completed" "$((i - 1)) loops before candidate pool exhausted"
    kv "skipped" "${#skipped_candidates[@]} no-op candidates"
    success "auto-folder-refactor complete"
    exit 0
  fi

  success "selected $(badge "${green}" "candidate") ${bold}${candidate}${reset}"
  section "folder-refactor ${candidate}"
  kv "target" "${candidate}"
  kv "loop" "${i}/${loops}"
  kv "mode" "autonomous guarded refactor"
  prompt="$(printf '%s\n\n%s\n%s\n%s\n%s\n%s\n\n%s\n' \
    "/skill:skill-folder-refactor ${candidate}" \
    "Use the folder-refactor guardrail extension while working:" \
    "- Start with folder_refactor_scan on ${candidate}." \
    "- Make shared-code reuse the main objective: search for duplicated policy/types/helpers before moving files." \
    "- Prefer extracting small contracts/interfaces/value types/shared helpers into focused packages over shallow file moves." \
    "- Build new contracts only when they reduce coupling or duplicated behavior; keep compatibility wrappers at the old boundary when needed." \
    "- Reuse existing contracts/helpers before inventing new ones; name the reused or newly created contract in the report." \
    "- Before any final report, call folder_refactor_audit with exact remaining root file basenames classified as facadeFiles, outOfScopeFiles, or nextCandidateFiles." \
    "- If folder_refactor_audit fails, do not report done; either continue safe slices or report the specific blocker." \
    "- If nextCandidateFiles is non-empty and validation is green, execute the next candidate instead of stopping." \
    "AUTO_FOLDER_REFACTOR loop ${i}/${loops}. Fully automatic mode scoped to pwd only: ${run_root}. Do not inspect, edit, move, or validate parent directories outside pwd; only operate on pwd and its subfolders. Keep taking safe validated slices that improve sharing/reuse/contracts, not just directory shape. Do not stop with a safe next candidate; execute it. Stop only for failed validation, owner-risk blocker, generated/destructive risk, candidate outside pwd, or context exhaustion. If blocked, state the exact blocker and next command.")"

  commit_preexisting_changes
  before_snapshot="$(snapshot_scope)"
  run_pi_prompt "${prompt}"
  after_snapshot="$(snapshot_scope)"
  if [[ "${before_snapshot}" == "${after_snapshot}" ]]; then
    warn "no file changes after loop ${i}; marking ${bold}${candidate}${reset} skipped and continuing"
    skipped_candidates+=("${candidate}")
    continue
  fi
  run_candidate_validation "${candidate}"
  commit_scope_changes "${candidate}"
done

section "summary"
kv "requested" "${loops} loops"
kv "skipped" "${#skipped_candidates[@]} no-op candidates"
success "auto-folder-refactor complete"
