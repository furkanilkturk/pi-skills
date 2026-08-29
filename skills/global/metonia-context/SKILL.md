---
name: metonia-context
description: Navigate the Metonia Obsidian agent-space model, inspect which scoped Pi skills are active, resolve an external Git repository to company/project context, and decide where durable knowledge belongs.
---

# Metonia Context

Metonia uses the Pi working directory, not the currently opened Obsidian file,
to choose context. Run `/metonia` to inspect the current space and active skill
commands.

Route work by ownership:

- `Learning/` preserves source-backed concepts and recall;
- `Work/Companies/<Company>/Projects/<Project>/` owns company and project
  operating context plus intentional durable plans;
- `Studio/Video/` owns video research, concepts, and review;
- an external coding repository stays lean and may call `metonia_context` to
  load exactly one matched `Company.md` and `Project.md`.

Use the smallest context profile that can answer the task:

- `coding` is the default and loads only each note's `## Context capsule`;
- `planning` also loads `## Decisions and improvement queue` and
  `## Context index` so unresolved decisions become planning inputs;
- `full` loads both complete canonical notes only when the user or task needs a
  whole-note review.

An indexed engineering note is never loaded automatically. With the `planning`
or `full` profile, pass only the exact `contextNotes` target whose `load when`
condition matches the current task. Prefix it with `project:` or `company:` to
make ownership explicit. The resolver accepts at most three listed,
owner-contained, byte-bounded notes and rejects invented or unindexed paths.
On the second targeted call set `notesOnly: true` so the already-seen base
capsules, queue, and index are not duplicated in the model context.
Missing capsules use a visible, byte-bounded legacy fallback only for context
classified `public`; internal, restricted, and unclassified notes must be
curated first. Freshness is advisory: an ahead, dirty, divergent, or unknown
repository should trigger targeted review, not automatic context expansion.

Read the nearest `AGENTS.md` and canonical page before writing. Instructions
route behavior; Markdown pages hold reviewed knowledge. Never copy transient
task state, chat logs, tool output, credentials, or private context into a note.
`metonia_context` is explicit opt-in because its result is sent to the selected
model provider; unknown or ambiguous repository matches must stop.
The reported sensitivity is the most restrictive Company, Project, or indexed
note classification. For direct lookup it describes what is being sent to the
already selected provider; it is not a provider authorization mechanism.
