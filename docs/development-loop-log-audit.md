# Development Loop Log Audit and Mega Improvement Plan

Date: 2026-05-21

## Scope

Source logs inspected:

- `/home/xel/git/sages-openclaw/workspace-mineru/gormes-agent/.pi/development-loop/logs.jsonl`
- `/home/xel/git/sages-openclaw/workspace-mineru/gormes-agent/.pi/gormes-loop/logs.jsonl`
- `/home/xel/git/sages-openclaw/workspace-mineru/navivox-app/.pi/development-loop/logs.jsonl`
- `/home/xel/git/sages-openclaw/workspace-mineru/navivox-app/.pi/navivox-loop/logs.jsonl`
- `/home/xel/git/sages-openclaw/workspace-yunobo/polymarket-mega-bot/.pi/development-loop/logs.jsonl`
- `/home/xel/git/sages-openclaw/workspace-yunobo/polymarket-mega-bot/.pi/megabot-loop/logs.jsonl`

Local Pi sources checked:

- Pi package docs: `docs/packages.md`
- Pi extension docs: `docs/extensions.md`
- Pi extension examples: `status-line.ts`, `send-user-message.ts`, `custom-compaction.ts`, `dirty-repo-guard.ts`
- Awesome Pi index candidates: `ralph-wiggum`, `pi-powerline-footer`, `usage-extension`, checkpoint-style packages

Decision: build locally, adapt patterns only. None of the checked packages replace this repo's loop-specific ledger, validation, and prompt orchestration needs.

## Aggregate findings

| Log | Records | Starts | Finished | Blocked | Unresolved starts | Compaction events | Empty responses | Max topic length |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gormes generic | 54 | 7 | 4 | 3 | 0 | 12 | 1 | 10,456 |
| Gormes custom | 44 | 5 | 0 | 0 | 5 | 0 | 0 | 104 |
| Navivox generic | 65 | 5 | 4 | 0 | 1 | 15 | 2 | 5,090 |
| Navivox custom | 24 | 5 | 1 | 3 | 1 | 0 | 0 | 5,277 |
| MegaBot generic | 30 | 5 | 1 | 3 | 1 | 0 | 0 | 2,986 |
| MegaBot custom | 34 | 6 | 0 | 0 | 6 | 0 | 0 | 46 |

## Problems observed

1. **Final marker failures are the most direct hard blocker.**
   - Gormes generic blocked three runs with `missing DEV_LOOP_DECISION final marker`.
   - MegaBot generic blocked three runs with `missing DEV_LOOP_DECISION final marker`.
   - Navivox custom blocked two runs with `assistant_decision_missing`.

2. **Objective text is too often the whole pasted implementation context.**
   - Gormes generic repeated a 10,456-character browser dump.
   - Navivox custom repeated a 5,277-character multi-repo feature prompt.
   - Navivox generic repeated a 5,090-character copied prompt.
   - MegaBot generic blocked on a 2,986-character steering paste.

3. **Compaction pressure is high in successful generic runs.**
   - Gormes generic had 12 compaction-related events across 54 records.
   - Navivox generic had 15 compaction-related events across 65 records, plus two empty provider responses.
   - Successful long runs survive, but they spend many events preserving state instead of reducing prompt mass.

4. **Log schema fragmentation hides real loop health.**
   - Generic logs use `at`, `loop_started`, `loop_finished`, `loop_blocked`, `phase`, and `adapterName`.
   - Navivox custom logs use `timestamp`, `loop_start`, `done`, `blocked`, and `ciGreen`.
   - Gormes and MegaBot custom logs record `assistant_decision`, `self_improvement_queued`, commits, validation arrays, and blockers, but often no terminal event.
   - Current `analyze-logs` only understands the generic schema well.

5. **Run lifecycle is ambiguous without a run id.**
   - Custom loops have multiple unresolved `loop_started` records because a new start is not tied to an explicit terminal record.
   - Navivox generic has duplicate `iteration_result` records for the same iteration in older runs.
   - MegaBot generic has one run with queued iteration 3 but no terminal record.

