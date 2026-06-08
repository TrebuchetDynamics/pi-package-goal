import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);

const expectedSkills = [
  "goal",
  "git-commit-push",
  "modern-web-guidance",
  "chrome-extensions",
  "tdd",
  "diagnose",
  "improve-codebase-architecture",
  "grill-me",
  "grill-with-docs",
  "prototype",
  "skill-folder-refactor",
  "share-code",
  "candidates-folder-refactor",
  "prompt-cache-auditor",
  "zoom-out",
  "to-issues",
  "to-prd",
  "triage",
  "writing-shape",
  "handoff",
  "lgtm",
  "caveman",
  "write-a-skill",
  "greploop",
  "autoreview",
  "pi-ecosystem-scout",
  "pi-extensions-helper",
  "ui-ux-pro-max",
  "ui-design",
  "frontend-design",
  "frontend-production-shadcn",
  "design-taste-frontend",
  "hallmark",
  "stitch-react-components",
];

const skillDescriptionBudget = {
  maxPerSkillChars: 500,
  maxTotalChars: 6500,
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function collectMissingPackageManifestPaths(baseDir, pkg) {
  const missing = [];
  for (const file of stringArray(pkg.files)) {
    if (!isManifestExclusion(file) && !pathExists(baseDir, file)) missing.push(`files: ${file}`);
  }
  for (const extension of stringArray(pkg.pi?.extensions)) {
    if (!isManifestExclusion(extension) && !pathExists(baseDir, extension)) missing.push(`pi.extensions: ${extension}`);
  }
  for (const skillPath of stringArray(pkg.pi?.skills)) {
    if (!isManifestExclusion(skillPath) && !pathExists(baseDir, skillPath)) missing.push(`pi.skills: ${skillPath}`);
  }
  return missing;
}

function isManifestExclusion(target) {
  return target.trim().startsWith("!");
}

function pathExists(baseDir, target) {
  const normalized = normalizeManifestPath(target);
  if (hasGlobPattern(normalized)) return globPathExists(baseDir, normalized);
  return fs.existsSync(path.join(baseDir, normalized));
}

function normalizeManifestPath(target) {
  return target.trim().replace(/^\.\//, "").split(path.sep).join("/");
}

function hasGlobPattern(target) {
  return /[*?]/.test(target);
}

function globPathExists(baseDir, pattern) {
  const matcher = globPatternToRegExp(pattern);
  return listRelativePackagePaths(baseDir).some((item) => matcher.test(item));
}

function listRelativePackagePaths(baseDir) {
  const out = [];
  const skipDirs = new Set([".git", ".pi", "node_modules"]);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      out.push(path.relative(baseDir, full).split(path.sep).join("/"));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(baseDir);
  return out;
}

function globPatternToRegExp(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        while (pattern[index + 1] === "*") index += 1;
        if (pattern[index + 1] === "/") {
          source += "(?:.*/)?";
          index += 1;
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`${source}$`);
}

function escapeRegExp(char) {
  return char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

const piCorePackages = new Set([
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
]);

function collectPiCoreDependencyIssues(pkg) {
  const issues = [];
  for (const packageName of Object.keys(pkg.dependencies ?? {})) {
    if (piCorePackages.has(packageName)) issues.push(`dependencies: ${packageName} must be a peerDependency, not a runtime dependency`);
  }
  for (const packageName of Object.keys(pkg.peerDependencies ?? {})) {
    if (!piCorePackages.has(packageName)) continue;
    if (pkg.peerDependencies[packageName] !== "*") issues.push(`peerDependencies: ${packageName} must be "*"`);
    if (pkg.peerDependenciesMeta?.[packageName]?.optional !== true) {
      issues.push(`peerDependencies: ${packageName} must be marked optional in peerDependenciesMeta`);
    }
  }
  return issues;
}

function listSkillFiles(baseDir = root) {
  const out = [];
  const base = path.join(baseDir, "skills");
  if (!fs.existsSync(base)) return out;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && entry.name === "SKILL.md") out.push(path.relative(baseDir, full).split(path.sep).join("/"));
    }
  };
  walk(base);
  return out.sort();
}

