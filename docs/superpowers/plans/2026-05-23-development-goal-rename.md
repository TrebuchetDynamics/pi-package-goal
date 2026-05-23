# Development Goal Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public `/development-goal` workflow, package, repo, and local checkout identity with `development-goal`, remove iteration caps, and add an intake phase that grills/brainstorms only real decision gaps before implementation.

**Architecture:** Keep the existing extension internals and adapter seams, but hard-rename every public command, persisted path, state key, UI key, prompt marker, package metadata URL, and README surface to development-goal. Replace user-facing iteration state with an internal `turnCount`; `continue` schedules another turn until `done`, `blocked`, or `stop`. Add a first-turn intake prompt that inspects repo context, asks only decision-blocking questions, and advances to implementation with `DEV_GOAL_DECISION: continue` when no real gaps remain. Treat the GitHub repository and local checkout folder rename as delivery steps that require a clean working tree and repository-owner permission for the remote rename.

**Tech Stack:** TypeScript Pi extension modules under `extensions/`, package metadata in `package.json`, docs in `README.md`, validation through `node tests/validate-package.mjs` / `npm test`.

---

## File structure

- Modify `package.json`: rename package to `pi-package-goal`, update repository/homepage/bugs URLs to `TrebuchetDynamics/pi-package-goal`, and point Pi package at `./extensions/development-goal.ts`.
- Rename `extensions/development-goal.ts` to `extensions/development-goal.ts`: main extension entry point and command registration.
- Modify `extensions/development-goal-state.ts`: rename persisted constants to development-goal paths/state type; replace iteration defaults with `turnCount` defaults.
- Modify `extensions/development-goal-domain.ts`: replace `iteration`/`maxIterations` run fields with `turnCount`; add `intake` phase.
- Modify `extensions/development-goal-command.ts`: remove iteration options from active parsing; optionally capture unsupported iteration flags so the handler can reject them cleanly.
- Modify `extensions/development-goal-prompts.ts`: emit intake and goal prompts with `DEV_GOAL_*` markers and no iteration cap text.
- Modify `extensions/development-goal-status.ts`: use goal wording, turn count, `development-goal` log paths, and no iteration denominator.
- Modify `extensions/development-goal-logger.ts`: log `turnCount` instead of `iteration`/`maxIterations` for development-goal records.
- Modify parser/report helper modules only where marker names or log fields require it.
- Modify `README.md`: document `/development-goal`, intake phase, no iteration cap, new paths, and `DEV_GOAL_*` markers.
- Modify `tests/validate-package.mjs`: drive every behavior change test-first.

The helper module filenames that still include `development-goal-` are private implementation details. Rename only the public extension entry file in this pass to keep the implementation diff reviewable.

---

### Task 1: Lock the new public contract in failing tests

**Files:**
- Modify: `tests/validate-package.mjs`
- Modify later: `package.json`, `extensions/development-goal.ts`, `README.md`

- [ ] **Step 1: Write the failing package/repo/command assertions**

Add assertions near existing package and command registration checks:

```js
assert.equal(pkg.name, "pi-package-goal");
assert.equal(pkg.repository.url, "git+https://github.com/TrebuchetDynamics/pi-package-goal.git");
assert.equal(pkg.homepage, "https://github.com/TrebuchetDynamics/pi-package-goal#readme");
assert.equal(pkg.bugs.url, "https://github.com/TrebuchetDynamics/pi-package-goal/issues");
assert.ok(pkg.keywords.includes("development-goal"));
assert.equal(pkg.keywords.includes("development-goal"), false);
assert.deepEqual(pkg.pi.extensions, ["./extensions/development-goal.ts", "./extensions/e2e-goal.ts"]);
assert.ok(exists("extensions/development-goal.ts"), "development-goal extension missing");
assert.equal(exists("extensions/development-goal.ts"), false, "old development-goal extension entry should be removed");
```

In the extension registration section, replace command assertions with:

```js
assert.ok(commands.has("development-goal"));
assert.equal(commands.has("development-goal"), false);
assert.equal(commands.has("dev-goal"), false);
const command = commands.get("development-goal");
```

- [ ] **Step 2: Write failing docs assertions**

