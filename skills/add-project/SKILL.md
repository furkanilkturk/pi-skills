---
name: add-project
description: Add an existing codebase to the Metonia work context system. Use when the user says /add-project, add existing project, understand this repo, create context from codebase, or wants the agent to inspect a repo then ask clarifying questions.
---

# Add Project

Vault path: discover the Metonia vault by reading the `METONIA_VAULT`
environment variable, or by asking the user for the path. There is no
machine-specific fallback.

## Goal

Create a project note for an existing repo by inspecting the codebase first,
then asking only necessary questions.

## Workflow

Follow **Context Routing** in `wiki/projects/Work Context System.md` before
proposing any company/project hierarchy.

1. Resolve the repo path (use the current working directory when applicable)
   and any repo URL. Scan all existing project `index.md` frontmatter for exact
   `repo_path`/`repo_url` matches, then related-name ambiguity. Reuse an exact
   match. For related candidates, ask the user to choose existing, related but
   separate, or genuinely new. Reuse an existing choice; for related but
   separate, confirm a distinct project name and company placement; for
   genuinely new, confirm company/project placement.
2. Inspect the repo minimally: top-level and README/config files, language and
   entry points, actual folder conventions, obvious test/build commands, and
   relevant system boundaries.
3. Summarize what was inferred, then ask only for decision-changing gaps such as
   goal, team rules, forbidden changes, or safe deployment context.
4. For either user-confirmed new route (related but separate or genuinely new),
   create `wiki/projects/<Company>/<Project>/` with `index.md` + `rules.md` +
   `log.md` from `wiki/projects/_templates/Work Project Template.md`. Start the
   log with `Current State` (about 10 bullets maximum), then `Open Questions`,
   Decisions, Build Log, and Lessons Learned; do not pre-create archives. Add
   `skills.md` or `workflows.md` only when actually needed.

## Structure Conventions

Record the repo's real layout in the project `index.md` under **Important
Folders** (tree + one-line purpose each). Then check the company page's
**Project Structure** section:

- If empty → propose filling it from this repo (ask first).
- If present → note where this repo follows or deviates from it.
- Never copy one company's conventions into another company's page.

## Living Concepts Update

Follow **Learning From Work** in `wiki/projects/Work Context System.md`: promote
only durable, evidenced ideas, preserve other projects' sections, and keep
one-off or project-specific facts in the project log.

## What to Store

Store durable context only:

- architecture map;
- important folders;
- commands;
- team rules;
- AI guardrails;
- decisions;
- recurring bugs;
- links to living concepts (domain + tech).

Do not copy large source files. Do not store secrets.

## Updates

Only after a project route was actually created, add it to the company index
(if that index exists) and `wiki/Index.md`. Append a short `wiki/Log.md` entry
for the meaningful project addition; skip all updates when an existing route
was reused.
