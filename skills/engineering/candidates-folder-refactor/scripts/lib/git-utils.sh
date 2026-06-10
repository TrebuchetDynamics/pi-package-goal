#!/usr/bin/env bash
# Git and validation helpers for autofolderrefactor
# Provides: git_scope_status, rollback_scope_changes, rollback_failed_slice,
#           run_candidate_validation, commit_preexisting_changes, commit_scope_changes_local,
#           deliver_scope_changes, run_git_commit_push_delivery, snapshot_scope,
#           revert_artifact_churn

git_scope_status() {
  git -C "${run_root}" status --porcelain --untracked-files=all -- . ':(exclude).pi/**' ':(exclude)**/.pi/**' ':(exclude).understand-anything/**' ':(exclude)**/.understand-anything/**' 2>/dev/null | grep -vF '.pi/' || true
}

is_auto_artifact_path() {
  local path=$1 extra_regex=${PI_AUTO_FOLDER_REFACTOR_ARTIFACT_REGEX:-}
  case "${path}" in
    *.log|*.tmp|*.cache|*.pid|*.trace|*.prof|*.out|*.coverage|coverage/*|*/coverage/*|dist/*|*/dist/*|build/*|*/build/*|*/paper-toxicity-decisions.jsonl|paper-toxicity-decisions.jsonl)
      return 0
      ;;
  esac
  if [[ -n "${extra_regex}" && "${path}" =~ ${extra_regex} ]]; then
    return 0
  fi
  return 1
}

revert_artifact_churn() {
  local candidate=${1:-scope} line path status
  if [[ "${PI_AUTO_FOLDER_REFACTOR_ARTIFACT_GUARD:-1}" == "0" ]]; then
    return 0
  fi
  local -a paths=()
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    status="${line:0:2}"
    path="${line:3}"
    if [[ "${status}" == R* || "${status}" == *R ]]; then
      path="${path##* -> }"
    fi
    if is_auto_artifact_path "${path}"; then
      paths+=("${path}")
    fi
  done < <(git -C "${run_root}" status --porcelain --untracked-files=all -- . ':(exclude).pi/**' ':(exclude)**/.pi/**' ':(exclude).understand-anything/**' ':(exclude)**/.understand-anything/**' 2>/dev/null || true)
  if (( ${#paths[@]} == 0 )); then
    return 0
  fi
  section "artifact guard ${candidate}"
  warn "reverting runtime/generated artifact churn before validation/commit"
  printf '  %s\n' "${paths[@]}" >&2
  git -C "${run_root}" restore --staged --worktree -- "${paths[@]}" >/dev/null 2>&1 || true
  git -C "${run_root}" clean -fd -- "${paths[@]}" >/dev/null 2>&1 || true
}

folder_debt_metrics() {
  local candidate=$1
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = process.argv[1];
    const source = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php", ".dart", ".swift", ".scala", ".c", ".cc", ".cpp", ".h", ".hpp"]);
    const skip = new Set([".git", ".pi", ".understand-anything", "node_modules"]);
    const roles = [/api|route|controller|handler/i, /component|view|page|screen|ui/i, /service|client|adapter|gateway/i, /model|schema|type|entity/i, /util|helper|common|shared/i, /test|spec|fixture|mock/i, /style|css|theme/i, /hook|store|state|context/i, /config|constant|env/i];
    let root = 0, total = 0;
    const roleSet = new Set();
    function note(file) { roles.forEach((pattern, index) => { if (pattern.test(file)) roleSet.add(index); }); }
    function walk(current) {
      let entries = [];
      try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (skip.has(entry.name)) continue;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!source.has(ext) && ![".md", ".json", ".yaml", ".yml", ".toml"].includes(ext)) continue;
        total += 1;
        if (path.dirname(full) === dir) root += 1;
        note(path.relative(dir, full));
      }
    }
    walk(dir);
    let subdirs = 0;
    try { subdirs = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !skip.has(entry.name)).length; } catch {}
    const debt = root * 10 + roleSet.size * 5;
    process.stdout.write(JSON.stringify({ root, total, roles: roleSet.size, subdirs, debt }));
  ' "${run_root}/${candidate}"
}

