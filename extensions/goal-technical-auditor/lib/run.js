import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

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

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 50 * 1024;

function bounded(value) {
  const text = String(value ?? "");
  return Buffer.byteLength(text) <= MAX_OUTPUT_BYTES ? text : `${text.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
}

async function runProcess(command, args, { cwd, signal, allowFailure = false } = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      signal,
      maxBuffer: 2 * MAX_OUTPUT_BYTES,
      encoding: "utf8",
    });
    return { code: 0, stdout: bounded(result.stdout), stderr: bounded(result.stderr) };
  } catch (error) {
    const result = {
      code: Number.isInteger(error.code) ? error.code : 1,
      stdout: bounded(error.stdout),
      stderr: bounded(error.stderr || error.message),
    };
    if (allowFailure) return result;
    throw new Error(`${command} ${args.join(" ")} failed (${result.code}): ${result.stderr || result.stdout}`);
  }
}

async function git(cwd, args, options = {}) {
  return runProcess("git", args, { cwd, ...options });
}

export async function runValidation(cwd, commands, { signal } = {}) {
  const receipts = [];
  for (const command of commands) {
    const result = await runProcess(process.env.SHELL || "/bin/sh", ["-lc", command], {
      cwd,
      signal,
      allowFailure: true,
    });
    receipts.push({ command, ...result });
    if (result.code !== 0) return { ok: false, receipts };
  }
  return { ok: true, receipts };
}

export async function inspectRepository(cwd, { signal } = {}) {
  const root = (await git(cwd, ["rev-parse", "--show-toplevel"], { signal })).stdout.trim();
  const branchResult = await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { signal, allowFailure: true });
  if (branchResult.code !== 0 || !branchResult.stdout.trim()) throw new Error("Goal technical auditor requires a checked-out branch.");
  const branch = branchResult.stdout.trim();
  const head = (await git(root, ["rev-parse", "HEAD"], { signal })).stdout.trim();
  const upstreamResult = await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { signal, allowFailure: true });
  return { root, branch, head, upstream: upstreamResult.code === 0 ? upstreamResult.stdout.trim() : null };
}

export async function worktreePaths(cwd, { signal } = {}) {
  const result = await git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { signal });
  const fields = result.stdout.split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    const status = entry.slice(0, 2);
    paths.push(entry.slice(3));
    if (/[RC]/.test(status)) index += 1;
  }
  return [...new Set(paths)].sort();
}

export async function detectSecretRisks(cwd, { signal } = {}) {
  const riskyNames = /(^|\/)(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|credentials(?:\..*)?|.*\.(?:pem|p12|pfx|key))$/i;
  const secretText = /(?:BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:api[_-]?key|secret|token|password)\s*[:=]\s*[^\s]{8,})/i;
  const paths = await worktreePaths(cwd, { signal });
  const risks = paths.filter((path) => riskyNames.test(path)).map((path) => `suspicious path: ${path}`);
  const diff = await git(cwd, ["diff", "HEAD", "--no-ext-diff", "--unified=0", "--", "."], { signal, allowFailure: true });
  if (secretText.test(diff.stdout)) risks.push("suspicious credential-like content in tracked diff (value redacted)");
  for (const path of paths) {
    if (risks.some((risk) => risk.endsWith(path))) continue;
    try {
      const content = await readFile(resolve(cwd, path), "utf8");
      if (secretText.test(content)) risks.push(`suspicious credential-like content: ${path} (value redacted)`);
    } catch {}
  }
  return [...new Set(risks)];
}

export async function commitAll(cwd, message, { signal } = {}) {
  await git(cwd, ["add", "-A"], { signal });
  const staged = await git(cwd, ["diff", "--cached", "--quiet"], { signal, allowFailure: true });
  if (staged.code === 0) return null;
  await git(cwd, ["-c", "commit.gpgsign=false", "commit", "-m", message], { signal });
  return (await git(cwd, ["rev-parse", "HEAD"], { signal })).stdout.trim();
}

export async function stashAll(cwd, message, { signal } = {}) {
  if ((await worktreePaths(cwd, { signal })).length === 0) return null;
  await git(cwd, ["stash", "push", "--include-untracked", "-m", message], { signal });
  return (await git(cwd, ["stash", "list", "-1", "--format=%gd"], { signal })).stdout.trim();
}

let mutationQueueModule;

async function withLedgerMutationQueue(path, mutation) {
  mutationQueueModule ??= import("@earendil-works/pi-coding-agent").catch((error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  });
  const module = await mutationQueueModule;
  return module?.withFileMutationQueue ? module.withFileMutationQueue(path, mutation) : mutation();
}

export async function writeRunLedger(run) {
  return withLedgerMutationQueue(run.ledgerPath, async () => {
    await mkdir(dirname(run.ledgerPath), { recursive: true });
    await writeFile(run.ledgerPath, renderAuditLedger(run), "utf8");
    return run.ledgerPath;
  });
}

export function isProtectedBranch(branch, defaultBranch) {
  return branch === "main" || branch === "master" || branch === defaultBranch;
}

export async function resolvePushTarget(cwd, run, { signal } = {}) {
  if (run.upstream) {
    const [remote, ...branchParts] = run.upstream.split("/");
    const defaultResult = await git(cwd, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`], { signal, allowFailure: true });
    return {
      remote,
      branch: branchParts.join("/"),
      setUpstream: false,
      defaultBranch: defaultResult.code === 0 ? defaultResult.stdout.trim().replace(`${remote}/`, "") : null,
    };
  }

  const remotes = (await git(cwd, ["remote"], { signal })).stdout.trim().split(/\s+/).filter(Boolean);
  if (remotes.length !== 1) throw new Error(`Expected exactly one Git remote without an upstream; found ${remotes.length}.`);
  const remote = remotes[0];
  const defaultResult = await git(cwd, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`], { signal, allowFailure: true });
  return {
    remote,
    branch: run.branch,
    setUpstream: true,
    defaultBranch: defaultResult.code === 0 ? defaultResult.stdout.trim().replace(`${remote}/`, "") : null,
  };
}

export async function pushRun(cwd, target, { signal } = {}) {
  const args = target.setUpstream
    ? ["push", "--set-upstream", target.remote, `HEAD:${target.branch}`]
    : ["push", target.remote, `HEAD:${target.branch}`];
  await git(cwd, args, { signal });
  return target;
}

function withReceiptCommit(run, commit) {
  return commit ? { ...run, commits: [...run.commits, commit], latestGreenCommit: commit } : run;
}

export async function deliverRun(run, { cwd = run.cwd, signal, hasUI, confirmProtectedBranch } = {}) {
  requirePhase(run, ["delivery_pending"], "deliver");
  const repo = await inspectRepository(cwd, { signal });
  if (repo.branch !== run.branch || repo.head !== run.latestGreenCommit) {
    return {
      run: applyRunEvent(run, {
        type: "blocked",
        reason: `Git drift before push: expected ${run.branch}@${run.latestGreenCommit}, found ${repo.branch}@${repo.head}.`,
      }),
      message: "Delivery blocked by Git drift.",
    };
  }
  if ((await worktreePaths(cwd, { signal })).length) {
    return {
      run: applyRunEvent(run, { type: "blocked", reason: "Worktree became dirty before push." }),
      message: "Delivery blocked by dirty worktree.",
    };
  }

  const target = await resolvePushTarget(cwd, run, { signal });
  if (isProtectedBranch(run.branch, target.defaultBranch)) {
    if (!hasUI) {
      return {
        run: applyRunEvent(run, {
          type: "blocked",
          reason: `Confirmation required before pushing protected/default branch ${run.branch}.`,
        }),
        message: "Protected branch push requires interactive confirmation.",
      };
    }
    const confirmed = await confirmProtectedBranch(run.branch, target.remote);
    if (!confirmed) {
      return {
        run: applyRunEvent(run, {
          type: "blocked",
          reason: `User declined push of protected/default branch ${run.branch}.`,
        }),
        message: "Protected branch push declined.",
      };
    }
  }

  await pushRun(cwd, target, { signal });
  return {
    run: applyRunEvent(run, { type: "push_succeeded", remote: target.remote, branch: target.branch }),
    message: `Pushed ${target.branch} to ${target.remote}; call goal_complete with verification evidence.`,
  };
}

export async function processCheckpoint(run, params, { cwd, signal } = {}) {
  const root = cwd ?? run.cwd;

  switch (params.action) {
    case "preflight": {
      const risks = await detectSecretRisks(root, { signal });
      if (risks.length) throw new Error(`Preflight blocked:\n${risks.join("\n")}`);
      const commands = [...new Set([...params.focusedValidationCommands, ...params.projectValidationCommands])];
      const validation = await runValidation(root, commands, { signal });
      const baselineCommit = await commitAll(root, "chore: checkpoint before autonomous audit", { signal })
        ?? (await inspectRepository(root, { signal })).head;
      const next = applyRunEvent(run, {
        type: "preflight_recorded",
        baselineCommit,
        latestGreenCommit: baselineCommit,
        focusedValidationCommands: params.focusedValidationCommands,
        projectValidationCommands: params.projectValidationCommands,
        receipts: validation.receipts,
      });
      await writeRunLedger(next);
      return {
        run: next,
        message: validation.ok
          ? "Preflight recorded; run the initial audit."
          : "Baseline validation failed and was recorded as Milestone 0 evidence; run the initial audit.",
      };
    }
    case "record_audit": {
      const unexpected = (await worktreePaths(root, { signal }))
        .filter((path) => resolve(root, path) !== resolve(run.ledgerPath));
      if (unexpected.length) throw new Error(`Audit phase contains production changes: ${unexpected.join(", ")}`);
      let next = applyRunEvent(run, { type: "audit_recorded", findings: params.findings });
      await writeRunLedger(next);
      const receiptCommit = await commitAll(root, `docs: record technical audit pass ${next.auditPass}`, { signal });
      next = withReceiptCommit(next, receiptCommit);
      return {
        run: next,
        message: next.phase === "implementing"
          ? "Audit recorded; begin one pending finding."
          : "Clean audit recorded; request final validation.",
      };
    }
    case "begin_finding": {
      const paths = await worktreePaths(root, { signal });
      if (paths.length) throw new Error(`Cannot begin a finding with a dirty worktree: ${paths.join(", ")}`);
      const head = (await inspectRepository(root, { signal })).head;
      return {
        run: applyRunEvent(run, { type: "finding_started", findingId: params.findingId, sliceBaseCommit: head }),
        message: `Finding ${params.findingId} active; implement only this finding.`,
      };
    }
    case "validate_finding": {
      const active = run.findings.find((finding) => finding.status === "active");
      if (!active) throw new Error("No active finding to validate.");
      const repo = await inspectRepository(root, { signal });
      if (repo.head !== run.sliceBaseCommit) throw new Error(`Git drift during ${active.id}: expected ${run.sliceBaseCommit}, found ${repo.head}.`);
      const commands = [...new Set([...run.focusedValidationCommands, ...run.projectValidationCommands])];
      const validation = await runValidation(root, commands, { signal });
      if (validation.ok) {
        const risks = await detectSecretRisks(root, { signal });
        if (risks.length) throw new Error(`Commit blocked:\n${risks.join("\n")}`);
        const codeCommit = await commitAll(root, `fix: resolve audit finding ${active.id}`, { signal });
        if (!codeCommit) throw new Error(`Finding ${active.id} produced no committable changes.`);
        let next = applyRunEvent(run, { type: "finding_fixed", receipts: validation.receipts, commit: codeCommit });
        await writeRunLedger(next);
        const ledgerCommit = await commitAll(root, `docs: record audit finding ${active.id}`, { signal });
        next = withReceiptCommit(next, ledgerCommit);
        return {
          run: next,
          message: `Finding ${active.id} validated and committed; begin the next pending finding or request re-audit.`,
        };
      }
      if (active.attempts < 1) {
        return {
          run: applyRunEvent(run, { type: "finding_validation_failed", receipts: validation.receipts }),
          message: `Validation failed for ${active.id}; repair once, then validate again.`,
        };
      }
      const stashRef = await stashAll(root, `goal-auditor failed ${active.id}`, { signal });
      let next = applyRunEvent(run, { type: "finding_validation_failed", receipts: validation.receipts, stashRef });
      await writeRunLedger(next);
      const ledgerCommit = await commitAll(root, `docs: record failed audit finding ${active.id}`, { signal });
      next = withReceiptCommit(next, ledgerCommit);
      return {
        run: next,
        message: `Finding ${active.id} failed twice; preserved as ${stashRef} and restored the green branch. Continue with an independent finding.`,
      };
    }
    case "defer_finding": {
      const dirty = await worktreePaths(root, { signal });
      const stashRef = dirty.length ? await stashAll(root, `goal-auditor ${params.status} ${params.findingId}`, { signal }) : null;
      let next = applyRunEvent(run, {
        type: "finding_deferred",
        findingId: params.findingId,
        status: params.status,
        reason: params.reason,
        stashRef,
      });
      await writeRunLedger(next);
      const commit = await commitAll(root, `docs: ${params.status} audit finding ${params.findingId}`, { signal });
      next = withReceiptCommit(next, commit);
      return {
        run: next,
        message: `Finding ${params.findingId} marked ${params.status}${stashRef ? `; preserved work as ${stashRef}` : ""}.`,
      };
    }
    case "request_reaudit": {
      let next = applyRunEvent(run, { type: "reaudit_requested" });
      await writeRunLedger(next);
      const commit = await commitAll(root, "docs: begin technical re-audit", { signal });
      next = withReceiptCommit(next, commit);
      return { run: next, message: "Run Technical Auditor Full mode again on the same scope." };
    }
    case "finalize": {
      if (run.phase === "delivery_pending") return { run, message: "Final validation is already committed; resume delivery." };
      const blocker = completionBlocker({ ...run, phase: "ready_to_complete" });
      if (blocker) throw new Error(blocker);
      const commands = [...new Set([...run.focusedValidationCommands, ...run.projectValidationCommands])];
      const validation = await runValidation(root, commands, { signal });
      if (!validation.ok) {
        const failed = validation.receipts.find((receipt) => receipt.code !== 0);
        throw new Error(`Final validation failed: ${failed.command}`);
      }
      let next = applyRunEvent(run, { type: "final_validation_passed", receipts: validation.receipts });
      await writeRunLedger(next);
      const ledgerCommit = await commitAll(root, "docs: finalize technical audit ledger", { signal });
      next = withReceiptCommit(next, ledgerCommit);
      if ((await worktreePaths(root, { signal })).length) throw new Error("Final worktree is not clean after ledger commit.");
      return { run: next, message: "Final validation passed and ledger committed; deliver the run." };
    }
    default:
      throw new Error(`Unknown checkpoint action: ${params.action}`);
  }
}
