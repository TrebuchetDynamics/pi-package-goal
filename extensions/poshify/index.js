import { keyHint } from "@earendil-works/pi-coding-agent";
import { Box, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import registerPosher from "../../node_modules/pi-posher/src/pi-posher.mjs";
import { hasIssueOutput } from "../../node_modules/pi-posher/src/lib/output.mjs";
import { runPoshify } from "../../node_modules/pi-posher/src/poshify.mjs";
import registerPoshifyFollowups from "./followups.js";

const COLLAPSED_LINE_LIMIT = 20;

function messageText(content, details) {
  if (typeof details?.summary === "string") return details.summary;
  if (typeof content === "string") return content;
  return Array.isArray(content)
    ? content
        .filter((item) => item?.type === "text")
        .map((item) => item.text)
        .join("\n")
    : "";
}

function registerSafeDiagnosticsRenderer(pi) {
  pi.registerMessageRenderer("pi-posher", (message, { expanded }, theme) => {
    const text = messageText(message.content, message.details);
    const lines = text.split("\n");
    const hidden =
      !expanded && lines.length > COLLAPSED_LINE_LIMIT
        ? lines.length - COLLAPSED_LINE_LIMIT
        : 0;
    const body = hidden
      ? `${lines.slice(0, COLLAPSED_LINE_LIMIT).join("\n")}\n···▶ (${hidden} more lines, ${keyHint("app.tools.expand", "to expand")})`
      : text;
    const box = new Box(1, 1, (value) =>
      theme.bg(hasIssueOutput(text) ? "toolErrorBg" : "toolSuccessBg", value),
    );
    box.addChild(new Text(theme.fg("toolTitle", theme.bold("poshify")), 0, 0));
    if (body.trim()) {
      box.addChild(new Spacer(1));
      box.addChild(new Text(body, 0, 0));
    }
    return box;
  });
}

export default async function registerPoshify(pi) {
  await registerPosher(pi);
  // ponytail: replace pi-posher's unbounded collapsed-output hint; Text wraps to the TUI width.
  registerSafeDiagnosticsRenderer(pi);
  registerPoshifyFollowups({ pi, Type, runPoshify, hasIssueOutput });
}
