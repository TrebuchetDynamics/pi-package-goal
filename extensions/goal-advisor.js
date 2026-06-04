const TOOL_NAME = "goal_advisor";
const STATE_ENTRY = "goal-advisor-state";
const DEFAULT_MAX_USES = 3;
const DEFAULT_CACHE_RETENTION = "short";
const DEFAULT_MAX_TOKENS = 4_000;
const DEFAULT_TIMEOUT_MS = 600_000;

const Type = {
  String: (options = {}) => ({ type: "string", ...options }),
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

function StringEnum(values, options = {}) {
  return { type: "string", enum: values, ...options };
}

const advisorToolSchema = Type.Object({
  question: Type.String({
    description: "Strategic question for the configured advisor model. Use for planning, risk checks, review, or course correction.",
  }),
  phase: Type.Optional(
    StringEnum(["planning", "course_correction", "review", "stuck", "other"], {
      description: "Why the executor is consulting the advisor.",
      default: "other",
    }),
  ),
  context: Type.Optional(
    Type.String({
      description: "Optional extra context not obvious from the transcript, such as constraints or failed attempts.",
    }),
  ),
});

export function createDefaultAdvisorConfig() {
  return {
    enabled: false,
    provider: "",
    modelId: "",
    maxUses: DEFAULT_MAX_USES,
    cacheRetention: DEFAULT_CACHE_RETENTION,
    maxTokens: DEFAULT_MAX_TOKENS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

export function parseModelSpec(value = "") {
  const trimmed = String(value).trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) return undefined;
  return { provider: trimmed.slice(0, slash), modelId: trimmed.slice(slash + 1) };
}

export function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function parseCacheRetention(value) {
  return value === "none" || value === "short" || value === "long" ? value : undefined;
}

export function normalizeAdvisorConfig(input = {}, fallback = createDefaultAdvisorConfig()) {
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : fallback.enabled,
    provider: typeof input.provider === "string" ? input.provider : fallback.provider,
    modelId: typeof input.modelId === "string" ? input.modelId : fallback.modelId,
    maxUses: typeof input.maxUses === "number" && input.maxUses > 0 ? Math.floor(input.maxUses) : fallback.maxUses,
    cacheRetention: parseCacheRetention(input.cacheRetention) ?? fallback.cacheRetention,
    maxTokens: typeof input.maxTokens === "number" && input.maxTokens > 0 ? Math.floor(input.maxTokens) : fallback.maxTokens,
    timeoutMs: typeof input.timeoutMs === "number" && input.timeoutMs > 0 ? Math.floor(input.timeoutMs) : fallback.timeoutMs,
  };
}

export function handleGoalAdvisorCommand(args = "", config = createDefaultAdvisorConfig(), useCount = 0, modelExists = () => true) {
  const [command = "status", ...rest] = String(args).trim().split(/\s+/).filter(Boolean);
  const value = rest.join(" ").trim();
  const nextConfig = { ...config };
  let nextUseCount = useCount;

  if (command === "status") {
    return {
      config: nextConfig,
      useCount: nextUseCount,
      message: formatAdvisorStatus(nextConfig, nextUseCount, modelExists),
      level: "info",
      persist: false,
      updateToolState: false,
    };
  }

  if (command === "help") {
    return {
      config: nextConfig,
      useCount: nextUseCount,
      message: "Usage: /goal-advisor [status|model <provider>/<model>|enable|disable|max-uses <n>|cache <none|short|long>|reset|help]",
      level: "info",
      persist: false,
      updateToolState: false,
    };
  }

  if (command === "model") {
    const parsed = parseModelSpec(value);
    if (!parsed) return commandError(nextConfig, nextUseCount, "Usage: /goal-advisor model <provider>/<model>");
    if (!modelExists(parsed.provider, parsed.modelId)) {
      return commandError(nextConfig, nextUseCount, `Advisor model not found: ${parsed.provider}/${parsed.modelId}`);
    }
    nextConfig.provider = parsed.provider;
    nextConfig.modelId = parsed.modelId;
    return {
      config: nextConfig,
      useCount: nextUseCount,
      message: `goal-advisor model set to ${parsed.provider}/${parsed.modelId}`,
      level: "info",
      persist: true,
      updateToolState: false,
    };
  }

  if (command === "enable") {
    if (!nextConfig.provider || !nextConfig.modelId) {
      return commandError(nextConfig, nextUseCount, "Set an advisor model first: /goal-advisor model <provider>/<model>");
    }
    if (!modelExists(nextConfig.provider, nextConfig.modelId)) {
      return commandError(nextConfig, nextUseCount, `Advisor model not found: ${nextConfig.provider}/${nextConfig.modelId}`);
    }
    nextConfig.enabled = true;
    return {
      config: nextConfig,
      useCount: nextUseCount,
      message: "goal-advisor enabled",
      level: "info",
      persist: true,
      updateToolState: true,
    };
  }

  if (command === "disable") {
    nextConfig.enabled = false;
    return {
      config: nextConfig,
      useCount: nextUseCount,
      message: "goal-advisor disabled",
      level: "info",
      persist: true,
      updateToolState: true,
    };
  }

  if (command === "reset") {
    nextUseCount = 0;
    return {
      config: nextConfig,
      useCount: nextUseCount,
      message: "goal-advisor use count reset",
      level: "info",
      persist: true,
      updateToolState: false,
    };
  }

  if (command === "max-uses" || command === "maxuses") {
    const maxUses = parsePositiveInt(value);
    if (maxUses === undefined) return commandError(nextConfig, nextUseCount, "Usage: /goal-advisor max-uses <positive-number>");
    nextConfig.maxUses = maxUses;
    return {
      config: nextConfig,
      useCount: nextUseCount,
      message: `goal-advisor max uses set to ${maxUses}`,
      level: "info",
      persist: true,
      updateToolState: false,
    };
  }

  if (command === "cache") {
    const cacheRetention = parseCacheRetention(value);
    if (!cacheRetention) return commandError(nextConfig, nextUseCount, "Usage: /goal-advisor cache <none|short|long>");
    nextConfig.cacheRetention = cacheRetention;
    return {
      config: nextConfig,
      useCount: nextUseCount,
      message: `goal-advisor cache set to ${cacheRetention}`,
      level: "info",
      persist: true,
      updateToolState: false,
    };
  }

  return commandError(nextConfig, nextUseCount, `Unknown /goal-advisor subcommand: ${command}. Try /goal-advisor help`);
}

function commandError(config, useCount, message) {
  return { config, useCount, message, level: "error", persist: false, updateToolState: false };
}

export function formatAdvisorStatus(config, useCount = 0, modelExists = () => true) {
  const model = config.provider && config.modelId ? `${config.provider}/${config.modelId}` : "not configured";
  const availability = config.provider && config.modelId ? (modelExists(config.provider, config.modelId) ? "available" : "not found") : "set with /goal-advisor model";
  return [
    `goal-advisor ${config.enabled ? "enabled" : "disabled"}`,
    `model: ${model} (${availability})`,
    `uses: ${useCount}/${config.maxUses}`,
    `cache: ${config.cacheRetention}`,
  ].join(" • ");
}

export function buildAdvisorUserPrompt(params = {}, conversationText = "") {
  return [
    "## Executor Question",
    params.question ?? "",
    "",
    "## Consultation Phase",
    params.phase ?? "other",
    "",
    ...(params.context ? ["## Extra Context", params.context, ""] : []),
    "## Conversation Transcript",
    conversationText || "(no prior conversation entries)",
  ].join("\n");
}

export function serializeBranchForAdvisor(entries = [], maxChars = 50_000) {
  const parts = [];
  for (const entry of entries) {
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (message?.role === "user") parts.push(`USER:\n${contentToText(message.content)}`);
    else if (message?.role === "assistant") parts.push(`ASSISTANT:\n${assistantContentToText(message.content)}`);
    else if (message?.role === "toolResult") parts.push(`TOOL RESULT ${message.toolName ?? "tool"} (${message.isError ? "error" : "ok"}):\n${contentToText(message.content)}`);
  }
  return truncateMiddle(parts.join("\n\n---\n\n"), maxChars);
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (part?.type === "text") return part.text ?? "";
    if (part?.type === "image") return `[image omitted: ${part.mimeType ?? "unknown"}]`;
    return JSON.stringify(part ?? {});
  }).join("\n");
}

