# Council Review Mode

This mode adapts the synthesis pattern from `gcpdev/llm-council-skill` without bundling its script or making external calls by default: gather independent perspectives, compare them, synthesize the useful parts, then present one recommendation with attribution.

## When to use

Use council mode when one of these is true:

- the user asks for a council, outside perspective, ChatGPT/Gemini comparison, or multi-model critique;
- the plan crosses domain language, architecture, and delivery risk at the same time;
- the next branch is high-leverage enough that a single-lens answer is likely to miss a trade-off.

Skip it for small reversible choices, obvious terminology cleanup, or cases where repository evidence already determines the answer.

## Local docs council

These local role lenses run inside the main context, so they lack context isolation. When the host exposes a fork/subagent tool, prefer a clean-context **advisor** delegate instead — see [clean-context delegation](../../../shared/CLEAN-CONTEXT-DELEGATION.md). Use the local lenses below as the labeled fallback, and say which one you used.

When no approved external council is available, run three local perspectives and say that they are local role lenses, not external models:

1. **Language steward** — checks `CONTEXT.md`, `CONTEXT-MAP.md`, ADR language, term boundaries, aliases to avoid, and whether a term belongs in glossary form.
2. **Architecture skeptic** — checks seams, ownership, dependency direction, coupling, module boundaries, and whether the plan contradicts documented decisions.
3. **Delivery realist** — checks validation path, migration/order risk, dirty worktree ownership, blast radius, and whether the next decision unblocks implementation.

Synthesize them into one recommended answer. Do not paste three long mini-reviews unless the user explicitly asks.

## External LLM council

Only consult external models when the user explicitly asks for external model input or approves it after you disclose the cost/network/credential implication. If a project already has an approved council helper, use it according to its local instructions. Otherwise, do not create credential files, read secret files, or install new dependencies as part of this skill.

When external responses are available:

- attribute model/source names honestly;
- treat responses as advisory, not authority;
- verify codebase claims against local files before using them as evidence;
- preserve any API failures in the summary instead of hiding them;
- redact secrets and local paths that are not necessary to the decision.

## Synthesis shape

Use this compact form inside the normal question format:

```text
Council synthesis: language steward says <term conflict>; architecture skeptic says <boundary risk>; delivery realist says <validation/order risk>. Recommendation: <one answer>.
```

For external models:

```text
Council synthesis: ChatGPT contributed <useful idea>; Gemini contributed <useful risk>; local docs check confirmed <file/doc evidence>. Recommendation: <one answer>.
```

## Failure handling

- If external council setup is missing, continue with local docs-council mode and say so.
- If one model/tool fails, use available responses and name the missing source.
- If all external calls fail, fall back to local docs-council mode.
- If council perspectives disagree, ask the smallest owner-decision question that selects between the trade-offs.
