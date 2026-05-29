import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

const Type = {
  String: (options = {}) => ({ type: "string", ...options }),
  Boolean: (options = {}) => ({ type: "boolean", ...options }),
  Array: (items, options = {}) => ({ type: "array", items, ...options }),
  Optional: (schema) => ({ ...schema, __optional: true }),
  Object: (properties) => ({
    type: "object",
    properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, stripOptionalMarker(value)])),
    required: Object.entries(properties).filter(([, value]) => !value.__optional).map(([key]) => key),
  }),
};

function stripOptionalMarker(schema) {
  const { __optional, ...rest } = schema;
  return rest;
}

const stateDirName = join(".pi", "folder-refactor");

export function resolveTarget(cwd, target = ".") {
  const resolved = isAbsolute(target) ? resolve(target) : resolve(cwd, target || ".");
  const relativeTarget = relative(cwd, resolved) || ".";
  return { absolute: resolved, relative: relativeTarget };
}

export async function scanFolderRefactorTarget(cwd, target = ".") {
  const resolved = resolveTarget(cwd, target);
  const entries = await readdir(resolved.absolute, { withFileTypes: true });
  const rootFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const rootDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  return { target: resolved.relative, targetAbsolute: resolved.absolute, rootFiles, rootDirs };
}

export function auditFolderRefactorCompletion(scan, classifications = {}) {
  const facade = stringSet(classifications.facadeFiles);
  const outOfScope = stringSet(classifications.outOfScopeFiles);
  const nextCandidates = stringSet(classifications.nextCandidateFiles);
  const classified = new Set([...facade, ...outOfScope, ...nextCandidates]);
  const rootFileSet = new Set(scan.rootFiles);
  const unclassified = scan.rootFiles.filter((file) => !classified.has(file));
  const unknownClassified = [...classified].filter((file) => !rootFileSet.has(file)).sort((a, b) => a.localeCompare(b));
  const issues = [];

  if (unclassified.length) issues.push(`${unclassified.length} root file(s) are unclassified`);
  if (unknownClassified.length) issues.push(`${unknownClassified.length} classified file(s) are not present at target root`);
  if (classifications.plannedTopologyComplete && nextCandidates.size) {
    issues.push("plannedTopologyComplete is true but nextCandidateFiles is not empty");
  }
  if (classifications.plannedTopologyComplete && unclassified.length) {
    issues.push("plannedTopologyComplete is true but root files remain unclassified");
  }

  return {
    ok: issues.length === 0,
    issues,
    target: scan.target,
    rootFiles: scan.rootFiles,
    rootDirs: scan.rootDirs,
    classifications: {
      facadeFiles: [...facade].sort((a, b) => a.localeCompare(b)),
      outOfScopeFiles: [...outOfScope].sort((a, b) => a.localeCompare(b)),
      nextCandidateFiles: [...nextCandidates].sort((a, b) => a.localeCompare(b)),
    },
    unclassified,
    unknownClassified,
    plannedTopologyComplete: Boolean(classifications.plannedTopologyComplete),
  };
}

export function formatAuditResult(audit) {
  const lines = [
    `FOLDER_REFACTOR_AUDIT: ${audit.ok ? "pass" : "fail"}`,
    `target: ${audit.target}`,
    `plannedTopologyComplete: ${audit.plannedTopologyComplete ? "yes" : "no"}`,
    `root files: ${audit.rootFiles.length}`,
    `root dirs: ${audit.rootDirs.length}`,
  ];
  if (audit.issues.length) {
    lines.push("issues:", ...audit.issues.map((issue) => `- ${issue}`));
  }
  lines.push(
    `facade/compatibility: ${audit.classifications.facadeFiles.join(", ") || "none"}`,
    `out-of-scope: ${audit.classifications.outOfScopeFiles.join(", ") || "none"}`,
    `next candidates: ${audit.classifications.nextCandidateFiles.join(", ") || "none"}`,
    `unclassified: ${audit.unclassified.join(", ") || "none"}`,
  );
  if (audit.unknownClassified.length) lines.push(`unknown classified: ${audit.unknownClassified.join(", ")}`);
  return lines.join("\n");
}

export function buildFolderRefactorPrompt(args = "") {
  const target = args.trim();
  const targetText = target || "the named target folder";
  return [
    `/skill:skill-folder-refactor ${target}`.trimEnd(),
    "",
    "Use the folder-refactor guardrail extension while working:",
    `- Start with folder_refactor_scan on ${targetText}.`,
    "- Before any final report, call folder_refactor_audit with exact remaining root file basenames classified as facadeFiles, outOfScopeFiles, or nextCandidateFiles.",
    "- If folder_refactor_audit fails, do not report done; either continue safe slices or report the specific blocker.",
    "- If nextCandidateFiles is non-empty and validation is green, execute the next candidate instead of stopping.",
  ].join("\n");
}