function listPackageSkillRootMarkdownFiles(baseDir = root) {
  const base = path.join(baseDir, "skills");
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join("skills", entry.name).split(path.sep).join("/"))
    .sort();
}

function collectSkillInventoryIssues(baseDir, expectedNames) {
  const expected = new Set(expectedNames);
  const actual = new Set(listSkillFiles(baseDir)
    .map((file) => file.match(/^skills\/([^/]+)\/SKILL\.md$/)?.[1])
    .filter(Boolean));

  const issues = [];
  for (const name of [...expected].sort()) {
    if (!actual.has(name)) issues.push(`missing skill: ${name}`);
  }
  for (const name of [...actual].sort()) {
    if (!expected.has(name)) issues.push(`unexpected skill: ${name}`);
  }
  return issues;
}

function listMarkdownFiles(baseDir) {
  const out = [];
  const skipDirs = new Set([".git", ".pi", "node_modules"]);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
    }
  };
  walk(baseDir);
  return out.sort();
}

function collectBrokenMarkdownLinks(baseDir) {
  const broken = [];
  for (const file of listMarkdownFiles(baseDir)) {
    const content = stripMarkdownCodeFences(fs.readFileSync(file, "utf8"));
    for (const match of content.matchAll(/!?\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
      const target = markdownLinkTarget(match[1]);
      if (!target || isExternalMarkdownTarget(target)) continue;
      const localTarget = target.split("#")[0];
      if (!localTarget) continue;
      const resolved = path.resolve(path.dirname(file), localTarget);
      if (!fs.existsSync(resolved)) broken.push({ file: path.relative(baseDir, file), target: localTarget });
    }
  }
  return broken;
}

function stripMarkdownCodeFences(content) {
  return content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
}

function markdownLinkTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("<")) {
    const closing = trimmed.indexOf(">");
    return closing === -1 ? trimmed.slice(1) : trimmed.slice(1, closing);
  }
  return trimmed.split(/\s+/)[0];
}

