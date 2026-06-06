import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const requiredColorTokens = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "selectedBg",
  "userMessageBg",
  "userMessageText",
  "customMessageBg",
  "customMessageText",
  "customMessageLabel",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "bashMode",
];

const themePath = path.join(root, "themes", "trebuchet-neon.json");
const theme = JSON.parse(fs.readFileSync(themePath, "utf8"));
assert.equal(theme.name, "trebuchet-neon");
assert.ok(theme.$schema.includes("theme-schema.json"));
assert.ok(theme.vars.green);
for (const token of requiredColorTokens) {
  assert.ok(Object.hasOwn(theme.colors, token), `trebuchet-neon theme missing color token: ${token}`);
}
assert.equal(Object.hasOwn(theme.colors, "export"), false, "theme export colors belong in top-level export object");
assert.equal(typeof theme.export, "object");
assert.equal(typeof theme.export.pageBg, "string");

console.log("theme-assets ok");
