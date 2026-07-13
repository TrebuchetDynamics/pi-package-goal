# Goal Technical Auditor Autonomous Controller — Design

Date: 2026-07-13
Status: Approved for planning

## Background

`extensions/goal-technical-auditor/` currently registers a convenience command that
parses a scope and token budget, builds a large audit-and-improvement objective, and
forwards that objective to the separate `/goal` extension. The generated objective asks
the model to run Technical Auditor Full mode, implement safe recommendations, validate
each slice, re-audit, and continue until the work is complete or blocked.

This prompt-driven design is compact, but the extension does not know which audit phase
is active, which findings remain, whether claimed validation actually ran, which commit
contains a fix, or whether the final push succeeded. Those facts live mainly in model
context and can be lost or distorted after long runs, compaction, interruption, or
restart. Completion therefore depends too heavily on the model remembering and obeying
a long prompt.

The approved direction is a thin deterministic controller around the existing `/goal`
worker. The model continues choosing and implementing changes. The controller owns
phase transitions, durable bookkeeping, validation gates, Git checkpoints, recovery,
completion eligibility, and final delivery.

## Goals

- Make long technical-audit improvement runs recoverable and reliably autonomous.
- Track every finding, validation receipt, failure, stash, commit, and audit pass.
- Execute one finding at a time and commit every validated slice on the current branch.
- Include pre-existing worktree changes in a clearly labelled baseline checkpoint.
- Preserve failed work without leaving the branch in a broken state.
- Re-audit until no new safe actionable findings remain.
- Prevent `/goal` from completing before deterministic completion gates pass.
- Push once after final verification, with confirmation on protected/default branches.
- Keep the existing `/goal` engine and Technical Auditor skill rather than replacing
  either one.

## Non-goals

- No parallel agents, subagent scheduler, or replacement orchestration framework.
- No Git worktrees, branch creation, merge automation, force-push, rebase, or history
  rewriting.
- No deployment, package publication, release creation, or unrelated external actions.
- No new runtime dependency.
- No live model calls or real network pushes in automated tests.
- No guarantee that heuristic secret detection can replace dedicated repository secret
  scanning or remote protection.

## User decisions

- Reliability is more important than speed.
- The controller may make aggressive reversible changes when tests provide evidence.
- All commits must occur on the branch that was current when the run started.
- Existing dirty worktree changes are included in controller-created commits.
- Failed slices are restored to the last green state and independent findings continue.
- A Markdown audit ledger is committed to the repository.
- Delivery is one final push rather than a push after every slice.
- `main`, `master`, and the remote default branch require confirmation before pushing.

## Architecture

Keep `/goal` as the continuous worker and add one small controller module:

```text
/goal-technical-auditor
        |
        v
command adapter -> persisted run controller -> /goal objective
                         ^                       |
                         |                       v
                  checkpoint tool <- audit / implementation work
                         |
                         v
             ledger -> validation -> commit -> next slice
```

### `extensions/goal-technical-auditor/index.js`

The Pi adapter remains the extension entry point. It will:

- register `/goal-technical-auditor` and its status, resume, and abort actions;
- register one `technical_auditor_checkpoint` tool;
- activate that tool only while an auditor run is active;
- restore the latest run state during `session_start`;
- intercept `goal_complete` tool calls and block them until the run is eligible;
- send the next stage instruction to `/goal` immediately or as a follow-up when busy.

The adapter contains no audit policy or Git implementation beyond wiring Pi events and
contexts to pure controller operations.

### `extensions/goal-technical-auditor/lib/command.js`

The existing command module continues to own:

- shell-like argument parsing;
- scope versus natural-language prompt interpretation;
- token budget, focus, help, and dry-run options;
- scope containment and existence checks;
- construction of the initial `/goal` objective.

It gains parsing for the unambiguous `status`, `resume`, and `abort` actions. Existing
launch syntax and completion values remain compatible.

### `extensions/goal-technical-auditor/lib/run.js`

One new module owns:

- the run and finding data shapes;
- allowed phase transitions;
- checkpoint action validation;
- deterministic Markdown ledger rendering;
- validation command execution;
- Git status, commit, stash, restore, branch, remote, and push operations;
- resume drift checks and completion eligibility.

This is one module rather than separate state-machine, ledger, validation, and Git
abstractions. Those seams can be extracted later only if the implementation becomes
hard to understand or test.

### Persistence

Machine state is appended to the Pi session as custom entries after every accepted
transition. State is reconstructed from the active session branch, matching Pi's
branch-aware persistence model.

The committed Markdown ledger is a human-readable projection, not a second independently
editable source of truth. It lives at:

```text
docs/audits/<scope-slug>-<YYYY-MM-DD>-goal-technical-auditor.md
```