function assistantContentToText(content) {
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (part?.type === "text") return part.text ?? "";
    if (part?.type === "thinking") return `[thinking]\n${part.thinking ?? ""}`;
    if (part?.type === "toolCall") return `[tool call: ${part.name}] ${safeJson(part.arguments ?? {})}`;
    return safeJson(part ?? {});
  }).join("\n");
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateMiddle(text, maxChars) {
  if (!maxChars || text.length <= maxChars) return text;
  const half = Math.floor((maxChars - 38) / 2);
  return `${text.slice(0, half)}\n\n[...advisor transcript truncated...]\n\n${text.slice(-half)}`;
}

function makeStateEntry(config, useCount) {
  return { version: 1, config: { ...config }, useCount, updatedAt: new Date().toISOString() };
}

function makeSkippedDetails(config, useCount, params, stopReason = "skipped") {
  return {
    advisor: {
      provider: config.provider,
      model: config.modelId,
      phase: params.phase ?? "other",
      useCount,
      maxUses: config.maxUses,
      cacheRetention: config.cacheRetention,
      elapsedMs: 0,
      stopReason,
    },
    state: makeStateEntry(config, useCount),
  };
}

function skippedResult(text, config, useCount, params, stopReason) {
  return { content: [{ type: "text", text }], details: makeSkippedDetails(config, useCount, params, stopReason) };
}

