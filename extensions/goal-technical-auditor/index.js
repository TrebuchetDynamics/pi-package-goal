import { relative } from "node:path";
import {
  DEFAULT_TOKEN_BUDGET,
  GOAL_TECHNICAL_AUDITOR_USAGE,
  goalTechnicalAuditorCompletions,
  parseGoalTechnicalAuditorCommand,
  validateGoalTechnicalAuditorLaunch,
} from "./lib/command.js";
import {
  CHECKPOINT_TOOL_NAME,
  RUN_ENTRY_TYPE,
  applyRunEvent,
  completionBlocker,
  createAuditRun,
  deliverRun,
  formatRunStatus,
  inspectRepository,
  nextRunAction,
  processCheckpoint,
  restoreAuditRun,
  worktreePaths,
} from "./lib/run.js";

const optional = (schema) => ({ ...schema, optional: true });
const stringEnum = (values) => ({ type: "string", enum: values });
const objectSchema = (properties) => ({
  type: "object",
  properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => {
    const { optional: _optional, ...schema } = value;
    return [key, schema];
  })),
  required: Object.entries(properties).filter(([, value]) => !value.optional).map(([key]) => key),
  additionalProperties: false,
});

export default function goalTechnicalAuditor(pi) {
  let run = null;

  function persistRun(ctx, next) {
    run = next;
    pi.appendEntry?.(RUN_ENTRY_TYPE, { run: next });
    ctx.ui.setStatus?.(RUN_ENTRY_TYPE, next ? `${next.phase}: ${next.scope}` : "");
  }

  function sendWhenReady(ctx, content) {
    pi.sendUserMessage(content, ctx.isIdle?.() === false ? { deliverAs: "followUp" } : undefined);
  }

  function syncCheckpointTool(state) {
    if (!pi.getActiveTools || !pi.setActiveTools) return;
    const active = new Set(pi.getActiveTools());
    if (state && !new Set(["complete", "aborted"]).has(state.phase)) active.add(CHECKPOINT_TOOL_NAME);
    else active.delete(CHECKPOINT_TOOL_NAME);
    pi.setActiveTools([...active]);
  }

  function validateCheckpointParams(params) {
    if (params.action === "preflight" && (!Array.isArray(params.focusedValidationCommands) || !Array.isArray(params.projectValidationCommands))) {
      throw new Error("preflight requires focusedValidationCommands and projectValidationCommands");
    }
    if (params.action === "preflight" && params.focusedValidationCommands.length + params.projectValidationCommands.length === 0) {
      throw new Error("preflight requires at least one validation command");
    }
    if (params.action === "record_audit" && !Array.isArray(params.findings)) throw new Error("record_audit requires findings");
    if (params.action === "begin_finding" && !params.findingId) throw new Error("begin_finding requires findingId");
    if (params.action === "defer_finding" && (!params.findingId || !params.status || !params.reason?.trim())) {
      throw new Error("defer_finding requires findingId, status, and reason");
    }
  }

  pi.registerTool?.({
    name: CHECKPOINT_TOOL_NAME,
    label: "Technical Auditor Checkpoint",
    description: "Advance the active goal technical auditor run through deterministic audit, validation, commit, recovery, and delivery gates.",
    promptSnippet: "Record and advance the active goal technical auditor controller run",
    promptGuidelines: ["Use technical_auditor_checkpoint for every goal technical auditor phase transition; do not claim completion without it."],
    parameters: objectSchema({
      action: stringEnum(["preflight", "record_audit", "begin_finding", "validate_finding", "defer_finding", "request_reaudit", "finalize"]),
      focusedValidationCommands: optional({ type: "array", items: { type: "string" } }),
      projectValidationCommands: optional({ type: "array", items: { type: "string" } }),
      findings: optional({
        type: "array",
        items: objectSchema({
          id: { type: "string" },
          title: { type: "string" },
          severity: stringEnum(["Critical", "High", "Medium", "Low"]),
          evidence: { type: "string" },
          recommendation: { type: "string" },
          safe: { type: "boolean" },
        }),
      }),
      findingId: optional({ type: "string" }),
      status: optional(stringEnum(["deferred", "blocked"])),
      reason: optional({ type: "string" }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!run || new Set(["complete", "aborted"]).has(run.phase)) throw new Error("No active goal technical auditor run.");
      validateCheckpointParams(params);
      let result = await processCheckpoint(run, params, { cwd: ctx.cwd, signal });
      if (result.run.phase === "delivery_pending") {
        result = await deliverRun(result.run, {
          cwd: ctx.cwd,
          signal,
          hasUI: ctx.hasUI,
          confirmProtectedBranch: (branch, remote) => ctx.ui.confirm("Push protected branch?", `Push ${branch} to ${remote}?`),
        });
      }
      persistRun(ctx, result.run);
      syncCheckpointTool(run);
      return {
        content: [{ type: "text", text: `${result.message}\nNext: ${nextRunAction(result.run)}` }],
        details: { run: result.run },
      };
    },
  });

  pi.registerCommand("goal-technical-auditor", {
    description: "Start a goal-driven technical-auditor Full-mode automation loop",
    getArgumentCompletions: (prefix, ctx = {}) => {
      const completions = goalTechnicalAuditorCompletions(prefix, ctx.cwd ?? process.cwd());
      return completions.length ? completions : null;
    },
    handler: async (args, ctx) => {
      const parsed = parseGoalTechnicalAuditorCommand(args);
      if (parsed.action === "error") {
        ctx.ui.notify(parsed.error, "warning");
        return;
      }
      if (parsed.action === "status") {
        ctx.ui.notify(formatRunStatus(run), "info");
        return;
      }
      if (parsed.action === "abort") {
        if (!run) {
          ctx.ui.notify("No goal technical auditor run is recorded.", "info");
          return;
        }
        persistRun(ctx, applyRunEvent(run, { type: "aborted", reason: "aborted by user" }));
        syncCheckpointTool(run);
        sendWhenReady(ctx, "/goal pause");
        return;
      }
      if (parsed.action === "resume") {
        if (!run) {
          ctx.ui.notify("No goal technical auditor run is recorded.", "warning");
          return;
        }
        if (new Set(["aborted", "complete"]).has(run.phase)) {
          ctx.ui.notify(`Run ${run.id} is ${run.phase}; start a new run instead.`, "warning");
          return;
        }
        const repo = await inspectRepository(ctx.cwd, { signal: ctx.signal });
        const paths = await worktreePaths(repo.root, { signal: ctx.signal });
        const expectedLedger = relative(repo.root, run.ledgerPath);
        const effectivePhase = new Set(["paused", "blocked"]).has(run.phase) ? run.resumePhase : run.phase;
        const activeSlice = run.findings.some((finding) => finding.status === "active");
        const worktreeMatchesPhase = effectivePhase === "preflight"
          || activeSlice
          || (effectivePhase === "auditing" && paths.every((path) => path === expectedLedger))
          || paths.length === 0;
        if (repo.branch !== run.branch || (run.latestGreenCommit && repo.head !== run.latestGreenCommit) || !worktreeMatchesPhase) {
          const blocked = applyRunEvent(run, {
            type: "blocked",
            reason: `Git drift: expected ${run.branch}@${run.latestGreenCommit}, found ${repo.branch}@${repo.head}; paths=${paths.join(", ") || "clean"}.`,
          });
          persistRun(ctx, blocked);
          ctx.ui.notify(blocked.blocker, "warning");
          return;
        }
        if (new Set(["paused", "blocked"]).has(run.phase)) persistRun(ctx, applyRunEvent(run, { type: "resumed" }));
        sendWhenReady(ctx, `Continue the goal technical auditor controller run. Next action: ${nextRunAction(run)}. Use technical_auditor_checkpoint.`);
        return;
      }

      const objective = parsed.objective;
      if (objective.help) {
        ctx.ui.notify(GOAL_TECHNICAL_AUDITOR_USAGE, "info");
        return;
      }
      const scopeError = validateGoalTechnicalAuditorLaunch(ctx.cwd ?? process.cwd(), objective);
      if (scopeError) {
        ctx.ui.notify(scopeError, "warning");
        return;
      }
      if (objective.dryRun) {
        ctx.ui.notify(`DRY RUN: /goal-technical-auditor\nscope: ${objective.scopeLabel}\nfocus: ${objective.focus || "none"}\ntokens: ${objective.tokenBudget || DEFAULT_TOKEN_BUDGET}\ncommand: ${objective.goalCommand}`, "info");
        return;
      }
      if (run && !new Set(["complete", "aborted"]).has(run.phase)) {
        ctx.ui.notify(`Run ${run.id} is still ${run.phase}; use status, resume, or abort.`, "warning");
        return;
      }

      const repo = await inspectRepository(ctx.cwd ?? process.cwd(), { signal: ctx.signal });
      const date = new Date().toISOString().slice(0, 10);
      const slug = objective.scope === "."
        ? "repo"
        : objective.scope.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      const objectiveStart = objective.goalCommand.indexOf("Run technical-auditor");
      const next = createAuditRun({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        cwd: repo.root,
        branch: repo.branch,
        upstream: repo.upstream,
        scope: objective.scope,
        objective: objective.goalCommand.slice(objectiveStart),
        tokenBudget: objective.tokenBudget,
        ledgerPath: `${repo.root}/docs/audits/${slug}-${date}-goal-technical-auditor.md`,
      });
      persistRun(ctx, next);
      syncCheckpointTool(run);
      ctx.ui.notify(`Starting controlled technical audit for ${objective.scopeLabel} on ${repo.branch}.`, "info");
      sendWhenReady(ctx, objective.goalCommand);
    },
  });

  pi.on?.("tool_call", (event) => {
    if (!new Set(["goal_complete", "update_goal"]).has(event.toolName) || !run || new Set(["complete", "aborted"]).has(run.phase)) return;
    const blocker = completionBlocker(run);
    if (blocker) return { block: true, reason: `Goal technical auditor controller blocked completion: ${blocker}` };
  });

  pi.on?.("tool_result", (event, ctx) => {
    if (!new Set(["goal_complete", "update_goal"]).has(event.toolName) || event.isError || run?.phase !== "ready_to_complete") return;
    persistRun(ctx, applyRunEvent(run, { type: "completed" }));
    syncCheckpointTool(run);
  });

  pi.on?.("session_start", (_event, ctx) => {
    run = restoreAuditRun(ctx.sessionManager.getBranch?.() ?? ctx.sessionManager.getEntries());
    syncCheckpointTool(run);
    ctx.ui.setStatus?.(RUN_ENTRY_TYPE, run ? `${run.phase}: ${run.scope}` : "");
  });

  pi.on?.("message_end", (event, ctx) => {
    if (event.message?.customType !== "pi-goal-event" || event.message.details?.kind !== "budget_limited") return;
    if (!run || new Set(["paused", "blocked", "aborted", "complete"]).has(run.phase)) return;
    persistRun(ctx, applyRunEvent(run, {
      type: "paused",
      reason: "The associated /goal reached its token budget; increase the budget before resume.",
    }));
  });
}
