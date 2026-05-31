#!/usr/bin/env bash
# Git and validation helpers for auto-folder-refactor
# Provides: git_scope_status, rollback_scope_changes, rollback_failed_slice,
#           run_candidate_validation, commit_preexisting_changes, commit_scope_changes_local,
#           deliver_scope_changes, run_git_commit_push_delivery, snapshot_scope

git_scope_status() {
  git -C "${run_root}" status --porcelain --untracked-files=all -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**' 2>/dev/null | grep -vF '.pi/' || true
}

folder_debt_metrics() {
  local candidate=$1
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = process.argv[1];
    const source = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php", ".dart", ".swift", ".scala", ".c", ".cc", ".cpp", ".h", ".hpp"]);
    const roles = [/api|route|controller|handler/i, /component|view|page|screen|ui/i, /service|client|adapter|gateway/i, /model|schema|type|entity/i, /util|helper|common|shared/i, /test|spec|fixture|mock/i, /style|css|theme/i, /hook|store|state|context/i, /config|constant|env/i];
    let root = 0, total = 0;
    const roleSet = new Set();
    function note(file) { roles.forEach((pattern, index) => { if (pattern.test(file)) roleSet.add(index); }); }
    function walk(current) {
      let entries = [];
      try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name === ".git" || entry.name === ".pi" || entry.name === ".understand-anything" || entry.name === "node_modules") continue;
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
    const debt = root * 10 + roleSet.size * 5;
    process.stdout.write(JSON.stringify({ root, total, roles: roleSet.size, debt }));
  ' "${run_root}/${candidate}"
}

print_metric_delta() {
  local label=$1 before=$2 after=$3
  node -e '
    const label = process.argv[1];
    const before = JSON.parse(process.argv[2]);
    const after = JSON.parse(process.argv[3]);
    const keys = ["debt", "root", "total", "roles"];
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

candidate_git_pathspecs() {
  local candidate=$1
  if [[ "${candidate}" == "." ]]; then
    printf '%s\n' . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**'
  else
    printf '%s\n' "${candidate}" ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**'
  fi
}

rollback_scope_changes() {
  local reason=$1 candidate=${2:-scope}
  local -a rollback_pathspecs
  section "rollback ${candidate}"
  warn "discarding auto-folder-refactor changes: ${reason}"
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
    error "cannot safely rollback failed auto-folder-refactor slice because scope was dirty before pi ran"
    printf '%s\n' "${pre_slice_status}" >&2
    return 1
  fi
  rollback_scope_changes "${reason}" "${candidate}"
}

run_candidate_validation() {
  local candidate=$1 candidate_dir module_dir rel pattern
  section "validation ${candidate}"
  candidate_dir="${run_root}/${candidate}"
  if [[ -d "${candidate_dir}" ]] && find "${candidate_dir}" -type f -name '*.go' -print -quit | grep -q .; then
    module_dir="${candidate_dir}"
    while [[ "${module_dir}" == "${run_root}" || "${module_dir}" == "${run_root}"/* ]]; do
      if [[ -f "${module_dir}/go.mod" ]]; then
        break
      fi
      module_dir="$(dirname -- "${module_dir}")"
    done
    if [[ ! -f "${module_dir}/go.mod" ]]; then
      warn "no go.mod found at or above ${candidate}; skipping Go package validation"
      return 0
    fi
    rel="$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "${candidate_dir}" "${module_dir}")"
    pattern="./${rel}/..."
    [[ "${rel}" == "." ]] && pattern="./..."
    info "go test ${pattern} -count=1"
    (cd "${module_dir}" && go test "${pattern}" -count=1) || return $?
    success "go test passed"
  else
    info "no Go package validation inferred for ${candidate}"
  fi
  info "git diff --check"
  git -C "${run_root}" diff --check -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**' || return $?
  success "diff check passed"
}

run_git_commit_push_delivery() {
  local reason=$1 candidate=${2:-scope}
  section "git-commit-push ${candidate}"
  local prompt
  prompt="$(printf '%s\n\n%s\n%s\n%s\n%s\n%s\n' \
    "/skill:git-commit-push" \
    "Ship mode: commit and push validated auto-folder-refactor changes." \
    "Scope is current pwd only: ${run_root}. Do not stage parent/sibling changes outside this path." \
    "Reason: ${reason}." \
    "Exclude .pi/** and .understand-anything/** artifacts." \
    "Validation already run by auto-folder-refactor when applicable; rerun only focused relevant checks plus git diff --check if needed.")"
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
  section "pre-commit existing changes"
  warn "delivering pre-existing changes under pwd so auto refactor can continue"
  printf '%s\n' "${status}" >&2
  if printf '%s\n' "${status}" | grep -Eq '^[ MADRCU?!]{1,2} [^/]+$'; then
    warn "top-level dirty entry detected; if this is a nested git checkout/submodule, run 'auto-folder-refactor ignore' to add it to .refactorignore"
  fi
  git -C "${run_root}" add -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**'
  if git -C "${run_root}" diff --cached --quiet -- . ':(exclude)**/.pi/**' ':(exclude)**/.understand-anything/**'; then
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

deliver_scope_changes() {
  local candidate=$1
  if [[ "${PI_AUTO_FOLDER_REFACTOR_DELIVERY:-local}" == "local" ]]; then
    commit_scope_changes_local "${candidate}"
  else
    run_git_commit_push_delivery "validated refactor slice for ${candidate}" "${candidate}"
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
