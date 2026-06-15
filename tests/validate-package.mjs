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
  "technical-auditor",
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

function collectNestedPackageLockNameIssues(baseDir) {
  const issues = [];
  const packageFiles = ["skills/frontend/stitch-react-components/package.json"];
  for (const packageFile of packageFiles) {
    const packagePath = path.join(baseDir, packageFile);
    const lockPath = path.join(path.dirname(packagePath), "package-lock.json");
    if (!fs.existsSync(packagePath) || !fs.existsSync(lockPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    const lockRootName = lock.packages?.[""]?.name;
    if (lock.name !== pkg.name || lockRootName !== pkg.name) {
      issues.push(`${packageFile}: package-lock root name must match package.json name`);
    }
  }
  return issues;
}

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

function collectForbiddenPackageResourceArtifacts(baseDir = root) {
  const forbidden = [];
  const packageResourceDirs = ["skills", "extensions", "themes", "prompts"];
  const forbiddenNames = new Set([".pi", ".understand-anything"]);
  const walk = (relativeDir) => {
    const absoluteDir = path.join(baseDir, relativeDir);
    if (!fs.existsSync(absoluteDir)) return;
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name).split(path.sep).join("/");
      if (entry.isDirectory() && forbiddenNames.has(entry.name)) {
        forbidden.push(relativePath);
        continue;
      }
      if (entry.isDirectory()) walk(relativePath);
    }
  };
  for (const dir of packageResourceDirs) walk(dir);
  return forbidden.sort();
}

