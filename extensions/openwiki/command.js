import { splitCommandArgs } from "../_shared/pi-bridge/command-grammar.js";

export const OPENWIKI_REPO_URL = "https://github.com/langchain-ai/openwiki.git";
export const OPENWIKI_USAGE = `Usage: /openwiki [status|explain|progress|install|init|update|run|message...] [options]
Examples: /openwiki, /openwiki document the API, /openwiki progress, /openwiki install --yes, /openwiki init --yes, /openwiki update --yes`;
export const OPENWIKI_EXPLANATION = `OpenWiki is a thin Pi extension around the external OpenWiki CLI from langchain-ai/openwiki.

What it does:
- /openwiki installs OpenWiki if requested, then chooses init or update from the repo state.
- /openwiki <message> runs \`openwiki -p <message>\` as a one-shot prompt.
- /openwiki init/update still work when you want explicit control.
- /openwiki progress shows the repo-local .openwiki progress file.

OpenWiki can edit repository docs such as openwiki/, AGENTS.md, or CLAUDE.md, stores local provider secrets in ~/.openwiki/.env, and this extension stores non-secret run progress in .openwiki. Review output and run repo validation before committing.`;

const ACTIONS = new Set(["status", "explain", "progress", "install", "init", "update", "run", "auto"]);

export function parseOpenWikiArgs(input = "") {
  let tokens;
  try {
    tokens = splitCommandArgs(input);
  } catch (error) {
    return parsedArgs({ error: error.message });
  }

  let dryRun = false;
  let help = false;
  let yes = false;
  let installDir = "";
  let binDir = "";
  let modelId = "";
  const words = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token === "--yes" || token === "-y") {
      yes = true;
      continue;
    }
    if (token === "--dir") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ words, dryRun, help, yes, installDir, binDir, modelId, error: "Missing value for --dir." });
      installDir = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--dir=")) {
      installDir = token.slice("--dir=".length);
      continue;
    }
    if (token === "--bin-dir") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ words, dryRun, help, yes, installDir, binDir, modelId, error: "Missing value for --bin-dir." });
      binDir = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--bin-dir=")) {
      binDir = token.slice("--bin-dir=".length);
      continue;
    }
    if (token === "--model-id" || token === "--modelId") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ words, dryRun, help, yes, installDir, binDir, modelId, error: `Missing value for ${token}.` });
      modelId = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--model-id=")) {
      modelId = token.slice("--model-id=".length);
      continue;
    }
    if (token.startsWith("--modelId=")) {
      modelId = token.slice("--modelId=".length);
      continue;
    }
    if (token.startsWith("--")) return parsedArgs({ words, dryRun, help, yes, installDir, binDir, modelId, error: `Unknown option: ${token}. ${OPENWIKI_USAGE}` });
    words.push(token);
  }

  let parsed = parsedArgs({ words, dryRun, help, yes, installDir, binDir, modelId });
  const misplacedYes = yes && parsed.action !== "install" && parsed.action !== "init" && parsed.action !== "update";
  const misplacedInstallPath = (installDir || binDir) && parsed.action !== "install";
  if (misplacedYes || misplacedInstallPath) parsed = { ...parsed, error: "--yes is only valid for install/init/update; --dir and --bin-dir are only valid for install." };
  if (parsed.action === "run" && !parsed.request) parsed = { ...parsed, action: "auto" };
  return parsed;
}

function parsedArgs({ words = [], dryRun = false, help = false, yes = false, installDir = "", binDir = "", modelId = "", error = null } = {}) {
  const first = words[0]?.toLowerCase() ?? "";
  const action = ACTIONS.has(first) ? first : words.length ? "run" : "auto";
  const requestWords = ACTIONS.has(first) ? words.slice(1) : words;
  return {
    action,
    request: requestWords.join(" ").trim(),
    dryRun,
    help,
    yes,
    installDir,
    binDir,
    modelId,
    error,
  };
}

export function openWikiCliArgs(parsed) {
  const args = [];
  if (["init", "update", "run"].includes(parsed.action)) args.push("-p");
  if (parsed.action === "init") args.push("--init");
  if (parsed.action === "update") args.push("--update");
  if (parsed.modelId) args.push("--model-id", parsed.modelId);
  if (parsed.request) args.push(parsed.request);
  return args;
}

export function openWikiCompletions(prefix = "") {
  return ["status", "explain", "progress", "install --yes", "init --yes", "update --yes", "run ", "--model-id "]
    .filter((value) => value.startsWith(prefix))
    .map((value) => ({ value, label: value }));
}
