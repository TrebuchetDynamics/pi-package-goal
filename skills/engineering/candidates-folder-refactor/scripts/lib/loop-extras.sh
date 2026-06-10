#!/usr/bin/env bash
# Loop extras for autofolderrefactor (bug-finding slice)
# Provides: run_bug_finding_slice

run_bug_finding_slice() {
  local loop_label=$1 target_label before after prompt pre_slice_status before_repo_status preexisting_outside_scope outside_scope_changes pi_exit validation_exit
  target_label="${scan_root_rel:-${scan_root}}"
  section "bug-finding refactor ${loop_label}"
  kv "target" "${target_label}"
  kv "mode" "refactor for visibility + bug discovery"
  prompt="$(printf '%s\n\n%s\n%s\n%s\n%s\n%s\n%s\n%s\n%s\n' \
    "AUTO_FOLDER_REFACTOR_BUGFIND ${loop_label}. Target scope: ${run_root}/${target_label}." \
    "Candidate refactors are exhausted or low. Transition to bug-finding through visibility refactors." \
    "Pick one small complex subsystem under scope and refactor to expose hidden assumptions, not to optimize." \
    "Keep edits inside the named subsystem you choose; do not drift into unrelated folders after naming the seam." \
    "Do not edit runtime/generated artifacts such as logs, jsonl decision dumps, coverage, build, dist, or cache files; if a test writes them, isolate or clean them." \
    "Prefer extracting pure functions, shared contracts/value types, explicit candidate/data-flow steps, replayable failure tests, and invariants/assertions." \
    "Look for duplicated logic drift, hidden state/order dependence, magic constants, inconsistent validation, dead branches, dropped/truncated candidates, stale data/provenance ambiguity, or unreplayable failures." \
    "When a bug is exposed, add or update a focused regression/characterization test before fixing it." \
    "Keep compatibility and public behavior unless a regression test proves existing behavior is wrong." \
    "Validate with the smallest relevant test command plus broader tests only when needed. Stop if no safe visibility refactor or bug-finding slice is available." \
    "Report changed contracts/helpers, bug found or ruled out, tests added, validation receipts, and next likely bug-finding seam.")"
  pre_slice_status="$(git_scope_status)"
  before_repo_status="$(git_repo_status_paths)"
  preexisting_outside_scope="$(changes_outside_run_root)"
  if [[ -n "${preexisting_outside_scope}" ]]; then
    if [[ "${PI_AUTO_FOLDER_REFACTOR_BLOCK_OUTSIDE_DIRTY:-0}" == "1" ]]; then
      error "pre-existing changes outside pwd scope ${run_root}; refusing bug-finding refactor because PI_AUTO_FOLDER_REFACTOR_BLOCK_OUTSIDE_DIRTY=1"
      printf '%s\n' "${preexisting_outside_scope}" >&2
      return 1
    fi
    warn "pre-existing changes outside pwd scope ${run_root}; leaving them alone and continuing"
    printf '%s\n' "${preexisting_outside_scope}" >&2
  fi
  before="$(snapshot_scope)"
  set +e
  run_pi_prompt "${prompt}"
  pi_exit=$?
  set -e
  revert_artifact_churn "bugfind-${loop_label//\//-}"
  outside_scope_changes="$(new_changes_outside_run_root "${before_repo_status}")"
  if [[ -n "${outside_scope_changes}" ]]; then
    error "bug-finding changed files outside pwd scope ${run_root}"
    printf '%s\n' "${outside_scope_changes}" >&2
    if ! rollback_repo_paths "${outside_scope_changes}"; then
      return 1
    fi
    rollback_scope_changes "bug-finding changed files outside pwd scope" "."
    return 1
  fi
  if ! assert_changes_within_candidate "${target_label}"; then
    rollback_scope_changes "bug-finding changed files outside target ${target_label}" "."
    return 1
  fi
  after="$(snapshot_scope)"
  if [[ "${before}" == "${after}" ]]; then
    warn "bug-finding slice made no non-artifact file changes; stopping"
    return 1
  fi
  if [[ "${pi_exit}" != "0" ]]; then
    rollback_failed_slice "bug-finding pi exited with status ${pi_exit}" "${target_label}" "${pre_slice_status}"
    return 1
  fi
  set +e
  run_candidate_validation "${target_label}"
  validation_exit=$?
  set -e
  if [[ "${validation_exit}" != "0" ]]; then
    rollback_failed_slice "bug-finding validation failed with status ${validation_exit}" "${target_label}" "${pre_slice_status}"
    return 1
  fi
  deliver_scope_changes "bugfind-${loop_label//\//-}" "${target_label}"
}
