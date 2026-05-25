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
];

const skillDescriptionBudget = {
  maxPerSkillChars: 500,
  maxTotalChars: 5000,
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
  assert.ok(pkg.keywords.includes("pi-package"));
  assert.ok(pkg.keywords.includes("agent-skills"));
  assert.deepEqual(pkg.pi.extensions, ["./extensions/understand.js"]);
  assert.deepEqual(pkg.pi.skills, ["./skills"]);
  assert.equal(pkg.files.includes("extensions"), true, "package tarball must include the understand extension");
  assert.equal(pkg.files.includes("skills"), true);
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
  const extension = read("extensions/understand.js");
  assert.match(extension, /registerUnderstandCommand\(pi, "understand", paths\)/);
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

  const goal = read("skills/goal/SKILL.md");
  const goalLines = goal.trimEnd().split(/\r?\n/).length;
  assert.ok(goalLines <= 100, `goal SKILL.md should stay compact; got ${goalLines} lines`);
  assert.match(goal, /auto-discovered useful repo work/);
  assert.match(goal, /Auto-discovered objectives/);
  assert.match(goal, /goal status` — show current Goal state without starting new work/);
  assert.match(goal, /status is `complete`\/`cleared`, auto-discover/);
  assert.match(goal, /dirty worktree changes as evidence, not permission/);
  assert.match(goal, /skill creation or skill improvement → `write-a-skill`/);
  assert.match(goal, /Pi extension or package resource work → `pi-extensions-helper`/);
  assert.match(read("skills/goal/references/operating-contract.md"), /No-arg status semantics/);

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
  assert.match(read("skills/write-a-skill/SKILL.md"), /Repo study before drafting/);
  assert.match(read("skills/grill-with-docs/SKILL.md"), /codebase-map-understand\.md when present/);
  assert.match(read("skills/to-prd/SKILL.md"), /codebase-map-understand\.md/);
  assert.match(read("skills/to-issues/SKILL.md"), /codebase-map-understand\.md/);
  assert.match(read("skills/triage/SKILL.md"), /codebase-map-understand\.md/);
  for (const file of listSkillFiles(root)) {
    assert.doesNotMatch(read(file), /setup-matt-pocock-skills/, `${file} should not reference upstream setup skill`);
  }

  const gitCommitPush = read("skills/git-commit-push/SKILL.md");
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
  assert.match(readme, /## Included extension/);
  assert.match(readme, /pi\.extensions/);
}

await testPackageManifest();
await testPackageManifestPaths();
await testUnderstandExtension();
await testPiCoreDependencies();
await testSkills();
await testDocsAndNotices();
console.log("validate-package ok");