function extractText(content = []) {
  return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
}

function restoreStateFromBranch(ctx, fallbackConfig) {
  let config = fallbackConfig;
  let useCount = 0;
  const branch = ctx.sessionManager?.getBranch?.() ?? [];
  for (const entry of branch) {
    if (entry.type === "custom" && entry.customType === STATE_ENTRY) {
      config = normalizeAdvisorConfig(entry.data?.config, config);
      if (typeof entry.data?.useCount === "number") useCount = Math.max(useCount, entry.data.useCount);
    }
    if (entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === TOOL_NAME) {
      const details = entry.message.details ?? {};
      if (details.state?.config) config = normalizeAdvisorConfig(details.state.config, config);
      if (typeof details.state?.useCount === "number") useCount = Math.max(useCount, details.state.useCount);
      else if (typeof details.advisor?.useCount === "number") useCount = Math.max(useCount, details.advisor.useCount);
    }
  }
  return { config, useCount };
}

function persistState(pi, config, useCount) {
  pi.appendEntry?.(STATE_ENTRY, makeStateEntry(config, useCount));
}

function syncActiveTool(pi, config) {
  if (!pi.getActiveTools || !pi.setActiveTools) return;
  const activeTools = pi.getActiveTools();
  const hasTool = activeTools.includes(TOOL_NAME);
  if (config.enabled && !hasTool) pi.setActiveTools([...activeTools, TOOL_NAME]);
  if (!config.enabled && hasTool) pi.setActiveTools(activeTools.filter((tool) => tool !== TOOL_NAME));
}

function updateStatus(ctx, config, useCount) {
  if (!ctx?.hasUI) return;
  if (!config.enabled) {
    ctx.ui.setStatus("goal-advisor", undefined);
    return;
  }
  const remaining = Math.max(0, config.maxUses - useCount);
  ctx.ui.setStatus("goal-advisor", ctx.ui.theme?.fg ? ctx.ui.theme.fg(remaining > 0 ? "accent" : "warning", `advisor:${remaining}`) : `advisor:${remaining}`);
}

const ADVISOR_SYSTEM_PROMPT = `You are a strategic advisor for Pi Coding Agent.

You have no tools and must not claim to inspect files directly. Use the supplied conversation transcript only.
Return concise guidance that helps the executor choose the next safe action, identify risks, and pick validation. If the request is unsafe, too expensive, or under-specified, say exactly what must be clarified.`;

