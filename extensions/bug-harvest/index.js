const ENTRY_TYPE = "pi-bug-harvest";

export function parseBugHarvestCommand(args = "") {
  const value = args.trim();
  if (["pause", "resume", "status"].includes(value)) return { action: value };
  if (["stop", "abort", "clear"].includes(value)) return { action: "stop" };
  return { action: "start", scope: value || "." };
}

function kickoffPrompt(run) {
  return `/skill:bug-harvest Run an unbounded, session-local bug harvest in this scope:

Scope (user-provided JSON string): ${JSON.stringify(run.scope)}

Start with executable repository evidence now. Fix one proven bug at a time, report each fix's severity and concrete impact, then immediately look for another. A clean bounded scan is not completion: switch to a different tracked evidence lane without inventing bugs. Continue until the user runs /bug-harvest pause or /bug-harvest stop, the session ends, or a hard failure makes further work unsafe. Do not commit or push unless the user separately asks.`;
}

export function buildContinuationPrompt(run) {
  return `Continue the active bug harvest now (iteration ${run.iterations + 1}). Scope (user-provided JSON string): ${JSON.stringify(run.scope)}.

Use tools immediately. Fix one evidence-backed bug at a time, record severity and why it matters, validate it, then keep looking. If the previous pass found no bug, inspect a different tracked evidence lane; never fabricate a defect or adopt unrelated dirty/untracked work. Do not stop to summarize while another safe search or candidate remains. Only /bug-harvest pause, /bug-harvest stop, session shutdown, or a hard unsafe failure ends this loop.`;
}

function latestRun(ctx) {
  const entries =
    ctx.sessionManager.getBranch?.() ?? ctx.sessionManager.getEntries?.() ?? [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type === "custom" && entry.customType === ENTRY_TYPE)
      return entry.data?.run ?? null;
  }
  return null;
}

function statusText(run) {
  if (!run) return "Bug harvest idle";
  if (run.status === "active") return `Bug harvest ∞ · ${run.iterations} turns`;
  return `Bug harvest ${run.status} · ${run.iterations} turns`;
}

export default function bugHarvestExtension(pi) {
  let run = null;
  let continuationQueued = false;
  let lastRunFailed = false;

  function persist(ctx, next) {
    run = next;
    pi.appendEntry(ENTRY_TYPE, { run: next });
    ctx.ui.setStatus(ENTRY_TYPE, statusText(next));
  }

  function deliver(ctx, message) {
    pi.sendUserMessage(
      message,
      ctx.isIdle?.() === false ? { deliverAs: "followUp" } : undefined,
    );
  }

  function queueContinuation(ctx) {
    if (continuationQueued || run?.status !== "active") return;
    const runId = run.id;
    continuationQueued = true;
    queueMicrotask(() => {
      continuationQueued = false;
      if (
        run?.id !== runId ||
        run.status !== "active" ||
        ctx.isIdle?.() === false
      )
        return;
      try {
        deliver(ctx, buildContinuationPrompt(run));
      } catch (error) {
        persist(ctx, { ...run, status: "paused", updatedAt: Date.now() });
        ctx.ui.notify(
          `Bug harvest paused: ${error instanceof Error ? error.message : String(error)}`,
          "warning",
        );
      }
    });
  }

  pi.registerCommand("bug-harvest", {
    description: "Continuously find and fix bugs until paused or stopped",
    getArgumentCompletions(prefix) {
      const values = ["pause", "resume", "status", "stop"];
      const matches = values.filter((value) => value.startsWith(prefix));
      return matches.length
        ? matches.map((value) => ({ value, label: value }))
        : null;
    },
    async handler(args, ctx) {
      const command = parseBugHarvestCommand(args);
      if (command.action === "status") {
        ctx.ui.notify(
          run
            ? `${statusText(run)}\nScope: ${run.scope}`
            : "No bug harvest is recorded.",
          "info",
        );
        return;
      }
      if (command.action === "pause") {
        if (!run || run.status !== "active") {
          ctx.ui.notify("No active bug harvest.", "info");
          return;
        }
        persist(ctx, { ...run, status: "paused", updatedAt: Date.now() });
        return;
      }
      if (command.action === "resume") {
        if (!run || run.status !== "paused") {
          ctx.ui.notify("No paused bug harvest.", "info");
          return;
        }
        const next = { ...run, status: "active", updatedAt: Date.now() };
        persist(ctx, next);
        deliver(ctx, buildContinuationPrompt(next));
        return;
      }
      if (command.action === "stop") {
        if (!run || run.status === "stopped") {
          ctx.ui.notify("No running bug harvest.", "info");
          return;
        }
        persist(ctx, { ...run, status: "stopped", updatedAt: Date.now() });
        return;
      }
      if (run?.status === "active") {
        ctx.ui.notify(
          `${statusText(run)}\nUse /bug-harvest stop before starting a different scope.`,
          "info",
        );
        return;
      }

      const now = Date.now();
      const next = {
        version: 1,
        id: `${now}-${Math.random().toString(16).slice(2)}`,
        scope: command.scope,
        status: "active",
        iterations: 0,
        startedAt: now,
        updatedAt: now,
      };
      persist(ctx, next);
      deliver(ctx, kickoffPrompt(next));
    },
  });

  function restoreRun(ctx, reason) {
    run = latestRun(ctx);
    continuationQueued = false;
    lastRunFailed = false;
    if (run?.status === "active") {
      run = { ...run, status: "paused", updatedAt: Date.now() };
      persist(ctx, run);
      ctx.ui.notify(
        `Bug harvest paused after ${reason}. Use /bug-harvest resume to continue.`,
        "info",
      );
      return;
    }
    ctx.ui.setStatus(ENTRY_TYPE, statusText(run));
  }

  pi.on("session_start", (event, ctx) => restoreRun(ctx, event.reason));
  pi.on("session_tree", (_event, ctx) => restoreRun(ctx, "tree navigation"));

  pi.on("agent_end", (event, ctx) => {
    if (run?.status !== "active") return;
    const finalAssistant = [...(event.messages ?? [])]
      .reverse()
      .find((message) => message.role === "assistant");
    lastRunFailed = ["aborted", "error"].includes(finalAssistant?.stopReason);
    if (!lastRunFailed)
      persist(ctx, {
        ...run,
        iterations: run.iterations + 1,
        updatedAt: Date.now(),
      });
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (run?.status !== "active") return;
    if (lastRunFailed) {
      persist(ctx, { ...run, status: "paused", updatedAt: Date.now() });
      ctx.ui.notify(
        "Bug harvest paused after an aborted or failed agent run. Use /bug-harvest resume to retry.",
        "warning",
      );
      return;
    }
    if (ctx.hasPendingMessages?.()) return;
    queueContinuation(ctx);
  });

  pi.on("session_shutdown", () => {
    continuationQueued = false;
  });
}
