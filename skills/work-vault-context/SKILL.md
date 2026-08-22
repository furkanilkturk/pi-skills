---
name: work-vault-context
description: Use the Metonia Obsidian vault as durable AI context for real-world coding projects. Load when the user says work context, resume project, create project note, or asks to connect coding work with learning notes.
---

# Work Vault Context

Vault path: discover the Metonia vault by reading the `METONIA_VAULT`
environment variable, or by asking the user for the path. There is no
machine-specific fallback.

## Purpose

Use a local wiki as durable context for coding agents. Company/project rules
live in the vault; repo code lives wherever the project is.

## Context Folders

- Company index: `wiki/projects/<Company>/<Company>.md`
- Project: `wiki/projects/<Company>/<Project>/` (`index.md` + `rules.md` +
  `log.md`, `skills.md`/`workflows.md` optional)
- Template: `wiki/projects/_templates/Work Project Template.md`
- System: `wiki/projects/Work Context System.md`

## Workflow

When the user says to create or resume a work project:

1. Resolve the vault path (`METONIA_VAULT` or ask).
2. Read `wiki/projects/Work Context System.md`.
3. Read the company index if it exists
   (`wiki/projects/<Company>/<Company>.md`), or list `wiki/projects/<Company>/`
   for the project.
4. If the project folder exists, read `index.md` + `rules.md` + `log.md`
   (+ `skills.md` only if present). If not, create the folder from the template.
5. Then inspect the actual repo files for the coding task.
6. Update the project folder only with durable context: decisions, commands,
   architecture, recurring bugs, and lessons. Never create `skills.md` or
   `workflows.md` unless the project actually needs them.

## Task Modes

Before real work, read the **Task Modes** section in
`wiki/projects/Work Context System.md`; it is the canonical full policy. Announce
**Quick**, **Standard**, or **Critical** with one reason, keep one writer per
worktree, and escalate if risk rises. Company and project rules may only make
this policy stricter.

## Boundaries

- Never store secrets, tokens, passwords, or private customer data.
- Keep company rules separate. Do not apply one company's rules to another
  unless the user asks.
- Existing repo style beats generic advice.
- Small code fixes do not need notes unless they teach a reusable lesson.

## Living Concepts

`wiki/concepts/` holds **living** pages for durable, reusable ideas across any
domain — engineering, product, design, business, research, or otherwise. When a
project uses or learns something durable:

1. If `wiki/concepts/<Topic>.md` doesn't exist → create it: what it is + minimal
   example/evidence + link to the source.
2. If it exists → **append** a `## <Project> — how we use/learned <Topic>`
   subsection + backlink to `[[<Project>/index|Project]]` (match the page's
   existing project-heading level; default `##`). Never overwrite other
   projects' sections.
3. Projects only **link** to the concept (`[[<Topic>]]`), they don't own the
   explanation.
4. Skip one-off fixes and project-specific facts — those stay in the project
   `log.md`, not a concept.

If a topic doesn't fit an existing `wiki/concepts/` or `wiki/courses/` folder,
create a new `wiki/concepts/<NewTopic>/` or `wiki/courses/<new-course>/` and add
it to [[Index]].
