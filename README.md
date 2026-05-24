# pi-package-goal

A Pi package that bundles reusable development-goal and E2E-goal extensions with a curated set of high-signal engineering, Pi ecosystem, and modern web skills.

## Quick start

### Step 1: Install the Pi agent

Install Pi from [pi.dev](https://pi.dev), then confirm the `pi` command works:

```bash
pi --version
```

### Step 2: Install this package

Global install:

```bash
pi install git:github.com/TrebuchetDynamics/pi-package-goal
```

Project-local install, for a team repo:

```bash
pi install -l git:github.com/TrebuchetDynamics/pi-package-goal
```

After installing or updating, run this inside Pi:

```text
/reload
```

Optional context stewardship (can bootstrap projects that have neither `CONTEXT.md` nor `MEMORY.md`):

```text
/context-goal audit
/context-goal apply
```

Optional ship-readiness check:

```text
/ship-goal audit
/ship-goal run
```

### Step 3: Start `/development-goal`

From the project you want to improve:

```text
/development-goal adapters
/development-goal improve the README
/development-goal status
```

For real usage and end-to-end test work, start `/e2e-goal` from the app repo:

```text
/e2e-goal start checkout flow and primary user journeys
/e2e-goal status
```

`/e2e-goal` persists status in the Pi session and writes progress logs to `.pi/e2e-goal/logs.jsonl` by default.

## Update or remove

Refresh the installed package when the repository changes:

```bash
pi update git:github.com/TrebuchetDynamics/pi-package-goal
```

Remove it if you no longer want the extension and bundled skills:

```bash
pi remove git:github.com/TrebuchetDynamics/pi-package-goal
```

Run `/reload` after either command in an open Pi session.

## Development-goal instructions and tips

`/development-goal` sends the agent a scoped iteration prompt, watches for final markers, logs progress, and queues follow-up iterations until the goal is done, blocked, stopped, or paused.

Useful commands:

```text
/development-goal adapters
/development-goal help
/development-goal init
/development-goal init --force
/development-goal init --yes --dry-run --push --validation "npm test" --validation "git diff --check" --skill=grill-me release checks
/development-goal init --yes --push --validation "npm test" --validation "git diff --check" --skill=grill-me release checks
/development-goal providers
/development-goal improve-codebase-architecture
/development-goal grill-me release planning
/development-goal git-commit-push release cleanup
/development-goal --tokens 250K --commit --push fix flaky tests
/development-goal status
/development-goal pause
/development-goal resume
/development-goal analyze-logs
/development-goal analyze-logs .pi/development-goal/logs.jsonl
/development-goal analyze-logs .pi
/development-goal analyze-logs --since=2h .pi
/development-goal analyze-logs --html .pi
/development-goal analyze-logs --json --since=2h .pi
/development-goal stop
/development-goal restart tighten docs
```

Tips:

- Goals continue automatically until the goal is achieved, blocked, paused, or stopped; `--iterations` is only an optional legacy safety cap.
- `/development-goal init` opens an interactive setup wizard in the Pi TUI for objective, preferred language, git delivery, validation, skills, stop conditions, and log path.
- `/development-goal grill-me [seed]` runs a grill-me planning turn in the configured language; when the assistant emits `DEV_GOAL_NEXT_TOPIC: ...`, the extension starts `/development-goal` for that objective automatically.
- Use `--yes` (`-y` or `--defaults`) for scripted/non-interactive init that accepts generated defaults and any provided flags without prompts.
- Existing `.pi/development-goal.json` files are protected by default; use `--force` only when you intentionally want an atomic replacement.
- Broad objectives inspect repo-local skills plus TODO.md, progress.json, plans, roadmaps, and similar task files.
- Leave `--commit` and `--push` off unless you want the goal to handle git delivery; `--push` implies commit.
- Keep one objective per run; stop and restart when the objective changes.
- `DEV_GOAL_DECISION: continue` starts the next iteration automatically; you should not need to press Enter for queued follow-up text.
- Use `/development-goal pause` to pause automatic continuation without clearing goal state; resume continues the current iteration from the saved state.
- Run budget metadata shows elapsed time and current iteration in prompts/status; add `--tokens 250K` or `--budget 1M` to record a soft token budget cue, not a hard timeout.
- The auto-continuation guard pauses runaway goals after 500 prompt sends by default. Set `PI_DEV_GOAL_MAX_AUTO_CONTINUES=50` for a stricter cap, then run `/development-goal resume` to continue from the saved state.
- If a non-empty assistant response forgets the final marker lines, the goal sends one marker-only recovery prompt before blocking.
- An active goal saves state before compaction and continues automatically after compaction, including retrying the same iteration up to twice after empty provider-error responses.
- If validation is red or credentials are needed, the goal should report `blocked`; blocked runs write a `loop_postmortem` record with `likelyCause` and `nextSafeAction`.
- Progress logs go to `.pi/development-goal/logs.jsonl` by default.
- New goal runs include a `runId` in prompts, saved state, and log records so duplicate starts and terminal records can be correlated during analysis.
- Oversized objectives are capped in prompts and logs; provider context-overflow suffixes are stripped from repeated objective text; logs keep `topicLength`, `topicHash`, `topicKind`, and `topicSanitized` so copied context can be diagnosed without repeating it.
- Final iteration records extract delivery evidence from conventional summaries (`Changed files`, `Validation evidence`, commit/push lines) or a `DEV_GOAL_REPORT: {"validated":true,"decision":"continue",...}` JSON object placed as the final line or immediately before the final marker block into `changedFiles`, `validationCommands`, `commitHash`, `pushStatus`, `blockedWork`, and `pivotedWorkCompleted` log fields.
- Human-readable end report text should briefly cover scope, selected slice, what changed and why, validation/commit/push evidence, blocker state, Blocked Work, Pivoted Work Completed, and Possible next steps. Use absolute paths for the scope and human-readable changed-file evidence. Use decision-specific next steps: continue should name the next largest safe useful package; done should list only optional non-goal cleanup, review, PR, or handoff steps; blocked should name concrete unblocking actions or missing prerequisites; and stop should name handoff or cleanup actions. Typed `DEV_GOAL_REPORT` objects may also include structured `summary`, `blockerState`, `blockedWork`, `pivotedWorkCompleted`, and `nextSteps` fields, which are persisted into goal logs and status summaries; blocked typed reports should include `blockerState` plus concrete `blockedWork` and `nextSteps`. Keep the machine-readable DEV_GOAL_REPORT and final markers last so automation can parse them. The report quality validator flags missing Blocked Work, missing Pivoted Work Completed, done reports with actionable goal next steps, relative human-readable changed files, and vague `DEV_GOAL_REPORT.changedFiles` entries. A malformed final report gets one informational repair-only retry with exact issue codes and code-specific repair guidance, then blocks as `malformed_final_report`; repair retries forbid code edits, scope changes, new task discovery, and validation reruns.
- Completion audit before `DEV_GOAL_DECISION: done`: restate the objective as concrete deliverables, map every explicit requirement to evidence from files, command output, tests, git state, logs, or external docs inspected, and list missing or weakly verified requirements. If anything is missing, weakly verified, or uncertain, report `continue` or `blocked` instead of `done`.
- Run `/development-goal analyze-logs [path]` to summarize one log file or a directory of `logs.jsonl` files, including goal starts, iteration-result records, iteration-result-without-validation records, iteration prompt sent records, prompt/result imbalance with top source, duplicate prompt-sent groups, assistant decision records, queued iteration records with top source/reason, completion outcomes, finished-without-validation/delivery records, unresolved starts with top source, blocker reasons, blocker-kind counts such as `git_push_fetch_first` and `validation_failed_twice`, and top blocked log source, postmortem causes/actions, self-improvement follow-ups with top source/reason/action, final-marker recovery requests/successes/blocks with top request source/reason and block source/reason, delivery evidence, report summary, blocker-state, blocked-work, pivoted-work, next-step, missing-next-steps, and report quality warning counts, commit-without-push records with top source, CI-green/CI-red with top red source and missing-gate records with top source, empty provider responses/retries with top source/reason, provider error records with top source/code/category, context overflows, compaction events/resumes/failures with top source, premature-compaction records, and top failure reason, user steering records, provider-noise and sanitized topic records, topic sizes, repeated oversized topics, and likely improvement areas. Add `--since=2h` to include only recent timestamped records, `--html` to write a self-contained health report to the OS temp directory, or `--json` to emit the same analysis as machine-readable JSON for automation.

### GoalBuddy-inspired controls

Borrowed behavior patterns from `tolibear/goalbuddy` now exist in `/development-goal` as Pi-native goal controls:

- a goal oracle before `DEV_GOAL_DECISION: done`, so the goal maps requirements to evidence before final completion;
- a local work surface made of repo instructions, skills, git state, logs, and validation receipts;
- an invariant prompt path: Intent -> Oracle -> Surface -> Work package -> Proof;
- runaway auto-continuation guard via `PI_DEV_GOAL_MAX_AUTO_CONTINUES`, pausing instead of continuing forever.

No GoalBuddy code is copied; this package adapts prompt/control patterns only.

Canonical final-report template:

```text
Scope: /absolute/project/path with adapter generic-git.
Selected slice: one largest safe useful package.
Changed files: /absolute/project/path/src/file.ts — what changed and why.
Validation evidence: npm test (pass); git diff --check (pass).
Commit/push evidence: abc1234 pushed | not attempted because <reason>.
Blocker state: none | <specific missing prerequisite or unsafe condition>.
Blocked Work: none | <work not completed because of blocker>.
Pivoted Work Completed: none | <safe alternate work completed while blocked>.
Possible next steps: next safe action matched to the decision.
DEV_GOAL_REPORT: {"validated":true,"decision":"continue","summary":"brief result","blockerState":"why blocked","blockedWork":"none","pivotedWorkCompleted":"none","nextSteps":["next safe step"],"changedFiles":["/absolute/project/path/src/file.ts"],"validationCommands":["npm test","git diff --check"],"commitHash":"abc1234","pushStatus":"pushed"}
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done
```

Report quality validator flags missing Blocked Work, missing Pivoted Work Completed, done reports with actionable goal next steps, relative human-readable changed files, and vague DEV_GOAL_REPORT.changedFiles entries. A Final Report Gate logs compact state transitions with aggregate issue codes, gives malformed reports one informational repair-only retry with exact issue codes and code-specific repair guidance, then blocks as `malformed_final_report` if still invalid.

Decision guide for final markers:

| Decision | Use when | Report emphasis |
| --- | --- | --- |
| continue: use when validation passed and the full goal is not proven complete yet | The package is validated and safe; more work remains in the same objective. | Name the next largest safe useful package. |
| blocked: use when validation is red, required evidence is missing, or delivery is unsafe | Tests failed, credentials are missing, required validation was skipped, or commit/push would include unsafe work. | Name the blocker state and concrete unblock actions. |
| stop: use for clean handoff or review before more automation | The user should review, hand off, or restart with a different objective. | Name handoff state and safe resume actions. |
| done: use when the objective is complete, the goal oracle is satisfied, and no follow-up goal work remains | Final requested work is validated, delivered when policy allows, and has no remaining goal slice. | Summarize completion evidence and only optional non-goal cleanup, review, PR, or handoff steps. |

Completion audit before `DEV_GOAL_DECISION: done`:

- Restate the objective as concrete deliverables and success criteria.
- Map every explicit requirement to evidence from files, command output, tests, git state, logs, or external docs inspected.
- Identify missing, incomplete, weakly verified, or uncovered requirements.
- If anything is missing, weakly verified, or uncertain, report `continue` or `blocked` instead of `done`.

End report quality checklist:

- Scope and slice: exact absolute project path, adapter, and selected slice.
- Paths: use absolute paths for scope and human-readable changed-file evidence.
- Blocked Work and Pivoted Work Completed: include both sections; write `none` when no blocker or pivot exists.
- Changes: exact files plus what changed and why.
- Validation: each command with pass, fail, or not-run reason.
- Delivery: commit hash and push status, or why delivery was skipped.
- Blocker state: none, or the specific missing prerequisite or unsafe condition.
- Next step: one concrete action matched to continue, blocked, stop, or done.

End report anti-patterns to avoid:

- Do not write vague summaries like "fixed stuff" or "all good".
- Do not claim tests pass without naming the exact commands and outcomes.
- Do not choose continue when validation is red or required evidence is missing.
- Do not omit why commit or push was skipped.

### Troubleshooting provider interruptions

If Pi reports `Error: WebSocket error`, the goal treats it as a provider transport interruption, records `provider_transport_error_waiting_for_retry`, and retries the same iteration instead of asking for final-marker-only recovery. If the provider returns no assistant text, the goal records `empty_agent_response_waiting_for_compaction`, then retries the same iteration up to twice or resumes it after compaction instead of advancing to the next iteration.

If the provider reports `context_length_exceeded` or “input exceeds the context window” before final markers are emitted, the goal records `context_overflow_waiting_for_compaction` and keeps the same goal iteration active so Pi's compaction can resume it instead of blocking on a missing `DEV_GOAL_DECISION` marker.

If an otherwise useful assistant response ends without `DEV_GOAL_VALIDATED` and `DEV_GOAL_DECISION`, the goal records `missing_final_marker_recovery_requested` and asks for exactly those two lines once. This recovery notice is informational, not a warning. A second non-empty response without markers blocks the goal to avoid infinite retries.

For workspace-wide `.pi` goal triage from a checkout, run `node skills/diagnose/scripts/pi-log-audit.mjs --since=2h /home/xel/git` or add `--attention-only` to show only recent logs/configs that need action without stale goal or completed-goal config hygiene noise; the summary reports `attention_logs=` separately from status buckets and config-only `issues=` so blocked logs are not confused with generic `needs_attention` status, plus `blocker_kind_records=` and `top_blocker_kind=kind:count` for common actionable blockers. Blocked reports surface logged `blockerState`, known `blocker_kind=` classifiers such as `git_push_fetch_first` and `validation_failed_twice`, and first `nextSteps` entry as `blocker=` / `next_action=` when available, with blocker-kind fallback actions for common push-divergence and repeated-validation blockers. When a goal uses push delivery, the iteration prompt tells agents to inspect `git status --short --branch` before pushing and to block with `git_push_fetch_first` evidence instead of force-pushing or repairing history without explicit approval.

### Troubleshooting local Codex storage failures

If Codex fails before Pi starts with `No space left on device`, `database or disk is full`, or a damaged `~/.codex/state_*.sqlite` message, fix local disk pressure first. This is local Codex state, not a development-goal log failure.

Likely causes include a full home filesystem, inode exhaustion can also cause `No space left on device`, Codex being unable to create PATH wrapper files under `~/.codex/tmp`, and SQLite cannot extend the state database or write its WAL/SHM sidecars while disk space is exhausted.

Check free space, inode usage, the largest Codex paths, and top-level `$HOME` usage if Codex is not the biggest consumer:

```bash
df -h "$HOME"
df -ih "$HOME"
du -sh ~/.codex/* 2>/dev/null | sort -h
du -x -h -d 1 "$HOME" 2>/dev/null | sort -h | tail -20
```

From this package checkout, you can preview the bundled safe cleanup helper before it changes anything:

```bash
bash skills/diagnose/scripts/codex-storage-cleanup.sh --dry-run
bash skills/diagnose/scripts/codex-storage-cleanup.sh --execute
```

The helper defaults to a dry run; `--dry-run` makes the preview explicit. Dry-run output prints free space, inode usage, Codex path sizes, and top-level `$HOME` usage when `~/.codex` is under `$HOME`, then shows the cleanup it would perform. With `--execute`, it removes only transient Codex temp files, moves `state_*.sqlite*` files into a unique timestamped backup directory, and prints a post-cleanup disk report. If you only want to clear temp files and leave `state_*.sqlite*` untouched, run `bash skills/diagnose/scripts/codex-storage-cleanup.sh --execute --tmp-only`. If you override the target with `--codex-dir`, the path must end in `/.codex` so the helper cannot accidentally clean an unrelated directory.

Remove transient Codex temp files manually only if you are not using the helper:

```bash
rm -rf ~/.codex/tmp
```

If Codex offers `Repair Codex local data now?`, prefer accepting the repair after free space is available. If you must reset the local state database manually, back it up instead of deleting it outright:

```bash
mkdir -p "$HOME/.codex/backup"
backup_dir="$(mktemp -d "$HOME/.codex/backup/codex-state-$(date +%Y%m%d-%H%M%S).XXXXXX")"
mv ~/.codex/state_*.sqlite* "$backup_dir"/ 2>/dev/null || true
```

Only delete the local state database when you accept losing local Codex session state. The helper requires an explicit acknowledgement for that last-resort path:

```bash
bash skills/diagnose/scripts/codex-storage-cleanup.sh --execute --delete-state --i-understand-local-state-will-be-lost
```

Equivalent manual command:

```bash
rm -f ~/.codex/state_*.sqlite ~/.codex/state_*.sqlite-shm ~/.codex/state_*.sqlite-wal
```

Do not run `rm -rf ~/.codex` unless you intentionally want to remove all local Codex settings, caches, and state.

### Status bar integration

`/development-goal` publishes a compact powerline-friendly status through the `development-goal` status key, for example `● run · i2/∞ · generic-git · git:manual · release checks`. It colors status, iteration, delivery, and context segments when the active Pi theme is available, and terminal `done` statuses omit stale transient reasons such as compaction preparation. Its below-editor widget includes the last report summary, first next step, and count of additional next steps when the latest goal record contains typed `summary` or `nextSteps` evidence. The text status report includes recent report context so follow-up packages and handoff actions remain visible after later log events.

`/e2e-goal` uses the same compact status style through the `e2e-goal` status key, for example `● run · i1/2 · checkout flow`, with themed status, iteration, and objective segments when Pi theme colors are available. Its below-editor widget shows compact last-event context such as `last iteration_prompt_sent · i1 · log .pi/e2e-goal/logs.jsonl`, and `/e2e-goal status` includes the same last-event context plus elapsed/iteration budget context in text form.

If you use [`pi-powerline-footer`](https://github.com/nicobailon/pi-powerline-footer), you can promote goal statuses into dedicated segments:

```json
{
  "powerline": {
    "customItems": [
      {
        "id": "dev-goal",
        "statusKey": "development-goal",
        "position": "secondary",
        "prefix": "goal",
        "color": "accent"
      },
      {
        "id": "e2e-goal",
        "statusKey": "e2e-goal",
        "position": "secondary",
        "prefix": "e2e",
        "color": "warning"
      }
    ]
  }
}
```

### Steer an active goal

When a development goal is active, plain text becomes a steering request for the current or next safe package. For example, type `focus release checks next` to update the objective without stopping the goal.

Slash commands still run as commands, and prompts sent by the extension are not rewritten.

Each iteration must end with:

```text
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done
```

### Project-local configuration for any repo

Create `.pi/development-goal.json` when a repo needs its own default objective, preferred language, skills, validation commands, optional iteration safety cap, git delivery policy, stop conditions, or log path. The development goal uses the single built-in `generic-git` adapter.

`/development-goal init` accepts the same basic knobs used by `start` plus config-only fields:

- `--topic <text>` or trailing topic text
- `--iterations <n>` / `--max-iterations <n>` / `-n <n>` — optional legacy safety cap; omit for continuous goal mode
- `--commit`, `--no-commit`, `--push`, `--no-push`
- `--validation <command>` or `--test <command>`; repeat for multiple checks
- `--preflight <command>`; repeat for multiple preflight checks
- `--skill <name-or-note>`; repeat for skills such as `greploop`, `grill-me`, `tdd`, or repo-local workflow skills
- `--stop-condition <text>`; repeat for custom blockers
- `--log-path <path>`
- `--dry-run` / `--preview` to preview the generated config without writing files
- `--force` to replace an existing config atomically
- `--yes` / `-y` / `--defaults` to accept generated values without the interactive wizard

Interactive init asks for Preferred language from 20 common languages. Non-interactive init defaults to English. The goal always includes `improve-codebase-architecture`, `grill-me`, and `caveman` in its skill list, even when custom skills are configured; startup prompts tell agents to use `improve-codebase-architecture` as a lightweight architecture scout. Do not write /tmp/architecture-review*.html unless a full architecture report is explicitly requested. Startup prompts also tell agents to use `grill-me` in self-answer-first mode so it answers easy/source-backed gaps itself, only asks hard owner-decision or pivot questions, and if no hard question remains, proceeds without interrupting the user. Do not spend time on weak tests; add tests that would fail on the real requirement or defect and exercise public behavior, or name the validation limit instead.

Example config:

```json
{
  "adapter": "generic-git",
  "defaultTopic": "improve documentation with tests",
  "language": "English",
  "skills": ["improve-codebase-architecture", "grill-me", "caveman", "tdd", "write-a-skill"],
  "preflightCommands": ["git status --short --branch"],
  "validationCommands": ["npm test", "git diff --check"],
  "stopConditions": ["validation fails twice with the same blocker"],
  "commit": false,
  "push": false,
  "logPath": ".pi/development-goal/logs.jsonl"
}
```

Run `/development-goal adapters` to confirm the `generic-git` adapter and config Pi will use.

## Included extensions

- `/development-goal` — visible `generic-git` project goal for iterative work in any codebase, with built-in defaults and project-local configuration.
- `/e2e-goal` — real-usage E2E test goal that asks the agent to classify the app, build a feature inventory/coverage matrix, and add or run durable coverage: Playwright plus screenshots for web UI, Maestro or platform harnesses plus screenshots for mobile UI, public endpoint contract tests for APIs, and TUI transcript/terminal checks for TUI/CLI apps. It persists goal state and logs progress to `.pi/e2e-goal/logs.jsonl` by default.
- `/e2e` — short alias for the E2E goal extension.
- `/context-goal` — context stewardship for `CONTEXT.md` and guarded `MEMORY.md`: audits recent goal logs and project files, works when both files are absent, proposes vocabulary/ADR follow-ups, and creates baseline files or applies safe context term additions only after explicit approval or `--yes`.
- `/ship-goal` — shipping-readiness audit for completed work: inspects git state, infers or accepts validation commands, runs validation on request, flags risky files, and reports `SHIP_GOAL_VALIDATED` / `SHIP_GOAL_DECISION` evidence. It does not commit, push, deploy, or publish.

## Included skills

### Development workflow

- `tdd` — red-green-refactor delivery.
- `diagnose` — disciplined bug and performance diagnosis.
- `improve-codebase-architecture` — architecture deepening review; Development Goal startup uses it only as a lightweight architecture scout unless a full report is explicitly requested.
- `grill-me` — self-answer-first plan-gap interrogation; Development Goal startup uses it to answer easy/source-backed gaps itself and only ask hard owner-decision or pivot questions.
- `grill-with-docs` — plan interrogation tied to domain docs and ADRs.
- `prototype` — throwaway prototypes for design uncertainty.
- `zoom-out` — source-backed broader codebase understanding.
- `to-prd` — turn current conversation context into a PRD.
- `to-issues` — break plans/specs into independently grabbable implementation issues.
- `triage` — issue intake and issue workflow state management.
- `writing-shape` — shape notes, fragments, or rough drafts into publishable docs/articles.
- `handoff` — continuation handoff for future sessions.
- `lgtm` — treats approvals like “lgtm” or “go ahead” as permission to continue the most recent recommendation.
- `caveman` — ultra-compressed status communication.
- `write-a-skill` — skill authoring guidance.
- `greploop` — Greptile review goal for PR/MR/CL cleanup when review automation, required CLI auth, and git delivery are intentionally enabled.
- `autoreview` — structured closeout review workflow using an available autoreview helper for Codex/Claude/second-model review.

### Web and browser

- `modern-web-guidance` — Chrome team modern web-platform guidance.
- `chrome-extensions` — Manifest V3 Chrome extension guidance.

### Pi ecosystem

- `pi-ecosystem-scout` — check the Pi ecosystem before reinventing extensions, packages, skills, themes, or tools.
- `pi-extensions-helper` — create, debug, package, and review Pi extensions using current Pi docs and `examples/extensions` patterns.

## Development

```bash
npm test
```

The validation script checks:

- Pi package manifest shape, referenced bundle paths, and Pi glob/exclusion entries.
- Pi core imports are peerDependencies with "*".
- Extension load via Pi-bundled `jiti`.
- `/development-goal`, `/e2e-goal`, `/e2e`, `/context-goal`, and `/ship-goal` command registration.
- E2E smoke coverage for starting and completing one development-goal extension run.
- E2E-goal smoke coverage for prompting feature inventory/coverage-matrix work, Playwright/Maestro screenshot evidence, public endpoint API contracts, TUI transcript coverage, session state, and `.pi/e2e-goal/logs.jsonl` progress logging.
- Skill frontmatter and exact expected bundle contents.
- Markdown relative links outside code-fence templates.
- README quick-start structure.
- Third-party notices, local notice paths, and license copies.

## Attribution

See `THIRD_PARTY_NOTICES.md` and `licenses/`.
