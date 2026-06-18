# Deep-Search Patterns

Reference for Comprehensive depth research sweeps. Use when the main SKILL.md routing says "Comprehensive" or when the user says "thorough", "systematic", "full research", or "mega".

## Query expansion template

Start with the canonical term, then add:

| Layer | Examples |
|---|---|
| Abbreviations | "FeFET" for "ferroelectric field effect transistor" |
| Material variants | "HfO2", "HZO", "PZT", "AlScN" |
| Mechanism variants | "polarization switching", "tunneling", "memristor" |
| Application variants | "neural accelerator", "CAM", "TCAM", "reservoir computing", "hyperdimensional" |
| Architecture variants | "crossbar", "in-memory", "compute-in-memory", "processing-in-memory" |
| Reliability/challenge | "retention", "endurance", "variation", "imprint" |
| Year range (recent) | add `--from-year 2020` to openalex/crossref |

Aim for 8–12 queries for a Comprehensive sweep.

## Comprehensive sweep checklist

Before writing report.md:

- [ ] ≥ 8 queries run across openalex, crossref, semantic-scholar, arxiv
- [ ] `rforge search stats --dir .` run; counts recorded in provenance
- [ ] At least 3 sources returned non-zero results
- [ ] Citation expansion attempted on ≥ 3 top-impact DOIs
- [ ] arXiv files checked for non-empty (may time out on first attempt; retry once)
- [ ] evidence-grid.csv written with ≥ 10 rows
- [ ] report.md covers all sections (method, bottom line, themes, gaps, implications)
- [ ] provenance.json lists all output files

## All available sources

| Source | Flag | Best for |
|---|---|---|
| OpenAlex | `--source openalex` | Broad literature, open access, citation counts |
| Crossref | `--source crossref` | DOI metadata, preprints, grey literature |
| Semantic Scholar | `--source semantic-scholar` | CS/AI/ML, citation graph seeds |
| arXiv | `--source arxiv` | Preprints, cs.ET, cond-mat |
| PubMed | `--source pubmed` | Biomedical topics |
| Europe PMC | `--source europepmc` | Life sciences, open access EU |
| DOAJ | `--source doaj` | Open access journals |
| CORE | `--source core` | Open access repository papers |
| NASA ADS | `--source nasa-ads` | Astrophysics, space science |

For hardware/materials/EE topics: openalex + crossref + semantic-scholar + arxiv cover ≥ 95% of relevant literature.

## Citation expansion: seed selection

Pick seeds by impact, not just relevance:
1. Papers in Nature, Nature Electronics, Nature Communications, Science Advances
2. Papers with high citation count visible in OpenAlex metadata
3. Papers introducing the key technology/method (foundational, often 2018–2021 for FeCIM)
4. Most-recent survey/review papers (usually list all major prior work as references)

## arXiv category filters

For hardware / materials / EE, add `--category` flag:

```sh
rforge search --source arxiv --query "ferroelectric compute in memory" \
  --category cs.ET --limit 20 > search-arxiv-cs-et.txt 2>&1 || true
rforge search --source arxiv --query "ferroelectric compute in memory" \
  --category cond-mat.mtrl-sci --limit 20 > search-arxiv-cond-mat.txt 2>&1 || true
```

## Report evidence hygiene

Safe claim framing (use this whenever citing abstracts):

> Paper X (DOI 10.xxx/yyy, Venue, Year) reports [claim from abstract]. This is [what the paper demonstrates] under [what conditions/precision/scale]. Generalization to other settings requires [what evidence is missing].

Unsafe: "FeCIM achieves 13,714 TOPS/W" — no source, no conditions.
Safe: "One IEDM 2020 FeFET analog-CIM paper (DOI 10.1109/...) reports 13,714 TOPS/W for a specific macro configuration; conditions include [array size, precision, peripheral model] from the abstract."

## Save-path heuristics

```sh
# Find the likely project root
git rev-parse --show-toplevel 2>/dev/null || echo "no git repo"

# Check for artifacts/ directory
ls artifacts/ 2>/dev/null && echo "use artifacts/research/<slug>/"

# Check for research/ directory  
ls research/ 2>/dev/null && echo "use research/<slug>/"
```

If in a project that clearly owns the research topic (topic matches project name or README), save inside that project. If the research is exploratory and not yet tied to a project, save to `~/research/<slug>/`.
