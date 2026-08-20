---
name: create-project
description: Create a new Obsidian work project note in the Metonia vault before code exists or before inspecting a repo. Use when the user says /create-project, create project note, start a new Frostium/Yuppo/Freelance project, or wants the agent to ask questions and capture project context.
---

# Create Project

Vault path: `C:/Users/imust/repos/Obsidian/metonia`

## Goal

Create a project context page from user answers. This is for planned/new projects where repo inspection is not the primary source yet.

## Required Questions

Ask the user, preferably in one grouped questionnaire:

1. Company/client: Frostium, Yuppo, Freelance, Personal, or custom?
2. Project name?
3. Repo path, if known? If new repo, where should it be created?
4. Goal: what does this app/project do?
5. Stack: frontend, backend, database, deployment?
6. Important rules/preferences?
7. What should AI not change without asking?
8. Git/GitHub: init git now? If yes, private or public? (default: private)

## Output Path

Each project is a folder:

- Frostium: `wiki/projects/Frostium/<Project>/index.md` (+ `rules.md` + `log.md`, `skills.md` optional)
- Yuppo: `wiki/projects/Yuppo/<Project>/index.md` (+ `rules.md` + `log.md`, `skills.md` optional)
- Freelance: `wiki/projects/Freelance/<Project>/index.md` (+ `rules.md` + `log.md`, `skills.md` optional)
- Personal: `wiki/projects/Personal/<Project>/index.md` (+ `rules.md` + `log.md`, `skills.md` optional)
- Custom: ask for folder under `wiki/projects/`

## Template

Use `wiki/projects/_templates/Work Project Template.md` as the base. Create `index.md` + `rules.md` + `log.md`. Only create `skills.md` if the project actually needs custom AI workflows — skip otherwise.

Always include links:

- company page: `[[Frostium]]`, `[[Yuppo]]`, `[[Freelance]]`, or `[[Personal]]`
- `[[Work Context System]]`
- living concepts when obvious: `[[Zod]]`, `[[Drizzle ORM]]`, `[[HTTP]]`, `[[Database Engineering]]`, etc.

If a linked concept doesn't exist yet, create `wiki/concepts/<Concept>.md` as a living stub (what it is + minimal example).

## Git Init (when requested)

If user wants git/GitHub for a new project:

1. `git init` in repo path (if not already a repo).
2. Create initial commit (README, .gitignore) if repo is empty.
3. `gh repo create <name> --private|--public --source . --push` (prefer `gh` if available, else ask for remote URL).
4. Default to **private** unless user says public.
5. Record repo URL in `index.md` frontmatter `repo:` field.

Skip git entirely if project is docs-only or user says no.

## After Creating

Update:

- company index page project list;
- `wiki/Index.md` if the project is important;
- `wiki/Log.md` with a short entry.

Do not store secrets, tokens, passwords, private customer data, or raw ticket dumps.