print_metric_delta() {
  local label=$1 before=$2 after=$3
  node -e '
    const label = process.argv[1];
    const before = JSON.parse(process.argv[2]);
    const after = JSON.parse(process.argv[3]);
    const keys = ["debt", "root", "total", "roles", "subdirs"];
    const parts = keys.map((key) => {
      const delta = (after[key] || 0) - (before[key] || 0);
      const sign = delta > 0 ? "+" : "";
      return `${key} ${before[key] ?? 0}→${after[key] ?? 0} (${sign}${delta})`;
    });
    console.error(`  ${label}: ${parts.join("; ")}`);
  ' "${label}" "${before}" "${after}"
}

metric_progress_decreased() {
  node -e '
    const pairs = process.argv.slice(1).filter(Boolean);
    for (let index = 0; index < pairs.length; index += 2) {
      const before = JSON.parse(pairs[index]);
      const after = JSON.parse(pairs[index + 1]);
      if ((after.debt || 0) < (before.debt || 0) || (after.root || 0) < (before.root || 0)) process.exit(0);
    }
    process.exit(1);
  ' "$@"
}

metric_progress_reason() {
  node -e '
    const pairs = process.argv.slice(1).filter(Boolean);
    const reasons = [];
    let additiveOnly = false;
    for (let index = 0; index < pairs.length; index += 2) {
      const before = JSON.parse(pairs[index]);
      const after = JSON.parse(pairs[index + 1]);
      if ((after.debt || 0) < (before.debt || 0)) reasons.push("debt decreased");
      if ((after.root || 0) < (before.root || 0)) reasons.push("root files decreased");
      if ((after.subdirs || 0) > (before.subdirs || 0) && (after.total || 0) > (before.total || 0)) additiveOnly = true;
    }
    process.stdout.write(reasons.length ? [...new Set(reasons)].join(", ") : additiveOnly ? "new source/test files without debt or root-file reduction" : "no debt/root reduction");
  ' "$@"
}

candidate_git_pathspecs() {
  local candidate=$1
  if [[ "${candidate}" == "." ]]; then
    printf '%s\n' . ':(exclude).pi/**' ':(exclude)**/.pi/**' ':(exclude).understand-anything/**' ':(exclude)**/.understand-anything/**'
  else
    printf '%s\n' "${candidate}" ':(exclude).pi/**' ':(exclude)**/.pi/**' ':(exclude).understand-anything/**' ':(exclude)**/.understand-anything/**'
  fi
}

rollback_scope_changes() {
  local reason=$1 candidate=${2:-scope}
  local -a rollback_pathspecs
  section "rollback ${candidate}"
  warn "discarding autofolderrefactor changes: ${reason}"
  if ! git -C "${run_root}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    error "cannot rollback: ${run_root} is not inside a git worktree"
    return 1
  fi
  mapfile -t rollback_pathspecs < <(candidate_git_pathspecs "${candidate}")
  git -C "${run_root}" restore --staged --worktree -- "${rollback_pathspecs[@]}"
  git -C "${run_root}" clean -fd -- "${rollback_pathspecs[@]}"
  success "rolled back failed slice for ${candidate}"
}

rollback_failed_slice() {
  local reason=$1 candidate=$2 pre_slice_status=${3:-}
  if [[ -n "${pre_slice_status}" ]]; then
    section "rollback blocked ${candidate}"
    error "cannot safely rollback failed autofolderrefactor slice because scope was dirty before pi ran"
    printf '%s\n' "${pre_slice_status}" >&2
    return 1
  fi
  rollback_scope_changes "${reason}" "${candidate}"
}

git_status_paths() {
  node -e '
    const fs = require("node:fs");
    const records = fs.readFileSync(0, "utf8").split("\0").filter(Boolean);
    const paths = [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record.length < 4) continue;
      const status = record.slice(0, 2);
      const file = record.slice(3);
      if (!file || file === ".") continue;
      paths.push(file.split(/[\\/]+/).filter(Boolean).join("/"));
      if (status.includes("R") || status.includes("C")) {
        const source = records[index + 1];
        if (source) paths.push(source.split(/[\\/]+/).filter(Boolean).join("/"));
        index += 1;
      }
    }
    process.stdout.write([...new Set(paths)].join("\n"));
  '
}