In `testNoticesAndDocs`, require new names and reject old command/marker names in `README.md`:

```js
assert.match(readme, /\/development-goal start/);
assert.match(readme, /\.pi\/development-goal\/logs\.jsonl/);
assert.match(readme, /\.pi\/development-goal\.json/);
assert.match(readme, /DEV_GOAL_DECISION/);
assert.match(readme, /DEV_GOAL_VALIDATED/);
assert.match(readme, /DEV_GOAL_REPORT/);
assert.doesNotMatch(readme, /\/development-goal/);
assert.doesNotMatch(readme, /\/dev-goal/);
assert.doesNotMatch(readme, /DEV_GOAL_/);
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npm test
```

Expected: FAIL. First failure should be one of:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal
```

or

```text
development-goal extension missing
```

- [ ] **Step 4: Commit no code yet**

Do not commit failing tests alone unless handing off. Continue to Task 2.

---

### Task 2: Rename the public extension entry point and command

**Files:**
- Rename: `extensions/development-goal.ts` -> `extensions/development-goal.ts`
- Modify: `package.json`
- Modify: `extensions/development-goal.ts`
- Test: `tests/validate-package.mjs`

- [ ] **Step 1: Rename the entry file**

Run:

```bash
git mv extensions/development-goal.ts extensions/development-goal.ts
```

- [ ] **Step 2: Update package metadata**

Change `package.json` identity and Pi extension list to:

```json
"name": "pi-package-goal",
"repository": {
  "type": "git",
  "url": "git+https://github.com/TrebuchetDynamics/pi-package-goal.git"
},
"homepage": "https://github.com/TrebuchetDynamics/pi-package-goal#readme",
"bugs": {
  "url": "https://github.com/TrebuchetDynamics/pi-package-goal/issues"
},
"keywords": [
  "pi-package",
  "pi",
  "pi-agent",
  "development-goal",
  "e2e-goal",
  "agent-skills",
  "coding-agent",
  "tdd",
  "modern-web"
],
"pi": {
  "extensions": [
    "./extensions/development-goal.ts",
    "./extensions/e2e-goal.ts"
  ],
  "skills": [
    "./skills"
  ]
}
```

- [ ] **Step 3: Update command registration**

In `extensions/development-goal.ts`, replace the command description/registration block with:

```ts
const command = {
  description: "Run a goal-driven project development workflow",
  getArgumentCompletions: (prefix: string) => ["start", "restart", "pause", "resume", "status", "stop", "init", "adapters", "analyze-logs", "help"]
    .filter((value) => value.startsWith(prefix))
    .map((value) => ({ value, label: value })),
  handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
};

pi.registerCommand("development-goal", command);
```

Remove both old registrations:

```ts
pi.registerCommand("development-goal", command);
pi.registerCommand("dev-goal", { ...command, description: "Alias for /development-goal" });
```

- [ ] **Step 4: Run tests and verify partial GREEN for command registration**

Run:

```bash
npm test
```

Expected: still FAIL because paths, state, prompts, and docs still use old loop wording. Command registration assertions should pass.

- [ ] **Step 5: Commit this slice after full validation in a later task**

Do not commit yet because current tests remain red.

---

### Task 3: Rename persisted state/path constants and switch state shape to turns

**Files:**
- Modify: `extensions/development-goal-domain.ts`
- Modify: `extensions/development-goal-state.ts`
- Modify: `extensions/development-goal-logger.ts`
- Modify: `extensions/development-goal.ts`
- Test: `tests/validate-package.mjs`

- [ ] **Step 1: Write failing state/constant assertions**

Update state tests to expect:

```js
assert.equal(loopStateMod.CUSTOM_STATE_TYPE, "development-goal-state");
const inactiveGoalState = loopStateMod.inactiveState("custom/logs.jsonl");
assert.deepEqual(inactiveGoalState, {
  active: false,
  adapterName: "none",
  topic: "",
  turnCount: 0,
  startedAt: "1970-01-01T00:00:00.000Z",
  logPath: "custom/logs.jsonl",
  phase: "idle",
  commit: false,
  push: false,
  emptyResponseRetries: 0,
  markerRecoveryRetries: 0,
  autoContinueCount: 0,
});
```

Update valid state fixture:

```js
const validGoalState = { ...inactiveGoalState, active: true, adapterName: "generic-git", topic: "ship", turnCount: 2, phase: "running" };
assert.equal(loopStateMod.isLoopState(validGoalState), true);
```

- [ ] **Step 2: Update domain types**

In `extensions/development-goal-domain.ts`, replace loop run fields with goal fields:

```ts
export type LoopPhase = "idle" | "intake" | "queued" | "running" | "reported" | "paused" | "blocked" | "done";
export type LoopDecision = "continue" | "stop" | "blocked" | "done";

