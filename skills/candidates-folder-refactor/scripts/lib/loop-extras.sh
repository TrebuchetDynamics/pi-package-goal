#!/usr/bin/env bash
# Loop extras for auto-folder-refactor (bug-finding slice)
# Provides: run_bug_finding_slice

run_bug_finding_slice() {
  local loop_label=$1 target_label before after prompt
  target_label="${scan_root}"
  section "bug-finding refactor ${loop_label}"
  kv "target" "${target_label}"
  kv "mode" "refactor for visibility + bug discovery"
  prompt="$(printf '%s\n\n%s\n%s\n%s\n%s\n%s\n%s\n%s\n%s\n' \
    "AUTO_FOLDER_REFACTOR_BUGFIND ${loop_label}. Target scope: ${run_root}/${target_label}." \
    "Candidate refactors are exhausted or low. Transition to bug-finding through visibility refactors." \
    "Pick one small complex subsystem under scope and refactor to expose hidden assumptions, not to optimize." \
    "Prefer extracting pure functions, shared contracts/value types, explicit candidate/data-flow steps, replayable failure tests, and invariants/assertions." \
    "Look for duplicated logic drift, hidden state/order dependence, magic constants, inconsistent validation, dead branches, dropped/truncated candidates, stale data/provenance ambiguity, or unreplayable failures." \
    "When a bug is exposed, add or update a focused regression/characterization test before fixing it." \
    "Keep compatibility and public behavior unless a regression test proves existing behavior is wrong." \
    "Validate with the smallest relevant test command plus broader tests only when needed. Stop if no safe visibility refactor or bug-finding slice is available." \
    "Report changed contracts/helpers, bug found or ruled out, tests added, validation receipts, and next likely bug-finding seam.")"
  before="$(snapshot_scope)"
  run_pi_prompt "${prompt}" || true
  after="$(snapshot_scope)"
  if [[ "${before}" == "${after}" ]]; then
    warn "bug-finding slice made no file changes; stopping"
    return 1
  fi
  run_candidate_validation "${target_label}"
  deliver_scope_changes "bugfind-${loop_label//\//-}"
}
