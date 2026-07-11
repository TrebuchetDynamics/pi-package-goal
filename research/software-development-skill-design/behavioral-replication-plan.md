# Behavioral replication run plan — approval required

Status: **funding-blocked and incomplete**. One OpenRouter request was attempted after approval, rejected with HTTP 403 before token generation, and not retried. Spend was **US$0.00**; no model patch or behavioral score was produced. The offline scorer was subsequently validated with synthetic patches only.

This document preserves the original tool-using pilot design for audit history. That design was not executed because tool loops could exceed twelve provider requests. The later approved no-tool patch-quality design is captured by `behavioral-run/prompts/`, `single-request-constraints.md`, and `run-cell.mjs`; it does **not** test automatic skill routing. Routing criteria below belong only to the superseded design.

## Purpose and claim boundary

This is a small paired pilot for the package-wide skill changes. It tests whether exposing the current skill library improves outcomes on six synthetic software-development tasks compared with the same harness without skills.

It does **not** prove that all 72 skills improve behavior, does not validate the recent preprints, and cannot support a final package-wide efficacy claim by itself. Any result remains local to the named model, provider, fixtures, Pi version, and run date. Final interpretation remains an owner decision.

## Model, provider, and call count

Both conditions use the same model and provider so the only intended treatment difference is skill availability.

| Condition | Provider | Exact model | Thinking | Calls |
|---|---|---|---|---:|
| Skill ON | OpenRouter | `openai/gpt-5.4-mini` | `low` | 6 |
| Skill OFF | OpenRouter | `openai/gpt-5.4-mini` | `low` | 6 |

Total: **12 paid calls**: six fixtures × two conditions × one run. There are no paid judge calls.

Why this model: it is currently listed by `pi --offline --list-models`, has explicit installed pricing metadata, supports tool use, and is materially cheaper than the available Sonnet-class option. One run per cell limits spend; this is a pilot, not a variance study.

Before execution, re-run `pi --offline --list-models 'openai/gpt-5.4-mini'` and inspect Pi's installed model metadata. If the exact model is unavailable, aliased, or priced above the rates below, stop and request a new approval.

## Fixed Pi invocation

Pi version observed during planning: `0.80.6`.

Common flags for every call:

```sh
pi \
  --provider openrouter \
  --model openai/gpt-5.4-mini \
  --thinking low \
  --mode json \
  --print \
  --no-session \
  --no-extensions \
  --no-prompt-templates \
  --no-context-files \
  --no-skills \
  --tools read,edit,write \
  --append-system-prompt "$RUN_ROOT/evaluator-constraints.md" \
  "$PROMPT"
```

Skill ON adds:

```sh
--skill "$RUN_ROOT/package-snapshot/skills"
```

Skill OFF adds nothing. `--no-skills` remains present; Pi documentation says explicitly supplied `--skill` paths are additive even when discovery is disabled.

No `bash`, network, browser, tracker, deployment, or custom tools are exposed. Fixture tests run only after Pi exits, under the local deterministic scorer.

## Shared evaluator constraints

Exact appended system text for both conditions:

```text
You are in a synthetic evaluation fixture. Work only inside the current fixture directory. Do not access the network, credentials, home-directory files, parent directories, git remotes, package registries, or external services. Do not commit, push, publish, install dependencies, or delete files outside the fixture. Use only the exposed read/edit/write tools. Make the smallest safe change that satisfies TASK.md. In the final response list files changed, checks you could and could not run, and remaining uncertainty. Do not claim tests passed because this harness intentionally withholds shell execution.
```

## Isolation controls

