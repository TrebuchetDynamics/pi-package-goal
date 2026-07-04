# LLM wiki pattern notes

Source note: distilled from the user-provided Data Science Dojo article excerpt, “The LLM Wiki Pattern by Andrej Karpathy: A Step-by-Step Tutorial to Building a Compounding Knowledge Base” (published 2026-04-16). No article prose or screenshots are bundled here.

## Minimal folder contract

```text
my-wiki/
├── raw/   # source drops: PDFs, clipped articles, transcripts, notes
└── wiki/  # compiled Markdown entity pages
```

For project repos, prefer existing docs conventions first. Use `docs/wiki/` instead of a new root `wiki/` when the repo already keeps docs under `docs/`.

## Compilation pass

When new sources arrive:

1. Inventory new `raw/` files and existing wiki pages.
2. Read related existing pages before writing.
3. Update existing entity pages with new facts and citations.
4. Create new pages only for truly new concepts.
5. Add `[[wiki-links]]` or Markdown links to related pages.
6. Flag contradictions with source evidence; do not smooth them away.
7. Update `index.md`; append `log.md` when ingestion history matters.

## Page shape

```md
# Concept Name

## What this is
One-sentence definition.

## Start here
The practical entry point for a reader or future agent.

## Key facts
- Claim with citation.
- Claim with citation.

## Links
- [[Related concept]] — why it matters

## Contradictions / open questions
- Source A says X; source B says Y.

## Update triggers
- Revisit when <source/code/config> changes.
```

## Lint pass

Run after about 20 new pages, any source that revises a core topic, or a contradiction-heavy ingest.

Check:

- orphan pages with no in/out links;
- duplicate pages for the same concept;
- pages covering multiple concepts that should split;
- dead wiki/Markdown links;
- uncited factual claims;
- contradiction notes without source evidence;
- stale index/log entries.

## Boundaries

- LLM wiki is better for compounding topic expertise; RAG or raw search is better for frequently changing data or exact per-claim source retrieval.
- Keep raw sources immutable unless explicitly asked to organize/add them.
- Do not copy long source passages into entity pages; summarize and cite.
