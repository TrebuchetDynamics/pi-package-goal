import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const expectedCells = [
  "f1-skill-authoring:off", "f1-skill-authoring:on",
  "f2-diagnose:off", "f2-diagnose:on",
  "f3-bug-harvest:off", "f3-bug-harvest:on",
  "f4-ponytail:off", "f4-ponytail:on",
  "f6-ui-redesign:off", "f6-ui-redesign:on",
];

export function parsePatchPayload(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("patch payload must be valid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("patch payload must be an object");
  if (!value.files || typeof value.files !== "object" || Array.isArray(value.files)) throw new Error("patch files must be an object");
  if (typeof value.final !== "string") throw new Error("patch final must be a string");
  const extra = Object.keys(value).filter((key) => !["files", "final"].includes(key));
  if (extra.length) throw new Error(`unexpected patch keys: ${extra.join(",")}`);
  for (const [relative, content] of Object.entries(value.files)) {
    if (typeof content !== "string") throw new Error(`patch content must be text: ${relative}`);
    if (!relative || path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").includes("..")) throw new Error(`unsafe patch path: ${relative}`);
    if (Buffer.byteLength(content) > 256 * 1024) throw new Error(`patch file too large: ${relative}`);
  }
  return value;
}

export function applyPatchPayload(fixtureDir, payload) {
  for (const relative of Object.keys(payload.files)) {
    const target = path.resolve(fixtureDir, relative);
    if (!target.startsWith(`${path.resolve(fixtureDir)}${path.sep}`)) throw new Error(`patch escaped fixture: ${relative}`);
    rejectSymlinkPath(fixtureDir, relative);
  }
  const before = snapshot(fixtureDir);
  try {
    for (const [relative, content] of Object.entries(payload.files)) {
      const target = path.resolve(fixtureDir, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  } catch (error) {
    restore(fixtureDir, before);
    throw error;
  }
}

export function scoreFixture({ fixtureId, fixtureDir, templateDir, transcriptPath }) {
  const proc = spawnSync(process.execPath, ["score.mjs"], {
    cwd: fixtureDir,
    encoding: "utf8",
    env: { PATH: process.env.PATH, FIXTURE_ID: fixtureId, TEMPLATE_DIR: templateDir, TRANSCRIPT_PATH: transcriptPath },
  });
  if (proc.status !== 0) throw new Error(`scorer failed for ${fixtureId}: ${proc.stderr || proc.stdout}`);
  return JSON.parse(proc.stdout);
}

export function validatePairCompleteness(records) {
  if (!Array.isArray(records)) return { complete: false, errors: ["records must be an array"] };
  const errors = [];
  const seen = new Set();
  for (const record of records) {
    const cell = `${record?.fixtureId}:${record?.condition}`;
    if (!expectedCells.includes(cell)) errors.push(`unknown cell: ${cell}`);
    if (seen.has(cell)) errors.push(`duplicate cell: ${cell}`);
    seen.add(cell);
    if (record?.status !== "scored") errors.push(`unscored cell: ${cell}`);
    if (!Number.isFinite(record?.score)) errors.push(`missing score: ${cell}`);
  }
  for (const cell of expectedCells) if (!seen.has(cell)) errors.push(`missing cell: ${cell}`);
  return { complete: errors.length === 0, errors: [...new Set(errors)].sort() };
}

function rejectSymlinkPath(root, relative) {
  let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`symlink patch path rejected: ${relative}`);
  }
}

function snapshot(root) {
  const result = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isSymbolicLink()) result.set(path.relative(root, full), { type: "symlink", target: fs.readlinkSync(full) });
      else result.set(path.relative(root, full), { type: "file", content: fs.readFileSync(full) });
    }
  };
  walk(root);
  return result;
}

function restore(root, state) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  for (const [relative, entry] of state) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (entry.type === "symlink") fs.symlinkSync(entry.target, target);
    else fs.writeFileSync(target, entry.content);
  }
}