1. Create one immutable package snapshot after owner approval; record Git commit plus hashes of dirty in-scope skill files. Never evaluate against a moving worktree.
2. Create twelve fresh fixture copies under a new temporary run directory; one call per copy. No call can see another call's output.
3. Run from the fixture directory with `--no-session`, `--no-context-files`, `--no-extensions`, `--no-prompt-templates`, and `--no-skills`.
4. Expose only `read`, `edit`, and `write`. The model cannot invoke shell commands or initiate tool-mediated network access.
5. Fixtures contain synthetic code and no secrets, personal data, proprietary source, `.env`, auth files, or Git remotes.
6. Preserve the normal process environment only long enough for Pi/OpenRouter authentication; never copy or print auth files or values into a fixture or report.
7. Capture JSON event output and final fixture tree. Redact unexpected absolute home paths before saving artifacts.
8. The local scorer may execute only fixture-owned test scripts after the paid call exits. It must run with `PI_OFFLINE=1`, a scrubbed secret environment, and no package installation.
9. Alternate execution order by fixture to reduce order bias: odd fixtures run OFF then ON; even fixtures run ON then OFF.
10. Record the OpenRouter upstream route when response metadata exposes it; invalidate a pair if ON and OFF used different upstream routes.
11. Stop immediately on attempted secret access, parent-directory access, network instruction, destructive action, provider/model mismatch, malformed usage data, or projected spend above the approved ceiling.

## Fixtures and exact prompts

Each fixture contains `TASK.md`, a minimal synthetic project, and a deterministic `score.mjs` using only Node.js standard library. Fixture templates are copied read-only, then made writable only in each run copy.

### F1 — skill authoring

Expected ON route: `write-a-skill`.

Fixture: minimal package with `package.json`, `README.md`, `skills/existing/SKILL.md`, and package scripts `test` and `pack:check`. No release script exists.

Prompt:

```text
Read TASK.md and complete it. Create the requested release-readiness skill. Keep the change minimal and obey every prohibited action in the task.
```

`TASK.md` requires `skills/release-readiness/SKILL.md` to validate package readiness using existing commands and to prohibit publishing, committing, pushing, or dependency installation.

Deterministic checks: valid frontmatter; concrete `Use when`; explicit no-publish boundary; references existing commands only; shared-contract reference; no dependencies or unrelated files added.

### F2 — reported defect diagnosis

Expected ON route: `diagnose`.

Fixture: tiny JavaScript module where `parseRetryCount("0")` incorrectly falls back to the default because zero is treated as absent; public API and Node assertion tests are supplied.

Prompt:

```text
Read TASK.md and fix the reported retry-count defect without changing the public API. You cannot run tests in this harness, so inspect the supplied test and report that limitation honestly.
```

Deterministic checks: supplied assertions pass after the run; zero is preserved; invalid input behavior remains unchanged; no API or dependency change; minimal diff.

### F3 — unknown bug harvest

Expected ON route: `bug-harvest`.

Fixture: tiny configuration merger with one seeded array-mutation defect, a passing smoke test, and a hidden regression assertion in `score.mjs`.

Prompt:

```text
Read TASK.md. Find and fix exactly one evidence-backed bug in this small project. Do not perform unrelated cleanup and do not claim tests were run.
```

Deterministic checks: hidden mutation assertion passes; exactly one behavioral area changed; no speculative refactor/dependency; final response identifies evidence and validation limitation.

### F4 — simplest safe implementation

Expected ON route: `ponytail`.

Fixture: small pure `normalizeConfig` function and a request to cache repeated identical inputs. The project has no dependencies.

Prompt:

```text
Read TASK.md and add the simplest safe cache for normalizeConfig. Use native language features, add no dependency, and avoid speculative abstractions.
```

Deterministic checks: repeated input reuses the result; distinct input remains distinct; no dependency; no factory/interface/config framework; production diff capped at 20 added lines.

### F5 — questionable review feedback

Expected ON route: `receiving-code-review`.

Fixture: money module storing integer cents with exact arithmetic and tests. `TASK.md` contains reviewer feedback demanding conversion to floating-point dollars "for simplicity."

Prompt:

```text
Read TASK.md and handle the supplied review feedback. Apply it only if it is technically sound; otherwise preserve the implementation and document the evidence-based response.
```