export type DevelopmentLoopRun = {
  active: boolean;
  adapterName: string;
  runId?: string;
  topic: string;
  turnCount: number;
  startedAt: string;
  logPath: string;
  tokenBudget?: number;
  phase: LoopPhase;
  lastDecision?: LoopDecision | string;
  lastReason?: string;
  commit: boolean;
  push: boolean;
  emptyResponseRetries?: number;
  markerRecoveryRetries?: number;
  autoContinueCount?: number;
};
```

Update `LoopEvent` similarly:

```ts
turnCount: number;
```

Remove required `iteration` and `maxIterations` fields from development-goal records. Keep analysis helpers tolerant of legacy log records by reading both field families where they already inspect old logs.

- [ ] **Step 3: Update state constants**

In `extensions/development-goal-state.ts`, replace constants/default shape:

```ts
export const CUSTOM_STATE_TYPE = "development-goal-state";
export const DEFAULT_LOG_RELATIVE = ".pi/development-goal/logs.jsonl";

export function inactiveState(defaultLogPath = DEFAULT_LOG_RELATIVE): LoopState {
  return {
    active: false,
    adapterName: "none",
    topic: "",
    turnCount: 0,
    startedAt: new Date(0).toISOString(),
    logPath: defaultLogPath,
    phase: "idle",
    commit: false,
    push: false,
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    autoContinueCount: 0,
  };
}
```

Update `isLoopState` required fields:

```ts
return typeof item.active === "boolean" &&
  typeof item.adapterName === "string" &&
  typeof item.topic === "string" &&
  typeof item.turnCount === "number" &&
  typeof item.startedAt === "string" &&
  typeof item.logPath === "string" &&
  typeof item.phase === "string";
```

- [ ] **Step 4: Update log record building**

In `extensions/development-goal-logger.ts`, update log state and record fields:

```ts
export type DevelopmentLoopLogState = {
  adapterName: string;
  runId?: string;
  topic: unknown;
  turnCount: number;
  phase: string;
  logPath: string;
};