function isExternalMarkdownTarget(target) {
  return target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function collectThirdPartyNoticePathIssues(baseDir) {
  const noticeFile = path.join(baseDir, "THIRD_PARTY_NOTICES.md");
  if (!fs.existsSync(noticeFile)) return ["THIRD_PARTY_NOTICES.md: missing"];

  const issues = [];
  const content = fs.readFileSync(noticeFile, "utf8");
  for (const match of content.matchAll(/`([^`]+)`/g)) {
    const localPath = match[1].trim();
    if (!isThirdPartyNoticeLocalPath(localPath)) continue;
    if (!fs.existsSync(path.join(baseDir, localPath))) issues.push(`THIRD_PARTY_NOTICES.md: missing local notice path ${localPath}`);
  }
  return issues;
}

function isThirdPartyNoticeLocalPath(localPath) {
  return localPath.startsWith("licenses/") || localPath.startsWith("skills/");
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "SKILL.md must have YAML frontmatter");
  const frontmatter = match[1];
  const name = frontmatter.match(/^name:\s*['"]?([^'"\n]+)['"]?\s*$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*(?:[>|-]\s*)?([\s\S]*?)(?:\n[a-zA-Z_-]+:|$)/m)?.[1]?.trim();
  assert.ok(name, "frontmatter must include name");
  assert.ok(description !== undefined, `frontmatter for ${name} must include description`);
  return { name, description };
}

function normalizeSkillDescription(description) {
  return description.replace(/\s+/g, " ").trim();
}

function collectSkillDescriptionBudgetIssues(baseDir, budget = skillDescriptionBudget) {
  const issues = [];
  let totalChars = 0;
  for (const file of listSkillFiles(baseDir)) {
    const { description } = parseFrontmatter(fs.readFileSync(path.join(baseDir, file), "utf8"));
    const normalized = normalizeSkillDescription(description);
    totalChars += normalized.length;
    if (normalized.length > budget.maxPerSkillChars) issues.push(`${file}: description ${normalized.length} chars exceeds ${budget.maxPerSkillChars}`);
  }
  if (totalChars > budget.maxTotalChars) issues.push(`all skill descriptions: ${totalChars} chars exceeds ${budget.maxTotalChars}`);
  return issues;
}

function collectSkillFrontmatterYamlIssues(baseDir) {
  const issues = [];
  for (const file of listSkillFiles(baseDir)) {
    const content = fs.readFileSync(path.join(baseDir, file), "utf8");
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
    const descriptionLine = frontmatter.split(/\r?\n/).find((line) => line.startsWith("description:"));
    if (!descriptionLine) continue;
    const descriptionValue = descriptionLine.replace(/^description:\s*/, "");
    const isQuotedOrBlock = /^[>|'\"]/.test(descriptionValue);
    if (!isQuotedOrBlock && /:\s/.test(descriptionValue)) issues.push(`${file}: description contains ": " and must be quoted or use a block scalar`);
  }
  return issues;
}

async function testPackageManifest() {
  const pkg = readJson("package.json");
  assert.equal(pkg.name, "pi-package-goal");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.repository.url, "git+https://github.com/TrebuchetDynamics/pi-package-goal.git");
  assert.equal(pkg.homepage, "https://github.com/TrebuchetDynamics/pi-package-goal#readme");
  assert.equal(pkg.bugs.url, "https://github.com/TrebuchetDynamics/pi-package-goal/issues");
  assert.match(pkg.description, /skills/);
  assert.match(pkg.description, /UX extensions/);
  assert.ok(pkg.keywords.includes("pi-package"));
  assert.ok(pkg.keywords.includes("agent-skills"));
  assert.ok(pkg.keywords.includes("pi-theme"));
  assert.deepEqual(pkg.bin, { tx: "./tmux/tx", autofolderrefactor: "./skills/candidates-folder-refactor/scripts/autofolderrefactor" });
  assert.deepEqual(pkg.pi.extensions, ["./extensions/understand.js", "./extensions/folder-refactor.js", "./extensions/rtk.js"]);
  assert.deepEqual(pkg.pi.skills, ["./skills"]);
  assert.deepEqual(pkg.pi.themes, ["./themes"]);
  assert.equal(pkg.files.includes("extensions"), true, "package tarball must include package extensions");
  assert.equal(pkg.files.includes("skills"), true);
  assert.equal(pkg.files.includes("themes"), true, "package tarball must include theme resources");
  assert.equal(pkg.files.includes("tmux"), true, "package tarball must include tmux helpers and tx bin");
  const gitignore = read(".gitignore");
  assert.match(gitignore, /\.pi\/\*\/logs\.jsonl/);
  assert.match(gitignore, /\*\*\/\.pi\/\*\/logs\.jsonl/);
}

async function testPackageManifestPaths() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-goal-pkg-paths-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot, "skills"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "README.md"), "fixture\n");
    const missing = collectMissingPackageManifestPaths(fixtureRoot, {
      files: ["README.md", "skills", "missing-dir"],
      pi: { skills: ["./skills"] },
    });
    assert.deepEqual(missing, ["files: missing-dir"]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  assert.deepEqual(collectMissingPackageManifestPaths(root, readJson("package.json")), []);
}

async function testUnderstandExtension() {
  const folderRefactorExtension = read("extensions/folder-refactor.js");
  assert.match(folderRefactorExtension, /folder_refactor_scan/);
  assert.match(folderRefactorExtension, /folder_refactor_audit/);
  assert.match(folderRefactorExtension, /folder_refactor_state/);
  assert.match(folderRefactorExtension, /FOLDER_REFACTOR_AUDIT:/);
  assert.match(folderRefactorExtension, /registerCommand\("folder-refactor"/);

  const rtkExtension = read("extensions/rtk.js");
  assert.match(rtkExtension, /registerCommand\("rtk"/);
  assert.match(rtkExtension, /rtk-ai\/rtk/);
  assert.match(rtkExtension, /execRtk\(pi, \["rewrite"/);
  assert.match(rtkExtension, /tool_call/);

  const extension = read("extensions/understand.js");
  assert.match(extension, /registerUnderstandCommand\(pi, "understand", paths\)/);
  assert.match(extension, /registerUnderstandCommand\(pi, "understand-refactor", paths\)/);
  assert.match(extension, /generateRefactorMarkdown/);
  assert.match(extension, /collectLiveRefactorEvidence/);
  assert.match(extension, /formatRefactorCommandMessage/);
  assert.match(extension, /extractRefactorCandidateChoices/);
  assert.match(extension, /parseRefactorInstruction/);
  assert.match(extension, /buildRefactorGrillPrompt/);
  assert.match(extension, /summarizePreviousRefactorPlan/);
  assert.match(extension, /https:\/\/github\.com\/Lum1104\/Understand-Anything\.git/);
  assert.match(extension, /resources_discover/);
}

async function testPiCoreDependencies() {
  assert.deepEqual(collectPiCoreDependencyIssues(readJson("package.json")), []);
}

async function testSkills() {
  assert.deepEqual(collectSkillInventoryIssues(root, expectedSkills), []);
  assert.deepEqual(collectSkillDescriptionBudgetIssues(root), []);
  assert.deepEqual(collectSkillFrontmatterYamlIssues(root), []);
  assert.deepEqual(listPackageSkillRootMarkdownFiles(root), [], "root markdown files under pi.skills are loaded as file skills and must move under a non-skill subdirectory");

  const goal = read("skills/goal/SKILL.md");
  const goalLines = goal.trimEnd().split(/\r?\n/).length;
  assert.ok(goalLines <= 100, `goal SKILL.md should stay compact; got ${goalLines} lines`);
  assert.match(goal, /auto-discovered useful repo work/);
  assert.match(goal, /Auto-discovered objectives/);
  assert.match(goal, /goal status` — show current Goal state without starting new work/);
  assert.match(goal, /status is `complete`\/`cleared`, auto-discover/);
  assert.match(goal, /dirty worktree changes as evidence, not permission/);
  assert.match(goal, /Slice continuation/);
  assert.match(goal, /do not stop after one validated slice/);
  assert.match(goal, /continue_next_slice/);
  assert.match(goal, /skill creation or skill improvement → `write-a-skill`/);
  assert.match(goal, /Pi extension or package resource work → `pi-extensions-helper`/);
  assert.match(goal, /Do not convert a learn, study, or scout request into repo edits/);
  const goalContract = read("skills/goal/references/operating-contract.md");
  assert.match(goalContract, /No-arg status semantics/);
  assert.match(goalContract, /Multi-slice continuation/);
  assert.match(goalContract, /DEV_GOAL_DECISION: continue_next_slice/);

  const architecture = read("skills/improve-codebase-architecture/SKILL.md");
  assert.match(architecture, /repo study/);
  assert.match(architecture, /git status --short --branch/);
  assert.match(architecture, /codebase-map-understand\.md/);
  assert.match(architecture, /Study evidence/);
  assert.match(architecture, /Study quality gate/);
  assert.match(architecture, /Architecture review generated: <absolute html path>/);
  assert.doesNotMatch(architecture, /subagent_type=Explore/);
  const repoStudy = read("skills/improve-codebase-architecture/REPO-STUDY.md");
  assert.match(repoStudy, /Candidate evidence requirements/);
  assert.match(repoStudy, /Generated map discipline/);
  assert.match(repoStudy, /Review quality gate/);
  assert.match(read("skills/improve-codebase-architecture/HTML-REPORT.md"), /Evidence base/);
  assert.match(read("skills/improve-codebase-architecture/INTERFACE-DESIGN.md"), /If parallel sub-agents are available/);

  const tdd = read("skills/tdd/SKILL.md");
  assert.match(tdd, /Repo study before RED/);
  assert.match(tdd, /git status --short --branch/);
  assert.match(read("skills/prototype/SKILL.md"), /Repo study before building/);
  const candidatesFolderRefactor = read("skills/candidates-folder-refactor/SKILL.md");
  assert.match(candidatesFolderRefactor, /Top candidates/);
  assert.match(candidatesFolderRefactor, /skill-folder-refactor/);
  assert.match(candidatesFolderRefactor, /Do not recommend repo-root refactors/);
  assert.match(candidatesFolderRefactor, /files\/churn\/callers\/imports\/tests\/roles\/duplicates/);
  assert.match(candidatesFolderRefactor, /say `lgtm` to run `\/folder-refactor <best path>` immediately/);
  assert.match(candidatesFolderRefactor, /\.pi\/candidates-folder-refactor\/latest\.json/);
  assert.match(candidatesFolderRefactor, /--from-log/);
  assert.match(candidatesFolderRefactor, /autofolderrefactor ignore \[folder\]/);
  assert.match(candidatesFolderRefactor, /autofolderrefactor <loops> \[folder\]/);
  const lgtm = read("skills/lgtm/SKILL.md");
  assert.match(lgtm, /candidates-folder-refactor/);
  assert.match(lgtm, /selecting the #1 top candidate/);
  assert.match(lgtm, /immediately run `\/folder-refactor <candidate #1>`/);
  assert.match(lgtm, /extension invokes `skill-folder-refactor`/);
  const shareCode = read("skills/share-code/SKILL.md");
  assert.match(shareCode, /pick smartly instead of asking/);
  assert.match(shareCode, /selecting the highest-signal bounded candidate/);
  const folderRefactor = read("skills/skill-folder-refactor/SKILL.md");
  assert.match(folderRefactor, /repo root, treat it as high risk/);
  assert.match(folderRefactor, /For Go, inspect `go\.mod`/);
  assert.match(folderRefactor, /folder_refactor_scan/);
  assert.match(folderRefactor, /folder_refactor_audit/);
  assert.match(folderRefactor, /folder_refactor_state/);
  assert.match(folderRefactor, /Phase 1 is move-only/);
  assert.match(folderRefactor, /Test gate/);
  assert.match(folderRefactor, /use `tdd` discipline/);
  assert.match(folderRefactor, /related tests must pass/);
  assert.match(folderRefactor, /new behavior tests created/);
  assert.match(folderRefactor, /Shared-code gate/);
  assert.match(folderRefactor, /shared-code opportunities/);
  assert.match(folderRefactor, /Extract shared code when/);
  assert.match(folderRefactor, /duplication intentionally remains/);
  assert.match(folderRefactor, /Extraction gate/);
  assert.match(folderRefactor, /Suggested validation by ecosystem/);
  assert.match(folderRefactor, /Continue autonomously/);
  assert.match(folderRefactor, /Do not stop after moving one or two files/);
  assert.match(folderRefactor, /Continuation gate/);
  assert.match(folderRefactor, /Completion audit/);
  assert.match(folderRefactor, /remaining root files/);
  assert.match(folderRefactor, /exact basename/);
  assert.match(folderRefactor, /do not summarize from memory or broad categories/);
  assert.match(folderRefactor, /If a file is not explicitly classified, the topology is incomplete/);
  assert.match(folderRefactor, /no unclassified root files/);
  assert.match(folderRefactor, /Never write "complete for this slice"/);
  assert.match(folderRefactor, /complete for the target folder, not just the latest slice/);
  assert.match(folderRefactor, /Use diff budget as a checkpoint, not an excuse to stop/);
  assert.match(folderRefactor, /not a completion reason/);
  assert.match(folderRefactor, /Default to doing more work/);
  assert.match(folderRefactor, /Treat a named next candidate as an instruction to execute it now/);
  assert.match(folderRefactor, /Minimum useful work/);
  assert.match(folderRefactor, /A final response that names a safe next candidate without executing it is invalid/);
  assert.match(folderRefactor, /Do not report "Stopped at diff-budget boundary"/);
  assert.match(folderRefactor, /Do not end with "Next candidate: <x>"/);
  assert.match(folderRefactor, /candidates-folder-refactor/);
  assert.match(folderRefactor, /prefer boring duplication over premature sharing/);
  assert.match(read("skills/write-a-skill/SKILL.md"), /Repo study before drafting/);
  assert.match(read("skills/grill-with-docs/SKILL.md"), /codebase-map-understand\.md when present/);
  assert.match(read("skills/to-prd/SKILL.md"), /codebase-map-understand\.md/);
  assert.match(read("skills/to-issues/SKILL.md"), /codebase-map-understand\.md/);
  assert.match(read("skills/triage/SKILL.md"), /codebase-map-understand\.md/);
  assert.ok(exists("skills/shared/COMMON-CONTRACT.md"), "shared skill contract must exist");
  const commonContract = read("skills/shared/COMMON-CONTRACT.md");
  assert.match(commonContract, /Repo and ownership check/);
  assert.match(commonContract, /Verification evidence/);
  assert.match(commonContract, /Handoff shape/);
  assert.match(commonContract, /Safety defaults/);
  for (const file of listSkillFiles(root)) {
    assert.doesNotMatch(read(file), /setup-matt-pocock-skills/, `${file} should not reference upstream setup skill`);
    assert.match(read(file), /COMMON-CONTRACT\.md/, `${file} should reference the shared skill contract`);
  }

  const promptCacheAuditor = read("skills/prompt-cache-auditor/SKILL.md");
  assert.match(promptCacheAuditor, /prompt_cache_key/);
  assert.match(promptCacheAuditor, /cache_control/);
  assert.match(promptCacheAuditor, /cache-read counters/);
  assert.match(read("skills/prompt-cache-auditor/references/provider-patterns.md"), /OnlyTerp\/prompt-cache-skills/);
  assert.match(read("skills/prompt-cache-auditor/references/provider-patterns.md"), /cache_read_input_tokens/);
  assert.ok(exists("skills/prompt-cache-auditor/scripts/summarize-cache-usage.mjs"), "prompt cache skill helper must exist");

  const piEcosystemScout = read("skills/pi-ecosystem-scout/SKILL.md");
  assert.match(piEcosystemScout, /translate the external pattern into a local requirement before editing/);
  assert.match(piEcosystemScout, /pattern-only inspiration belongs in the scout report, not package notices/);
  const piExtensionsHelper = read("skills/pi-extensions-helper/SKILL.md");
  assert.match(piExtensionsHelper, /write the local design rule first/);
  assert.match(piExtensionsHelper, /Provider\/CLI bridge rule/);
  assert.match(piExtensionsHelper, /Pi owns tool execution/);
  assert.match(piExtensionsHelper, /Keep guardrail logic in pure helpers with focused tests/);
  assert.match(piExtensionsHelper, /Make safety gates fail closed/);

  const gitCommitPush = read("skills/git-commit-push/SKILL.md");
  assert.match(gitCommitPush, /Polish, validate, commit, and push safe git worktree changes/);
  assert.match(gitCommitPush, /safely polish, validate, intentionally stage, commit, and push/);
  assert.match(gitCommitPush, /fix safe in-scope issues directly and rerun validation/);
  assert.match(gitCommitPush, /Ship mode \(default\)/);
  assert.match(gitCommitPush, /never because the user omitted explicit ship wording/);
  assert.match(gitCommitPush, /GIT_COMMIT_PUSH_VALIDATED: yes\|no/);
  assert.match(gitCommitPush, /GIT_COMMIT_PUSH_DECISION: shipped\|blocked\|review_needed/);
  assert.match(gitCommitPush, /Do not deploy, publish packages, rewrite history, force-push, rebase, merge remote changes/);
}

async function testDocsAndNotices() {
  assert.deepEqual(collectBrokenMarkdownLinks(root), []);
  assert.deepEqual(collectThirdPartyNoticePathIssues(root), []);
  const readme = read("README.md");
  assert.match(readme, /bundles curated agent skills/);
  assert.match(readme, /git-commit-push/);
  assert.doesNotMatch(readme, /\/development-goal/);
  assert.match(readme, /## Included extensions/);
  assert.doesNotMatch(readme, /goal-advisor/);
  assert.match(readme, /trebuchet-neon/);
  assert.match(readme, /Provider bridge pattern/);
  assert.match(readme, /\/understand-refactor/);
  assert.match(readme, /reads an existing output plan before overwriting it/);
  assert.match(readme, /\/understand-refactor grill N/);
  assert.match(readme, /pi\.extensions/);
  assert.match(readme, /pi\.themes/);
}

await testPackageManifest();
await testPackageManifestPaths();
await testUnderstandExtension();
await testPiCoreDependencies();
await testSkills();
await testDocsAndNotices();
console.log("validate-package ok");
