---
name: research-forge
description: Full provenance-first research on any topic using rforge. Multi-source sweep (openalex, crossref, semantic-scholar, arxiv), citation expansion, source-coverage stats, and smart save-location inference. Use when the user asks to research, study, survey, or systematically review a topic.
---

# ResearchForge Research Agent

Core principle: **retrieval-first, provenance-first, LLM-assisted** — retrieve source material, write provenance, never self-approve gated human decisions.

## Save-location decision (pick before doing anything)

| Context | Save to |
|---|---|
| Inside a project repo with `artifacts/` directory | `artifacts/research/<topic-slug>/` |
| Inside a project repo without `artifacts/` | `<repo-root>/research/<topic-slug>/` |
| Standalone request, topic matches a known project directory | That project's `research/` or `artifacts/research/` |
| No clear project home | `~/research/<topic-slug>/` |

**Topic slug** = lowercase, hyphen-separated, 3–6 words from the research question (e.g. `ferroelectric-compute-in-memory`, `artificial-photosynthesis-catalysts`).

When in doubt: confirm the save path with the user before writing any files.

---

## Depth routing

| Request phrasing | Depth |
|---|---|
| "quick look", "any papers on", "what's out there" | **Quick** — 3 queries × 2 sources |
| "research", "find papers", "survey", "study" | **Standard** — 5–8 queries × 4 sources + citation expansion |
| "full research", "systematic", "comprehensive", "mega", "thorough" | **Comprehensive** — 10+ queries × all sources + citation expansion + evidence grid |

Default to **Standard** when depth is ambiguous.

See [deep-search reference](references/deep-search.md) for query expansion patterns and comprehensive sweep checklist.

---

## Phase 1 — Setup

```sh
command -v rforge && rforge version || true
```

If rforge is missing, install it:

```sh
go install github.com/TrebuchetDynamics/research-forge/cmd/rforge@latest
export PATH="$(go env GOPATH)/bin:$PATH"
rforge version
```

Create the output directory:

```sh
mkdir -p <save-path>
cd <save-path>
```

---

## Phase 2 — Discover (multi-source sweep)

### Query expansion

Before searching, expand the topic into 3–10 query variations covering:
- Canonical term + abbreviations (e.g. "ferroelectric compute in memory", "FeFET CIM")
- Material/mechanism variants (e.g. "HfO2 in-memory", "ferroelectric tunnel junction")
- Application variants (e.g. "ferroelectric neural accelerator", "ferroelectric CAM")
- Broader/narrower scopes

### Per-query sweep

Run all four primary sources for each query. Use `|| true` so failures don't stop the sweep:

```sh
rforge search --source openalex          --query "QUERY" --limit 20 > search-openalex-SLUG.txt          2>&1 || true
rforge search --source crossref          --query "QUERY" --limit 20 > search-crossref-SLUG.txt          2>&1 || true
rforge search --source semantic-scholar  --query "QUERY" --limit 20 > search-semantic-scholar-SLUG.txt  2>&1 || true
rforge search --source arxiv             --query "QUERY" --limit 20 > search-arxiv-SLUG.txt             2>&1 || true
```

arXiv note: rate-limited; may take 30–90 s per query. Always include it; check the file is non-empty after.

For biomedical topics, also include:

```sh
rforge search --source pubmed     --query "QUERY" --limit 20 > search-pubmed-SLUG.txt     2>&1 || true
rforge search --source europepmc  --query "QUERY" --limit 20 > search-europepmc-SLUG.txt  2>&1 || true
```

### Source coverage stats

After the sweep, always run:

```sh
rforge search stats --dir .
```

This reports per-source record counts and total unique DOIs. Include the output in provenance.json under `search_stats`. If any source shows 0 records across all queries, note the likely cause (rate-limit, API down, query mismatch).

---

## Phase 3 — Citation expansion

Pick the 3–5 highest-impact papers from the sweep (Nature, Nature Communications, Science, high-cited IEEE venues first). For each:

```sh
rforge citations expand --source openalex \
  --paper "10.xxxx/xxxxxxx" \
  --direction both --limit 50 \
  --out citation-graph-SLUG.json
```

If a DOI fails (404, timeout), note it in provenance and move on. For semantic-scholar as fallback:

```sh
rforge citations expand --source semantic-scholar \
  --paper "<s2-paper-id>" --direction both --out citation-graph-SLUG.json
```

Optionally build a citation report:

```sh
rforge citations report --graph citation-graph-SLUG.json --out citation-report-SLUG.md
```

---

## Phase 4 — Analyze and report

### Evidence grid (Comprehensive depth only)

```sh
rforge evidence grid --out evidence-grid.json
rforge evidence gaps --out evidence-gaps.md
```

Or write `evidence-grid.csv` manually with columns:
`category, doi, year, venue, title, evidence_level, support_from_abstract_or_metadata`

### Report

Write `report.md` covering:
1. **Method and limits** — what was retrieved, what was not (no copyrighted full text)
2. **Bottom line** — 2–3 sentences: what the evidence shows
3. **Main themes** — one section per major concept/device/method found
4. **Performance claims hygiene** — safe handling rules for headline numbers
5. **Evidence gaps** — what's missing or uncertain
6. **Implications** — for the specific project or question

Cite specific DOIs with title and venue. Never assert "X achieves Y" without naming the exact paper.

---

## Phase 5 — Save and provenance

Write `provenance.json` before finishing:

```json
{
  "question": "<exact research question>",
  "rforge_version": "<from rforge version>",
  "timestamp": "<ISO 8601>",
  "depth": "quick|standard|comprehensive",
  "queries": ["<query 1>", "..."],
  "sources": ["openalex", "crossref", "semantic-scholar", "arxiv"],
  "search_stats": {
    "openalex": <count>,
    "crossref": <count>,
    "semantic-scholar": <count>,
    "arxiv": <count>,
    "total_unique_dois": <count>
  },
  "citation_expand_attempted": ["10.xxx/yyy"],
  "citation_expand_succeeded": ["10.xxx/yyy"],
  "outputs": ["report.md", "evidence-grid.csv", "search-openalex-*.txt", "..."],
  "errors": ["<any errors or rate-limit notes>"]
}
```

---

## Verification gate

Before responding done:
- `rforge version` printed or noted as unavailable
- All search files non-empty or failure noted in provenance
- `rforge search stats --dir .` run and result included in provenance
- `report.md` exists with bottom-line and citations
- `provenance.json` written and names all output files

---

## Human gates — stop and surface, never self-approve

- Full-text acquisition: `rforge oa acquisition-approve` — surface to user, do not run
- Privacy review: `rforge oa privacy-approve` — surface to user, do not run
- LLM suggestions (`*-suggest` queues) — surface queue path, do not self-accept
- Packaging reports with copyrighted material — surface, do not run

---

## Red lines

- Do not finish without `provenance.json`.
- Do not skip the source-coverage stats step (`rforge search stats`).
- Do not assert performance claims without naming the exact paper.
- Do not self-approve any gated human decision.
- Do not download copyrighted full text.
- Do not run live APIs in tests or CI.

## References

- [Deep-search patterns and query expansion](references/deep-search.md)
