#!/usr/bin/env bash
set -euo pipefail
# auto-folder-refactor.sh — entry point
# Sources helpers from lib/ and runs the main loop.

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
lib_dir="${script_dir}/lib"

# Source all lib modules
. "${lib_dir}/colors.sh"
. "${lib_dir}/scanner-utils.sh"
. "${lib_dir}/pi-runner.sh"
. "${lib_dir}/git-utils.sh"
. "${lib_dir}/loop-extras.sh"

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
  PI_AUTO_FOLDER_REFACTOR_HEARTBEAT_FILES    changed files to show per heartbeat (default: 6)
  PI_AUTO_FOLDER_REFACTOR_TIMEOUT_SECONDS    kill a single pi run after N seconds (default: 0/off)
  PI_AUTO_FOLDER_REFACTOR_SCAN_TOP           candidates to keep per scan (default: 25)
  PI_AUTO_FOLDER_REFACTOR_TABLE_ROWS         candidate rows to display (default: 10)
  PI_AUTO_FOLDER_REFACTOR_SHOW_SUGGESTIONS=1 list refactorignore suggestions (default: summary only)
  PI_AUTO_FOLDER_REFACTOR_SHOW_SKIPPED=1     include skipped candidates in ranking table (default: hidden)
  PI_AUTO_FOLDER_REFACTOR_SHOW_PI_OUTPUT=errors|all  pi stdout mode (default: errors)
  PI_AUTO_FOLDER_REFACTOR_HEARTBEAT_ON_CHANGE=1 only print unchanged heartbeats in debug (default: 1)
  PI_AUTO_FOLDER_REFACTOR_REQUIRE_PROGRESS=1 rollback validated slices with no debt/root decrease (default: 1)
  PI_AUTO_FOLDER_REFACTOR_COOLDOWN_SECONDS   base retry cooldown for soft failed candidates (default: 3600)
  PI_AUTO_FOLDER_REFACTOR_COOLDOWN_MAX_SECONDS max retry cooldown after backoff (default: 86400)
  PI_AUTO_FOLDER_REFACTOR_FAST_ROOT_REDUCTION=1 prefer manageable candidates with root files (default: 0; top debt wins)
  PI_AUTO_FOLDER_REFACTOR_PICK_MAX_FILES      max files for fast-root candidate preference (default: 80)
  PI_AUTO_FOLDER_REFACTOR_PICK_MAX_ROOT_FILES max root files for fast-root candidate preference (default: 40)
  PI_AUTO_FOLDER_REFACTOR_BUGFIND_THRESHOLD  switch to visibility/bug-finding when untried candidates <= N (default: 0/exhausted)
  PI_AUTO_FOLDER_REFACTOR_ARTIFACT_GUARD=0   disable runtime/generated artifact revert guard (default: on)
  PI_AUTO_FOLDER_REFACTOR_ARTIFACT_REGEX     extra regex for changed runtime artifacts to revert before commit
  PI_AUTO_FOLDER_REFACTOR_NO_COMMIT=1        validate but do not commit/push after changed loops
  PI_AUTO_FOLDER_REFACTOR_NO_PRECOMMIT=1     do not auto-deliver pre-existing pwd changes before loops
  PI_AUTO_FOLDER_REFACTOR_PRECOMMIT_DELIVERY=local|git-commit-push  pre-existing change delivery (default: local)
  PI_AUTO_FOLDER_REFACTOR_DELIVERY=local     use local git commit only instead of git-commit-push skill
  PI_AUTO_FOLDER_REFACTOR_DRILLDOWN_MAX_SUBDIRS  max subdirs before auto drill-down into sub-candidates (default: 5)
  PI_AUTO_FOLDER_REFACTOR_DRILLDOWN_MAX_FILES    max files for drilled candidate (default: 30)
  PI_AUTO_FOLDER_REFACTOR_DRILLDOWN_DEPTH        recursive drill-down depth (default: 3)
  PI_AUTO_FOLDER_REFACTOR_DYNAMIC_TIMEOUT=1       legacy ignored; timeouts are off by default

