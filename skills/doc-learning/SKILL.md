---
name: doc-learning
description: Ingest documents, articles, official docs, PDFs, or lessons into the Metonia vault as teach-from-zero lessons. Use when the user says /doc-learning, ingest this doc/PDF/article/lesson, add reading material, or wants a document turned into vault memory.
---

# Doc Learning

Vault path: discover the Metonia vault by reading the `METONIA_VAULT`
environment variable, or by asking the user for the path. There is no
machine-specific fallback.

## Goal

Turn any text source (docs, articles, PDFs, lecture notes, slides) into learnable
wiki memory — the same pipeline as the vault's video-learning skill, but for text.

## Workflow Class and Ownership

This is an Obsidian/vault learning workflow, not a coding workflow. Do not
create a work-project plan or invoke the coding planner → executor → reviewer
chain merely because the source contains code.

Use one vault writer. A short, clean source can use Luna/medium for the complete
ingest. Prefer Terra/medium for a dense, long, multi-source, or highly technical
lesson. Use Luna/low only for bounded metadata or source lookup. Independent
review is optional unless the user requests publication-grade accuracy; source
links, confidence labels, and spot checks are the default evidence.

The `pi-skills` repository is the canonical Pi-specific source and
`~/.pi/agent/skills` is its installed mirror. Metonia may also ship a
provider-neutral distribution copy for other agents. When Pi discovers both,
use this user-global Pi version and do not edit the distribution copy during an
ingest.

## Vault Paths

- New captures: `raw/inbox/` (moved to `raw/sources/<course>/` on ingest)
- Raw source: `raw/sources/<course>/NN-slug.md` or `.txt`
- Course note: `wiki/courses/<course>/` (from `wiki/courses/_templates/Lesson Template.md`)
- Durable concepts: `wiki/concepts/` (living pages, append per project/source)
- Navigation: update `wiki/Index.md` for a new, renamed, or moved course route,
  not an ordinary lesson update
- Activity: append `wiki/Log.md` for meaningful ingest; skip no-op/tiny typo,
  formatting, or link-only maintenance

Course naming example: `system-design`, `databases`. One folder per course;
`NN-` prefix orders the reading sequence.

## Per-Document Workflow

1. Capture the source:
   - Copy/paste text → save as `raw/sources/<course>/NN-slug.md` with a short
     frontmatter block (title, author, url/date, reliability).
   - PDFs → move into `raw/assets/` if large, keep an `.md` stub with a path +
     summary pointer in `raw/sources/<course>/`.
   - Never rewrite the original text; it is evidence.
2. Create one course note per document in `wiki/courses/<course>/` from
   `wiki/courses/_templates/Lesson Template.md` (adaptive depth: short sources
   get a 5-bullet summary, core sources get the full lesson).
3. Add or update living concept pages in `wiki/concepts/`:
   - missing → create (what it is + minimal example);
   - exists → append a `### <Source/Course> — how/what it says` subsection,
     never overwrite other sections.
4. Backlink course note ↔ concepts ↔ related lessons.
5. If this creates, renames, or moves a course route, update `wiki/Index.md`;
   ordinary lesson updates must not churn it. Append to `wiki/Log.md` for
   meaningful ingest; skip no-op/tiny typo, formatting, or link-only
   maintenance.

## Lesson Structure

Use the shared template at `wiki/courses/_templates/Lesson Template.md` (single
source of truth, also used by `/video-learning`). Adaptive depth: short
sources get a 5-bullet summary; core sources get the full 10-section lesson.

## Boundaries

- Do not paste entire documents into wiki pages — distill; raw keeps the full
  text.
- Do not store paywalled or distributed PDFs in git if the user marks them
  private; ask when unsure.
- Mark auto-extracted/unverified content clearly (e.g. `transcript_type: auto`).
- Never store secrets, tokens, passwords, or private customer/source data; ask
  before ingesting confidential or unauthorized material into git.
