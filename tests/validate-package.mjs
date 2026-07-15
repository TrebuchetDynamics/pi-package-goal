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
  "bug-harvest",
  "unused-code",
  "wiki-docs",
  "improve-codebase-architecture",
  "technical-auditor",
  "grill-me",
  "grill-with-docs",
  "prototype",
  "skill-folder-refactor",
  "share-code",
  "candidates-folder-refactor",
  "autonomous-codebase-improver",
  "prompt-cache-auditor",
  "zoom-out",
  "skill-router",
  "to-issues",
  "to-prd",
  "triage",
  "writing-shape",
  "handoff",
  "lgtm",
  "nack",
  "caveman",
  "ponytail",
  "ponytail-review",
  "ponytail-audit",
  "ponytail-gain",
  "ponytail-debt",
  "ponytail-help",
  "write-a-skill",
  "greploop",
  "autoreview",
  "pi-ecosystem-scout",
  "pi-extensions-helper",
  "research-forge",
  "ui-ux-pro-max",
  "ui-design",
  "frontend-design",
  "beautify-github-readme",
  "design-taste-frontend",
  "design-taste-frontend-v1",
  "gpt-taste",
  "image-to-code",
  "redesign-existing-projects",
  "high-end-visual-design",
  "minimalist-ui",
  "industrial-brutalist-ui",
  "full-output-enforcement",
  "imagegen-frontend-web",
  "imagegen-frontend-mobile",
  "brandkit",
  "stitch-design-taste",
  "hallmark",
  "stitch-react-components",
  "brainstorming",
  "dispatching-parallel-agents",
  "executing-plans",
  "finishing-a-development-branch",
  "receiving-code-review",
  "requesting-code-review",
  "subagent-driven-development",
  "systematic-debugging",
  "test-driven-development",
  "using-git-worktrees",
  "using-superpowers",
  "verification-before-completion",
  "writing-plans",
  "writing-skills",
];