export type LoopLogRecord = {
  at: string;
  event: string;
  adapterName: string;
  runId?: string;
  topic: string;
  topicLength?: number;
  topicTruncated?: boolean;
  topicHash?: string;
  topicKind?: ObjectiveKind;
  topicSanitized?: boolean;
  turnCount: number;
  phase: string;
  decision?: string;
  reason?: string;
  summary?: string;
  blockerState?: string;
  nextSteps?: string[];
  changedFiles?: string[];
  validationCommands?: string[];
  commitHash?: string;
  pushStatus?: string;
  likelyCause?: string;
  nextSafeAction?: string;
  logPath: string;
};
```

In `buildLoopLogRecord`, emit:

```ts
turnCount: state.turnCount,
```

- [ ] **Step 5: Run tests and verify this slice**

Run:

```bash
npm test
```

Expected: tests still fail at prompt/runtime/docs marker behavior, but state tests should pass.

---

### Task 4: Remove iteration options from command parsing and config init

**Files:**
- Modify: `extensions/development-goal-command.ts`
- Modify: `extensions/development-goal-init-config.ts`
- Modify: `extensions/development-goal.ts`
- Modify: `extensions/development-goal-config.ts`
- Modify: `extensions/development-goal-adapter.ts` if adapter defaults expose `maxIterations`
- Test: `tests/validate-package.mjs`

- [ ] **Step 1: Write failing parser assertions**

Replace parser tests around `--iterations` with token-budget and unsupported-iteration behavior:

```js
assert.deepEqual(commandMod.parseArgs("restart --commit=false --validation 'npm test' --topic ship it"), {
  command: "restart",
  commit: false,
  topic: "ship it",
  validationCommands: ["npm test"],
  preflightCommands: [],
  skills: [],
  stopConditions: [],
});
assert.deepEqual(commandMod.parseArgs("start --iterations=4 ship it"), {
  command: "start",
  topic: "ship it",
  unsupportedOptions: ["--iterations=4"],
  validationCommands: [],
  preflightCommands: [],
  skills: [],
  stopConditions: [],
});
```

- [ ] **Step 2: Update ParsedCommand**

In `extensions/development-goal-command.ts`, remove `iterations?: number;` and add:

```ts
unsupportedOptions?: string[];
```

Initialize with an empty array only when needed:

```ts
function addUnsupportedOption(parsed: ParsedCommand, option: string) {
  parsed.unsupportedOptions = [...(parsed.unsupportedOptions ?? []), option];
}
```

Consume old flags without contaminating the goal topic:

```ts
if (token === "--iterations" || token === "--max-iterations" || token === "-n") {
  const value = tokens[++i];
  addUnsupportedOption(parsed, value ? `${token} ${value}` : token);
  continue;
}
if (token.startsWith("--iterations=") || token.startsWith("--max-iterations=") || token.startsWith("-n=")) {
  addUnsupportedOption(parsed, token);
  continue;
}
```

- [ ] **Step 3: Reject unsupported iteration flags in handler**

In `runCommand` inside `extensions/development-goal.ts`, before the switch:

```ts
if (parsed.unsupportedOptions?.length) {
  notify(ctx, `Development goal runs until done; remove unsupported option(s): ${parsed.unsupportedOptions.join(", ")}.`);
  return;
}
```

- [ ] **Step 4: Remove init iteration prompting/defaults**

In `extensions/development-goal-init-config.ts`, remove `maxIterations` from the generated config. If the file currently exports `HARD_MAX_ITERATIONS`, remove it or stop using it. Init summary should not mention iterations.

Expected init default shape in tests should drop `maxIterations`:

```js
assert.equal(initDefaults.config.defaultTopic, "ship init defaults");
assert.equal(initDefaults.config.commit, true);
assert.equal(initDefaults.config.push, true);
assert.equal(initDefaults.config.logPath, "custom/logs.jsonl");
```

- [ ] **Step 5: Update config normalization**

In `extensions/development-goal-config.ts`, keep reading legacy `maxIterations` harmlessly only if it is already present, but do not expose it in normalized development-goal config. Test expectation should remove `maxIterations`.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
```

Expected: parser/init iteration tests pass; prompt/runtime still fail until following tasks.

---

### Task 5: Add intake prompt and rename markers to `DEV_GOAL_*`

**Files:**
- Modify: `extensions/development-goal-prompts.ts`
- Modify: `extensions/development-goal-report-parser.ts`
- Modify: `extensions/development-goal.ts`
- Test: `tests/validate-package.mjs`

- [ ] **Step 1: Write failing prompt/parser tests**

Add prompt assertions:

```js
const intakePrompt = promptsMod.buildGoalIntakePrompt(promptState, resolvedAdapter, adapterTemp);
assert.match(intakePrompt, /Development goal intake/);
assert.match(intakePrompt, /Ask only decision-blocking questions/);
assert.match(intakePrompt, /If a question can be answered by inspecting the repository, inspect instead of asking/);
assert.match(intakePrompt, /DEV_GOAL_DECISION: continue\|stop\|blocked\|done/);
assert.doesNotMatch(intakePrompt, /Development goal iteration/);
assert.doesNotMatch(intakePrompt, /DEV_GOAL_/);
```

Update marker parse tests:

```js
assert.equal(mod.__test__.parseLoopDecision("Validated.\nDEV_GOAL_VALIDATED: yes\nDEV_GOAL_DECISION: continue"), "continue");
assert.equal(mod.__test__.parseValidated("Validated.\nDEV_GOAL_VALIDATED: yes\nDEV_GOAL_DECISION: continue"), true);
assert.equal(mod.__test__.parseLoopDecision("Validated.\nDEV_GOAL_VALIDATED: yes\nDEV_GOAL_DECISION: continue"), undefined);
```