Examples:
  auto-folder-refactor.sh ignore
  auto-folder-refactor.sh 3
  auto-folder-refactor.sh 5 go-bot/internal
  PI_AUTO_FOLDER_REFACTOR_PI_ARGS='--model sonnet:high' auto-folder-refactor.sh 2
USAGE
}

# --- Arg parse ---
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

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

# --- Resolve paths ---
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

# --- Pi args ---
extra_pi_args=()
if [[ -n "${PI_AUTO_FOLDER_REFACTOR_PI_ARGS:-}" ]]; then
  read -r -a extra_pi_args <<< "${PI_AUTO_FOLDER_REFACTOR_PI_ARGS}"
fi

scope_args=(--session-dir "${run_root}/.pi/auto-folder-refactor-sessions")
scope_args+=(--append-system-prompt "AUTO_FOLDER_REFACTOR_SCOPE: You may inspect, edit, move, and validate only files under ${run_root}. Do not operate on parent directories or sibling trees. If a needed action escapes this scope, stop blocked.")
package_args=()
if [[ "${PI_AUTO_FOLDER_REFACTOR_WITH_LOCAL_RESOURCES:-}" == "1" ]]; then
  package_args+=(--extension "${extension}" --skill "${skills_dir}")
fi

# --- Config defaults ---
skipped_candidates=()
landed_count=0
rollback_count=0
noop_count=0
skip_count=0
progress_metric_args=()
scan_top="${PI_AUTO_FOLDER_REFACTOR_SCAN_TOP:-25}"
if [[ ! "${scan_top}" =~ ^[1-9][0-9]*$ ]]; then
  scan_top=25
fi
bugfind_threshold="${PI_AUTO_FOLDER_REFACTOR_BUGFIND_THRESHOLD:-0}"
if [[ ! "${bugfind_threshold}" =~ ^[0-9]+$ ]]; then
  bugfind_threshold=0
fi
dynamic_timeout=0
drilldown_max_subdirs="${PI_AUTO_FOLDER_REFACTOR_DRILLDOWN_MAX_SUBDIRS:-5}"
if [[ ! "${drilldown_max_subdirs}" =~ ^[1-9][0-9]*$ ]]; then
  drilldown_max_subdirs=5
fi

state_dir="${run_root}/.pi/auto-folder-refactor-state"
mkdir -p "${state_dir}"
state_key="$(printf '%s' "${resolved_scan_root}" | node -e 'const crypto=require("node:crypto"); process.stdout.write(crypto.createHash("sha256").update(require("node:fs").readFileSync(0)).digest("hex").slice(0,16));')"
state_file="${state_dir}/state.${state_key}.jsonl"
cooldown_seconds="${PI_AUTO_FOLDER_REFACTOR_COOLDOWN_SECONDS:-3600}"
if [[ ! "${cooldown_seconds}" =~ ^[0-9]+$ ]]; then
  cooldown_seconds=3600
fi
cooldown_max_seconds="${PI_AUTO_FOLDER_REFACTOR_COOLDOWN_MAX_SECONDS:-86400}"
if [[ ! "${cooldown_max_seconds}" =~ ^[0-9]+$ ]]; then
  cooldown_max_seconds=86400
fi
if (( cooldown_max_seconds < cooldown_seconds )); then
  cooldown_max_seconds="${cooldown_seconds}"
fi

refresh_skipped_candidates() {
  if [[ ! -f "${state_file}" ]]; then
    skipped_candidates=()
    return 0
  fi
  mapfile -t skipped_candidates < <(node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const now = Date.now();
    const latest = new Map();
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)) {
      try { const rec = JSON.parse(line); latest.set(rec.candidate, rec); } catch {}
    }
    for (const [candidate, rec] of latest) {
      if (rec.state === "blocked" || rec.state === "done" || rec.state === "exhausted") console.log(candidate);
      if (rec.state === "cooldown" && Date.parse(rec.until || "") > now) console.log(candidate);
    }
  ' "${state_file}" | sort -u)
}

