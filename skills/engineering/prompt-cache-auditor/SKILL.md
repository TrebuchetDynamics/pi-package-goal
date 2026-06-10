---
name: prompt-cache-auditor
description: Audit LLM prompt caching in agent harnesses. Use for cache_control, prompt_cache_key, cached tokens, hit rates, LLM API costs, Anthropic/OpenAI/Gemini/Bedrock cache fixes.
---

# Prompt Cache Auditor

Audit or improve prompt caching in code that constructs LLM API requests. Optimize only after proving which harness, provider, endpoint, and cache boundary are in play.

## Quick start

1. Inspect `git status --short --branch`, repo instructions, manifests, and the request-building code before editing. If `graphify-out/graph.json` exists and the harness spans multiple modules, query Graphify for request-builder/provider paths, then verify named files.
2. Identify the harness/provider/API endpoint, target files, current cache fields, and available tests or capture path.
3. Read [provider patterns](references/provider-patterns.md) when provider mechanics, verification counters, or wire-capture details matter.

## Skill composition

- Use `diagnose` when observed cache counters, streaming usage, or proxy behavior contradict the expected request shape.
- Use `tdd` for request-building helpers: stable cache keys, cache marker placement, provider gates, and defaults.
- Use `prototype` before broad provider rewrites, especially for Gemini explicit caches or Bedrock adapters.
- Use `autoreview` before shipping harness-wide cost changes; success signal is no accepted findings plus cache verification evidence.

## Workflow

1. **Applicability gate**: name the harness, provider, endpoint, model family, target files, and whether the issue is missing caching, volatile cache invalidation, bad cache key routing, provider-shape mismatch, or unverified claims.
2. **Topology check**: map stable prefix pieces (system, tools, static context, prior assistant/tool turns), volatile pieces (current user turn, timestamps, request IDs), cache markers/keys, TTL, streaming usage handling, and credential/proxy path.
3. **Patch one defect at a time**:
   - Anthropic: put `cache_control` on stable boundaries, not the current user turn; respect the 4-breakpoint limit and 1h TTL header requirements.
   - OpenAI: preserve a byte-stable prefix and use a stable `prompt_cache_key` on Responses; never use a random per-request UUID.
   - Gemini: distinguish implicit hits from explicit `cachedContents`; gate explicit caching by model, size, TTL, and lifecycle ownership.
   - Bedrock: use `cachePoint`/camelCase usage fields and verify model support, custom ARNs, and document-block behavior.
   - Defaults: enable caching by default only behind provider/model gates and opt-out controls.
4. **Verify**: run focused tests, then use an owner-approved cold+warm call or fixture to inspect second-turn cache-read counters. The [summary script](scripts/summarize-cache-usage.mjs) can extract cache fields from a JSON response.
5. **Report**: include the target, defect class, files changed, validation commands, cache counters/hit rate, and remaining unverified provider paths.

## Contract

### Entry protocol

- Trivial: inspect and report cache topology; no live API calls needed.
- Medium ambiguity: propose the likely provider path and ask the one missing hard question, usually which model/provider route or credentials can be used for verification.
- High ambiguity/risk: stop if changing defaults, routing, credentials, proxy settings, or provider billing behavior would affect users beyond the requested scope.

### Verification gate

Done requires request-shape evidence plus tests or a captured warm-turn usage counter. Claims like “cache_control exists” or “latency improved” are not enough without provider cache-read fields.

### Red lines

- Do not run live paid API calls, mitm/proxy capture, or credential-bearing debug logs without explicit approval.
- Do not log secrets, prompts containing sensitive data, or full request bodies in final reports.
- Do not copy a one-harness diff into another harness without re-reading the real request builder.
- Do not claim savings or hit rates without counters from `usage`/`usageMetadata` or a clearly labeled fixture.

### Output contract

```text
Prompt cache audit:
- target:
- defect class:
- change:
- verification:
- cache evidence:
- remaining risks:
```

## References

- [Provider patterns and verification](references/provider-patterns.md)

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
