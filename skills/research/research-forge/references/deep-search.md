# Deep-Search Patterns

Reference for Comprehensive depth research sweeps. Use when the main `SKILL.md` routing says Comprehensive or when the user says thorough, systematic, full research, or mega.

## Query expansion template

Start with the canonical term, then add domain-specific variants:

| Layer | Examples |
|---|---|
| Abbreviations and synonyms | "FeFET" for "ferroelectric field effect transistor"; "APR" for automated program repair |
| Mechanism/method variants | "polarization switching", "retrieval augmented", "knowledge graph", "active learning" |
| Application variants | "neural accelerator", "screening", "repository documentation", "software maintenance" |
| Broader/narrower scopes | "compute-in-memory" vs "ferroelectric CAM"; "documentation debt" vs "outdated code references" |
| Reliability/challenge | "retention", "endurance", "rate limit", "privacy", "bias", "traceability" |
| Year range | add `--from-year YYYY` / `--to-year YYYY` for recent-only scans when supported |

Aim for 8–12 queries for a Comprehensive sweep.

## Preferred search pattern

Prefer `search batch` because it writes raw source outputs, deduped results, manifest/failure files, and stats in one place:

```sh
printf '%s\n' \
  "query variant one" \
  "query variant two" > queries.txt

rforge search batch --out . --queries queries.txt \
  --sources scholarly-fast --limit 20 --continue-on-error --stats
rforge search stats --dir .
```

Source presets:

| Preset | Use |
|---|---|
| `openalex,arxiv` | Fast broad first pass |
| `scholarly-fast` | Standard default across broad scholarly metadata |
| `openalex,arxiv,semantic-scholar` | CS/AI with citation graph depth |
| `biomedical` | PubMed/Europe PMC topics |
| `preprints` | arXiv/bioRxiv/medRxiv/ChemRxiv-heavy topics |
| `open` | Open-access-focused scan |
| `all` | Comprehensive but slow/noisy sweep |

If `search batch` is unavailable, use per-source `rforge search` files and still run `rforge search stats --dir .`.

## Comprehensive sweep checklist

Before writing `report.md`:

- [ ] ≥ 8 query variants prepared.
- [ ] Multi-source sweep run with `search batch --stats` or per-source files.
- [ ] `rforge search stats --dir .` run; counts recorded in provenance.
- [ ] At least 3 sources returned non-zero usable results, or failures/rate limits are explained.
- [ ] Citation expansion attempted on ≥ 3 top-impact seeds.
- [ ] arXiv/preprint files checked for non-empty output or explicit failure notes.
- [ ] `evidence-grid.json`/`evidence-grid.csv` and gaps report written for Comprehensive reviews.
- [ ] `report.md` covers method, bottom line, themes, claim hygiene, gaps, and implications.
- [ ] `provenance.json` lists all output files and errors.

## Source selection

| Source | Flag/preset | Best for |
|---|---|---|
| OpenAlex | `openalex` | Broad literature, OA hints, citations |
| Crossref | `crossref` | DOI metadata, proceedings, grey literature |
| Semantic Scholar | `semantic-scholar` | CS/AI/ML, citation graph seeds |
| arXiv | `arxiv` | Preprints, CS, physics, math |
| PubMed / Europe PMC | `biomedical` | Biomedical and life sciences |
| DOAJ / CORE | `open` or `all` | Open-access journals/repositories |
| NASA ADS | `all` or explicit | Astrophysics/space science |
| OSS search plan | `rforge oss search-plan` | Open-source project discovery before clone/integration |

## Citation expansion seed selection

Pick seeds by evidence value, not just relevance:

1. Recent systematic surveys or benchmark papers.
2. Nature/Science/ACM/IEEE/high-impact venues.
3. High-citation papers visible in metadata.
4. Method-defining papers or preprints.
5. Papers that bridge two clusters in the search results.

Use budget/dry-run options when available for large graphs. If one source rate-limits, record it and try a different citation source.

## Report evidence hygiene

Safe claim framing:

> Paper X (DOI 10.xxx/yyy, Venue, Year) reports [claim visible in retrieved evidence]. This supports [bounded implication]. Generalization requires [missing evidence].

Unsafe: "Technique X works best" — no paper, metric, task, or conditions.

Safe: "`CoDocBench` (DOI 10.1109/msr66628.2025.00077, MSR 2025) is directly relevant to code-documentation alignment; this supports evaluating documentation updates as alignment/drift tasks rather than prose generation alone."

## Human gates reminder

Surface and do not self-approve:

- full-text acquisition;
- privacy/licensing review;
- screening include/exclude decisions;
- extraction or risk-of-bias acceptance;
- LLM suggestion queues;
- final scientific claims and package export.

## Save-path heuristics

```sh
git rev-parse --show-toplevel 2>/dev/null || echo "no git repo"
ls artifacts/ 2>/dev/null && echo "use artifacts/research/<slug>/"
ls research/ 2>/dev/null && echo "use research/<slug>/"
```

If the topic belongs to the current repo, save inside that repo. If it is exploratory and not tied to a project, save to `~/research/<slug>/`.
