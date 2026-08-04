const CUSTOM_TYPE = "pi-isolated-verifier";
const MAX_VERDICT_CHARS = 20_000;

const SYSTEM_PROMPT = `You are an independent, skeptical software verifier in a fresh read-only Pi session. You cannot see the implementing conversation and must not trust its claims. Inspect only the current repository with read, grep, find, and ls. Do not modify files, run commands, access credentials, use the network beyond this model request, or infer success from intent.

Evaluate the user's verification contract against current files. Return:
VERDICT: pass | fail | unverified
EVIDENCE: exact paths and observations
GAPS: missing or uncheckable requirements
Do not emit a pass unless every contract item has direct evidence.`;

export function buildVerifierArgs({ contract, model, thinkingLevel = "low" }) {
  return [
    "--provider",
    model.provider,
    "--model",
    model.id,
    "--thinking",
    thinkingLevel,
    "--mode",
    "json",
    "--print",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--tools",
    "read,grep,find,ls",
    "--no-approve",
    "--system-prompt",
    SYSTEM_PROMPT,
    contract,
  ];
}

function addUsage(total, usage) {
  for (const [key, value] of Object.entries(usage ?? {})) {
    if (typeof value === "number") total[key] = (total[key] ?? 0) + value;
    else if (value && typeof value === "object")
      total[key] = addUsage(total[key] ?? {}, value);
  }
  return total;
}

export function parseVerifierOutput(stdout) {
  const messages = [];
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "message_end" && event.message?.role === "assistant")
      messages.push(event.message);
  }
  const message = messages.at(-1);
  if (!message)
    throw new Error("isolated verifier produced no assistant verdict");
  if (message.stopReason === "error")
    throw new Error(message.errorMessage || "isolated verifier model error");
  const text = (message.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("isolated verifier verdict was empty");
  const usage = messages.reduce(
    (total, item) => addUsage(total, item.usage),
    {},
  );
  return { text, usage: Object.keys(usage).length ? usage : null };
}

export default function isolatedVerifier(pi) {
  pi.registerCommand("verify-isolated", {
    description: "Verify a contract in a fresh read-only Pi session",
    async handler(args, ctx) {
      const contract = args.trim();
      if (!contract) {
        ctx.ui.notify(
          "Usage: /verify-isolated <verification contract>",
          "warning",
        );
        return;
      }
      if (!ctx.model) {
        ctx.ui.notify(
          "No model is selected for isolated verification.",
          "warning",
        );
        return;
      }

      ctx.ui.notify(
        "Running an isolated read-only verifier; this may use multiple provider requests.",
        "info",
      );
      const result = await pi.exec(
        "pi",
        buildVerifierArgs({
          contract,
          model: ctx.model,
          thinkingLevel: ctx.thinkingLevel,
        }),
        {
          cwd: ctx.cwd,
          signal: ctx.signal,
          timeout: 15 * 60 * 1000,
        },
      );
      if (result.code !== 0) {
        ctx.ui.notify(
          `Isolated verifier failed: ${(result.stderr || result.stdout || `exit ${result.code}`).trim().slice(0, 1000)}`,
          "error",
        );
        return;
      }

      let verdict;
      try {
        verdict = parseVerifierOutput(result.stdout);
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
        return;
      }
      const truncated =
        verdict.text.length > MAX_VERDICT_CHARS
          ? `${verdict.text.slice(0, MAX_VERDICT_CHARS)}\n\n[verdict truncated]`
          : verdict.text;
      pi.sendMessage({
        customType: CUSTOM_TYPE,
        content: truncated,
        display: true,
        details: {
          contract,
          model: `${ctx.model.provider}/${ctx.model.id}`,
          usage: verdict.usage,
          timestamp: Date.now(),
        },
      });
    },
  });
}
