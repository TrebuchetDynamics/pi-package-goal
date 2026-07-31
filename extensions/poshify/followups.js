import { resolveAtPath } from "../../node_modules/pi-posher/src/lib/paths.mjs";

export default function registerPoshifyFollowups({
  pi,
  Type,
  runPoshify,
  hasIssueOutput,
}) {
  const modes = [
    ["fix", ["fix-tools"]],
    ["audit", ["tools", "audit-tools"]],
  ];

  for (const [mode, sections] of modes) {
    pi.registerTool({
      name: `run_poshify_${mode}`,
      label: `Run Poshify ${mode}`,
      description: `Run configured Poshify ${mode} tools on a file or directory`,
      parameters: Type.Object({
        path: Type.String({ description: "File or directory path" }),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const target = resolveAtPath(params.path, ctx.cwd);
        const result = await runPoshify(ctx, {
          input: { path: params.path },
          sections,
          label: `--${mode}`,
          showInfo: true,
          signal: ctx.signal,
        });
        if (hasIssueOutput(result.summary)) {
          throw new Error(`Target: ${target}\n${result.summary}`);
        }
        return {
          content: [
            {
              type: "text",
              text: result.summary || "No changes or issues found.",
            },
          ],
          details: { target, findings: result.findings.length },
        };
      },
    });
  }
}
