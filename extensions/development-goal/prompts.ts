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
import { objectiveIntakeSummary, objectiveNeedsBroadScouting, promptObjectiveText } from "./topic.ts";

export const PROMPT_OBJECTIVE_MAX = 360;

export const TASK_DISCOVERY_CUES = [
  "repo-local skills matching work",
  "TODO/PLAN/ROADMAP files",
  "progress/status/backlog/task trackers",
  "PR/MR/CL or Greptile only when in scope",
  "docs/plans, docs/adr, docs/roadmap, issues",
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
    ? "Explicit scope expansion is allowed; after known queue empty, run bounded discovery."
    : scopeExpansionPolicy.requireReviewOnEmptyQueue
      ? "Do not invent more work when the discovered queue is empty; stop with DEV_GOAL_DECISION: stop and final_status review_needed."
      : "Scope expansion not explicit; prefer stopping unless next slice is source-backed.";
  const commitPolicy = s.commit
    ? s.push
      ? "Commit validated coherent slice, then push current branch when worktree safe."
      : "Commit validated coherent slice when worktree safe; do not push."
    : "Do not commit/push unless user asks later.";
  const pushSafetyPolicy = s.push
    ? "Before pushing, inspect `git status --short --branch` for ahead/behind/diverged state. If behind/diverged, do not force-push or repair history without explicit approval; block with blockerState mentioning git_push_fetch_first and nextSteps: fetch/rebase/merge, validation, push."
    : undefined;
  const worktreeScopePolicy = s.allWorktreeChangesInScope
    ? "All current worktree changes in scope for git delivery; still reject secrets/caches/vendors/unsafe artifacts with exact paths."
    : "Preserve unrelated dirty work. Stage only files in this iteration.";

  const commandIntentGuidance = s.commandIntent ? `Direct command intent:\n${s.commandIntent}\n` : "";
  const requiredSkillGuidance = s.requiredSkill
    ? `Direct skill command: ${s.requiredSkill}\nInvoke the ${s.requiredSkill} skill as the primary architecture workflow before selecting or editing code. Treat this as required command intent, not a generic suggestion.\n`
    : "";
  const iterationLabel = iterationProgress(s);
  const capNote = hasIterationCap(s)
    ? "Legacy cap active; continue until done or cap."
    : "No max-iteration stop; continue until done/blocked/paused/stopped.";
  const broadScout = objectiveNeedsBroadScouting(s.topic, PROMPT_OBJECTIVE_MAX);
  const openingLine = broadScout
    ? `Development Goal iteration ${iterationLabel}: Broad scout. Start with improve-codebase-architecture as lightweight architecture scout, then grill-me self-answer-first. Ask only hard owner-decision/pivot questions. Caveman mode: always on; terse, no filler.`
    : `Development Goal iteration ${iterationLabel}: Direct slice. Concrete objective; skip architecture/grill scouting unless blocked by real design uncertainty. Caveman mode: always on; terse, no filler.`;
  const protocolStep3 = broadScout
    ? `Broad path: choose largest safe useful slice via Intent -> Oracle -> Surface -> Work package -> Proof. For broad work, inspect: ${TASK_DISCOVERY_CUES.join("; ")}.`
    : "Direct path: objective already names slice; inspect only needed files/tests, skip architecture/grill scouting, do not browse TODO/roadmap unless needed.";
  const promptSkills = broadScout ? skills : skills.filter((skill) => !/^improve-codebase-architecture\b|^grill-me\b/i.test(skill));
  const skillsText = promptSkills.length ? promptSkills.map(compactSkillPrompt).join("; ") : "project-matching skill set";
  const preflightText = preflightCommands.join("; ");
  const validationText = validationCommands.join("; ");
  const stopText = stopConditions.map(compactStopCondition).join("; ");
  const pushSafetyLine = pushSafetyPolicy ? `\n- ${pushSafetyPolicy}` : "";

  return `${openingLine}

Root: ${cwd}
Adapter: ${adapter.name} — ${adapter.description}
Run id: ${s.runId || "legacy"}
Topic/objective: ${promptObjectiveText(s.topic, PROMPT_OBJECTIVE_MAX)}
Objective intake: ${objectiveIntakeSummary(s.topic, PROMPT_OBJECTIVE_MAX)}
Language: ${language}
Config/log: ${resolved.configLoaded ? relativeToCwd(cwd, resolved.configPath) : "built-in adapter defaults"}; ${relativeToCwd(cwd, s.logPath)}
Budget: ${loopBudgetSummary(s)}; ${capNote}

Skills: ${skillsText}

${requiredSkillGuidance}${commandIntentGuidance}Fast protocol:
1. Scope lock: ${cwd} with adapter ${adapter.name}; read AGENTS/CONTEXT and relevant repo-local skills.
2. Preflight before edits: ${preflightText}
3. ${protocolStep3}
4. Proof: use real interface when practical; avoid weak tests. For non-trivial work check state ownership, feedback/validation, blast radius, and ordering.
5. Validation before DEV_GOAL_VALIDATED: yes: ${validationText}
6. Delivery: ${commitPolicy}${pushSafetyLine}\n- ${worktreeScopePolicy}
7. Stop/block: ${stopText}

Scope expansion: ${scopeExpansionGuidance}
Greptile/review: explicit review context + gh/glab/p4 + auth only; else block with missing prereq. No comments/resolution/push/reshelve unless delivery policy allows.

Final report contract (keep last):
Human lines required: Scope; Selected slice; Changed files with absolute paths and why; Validation evidence; Commit/push evidence; Blocker state; Blocked Work; Pivoted Work Completed; Possible next steps.
DEV_GOAL_REPORT JSON fields: validated, decision, summary, blockerState, blockedWork, pivotedWorkCompleted, nextSteps, changedFiles (absolute), validationCommands, commitHash, pushStatus.
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done
Decision rules: yes only after validation evidence. continue=green slice + more goal work. blocked=red/evidence missing/unsafe/missing prereq. stop=handoff/review. done=objective mapped to evidence; nextSteps optional review/PR/handoff only.
Quality: Blocked Work + Pivoted Work Completed required (write none); absolute human paths; no vague changedFiles/summary; DEV_GOAL_REPORT + markers last. One repair-only retry; no edits/discovery/validation rerun.`;

}