const skillDescriptionBudget = {
  maxPerSkillChars: 500,
  maxTotalChars: 12500,
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
  const name = frontmatterField(frontmatter, "name")?.replace(/^['"]|['"]$/g, "").trim();
  const description = frontmatterField(frontmatter, "description");
  assert.ok(name, "frontmatter must include name");
  assert.ok(description !== undefined, `frontmatter for ${name} must include description`);
  return { name, description };
}

function frontmatterField(frontmatter, fieldName) {
  const lines = frontmatter.split(/\r?\n/);
  const prefix = `${fieldName}:`;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(prefix)) continue;
    const rawValue = line.slice(prefix.length).trim();
    if ([">", "|", ">-", "|-"].includes(rawValue)) {
      const blockLines = [];
      for (let next = index + 1; next < lines.length; next += 1) {
        if (/^[a-zA-Z_-]+:\s*/.test(lines[next])) break;
        blockLines.push(lines[next].trim());
      }
      return blockLines.join(" ").trim();
    }
    return rawValue.replace(/^['"]|['"]$/g, "").trim();
  }
  return undefined;
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

const triggerDescriptionPattern = /\bUse (?:when|for|only when|this skill when)|\bUse technical-auditor/i;

const skillShadowingStopwords = new Set([
  "about", "after", "agent", "agents", "against", "asks", "asked", "before", "build", "code", "docs", "files", "from", "into", "llm", "pi", "review", "skill", "skills", "that", "their", "this", "tool", "tools", "user", "using", "when", "with", "work",
]);

function collectSkillQualityGateIssues(baseDir) {
  const issues = [];
  const skillRecords = listSkillFiles(baseDir).map((file) => {
    const content = fs.readFileSync(path.join(baseDir, file), "utf8");
    const frontmatter = parseFrontmatter(content);
    const description = normalizeSkillDescription(frontmatter.description);
    if (!triggerDescriptionPattern.test(description)) issues.push(`${file}: description must include a concrete Use when/Use for trigger`);
    if (!/COMMON-CONTRACT\.md/.test(content)) issues.push(`${file}: must reference the shared skill contract`);
    if (!hasSkillVerificationPath(content)) issues.push(`${file}: must define or inherit a verification path`);
    return { file, name: frontmatter.name, description };
  });
  issues.push(...collectSkillShadowingIssues(skillRecords));
  return issues.sort();
}

function hasSkillVerificationPath(content) {
  return /## Verification gate|## Output contract|Verification evidence|COMMON-CONTRACT\.md/.test(content);
}

function collectSkillShadowingIssues(skillRecords) {
  const issues = [];
  for (let left = 0; left < skillRecords.length; left += 1) {
    for (let right = left + 1; right < skillRecords.length; right += 1) {
      const leftTokens = skillTriggerTokens(skillRecords[left].description);
      const rightTokens = skillTriggerTokens(skillRecords[right].description);
      const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).sort();
      const denominator = Math.min(leftTokens.size, rightTokens.size);
      const score = denominator ? overlap.length / denominator : 0;
      if (overlap.length >= 5 && score >= 0.62) {
        issues.push(`${skillRecords[left].name}/${skillRecords[right].name}: possible skill shadowing on trigger tokens ${overlap.join(",")}`);
      }
    }
  }
  return issues;
}

function skillTriggerTokens(description) {
  return new Set(description
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !skillShadowingStopwords.has(token)));
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
  assert.deepEqual(pkg.pi.extensions, ["./extensions/goal", "./extensions/goal-technical-auditor", "./extensions/understand", "./extensions/folder-refactor", "./extensions/rtk", "./extensions/ponytail", "./extensions/ketch", "./extensions/onklaud"]);
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
  assert.equal(pkg.files.includes("codebase-map-understand.md"), false, "package tarball must not include generated Understand agent maps");
  assert.ok(exists(".github/workflows/ci.yml"), "CI must run package validation");
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /npm test/);
  assert.match(ci, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(ci, /actions\/setup-node@[a-f0-9]{40}/);
  assert.match(ci, /git diff --check/);
  assert.match(ci, /npm pack --dry-run/);
  assert.match(ci, /\.understand-anything/);
  assert.match(ci, /codebase-map-understand\\\.md/);
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
  assert.ok(exists("extensions/goal/lib/command.js"), "goal command helper must exist");
  assert.ok(exists("tests/goal-extension-command.test.mjs"), "goal command helper test must exist");
  const goalTechnicalAuditorExtension = read("extensions/goal-technical-auditor/index.js");
  assert.match(goalTechnicalAuditorExtension, /registerCommand\("goal-technical-auditor"/);
  assert.match(goalTechnicalAuditorExtension, /parseGoalTechnicalAuditorCommand/);
  assert.match(goalTechnicalAuditorExtension, /CHECKPOINT_TOOL_NAME/);
  assert.match(goalTechnicalAuditorExtension, /processCheckpoint/);
  assert.match(goalTechnicalAuditorExtension, /sendWhenReady\(ctx, objective\.goalCommand\)/);
  assert.match(goalTechnicalAuditorExtension, /deliverAs: "followUp"/);
  assert.ok(exists("extensions/goal-technical-auditor/lib/command.js"), "goal-technical-auditor command helper must exist");
  assert.ok(exists("extensions/goal-technical-auditor/lib/run.js"), "goal-technical-auditor run controller must exist");
  assert.ok(exists("tests/goal-technical-auditor-command.test.mjs"), "goal-technical-auditor helper test must exist");
  assert.ok(exists("tests/goal-technical-auditor-run.test.mjs"), "goal-technical-auditor run test must exist");
  assert.ok(exists("tests/goal-technical-auditor-git.test.mjs"), "goal-technical-auditor git test must exist");
  assert.ok(exists("tests/goal-technical-auditor-extension.test.mjs"), "goal-technical-auditor extension test must exist");
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
  const folderRefactorGuardrail = read("extensions/folder-refactor/lib/guardrail.js");
  assert.match(folderRefactorGuardrail, /FOLDER_REFACTOR_AUDIT:/);
  assert.match(folderRefactorGuardrail, /scanFolderRefactorTarget/);
  assert.match(folderRefactorGuardrail, /auditFolderRefactorCompletion/);

  const rtkExtension = read("extensions/rtk/index.js");
  assert.match(rtkExtension, /registerCommand\("rtk"/);
  assert.match(rtkExtension, /rtk-ai\/rtk/);
  assert.match(rtkExtension, /execRtk\(pi, \["rewrite"/);
  assert.match(rtkExtension, /tool_call/);

  const ketchExtension = read("extensions/ketch/index.js");
  assert.match(ketchExtension, /name: "ketch"/);
  assert.match(ketchExtension, /inferSurface/);
  assert.match(ketchExtension, /installKetch/);
  assert.match(ketchExtension, /verifyChecksum/);
  assert.ok(exists("tests/ketch-extension.test.mjs"), "ketch extension test must exist");

  const onklaudExtension = read("extensions/onklaud/index.js");
  assert.match(onklaudExtension, /registerCommand\("onklaud"/);
  assert.match(onklaudExtension, /buildOnklaudObjective/);
  assert.match(onklaudExtension, /sendUserMessage\(goalCommand, options\)/);
  assert.ok(exists("extensions/onklaud/command.js"), "onklaud command helper must live with the extension");
  assert.ok(exists("tests/onklaud-extension-command.test.mjs"), "onklaud helper test must exist");

  const lifecycle = read("extensions/_shared/pi-bridge/lifecycle.js");
  assert.match(lifecycle, /createRepoBackedSkillBridge/);
  assert.match(lifecycle, /ensureInstalled/);
  assert.match(lifecycle, /sendSkillInvocation/);
  assert.match(lifecycle, /checkoutHead/);

  const extension = read("extensions/understand/index.js");
  assert.match(extension, /registerUnderstandCommand\(pi, "understand", paths, pendingAgentMap\)/);
  assert.match(extension, /registerUnderstandCommand\(pi, "understand-refactor", paths, pendingAgentMap\)/);
  assert.match(extension, /pi\.on\("agent_settled"/);
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
  assert.deepEqual([...skillTriggerTokens("Audit polish. polish, routes")].sort(), ["audit", "polish", "routes"], "skill trigger tokenization must ignore punctuation");
  assert.deepEqual(collectSkillQualityGateIssues(root), []);
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
  assert.match(goal, /repeats a just-completed objective/);
  assert.match(goal, /do not restart identical work/);
  assert.match(goal, /Slice continuation/);
  assert.match(goal, /do not stop after one validated slice/);
  assert.match(goal, /continue_next_slice/);
  assert.match(goal, /skill creation or skill improvement → `write-a-skill`/);
  assert.match(goal, /Pi extension or package resource work → `pi-extensions-helper`/);
  assert.match(goal, /Do not convert a learn, study, or scout request into repo edits/);
  const goalContract = read("skills/planning/goal/references/operating-contract.md");
  assert.match(goalContract, /No-arg status semantics/);
  assert.match(goalContract, /Repeated objective protection/);
  assert.match(goalContract, /Restart only when the user explicitly asks to rerun/);
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
  const frontendRoutingRoles = {
    "skills/frontend/ui-design/SKILL.md": /front door for broad or ambiguous UI\/UX work/i,
    "skills/frontend/frontend-design/SKILL.md": /working web components, pages, or product interfaces/i,
    "skills/frontend/beautify-github-readme/SKILL.md": /GitHub repository README.*README SVG assets.*not general website UI.*ordinary documentation maintenance/i,
    "skills/frontend/design-taste-frontend/SKILL.md": /marketing sites.*not product dashboards/i,
    "skills/frontend/hallmark/SKILL.md": /audit, redesign, or study.*explicitly invokes Hallmark/i,
    "skills/frontend/ui-ux-pro-max/SKILL.md": /design-system and accessibility guidance.*not primary implementation/i,
    "skills/frontend/redesign-existing-projects/SKILL.md": /existing website or app.*preserving functionality.*not greenfield/i,
  };
  for (const [file, role] of Object.entries(frontendRoutingRoles)) {
    assert.match(normalizeSkillDescription(parseFrontmatter(read(file)).description), role, `${file} must expose its distinct routing role`);
  }

  const beautifyReadme = read("skills/frontend/beautify-github-readme/SKILL.md");
  assert.match(beautifyReadme, /source_commit: 4119e6a7c58d1b48fe883784133413391b148180/);
  assert.match(beautifyReadme, /Set `SKILL_DIR` to the directory containing this `SKILL\.md`/);
  assert.match(beautifyReadme, /README mode/);
  assert.match(beautifyReadme, /SVG-only mode/);
  assert.match(beautifyReadme, /## Output contract/);
  assert.ok(exists("skills/frontend/beautify-github-readme/scripts/audit_readme.py"), "beautify README audit helper must exist");

  const frontendStyleRoles = {
    "skills/frontend/minimalist-ui/SKILL.md": /style overlay.*explicitly requests.*minimalist/i,
    "skills/frontend/industrial-brutalist-ui/SKILL.md": /Apply only.*brutalist/i,
    "skills/frontend/high-end-visual-design/SKILL.md": /Premium styling companion.*soft.*premium/i,
    "skills/frontend/gpt-taste/SKILL.md": /Codex\/GPT-only supporting rules.*not a general frontend router/i,
  };
  for (const [file, role] of Object.entries(frontendStyleRoles)) {
    assert.match(normalizeSkillDescription(parseFrontmatter(read(file)).description), role, `${file} must expose its supporting style role`);
  }

  const engineeringRoutingRoles = {
    "skills/engineering/autonomous-codebase-improver/SKILL.md": /broad, open-ended or continuous roadmap-driven repository improvement.*not a single known defect/i,
    "skills/engineering/bug-harvest/SKILL.md": /search for one unknown.*bug.*not an already-reported defect/i,
    "skills/engineering/unused-code/SKILL.md": /proven unreachable code.*not for dependency pruning.*speculative cleanup/i,
    "skills/engineering/diagnose/SKILL.md": /specific reported failure.*root cause/i,
    "skills/superpowers/systematic-debugging/SKILL.md": /only when that explicit systematic-debugging command/i,
    "skills/engineering/share-code/SKILL.md": /proven duplicate code.*not a topology-only folder split/i,
    "skills/engineering/skill-folder-refactor/SKILL.md": /one folder's topology.*not repository-wide architecture/i,
    "skills/engineering/technical-auditor/SKILL.md": /report and prioritized plan.*not implementation/i,
  };
  for (const [file, role] of Object.entries(engineeringRoutingRoles)) {
    assert.match(normalizeSkillDescription(parseFrontmatter(read(file)).description), role, `${file} must expose its distinct routing role`);
  }
  const unusedCode = read("skills/engineering/unused-code/SKILL.md");
  assert.match(unusedCode, /Age, low coverage, and unfamiliarity are leads, not proof/);
  assert.match(unusedCode, /string\/config\/template references/);
  assert.match(unusedCode, /public APIs, migrations, schemas, plugin hooks, reflective registrations/);
  assert.match(unusedCode, /No evidence-backed candidate means delete nothing/);
  assert.match(unusedCode, /baseline and post-delete command receipts/);
  assert.match(unusedCode, /\.understand-anything\/knowledge-graph\.json/);
  assert.match(unusedCode, /project\.gitCommitHash/);
  assert.match(unusedCode, /actual edge types before scoring degree/);
  assert.match(unusedCode, /Do not infer function-level deadness when the graph has no function-call edges/);
  assert.match(unusedCode, /dashboard or validator “orphans” as leads, never deletion proof/);
  assert.match(unusedCode, /do not copy its token into reports/);

  const autonomousImprover = read("skills/engineering/autonomous-codebase-improver/SKILL.md");
  assert.match(autonomousImprover, /selection rationale/i, "autonomous improver must justify why its slice outranks alternatives");
  assert.match(autonomousImprover, /at most three candidates/i, "autonomous improver must compare a bounded candidate set");
  assert.match(autonomousImprover, /documented work over invented improvements/i, "autonomous improver must prefer documented repo work");
  assert.match(autonomousImprover, /code smell is a lead, not a bug/i, "autonomous improver must not invent bugs from smells");
  assert.match(autonomousImprover, /## Failure handling/, "autonomous improver must define validation-failure recovery");
  assert.match(autonomousImprover, /baseline already fails/i, "autonomous improver must distinguish pre-existing failures");
  assert.match(autonomousImprover, /same blocker twice/i, "autonomous improver must stop repeated blind retries");
  assert.match(autonomousImprover, /single-slice mode.*continuous campaign mode/is, "autonomous improver must distinguish bounded and continuous operation");
  assert.match(autonomousImprover, /ROADMAP\.md.*TODO\.md/is, "autonomous improver must consume repository task sources");
  assert.match(autonomousImprover, /correctness.*security.*CI\/pipeline.*performance.*UI/is, "autonomous improver must inspect broad weakness lanes");
  assert.match(autonomousImprover, /Campaign state:[\s\S]*- queue:[\s\S]*- completed:[\s\S]*- blocked:/, "autonomous improver must track a continuous campaign queue");
  assert.match(autonomousImprover, /Do not stop after one successful slice/i, "continuous campaigns must keep advancing safe work");
  assert.match(autonomousImprover, /CI\/pipeline.*`diagnose`/is, "autonomous improver must route pipeline failures explicitly");
  assert.match(autonomousImprover, /each explicit task.*acceptance criteria/i, "autonomous improver completion must cover task acceptance");
  assert.doesNotMatch(autonomousImprover, /new\/changed skill files/, "autonomous improver must remain repository-agnostic");
  assert.match(autonomousImprover, /## Example/, "autonomous improver must include a concrete example");

  const reviewRoutingRoles = {
    "skills/delivery/autoreview/SKILL.md": /available second-model review helper.*not ordinary self-review/i,
    "skills/delivery/greploop/SKILL.md": /existing PR, MR, or shelved changelist.*Greptile/i,
    "skills/superpowers/requesting-code-review/SKILL.md": /prepare a focused human or agent review request.*not invoke an external review service/i,
    "skills/superpowers/receiving-code-review/SKILL.md": /incoming review feedback.*before applying it/i,
  };
  for (const [file, role] of Object.entries(reviewRoutingRoles)) {
    assert.match(normalizeSkillDescription(parseFrontmatter(read(file)).description), role, `${file} must expose its distinct review role`);
  }

  const writeASkill = read("skills/pi/write-a-skill/SKILL.md");
  assert.match(writeASkill, /Repo study before drafting/);
  assert.match(writeASkill, /skill-on\/skill-off comparison/);
  assert.match(writeASkill, /deterministic acceptance checks/);
  assert.match(writeASkill, /token\/cost receipt/);
  assert.match(writeASkill, /Do not invoke a paid or live model API without explicit approval/);
  assert.match(writeASkill, /## Example\n\nUser:/);
  assert.ok(writeASkill.trimEnd().split(/\r?\n/).length <= 125, "write-a-skill SKILL.md should keep detailed contract guidance in references");
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
  assert.match(commonContract, /Default skill posture/);
  assert.match(commonContract, /Use Ponytail full mode by default/);
  assert.match(commonContract, /YAGNI first/);
  assert.match(commonContract, /stdlib\/native before dependencies/);
  assert.match(commonContract, /apply it smartly/);
  assert.match(commonContract, /required schemas, citations, accessibility, security/);
  assert.match(commonContract, /not a prose-compression requirement/);
  assert.match(commonContract, /normal compact technical prose/);
  assert.match(commonContract, /compact receipts/);
  assert.match(commonContract, /Use caveman style only when the user explicitly asks/);
  assert.match(commonContract, /Skill quality baseline/);
  assert.match(commonContract, /operational basis, output contract, boundary disclosure, and one tiny example/);
  assert.match(commonContract, /skill-on\/skill-off comparison/);
  assert.match(commonContract, /same model and harness/);
  assert.match(commonContract, /deterministic acceptance checks/);
  assert.match(commonContract, /label the claim unreplicated/);
  assert.match(commonContract, /Never invoke paid or live model APIs without explicit approval/);
  assert.match(commonContract, /examples, templates, references, and helper scripts as executable supply-chain content/);
  assert.match(commonContract, /file writes, shell commands, network access, and approval scope/);
  assert.match(commonContract, /Version-sensitive guidance/);
  assert.match(commonContract, /harmless `--help`\/`version` checks/);
  assert.match(read("skills/communication/ponytail/SKILL.md"), /The ladder/);
  assert.match(read("skills/communication/caveman/SKILL.md"), /Optimize vertical space too/);
  assert.match(commonContract, /Repo and ownership check/);
  assert.match(commonContract, /Upstream and delivery boundaries/);
  assert.match(commonContract, /portable intent, not automatic permission/);
  assert.match(commonContract, /tools exposed in the current Pi tool list/);
  assert.match(commonContract, /harmless status\/help check \(version\/help\/status only/);
  assert.match(commonContract, /Do not install or emulate missing tools unless this package's local instructions/);
  assert.match(commonContract, /safe local equivalent with the same read-only or dry-run safety boundary/);
  assert.match(commonContract, /stop before that step, name the missing tool/);
  assert.match(commonContract, /Do not commit, push, create\/delete branches or tags, publish releases/);
  assert.match(commonContract, /open\/merge\/close PRs\/issues, comment on trackers, or mutate external systems/);
  assert.match(commonContract, /Explicit intent means the latest user request asks for delivery\/tracker mutation/);
  assert.match(commonContract, /bundled skill examples do not count/);
  assert.match(commonContract, /Without that intent, do not invoke delivery tooling/);
  assert.match(commonContract, /git-commit-push/);
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
  assert.match(gitCommitPush, /`git diff --stat` excludes untracked files/);
  assert.match(gitCommitPush, /modified and untracked files/);
  assert.match(gitCommitPush, /Completion audit/);
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
