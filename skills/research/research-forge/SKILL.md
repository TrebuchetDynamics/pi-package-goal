---
name: research-forge
description: Research academic or OSS topics with rforge provenance. Use for literature search, OSS study, systematic reviews, evidence extraction, or meta-analysis.
---

# ResearchForge Research Agent

Core principle: **retrieval-first, provenance-first, statistics-first, LLM-assisted**. Retrieve source metadata first, preserve exact query/source provenance, use auditable statistics where applicable, and never self-approve human review gates.

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.

## Save-location decision

| Context | Save to |
|---|---|
| Project repo with `artifacts/` | `artifacts/research/<topic-slug>/` |
| Project repo without `artifacts/` | `<repo-root>/research/<topic-slug>/` |
| Standalone request matching a known project | That project's `research/` or `artifacts/research/` |
| No clear project home | `~/research/<topic-slug>/` |

Topic slug = lowercase, hyphen-separated, 3–6 words. When ownership is unclear, confirm the save path before writing.

## Depth routing

| Request phrasing | Depth |
|---|---|
| "quick look", "any papers on", "what's out there" | Quick — 3 query variants × fast sources |
| "research", "find papers", "survey", "study" | Standard — 5–8 query variants × `scholarly-fast`/relevant sources + citation expansion |
| "full research", "systematic", "comprehensive", "mega", "thorough" | Comprehensive — 10+ query variants × `all` or domain preset + citation expansion + evidence grid/gaps |

Default to Standard. See [deep-search reference](references/deep-search.md) for expansion and comprehensive checks.

## Phase 1 — Setup

```sh
command -v rforge && rforge version || true
```

If missing:

```sh
go install github.com/TrebuchetDynamics/research-forge/cmd/rforge@latest
export PATH="$(go env GOPATH)/bin:$PATH"
rforge version
```

Prefer a ResearchForge project for long reviews:

```sh
rforge project create <path> --title "<title>"
rforge project inspect <path>
```

For ordinary research, create the save path and write all outputs there.

## Phase 2 — Discover

### Academic literature

Expand the question into canonical terms, abbreviations, method/material variants, application variants, broader/narrower forms, and recent-year filters when useful.

Prefer `search batch`; it saves raw source files, `results.jsonl`, deduped records, `manifest.json`, stats, and failures so agents do not have to manage fragile shell loops:

```sh
printf '%s\n' \
  "query variant one" \
  "query variant two" > queries.txt

rforge search batch --out . --queries queries.txt \
  --sources scholarly-fast --limit 20 --continue-on-error --stats

rforge search stats --dir .
```

Useful presets: `openalex,arxiv` (fast default), `scholarly-fast`, `openalex,arxiv,semantic-scholar`, `biomedical`, `preprints`, `open`, `all`.

If `search batch` is unavailable or a one-off source check is needed, use single-source searches and still run stats:

```sh
rforge search --source openalex --query "QUERY" --limit 20 > search-openalex-SLUG.txt 2>&1 || true
rforge search --source crossref --query "QUERY" --limit 20 > search-crossref-SLUG.txt 2>&1 || true
rforge search --source semantic-scholar --query "QUERY" --limit 20 > search-semantic-scholar-SLUG.txt 2>&1 || true
rforge search --source arxiv --query "QUERY" --limit 20 > search-arxiv-SLUG.txt 2>&1 || true
rforge search stats --dir .
```

### OSS study

For open-source project discovery, start with an ecosystem search plan instead of cloning or installing anything:

```sh
rforge oss search-plan --query "<project/functionality>" --ecosystem all
rforge --json oss search-plan --query "<project/functionality>" --ecosystem all
```

Evaluate code forges, package registries, Software Heritage, maintenance signals, license, security posture, and domain fit. Do not treat stars/downloads as proof. Record selected repos in a ResearchForge project only after license/scope review.

## Phase 3 — Collect and expand

Pick 3–5 seed papers from the sweep: recent surveys, high-impact venues, high-citation papers, or method-defining preprints. Use dry-run/budget flags when available for large graphs.

```sh
rforge citations expand --source semantic-scholar --paper <id-or-doi> \
  --direction both --depth 1 --out citation-graph-SLUG.json
rforge citations report --graph citation-graph-SLUG.json --out citation-report-SLUG.md
```

Open-access PDFs are optional and should happen **after screening**. Never fetch copyrighted/private material. For standalone metadata screening:

```sh
rforge screen queue --dir <topic-dir> --out queue.csv
# human fills decision/reason columns
rforge screen import --dir <topic-dir> --csv queue.csv --reviewer <name>
rforge screen progress --dir <topic-dir>
```

Only after inclusion screening:

```sh
rforge oa fetch --dir <topic-dir>
```

## Phase 4 — Analyze

For Comprehensive reviews, create evidence artifacts:

```sh
rforge evidence grid --out evidence-grid.json
rforge evidence gaps --out evidence-gaps.json
```

For LLM-generated suggestions such as `entity-suggest`, `citation-suggest`, or `risk-bias-suggest`, stop at the queue and surface it. Do not call `*-review` commands to self-accept.

Report sections:

1. Method and limits — retrieved sources, no copyrighted full text unless approved.
2. Bottom line — 2–3 evidence-grounded sentences.
3. Main themes — one section per concept/method, citing exact papers/repos/artifacts.
4. Performance/claim hygiene — safe handling of headline numbers.
5. Evidence gaps — missing sources, rate limits, unavailable full text, weak metadata.
6. Implications — concrete next steps for the user's project/question.

Never assert a performance/result claim without naming the exact paper/repo, venue/source, year, and conditions available from retrieved evidence.

## Phase 5 — Save and provenance

Always write `provenance.json` before finishing. Include `search-stats.txt`, `coverage-stats.log`, or equivalent stats output when using batch/single-source searches.

```json
{
  "question": "<exact research question>",
  "rforge_version": "<from rforge version or not available>",
  "timestamp": "<ISO 8601>",
  "depth": "quick|standard|comprehensive",
  "queries": ["<query 1>"],
  "sources": ["openalex", "arxiv"],
  "search_stats": {"openalex": 0, "arxiv": 0, "total_unique_dois": 0},
  "citation_expand_attempted": ["<paper id or DOI>"],
  "citation_expand_succeeded": ["<paper id or DOI>"],
  "outputs": ["report.md", "provenance.json"],
  "errors": ["<rate limit, API failure, missing source, or empty output notes>"]
}
```

## Human gates — stop and surface

Do not self-approve:

- full-text acquisition or package export;
- privacy/licensing review;
- inclusion/exclusion screening decisions;
- LLM suggestion acceptance (`*-suggest` queues);
- final scientific claims or analysis method selection.

Show the queue/path and the exact command the human can run, then wait or continue only with non-gated metadata work.

## Verification gate

Before reporting done:

- `rforge version` printed or provenance says unavailable.
- Every planned query/source has a saved output, batch manifest, or explicit error note.
- `rforge search stats --dir .` or batch `--stats` output is recorded.
- `report.md` or requested output exists and cites exact papers/repos/artifacts.
- `provenance.json` exists, is valid JSON, and names all outputs.
- Human-gated actions were surfaced rather than self-approved.

## Red lines

- Do not finish without `provenance.json`.
- Do not skip source-coverage stats.
- Do not download copyrighted full text or package reports before approval gates.
- Do not run live scholarly APIs in automated tests or CI.
- Do not accept LLM-generated suggestions or screening/extraction decisions on the user's behalf.

## References

- [Deep-search patterns and query expansion](references/deep-search.md)
