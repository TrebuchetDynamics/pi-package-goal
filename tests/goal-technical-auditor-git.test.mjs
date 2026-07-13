import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  commitAll,
  detectSecretRisks,
  inspectRepository,
  isProtectedBranch,
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
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("goal-technical-auditor-git ok");
