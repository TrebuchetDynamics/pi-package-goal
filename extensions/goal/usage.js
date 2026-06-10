export function tokenDeltaFromUsage(usage) {
	if (!usage) return 0;
	if (typeof usage.totalTokens === "number") return Math.max(0, usage.totalTokens);
	const input = Number(usage.input) || 0;
	const output = Number(usage.output) || 0;
	const cacheRead = Number(usage.cacheRead) || 0;
	const cacheWrite = Number(usage.cacheWrite) || 0;
	return Math.max(0, input + output + cacheRead + cacheWrite);
}
