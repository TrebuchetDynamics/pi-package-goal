import {
  DEFAULT_LANGUAGE,
  ensureMandatorySkills,
  nonEmpty,
  type ResolvedProjectAdapter,
} from "./development-goal-adapter.ts";
import { loopBudgetSummary } from "./development-goal-budget.ts";
import { relativeToCwd } from "./development-goal-files.ts";
import { iterationProgress, hasIterationCap, type LoopState } from "./development-goal-state.ts";
import { resolveScopeExpansionPolicy } from "./development-goal-scope-expansion.ts";
import { objectiveIntakeSummary, promptObjectiveText } from "./development-goal-topic.ts";

export const PROMPT_OBJECTIVE_MAX = 600;

export const TASK_DISCOVERY_CUES = [
  "repo-local skills matching the work (*-git, *-release, *-e2e, *-playwright, *-maestro-flutter)",
  "TODO.md, TODOS.md, TODO.txt, PLAN.md, PLANS.md, ROADMAP.md, and similar plans",
  "progress.json, progress/*.json, status.json, backlog files, and task trackers",
  "PR/MR/CL or Greptile review state only when greploop or git delivery is in scope",
  "docs/plans, docs/adr, docs/roadmap, issues, and project progress notes",
];

export const REVIEW_GUIDANCE = [
  "Use greploop for PR/MR/CL review cleanup only when requested, review context exists, and gh/glab/p4 plus Greptile auth are available.",
  "Do not trigger Greptile, post comments, resolve threads, push, or re-shelve unless commit/push policy or user request permits it.",
  "If Greptile/tooling/credentials/context are missing, report DEV_GOAL_DECISION: blocked with the missing prerequisite.",
];

export const GOALBUDDY_INSPIRED_GUIDANCE = [
  "Use the GoalBuddy-style invariant: Intent -> Oracle -> Surface -> Work package -> Proof.",
  "Identify the goal oracle early: the test, demo, artifact, metric, source-backed answer, review, or owner decision that proves the outcome.",
  "Use improve-codebase-architecture as a lightweight architecture scout; Do not write /tmp/architecture-review*.html or open a browser unless a full report is requested.",
  "Start every development-goal run by using improve-codebase-architecture, then grill-me in self-answer-first mode; answer source-backed gaps, only ask hard owner-decision or pivot questions, and if no hard question remains, proceed without asking the user.",
  "Do not spend time on weak tests: add tests that would fail on the real requirement or defect through public behavior, or name the validation limit.",
  "Choose the largest safe useful slice: bounded, explicit, verified, reversible, and respectful of unrelated dirty work.",
  "A blocked slice can still continue if safe local follow-up work exists; record blocker and nextSteps in DEV_GOAL_REPORT.",
  "Only use done after final audit maps the request to receipts, validation, delivery, and the goal oracle.",
];

