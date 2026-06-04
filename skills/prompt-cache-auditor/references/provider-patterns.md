# Provider patterns and verification

Adapted for this package from `OnlyTerp/prompt-cache-skills` at snapshot `dde837e`. Preserve attribution in `THIRD_PARTY_NOTICES.md` when copying or further adapting these patterns.

## Atomic fix shape

Prompt-cache work should stay atomic:

- **Target**: harness, provider, endpoint, file, and audited commit/version.
- **Symptom**: missing field, volatile prefix, bad key, provider-shape mismatch, or unverifiable cache claim.
- **Fix**: one focused request-building or configuration change.
- **Verify**: second identical turn shows provider cache-read counters greater than zero.

## Provider cheat sheet

### Anthropic

- Request marker: `cache_control: {"type":"ephemeral"}` on content blocks.
- Warm-turn counters: `usage.cache_read_input_tokens > 0`; cold write counter is `usage.cache_creation_input_tokens`.
- Put markers on stable prefixes: system prompt, tools, long static context, prior assistant/tool-result turn.
- Do not spend a breakpoint on the current user turn unless the goal is same-turn retry reuse.
- Keep at most 4 breakpoints across system, tools, and messages.
- For 1h TTL, send both `anthropic-beta: extended-cache-ttl-2025-04-11` and `ttl: "1h"`.
- For streaming, inspect the final SSE usage event, not the initial placeholder event.

### OpenAI

- Prefix caching is automatic, but only byte-identical prefixes on compatible models count.
- Responses API routing hint: stable `prompt_cache_key` such as a task/thread id or stable prompt hash.
- Bad pattern: random UUID or per-request key; it can route every call to a cold cache.
- Usage counters: `usage.input_tokens_details.cached_tokens` on Responses or `usage.prompt_tokens_details.cached_tokens` on Chat Completions.
- Legacy Chat Completions has no `prompt_cache_key` knob; focus on stable system/tools/prefix bytes.
- Watch for volatile timestamps, request IDs, randomized tool order, and per-turn metadata in the prefix.

### Gemini

- Implicit caching can work automatically on supported Gemini models.
- Explicit caching uses `cachedContents.create()` and then passes the returned cached-content name on later calls.
- Usage counter: `usageMetadata.cachedContentTokenCount > 0`.
- Gate explicit caches on model support, minimum prompt size, TTL, content ownership, invalidation, and cleanup.
- Below provider minimum sizes, explicit cache setup can succeed while no useful cache hit occurs; verify counters.

### Bedrock Anthropic models

- Request marker is Bedrock `cachePoint`, not direct Anthropic `cache_control`.
- Usage fields are camelCase, such as `cacheReadInputTokenCount` and `cacheWriteInputTokenCount`.
- Verify the current AWS/model support matrix; support changes by model and region.
- Re-check custom model ARNs, document blocks/attachments, and adapter transforms because they are common cache-drop paths.

## Verification protocol

1. Prefer a sanitized fixture or unit test for request shape before any paid call.
2. If live verification is required, get explicit approval for provider, model, expected cost, capture method, and redaction plan.
3. Run two identical turns in the same session/task after a cold start.
4. Inspect the second-turn response usage object:
   - Anthropic: `cache_read_input_tokens > 0`
   - OpenAI: `cached_tokens > 0`
   - Gemini: `cachedContentTokenCount > 0`
   - Bedrock: `cacheReadInputTokenCount > 0`
5. Compute a rough warm-turn hit rate as cached tokens divided by total prompt/input tokens when totals are available.
6. If counters are zero, do not claim success. Re-check prefix stability, provider route, model support, streaming usage extraction, and proxy/shim behavior.

## Anti-evidence

These do not prove prompt caching works:

- Harness logs that say caching is enabled.
- A request body containing a cache marker with no warm-turn usage counter.
- Maintainer comments, docs, or issue comments.
- Reduced latency without usage counters.
- First-turn cache writes only; they can mean you are paying a write premium every turn.

## Script helper

Use the local helper to summarize cache counters from a JSON response or usage object:

```bash
node skills/prompt-cache-auditor/scripts/summarize-cache-usage.mjs response.json
node skills/prompt-cache-auditor/scripts/summarize-cache-usage.mjs --require-read response.json
```

The helper reads stdin when no file is passed. `--require-read` exits non-zero if no cache-read counter is found, which is useful for focused verification scripts.
