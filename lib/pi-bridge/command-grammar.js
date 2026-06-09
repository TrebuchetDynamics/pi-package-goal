export function splitFirstArg(args = "") {
  const trimmed = String(args ?? "").trim();
  if (!trimmed) return { first: "", rest: "" };
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return { first: match?.[1] ?? "", rest: match?.[2]?.trim() ?? "" };
}

export function splitCommandArgs(args = "") {
  const input = String(args ?? "").trim();
  const tokens = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaped) current += "\\";
  if (quote) throw new Error(`Unclosed quote in command: ${input}`);
  if (current) tokens.push(current);
  return tokens;
}

export function parseActionCommand(args = "", actions = [], { defaultAction = "help" } = {}) {
  const { first, rest } = splitFirstArg(args);
  const action = first.toLowerCase();
  const allowed = actions instanceof Set ? actions : new Set(actions);
  if (allowed.has(action)) return { action, args: rest };
  return { action: defaultAction, args: String(args ?? "").trim() };
}

export function popTrailingToken(tokens, predicate) {
  const copy = [...tokens];
  if (copy.length && predicate(copy.at(-1))) return { tokens: copy.slice(0, -1), token: copy.at(-1) };
  return { tokens: copy, token: undefined };
}