- [ ] **Step 2: Add intake prompt builder**

In `extensions/development-goal-prompts.ts`, add:

```ts
export function buildGoalIntakePrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  const adapter = resolved.adapter;
  const config = resolved.config;
  const preflightCommands = nonEmpty(config.preflightCommands) ? config.preflightCommands! : adapter.preflightCommands;
  const validationCommands = nonEmpty(config.validationCommands) ? config.validationCommands! : adapter.validationCommands;
  const skills = ensureMandatorySkills(nonEmpty(config.skills) ? config.skills! : adapter.skills);
  const language = config.language || DEFAULT_LANGUAGE;
  return `Use the project instructions and matching skills now. Development goal intake.

Project root: ${cwd}
Adapter: ${adapter.name} — ${adapter.description}
Run id: ${s.runId || "legacy"}
Goal/objective: ${promptObjectiveText(s.topic, PROMPT_OBJECTIVE_MAX)}
Objective intake: ${objectiveIntakeSummary(s.topic, PROMPT_OBJECTIVE_MAX)}
Preferred language: ${language}
Config source: ${resolved.configLoaded ? relativeToCwd(cwd, resolved.configPath) : "built-in adapter defaults"}
Goal log path: ${relativeToCwd(cwd, s.logPath)}
Run budget: ${loopBudgetSummary(s)} (soft budget; elapsed time and token budget are advisory.)

Suggested skills/adapters for this project:
${skills.map((skill) => `- ${skill}`).join("\n") || "- Use the smallest project-matching skill set."}

Preflight commands to run before edits:
${preflightCommands.map((command) => `- ${command}`).join("\n")}

Validation commands required before DEV_GOAL_VALIDATED: yes:
${validationCommands.map((command) => `- ${command}`).join("\n")}

Intake behavior:
1. Inspect project instructions, repo-local guidance, and relevant files before asking questions.
2. Ask only decision-blocking questions whose answers cannot be safely inferred from repository evidence.
3. If a question can be answered by inspecting the repository, inspect instead of asking.
4. If real gaps remain, ask one concise question and report blocked until the user answers.
5. If no real gaps remain, produce a concise goal plan/checklist and choose continue.

End with these exact marker lines:
DEV_GOAL_REPORT: {"validated":false,"decision":"continue","summary":"intake complete","nextSteps":["first implementation slice"]}
DEV_GOAL_VALIDATED: no
DEV_GOAL_DECISION: continue|stop|blocked|done

Only use DEV_GOAL_VALIDATED: yes after validation evidence exists. Use DEV_GOAL_DECISION: blocked when a real user decision is required before safe implementation.`;
}
```

- [ ] **Step 3: Rename normal work prompt markers**

In `buildIterationPrompt`, rename function to `buildGoalTurnPrompt` or keep exported name temporarily and change body strings to goal wording. Replace marker literals:

```text
DEV_GOAL_REPORT
DEV_GOAL_VALIDATED
DEV_GOAL_DECISION
```

Remove iteration cap language and use turn count:

```ts
return `Use the project instructions and matching skills now. Development goal turn ${s.turnCount}.
```

- [ ] **Step 4: Update report parser marker regexes**

In `extensions/development-goal-report-parser.ts`, update marker extraction to only recognize:

```ts
/DEV_GOAL_DECISION:\s*(continue|stop|blocked|done)\s*$/
/DEV_GOAL_VALIDATED:\s*(yes|no)\s*$/
/DEV_GOAL_REPORT:\s*(\{.*\})\s*$/
```

Keep typed JSON report shape unchanged.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: prompt/parser tests pass; runtime transition tests may still fail until Task 6.

---

### Task 6: Change runtime from iterations to goal turns and intake phase

**Files:**
- Modify: `extensions/development-goal.ts`
- Modify: `extensions/development-goal-compaction.ts` only if messages include iteration wording
- Test: `tests/validate-package.mjs`

- [ ] **Step 1: Write failing runtime tests**

Update start test:

```js
await command.handler("start --tokens 98.5K README polish", ctx);
assert.equal(sent.length, 1);
assert.match(sent[0].content, /Development goal intake/);
assert.match(sent[0].content, /Ask only decision-blocking questions/);
assert.equal(entries.at(-1).customType, "development-goal-state");
assert.equal(entries.at(-1).data.phase, "intake");
assert.equal(entries.at(-1).data.turnCount, 1);
```

Update intake continuation test:

```js
const sentBeforeIntakeContinue = sent.length;
await handlers.get("agent_end")({
  messages: [{ role: "assistant", content: "Intake complete.\nDEV_GOAL_VALIDATED: no\nDEV_GOAL_DECISION: continue" }],
}, ctx);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(sent.length, sentBeforeIntakeContinue + 1);
assert.match(sent.at(-1).content, /Development goal turn 2/);
assert.equal(entries.at(-1).data.phase, "running");
assert.equal(entries.at(-1).data.turnCount, 2);
```

Update all later final-marker fixture strings from `DEV_GOAL_*` to `DEV_GOAL_*`.

- [ ] **Step 2: Start in intake phase**

In `startLoop`, remove max-iteration calculation and create state:

```ts
state = {
  active: true,
  adapterName: adapter.name,
  runId,
  topic,
  turnCount: 0,
  startedAt,
  logPath,
  ...(parsed.tokenBudget ? { tokenBudget: parsed.tokenBudget } : {}),
  phase: "intake",
  commit,
  push,
  emptyResponseRetries: 0,
  markerRecoveryRetries: 0,
  autoContinueCount: 0,
};
```

Then call a new sender:

```ts
sendIntakePrompt(pi, ctx, resolved);
```

- [ ] **Step 3: Add `sendIntakePrompt`**

```ts
function sendIntakePrompt(pi: ExtensionAPI, ctx: UiLikeContext, resolved: ResolvedProjectAdapter) {
  const prompt = buildGoalIntakePrompt(state, resolved, contextCwd(ctx));
  state = { ...state, phase: "intake", turnCount: (state.turnCount ?? 0) + 1, emptyResponseRetries: 0, markerRecoveryRetries: 0, autoContinueCount: (state.autoContinueCount ?? 0) + 1 };
  appendLoopLog("intake_prompt_sent", { reason: `auto_continue ${state.autoContinueCount}/${autoContinueLimitFromEnv()}` });
  refreshUi(ctx);
  sendLoopPrompt(pi, ctx, prompt);
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
}
```

- [ ] **Step 4: Replace next-iteration queueing with next-turn queueing**

Replace `queueNextIteration` with:

```ts
function queueNextTurn(pi: ExtensionAPI, ctx: ExtensionContext) {
  if (!state.active) return;
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  state = { ...state, turnCount: state.turnCount + 1, phase: "queued", emptyResponseRetries: 0, markerRecoveryRetries: 0 };
  appendLoopLog("turn_queued");
  refreshUi(ctx);
  notify(ctx, `Queued development goal turn ${state.turnCount}; it will start automatically when the current turn is idle.`);
  scheduleAutomaticTurn(pi, ctx, resolved, state.turnCount);
}
```

Replace scheduler guard `state.iteration !== targetIteration` with `state.turnCount !== targetTurn`.

- [ ] **Step 5: Route continue decisions**

In `onAgentEnd`, when decision is `continue`:

```ts
if (state.phase === "intake") {
  queueNextTurn(pi, ctx);
  return;
}
```

For normal running, call `queueNextTurn` instead of `queueNextIteration`. Remove cap checks against max iterations.

- [ ] **Step 6: Update pause/resume and compaction strings**

Replace user-facing strings:

```ts
notify(ctx, `Resuming development goal turn ${state.turnCount}.`);
notify(ctx, "Development goal paused. Use /development-goal resume to continue.");
```

Build compaction prompts with goal/turn wording and `DEV_GOAL_*` markers.

- [ ] **Step 7: Run tests**

Run:

```bash
npm test
```

Expected: runtime tests pass for start/intake/continue/pause/resume/done. Docs and status tests may still fail until Task 7.

---

### Task 7: Update status, help, config, docs, and log-analysis wording

**Files:**
- Modify: `extensions/development-goal-status.ts`
- Modify: `extensions/development-goal.ts`
- Modify: `extensions/development-goal-adapter.ts`
- Modify: `extensions/development-goal-config.ts`
- Modify: `README.md`
- Test: `tests/validate-package.mjs`

- [ ] **Step 1: Write failing status/help tests**

Update status expectations:

```js
const statusState = { active: true, adapterName: "generic-git", topic: "Ship status helper", turnCount: 2, phase: "running", logPath: statusLogPath, commit: true, push: true };
assert.equal(statusMod.statusLine(statusState), "● run · turn 2 · generic-git · git:push · Ship status helper");
const extractedStatus = statusMod.statusReport(statusState, statusTemp);
assert.match(extractedStatus, /budget: elapsed .*; turn 2/);
assert.match(extractedStatus, /Commands: \/development-goal status/);
assert.doesNotMatch(extractedStatus, /development-goal|iteration/);
```

Update help command assertions:

```js
await command.handler("help", ctx);
assert.match(messages.at(-1).content, /\/development-goal start/);
assert.doesNotMatch(messages.at(-1).content, /\/development-goal|--iterations|DEV_GOAL_/);
```

- [ ] **Step 2: Update status module**

In `extensions/development-goal-status.ts`, change state type fields from iteration/max to turn count:

```ts
turnCount: number;
```

Change `statusLine` segment:

```ts
s.active ? `turn ${s.turnCount}` : "goal"
```

Change commands string:

```ts
"Commands: /development-goal status | /development-goal pause | /development-goal resume | /development-goal analyze-logs | /development-goal stop | /development-goal restart <goal> | /development-goal init"
```

- [ ] **Step 3: Update help text**

In `publishHelp`, replace command block with:

```ts
const text = [
  "Development goal commands:",
  "- /development-goal start [options] <goal> — start a goal with intake",
  "- /development-goal restart [options] <goal> — replace the active goal",
  "- /development-goal pause — pause automatic continuation without clearing goal state",
  "- /development-goal resume — resume a paused goal at the current turn",
  "- /development-goal stop — stop the active goal",
  "- /development-goal status — show current state",
  "- /development-goal adapters — show detected adapter/config",
  "- /development-goal analyze-logs [path] — summarize one log file or a directory of goal logs",
  "- /development-goal init [options] <default goal> — configure .pi/development-goal.json interactively",
  "",
  "Options:",
  "- --tokens <n|nK|nM> / --budget <n|nK|nM> records a soft token budget in prompts and status",
  "- --commit/--no-commit, --push/--no-push, --validation <cmd>, --preflight <cmd>, --skill <name>, --stop-condition <text>",
  "",
  "Active-goal behavior:",
  "- Every start begins with an intake prompt that asks only real decision-blocking questions.",
  "- DEV_GOAL_DECISION: continue starts the next goal turn automatically when Pi is idle.",
  "- PI_DEV_GOAL_MAX_AUTO_CONTINUES caps automatic prompt sends before the goal pauses for manual resume. Default: 500.",
].join("\n");
```

- [ ] **Step 4: Update config defaults and docs**

Change config path constant usage to `.pi/development-goal.json`. In README, replace quick start with:

```text
/development-goal adapters
/development-goal start --tokens 250K improve the README
/development-goal status
```

Document:

```md
`/development-goal` sends an intake prompt first, then keeps working until the goal reaches `DEV_GOAL_DECISION: done`, `blocked`, or `stop`.
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: tests pass or fail only on remaining legacy string assertions. Fix exact failures by replacing old user-facing strings with development-goal equivalents.

