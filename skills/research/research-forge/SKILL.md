---
name: research-forge
description: Run or install ResearchForge/rforge for provenance-first literature search, OSS research, systematic reviews, evidence extraction, meta-analysis, and auditable reports.
---

# ResearchForge

Use this skill when research should be captured as files with source provenance instead of answered from memory. ResearchForge is the `rforge` CLI from <https://github.com/TrebuchetDynamics/research-forge>.

Core rule: **retrieval-first, provenance-first, LLM-assisted**. Retrieve/cite source material, write provenance, and never self-approve gated human decisions.

Follow the shared repo/ownership/verification defaults in [COMMON-CONTRACT.md](../../shared/COMMON-CONTRACT.md).

## Quick start

1. Check/install `rforge`.
2. Create or inspect a project folder.
3. Run the smallest retrieval/analyze step that answers the question.
4. Save outputs plus `provenance.json` before final response.

```sh
command -v rforge && rforge version || true
rforge doctor || true
```

## Install rforge from GitHub

Prereqs: Git and Go matching the upstream `go.mod` version (ResearchForge is pre-alpha; inspect upstream before installing).

Preferred install from GitHub:

```sh
go install github.com/TrebuchetDynamics/research-forge/cmd/rforge@latest
export PATH="$(go env GOPATH)/bin:$PATH"
rforge version
rforge doctor
```

If `go install ...@latest` fails or you need a pinned checkout:

```sh
git clone https://github.com/TrebuchetDynamics/research-forge.git
cd research-forge
git checkout <commit-or-tag>   # optional, prefer pinned commits for reproducible work
go run ./cmd/rforge version
go install ./cmd/rforge
rforge version
```

Do not add ResearchForge as a dependency of the current repo just to use the CLI.

## Project setup

Preferred project folder:

```sh
rforge project create <path> --title "<title>"
rforge project inspect <path>
```

Then pass `--project <path>` to project-aware commands. For guided workflow state:

```sh
rforge forge init --project <path> --question "<research question>"
rforge forge status --project <path>
rforge forge next --project <path>
```

Arbitrary folder fallback: write outputs directly and include:

```text
<folder>/report.md
<folder>/provenance.json
<folder>/search-results-<timestamp>.json
<folder>/papers.json          # when applicable
```

## Common workflows

### Literature discovery

```sh
rforge search --source openalex|arxiv|crossref|semantic-scholar|europepmc|pubmed \
  --query "<query>" [--from-year YYYY] [--to-year YYYY] [--open-access true|false]
rforge search import --source openalex --query "<query>" --pages N [--project <path>]
rforge citations expand --source semantic-scholar|openalex|crossref --paper <id> \
  --direction references|citations|both --depth N --out <graph.json>
rforge citations report --graph <graph.json> --out <report.md>
```

For query planning, draft and show the plan before running broad searches:

```sh
rforge protocol compile --type pico|peco|spider|freeform --question "<text>"
rforge protocol plan-sources --type pico --question "<text>"
rforge protocol capabilities
```

### OSS research

```sh
rforge oss add <owner/repo>
rforge oss scan --topic "<topic>"
rforge oss report --area <area>
rforge oss inventory-check <manifest.json>
```

### Collect, screen, parse, extract

```sh
rforge import bibtex|ris|csl-json|zotero-rdf|json|csv <file>
rforge library list
rforge duplicate report
rforge screen configure
rforge screen queue --out <queue.csv>
rforge screen progress
rforge prisma counts
rforge parse --paper <id> --parser grobid|tex|s2orc|papermage --pdf <file>
rforge parse quality --parsed <parsed.json> --out <report.json>
rforge extraction schema add
rforge extract add|suggest
rforge evidence grid --out <grid.json>
rforge evidence gaps --out <report.json>
```

### Analyze and report

```sh
rforge analysis prepare [--effect smd|log-odds-ratio|risk-ratio|mean-difference]
rforge analysis run
rforge analysis sensitivity
rforge analysis publication-bias --method egger|begg
rforge report build --out <report.md>
rforge report trace --claims <queue.json> --analysis <run.json> --out <trace.json>
rforge report audit
```

## Human gates

Stop and ask the human before:

- approving full-text acquisition or privacy review;
- accepting LLM-generated suggestions (`*-suggest` queues);
- packaging/distributing reports that may include copyrighted or private material.

Use wording like:

```text
Human approval required before proceeding:
  rforge --project <path> oa acquisition-approve <id> --reviewer <name> --reason "<text>"
Waiting; I will not download/package until approval is confirmed.
```

## Provenance requirement

Every run must write or append `provenance.json`:

```json
{
  "question": "<research question or task>",
  "sources": ["openalex", "arxiv"],
  "queries": ["<exact query>"],
  "timestamp": "<ISO 8601>",
  "rforge_version": "<rforge version, or not available>",
  "outputs": ["<relative paths>"]
}
```

If `rforge` is unavailable, save raw API/manual outputs and create `provenance.json` yourself.

## Verification gate

Before final response:

- `rforge version` or note `rforge: not available`.
- List files written.
- Confirm `provenance.json` exists and names all outputs.
- Surface any unresolved human gate instead of claiming completion.

## Red lines

- Do not self-approve acquisition, privacy, package, or LLM-suggestion gates.
- Do not run live scholarly APIs in tests/CI.
- Do not finish without provenance.
- Do not store copyrighted full text unless an acquisition-approved record exists.