git_repo_status_paths() {
  local repo_root
  repo_root="$(git -C "${run_root}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${run_root}")"
  git -C "${repo_root}" status --porcelain=v1 -z --untracked-files=all -- . ':(exclude).pi/**' ':(exclude)**/.pi/**' ':(exclude).understand-anything/**' ':(exclude)**/.understand-anything/**' 2>/dev/null | git_status_paths
}

changed_paths_outside_candidate() {
  local candidate=$1
  if [[ "${candidate}" == "." ]]; then
    return 0
  fi
  git -C "${run_root}" status --porcelain=v1 -z --untracked-files=all -- . ':(exclude).pi/**' ':(exclude)**/.pi/**' ':(exclude).understand-anything/**' ':(exclude)**/.understand-anything/**' 2>/dev/null | git_status_paths | node -e '
    const fs = require("node:fs");
    const candidate = process.argv[1].split(/[\\/]+/).filter(Boolean).join("/");
    const outside = fs.readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean).filter((file) => file !== candidate && !file.startsWith(`${candidate}/`));
    process.stdout.write([...new Set(outside)].join("\n"));
  ' "${candidate}"
}

new_changes_outside_run_root() {
  local before=${1:-} repo_root run_root_rel
  repo_root="$(git -C "${run_root}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${run_root}")"
  run_root_rel="$(node -e 'const path=require("node:path"); process.stdout.write(path.relative(process.argv[1], process.argv[2]).split(path.sep).join("/") || ".");' "${repo_root}" "${run_root}")"
  git_repo_status_paths | node -e '
    const fs = require("node:fs");
    const before = new Set((process.argv[1] || "").split(/\r?\n/).filter(Boolean));
    const root = process.argv[2];
    const current = fs.readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean);
    const inside = (file) => root === "." || file === root || file.startsWith(`${root}/`);
    const outside = current.filter((file) => !inside(file) && !before.has(file));
    process.stdout.write([...new Set(outside)].join("\n"));
  ' "${before}" "${run_root_rel}"
}

