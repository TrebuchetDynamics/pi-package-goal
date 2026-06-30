---
name: research-forge
description: Research with rforge provenance. Use for literature search, OSS study, systematic review, evidence extraction, meta-analysis, or review packages.
---

# ResearchForge Research Agent

Use `rforge` for retrieval-first, provenance-first research. It is a standalone CLI, not a project dependency.

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.

## Quick start

```sh
command -v rforge && rforge version || true
rforge automation policy 2>/dev/null || true
```

1. Resolve save path and depth.
2. Write `queries.txt` for multi-query work.
3. Run `rforge search batch ... --stats`; prefer it over shell loops.
4. Run `rforge search stats --dir <topic-dir>` and save the output if not already written.
5. Write `report.md` and `provenance.json` before finishing.

If `rforge` is missing, do not silently install for a plan-only request. For an execution request, ask before network install unless the user already authorized setup. Install options:

```sh
curl -fsSL https://raw.githubusercontent.com/TrebuchetDynamics/research-forge/main/install.sh | bash
# or, with Go available:
go install github.com/TrebuchetDynamics/research-forge/cmd/rforge@latest
```

## Operational basis

Inspect before acting:

- current repo root and existing `artifacts/` or `research/` folder;
- `rforge version` and, for full reviews, `rforge doctor` when available;
- `rforge automation policy` for agent-allowed versus human-required actions;
- existing `provenance.json`, `manifest.json`, `results.jsonl`, reports, screening queues, or review package files in the target folder;
- `references/deep-search.md` for Comprehensive sweeps.

## Save path and depth

| Context | Save to |
|---|---|
| Project repo with `artifacts/` | `artifacts/research/<topic-slug>/` |
| Project repo without `artifacts/` | `research/<topic-slug>/` |
| Known external project | that project's `research/` or `artifacts/research/` |
| No clear project home | `~/research/<topic-slug>/` |

Topic slug: lowercase, hyphen-separated, 3–6 words. Confirm the path when ownership is unclear.

| Request phrasing | Depth |
|---|---|
| "quick look", "any papers on", "what's out there" | Quick: 3 query variants, fast sources |
| "research", "find papers", "survey", "study" | Standard: 5–8 query variants, `scholarly-fast` or relevant preset, citation expansion |
| "full", "systematic", "comprehensive", "mega", "thorough" | Comprehensive: 10+ variants, broad sources, citation expansion, evidence grid, gaps |

Default to Standard.

## Workflow

### 1. Discover

Academic search:

```sh
printf '%s\n' \
  "query variant one" \
  "query variant two" > queries.txt

rforge search batch --out <topic-dir> --queries queries.txt \
  --sources scholarly-fast --limit 20 --continue-on-error --stats
rforge search stats --dir <topic-dir> | tee <topic-dir>/coverage-stats.log
```

Useful presets: `openalex,arxiv`, `scholarly-fast`, `openalex,arxiv,semantic-scholar`, `biomedical`, `preprints`, `open`, `all`.

If batch is unavailable, save one file per source and still run stats:

```sh
rforge search --source openalex --query "QUERY" --limit 20 > <topic-dir>/search-openalex.txt 2>&1 || true
rforge search stats --dir <topic-dir> | tee <topic-dir>/coverage-stats.log
```

OSS study starts with a plan, not cloning or installing:

```sh
rforge oss search-plan --query "<project/functionality>" --ecosystem all > <topic-dir>/oss-search-plan.txt
```

Assess license, maintenance, security posture, release cadence, package metadata, Software Heritage/archive status, and domain fit. Stars/downloads are only weak signals.

### 2. Expand and collect

Pick 3–5 seed papers from retrieved metadata: recent surveys, high-impact venues, high-citation works, method-defining preprints, or bridge papers.

```sh
rforge citations expand --source semantic-scholar --paper <id-or-doi> \
  --direction both --depth 1 --out <topic-dir>/citation-graph.json
rforge citations report --graph <topic-dir>/citation-graph.json --out <topic-dir>/citation-report.md
```

