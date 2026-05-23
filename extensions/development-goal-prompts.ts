import {
  DEFAULT_LANGUAGE,
  ensureMandatorySkills,
  nonEmpty,
  type ResolvedProjectAdapter,
} from "./development-goal-adapter.ts";
import { loopBudgetSummary } from "./development-goal-budget.ts";
import { relativeToCwd } from "./development-goal-files.ts";
import { iterationProgress, hasIterationCap, type LoopState } from "./development-goal-state.ts";
import { objectiveIntakeSummary, promptObjectiveText } from "./development-goal-topic.ts";

export const PROMPT_OBJECTIVE_MAX = 600;

export const TASK_DISCOVERY_CUES = [
  "repo-local skills whose names match the work, including *-git, *-release, *-e2e, *-playwright, and *-maestro-flutter when present",
  "TODO.md, TODOS.md, TODO.txt, PLAN.md, PLANS.md, ROADMAP.md, and similar planning files",
  "progress.json, progress/*.json, status.json, backlog files, and project task trackers",
  "PR/MR/CL review state and Greptile review comments when greploop is explicitly requested or git delivery is enabled",
  "docs/plans, docs/adr, docs/roadmap, issues, and other project progress notes",
];

export const REVIEW_GUIDANCE = [
  "Use greploop for PR/MR/CL review cleanup only when the user requested Greptile review cleanup, a PR/MR/CL is available, and required gh/glab/p4 authentication is present.",
  "Do not trigger Greptile, post review comments, resolve review threads, push, or re-shelve unless the commit/push policy permits it or the user explicitly asked for that external review action.",
  "If Greptile, required CLIs, credentials, or PR/MR/CL context are unavailable for requested greploop work, report DEV_GOAL_DECISION: blocked with the missing prerequisite.",
];

export const GOALBUDDY_INSPIRED_GUIDANCE = [
  "Use the GoalBuddy-style invariant: Intent -> Oracle -> Surface -> Work package -> Proof.",
  "Identify the goal oracle early: the observable test, demo, artifact, metric, source-backed answer, review, or owner decision that proves the original outcome.",
  "Start every development-goal run by using improve-codebase-architecture before selecting the first work package.",
  "Choose the largest safe useful slice, not the tiniest possible helper. Safe means bounded, explicit, verified, reversible, and respectful of unrelated dirty work.",
  "A blocked slice does not automatically stop the goal. If safe local follow-up work exists, record the blocker in DEV_GOAL_REPORT nextSteps and continue with that safe work.",
  "Only use done after a final audit maps the original request to current receipts, validation evidence, delivery evidence, and the goal oracle.",
];

