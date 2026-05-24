import {
  DEFAULT_LANGUAGE,
  ensureMandatorySkills,
  nonEmpty,
  type ResolvedProjectAdapter,
} from "./adapter.ts";
import { loopBudgetSummary } from "./budget.ts";
import { relativeToCwd } from "./files.ts";
import { iterationProgress, hasIterationCap, type LoopState } from "./state.ts";
import { resolveScopeExpansionPolicy } from "./scope-expansion.ts";
import { objectiveIntakeSummary, promptObjectiveText } from "./topic.ts";

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

  const skillsText = skills.length ? skills.map((skill) => `- ${skill}`).join("\n") : "- project-matching skill set";
  const preflightText = preflightCommands.map((command) => `- ${command}`).join("\n");
  const validationText = validationCommands.map((command) => `- ${command}`).join("\n");
  const stopText = stopConditions.map((condition) => `- ${condition}`).join("\n");
  const pushSafetyLine = pushSafetyPolicy ? `\n- ${pushSafetyPolicy}` : "";

  return `Development Goal iteration ${iterationLabel}: Start with improve-codebase-architecture as a lightweight architecture scout, then grill-me self-answer-first. Ask only hard owner-decision or pivot questions; if none remain, proceed.

Project root: ${cwd}
Adapter: ${adapter.name} — ${adapter.description}
Run id: ${s.runId || "legacy"}
Topic/objective: ${promptObjectiveText(s.topic, PROMPT_OBJECTIVE_MAX)}
Objective intake: ${objectiveIntakeSummary(s.topic, PROMPT_OBJECTIVE_MAX)}
Preferred language: ${language}
Config: ${resolved.configLoaded ? relativeToCwd(cwd, resolved.configPath) : "built-in adapter defaults"}; log: ${relativeToCwd(cwd, s.logPath)}
Budget: ${loopBudgetSummary(s)}; ${capNote}

Skills to consider:
${skillsText}

${requiredSkillGuidance}${commandIntentGuidance}Fast protocol:
1. Scope lock: ${cwd} with adapter ${adapter.name}; read AGENTS/CONTEXT and relevant repo-local skills.
2. Preflight before edits:
${preflightText}
3. Choose the largest safe useful slice using Intent -> Oracle -> Surface -> Work package -> Proof. For broad work, inspect: ${TASK_DISCOVERY_CUES.join("; ")}.
4. Test through the real interface when practical; avoid weak tests. For non-trivial work check state ownership, feedback/validation, blast radius, and ordering.
5. Validation required before DEV_GOAL_VALIDATED: yes:
${validationText}
6. Delivery: ${commitPolicy}${pushSafetyLine}\n- ${worktreeScopePolicy}
7. Stop/block when:
${stopText}

Scope expansion: ${scopeExpansionGuidance}
Review/Greptile: only when explicitly requested with review context and gh/glab/p4 + Greptile auth; do not trigger reviews/comments/resolution/push/reshelve unless delivery policy allows; block with missing prerequisite if unavailable.

Final report contract (keep last):
Human lines required: Scope; Selected slice; Changed files with absolute paths and why; Validation evidence; Commit/push evidence; Blocker state; Blocked Work; Pivoted Work Completed; Possible next steps.
DEV_GOAL_REPORT JSON: include validated, decision, summary, blockerState, blockedWork, pivotedWorkCompleted, nextSteps, changedFiles (absolute paths), validationCommands, commitHash and pushStatus when available.
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done
Decision rules: yes only after validation evidence. continue = validated and more objective work remains. blocked = validation red, evidence missing, unsafe scope, missing prereq, or unsafe delivery. stop = clean handoff/review. done = objective complete and every explicit requirement maps to evidence; done nextSteps may only be optional review/PR/handoff.
Report quality: include Blocked Work and Pivoted Work Completed (write none), use absolute human changed-file paths, avoid vague changedFiles/summary, and keep DEV_GOAL_REPORT plus markers last. Malformed reports get one repair-only final-report retry; repair retries must not edit code, change scope, discover tasks, or rerun validation.`;

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
  const remediationLines = reportRepairRemediationLines(issues).join("\n");
  return `Repair only the development goal final report for iteration ${iterationProgress(s)}.

The previous final report was malformed. Do not edit code. Do not change scope. Do not run task discovery. Do not run validation commands. Only rewrite the final report and final markers.

You must address these exact issue codes:
${issueLines || "- unknown_report_quality_issue: report quality validation failed"}

Repair guidance:
${remediationLines || "- Keep the original evidence, but rewrite it into the canonical final-report shape."}

Return the corrected human-readable final report, DEV_GOAL_REPORT, DEV_GOAL_VALIDATED, and DEV_GOAL_DECISION. Keep the original work, validation evidence, decision intent, and changed-file evidence unless one of the issue codes requires correcting that evidence.`;
}

function reportRepairRemediationLines(issues: Array<{ code: string; message: string; value?: string }>): string[] {
  const codes = new Set(issues.map((issue) => issue.code));
  const lines: string[] = [];
  if (codes.has("missing_blocked_work")) lines.push("- missing_blocked_work: add `Blocked Work: none` unless specific blocked work exists.");
  if (codes.has("missing_pivoted_work_completed")) lines.push("- missing_pivoted_work_completed: add `Pivoted Work Completed: none` unless a safe pivot was completed.");
  if (codes.has("relative_human_changed_file")) lines.push("- relative_human_changed_file: rewrite each human-readable Changed files entry with an absolute path rooted at the Scope path.");
  if (codes.has("vague_typed_changed_file")) lines.push("- vague_typed_changed_file: replace vague DEV_GOAL_REPORT.changedFiles entries with exact absolute file paths, or omit changedFiles when no files changed.");
  if (codes.has("done_with_actionable_next_step")) lines.push("- done_with_actionable_next_step: if more goal work remains, change DEV_GOAL_REPORT.decision and DEV_GOAL_DECISION to continue; keep done only for optional review/PR/handoff next steps.");
  return lines;
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
