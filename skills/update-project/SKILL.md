---
name: update-project
description: Sync an existing Metonia Obsidian project note with the current codebase state. Use when the user says /update-project, sync project context, update project from commits, summarize recent repo changes, or refresh AI context for a large codebase.
---

# Update Project

Vault path: discovered Metonia vault (ask user or env METONIA_VAULT, fallback C:/Users/imust/repos/obsidian/metonia)

## Goal

Refresh the project note so it remains a useful map of the codebase, not a copy of the codebase.

## What Update Means

Update-project should sync **durable context** from repo changes:

- architecture changes;
- new important folders/modules;
- changed commands;
- changed dependencies/frameworks;
- new API/auth/database/cache/queue behavior;
- user/product flows, UI/design accessibility, or client/server/data/integrations/operations changes;
- decisions implied by commits;
- recurring bugs or lessons;
- TODOs/open questions worth tracking.

Do not summarize every commit. Do not copy code.

## Workflow

1. Identify company and project folder (`wiki/projects/<Company>/<Project>/`).
2. Identify repo path from `index.md` frontmatter/body, or ask user.
3. Inspect recent changes:
   - `git status --short`
   - recent commits, e.g. `git log --oneline -10`
   - if needed, `git diff --stat` and targeted diffs
4. Inspect current structure only where changed.
5. Produce a short proposed update:
   - Context changes -> `index.md`
   - Rule changes -> `rules.md`
   - Decisions/Lessons/Build Log -> `log.md`
   - Only touch `skills.md` if project has custom skills and they changed
6. Ask before writing if changes are ambiguous.
7. Update the project folder files and `wiki/Log.md`.

## Living Concepts Sync

When repo work surfaces a durable, reusable idea — engineering, product, design, business, or research — update `wiki/concepts/<Topic>.md`:
- Create if missing (what it is + minimal example/evidence), or append `## <Project> — how we use/learned <Topic>` subsection + backlink (match the page's existing project-heading level; default `##`).
- Keep concept as single live page shared across projects + transcripts.
- One-off or project-specific facts stay in `log.md`; skip concept creation for tiny fixes.

## Suggested Project Folder Sections

- `index.md`: Goal, Context, Architecture, Important Folders, Commands, Knowledge Lens (links to living concepts)
- `rules.md`: Rules / Preferences, What Not to Change, AI Instructions
- `log.md`: Decisions, Open Questions, Build Log, Lessons Learned
- `skills.md`: optional — only if project needs custom AI skills/workflows (`workflows.md` for human workflows)

## Sync Frequency

Use when:

- starting/resuming after a break;
- after a meaningful feature/bugfix;
- after architecture/dependency changes;
- before asking AI to do a large task.

Skip for tiny obvious edits.