mark_candidate_state() {
  local candidate=$1 reason=${2:-skipped} scope=${3:-candidate} requested_temporary=${4:-0} now state until effective_cooldown
  now="$(date -Is)"
  state="cooldown"
  case "${reason}" in
    empty|"already clean") state="done" ;;
    "timeout rollback"|"pi failure rollback"|"validation rollback") state="blocked" ;;
    "sub-candidates exhausted this run") state="exhausted" ;;
    "no changes"|"no metric progress rollback") state="cooldown" ;;
  esac
  until=""
  if [[ "${state}" == "cooldown" ]]; then
    effective_cooldown="$(node -e '
      const fs = require("node:fs");
      const file = process.argv[1];
      const candidate = process.argv[2];
      const reason = process.argv[3];
      const base = Math.max(0, Number(process.argv[4]) || 0);
      const max = Math.max(base, Number(process.argv[5]) || base);
      let attempts = 0;
      if (fs.existsSync(file)) {
        for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)) {
          try {
            const rec = JSON.parse(line);
            if (rec.candidate === candidate && rec.reason === reason && rec.state === "cooldown") attempts += 1;
          } catch {}
        }
      }
      const multiplier = Math.pow(2, Math.min(attempts, 16));
      process.stdout.write(String(Math.min(max, base * multiplier)));
    ' "${state_file}" "${candidate}" "${reason}" "${cooldown_seconds}" "${cooldown_max_seconds}")"
    until="$(date -Is -d "+${effective_cooldown} seconds" 2>/dev/null || date -Is)"
  fi
  mkdir -p "${state_dir}"
  node -e 'const fs=require("node:fs"); const rec={ts:process.argv[1], candidate:process.argv[2], reason:process.argv[3], scope:process.argv[4], state:process.argv[5], until:process.argv[6] || undefined}; fs.appendFileSync(process.argv[7], JSON.stringify(rec)+"\n");' "${now}" "${candidate}" "${reason}" "${scope}" "${state}" "${until}" "${state_file}"
  refresh_skipped_candidates
  skip_count=$((skip_count + 1))
  warn "candidate state: ${candidate} → ${state} (${reason}; scope=${scope}${until:+; until=${until}}${effective_cooldown:+; cooldown=${effective_cooldown}s})"
}

mark_skipped() { mark_candidate_state "$@"; }

refresh_skipped_candidates

# --- Mode dispatch ---
if [[ "${mode}" == "ignore" ]]; then
  establish_refactorignore
  exit 0
fi