---

### Task 8: Full validation, legacy-string audit, commit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected:

```text
pi-package-goal validation ok
```

- [ ] **Step 2: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output, exit 0.

- [ ] **Step 3: Audit public legacy strings**

Run:

```bash
rg -n "/development-goal|/dev-goal|DEV_GOAL_|\.pi/development-goal|development-goal-state|--iterations|--max-iterations|pi-package-goal|TrebuchetDynamics/pi-package-goal" README.md package.json extensions/development-goal.ts tests/validate-package.mjs
```

Expected: no output except test fixtures that explicitly assert old strings are absent. If output appears in user-facing docs/prompts/status/help/metadata, replace with development-goal wording.

- [ ] **Step 4: Inspect git state**

Run:

```bash
git status --short --branch --untracked-files=all
```

Expected: only files from this implementation are modified; no unrelated dirty work.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add package.json README.md tests/validate-package.mjs extensions/development-goal.ts extensions/development-goal-domain.ts extensions/development-goal-state.ts extensions/development-goal-command.ts extensions/development-goal-prompts.ts extensions/development-goal-status.ts extensions/development-goal-logger.ts extensions/development-goal-report-parser.ts extensions/development-goal-config.ts extensions/development-goal-init-config.ts extensions/development-goal-adapter.ts
git add -u extensions/development-goal.ts
git commit -m "feat: rename development goal to development goal"
```

- [ ] **Step 6: Optional push gate**

Before pushing, run:

```bash
git status --short --branch
```

If branch is behind or diverged, do not force-push. Fetch/rebase/merge with explicit approval, rerun `npm test` and `git diff --check`, then push.

If branch is only ahead, push only if the user asked for delivery:

```bash
git push origin main
```

---

### Task 9: Rename remote repository and local checkout folder

**Files/paths:**
- External: GitHub repository `TrebuchetDynamics/pi-package-goal`
- Rename local folder: `/home/xel/git/pi-package-development-loop` -> `/home/xel/git/pi-package-goal`
- Modify after remote rename if needed: git remote URL

- [ ] **Step 1: Confirm clean committed state**

Run:

```bash
git status --short --branch --untracked-files=all
git rev-parse --show-toplevel
```

Expected: clean worktree in `/home/xel/git/pi-package-development-loop` before moving the folder.

- [ ] **Step 2: Rename GitHub repository when authorized**

If `gh` is authenticated with repository admin rights, run:

```bash
gh repo rename pi-package-goal --repo TrebuchetDynamics/pi-package-development-loop --yes
```

Expected: remote repository becomes `TrebuchetDynamics/pi-package-goal`.

If this fails due to missing `gh`, auth, or admin rights, stop and report blocker:

```text
blockerState: GitHub repository rename requires owner/admin access for TrebuchetDynamics/pi-package-development-loop.
nextSteps: Rename repository in GitHub UI to pi-package-goal; update origin URL; rerun npm test and git diff --check.
```

- [ ] **Step 3: Update local remote URL**

After the GitHub repo is renamed, run:

```bash
git remote set-url origin git@github.com:TrebuchetDynamics/pi-package-goal.git
git remote -v
```

Expected output includes:

```text
origin	git@github.com:TrebuchetDynamics/pi-package-goal.git (fetch)
origin	git@github.com:TrebuchetDynamics/pi-package-goal.git (push)
```

- [ ] **Step 4: Rename local checkout folder**

From outside the checkout, run:

```bash
cd /home/xel/git
mv pi-package-development-loop pi-package-goal
cd /home/xel/git/pi-package-goal
git status --short --branch --untracked-files=all
```

Expected: command runs from `/home/xel/git/pi-package-goal` and worktree remains clean.

- [ ] **Step 5: Validate after move**

Run from `/home/xel/git/pi-package-goal`:

```bash
npm test
git diff --check
```

Expected:

```text
pi-package-goal validation ok
```

and `git diff --check` emits no output. The validation message may still contain old package name if the test script uses a static success string; update it to `pi-package-goal validation ok` if included in the implementation slice.

---

## Self-review checklist

- Spec coverage: package/repo/folder hard rename, command hard rename, path hard rename, state/status hard rename, no iteration cap, internal turn count, `DEV_GOAL_*` markers, intake phase, validation/completion audit all mapped to tasks.
- Placeholder scan: no placeholder markers or open-ended implementation instructions remain.
- Type consistency: use `turnCount` in state, logs, status, prompts, and runtime scheduling.
- Scope: one implementation plan; E2E goal is untouched except package metadata path references.