export async function writeFolderRefactorState(cwd, target, state) {
  const resolved = resolveTarget(cwd, target);
  const dir = join(cwd, stateDirName);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${safeStateName(resolved.relative)}.json`);
  const payload = { version: 1, target: resolved.relative, updatedAt: new Date().toISOString(), ...state };
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
  return { file, payload };
}

export async function readFolderRefactorState(cwd, target) {
  const resolved = resolveTarget(cwd, target);
  const file = join(cwd, stateDirName, `${safeStateName(resolved.relative)}.json`);
  const payload = JSON.parse(await readFile(file, "utf8"));
  return { file, payload };
}

function safeStateName(target) {
  return (target || "root").split(sep).join("__").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function stringSet(value) {
  return new Set((Array.isArray(value) ? value : []).map((item) => basename(String(item))).filter(Boolean));
}

function textResult(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}

export default function (pi) {
  pi.registerCommand("folder-refactor", {
    description: "Start guarded folder-refactor with deterministic completion audit",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy; queue /folder-refactor after the current turn.", "warning");
        return;
      }
      pi.sendUserMessage(buildFolderRefactorPrompt(args));
    },
  });

  pi.registerTool({
    name: "folder_refactor_scan",
    label: "Folder Refactor Scan",
    description: "List exact root files and subdirectories for a folder-refactor target before planning or completion audit.",
    parameters: Type.Object({
      target: Type.String({ description: "Target folder to scan, relative to cwd or absolute" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const scan = await scanFolderRefactorTarget(ctx.cwd, params.target);
      return textResult([
        `target: ${scan.target}`,
        `root files (${scan.rootFiles.length}): ${scan.rootFiles.join(", ") || "none"}`,
        `root dirs (${scan.rootDirs.length}): ${scan.rootDirs.join(", ") || "none"}`,
      ].join("\n"), scan);
    },
  });

  pi.registerTool({
    name: "folder_refactor_audit",
    label: "Folder Refactor Audit",
    description: "Deterministically audit a folder-refactor final report: every remaining root file must be explicitly classified and safe next candidates must not be skipped.",
    parameters: Type.Object({
      target: Type.String({ description: "Target folder to audit, relative to cwd or absolute" }),
      plannedTopologyComplete: Type.Optional(Type.Boolean({ description: "Whether the agent claims the whole target folder topology is complete" })),
      facadeFiles: Type.Optional(Type.Array(Type.String(), { description: "Exact basenames intentionally left as root facade/compatibility files" })),
      outOfScopeFiles: Type.Optional(Type.Array(Type.String(), { description: "Exact basenames intentionally out of scope for this topology" })),
      nextCandidateFiles: Type.Optional(Type.Array(Type.String(), { description: "Exact basenames that remain move/extraction candidates" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const scan = await scanFolderRefactorTarget(ctx.cwd, params.target);
      const audit = auditFolderRefactorCompletion(scan, params);
      return textResult(formatAuditResult(audit), audit);
    },
  });

  pi.registerTool({
    name: "folder_refactor_state",
    label: "Folder Refactor State",
    description: "Read or write local .pi/folder-refactor state for long folder-refactor objectives.",
    parameters: Type.Object({
      action: Type.String({ description: "read or write" }),
      target: Type.String({ description: "Target folder, relative to cwd or absolute" }),
      objective: Type.Optional(Type.String({ description: "Current objective/topology summary for write" })),
      completedSlices: Type.Optional(Type.Array(Type.String(), { description: "Validated slices completed so far" })),
      nextCandidates: Type.Optional(Type.Array(Type.String(), { description: "Known next candidate slices" })),
      validationReceipts: Type.Optional(Type.Array(Type.String(), { description: "Validation commands/results" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.action === "read") {
        const state = await readFolderRefactorState(ctx.cwd, params.target);
        return textResult(`state: ${state.file}\n${JSON.stringify(state.payload, null, 2)}`, state);
      }
      if (params.action !== "write") throw new Error("folder_refactor_state action must be read or write");
      const state = await writeFolderRefactorState(ctx.cwd, params.target, {
        objective: params.objective ?? "",
        completedSlices: params.completedSlices ?? [],
        nextCandidates: params.nextCandidates ?? [],
        validationReceipts: params.validationReceipts ?? [],
      });
      return textResult(`state written: ${state.file}`, state);
    },
  });
}