Screen before downloading PDFs:

```sh
rforge screen queue --dir <topic-dir> --out <topic-dir>/queue.csv
# human fills decision and reason columns
rforge screen import --dir <topic-dir> --csv <topic-dir>/queue.csv --reviewer <name>
rforge screen progress --dir <topic-dir>
```

Only after inclusion screening and any required acquisition approval:

```sh
rforge oa fetch --dir <topic-dir>
```

### 3. Analyze

For Comprehensive reviews:

```sh
rforge evidence grid --out <topic-dir>/evidence-grid.json
rforge evidence gaps --out <topic-dir>/evidence-gaps.json
```

For systematic/meta-analysis work, prefer a project and guided state machine:

```sh
rforge project create <project-dir> --title "<title>"
rforge forge init --project <project-dir> --question "<research question>"
rforge forge status --project <project-dir>
rforge forge next --project <project-dir>
```

Prepare but do not self-approve analysis or final claims:

```sh
rforge analysis prepare
rforge report trace --claims <claims.json> --analysis <run.json> --out <trace.json>
rforge report claim-panel --trace <trace.json> --out <claim-panel.json>
```

### 4. Report and provenance

`report.md` sections:

1. Method and limits.
2. Bottom line in 2–3 evidence-grounded sentences.
3. Main themes with exact papers/repos/artifacts.
4. Claim hygiene for headline numbers or performance claims.
5. Evidence gaps, failures, rate limits, unavailable full text.
6. Implications and next steps.

Never assert a performance or scientific result without naming the paper/repo, venue/source, year, and conditions visible in retrieved evidence.

Always write valid `provenance.json`:

```json
{
  "question": "<exact research question>",
  "rforge_version": "<version or not available>",
  "timestamp": "<ISO 8601>",
  "depth": "quick|standard|comprehensive",
  "queries": ["<query 1>"],
  "sources": ["openalex", "arxiv"],
  "search_stats": {"openalex": 0, "arxiv": 0, "total_unique_dois": 0},
  "citation_expand_attempted": ["<paper id or DOI>"],
  "citation_expand_succeeded": ["<paper id or DOI>"],
  "outputs": ["report.md", "provenance.json"],
  "errors": ["<rate limit, API failure, empty output, or missing source notes>"]
}
```

For review packages, require human package/export approval and then verify:

```sh
rforge package create --out <dir> --created-by <name> --question "<text>"
rforge package audit <dir>
rforge package replay <dir>
```

## Skill contract

### Entry protocol

- Trivial lookup: run Quick depth unless the user asks only for a plan.
- Ambiguous scope: propose topic slug, save path, depth, and source preset; ask only for missing ownership or risk decisions.
- High-risk/systematic review: set up project workflow and stop at human gates.

### Topology check

Before live API calls or file writes, confirm save path, source preset, depth, privacy/licensing posture, and whether the request is academic literature, OSS study, or reproducible review package.

### Verification gate

Before done:

- `rforge version` printed or provenance records unavailable.
- Every planned query/source has a saved output, manifest entry, or explicit error.
- Source coverage stats are recorded.
- `report.md` or requested artifact cites exact papers/repos/artifacts.
- `provenance.json` exists, is valid JSON, and names all outputs.
- Human-gated actions were surfaced, not self-approved.
- Review packages pass `rforge package audit` and `rforge package replay` when package export was approved.

### Red lines

Do not self-approve screening decisions, full-text acquisition, privacy/licensing review, extraction acceptance, analysis method selection, final scientific claims, LLM suggestion review commands, package export, copyrighted full text, or live scholarly APIs in tests/CI.

### Output contract

Final reply names the save path, depth, sources queried, output files, validation receipts, unresolved gates, and weakest evidence gap.

## Example

User: `research recent OSS tools for citation graph exploration`

Agent: choose `research/citation-graph-oss-tools/`, run `rforge oss search-plan`, save plan/report/provenance, and stop before cloning or recommending integration without license/security review.

## References

- [Deep-search patterns and query expansion](references/deep-search.md)
