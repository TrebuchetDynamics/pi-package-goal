export const RUN_ENTRY_TYPE = "goal-technical-auditor-run";
export const CHECKPOINT_TOOL_NAME = "technical_auditor_checkpoint";

const CONTINUABLE_PHASES = new Set(["preflight", "auditing", "implementing", "re_auditing", "final_validation", "delivery_pending"]);
const FINDING_TERMINAL = new Set(["fixed", "deferred", "blocked"]);

export function createAuditRun({ id, cwd, branch, upstream = null, scope, objective, tokenBudget, ledgerPath, now = Date.now() }) {
  return {
    version: 1,
    id,
    cwd,
    branch,
    upstream,
    scope,
    objective,
    tokenBudget,
    ledgerPath,
    phase: "preflight",
    resumePhase: null,
    auditPass: 0,
    cleanAuditPass: null,
    baselineCommit: null,
    latestGreenCommit: null,
    sliceBaseCommit: null,
    focusedValidationCommands: [],
    projectValidationCommands: [],
    findings: [],
    receipts: [],
    commits: [],
    stashes: [],
    delivery: null,
    blocker: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function restoreAuditRun(entries = []) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "custom" && entry.customType === RUN_ENTRY_TYPE && entry.data?.run) return entry.data.run;
  }
  return null;
}

function requirePhase(run, phases, event) {
  if (!phases.includes(run.phase)) throw new Error(`${event} is invalid during ${run.phase}; expected ${phases.join(" or ")}.`);
}

function replaceFinding(run, findingId, update) {
  const index = run.findings.findIndex((finding) => finding.id === findingId);
  if (index < 0) throw new Error(`Unknown finding: ${findingId}`);
  const findings = [...run.findings];
  findings[index] = { ...findings[index], ...update };
  return findings;
}

function activeFinding(run) {
  return run.findings.find((finding) => finding.status === "active") ?? null;
}

export function applyRunEvent(run, event) {
  const now = event.now ?? Date.now();
  let next;

  switch (event.type) {
    case "preflight_recorded": {
      requirePhase(run, ["preflight"], event.type);
      const baselineFindings = (event.receipts ?? [])
        .filter((receipt) => receipt.code !== 0)
        .map((receipt, index) => ({
          id: `M0-${index + 1}`,
          title: `Restore failing baseline: ${receipt.command}`,
          severity: "High",
          evidence: `Baseline command exited ${receipt.code}`,
          recommendation: `Repair ${receipt.command} before final delivery`,
          safe: true,
          status: "pending",
          attempts: 0,
          auditPass: 0,
          receipts: [receipt],
          commit: null,
          stashRef: null,
          reason: null,
        }));
      next = {
        ...run,
        phase: "auditing",
        baselineCommit: event.baselineCommit,
        latestGreenCommit: event.latestGreenCommit,
        focusedValidationCommands: [...event.focusedValidationCommands],
        projectValidationCommands: [...event.projectValidationCommands],
        receipts: [...run.receipts, ...(event.receipts ?? [])],
        findings: [...run.findings, ...baselineFindings],
      };
      break;
    }
    case "audit_recorded": {
      requirePhase(run, ["auditing", "re_auditing"], event.type);
      const existing = new Set(run.findings.map((finding) => finding.id));
      const additions = event.findings
        .filter((finding) => !existing.has(finding.id))
        .map((finding) => ({
          ...finding,
          status: "pending",
          attempts: 0,
          auditPass: run.auditPass + 1,
          receipts: [],
          commit: null,
          stashRef: null,
          reason: null,
        }));
      const findings = [...run.findings, ...additions];
      const actionable = findings.some((finding) => !FINDING_TERMINAL.has(finding.status));
      next = {
        ...run,
        phase: actionable ? "implementing" : "final_validation",
        auditPass: run.auditPass + 1,
        cleanAuditPass: additions.length ? null : run.auditPass + 1,
        findings,
      };
      break;
    }
    case "finding_started":
      requirePhase(run, ["implementing"], event.type);
      if (activeFinding(run)) throw new Error(`Finding ${activeFinding(run).id} is already active.`);
      if (run.findings.find((finding) => finding.id === event.findingId)?.status !== "pending") throw new Error(`Finding ${event.findingId} is not pending.`);
      next = { ...run, sliceBaseCommit: event.sliceBaseCommit, findings: replaceFinding(run, event.findingId, { status: "active" }) };
      break;
    case "finding_fixed": {
      requirePhase(run, ["implementing"], event.type);
      const finding = activeFinding(run);
      if (!finding) throw new Error("No active finding to fix.");
      next = {
        ...run,
        latestGreenCommit: event.commit,
        sliceBaseCommit: null,
        receipts: [...run.receipts, ...event.receipts],
        commits: [...run.commits, event.commit],
        findings: replaceFinding(run, finding.id, { status: "fixed", receipts: event.receipts, commit: event.commit }),
      };
      break;
    }
    case "finding_validation_failed": {
      requirePhase(run, ["implementing"], event.type);
      const finding = activeFinding(run);
      if (!finding) throw new Error("No active finding to validate.");
      const attempts = finding.attempts + 1;
      next = {
        ...run,
        sliceBaseCommit: attempts >= 2 ? null : run.sliceBaseCommit,
        receipts: [...run.receipts, ...event.receipts],
        stashes: event.stashRef ? [...run.stashes, event.stashRef] : run.stashes,
        findings: replaceFinding(run, finding.id, {
          status: attempts >= 2 ? "failed" : "active",
          attempts,
          receipts: [...finding.receipts, ...event.receipts],
          stashRef: event.stashRef ?? finding.stashRef,
        }),
      };
      break;
    }
    case "finding_deferred":
      requirePhase(run, ["implementing"], event.type);
      if (!new Set(["deferred", "blocked"]).has(event.status)) throw new Error("Deferred finding status must be deferred or blocked.");
      next = {
        ...run,
        sliceBaseCommit: null,
        stashes: event.stashRef ? [...run.stashes, event.stashRef] : run.stashes,
        findings: replaceFinding(run, event.findingId, {
          status: event.status,
          reason: event.reason,
          stashRef: event.stashRef ?? null,
        }),
      };
      break;
    case "reaudit_requested":
      requirePhase(run, ["implementing"], event.type);
      if (run.findings.some((finding) => !FINDING_TERMINAL.has(finding.status))) throw new Error("Cannot re-audit while actionable findings remain.");
      next = { ...run, phase: "re_auditing" };
      break;
    case "final_validation_passed":
      requirePhase(run, ["final_validation"], event.type);
      if (completionBlocker({ ...run, phase: "ready_to_complete" })) throw new Error(completionBlocker({ ...run, phase: "ready_to_complete" }));
      next = {
        ...run,
        phase: "delivery_pending",
        receipts: [...run.receipts, ...event.receipts],
        commits: event.ledgerCommit ? [...run.commits, event.ledgerCommit] : run.commits,
      };
      break;
    case "push_succeeded":
      requirePhase(run, ["delivery_pending"], event.type);
      next = { ...run, phase: "ready_to_complete", delivery: { remote: event.remote, branch: event.branch, pushedAt: now } };
      break;
    case "paused":
    case "blocked":
      next = {
        ...run,
        phase: event.type,
        resumePhase: CONTINUABLE_PHASES.has(run.phase) ? run.phase : run.resumePhase,
        blocker: event.reason ?? null,
      };
      break;
    case "resumed":
      requirePhase(run, ["paused", "blocked"], event.type);
      next = { ...run, phase: run.resumePhase, resumePhase: null, blocker: null };
      break;
    case "aborted":
      next = { ...run, phase: "aborted", resumePhase: null, blocker: event.reason ?? "aborted by user" };
      break;
    case "completed":
      requirePhase(run, ["ready_to_complete"], event.type);
      next = { ...run, phase: "complete" };
      break;
    default:
      throw new Error(`Unknown run event: ${event.type}`);
  }

  return { ...next, updatedAt: now };
}