function compactSkillPrompt(skill: string): string {
  return skill
    .replace(/repo-local skills that match the detected task before package defaults/i, "repo-local skills first")
    .replace(/greploop for PR\/MR\/CL review cleanup when Greptile is installed and external review actions are explicitly allowed/i, "greploop only explicit authenticated review cleanup")
    .replace(/zoom-out for source-backed project understanding/i, "zoom-out source map")
    .replace(/writing-plans for multi-step plans when available/i, "writing-plans")
    .replace(/writing-shape for docs, articles, READMEs, and narrative docs/i, "writing-shape docs")
    .replace(/writing-skills for creating or updating skills/i, "writing-skills")
    .replace(/test-driven-development for code changes/i, "tdd for code")
    .replace(/verification-before-completion before reporting done/i, "verify before done");
}

function compactStopCondition(condition: string): string {
  return condition
    .replace(/project instructions are missing or conflict with the requested work/i, "project instructions missing/conflict")
    .replace(/no task can be selected after inspecting TODO\.md, progress\.json, planning files, and repo-local guidance/i, "no task after TODO/progress/plans/repo guidance")
    .replace(/no relevant test\/build command can be identified/i, "no relevant test/build command")
    .replace(/Greptile, gh\/glab\/p4, credentials, or PR\/MR\/CL context are required for greploop and unavailable/i, "greploop prereq unavailable")
    .replace(/validation fails twice with the same blocker/i, "validation fails twice same blocker")
    .replace(/commit or push would include unrelated dirty work/i, "commit/push would include unrelated dirty work");
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
  return `Use the grill-me skill in ${language} to define the next Development Goal objective. Caveman mode: always on; terse, no filler.

Root: ${cwd}
Adapter: ${resolved.adapter.name} — ${resolved.adapter.description}
Language: ${language}
Seed objective: ${seed}

Self-answer easy/source-backed gaps from repo instructions, docs, git state, context. Ask only hard owner-decision, risk-acceptance, or pivot questions; one at a time with recommended answer + consequence. If none remain, choose next clear Development Goal objective.

When clear, end exactly:
DEV_GOAL_NEXT_TOPIC: <one concise Development Goal objective>

If unsafe/blocked, end exactly:
DEV_GOAL_NEXT_BLOCKED: <specific blocker>

After DEV_GOAL_NEXT_TOPIC, extension starts /development-goal automatically. Do not edit, commit, push, deploy, or validate unless source inspection is needed to answer easy gap.`;
}

export function buildSteeringPrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string, steeringText: string): string {
  const adapter = resolved.adapter;
  return `Development goal steering request. Caveman mode: always on; terse, no filler.

Root: ${cwd}
Adapter: ${adapter.name} — ${adapter.description}
Iteration: ${iterationProgress(s)}
Current objective: ${promptObjectiveText(s.topic, PROMPT_OBJECTIVE_MAX)}
User steering request: ${steeringText}

Fold steering into current/next safe work package. Preserve unrelated dirty work. Run configured validation before continue/done.

End exactly:
DEV_GOAL_VALIDATED: yes|no
DEV_GOAL_DECISION: continue|stop|blocked|done

DEV_GOAL_VALIDATED: yes only with validation evidence. Use blocked for red validation, missing evidence, unsafe scope, or missing credentials/external service.`;
}