rollback_repo_paths() {
  local paths_text=${1:-} repo_root remaining
  local -a paths
  [[ -z "${paths_text}" ]] && return 0
  repo_root="$(git -C "${run_root}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${run_root}")"
  mapfile -t paths < <(printf '%s\n' "${paths_text}" | sed '/^$/d')
  (( ${#paths[@]} == 0 )) && return 0
  git -C "${repo_root}" restore --staged --worktree -- "${paths[@]}" >/dev/null 2>&1 || true
  git -C "${repo_root}" clean -fd -- "${paths[@]}" >/dev/null 2>&1 || true
  remaining="$(git -C "${repo_root}" status --porcelain=v1 -z --untracked-files=all -- "${paths[@]}" 2>/dev/null | git_status_paths)"
  if [[ -n "${remaining}" ]]; then
    error "failed to rollback outside-scope paths"
    printf '%s\n' "${remaining}" >&2
    return 1
  fi
}

assert_changes_within_candidate() {
  local candidate=$1 outside
  outside="$(changed_paths_outside_candidate "${candidate}")"
  if [[ -n "${outside}" ]]; then
    error "autofolderrefactor changed files outside candidate ${candidate}"
    printf '%s\n' "${outside}" >&2
    return 1
  fi
}

stage_scope_changes() {
  local candidate=${1:-.}
  # Avoid explicit ignored pathspecs in `git add`; they can turn ignored
  # .pi/.understand-anything directories into hard blockers. Stage only the
  # selected candidate for normal slices, then unstage local agent artifacts.
  if [[ "${candidate}" == "." ]]; then
    git -C "${run_root}" -c advice.addIgnoredFile=false add --all -- .
  else
    git -C "${run_root}" -c advice.addIgnoredFile=false add --all -- "${candidate}"
  fi
  git -C "${run_root}" restore --staged -- .pi .understand-anything ':(glob)**/.pi/**' ':(glob)**/.understand-anything/**' 2>/dev/null || true
}

run_candidate_validation() {
  local candidate=$1 candidate_dir module_dir rel pattern repo_root package_dir package_script validation_ran
  LAST_VALIDATION_RECEIPT=""
  section "validation ${candidate}"
  candidate_dir="${run_root}/${candidate}"
  validation_ran=0
  repo_root="$(git -C "${run_root}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${run_root}")"
  if [[ -d "${candidate_dir}" ]] && find "${candidate_dir}" -type f -name '*.go' -print -quit | grep -q .; then
    module_dir="${candidate_dir}"
    while [[ "${module_dir}" == "${repo_root}" || "${module_dir}" == "${repo_root}"/* ]]; do
      if [[ -f "${module_dir}/go.mod" ]]; then
        break
      fi
      module_dir="$(dirname -- "${module_dir}")"
    done
    if [[ ! -f "${module_dir}/go.mod" ]]; then
      warn "no go.mod found at or above ${candidate} up to ${repo_root}; skipping Go package validation"
    else
      rel="$(node -e 'const path=require("node:path"); process.stdout.write(path.relative(process.argv[2], process.argv[1]) || ".");' "${candidate_dir}" "${module_dir}")"
      pattern="./${rel}/..."
      [[ "${rel}" == "." ]] && pattern="./..."
      info "go test ${pattern} -count=1 (from ${module_dir})"
      (cd "${module_dir}" && go test "${pattern}" -count=1) || return $?
      LAST_VALIDATION_RECEIPT="go test ${pattern} -count=1 from ${module_dir}: pass"
      validation_ran=1
      success "go test passed"
    fi
  fi
  if (( validation_ran == 0 )); then
    package_dir="$(node -e '
      const fs = require("node:fs");
      const path = require("node:path");
      let dir = path.resolve(process.argv[1]);
      const root = path.resolve(process.argv[2]);
      while (dir === root || dir.startsWith(root + path.sep)) {
        if (fs.existsSync(path.join(dir, "package.json"))) { process.stdout.write(dir); process.exit(0); }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    ' "${candidate_dir}" "${repo_root}")"
    if [[ -n "${package_dir}" ]]; then
      package_script="$(node -e '
        const fs = require("node:fs");
        const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        if (pkg.scripts?.test) process.stdout.write("test");
        else if (pkg.scripts?.validate) process.stdout.write("validate");
      ' "${package_dir}/package.json")"
      if [[ -n "${package_script}" ]]; then
        info "npm run ${package_script} (from ${package_dir})"
        (cd "${package_dir}" && npm run "${package_script}") || return $?
        LAST_VALIDATION_RECEIPT="${LAST_VALIDATION_RECEIPT:+${LAST_VALIDATION_RECEIPT}; }npm run ${package_script} from ${package_dir}: pass"
        validation_ran=1
        success "npm run ${package_script} passed"
      else
        info "package.json found at ${package_dir} but no test/validate script is defined"
      fi
    fi
  fi
  if (( validation_ran == 0 )); then
    info "no language-specific validation inferred for ${candidate}"
  fi
  info "git diff --check"
  git -C "${run_root}" diff --check -- . ':(exclude).pi/**' ':(exclude)**/.pi/**' ':(exclude).understand-anything/**' ':(exclude)**/.understand-anything/**' || return $?
  LAST_VALIDATION_RECEIPT="${LAST_VALIDATION_RECEIPT:+${LAST_VALIDATION_RECEIPT}; }git diff --check: pass"
  success "diff check passed"
}

run_git_commit_push_delivery() {
  local reason=$1 candidate=${2:-scope}
  section "git-commit-push ${candidate}"
  local prompt
  prompt="$(printf '%s\n\n%s\n%s\n%s\n%s\n%s\n' \
    "/skill:git-commit-push" \
    "Ship mode: commit and push validated autofolderrefactor changes." \
    "Scope is current pwd only: ${run_root}. Do not stage parent/sibling changes outside this path." \
    "Reason: ${reason}." \
    "Exclude .pi/** and .understand-anything/** artifacts." \
    "Validation already run by autofolderrefactor when applicable; rerun only focused relevant checks plus git diff --check if needed.")"
  run_pi_prompt "${prompt}"
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
  section "pre-existing changes"
  printf '%s\n' "${status}" >&2
  if [[ "${PI_AUTO_FOLDER_REFACTOR_PRECOMMIT:-}" != "1" ]]; then
    error "pre-existing changes detected under pwd; refusing to auto-commit user work by default"
    warn "commit/stash/revert these changes first, or rerun with PI_AUTO_FOLDER_REFACTOR_PRECOMMIT=1 to checkpoint them explicitly"
    return 1
  fi
  warn "delivering pre-existing changes under pwd because PI_AUTO_FOLDER_REFACTOR_PRECOMMIT=1"
  if printf '%s\n' "${status}" | grep -Eq '^[ MADRCU?!]{1,2} [^/]+$'; then
    warn "top-level dirty entry detected; if this is a nested git checkout/submodule, run 'autofolderrefactor ignore' to add it to .refactorignore"
  fi
  stage_scope_changes
  if git -C "${run_root}" diff --cached --quiet -- . ':(exclude).pi/**' ':(exclude)**/.pi/**' ':(exclude).understand-anything/**' ':(exclude)**/.understand-anything/**'; then
    warn "no staged pre-existing changes after excludes"
    return 0
  fi
  if [[ "${PI_AUTO_FOLDER_REFACTOR_PRECOMMIT_DELIVERY:-local}" == "local" ]]; then
    git -C "${run_root}" commit -m "Checkpoint pre-existing changes before auto refactor"
    success "committed pre-existing changes $(git -C "${run_root}" rev-parse --short HEAD)"
  else
    run_git_commit_push_delivery "checkpoint pre-existing changes before auto refactor" "pre-existing"
  fi
}

commit_scope_changes_local() {
  local candidate=$1 stage_candidate=${2:-$1} message
  if [[ "${PI_AUTO_FOLDER_REFACTOR_NO_COMMIT:-}" == "1" ]]; then
    warn "PI_AUTO_FOLDER_REFACTOR_NO_COMMIT=1; leaving validated changes uncommitted"
    return 0
  fi
  if ! git -C "${run_root}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    error "cannot commit: ${run_root} is not inside a git worktree"
    return 1
  fi
  section "commit ${candidate}"
  assert_changes_within_candidate "${stage_candidate}" || return $?
  stage_scope_changes "${stage_candidate}"
  if git -C "${run_root}" diff --cached --quiet -- . ':(exclude).pi/**' ':(exclude)**/.pi/**' ':(exclude).understand-anything/**' ':(exclude)**/.understand-anything/**'; then
    warn "no staged changes to commit after validation"
    return 0
  fi
  if [[ "${candidate}" == bugfind-* ]]; then
    message="Bugfind ${candidate#bugfind-} visibility slice"
  else
    message="Refactor ${candidate} topology"
  fi
  git -C "${run_root}" commit \
    -m "${message}" \
    -m "Target: ${candidate}" \
    -m "Validation: ${LAST_VALIDATION_RECEIPT:-not recorded}" \
    -m "Progress: ${LAST_PROGRESS_REASON:-not recorded}" \
    -m "Mode: autofolderrefactor share-code + folder-refactor; shared code/bugs are reported by the agent when found."
  success "committed $(git -C "${run_root}" rev-parse --short HEAD) ${message}"
}

deliver_scope_changes() {
  local candidate=$1 stage_candidate=${2:-$1}
  if [[ "${PI_AUTO_FOLDER_REFACTOR_DELIVERY:-local}" == "local" ]]; then
    commit_scope_changes_local "${candidate}" "${stage_candidate}"
  else
    run_git_commit_push_delivery "validated refactor slice for ${candidate}" "${stage_candidate}"
  fi
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
