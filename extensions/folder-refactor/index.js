import {
  auditFolderRefactorCompletion,
  buildFolderRefactorPrompt,
  formatAuditResult,
  readFolderRefactorState,
  scanFolderRefactorTarget,
  scanTextResult,
  textResult,
  writeFolderRefactorState,
} from "./lib/guardrail.js";

export {
  auditFolderRefactorCompletion,
  buildFolderRefactorPrompt,
  formatAuditResult,
  normalizeFolderRefactorPromptTarget,
  readFolderRefactorState,
  scanFolderRefactorTarget,
  stableStringify,
  writeFolderRefactorState,
} from "./lib/guardrail.js";

const Type = {
  String: (options = {}) => ({ type: "string", ...options }),
  Boolean: (options = {}) => ({ type: "boolean", ...options }),
  Integer: (options = {}) => ({ type: "integer", ...options }),
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

function registerToolIfAvailable(pi, definition) {
  const existingTools = typeof pi.getAllTools === "function" ? pi.getAllTools() : [];
  if (existingTools.some((tool) => tool.name === definition.name)) return false;
  pi.registerTool(definition);
  return true;
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

  pi.on("session_start", () => {
    registerToolIfAvailable(pi, {
      name: "folder_refactor_scan",
      label: "Folder Refactor Scan",
      description: "Return deterministic JSON inventory for a folder-refactor target: sorted root files/dirs/symlinks/other, git status hints, safety metadata, refactor classification hints, and a scan hash. Read-only; no files are moved.",
      parameters: Type.Object({
      target: Type.String({ description: "Target folder to scan, relative to cwd or absolute" }),
      depth: Type.Optional(Type.Integer({ description: "Scan depth. Default 1; maximum 2 for shallow subfolder preview." })),
      limit: Type.Optional(Type.Integer({ description: "Optional maximum number of flat entries to include from offset; full scan hash still covers the root inventory." })),
      offset: Type.Optional(Type.Integer({ description: "Optional flat-entry offset for pagination." })),
    }),
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        const scan = await scanFolderRefactorTarget(ctx.cwd, params.target, {
          depth: params.depth,
          limit: params.limit,
          offset: params.offset,
          signal,
        });
        return scanTextResult(scan);
      },
    });

    registerToolIfAvailable(pi, {
      name: "folder_refactor_audit",
      label: "Folder Refactor Audit",
      description: "Deterministically audit a folder-refactor final report: every remaining root file must be explicitly classified and safe next candidates must not be skipped.",
      parameters: Type.Object({
      target: Type.String({ description: "Target folder to audit, relative to cwd or absolute" }),
      plannedTopologyComplete: Type.Optional(Type.Boolean({ description: "Whether the agent claims the whole target folder topology is complete" })),
      baselineHash: Type.Optional(Type.String({ description: "Optional scanHash from the earlier folder_refactor_scan baseline; mismatch fails the audit" })),
      facadeFiles: Type.Optional(Type.Array(Type.String(), { description: "Exact basenames intentionally left as root facade/compatibility files" })),
      outOfScopeFiles: Type.Optional(Type.Array(Type.String(), { description: "Exact basenames intentionally out of scope for this topology" })),
      nextCandidateFiles: Type.Optional(Type.Array(Type.String(), { description: "Exact basenames that remain move/extraction candidates" })),
    }),
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        const scan = await scanFolderRefactorTarget(ctx.cwd, params.target, { signal });
        const audit = auditFolderRefactorCompletion(scan, params);
        return textResult(formatAuditResult(audit), audit);
      },
    });

    registerToolIfAvailable(pi, {
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
  });
}