The ledger makes run history visible outside Pi and records the session state needed for
manual recovery. Automatic resume still requires the matching Pi session entry; a ledger
alone is not treated as sufficient machine state.

## Run state

A run records at least:

- schema version and run ID;
- original objective, scope, focus, and token budget;
- repository root, original branch, upstream, and ledger path;
- phase, pause/block reason, audit pass number, and timestamps;
- baseline commit, latest green commit, and slice-start commit;
- focused and project-wide validation commands;
- findings, validation receipts, stash references, and created commit IDs;
- final verification and push state.

Each finding records:

- stable finding ID, title, severity, evidence, and recommended action;
- status: `pending`, `active`, `fixed`, `deferred`, `blocked`, or `failed`;
- audit pass that discovered it;
- validation commands and results;
- commit or stash reference;
- concrete reason for deferment, blocking, or failure.

A `failed` finding is recoverable bookkeeping, not a successful terminal outcome. The
run cannot complete while a safe actionable finding remains `failed`; it must later be
fixed or explicitly reclassified as deferred/blocked with evidence.

## Phases and transitions

The bounded phase sequence is:

```text
preflight
  -> auditing
  -> implementing <-> validating
  -> re_auditing
  -> final_validation
  -> delivery_pending
  -> ready_to_complete
  -> complete
```

Any phase may move to `paused`, `blocked`, or `aborted`. Resume returns only to the stored
next phase after branch, HEAD, ledger, and worktree drift checks pass.

The controller rejects out-of-order checkpoint actions without mutating files, state, or
Git. It returns the current phase and the one valid next action so the model can recover
without guessing.

## Checkpoint tool

The temporary model-facing tool is named:

```text
technical_auditor_checkpoint
```

Its action enum supports:

- `preflight` — submit discovered validation commands and repository evidence;
- `record_audit` — submit one complete audit pass and its structured findings;
- `begin_finding` — select one pending finding and capture the clean slice base;
- `validate_finding` — run focused and project-wide checks for the active finding;
- `defer_finding` — record a concrete deferment or owner-decision blocker;
- `request_reaudit` — start the next Technical Auditor Full pass;
- `finalize` — request final validation and delivery.

The public schema stays strict. The controller, not free-form prompt text, determines
which action is legal in the current phase.

## Execution flow

### 1. Launch and preflight

The command creates the initial run entry and sends a controller-aware objective to
`/goal`. The objective instructs the agent to inspect repository instructions,
manifests, CI, tests, Git status, and any codebase map, then call the checkpoint tool
with proposed focused and project-wide validation commands.

The controller:

1. verifies the repository root and captures the current branch and upstream;
2. refuses to continue if no branch is checked out;
3. checks pending paths and diff content for common secret-file and credential patterns;
4. runs the submitted baseline validation commands;
5. records baseline failures as Milestone 0 findings rather than hiding them;
6. stages all non-ignored worktree changes and creates a labelled pre-audit checkpoint
   commit when changes exist;
7. writes the initial ledger and advances to `auditing`.

Suspected secrets block the commit and require an owner decision. Existing ignored files
remain ignored. A baseline test failure does not prevent diagnosis, but it prevents final
delivery until resolved.

### 2. Audit pass

The model runs Technical Auditor Full mode without editing production code, then submits
all findings through `record_audit`. The controller validates required evidence fields,
assigns stable IDs, updates the ledger, and commits the audit record before implementation
begins.

If production changes appeared before the audit checkpoint, the controller blocks rather
than silently mixing them into the audit record.

### 3. Finding slices

Only one finding may be active. For each finding:

1. `begin_finding` confirms the branch is clean and captures the latest green commit.
2. `/goal` implements the finding.
3. `validate_finding` runs the submitted focused checks and the stored project-wide
   validation command through the controller.
4. Successful validation marks the finding fixed, updates the ledger, stages all current
   non-ignored changes, and commits them on the original branch.
5. Failed validation returns evidence to `/goal` for up to two repair attempts.
6. After the second failed repair, the controller stashes tracked and untracked slice
   changes, records the stash reference, restores the latest green state, marks the
   finding failed, commits the ledger update, and moves to an independent finding.

Using Git stash keeps failed or concurrently-created work recoverable while satisfying
the requirement to continue from a clean branch. Stashes are never dropped automatically.

### 4. Re-audit

When no pending finding remains, the controller requires another Technical Auditor Full
pass over the same scope. Newly discovered safe findings enter the ledger and repeat the
slice loop. Re-audit continues until one complete pass reports no new safe actionable
findings.

The controller does not accept “no findings” while unresolved `pending`, `active`, or
safe `failed` findings remain in its own state.

### 5. Final verification and delivery

Finalization requires:

