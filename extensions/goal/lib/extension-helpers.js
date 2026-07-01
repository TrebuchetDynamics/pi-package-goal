const MAX_OBJECTIVE_LENGTH = 4_000;

const CONTRADICTORY_COMPLETION_PATTERNS = [
	/(?<!could\s)\bnot\s+(?:yet\s+)?(?:complete|completed|done|finished)\b/i,
	/\bstill\s+(?:incomplete|failing|failing\s+tests?|fails?)\b/i,
	/\btests?\s+(?:still\s+)?fail(?:ing)?\b/i,
];

const NON_RETRYABLE_GOAL_ERROR_RE = /usage[_\s-]*limit|credentials tried|unauthori[sz]ed|invalid api key/i;
const RETRYABLE_GOAL_ERROR_RE = /websocket closed|headers timed out|context[_\s-]*length[_\s-]*exceeded|input exceeds the context window|provider returned error/i;

export function parseTokenBudget(input) {
	const match = input.match(/(?:^|\s)--tokens(?:=|\s+)(\S+)(?=\s|$)/);
	if (!match) return { objective: input.trim(), tokenBudget: null };

	const raw = match[1];
	const budgetMatch = /^(\d+(?:\.\d+)?)([kKmM])?$/.exec(raw);
	if (!budgetMatch) return { objective: input.trim(), tokenBudget: null, error: `Invalid token budget: ${raw}` };

	const value = Number(budgetMatch[1]);
	if (!Number.isFinite(value) || value <= 0) {
		return { objective: input.trim(), tokenBudget: null, error: "Token budget must be positive." };
	}
	const suffix = (budgetMatch[2] ?? "").toLowerCase();
	const multiplier = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
	const tokenBudget = Math.round(value * multiplier);
	const objective = (input.slice(0, match.index) + " " + input.slice((match.index ?? 0) + match[0].length)).trim();
	return { objective, tokenBudget };
}

export function validateObjective(objective) {
	const trimmed = objective.trim();
	if (!trimmed) return "Usage: /goal [--tokens 50k] <objective>";
	if (trimmed.length > MAX_OBJECTIVE_LENGTH) {
		return `Goal objective is too long (${trimmed.length}/${MAX_OBJECTIVE_LENGTH} characters). Put long instructions in a file and reference it from /goal instead.`;
	}
	return null;
}

export function completionRejection(summary) {
	const trimmed = (summary ?? "").trim();
	if (!trimmed) return "summary is empty";
	if (CONTRADICTORY_COMPLETION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
		return "summary says the goal is not complete";
	}
	return null;
}

export function buildGoalSystemPrompt(state) {
	const budgetLine = state.tokenBudget == null ? "" : `\n- Respect the token budget (${state.tokensUsed}/${state.tokenBudget} used).`;
	return `Active /goal:\n<untrusted_objective>\n${escapeXmlText(state.objective)}\n</untrusted_objective>\n\nGoal-mode rules:\n- Keep working until this objective is complete end-to-end.\n- Do not redefine the objective into a smaller task or stop at a plan, TODO list, partial progress, or suggested next steps.\n- Treat current files, command output, tests, and external state as authoritative.\n- Before completion, audit every explicit requirement against concrete evidence.\n- Prefer goal_complete with a verification summary when the goal is fully complete; update_goal status=complete remains a compatibility path.${budgetLine}`;
}

export function findFinalAssistantMessage(messages = []) {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (!message || typeof message !== "object" || message.role !== "assistant") continue;
		return message;
	}
	return null;
}

export function isRetryableGoalInterruption(message) {
	if (!message || message.stopReason !== "error" || !message.errorMessage) return false;
	if (NON_RETRYABLE_GOAL_ERROR_RE.test(message.errorMessage)) return false;
	return RETRYABLE_GOAL_ERROR_RE.test(message.errorMessage);
}

function escapeXmlText(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
