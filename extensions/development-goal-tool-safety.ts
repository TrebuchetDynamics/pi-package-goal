export type ActiveGoalToolSafetyState = {
  active: boolean;
  push: boolean;
};

export type ActiveGoalToolSafetyDecision =
  | { action: "allow" }
  | { action: "block"; kind: string; reason: string };

export function evaluateActiveGoalToolCallSafety(
  state: ActiveGoalToolSafetyState,
  toolName: string,
  input: unknown,
): ActiveGoalToolSafetyDecision {
  if (!state.active) return { action: "allow" };
  if (toolName !== "bash") return { action: "allow" };

  const command = commandFromInput(input);
  if (!command) return { action: "allow" };

  const normalized = normalizeCommand(command);
  const forcePush = forcePushIssue(normalized);
  if (forcePush) return forcePush;

  if (isGitPush(normalized) && !state.push) {
    return {
      action: "block",
      kind: "git_push_not_allowed",
      reason: "Active development goal blocks git push because push delivery is not enabled for this run.",
    };
  }

  const destructive = destructiveCommandIssue(normalized);
  if (destructive) return destructive;

  return { action: "allow" };
}

function commandFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const command = (input as { command?: unknown }).command;
  return typeof command === "string" && command.trim() ? command : undefined;
}

function normalizeCommand(command: string): string {
  return command
    .replace(/\\\s*\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function forcePushIssue(command: string): ActiveGoalToolSafetyDecision | undefined {
  if (!isGitPush(command)) return undefined;
  if (!/(?:^|\s)(?:--force(?:-with-lease)?|-f)(?:\s|$)|\s\+[^\s]+/.test(command)) return undefined;
  return {
    action: "block",
    kind: "force_push_blocked",
    reason: "Active development goal blocks force push; report git_push_fetch_first or ask for explicit human approval outside the goal.",
  };
}

function destructiveCommandIssue(command: string): ActiveGoalToolSafetyDecision | undefined {
  if (isDeployCommand(command)) {
    return {
      action: "block",
      kind: "deploy_blocked",
      reason: "Active development goal blocks deploy/release commands; ask for explicit human approval outside the goal.",
    };
  }
  if (isMigrationCommand(command)) {
    return {
      action: "block",
      kind: "migration_blocked",
      reason: "Active development goal blocks migration/schema commands; ask for explicit human approval outside the goal.",
    };
  }
  if (isDeleteCommand(command)) {
    return {
      action: "block",
      kind: "delete_blocked",
      reason: "Active development goal blocks delete/destructive cleanup commands; ask for explicit human approval outside the goal.",
    };
  }
  return undefined;
}

function isGitPush(command: string): boolean {
  return /(?:^|[;&|()\s])git\s+push(?:\s|$)/.test(command);
}

function isDeployCommand(command: string): boolean {
  return [
    /(?:^|[;&|()\s])(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:deploy|release|publish)(?:\s|$)/,
    /(?:^|[;&|()\s])make\s+(?:deploy|release|publish)(?:\s|$)/,
    /(?:^|[;&|()\s])(?:vercel|netlify|flyctl|railway|firebase|wrangler|serverless|sst)\s+(?:deploy|publish|release)(?:\s|$)/,
    /(?:^|[;&|()\s])(?:kubectl|helm|terraform|pulumi|gcloud|aws)\s+(?:apply|deploy|push|publish|release|up)(?:\s|$)/,
  ].some((pattern) => pattern.test(command));
}

function isMigrationCommand(command: string): boolean {
  return [
    /(?:^|[;&|()\s])(?:npx\s+)?prisma\s+migrate\b/,
    /(?:^|[;&|()\s])(?:npx\s+)?drizzle-kit\s+(?:migrate|push)\b/,
    /(?:^|[;&|()\s])(?:npx\s+)?knex\s+migrate:/,
    /(?:^|[;&|()\s])sequelize\s+db:migrate\b/,
    /(?:^|[;&|()\s])typeorm\s+migration:(?:run|revert)\b/,
    /(?:^|[;&|()\s])rails\s+db:(?:migrate|schema:load|reset)\b/,
    /(?:^|[;&|()\s])alembic\s+(?:upgrade|downgrade)\b/,
    /(?:^|[;&|()\s])supabase\s+db\s+(?:push|reset)\b/,
    /(?:^|[;&|()\s])php\s+artisan\s+migrate\b/,
    /(?:^|[;&|()\s])diesel\s+migration\s+(?:run|redo|revert)\b/,
    /(?:^|[;&|()\s])goose\s+(?:up|down|redo|reset)\b/,
  ].some((pattern) => pattern.test(command));
}

function isDeleteCommand(command: string): boolean {
  return [
    /(?:^|[;&|()\s])rm\s+(?:-[^\s]*\s+)?[^\s]/,
    /(?:^|[;&|()\s])unlink\s+[^\s]/,
    /(?:^|[;&|()\s])find\b[\s\S]*\s-delete(?:\s|$)/,
    /(?:^|[;&|()\s])git\s+(?:clean\b|reset\s+--hard\b)/,
    /\b(?:drop\s+(?:database|table|schema)|truncate\s+table)\b/i,
  ].some((pattern) => pattern.test(command));
}