# ====================================================================
# Main loop
# ====================================================================
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
  untried_count="$(untried_candidate_count_from_log "${latest_log}" "${skipped_text}")"
  if (( untried_count <= bugfind_threshold )); then
    warn "untried candidates ${untried_count} <= bug-find threshold ${bugfind_threshold}; switching to visibility bug-finding"
    commit_preexisting_changes
    if ! run_bug_finding_slice "${i}/${loops}"; then
      section "summary"
      kv "requested" "${loops} loops"
      kv "completed" "$((i - 1)) refactor loops before bug-finding exhaustion"
      kv "landed" "${landed_count}"
      kv "rolled back" "${rollback_count}"
      kv "no-op" "${noop_count}"
      kv "skipped total" "${#skipped_candidates[@]}"
      success "auto-folder-refactor complete"
      exit 0
    fi
    continue
  fi
  if ! candidate="$(candidate_from_log "${latest_log}" "${skipped_text}")"; then
    warn "no untried candidate found in ${latest_log}; switching to visibility bug-finding"
    commit_preexisting_changes
    if ! run_bug_finding_slice "${i}/${loops}"; then
      section "summary"
      kv "requested" "${loops} loops"
      kv "completed" "$((i - 1)) loops before candidate and bug-finding exhaustion"
      kv "landed" "${landed_count}"
      kv "rolled back" "${rollback_count}"
      kv "no-op" "${noop_count}"
      kv "skipped total" "${#skipped_candidates[@]}"
      success "auto-folder-refactor complete"
      exit 0
    fi
    continue
  fi

  # Drill down if candidate has too many subdirs (prevents pi hang on 400-file targets)
  # Pass already-skipped sub-candidates so it picks the next untried one
  drill_candidate="${candidate}"
  candidate="$(run_drill_down "${candidate}" "${skipped_candidates[@]:-}")"
  # If all sub-candidates exhausted, skip the parent too
  already_skipped_sub="$(printf '%s\n' "${skipped_candidates[@]:-}" | grep -c "${drill_candidate}/" || true)"
  if [[ "${candidate}" == "${drill_candidate}" && "${already_skipped_sub}" -gt 0 ]]; then
    warn "all sub-candidates of ${drill_candidate} exhausted for this run; marking parent exhausted"
    mark_skipped "${drill_candidate}" "sub-candidates exhausted this run" "parent" "1"
    continue
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
    "- Refactor around behavior/responsibility, not file shuffling; group by domain/feature/change reason." \
    "- Preserve behavior first: add or keep focused tests around the current public behavior before structural edits." \
    "- Prefer one small reversible compile-preserving slice over broad package moves; move only a few files before updating imports/tests and validating." \
    "- For each new module boundary, state what it owns, exposes, and must never know about." \
    "- Keep dependency direction sane: core/domain logic must not import UI, transport, database, framework, or app orchestration details." \
    "- Separate pure logic from side effects; use adapters/contracts at external boundaries." \
    "- Avoid vague buckets like utils/common/misc; use specific names such as validation, formatting, pricing, auth, parser, or adapters." \
    "- Make shared-code reuse the main objective only when behavior is identical across proven call sites; do not create speculative abstractions." \
    "- Prefer extracting small contracts/interfaces/value types/shared helpers into focused packages over shallow file moves." \
    "- Build new contracts only when they reduce coupling or duplicated behavior; keep compatibility wrappers at the old boundary when needed." \
    "- Reuse existing contracts/helpers before inventing new ones; name the reused or newly created contract in the report." \
    "- Success criterion: make the next change easier, safer, and more obvious without changing current behavior." \
    "- Before any final report, call folder_refactor_audit with exact remaining root file basenames classified as facadeFiles, outOfScopeFiles, or nextCandidateFiles." \
    "- If folder_refactor_audit fails, do not report done; either continue safe slices or report the specific blocker." \
    "- If nextCandidateFiles is non-empty and validation is green, execute the next candidate instead of stopping." \
    "AUTO_FOLDER_REFACTOR loop ${i}/${loops}. Fully automatic mode scoped to pwd only: ${run_root}. Do not inspect, edit, move, or validate parent directories outside pwd; only operate on pwd and its subfolders. Keep taking safe validated slices that improve sharing/reuse/contracts, not just directory shape. Do not stop with a safe next candidate; execute it. Stop only for failed validation, owner-risk blocker, generated/destructive risk, candidate outside pwd, or context exhaustion. If blocked, state the exact blocker and next command.")"

  candidate_timeout="${PI_AUTO_FOLDER_REFACTOR_TIMEOUT_SECONDS:-0}"
  if [[ ! "${candidate_timeout}" =~ ^[0-9]+$ ]]; then
    candidate_timeout=0
  fi
  if [[ "${candidate_timeout}" == "0" ]]; then
    kv "timeout" "off"
  else
    kv "timeout" "${candidate_timeout}s"
  fi

  # Quick smell check: skip candidate with 0 total files (truly empty)
  total_files="$(find "${run_root}/${candidate}" -type f 2>/dev/null | wc -l)"
  if [[ "${total_files}" == "0" ]]; then
    warn "candidate ${candidate} has 0 files (empty); skipping pi"
    noop_count=$((noop_count + 1))
    mark_skipped "${candidate}" "empty" "candidate" "0"
    continue
  fi

  # Quick smell check: if candidate already has 0 root files and few subdirs,
  # it is already at ideal topology (all files organized). Skip pi.
  root_files="$(find "${run_root}/${candidate}" -maxdepth 1 -type f 2>/dev/null | wc -l)"
  if [[ "${root_files}" == "0" ]]; then
    subdir_count="$(find "${run_root}/${candidate}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)"
    if (( subdir_count <= 5 )); then
      warn "candidate ${candidate} has 0 root files and ${subdir_count} subdirs (already clean); skipping pi"
      noop_count=$((noop_count + 1))
      mark_skipped "${candidate}" "already clean" "candidate" "0"
      continue
    fi
  fi

  commit_preexisting_changes
  pre_slice_status="$(git_scope_status)"
  before_snapshot="$(snapshot_scope)"
  before_candidate_metrics="$(folder_debt_metrics "${candidate}")"
  before_parent_metrics=""
  if [[ "${candidate}" == */* ]]; then
    before_parent_metrics="$(folder_debt_metrics "${candidate%/*}")"
  fi

  # Set candidate context for heartbeat badges
  export PI_AUTO_FOLDER_REFACTOR_CURRENT_CANDIDATE="${candidate}"

  # Run pi. Timeout is off by default; PI_AUTO_FOLDER_REFACTOR_TIMEOUT_SECONDS is opt-in.
  set +e
  if [[ "${candidate_timeout}" != "0" ]]; then
    PI_AUTO_FOLDER_REFACTOR_TIMEOUT_SECONDS="${candidate_timeout}" run_pi_prompt "${prompt}"
  else
    run_pi_prompt "${prompt}"
  fi
  pi_exit=$?
  set -e

  revert_artifact_churn "${candidate}"
  after_snapshot="$(snapshot_scope)"
  if [[ "${before_snapshot}" == "${after_snapshot}" ]]; then
    if [[ "${pi_exit}" == "124" ]]; then
      warn "no file changes after loop ${i} (timed out ${candidate_timeout}s); marking ${bold}${candidate}${reset} skipped and continuing"
    else
      warn "no file changes after loop ${i}; marking ${bold}${candidate}${reset} skipped and continuing"
    fi
    # Only skip the candidate itself (not the parent), so drill-down
    # can pick the next untried sub-candidate from the same parent.
    noop_count=$((noop_count + 1))
    mark_skipped "${candidate}" "no changes" "candidate" "0"
    continue
  fi

  if [[ "${pi_exit}" == "124" ]]; then
    rollback_failed_slice "pi timed out after ${candidate_timeout}s before completing a coherent slice" "${candidate}" "${pre_slice_status}"
    rollback_count=$((rollback_count + 1))
    mark_skipped "${candidate}" "timeout rollback" "candidate" "0"
    continue
  fi
  if [[ "${pi_exit}" != "0" ]]; then
    rollback_failed_slice "pi exited with status ${pi_exit}" "${candidate}" "${pre_slice_status}"
    rollback_count=$((rollback_count + 1))
    mark_skipped "${candidate}" "pi failure rollback" "candidate" "0"
    continue
  fi

  set +e
  run_candidate_validation "${candidate}"
  validation_exit=$?
  set -e
  if [[ "${validation_exit}" != "0" ]]; then
    rollback_failed_slice "validation failed with status ${validation_exit}" "${candidate}" "${pre_slice_status}"
    rollback_count=$((rollback_count + 1))
    mark_skipped "${candidate}" "validation rollback" "candidate" "0"
    continue
  fi
  after_candidate_metrics="$(folder_debt_metrics "${candidate}")"
  section "metric delta ${candidate}"
  print_metric_delta "target ${candidate}" "${before_candidate_metrics}" "${after_candidate_metrics}"
  progress_metric_args=("${before_candidate_metrics}" "${after_candidate_metrics}")
  if [[ -n "${before_parent_metrics}" ]]; then
    after_parent_metrics="$(folder_debt_metrics "${candidate%/*}")"
    print_metric_delta "parent ${candidate%/*}" "${before_parent_metrics}" "${after_parent_metrics}"
    progress_metric_args+=("${before_parent_metrics}" "${after_parent_metrics}")
  fi
  if [[ "${PI_AUTO_FOLDER_REFACTOR_REQUIRE_PROGRESS:-1}" == "1" ]] && ! metric_progress_decreased "${progress_metric_args[@]}"; then
    rollback_failed_slice "validated slice did not reduce target/parent debt or root files" "${candidate}" "${pre_slice_status}"
    rollback_count=$((rollback_count + 1))
    mark_skipped "${candidate}" "no metric progress rollback" "candidate" "1"
    continue
  fi
  deliver_scope_changes "${candidate}"
  landed_count=$((landed_count + 1))
done

section "summary"
kv "requested" "${loops} loops"
kv "landed" "${landed_count}"
kv "rolled back" "${rollback_count}"
kv "no-op" "${noop_count}"
kv "skipped total" "${#skipped_candidates[@]}"
kv "state" "${state_file}"
success "auto-folder-refactor complete"