export default function goalAdvisorExtension(pi) {
  let config = createDefaultAdvisorConfig();
  let useCount = 0;

  pi.registerTool({
    name: TOOL_NAME,
    label: "Goal Advisor",
    description: "Consult an explicitly configured advisor model for strategic planning, risk checks, review, or course correction. The advisor has no tools and cannot edit files.",
    promptSnippet: "Consult the configured advisor model for strategic planning and risk checks when goal-advisor is enabled.",
    promptGuidelines: [
      "Use goal_advisor only when goal-advisor is enabled and the task is complex, risky, stuck, or ready for strategic review.",
      "Do not use goal_advisor for trivial edits, simple lookups, or when the user asked to avoid extra model calls.",
    ],
    parameters: advisorToolSchema,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      ({ config, useCount } = restoreStateFromBranch(ctx, config));
      syncActiveTool(pi, config);
      updateStatus(ctx, config, useCount);

      if (!config.enabled) {
        return skippedResult(`goal-advisor is disabled. Continue without advisor guidance for: ${params.question}`, config, useCount, params, "disabled");
      }
      if (!config.provider || !config.modelId) {
        return skippedResult("goal-advisor has no configured model. Run /goal-advisor model <provider>/<model> then /goal-advisor enable.", config, useCount, params, "not_configured");
      }
      if (useCount >= config.maxUses) {
        return skippedResult(`goal-advisor use limit reached (${useCount}/${config.maxUses}). Continue without another advisor call for: ${params.question}`, config, useCount, params, "limit_reached");
      }

      const model = ctx.modelRegistry?.find?.(config.provider, config.modelId);
      if (!model) throw new Error(`Advisor model not found: ${config.provider}/${config.modelId}. Run /goal-advisor model <provider>/<model>.`);

      onUpdate?.({
        content: [{ type: "text", text: `Consulting advisor ${config.provider}/${config.modelId}...` }],
        details: makeSkippedDetails(config, useCount, params, "pending"),
      });

      const { complete } = await import("@earendil-works/pi-ai");
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok) throw new Error(auth.error);

      const startedAt = Date.now();
      const transcript = serializeBranchForAdvisor(ctx.sessionManager?.getBranch?.() ?? []);
      const response = await complete(
        model,
        {
          systemPrompt: ADVISOR_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: buildAdvisorUserPrompt(params, transcript) }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          signal,
          cacheRetention: config.cacheRetention,
          sessionId: `goal-advisor:${ctx.sessionManager?.getSessionId?.() ?? "session"}`,
          maxTokens: config.maxTokens,
          timeoutMs: config.timeoutMs,
        },
      );

      if (response.stopReason === "error") throw new Error(response.errorMessage ?? "Advisor model returned an error");
      if (response.stopReason === "aborted") throw new Error("Advisor call aborted");

      useCount += 1;
      persistState(pi, config, useCount);
      syncActiveTool(pi, config);
      updateStatus(ctx, config, useCount);

      const elapsedMs = Date.now() - startedAt;
      const text = extractText(response.content) || "Advisor returned no text guidance.";
      const details = {
        advisor: {
          provider: response.provider ?? config.provider,
          model: response.model ?? config.modelId,
          phase: params.phase ?? "other",
          useCount,
          maxUses: config.maxUses,
          cacheRetention: config.cacheRetention,
          elapsedMs,
          stopReason: response.stopReason,
          usage: response.usage,
        },
        state: makeStateEntry(config, useCount),
      };

      return { content: [{ type: "text", text: `Advisor guidance (${useCount}/${config.maxUses}, ${config.provider}/${config.modelId}):\n\n${text}` }], details };
    },
  });

  pi.registerCommand("goal-advisor", {
    description: "Configure the opt-in goal advisor tool",
    handler: async (args, ctx) => {
      ({ config, useCount } = restoreStateFromBranch(ctx, config));
      const modelExists = (provider, modelId) => Boolean(ctx.modelRegistry?.find?.(provider, modelId));
      const result = handleGoalAdvisorCommand(args, config, useCount, modelExists);
      config = result.config;
      useCount = result.useCount;
      if (result.persist) persistState(pi, config, useCount);
      if (result.updateToolState || result.persist) syncActiveTool(pi, config);
      updateStatus(ctx, config, useCount);
      ctx.ui.notify(result.message, result.level);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    ({ config, useCount } = restoreStateFromBranch(ctx, config));
    syncActiveTool(pi, config);
    updateStatus(ctx, config, useCount);
  });

  pi.on("session_tree", async (_event, ctx) => {
    ({ config, useCount } = restoreStateFromBranch(ctx, createDefaultAdvisorConfig()));
    syncActiveTool(pi, config);
    updateStatus(ctx, config, useCount);
  });

  pi.on("before_agent_start", async (event) => {
    if (!config.enabled) return undefined;
    const remaining = Math.max(0, config.maxUses - useCount);
    if (remaining <= 0) return undefined;
    return {
      systemPrompt: `${event.systemPrompt}\n\nGoal-advisor is enabled. The goal_advisor tool may consult ${config.provider}/${config.modelId} for strategic planning, review, or course correction. It has ${remaining}/${config.maxUses} uses remaining and may add cost/latency, so use it only when it materially reduces risk.`,
    };
  });
}
