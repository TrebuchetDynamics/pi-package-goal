import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  commitAll,
  createAuditRun,
  detectSecretRisks,
  inspectRepository,
  isProtectedBranch,
  processCheckpoint,
  pushRun,
  resolvePushTarget,
  runValidation,
  stashAll,
  worktreePaths,
  writeRunLedger,
} from "../extensions/goal-technical-auditor/lib/run.js";

const execFile = promisify(execFileCallback);
const git = (cwd, args) => execFile("git", args, { cwd });
const root = await mkdtemp(join(tmpdir(), "goal-auditor-git-"));
const repo = join(root, "repo");
const remote = join(root, "remote.git");
try {
  await mkdir(repo);
  await git(repo, ["init", "-b", "feature/audit"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Test User"]);
  await writeFile(join(repo, "package.json"), '{"scripts":{"test":"node check.mjs"}}\n');
  await writeFile(join(repo, "check.mjs"), 'console.log("ok")\n');
  await git(repo, ["add", "."]);
  await git(repo, ["-c", "commit.gpgsign=false", "commit", "-m", "initial"]);

  const info = await inspectRepository(repo);
  assert.equal(info.branch, "feature/audit");
  assert.equal(info.upstream, null);

  const validation = await runValidation(repo, ["node check.mjs"]);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.receipts.map((receipt) => receipt.code), [0]);
  const failed = await runValidation(repo, ["node -e 'process.exit(7)'"]);
  assert.equal(failed.ok, false);
  assert.equal(failed.receipts[0].code, 7);

  await writeFile(join(repo, "dirty.txt"), "dirty\n");
  assert.deepEqual(await worktreePaths(repo), ["dirty.txt"]);
  const checkpoint = await commitAll(repo, "chore: baseline checkpoint");
  assert.match(checkpoint, /^[a-f0-9]{40}$/);
  assert.deepEqual(await worktreePaths(repo), []);

  await writeFile(join(repo, ".env"), "API_KEY=secret-value\n");
  const risks = await detectSecretRisks(repo);
  assert.match(risks.join("\n"), /\.env/);
  assert.doesNotMatch(risks.join("\n"), /secret-value/);
  await rm(join(repo, ".env"));

  await writeFile(join(repo, "failed.txt"), "preserve me\n");
  const stashRef = await stashAll(repo, "goal-auditor failed F-1");
  assert.match(stashRef, /^stash@\{/);
  assert.deepEqual(await worktreePaths(repo), []);

  const run = {
    id: "run-1",
    phase: "implementing",
    scope: ".",
    branch: "feature/audit",
    objective: "audit",
    baselineCommit: checkpoint,
    latestGreenCommit: checkpoint,
    auditPass: 1,
    cleanAuditPass: null,
    findings: [],
    receipts: [],
    delivery: null,
    ledgerPath: join(repo, "docs", "audits", "run.md"),
  };
  await writeRunLedger(run);
  assert.match(await readFile(run.ledgerPath, "utf8"), /Goal Technical Auditor Ledger/);

  await git(root, ["init", "--bare", remote]);
  await git(repo, ["remote", "add", "origin", remote]);
  const target = await resolvePushTarget(repo, { ...run, upstream: null });
  assert.deepEqual(target, { remote: "origin", branch: "feature/audit", setUpstream: true, defaultBranch: null });
  assert.equal(isProtectedBranch("main", "main"), true);
  assert.equal(isProtectedBranch("feature/audit", "main"), false);
  await commitAll(repo, "docs: add audit ledger");
  await pushRun(repo, target);
  const remoteHead = (await git(repo, ["ls-remote", "origin", "refs/heads/feature/audit"])).stdout;
  assert.match(remoteHead, /refs\/heads\/feature\/audit/);

  let controlled = createAuditRun({
    id: "run-2",
    cwd: repo,
    branch: "feature/audit",
    upstream: null,
    scope: ".",
    objective: "audit",
    tokenBudget: "700k",
    ledgerPath: join(repo, "docs", "audits", "controlled.md"),
    now: 1,
  });
  await writeFile(join(repo, "existing.txt"), "existing user work\n");
  ({ run: controlled } = await processCheckpoint(controlled, {
    action: "preflight",
    focusedValidationCommands: ["node check.mjs"],
    projectValidationCommands: ["node check.mjs"],
  }, { cwd: repo }));
  assert.equal(controlled.phase, "auditing");
  assert.ok(controlled.baselineCommit);
  assert.equal(controlled.findings.filter((finding) => finding.id.startsWith("M0-")).length, 0);

  ({ run: controlled } = await processCheckpoint(controlled, {
    action: "record_audit",
    findings: [{ id: "F-1", title: "Add behavior", severity: "High", evidence: "check.mjs:1", recommendation: "change output", safe: true }],
  }, { cwd: repo }));
  assert.equal(controlled.phase, "implementing");

  ({ run: controlled } = await processCheckpoint(controlled, { action: "begin_finding", findingId: "F-1" }, { cwd: repo }));
  await writeFile(join(repo, "check.mjs"), 'console.log("fixed")\n');
  ({ run: controlled } = await processCheckpoint(controlled, { action: "validate_finding" }, { cwd: repo }));
  assert.equal(controlled.findings[0].status, "fixed");
  assert.ok(controlled.findings[0].commit);
  assert.deepEqual(await worktreePaths(repo), []);

  ({ run: controlled } = await processCheckpoint(controlled, { action: "request_reaudit" }, { cwd: repo }));
  ({ run: controlled } = await processCheckpoint(controlled, {
    action: "record_audit",
    findings: [{ id: "F-2", title: "Failing candidate", severity: "Medium", evidence: "check.mjs:1", recommendation: "exercise recovery", safe: true }],
  }, { cwd: repo }));
  controlled = { ...controlled, focusedValidationCommands: ["node -e 'process.exit(9)'"], projectValidationCommands: [] };
  ({ run: controlled } = await processCheckpoint(controlled, { action: "begin_finding", findingId: "F-2" }, { cwd: repo }));
  await writeFile(join(repo, "failed-slice.txt"), "recoverable\n");
  ({ run: controlled } = await processCheckpoint(controlled, { action: "validate_finding" }, { cwd: repo }));
  assert.equal(controlled.findings.find((finding) => finding.id === "F-2").attempts, 1);
  ({ run: controlled } = await processCheckpoint(controlled, { action: "validate_finding" }, { cwd: repo }));
  const failedFinding = controlled.findings.find((finding) => finding.id === "F-2");
  assert.equal(failedFinding.status, "failed");
  assert.match(failedFinding.stashRef, /^stash@\{/);
  assert.deepEqual(await worktreePaths(repo), []);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("goal-technical-auditor-git ok");