1. all findings fixed, or explicitly deferred/blocked with evidence;
2. a clean re-audit pass;
3. focused checks and project-wide validation passing;
4. a clean worktree after committing the final ledger;
5. every recorded run commit reachable from the original current branch.

The controller then resolves the push target:

- use the configured upstream when present;
- with no upstream and exactly one remote, push `HEAD` and establish upstream;
- with no remote or multiple ambiguous remotes, block for an owner decision.

Before pushing `main`, `master`, or the remote default branch, it asks for explicit UI
confirmation. In non-interactive mode it blocks instead of assuming consent. Other
branches push once without another prompt. A push failure leaves the run at
`delivery_pending` and resumable.

Only a successful permitted push advances to `ready_to_complete`. The next
`goal_complete` call is allowed and changes the controller state to `complete`.

## User controls

```text
/goal-technical-auditor status
/goal-technical-auditor resume
/goal-technical-auditor abort
```

- `status` reports phase, branch, audit pass, finding counts, latest green commit, failed
  stashes, blockers, and the exact next action.
- `resume` reconstructs the latest state and verifies branch, HEAD, ledger, and worktree
  consistency before asking `/goal` to continue.
- `abort` marks the run aborted, pauses its associated `/goal`, and preserves commits,
  ledger, and stashes.

Token-budget exhaustion leaves controller state intact and pauses substantive work. The
user must increase the `/goal` budget before resume; the controller never silently spends
beyond the configured budget.

## Error handling and safety

- Invalid checkpoint action: reject without side effects and report the valid next action.
- Validation failure: provide command, exit code, and bounded output; permit two repairs.
- Unrepairable slice: stash recoverably, restore latest green commit, continue independent
  work, and prevent final completion while the safe finding remains failed.
- Branch/HEAD/worktree drift: pause and require reconciliation; never reset unknown work.
- Suspected secret: block commit and push with redacted evidence.
- Missing or ambiguous remote: block before delivery.
- Protected/default branch in non-interactive mode: block before push.
- Push rejection or network failure: retain local commits and resume at delivery.
- Reload or session restart: reconstruct from custom entries and keep the checkpoint tool
  active only when the restored run is active.
- Output from validation and Git commands follows Pi's normal truncation limits.

The controller never force-pushes, rewrites history, merges, deploys, publishes, or drops
recovery stashes.

## Ledger format

The Markdown ledger contains:

1. run metadata and current status;
2. repository, branch, scope, objective, and validation commands;
3. baseline state and pre-audit checkpoint;
4. findings table with status, severity, evidence, validation, and commit/stash;
5. chronological audit-pass history;
6. validation receipts with command and exit status;
7. deferments, blockers, and owner decisions;
8. final completion checklist and delivery target.

Rendering is deterministic so tests can compare exact output and repeated writes do not
create noisy formatting changes.

## Testing

### Pure controller tests

Add focused tests for:

- every allowed and rejected phase transition;
- finding status changes and completion eligibility;
- two-attempt validation failure behavior;
- re-audit requirements;
- deterministic ledger rendering;
- protected/default branch detection and push-target resolution;
- secret-risk redaction and blocking.

### Extension integration tests

Extend the existing extension test style to cover:

- launch, dry-run, status, resume, and abort;
- restoration from session entries;
- checkpoint tool activation only during active runs;
- immediate versus follow-up `/goal` delivery;
- premature `goal_complete` blocking;
- token exhaustion and resumable delivery failures.

### Temporary Git repository tests

Use Node's standard library and temporary repositories to verify:

- dirty existing changes become a baseline checkpoint on the current branch;
- successful slices validate and commit all non-ignored changes;
- failed slices are stashed and the latest green state is restored;
- drift is detected without destructive reset;
- final delivery pushes to a local bare remote;
- protected/default branches require confirmation;
- no test contacts a real remote.

Run the focused extension tests and the repository's required `npm test` before
completion.

## Acceptance criteria

The implementation is accepted when:

- existing launch syntax remains compatible;
- state survives reload/resume through session entries;
- every finding and audit pass appears in the committed Markdown ledger;
- each successful slice has passing focused and project-wide validation plus a commit on
  the original branch;
- failed changes remain recoverable by recorded stash reference;
- no `pending`, `active`, or safe `failed` finding can pass completion;
- a final re-audit reports no new safe actionable findings;
- final validation passes and the worktree is clean;
- protected/default branch pushes require confirmation;
- one successful final push occurs before `/goal` completion;
- tests use only temporary local repositories and local bare remotes;
- `npm test` passes.

## Implementation boundary

Implementation should preserve the package's current three-part shape: a thin Pi adapter,
command helpers, and one controller module with focused tests. Do not split additional
modules, introduce configuration files, or add dependencies unless the implementation
proves the single controller module has become an actual maintenance problem.
