# pi-package-development-loop

A Pi package that bundles reusable development-loop and E2E-loop extensions with a curated set of high-signal engineering, Pi ecosystem, and modern web skills.

## Quick start

### Step 1: Install the Pi agent

Install Pi from [pi.dev](https://pi.dev), then confirm the `pi` command works:

```bash
pi --version
```

### Step 2: Install this package

Global install:

```bash
pi install git:github.com/TrebuchetDynamics/pi-package-development-loop
```

Project-local install, for a team repo:

```bash
pi install -l git:github.com/TrebuchetDynamics/pi-package-development-loop
```

After installing or updating, run this inside Pi:

```text
/reload
```

### Step 3: Start `/development-loop`

From the project you want to improve:

```text
/development-loop adapters
/development-loop start --iterations=3 improve the README
/development-loop status
```

For real usage and end-to-end test work, start `/e2e-loop` from the app repo:

```text
/e2e-loop start checkout flow and primary user journeys
/e2e-loop start --iterations=3 API contracts and TUI smoke coverage
/e2e-loop status
```

`/e2e-loop` persists status in the Pi session and writes progress logs to `.pi/e2e-loop/logs.jsonl` by default.

Short alias:

```text
/dev-loop status
```

## Update or remove

Refresh the installed package when the repository changes:

```bash
pi update git:github.com/TrebuchetDynamics/pi-package-development-loop
```

Remove it if you no longer want the extension and bundled skills:

```bash
pi remove git:github.com/TrebuchetDynamics/pi-package-development-loop
```

Run `/reload` after either command in an open Pi session.

## Development-loop instructions and tips

`/development-loop` sends the agent a scoped iteration prompt, watches for final markers, logs progress, and queues follow-up iterations until the loop stops.

Useful commands:

```text
/development-loop adapters
/development-loop help
/development-loop init
/development-loop init --force
/development-loop init --yes --dry-run --iterations=5 --push --validation "npm test" --validation "git diff --check" --skill=grill-me release checks
/development-loop init --yes --iterations=5 --push --validation "npm test" --validation "git diff --check" --skill=grill-me release checks
/development-loop start --iterations=3 providers
/development-loop start --iterations=5 --commit --push fix flaky tests
/development-loop status
/development-loop analyze-logs
/development-loop analyze-logs .pi/development-loop/logs.jsonl
/development-loop analyze-logs .pi
/development-loop analyze-logs --html .pi
/development-loop stop
/development-loop restart --iterations=2 tighten docs
```

Tips:

- Start small: `--iterations=1` or `--iterations=3` is usually enough.
- `/development-loop init` opens an interactive setup wizard in the Pi TUI for objective, preferred language, iterations, git delivery, validation, skills, stop conditions, and log path.
- Use `--yes` (`-y` or `--defaults`) for scripted/non-interactive init that accepts generated defaults and any provided flags without prompts.
- Existing `.pi/development-loop.json` files are protected by default; use `--force` only when you intentionally want an atomic replacement.
- Broad objectives inspect repo-local skills plus TODO.md, progress.json, plans, roadmaps, and similar task files.
- Leave `--commit` and `--push` off unless you want the loop to handle git delivery; `--push` implies commit.
- Keep one objective per run; stop and restart when the objective changes.
- `DEV_LOOP_DECISION: continue` starts the next iteration automatically; you should not need to press Enter for queued follow-up text.
- If a non-empty assistant response forgets the final marker lines, the loop sends one marker-only recovery prompt before blocking.
- An active loop saves state before compaction and continues automatically after compaction, including retrying the same iteration after an empty provider-error response.
- If validation is red or credentials are needed, the loop should report `blocked`; blocked runs write a `loop_postmortem` record with `likelyCause` and `nextSafeAction`.
- Progress logs go to `.pi/development-loop/logs.jsonl` by default.
- New loop runs include a `runId` in prompts, saved state, and log records so duplicate starts and terminal records can be correlated during analysis.
- Oversized objectives are capped in prompts and logs; provider context-overflow suffixes are stripped from repeated objective text; logs keep `topicLength`, `topicHash`, `topicKind`, and `topicSanitized` so copied context can be diagnosed without repeating it.
- Final iteration records extract delivery evidence from conventional summaries (`Changed files`, `Validation evidence`, commit/push lines) or a `DEV_LOOP_REPORT: {"validated":true,"decision":"continue",...}` JSON object placed as the final line or immediately before the final marker block into `changedFiles`, `validationCommands`, `commitHash`, and `pushStatus` log fields.
- Run `/development-loop analyze-logs [path]` to summarize one log file or a directory of `logs.jsonl` files, including loop starts, iteration-result records, iteration-result-without-validation records, iteration prompt sent records, prompt/result imbalance, duplicate prompt-sent groups, assistant decision records, queued iteration records with top reason, completion outcomes, finished-without-validation/delivery records, unresolved starts, blocker reasons, postmortem causes/actions, self-improvement follow-ups with top reason/action, final-marker recovery requests/successes/blocks with top request and block reasons, delivery evidence, commit-without-push records, CI-green/CI-red and missing-gate records, empty provider responses/retries with top reason, provider error records with top code/category, context overflows, compaction events/resumes/failures with top failure reason, user steering records, provider-noise and sanitized topic records, topic sizes, repeated oversized topics, and likely improvement areas. Add `--html` to write a self-contained health report to the OS temp directory.

### Troubleshooting provider interruptions

If Pi reports `Error: WebSocket error` and the loop warns that it is waiting after an empty provider response, run `/development-loop status` and inspect `.pi/development-loop/logs.jsonl`. The loop records `empty_agent_response_waiting_for_compaction` when the provider returns no assistant text, then retries the same iteration once or resumes it after compaction instead of advancing to the next iteration.

If the provider reports `context_length_exceeded` or “input exceeds the context window” before final markers are emitted, the loop records `context_overflow_waiting_for_compaction` and keeps the same iteration active so Pi's compaction can resume it instead of blocking on a missing `DEV_LOOP_DECISION` marker.

If an otherwise useful assistant response ends without `DEV_LOOP_VALIDATED` and `DEV_LOOP_DECISION`, the loop records `missing_final_marker_recovery_requested` and asks for exactly those two lines once. A second non-empty response without markers blocks the loop to avoid infinite retries.

### Status bar integration

`/development-loop` publishes a compact powerline-friendly status through the `development-loop` status key, for example `● run · loop 2/3 · generic-git · git:manual · release checks`. If you use [`pi-powerline-footer`](https://github.com/nicobailon/pi-powerline-footer), you can promote it into a dedicated segment:

```json
{
  "powerline": {
    "customItems": [
      {
        "id": "dev-loop",
        "statusKey": "development-loop",
        "position": "secondary",
        "prefix": "loop",
        "color": "accent"
      }
    ]
  }
}
```

### Steer an active loop

When a development loop is active, plain text becomes a steering request for the current or next safe slice. For example, type `focus release checks next` to update the objective without stopping the loop.

Slash commands still run as commands, and prompts sent by the extension are not rewritten.

Each iteration must end with:

```text
DEV_LOOP_VALIDATED: yes|no
DEV_LOOP_DECISION: continue|stop|blocked|done
```

### Project-local configuration for any repo

Create `.pi/development-loop.json` when a repo needs its own default objective, preferred language, skills, validation commands, iteration count, git delivery policy, stop conditions, or log path. The development loop uses the single built-in `generic-git` adapter.

`/development-loop init` accepts the same basic knobs used by `start` plus config-only fields:

- `--topic <text>` or trailing topic text
- `--iterations <n>` / `--max-iterations <n>` / `-n <n>`
- `--commit`, `--no-commit`, `--push`, `--no-push`
- `--validation <command>` or `--test <command>`; repeat for multiple checks
- `--preflight <command>`; repeat for multiple preflight checks
- `--skill <name-or-note>`; repeat for skills such as `greploop`, `grill-me`, `tdd`, or repo-local workflow skills
- `--stop-condition <text>`; repeat for custom blockers
- `--log-path <path>`
- `--dry-run` / `--preview` to preview the generated config without writing files
- `--force` to replace an existing config atomically
- `--yes` / `-y` / `--defaults` to accept generated values without the interactive wizard

Interactive init asks for Preferred language from 20 common languages. Non-interactive init defaults to English. The loop always includes `caveman` and `improve-codebase-architecture` in its skill list, even when custom skills are configured.

Example config:

```json
{
  "adapter": "generic-git",
  "defaultTopic": "improve documentation with tests",
  "language": "English",
  "skills": ["caveman", "improve-codebase-architecture", "tdd", "verification-before-completion"],
  "preflightCommands": ["git status --short --branch"],
  "validationCommands": ["npm test", "git diff --check"],
  "stopConditions": ["validation fails twice with the same blocker"],
  "maxIterations": 3,
  "commit": false,
  "push": false,
  "logPath": ".pi/development-loop/logs.jsonl"
}
```

Run `/development-loop adapters` to confirm the `generic-git` adapter and config Pi will use.

## Included extensions

- `/development-loop` — visible `generic-git` project loop for iterative work in any codebase, with built-in defaults and project-local configuration.
- `/dev-loop` — short alias for the development-loop extension.
- `/e2e-loop` — real-usage E2E test loop that asks the agent to classify the app, build a feature inventory/coverage matrix, and add or run durable coverage: Playwright plus screenshots for web UI, Maestro or platform harnesses plus screenshots for mobile UI, public endpoint contract tests for APIs, and TUI transcript/terminal checks for TUI/CLI apps. It persists loop state and logs progress to `.pi/e2e-loop/logs.jsonl` by default.
- `/e2e` — short alias for the E2E loop extension.

## Included skills

### Development workflow

- `tdd` — red-green-refactor delivery.
- `diagnose` — disciplined bug and performance diagnosis.
- `improve-codebase-architecture` — architecture deepening review.
- `grill-with-docs` — plan interrogation tied to domain docs and ADRs.
- `prototype` — throwaway prototypes for design uncertainty.
- `zoom-out` — source-backed broader codebase understanding.
- `handoff` — continuation handoff for future sessions.
- `lgtm` — treats approvals like “lgtm” or “go ahead” as permission to continue the most recent recommendation.
- `caveman` — ultra-compressed status communication.
- `write-a-skill` — skill authoring guidance.
- `greploop` — Greptile review loop for PR/MR/CL cleanup when review automation, required CLI auth, and git delivery are intentionally enabled.

### Web and browser

- `modern-web-guidance` — Chrome team modern web-platform guidance.
- `chrome-extensions` — Manifest V3 Chrome extension guidance.

### Pi ecosystem

- `pi-ecosystem-scout` — check the Pi ecosystem before reinventing extensions, packages, skills, themes, or tools.

## Development

```bash
npm test
```

The validation script checks:

- Pi package manifest shape, referenced bundle paths, and Pi glob/exclusion entries.
- Pi core imports are peerDependencies with "*".
- Extension load via Pi-bundled `jiti`.
- `/development-loop`, `/dev-loop`, `/e2e-loop`, and `/e2e` command registration.
- E2E smoke coverage for starting and completing one development-loop extension run.
- E2E-loop smoke coverage for prompting feature inventory/coverage-matrix work, Playwright/Maestro screenshot evidence, public endpoint API contracts, TUI transcript coverage, session state, and `.pi/e2e-loop/logs.jsonl` progress logging.
- Skill frontmatter and exact expected bundle contents.
- Markdown relative links outside code-fence templates.
- README quick-start structure.
- Third-party notices, local notice paths, and license copies.

## Attribution

See `THIRD_PARTY_NOTICES.md` and `licenses/`.