export function buildIterationPrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  const adapter = resolved.adapter;
  const config = resolved.config;
  const preflightCommands = nonEmpty(config.preflightCommands) ? config.preflightCommands! : adapter.preflightCommands;
  const validationCommands = nonEmpty(config.validationCommands) ? config.validationCommands! : adapter.validationCommands;
  const skills = ensureMandatorySkills(nonEmpty(config.skills) ? config.skills! : adapter.skills);
  const language = config.language || DEFAULT_LANGUAGE;
  const stopConditions = nonEmpty(config.stopConditions) ? config.stopConditions! : adapter.stopConditions;
  const commitPolicy = s.commit
    ? s.push
      ? "Commit each validated coherent slice and push to the current branch only when the worktree is safe."
      : "Commit each validated coherent slice when the worktree is safe; do not push."
    : "Do not commit or push unless the user explicitly asks later.";
  const pushSafetyPolicy = s.push
    ? "Before pushing, inspect `git status --short --branch` for ahead/behind/diverged state. If the branch is behind or diverged, do not force-push or repair history without explicit approval; report DEV_GOAL_DECISION: blocked with blockerState mentioning git_push_fetch_first and nextSteps for fetch/rebase/merge, validation, then push."
    : undefined;

  const iterationLabel = iterationProgress(s);
  const capNote = hasIterationCap(s)
    ? "A legacy iteration cap is configured; continue until the goal is achieved or the cap is reached."
    : "No max-iteration stop is configured; continue automatically until the goal is achieved, blocked, paused, or stopped.";

  return `Start with improve-codebase-architecture, then use the project instructions and matching skills now. Development goal iteration ${iterationLabel}.

Project root: ${cwd}
Adapter: ${adapter.name} — ${adapter.description}
Run id: ${s.runId || "legacy"}
Topic/objective: ${promptObjectiveText(s.topic, PROMPT_OBJECTIVE_MAX)}
Objective intake: ${objectiveIntakeSummary(s.topic, PROMPT_OBJECTIVE_MAX)}
Preferred language: ${language}
Config source: ${resolved.configLoaded ? relativeToCwd(cwd, resolved.configPath) : "built-in adapter defaults"}
Goal log path: ${relativeToCwd(cwd, s.logPath)}
Run budget: ${loopBudgetSummary(s)} (soft budget; elapsed time and token budget are advisory. ${capNote})

Suggested skills/adapters for this project:
${skills.map((skill) => `- ${skill}`).join("\n") || "- Use the project-matching skill set."}

Task discovery cues for broad objectives:
${TASK_DISCOVERY_CUES.map((cue) => `- ${cue}`).join("\n")}

Review guidance:
${REVIEW_GUIDANCE.map((cue) => `- ${cue}`).join("\n")}

GoalBuddy-inspired goal guidance:
${GOALBUDDY_INSPIRED_GUIDANCE.map((cue) => `- ${cue}`).join("\n")}

Preflight commands to run before edits:
${preflightCommands.map((command) => `- ${command}`).join("\n")}

Validation commands required before DEV_GOAL_VALIDATED: yes:
${validationCommands.map((command) => `- ${command}`).join("\n")}

Commit/push policy:
- ${commitPolicy}
${pushSafetyPolicy ? `- ${pushSafetyPolicy}\n` : ""}- Preserve unrelated dirty work. Stage only files that belong to this iteration.

Stop conditions:
${stopConditions.map((condition) => `- ${condition}`).join("\n")}

Run one complete vertical development iteration:
1. State scope lock with exact absolute project path and adapter.
2. Start with improve-codebase-architecture: use it to map architectural friction, repo vocabulary, and the safest high-leverage direction before selecting work.
3. Read project instructions and use matching repo-local skills before risky work.
4. Inspect current dirty state and preserve unrelated work.
5. Define the goal oracle and choose the largest safe useful work package from the user topic, repo-local skills, or task discovery cues above.
6. Prefer test-first changes when editing code.
7. Run the validation commands above. If a command is not applicable, explain exact evidence and substitute the closest project-appropriate check.
8. If validation fails twice with the same cause, stop and report the first failing stderr line.
9. Apply the commit/push policy above.
10. End with exact changed files, validations, blocker state, a machine-readable delivery line when evidence exists, and these final marker lines:
DEV_GOAL_REPORT: {"validated":true,"decision":"continue","summary":"brief result","nextSteps":["next safe step"],"changedFiles":["path"],"validationCommands":["command"],"commitHash":"hash","pushStatus":"pushed"}
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done

Blocked DEV_GOAL_REPORT objects should include blockerState and nextSteps, for example:
DEV_GOAL_REPORT: {"validated":false,"decision":"blocked","summary":"brief blocker","blockerState":"why blocked","nextSteps":["unblock action"]}

Example continue end report:
Scope: /absolute/project/path with adapter generic-git.
Selected slice: one largest safe useful improvement package.
Changed files: path/to/file.ts — what changed and why.
Validation evidence: npm test (pass); git diff --check (pass).
Commit/push evidence: abc1234 pushed to current branch.
Blocker state: none.
Possible next steps: next largest safe useful package, named concretely.

Example blocked end report:
Scope: /absolute/project/path with adapter generic-git.
Selected slice: validate one integration-dependent path.
Changed files: none committed; validation stopped before safe delivery.
Validation evidence: npm test (failed: missing TEST_SERVICE_TOKEN).
Commit/push evidence: not attempted because validation failed.
Blocker state: Missing TEST_SERVICE_TOKEN credential required for integration validation.
Possible next steps: provide TEST_SERVICE_TOKEN; rerun \`npm test\`; restart /development-goal with the same objective.

Example stop handoff end report:
Scope: /absolute/project/path with adapter generic-git.
Selected slice: final documentation cleanup and handoff.
Changed files: README.md — documented the completed workflow and resume notes.
Validation evidence: npm test (pass); git diff --check (pass).
Commit/push evidence: def5678 pushed to current branch.
Blocker state: none; stopping because the selected objective is complete.
Possible next steps: review the pushed commit; open /development-goal status for recent context; restart with the next objective.

Example done end report:
Scope: /absolute/project/path with adapter generic-git.
Selected slice: completed the final objective cleanup.
Changed files: README.md — captured the final report behavior and no remaining goal work.
Validation evidence: npm test (pass); git diff --check (pass).
Commit/push evidence: fedcba9 pushed to current branch.
Blocker state: none; done because the objective is complete, the goal oracle is satisfied, and no goal follow-up remains.
Possible next steps: review the delivered commit; archive development-goal state if desired; start a new objective only if new work appears.

Example interrupted resume end report:
Scope: /absolute/project/path with adapter generic-git.
Selected slice: resumed the same iteration after compaction without advancing the goal.
Changed files: none committed; resume prompt preserved current dirty state.
Validation evidence: git diff --check (pass) after resume; npm test not run because no code changed.
Commit/push evidence: not attempted; no deliverable slice yet.
Blocker state: none; provider interruption recovered, same slice resumed.
Possible next steps: inspect \`.pi/development-goal/logs.jsonl\`; run \`/development-goal status\`; continue the same safe package.

Example partial validation end report:
Scope: /absolute/project/path with adapter generic-git.
Selected slice: implemented one path but only ran a targeted check.
Changed files: path/to/file.ts — draft implementation kept local until full validation passes.
Validation evidence: targeted test command (pass); required validation \`npm test\` not run.
Commit/push evidence: not attempted because full validation is missing.
Blocker state: full required validation is missing, so commit and push are unsafe.
Possible next steps: run \`npm test\`; run \`git diff --check\`; commit and push only after both pass.

Decision guide for final markers:
- continue: use when validation passed and the full goal is not proven complete yet.
- blocked: use when validation is red, required evidence is missing, or delivery is unsafe.
- stop: use for clean handoff or review before more automation.
- done: use when the objective is complete, the goal oracle is satisfied, and no follow-up goal work remains.

Completion audit before DEV_GOAL_DECISION: done:
- Restate the objective as concrete deliverables and success criteria.
- Map every explicit requirement to evidence from files, command output, tests, git state, logs, or external docs inspected.
- Identify missing, incomplete, weakly verified, or uncovered requirements.
- If anything is missing, weakly verified, or uncertain, do not use done; choose continue or blocked with concrete nextSteps instead.

End report quality checklist:
- Scope and slice: exact project path, adapter, and selected slice.
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

Human-readable end report requirements, before DEV_GOAL_REPORT:
- Scope and selected slice.
- What changed and why, with exact files.
- Validation evidence, commit/push evidence, and blocker state.
- Possible next steps, especially if decision is continue, blocked, or stop.
  - For continue: name the next largest safe useful package.
  - For blocked: name concrete unblocking actions, missing prerequisites, or credentials.
  - For stop: name handoff or cleanup actions so the user can resume safely.
- Keep the machine-readable DEV_GOAL_REPORT and final markers last so the goal runner can parse them.

Omit unavailable DEV_GOAL_REPORT fields. Use false and blocked when validation is red. Only use DEV_GOAL_VALIDATED: yes after validation evidence exists. Use DEV_GOAL_DECISION: blocked when validation is red, evidence is missing, scope is unsafe, or credentials/external services are required.`;
}

