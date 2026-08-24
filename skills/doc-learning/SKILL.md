---
name: doc-learning
description: Turn documents, articles, official docs, PDFs, slides, or lesson text into source-backed Obsidian learning notes. Use when the user asks to ingest reading material, create a lesson from a document, or connect a text source to existing knowledge.
---

# Doc Learning

Use this skill for learning and knowledge maintenance, including technical
subjects. It is self-contained and runs in the current session.

## Locate the vault

Read `METONIA_VAULT`. If it is unset, ask for the vault path. Never assume a
machine-specific location.

Expected paths:

- `raw/inbox/`: new captures
- `raw/sources/<course>/`: preserved source material
- `raw/assets/`: PDFs and attachments
- `wiki/courses/<course>/`: lessons
- `wiki/concepts/`: reusable concepts
- `wiki/Index.md`: thin navigation map
- `wiki/Log.md`: meaningful learning activity

## Workflow

1. Inspect the source, its author/date when known, and its reliability.
2. Preserve the original evidence. Move an inbox item only when the user has
   approved the ingest; otherwise copy it or leave it in place.
3. Create or update one lesson using
   `wiki/courses/_templates/Lesson Template.md`.
4. Distill reusable ideas into existing concept pages. Create a concept only
   when it is likely to be useful again; append source-specific evidence
   without overwriting prior material.
5. Add reciprocal `[[wikilinks]]` between the lesson, concepts, and related
   lessons.
6. Update `wiki/Index.md` only when a course route is created, renamed, or
   moved. Append `wiki/Log.md` for meaningful ingestion, not tiny formatting
   changes.
7. Report changed files, the source path or URL, confidence, and a few factual
   spot checks.

Use adaptive depth: a short source may need a five-bullet lesson; a foundational
or dense source may need the full template. Do not expand material merely to
fill sections.

## Source handling

- Keep full source text in `raw/`; keep the wiki distilled and readable.
- For a large PDF, store it in `raw/assets/` and create a small source note that
  points to it.
- Label extracted or uncertain material, for example
  `extraction_status: auto-unverified`.
- Distinguish source claims from your own explanation or examples.
- Do not commit paywalled, confidential, private, or unauthorized material
  without explicit permission.
- Never store secrets, credentials, tokens, or private customer data.
