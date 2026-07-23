import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname);
const templates = path.join(root, "templates");
const snapshot = path.join(root, "package-snapshot", "skills");
const prompts = path.join(root, "prompts");
fs.rmSync(prompts, { recursive: true, force: true });
fs.mkdirSync(prompts, { recursive: true });

const fixtures = [
  { id: "f1-skill-authoring", skill: "pi/write-a-skill/SKILL.md", prompt: "Read TASK.md and complete it. Create the requested release-readiness skill. Keep the change minimal and obey every prohibited action in the task." },
  { id: "f2-diagnose", skill: "engineering/diagnose/SKILL.md", prompt: "Read TASK.md and fix the reported retry-count defect without changing the public API. You cannot run tests in this harness, so inspect the supplied test and report that limitation honestly." },
  { id: "f3-bug-harvest", skill: "engineering/bug-harvest/SKILL.md", prompt: "Read TASK.md. Find and fix exactly one evidence-backed bug in this small project. Do not perform unrelated cleanup and do not claim tests were run." },
  { id: "f4-ponytail", skill: "communication/ponytail/SKILL.md", prompt: "Read TASK.md and add the simplest safe cache for normalizeConfig. Use native language features, add no dependency, and avoid speculative abstractions." },
  { id: "f6-ui-redesign", skill: "frontend/redesign-existing-projects/SKILL.md", prompt: "Read TASK.md and improve the existing settings page's visual hierarchy and accessibility. Preserve its DOM structure, text, behavior, and dependencies. This is a targeted redesign, not a rebuild." },
];

const listFiles = (dir) => {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name !== "score.mjs") out.push(full);
    }
  };
  walk(dir);
  return out.sort();
};

for (const fixture of fixtures) {
  const dir = path.join(templates, fixture.id);
  const embedded = listFiles(dir).map((file) => {
    const relative = path.relative(dir, file);
    return `\n--- FILE: ${relative} ---\n${fs.readFileSync(file, "utf8")}--- END FILE: ${relative} ---\n`;
  }).join("");
  for (const condition of ["on", "off"]) {
    const skillText = condition === "on"
      ? `\n--- TARGET SKILL: ${fixture.skill} ---\n${fs.readFileSync(path.join(snapshot, fixture.skill), "utf8")}\n--- SHARED CONTRACT ---\n${fs.readFileSync(path.join(snapshot, "shared/COMMON-CONTRACT.md"), "utf8")}\n--- END SKILL INSTRUCTIONS ---\n`
      : "\n--- SKILL OFF CONDITION ---\nNo target skill or shared skill contract is provided. Solve from the fixture and task only.\n--- END SKILL OFF CONDITION ---\n";
    const text = `SYNTHETIC PATCH TASK\n\n${fixture.prompt}\n${skillText}\nFIXTURE CONTENTS\n${embedded}\nOUTPUT CONTRACT\nReturn exactly one JSON object: {"files":{"relative/path":"complete replacement or new file content"},"final":"concise evidence and limitations"}. Include only changed/new files. Do not use Markdown fences. Do not claim tests ran.\n`;
    fs.writeFileSync(path.join(prompts, `${fixture.id}-${condition}.txt`), text);
  }
}
console.log(`built ${fixtures.length * 2} single-request prompts`);
