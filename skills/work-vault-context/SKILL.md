---
name: work-vault-context
description: Use the Metonia Obsidian vault as durable AI context for real-world coding projects across Frostium, Yuppo, freelance, and personal work. Load when the user says work context, Frostium, Yuppo, freelance, Personal, resume project, create project note, or asks to connect coding work with Obsidian learning notes.
---

# Work Vault Context

Vault path:

Discover Metonia vault: look for `metonia` repo adjacent to current project, or ask user for vault path. Default fallback: `C:/Users/imust/repos/obsidian/metonia` (override via `METONIA_VAULT` env).

## Purpose

Use Obsidian as durable context for coding agents. Company/project rules live in the vault; repo code lives wherever the project is.

## Context Folders

- Frostium: `wiki/projects/Frostium/`
- Yuppo: `wiki/projects/Yuppo/`
- Freelance: `wiki/projects/Freelance/`
- Personal: `wiki/projects/Personal/`
- Template: `wiki/projects/_templates/Work Project Template.md` (folder: index.md + rules.md + log.md, skills.md/workflows.md optional)
- System: `wiki/projects/Work Context System.md`

## Workflow

When the user says to create or resume a work project:

1. Open the vault path above.
2. Read `wiki/projects/Work Context System.md`.
3. Read the company index: `Frostium.md`, `Yuppo.md`, `Freelance.md`, or `Personal.md`.
4. If project folder exists, read `index.md` + `rules.md` + `log.md` (+ `skills.md` only if present). If not, create folder from template.
5. Then inspect the actual repo files for the coding task.
6. Update the project folder only with durable context: decisions, commands, architecture, recurring bugs, and lessons. Never create `skills.md`/`workflows.md` unless the project actually needs them.

## Boundaries

- Never store secrets, tokens, passwords, or private customer data.
- Keep company rules separate. Do not apply Frostium rules to Yuppo unless the user asks.
- Existing repo style beats generic advice.
- Small code fixes do not need notes unless they teach a reusable lesson.

## Living Concepts

`wiki/concepts/` holds **living** pages for durable, reusable ideas across any domain — engineering, product, design, business, research, or otherwise (e.g. [[Zod]], [[Drizzle ORM]], [[Better Auth]], [[Paraglide JS]]). When a project uses or learns something durable:

1. If `wiki/concepts/<Topic>.md` doesn't exist → create it: What it is + minimal example/evidence + link to the source.
2. If it exists → **append** a `## <Project> — how we use/learned <Topic>` subsection + backlink to `[[<Project>/index|Project]]` (match the page's existing project-heading level; default `##`). Never overwrite other projects' sections.
3. Projects only **link** to the concept (`[[Zod]]`), they don't own the explanation.
4. Skip one-off fixes and project-specific facts — those stay in the project `log.md`, not a concept.

This keeps one canonical page that grows with every project and transcript. Also handle new topics that need a new folder: if topic doesn't fit existing `wiki/concepts/` or `wiki/courses/`, create `wiki/concepts/<NewTopic>/` or `wiki/courses/<new-course>/` and add to [[Index]].

## Learning Links

When project work reveals a durable concept, link it to the learning vault (balanced examples below; any living `[[Concept]]` works):

- `[[Code Review]]` — engineering/process
- `[[CSS]]` — web/design
- `[[Expo]]` — mobile
- `[[RevenueCat]]` — business/billing
- `[[Artificial Intelligence]]` — AI/research
- `[[HTTP]]`, `[[Database Engineering]]` — backend/data