export function completionBlocker(run) {
  const unresolved = run.findings.find((finding) => !FINDING_TERMINAL.has(finding.status));
  if (unresolved) return `Finding ${unresolved.id} is ${unresolved.status}.`;
  if (!run.cleanAuditPass) return "A clean re-audit pass is required.";
  if (!new Set(["ready_to_complete", "complete"]).has(run.phase)) return `Run phase is ${run.phase}.`;
  return null;
}

export function nextRunAction(run) {
  const actions = {
    preflight: "submit preflight evidence and validation commands",
    auditing: "run Technical Auditor Full mode and record the audit",
    implementing: activeFinding(run) ? `repair or validate ${activeFinding(run).id}` : "begin the next pending finding or request re-audit",
    re_auditing: "run Technical Auditor Full mode again and record the audit",
    final_validation: "request final validation",
    delivery_pending: "resume final delivery",
    ready_to_complete: "call goal_complete with verification evidence",
    paused: "resume the run",
    blocked: "resolve the blocker and resume",
    aborted: "start a new run",
    complete: "no action",
  };
  return actions[run.phase] ?? "inspect run state";
}

export function formatRunStatus(run) {
  if (!run) return "No goal technical auditor run is recorded.";
  const counts = Object.groupBy(run.findings, (finding) => finding.status);
  const summary = Object.entries(counts).map(([status, findings]) => `${status}=${findings.length}`).join(", ") || "no findings";
  return `run: ${run.id}\nphase: ${run.phase}\nbranch: ${run.branch}\naudit pass: ${run.auditPass}\nfindings: ${summary}\nnext: ${nextRunAction(run)}`;
}

export function renderAuditLedger(run) {
  const findings = run.findings.length
    ? run.findings.map((finding) => `| ${finding.id} | ${finding.severity} | ${finding.status} | ${finding.title.replaceAll("|", "\\|")} | ${finding.evidence.replaceAll("|", "\\|")} | ${finding.commit ?? finding.stashRef ?? "—"} |`).join("\n")
    : "| — | — | — | No findings recorded | — | — |";
  const receipts = run.receipts.length
    ? run.receipts.map((receipt) => `- \`${receipt.command}\` — exit ${receipt.code}`).join("\n")
    : "- None recorded";

  return `# Goal Technical Auditor Ledger\n\n- Run: \`${run.id}\`\n- Phase: \`${run.phase}\`\n- Scope: \`${run.scope}\`\n- Branch: \`${run.branch}\`\n- Baseline commit: \`${run.baselineCommit ?? "not recorded"}\`\n- Latest green commit: \`${run.latestGreenCommit ?? "not recorded"}\`\n- Audit passes: ${run.auditPass}\n- Clean audit pass: ${run.cleanAuditPass ?? "not recorded"}\n\n## Objective\n\n${run.objective}\n\n## Findings\n\n| ID | Severity | Status | Title | Evidence | Commit / stash |\n| --- | --- | --- | --- | --- | --- |\n${findings}\n\n## Validation receipts\n\n${receipts}\n\n## Delivery\n\n${run.delivery ? `Pushed \`${run.delivery.branch}\` to \`${run.delivery.remote}\` in session state.` : "Final push not yet recorded in session state."}\n`;
}
