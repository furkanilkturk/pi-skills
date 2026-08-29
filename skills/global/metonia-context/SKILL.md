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

Read the nearest `AGENTS.md` and canonical page before writing. Instructions
route behavior; Markdown pages hold reviewed knowledge. Never copy transient
task state, chat logs, tool output, credentials, or private context into a note.
`metonia_context` is explicit opt-in because its result is sent to the selected
model provider; unknown or ambiguous repository matches must stop.