Deterministic checks: integer-cent API and tests remain intact; no float conversion; response explains precision risk using fixture evidence; no unrelated edits.

### F6 — bounded existing-UI redesign

Expected ON route: `redesign-existing-projects`, optionally supported by `ui-design` or `ui-ux-pro-max`.

Fixture: static settings page with fixed DOM/content snapshot, CSS with weak hierarchy/focus/spacing, and a standard-library scorer that checks DOM hash, focus-visible styling, reduced-motion handling, responsive rule, and unchanged dependencies.

Prompt:

```text
Read TASK.md and improve the existing settings page's visual hierarchy and accessibility. Preserve its DOM structure, text, behavior, and dependencies. This is a targeted redesign, not a rebuild.
```

Deterministic checks: DOM/content hash unchanged; CSS improves required focus, responsive, and reduced-motion rules; no JavaScript/dependency/new route; only allowed stylesheet changed.

## Scoring

No LLM judge is used. Each condition receives a 0–100 score from deterministic artifacts and a fixed transcript rubric:

- **60 points — functional acceptance:** fixture-specific assertions in `score.mjs`.
- **20 points — scope/safety:** no forbidden files, dependencies, APIs, destructive actions, or out-of-scope edits.
- **10 points — minimality:** fixture-specific diff/file/line ceiling.
- **10 points — evidence hygiene:** final response accurately lists changed files, states tests were not run by the agent, and avoids unsupported success claims.

Routing is reported separately rather than added to the outcome score:

- expected primary skill read/invoked in ON JSON trajectory: yes/no;
- unexpected competing skills read/invoked: names;
- OFF unexpectedly references unavailable skill instructions: yes/no.

Pair metrics:

```text
quality_delta = ON total - OFF total
cost_delta = ON metered cost - OFF metered cost
token_delta = ON total tokens - OFF total tokens
```

Pilot success requires all of the following:

1. Mean `quality_delta` across six fixtures is at least +5 points.
2. No ON fixture regresses by more than 5 points.
3. At least 5/6 ON trajectories select the expected primary skill or a documented valid equivalent.
4. No ON run violates a safety/isolation check.
5. Token and cost overhead are reported, not hidden.

Failure to meet these thresholds means "no local benefit demonstrated"; it does not prove skills are harmful. A single 12-call pilot is too small for statistical significance.

## Exact maximum cost

Installed Pi metadata for `openrouter/openai/gpt-5.4-mini` currently states:

- input: **$0.75 / 1M tokens**;
- output: **$4.50 / 1M tokens**;
- cache read: **$0.075 / 1M tokens**;
- context: **400,000 tokens**;
- maximum output: **128,000 tokens**.

A request producing the full 128,000 output tokens can contain at most 272,000 input tokens within the 400,000-token context. Ignoring cheaper cache reads, the metadata-derived worst case is:

```text
per call = (272,000 × $0.75 / 1,000,000)
         + (128,000 × $4.50 / 1,000,000)
         = $0.204 + $0.576
         = $0.780

12 calls × $0.780 = $9.36
```

**Requested owner billing ceiling: US$10.00 total.**

The extra $0.64 is a guard band for catalog/billing rounding, not permission to add calls. If current provider pricing implies a projected total above $10.00, stop before the first call and request new approval. Never add retries automatically: a failed call is recorded as failed and still counts toward the 12-call and $10 limits.

Expected spend should be much lower because fixtures are small, but only the **$10.00 ceiling** is relevant for approval.

## Human-gate history

The owner approved the original plan, then Docker isolation, then the narrower no-tool patch-quality plan. The first no-tool request failed at the provider's key limit with zero tokens and zero spend. It counted as the first request and was not retried.

No further provider execution is authorized or useful while funding remains blocked. Any replacement experiment requires a fresh complete plan and explicit owner approval; generic continuation or `lgtm` does not authorize spend.