6. **Delivery evidence lives in assistant prose, not in a reliable ledger.**
   - Generic logs usually do not record changed files, validation commands, commit hashes, or push status.
   - Custom Gormes logs include commits and validations, which is useful, but the schema is local-only.
   - External repos were dirty while being inspected, which reinforces the need for explicit owned-vs-unrelated dirty-state evidence.

7. **Repo-local custom loops contain good ideas that the package should absorb.**
   - CI-green gates in custom loops catch invalid `continue` or `done` decisions.
   - Self-improvement follow-ups are queued after blocked runs.
   - Active-start policies avoid replacing active loop state by accident.
   - These are currently duplicated across repo-local implementations instead of living behind one deep package interface.

## Mega improvements

### 1. Deepen the loop ledger module

Create one ledger interface that normalizes generic and legacy loop records. It should understand `at` and `timestamp`, `loop_started` and `loop_start`, terminal aliases, decision fields, CI gates, validation arrays, commit hashes, push results, and topic metadata.

Benefits:

- Locality: all schema compatibility lives in one module.
- Leverage: `analyze-logs`, status, dashboards, and recovery logic use the same run model.
- Test surface: fixtures can encode real Gormes/Navivox/MegaBot log shapes.

### 2. Replace tail-regex markers with a typed evidence report seam

Add a structured report path, either a `development_loop_report` tool with a strict schema or a dedicated final-message parser that can safely recover typed evidence from prose once. The report should include decision, validation status, blocker, changed files, commands run, commit hash, and push status.

Benefits:

- Fewer false blocks from missing marker lines.
- More reliable validation evidence before `continue` or `done`.
- A better interface than forcing every agent to remember exact tail text.

### 3. Add objective intake and slicing

Before a loop starts, classify the objective as short task, vague task, or pasted context. Oversized pasted context should be summarized once, hashed, and stored as diagnostic context while the prompt repeats only the compact objective and next slice.

Benefits:

- Prompt and log mass stop scaling with copied context size.
- Compaction pressure drops.
- The agent sees a clearer one-slice objective.

### 4. Add marker-recovery and postmortem retry policy

For non-empty assistant responses missing final markers, queue exactly one follow-up asking for only the required report. If that also fails, block and record the first failing reason. For blocked runs, write a postmortem record that includes likely cause, last iteration, and next safe action.

Benefits:

- Recovers productive work that ended with a formatting miss.
- Avoids infinite retry loops.
- Makes future `analyze-logs` output actionable.

### 5. Promote CI and delivery gates from prose into package behavior

Absorb the custom-loop CI-green gate and delivery evidence. When commit/push is enabled, the loop should log dirty state before and after, files staged, validation commands, commit hash, and push result. It should never infer safety from assistant prose alone.

Benefits:

- Locality: delivery invariants live in code.
- Leverage: every adapter gets the same safety behavior.
- Auditability: logs explain why a run continued, blocked, or pushed.

### 6. Build multi-log analysis and an HTML health report

Extend `/development-loop analyze-logs` to accept directories or globs, discover `.pi/**/logs.jsonl`, normalize legacy schemas, and output an aggregate table plus severity-ranked recommendations. Keep the text report for terminals and add an optional self-contained HTML report for visual review.

Benefits:

- One command can analyze the exact multi-repo usage pattern in this audit.
- Legacy custom-loop lessons become visible.
- Improvements can be tracked by metric, not anecdote.

## Suggested six-iteration execution sequence

1. Land this source-backed audit and plan.
2. Add a tested normalized log-ledger parser with fixtures for generic and custom records.
3. Teach `analyze-logs` to accept directories and aggregate multiple loop logs.
4. Add one-shot marker recovery for missing final markers.
5. Add objective intake summarization and repeated-topic deduplication.
6. Add structured delivery evidence logging and the optional HTML health report.

## Top recommendation

Start with the loop ledger module. It is the deepest seam: every other improvement depends on a reliable run model, and every later metric becomes easier to test once logs from generic and custom loops share one interface.