export function buildIterationPrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  const adapter = resolved.adapter;
  const config = resolved.config;
  const preflightCommands = nonEmpty(config.preflightCommands) ? config.preflightCommands! : adapter.preflightCommands;
  const validationCommands = nonEmpty(config.validationCommands) ? config.validationCommands! : adapter.validationCommands;
  const skills = ensureMandatorySkills(nonEmpty(config.skills) ? config.skills! : adapter.skills);
  const language = config.language || DEFAULT_LANGUAGE;
  const stopConditions = nonEmpty(config.stopConditions) ? config.stopConditions! : adapter.stopConditions;
  const scopeExpansionPolicy = resolveScopeExpansionPolicy(config);
  const scopeExpansionGuidance = scopeExpansionPolicy.allowScopeExpansion
    ? "Explicit scope expansion is allowed; after the known queue is empty, you may run a bounded discovery pass and select one safe new slice."
    : scopeExpansionPolicy.requireReviewOnEmptyQueue
      ? "Do not invent more work when the discovered queue is empty; stop with DEV_GOAL_DECISION: stop and final_status review_needed."
      : "Scope expansion is not explicitly allowed, but review on empty queue is disabled; prefer stopping unless the next slice is already source-backed.";
  const commitPolicy = s.commit
    ? s.push
      ? "Commit each validated coherent slice and push to the current branch only when the worktree is safe."
      : "Commit each validated coherent slice when the worktree is safe; do not push."
    : "Do not commit or push unless the user explicitly asks later.";
  const pushSafetyPolicy = s.push
    ? "Before pushing, inspect `git status --short --branch` for ahead/behind/diverged state. If the branch is behind or diverged, do not force-push or repair history without explicit approval; report DEV_GOAL_DECISION: blocked with blockerState mentioning git_push_fetch_first and nextSteps for fetch/rebase/merge, validation, then push."
    : undefined;
  const worktreeScopePolicy = s.allWorktreeChangesInScope
    ? "The user explicitly put all current worktree changes in scope for git delivery. Still inspect for secrets, generated caches, vendored dependency folders, and unsafe artifacts before staging; block with exact paths if any should not be committed."
    : "Preserve unrelated dirty work. Stage only files that belong to this iteration.";

  const commandIntentGuidance = s.commandIntent ? `Direct command intent:\n${s.commandIntent}\n` : "";
  const requiredSkillGuidance = s.requiredSkill
    ? `Direct skill command: ${s.requiredSkill}\nInvoke the ${s.requiredSkill} skill as the primary architecture workflow before selecting or editing code. Treat this as required command intent, not a generic suggestion.\n`
    : "";
  const iterationLabel = iterationProgress(s);
  const capNote = hasIterationCap(s)
    ? "A legacy iteration cap is configured; continue until the goal is achieved or the cap is reached."
    : "No max-iteration stop is configured; continue automatically until the goal is achieved, blocked, paused, or stopped.";

  return `Start with improve-codebase-architecture, then use grill-me in self-answer-first mode, then use the project instructions and matching skills now. Development goal iteration ${iterationLabel}.

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

${requiredSkillGuidance}${commandIntentGuidance}Task discovery cues for broad objectives:
${TASK_DISCOVERY_CUES.map((cue) => `- ${cue}`).join("\n")}

Scope expansion policy:
- ${scopeExpansionGuidance}

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
${pushSafetyPolicy ? `- ${pushSafetyPolicy}\n` : ""}- ${worktreeScopePolicy}

Stop conditions:
${stopConditions.map((condition) => `- ${condition}`).join("\n")}

Topology check for non-trivial work:
- State ownership clear?
- Feedback/validation clear?
- Blast radius/deletion impact known?
- Timing/ordering safe?
For trivial low-risk edits, do not over-process; inspect scope, edit, validate.

Run one complete vertical development iteration:
1. State scope lock with exact absolute project path and adapter.
2. Use improve-codebase-architecture as a lightweight architecture scout: map friction and safe direction; Do not write /tmp/architecture-review*.html or open a browser unless explicitly requested.
3. Use grill-me self-answer-first: answer source-backed gaps yourself; only ask hard owner-decision or pivot questions; If no hard question remains, proceed without asking the user.
4. Read project instructions and matching repo-local skills, inspect dirty state, preserve unrelated work.
5. Define the goal oracle, choose the largest safe useful work package, and prefer test-first changes.
6. Do not spend time on weak tests; add tests that would fail on the real requirement or defect through public behavior, or state the validation limit.
7. Run validation commands; if not applicable, give exact evidence and the closest substitute. If validation fails twice with the same cause, stop and report the first failing stderr line.
8. Apply commit/push policy, then end with the canonical final-report template. Fill every section; write \`none\` when empty.

Canonical final-report template:
Scope: /absolute/project/path with adapter generic-git.
Selected slice: one largest safe useful package.
Changed files: /absolute/project/path/src/file.ts — what changed and why.
Validation evidence: npm test (pass); git diff --check (pass).
Commit/push evidence: abc1234 pushed | not attempted because <reason>.
Blocker state: none | <specific missing prerequisite or unsafe condition>.
Blocked Work: none | <work not completed because of blocker>.
Pivoted Work Completed: none | <safe alternate work completed while blocked>.
Possible next steps: next safe action matched to the decision.
DEV_GOAL_REPORT: {"validated":true,"decision":"continue","summary":"brief result","blockerState":"why blocked","blockedWork":"none","pivotedWorkCompleted":"none","nextSteps":["next safe step"],"changedFiles":["/absolute/project/path/src/file.ts"],"validationCommands":["command"],"commitHash":"hash","pushStatus":"pushed"}
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done

Report quality validator flags missing Blocked Work, missing Pivoted Work Completed, relative human-readable changed files, and vague DEV_GOAL_REPORT.changedFiles entries.
Malformed final report policy: one repair-only final-report retry, with exact issue codes, then blocks as malformed_final_report. Repair retries forbid code edits, scope changes, new task discovery, and validation reruns; only rewrite the final report.
Blocked DEV_GOAL_REPORT objects should include blockerState, blockedWork, and nextSteps.

Decision guide for final markers:
- continue: use when validation passed and the full goal is not proven complete yet.
- blocked: use when validation is red, required evidence is missing, or delivery is unsafe.
- stop: use for clean handoff or review before more automation.
- done: use when the objective is complete, the goal oracle is satisfied, and no follow-up goal work remains.

Completion audit before DEV_GOAL_DECISION: done: restate deliverables, then Map every explicit requirement to evidence from files, command output, tests, git state, logs, or external docs inspected. If anything is missing, weakly verified, or uncertain, do not use done; choose continue or blocked with concrete nextSteps instead.

End report quality checklist:
- Scope and slice: exact absolute project path, adapter, and selected slice.
- Paths: use absolute paths for scope and human-readable changed-file evidence.
- Blocked Work and Pivoted Work Completed: include both sections; write \`none\` when no blocker or pivot exists.
- Changes: exact files plus what changed and why.
- Validation: each command with pass, fail, or not-run reason.
- Delivery: commit hash and push status, or why delivery was skipped.
- Blocker state: none, or the specific missing prerequisite or unsafe condition.
- Next step: one concrete action matched to continue, blocked, stop, or done.

End report anti-patterns to avoid: Do not write vague summaries like "fixed stuff" or "all good". Do not claim tests pass without naming the exact commands and outcomes. Do not choose continue when validation is red or required evidence is missing. Do not omit why commit or push was skipped.

Human-readable end report requirements, before DEV_GOAL_REPORT: Scope and selected slice; What changed and why with exact absolute file paths; Blocked Work and Pivoted Work Completed using \`none\`; validation evidence, commit/push evidence, blocker state; Possible next steps. For continue: name the next largest safe useful package. For blocked: name concrete unblocking actions, missing prerequisites, or credentials. For stop: name handoff or cleanup actions so the user can resume safely. Keep the machine-readable DEV_GOAL_REPORT and final markers last so the goal runner can parse them.

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

export function buildTransportErrorRetryPrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  return `Retry development goal iteration after provider transport error.