export function buildCompactionResumePrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  return `Continue development goal after compaction.

The previous model request may have failed or been compacted before it emitted DEV_GOAL markers. Resume the same iteration from the compacted summary and current repository state. Do not restart from scratch, do not mark the goal blocked solely because compaction happened, and preserve unrelated dirty work.

${buildIterationPrompt(s, resolved, cwd)}`;
}

export function buildEmptyResponseRetryPrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  return `Retry development goal iteration after empty provider response.

The previous model request returned no assistant text, likely because the provider stream ended early. Retry the same iteration from current repository state. Do not increment the goal iteration, do not restart from scratch, and do not mark the goal blocked solely because the provider response was empty.

${buildIterationPrompt(s, resolved, cwd)}`;
}

export function buildMissingMarkerRecoveryPrompt(s: LoopState): string {
  return `Return only the development goal final markers for iteration ${iterationProgress(s)}.

The previous assistant response was non-empty but did not end with the required DEV_GOAL markers. Do not redo the work, do not run new commands, and do not include a summary. If validation evidence is missing or red, choose DEV_GOAL_VALIDATED: no and DEV_GOAL_DECISION: blocked.

Use exactly these two final lines and nothing else:
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done`;
}

export function buildDevelopmentGoalCompactionInstructions(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  return `Preserve development goal state for automatic continuation.

Current development goal state:
- Project root: ${cwd}
- Adapter: ${resolved.adapter.name}
- Run id: ${s.runId || "legacy"}
- Objective: ${promptObjectiveText(s.topic, PROMPT_OBJECTIVE_MAX)}
- Iteration: ${iterationProgress(s)}
- Phase: ${s.phase}
- Git delivery: ${s.push ? "push" : s.commit ? "commit" : "manual"}
- Log path: ${relativeToCwd(cwd, s.logPath)}

In the compaction summary, include:
1. Current objective and selected adapter.
2. Iteration number and whether the next action is to continue the queued goal work.
3. Files changed/read and validation evidence seen so far.
4. Any blockers or missing credentials.
5. The requirement that the next assistant response ends with DEV_GOAL_VALIDATED and DEV_GOAL_DECISION markers.`;
}

export function buildSteeringPrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string, steeringText: string): string {
  const adapter = resolved.adapter;
  return `Development goal steering request for the active task.

Project root: ${cwd}
Adapter: ${adapter.name} — ${adapter.description}
Current goal iteration: ${iterationProgress(s)}
Current objective: ${promptObjectiveText(s.topic, PROMPT_OBJECTIVE_MAX)}
User steering request: ${steeringText}

Incorporate this steering into the current or next safe work package. Preserve unrelated dirty work. Keep using the configured validation commands before any continue/done decision.

End with these exact marker lines:
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done

Only use DEV_GOAL_VALIDATED: yes after validation evidence exists. Use DEV_GOAL_DECISION: blocked when validation is red, evidence is missing, scope is unsafe, or credentials/external services are required.`;
}