function collectSkillInventoryIssues(baseDir, expectedNames) {
  const expected = new Set(expectedNames);
  const actual = new Set(listSkillFiles(baseDir)
    .map((file) => parseFrontmatter(fs.readFileSync(path.join(baseDir, file), "utf8")).name)
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
  assert.deepEqual(pkg.bin, { tx: "./tmux/tx", autofolderrefactor: "./skills/engineering/candidates-folder-refactor/scripts/autofolderrefactor" });
  assert.deepEqual(pkg.pi.extensions, ["./extensions/goal", "./extensions/goal-technical-auditor", "./extensions/understand", "./extensions/folder-refactor", "./extensions/rtk"]);
  for (const extensionPath of pkg.pi.extensions) {
    const absolutePath = path.join(root, extensionPath);
    assert.equal(fs.statSync(absolutePath).isDirectory(), true, `${extensionPath} must be a folder extension`);
    assert.equal(exists(path.join(extensionPath, "index.js")), true, `${extensionPath} must expose runtime-loadable index.js`);
  }
  assert.deepEqual(pkg.pi.skills, ["./skills"]);
  assert.deepEqual(pkg.pi.themes, ["./themes"]);
  assert.equal(pkg.files.includes("extensions"), true, "package tarball must include package extensions");
  assert.equal(pkg.files.includes("skills"), true);
  assert.equal(pkg.files.includes("themes"), true, "package tarball must include theme resources");
  assert.equal(pkg.files.includes("tmux"), true, "package tarball must include tmux helpers and tx bin");
  assert.equal(pkg.files.includes("!**/.pi/**"), true, "package tarball must exclude local Pi artifacts");
  assert.equal(pkg.files.includes("!**/.understand-anything/**"), true, "package tarball must exclude generated Understand artifacts");
  assert.ok(exists(".github/workflows/ci.yml"), "CI must run package validation");
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /npm test/);
  assert.match(ci, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(ci, /actions\/setup-node@[a-f0-9]{40}/);
  assert.match(ci, /git diff --check/);
  assert.match(ci, /npm pack --dry-run/);
  assert.match(ci, /\.understand-anything/);
  assert.match(ci, /npm --prefix skills\/frontend\/stitch-react-components audit/);
  for (const file of fs.readdirSync(path.join(root, "tests")).filter((name) => name.endsWith(".mjs"))) {
    assert.doesNotMatch(read(path.join("tests", file)), /\/home\/xel\/\.nvm\/.*pi-coding-agent/, `${file} must not depend on a machine-local global Pi install`);
  }
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
  const goalExtension = read("extensions/goal/index.js");
  assert.match(goalExtension, /registerCommand\("goal"/);
  assert.match(goalExtension, /emptyGoalCommandAction/);
  assert.match(goalExtension, /sendUserMessage\("\/skill:goal"\)/);
  assert.ok(exists("lib/goal/command.js"), "goal command helper must exist");
  assert.ok(exists("tests/goal-extension-command.test.mjs"), "goal command helper test must exist");
  const goalTechnicalAuditorExtension = read("extensions/goal-technical-auditor/index.js");
  assert.match(goalTechnicalAuditorExtension, /registerCommand\("goal-technical-auditor"/);
  assert.match(goalTechnicalAuditorExtension, /buildGoalTechnicalAuditorObjective/);
  assert.match(goalTechnicalAuditorExtension, /sendUserMessage\(goalCommand\)/);
  assert.ok(exists("lib/goal-technical-auditor/command.js"), "goal-technical-auditor command helper must exist");
  assert.ok(exists("tests/goal-technical-auditor-command.test.mjs"), "goal-technical-auditor helper test must exist");
  assert.match(goalExtension, /CUSTOM_TYPE = "pi-goal"/);
  assert.match(goalExtension, /registerTool\(\{\s*name: "get_goal"/);
  assert.match(goalExtension, /registerTool\(\{\s*name: "update_goal"/);
  assert.match(goalExtension, /@earendil-works\/pi-tui/);
  assert.doesNotMatch(goalExtension, /@mariozechner\//);

  const folderRefactorExtension = read("extensions/folder-refactor/index.js");
  assert.match(folderRefactorExtension, /folder_refactor_scan/);
  assert.match(folderRefactorExtension, /folder_refactor_audit/);
  assert.match(folderRefactorExtension, /folder_refactor_state/);
  assert.match(folderRefactorExtension, /registerCommand\("folder-refactor"/);
  const folderRefactorGuardrail = read("lib/folder-refactor/guardrail.js");
  assert.match(folderRefactorGuardrail, /FOLDER_REFACTOR_AUDIT:/);
  assert.match(folderRefactorGuardrail, /scanFolderRefactorTarget/);
  assert.match(folderRefactorGuardrail, /auditFolderRefactorCompletion/);

  const rtkExtension = read("extensions/rtk/index.js");
  assert.match(rtkExtension, /registerCommand\("rtk"/);
  assert.match(rtkExtension, /rtk-ai\/rtk/);
  assert.match(rtkExtension, /execRtk\(pi, \["rewrite"/);
  assert.match(rtkExtension, /tool_call/);


  const lifecycle = read("lib/pi-bridge/lifecycle.js");
  assert.match(lifecycle, /createRepoBackedSkillBridge/);
  assert.match(lifecycle, /ensureInstalled/);
  assert.match(lifecycle, /sendSkillInvocation/);
  assert.match(lifecycle, /checkoutHead/);

  const extension = read("extensions/understand/index.js");
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
  assert.match(extension, /createRepoBackedSkillBridge/);
  assert.match(extension, /resources_discover/);
}

async function testPiCoreDependencies() {
  const pkg = readJson("package.json");
  assert.deepEqual(collectPiCoreDependencyIssues(pkg), []);
  if (Object.keys(pkg.dependencies ?? {}).length) {
    assert.ok(exists("package-lock.json"), "root runtime dependencies require a root package-lock.json so npm audit can run");
  }
  assert.deepEqual(collectNestedPackageLockNameIssues(root), []);
}

async function testSkills() {
  assert.deepEqual(collectSkillInventoryIssues(root, expectedSkills), []);
  assert.deepEqual(collectSkillDescriptionBudgetIssues(root), []);
  assert.deepEqual(collectSkillFrontmatterYamlIssues(root), []);
  assert.deepEqual(listPackageSkillRootMarkdownFiles(root), [], "root markdown files under pi.skills are loaded as file skills and must move under a non-skill subdirectory");
  assert.deepEqual(collectForbiddenPackageResourceArtifacts(root), [], "package resource trees must not contain local generated/runtime artifacts");

  const goal = read("skills/planning/goal/SKILL.md");
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
  const goalContract = read("skills/planning/goal/references/operating-contract.md");
  assert.match(goalContract, /No-arg status semantics/);
  assert.match(goalContract, /Multi-slice continuation/);
  assert.match(goalContract, /DEV_GOAL_DECISION: continue_next_slice/);

  const architecture = read("skills/engineering/improve-codebase-architecture/SKILL.md");
  assert.match(architecture, /Compatibility shim/);
  assert.match(architecture, /technical-auditor/);
  assert.match(architecture, /Architecture mode/);
  assert.match(architecture, /Full mode/);
  assert.match(architecture, /git status --short --branch/);
  assert.match(architecture, /module, interface, implementation, depth, seam, adapter, leverage, locality/);
  assert.doesNotMatch(architecture, /subagent_type=Explore/);
  const architectureMode = read("skills/engineering/technical-auditor/references/architecture-deepening-mode.md");
  assert.match(architectureMode, /Study quality gate/);
  assert.match(architectureMode, /dirty files as in-scope evidence, unrelated owner work, or blocker/);
  assert.match(architectureMode, /strongest locality\/leverage proof/);
  assert.match(architectureMode, /Architecture review: inline/);
  const repoStudy = read("skills/engineering/technical-auditor/references/architecture-repo-study.md");
  assert.match(repoStudy, /Candidate evidence requirements/);
  assert.match(repoStudy, /Generated map discipline/);
  assert.match(repoStudy, /Dirty-worktree pass/);
  assert.match(repoStudy, /accepted in-scope dirty evidence/);
  assert.match(repoStudy, /Review quality gate/);
  assert.match(read("skills/engineering/technical-auditor/references/architecture-interface-design.md"), /If parallel sub-agents are available/);

  const tdd = read("skills/engineering/tdd/SKILL.md");
  assert.match(tdd, /Repo study before RED/);
  assert.match(tdd, /git status --short --branch/);
  assert.match(read("skills/engineering/prototype/SKILL.md"), /Repo study before building/);
  const candidatesFolderRefactor = read("skills/engineering/candidates-folder-refactor/SKILL.md");
  assert.match(candidatesFolderRefactor, /Top candidates/);
  assert.match(candidatesFolderRefactor, /skill-folder-refactor/);
  assert.match(candidatesFolderRefactor, /Do not recommend repo-root refactors/);
  assert.match(candidatesFolderRefactor, /files\/churn\/callers\/imports\/tests\/roles\/duplicates/);
  assert.match(candidatesFolderRefactor, /say `lgtm` to run `\/folder-refactor <best path>` immediately/);
  assert.match(candidatesFolderRefactor, /\.pi\/candidates-folder-refactor\/latest\.json/);
  assert.match(candidatesFolderRefactor, /--from-log/);
  assert.match(candidatesFolderRefactor, /autofolderrefactor ignore \[folder\]/);
  assert.match(candidatesFolderRefactor, /autofolderrefactor <loops> \[folder\]/);
  const lgtm = read("skills/planning/lgtm/SKILL.md");
  assert.match(lgtm, /candidates-folder-refactor/);
  assert.match(lgtm, /selecting the #1 top candidate/);
  assert.match(lgtm, /immediately run `\/folder-refactor <candidate #1>`/);
  assert.match(lgtm, /extension invokes `skill-folder-refactor`/);
  assert.match(lgtm, /ambiguous approval that should choose the best safe continuation/);
  assert.match(lgtm, /Approval Resolution Protocol/);
  assert.match(lgtm, /best safe continuation/);
  assert.match(lgtm, /choose the safest bounded continuation/);
  assert.match(lgtm, /Ask only when no safe bounded action can be inferred/);
  const shareCode = read("skills/engineering/share-code/SKILL.md");
  assert.match(shareCode, /pick smartly instead of asking/);
  assert.match(shareCode, /selecting the highest-signal bounded candidate/);
  const folderRefactor = read("skills/engineering/skill-folder-refactor/SKILL.md");
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
  assert.match(read("skills/pi/write-a-skill/SKILL.md"), /Repo study before drafting/);
  const grillWithDocs = read("skills/planning/grill-with-docs/SKILL.md");
  assert.match(grillWithDocs, /codebase-map-understand\.md when present/);
  assert.match(grillWithDocs, /resolving dependencies between decisions one-by-one/);
  assert.match(grillWithDocs, /dirty files as in-scope evidence, unrelated owner work, or blocker/);
  assert.match(grillWithDocs, /state which prior decision this branch depends on/);
  assert.match(grillWithDocs, /docs-council/);
  assert.match(grillWithDocs, /external LLMs only when explicitly requested\/approved/);
  assert.match(grillWithDocs, /If the user has not accepted the canonical term, keep grilling instead of writing/);
  assert.match(read("skills/planning/to-prd/SKILL.md"), /codebase-map-understand\.md/);
  assert.match(read("skills/planning/to-issues/SKILL.md"), /codebase-map-understand\.md/);
  assert.match(read("skills/planning/triage/SKILL.md"), /codebase-map-understand\.md/);
  assert.ok(exists("skills/shared/COMMON-CONTRACT.md"), "shared skill contract must exist");
  const commonContract = read("skills/shared/COMMON-CONTRACT.md");
  assert.match(commonContract, /Default response style/);
  assert.match(commonContract, /Use caveman style by default for every packaged skill/);
  assert.match(commonContract, /global presentation floor/);
  assert.match(commonContract, /Specialist formats still apply/);
  assert.match(commonContract, /roughly 8 lines/);
  assert.match(commonContract, /compact receipts/);
  assert.match(commonContract, /vertical space compact/);
  assert.match(commonContract, /avoid unnecessary blank lines/);
  assert.match(read("skills/communication/caveman/SKILL.md"), /Optimize vertical space too/);
  assert.match(read("skills/communication/caveman/SKILL.md"), /Avoid one-item-per-line bullets/);
  assert.match(commonContract, /Repo and ownership check/);
  assert.match(commonContract, /Verification evidence/);
  assert.match(commonContract, /Handoff shape/);
  assert.match(commonContract, /Safety defaults/);
  for (const file of listSkillFiles(root)) {
    assert.doesNotMatch(read(file), /setup-matt-pocock-skills/, `${file} should not reference upstream setup skill`);
    assert.match(read(file), /COMMON-CONTRACT\.md/, `${file} should reference the shared skill contract`);
  }

  const technicalAuditor = read("skills/engineering/technical-auditor/SKILL.md");
  assert.match(technicalAuditor, /Full mode/);
  assert.match(technicalAuditor, /default when the user gives no mode argument/);
  assert.match(technicalAuditor, /Run Audit mode and Architecture mode together/);
  assert.match(technicalAuditor, /Architecture review: inline/);
  assert.doesNotMatch(technicalAuditor, /Architecture review generated/);
  assert.match(technicalAuditor, /technical audit/);
  assert.match(technicalAuditor, /Repository Map/);
  assert.match(technicalAuditor, /file\/line evidence/);
  assert.match(technicalAuditor, /Do not edit code during the audit/);
  assert.match(technicalAuditor, /Fact` or `Judgment/);
  assert.match(technicalAuditor, /Critical, High, Medium, or Low/);
  assert.match(technicalAuditor, /Milestone 0: safety net before refactoring/);
  assert.match(technicalAuditor, /Milestone 1: critical security\/correctness fixes/);
  assert.match(technicalAuditor, /Milestone 2: high-impact improvements/);
  assert.match(technicalAuditor, /Milestone 3: quality and polish/);
  assert.match(technicalAuditor, /Verification Evidence/);
  assert.match(technicalAuditor, /inspected files, commands\/tests run, codebase map status/);
  assert.match(technicalAuditor, /docs\/audits\/<scope-slug>-YYYY-MM-DD\.md/);
  assert.match(read("skills/engineering/technical-auditor/references/audit-dimensions.md"), /Severity calibration/);

  const promptCacheAuditor = read("skills/engineering/prompt-cache-auditor/SKILL.md");
  assert.match(promptCacheAuditor, /prompt_cache_key/);
  assert.match(promptCacheAuditor, /cache_control/);
  assert.match(promptCacheAuditor, /cache-read counters/);
  assert.match(read("skills/engineering/prompt-cache-auditor/references/provider-patterns.md"), /OnlyTerp\/prompt-cache-skills/);
  assert.match(read("skills/engineering/prompt-cache-auditor/references/provider-patterns.md"), /cache_read_input_tokens/);
  assert.ok(exists("skills/engineering/prompt-cache-auditor/scripts/summarize-cache-usage.mjs"), "prompt cache skill helper must exist");

  const piEcosystemScout = read("skills/pi/pi-ecosystem-scout/SKILL.md");
  assert.match(piEcosystemScout, /translate the external pattern into a local requirement before editing/);
  assert.match(piEcosystemScout, /pattern-only inspiration belongs in the scout report, not package notices/);
  const piExtensionsHelper = read("skills/pi/pi-extensions-helper/SKILL.md");
  assert.match(piExtensionsHelper, /write the local design rule first/);
  assert.match(piExtensionsHelper, /Provider\/CLI bridge rule/);
  assert.match(piExtensionsHelper, /Pi owns tool execution/);
  assert.match(piExtensionsHelper, /Keep guardrail logic in pure helpers with focused tests/);
  assert.match(piExtensionsHelper, /Make safety gates fail closed/);

  const gitCommitPush = read("skills/delivery/git-commit-push/SKILL.md");
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
  assert.match(readme, /technical-auditor/);
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
  assert.match(readme, /npm pack --dry-run/);
  assert.match(readme, /npm --prefix skills\/frontend\/stitch-react-components audit/);
}

await testPackageManifest();
await testPackageManifestPaths();
await testUnderstandExtension();
await testPiCoreDependencies();
await testSkills();
await testDocsAndNotices();
console.log("validate-package ok");