The previous model request ended with a provider transport error such as a WebSocket, socket, network, timeout, connection, or stream failure before trustworthy DEV_GOAL markers were emitted. Retry the same iteration from current repository state. Do not increment the goal iteration, do not restart from scratch, and do not request final-marker-only recovery solely because of provider transport error text.

${buildIterationPrompt(s, resolved, cwd)}`;
}

export function buildMissingMarkerRecoveryPrompt(s: LoopState): string {
  return `Return only the development goal final markers for iteration ${iterationProgress(s)}.

The previous assistant response was non-empty but did not end with the required DEV_GOAL markers. Do not redo the work, do not run new commands, and do not include a summary. If validation evidence is missing or red, choose DEV_GOAL_VALIDATED: no and DEV_GOAL_DECISION: blocked.

Use exactly these two final lines and nothing else:
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done`;
}

export function buildReportRepairPrompt(s: LoopState, issues: Array<{ code: string; message: string; value?: string }>): string {
  const issueLines = issues.map((issue) => `- ${issue.code}: ${issue.message}${issue.value ? ` (value: ${issue.value})` : ""}`).join("\n");
  return `Repair only the development goal final report for iteration ${iterationProgress(s)}.

The previous final report was malformed. Do not edit code. Do not change scope. Do not run task discovery. Do not run validation commands. Only rewrite the final report and final markers.

You must address these exact issue codes:
${issueLines || "- unknown_report_quality_issue: report quality validation failed"}

Return the corrected human-readable final report, DEV_GOAL_REPORT, DEV_GOAL_VALIDATED, and DEV_GOAL_DECISION. Keep the original work, validation evidence, decision intent, and changed-file evidence unless one of the issue codes requires correcting that evidence.`;
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

export function buildGrillGoalPrompt(_s: LoopState, resolved: ResolvedProjectAdapter, cwd: string, seedTopic: string): string {
  const language = resolved.config.language || DEFAULT_LANGUAGE;
  const seed = seedTopic.trim() || resolved.config.defaultTopic || resolved.adapter.defaultTopic;
  return `Use the grill-me skill in ${language} to define the next Development Goal objective.

Project root: ${cwd}
Adapter: ${resolved.adapter.name} — ${resolved.adapter.description}
Preferred language: ${language}
Seed objective: ${seed}

Use grill-me self-answer-first mode:
- Answer easy/source-backed gaps yourself from repo instructions, docs, git state, and current context.
- Ask the user only for hard owner-decision, risk-acceptance, or pivot questions.
- Ask one question at a time, in ${language}, with your recommended answer and consequence.
- If no hard question remains, do not ask; choose the next clear Development Goal objective.

When the next goal is clear, end with exactly this marker line:
DEV_GOAL_NEXT_TOPIC: <one concise Development Goal objective>

If the next goal cannot be selected safely, end with exactly this marker line:
DEV_GOAL_NEXT_BLOCKED: <specific blocker>

After DEV_GOAL_NEXT_TOPIC appears, the extension will start /development-goal automatically for that objective. Do not edit files, commit, push, deploy, or run validation during this planning turn unless source inspection is necessary to answer an easy gap.`;
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
