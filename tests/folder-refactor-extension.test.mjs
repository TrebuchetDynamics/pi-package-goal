import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditFolderRefactorCompletion,
  buildFolderRefactorPrompt,
  formatAuditResult,
  readFolderRefactorState,
  scanFolderRefactorTarget,
  writeFolderRefactorState,
} from "../extensions/folder-refactor.js";

const fixture = await mkdtemp(join(tmpdir(), "folder-refactor-extension-"));
try {
  await mkdir(join(fixture, "internal", "config", "auth"), { recursive: true });
  await writeFile(join(fixture, "internal", "config", "config.go"), "package config\n");
  await writeFile(join(fixture, "internal", "config", "slash_title.go"), "package config\n");
  await writeFile(join(fixture, "internal", "config", "schema_test.go"), "package config\n");

  const scan = await scanFolderRefactorTarget(fixture, "internal/config");
  assert.deepEqual(scan.rootFiles, ["config.go", "schema_test.go", "slash_title.go"]);
  assert.deepEqual(scan.rootDirs, ["auth"]);

  const failingAudit = auditFolderRefactorCompletion(scan, {
    plannedTopologyComplete: true,
    facadeFiles: ["config.go"],
    outOfScopeFiles: ["schema_test.go"],
  });
  assert.equal(failingAudit.ok, false);
  assert.deepEqual(failingAudit.unclassified, ["slash_title.go"]);
  assert.match(formatAuditResult(failingAudit), /FOLDER_REFACTOR_AUDIT: fail/);

  const passingAudit = auditFolderRefactorCompletion(scan, {
    plannedTopologyComplete: false,
    facadeFiles: ["config.go"],
    outOfScopeFiles: ["schema_test.go"],
    nextCandidateFiles: ["slash_title.go"],
  });
  assert.equal(passingAudit.ok, true);
  assert.match(formatAuditResult(passingAudit), /next candidates: slash_title\.go/);

  const prompt = buildFolderRefactorPrompt("internal/config");
  assert.match(prompt, /^\/skill:skill-folder-refactor internal\/config/);
  assert.match(prompt, /folder_refactor_audit/);

  const written = await writeFolderRefactorState(fixture, "internal/config", {
    objective: "split config",
    completedSlices: ["auth"],
    nextCandidates: ["slash_title.go"],
    validationReceipts: ["go test ./internal/config/..."],
  });
  const read = await readFolderRefactorState(fixture, "internal/config");
  assert.equal(read.file, written.file);
  assert.equal(read.payload.objective, "split config");
  assert.deepEqual(read.payload.nextCandidates, ["slash_title.go"]);
} finally {
  await rm(fixture, { recursive: true, force: true });
}

console.log("folder-refactor-extension ok");
