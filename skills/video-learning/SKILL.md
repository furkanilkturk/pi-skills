---
name: video-learning
description: Turn a video, talk, course lesson, or transcript into source-backed Obsidian lessons, concepts, and recall material. Use when the user asks to ingest a video or transcript into their learning vault.
---

# Video Learning

Use this skill for learning and knowledge maintenance, including technical
videos. It is self-contained and runs in the current session.

## Locate the vault

Read `METONIA_VAULT`. If it is unset, ask for the vault path. Never assume a
machine-specific location.

Expected paths:

- `raw/sources/<course>/`: transcripts and source metadata
- `raw/assets/`: local media or supporting files when permitted
- `wiki/courses/<course>/`: lessons and recall pages
- `wiki/concepts/`: reusable concepts
- `wiki/Index.md`: thin navigation map
- `wiki/Log.md`: meaningful learning activity

## Workflow

1. Capture the title, speaker/author, URL, publication date when known, and a
   transcript. Prefer platform captions; tools such as `yt-dlp` are optional
   user-side helpers, not repository dependencies.
2. Check transcript quality against the audio or video at several points. Mark
   automatic or uncertain transcripts as unverified.
3. Preserve the cleaned transcript under `raw/sources/<course>/`.
4. Create or update one lesson using
   `wiki/courses/_templates/Lesson Template.md`.
5. Add reusable ideas to living concept pages without overwriting earlier
   evidence, then link lesson, concepts, and related lessons with
   `[[wikilinks]]`.
6. Update `wiki/Index.md` only for a new, renamed, or moved course route. Append
   `wiki/Log.md` for meaningful ingestion, not tiny formatting changes.
7. Report changed files, source URL, transcript confidence, and the timestamps
   or passages used for spot checks.

Use adaptive depth. A short or low-value video may need five bullets; a core
lesson may use the full template. Do not overproduce.

## Examples and visuals

- Use a small Mermaid diagram when a flow, sequence, or layered system is hard
  to understand in prose.
- If code is visible, reconstruct only the useful fragment and label it
  `reconstructed from screen — not verbatim transcript`.
- If the source teaches a code-facing idea without showing code, a tiny
  illustrative snippet is allowed. Label it `illustrative — not from source`.
- Never present invented examples as source material.

## Learning loop

Encourage the learner to read the mental model, attempt recall before rereading,
complete one small exercise, record confusion as an open question, and revisit
the raw transcript only where needed.

## Boundaries

- Keep full transcripts in `raw/`; keep wiki pages distilled.
- Do not commit private, paywalled, confidential, or unauthorized media or
  transcripts without explicit permission.
- Never store secrets, credentials, tokens, or private customer data.
