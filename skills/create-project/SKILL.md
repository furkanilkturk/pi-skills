---
name: create-project
description: Create a new project note in the Metonia vault before code exists or before inspecting a repo. Use when the user says /create-project, create project note, start a new project, or wants the agent to ask questions and capture project context.
---

# Create Project

Vault path: discover the Metonia vault by reading the `METONIA_VAULT`
environment variable, or by asking the user for the path. There is no
machine-specific fallback.

## Goal

Create a project context page from user answers. This is for planned/new
projects where repo inspection is not the primary source yet.

## Required Questions

Ask the user, preferably in one grouped questionnaire:

1. Company/client: which folder under `wiki/projects/<Company>/` (or a new one)?
2. Project name?
3. Repo path, if known? If new repo, where should it be created?
4. Goal: what does this app/project do?
5. Product & system surfaces: what user/product flows exist, and which apply —
   UI/design, client, server, data, integrations, deployment?
6. Structure: read the company page's **Project Structure** section if one
   exists; otherwise note "follow existing repo" and capture the real layout
   later via the add-project skill.
7. Important rules/preferences?
8. What should AI not change without asking?
9. Git/GitHub: should repository setup be a separate follow-up action? Vault
   creation alone never authorizes repository creation or push. If requested,
   ask private/public (default: private) immediately before that action.

## Output Path

Each project is a folder:

```text
wiki/projects/<Company>/<Project>/
  index.md   (+ rules.md + log.md; skills.md optional)
```

Use `wiki/projects/_templates/Work Project Template.md` as the base. Create
`index.md` + `rules.md` + `log.md`. Start `log.md` with `Current State` (about
10 bullets maximum), then `Open Questions`, followed by Decisions, Build Log,
and Lessons Learned. Do not pre-create an archive folder or file. Only create
`skills.md` if the project needs custom AI skills, `workflows.md` only for human
workflows — skip both otherwise.

Always include links:

- company index page if it exists;
- `[[Work Context System]]`;
- living concepts when obvious (durable, reusable ideas only).

If a linked concept doesn't exist yet and it is durable/reusable, create
`wiki/concepts/<Concept>.md` as a living stub (what it is + minimal example).
Skip one-off or project-specific facts — those stay in `log.md`.

## Git Init (separate explicit action)

Complete the vault project first. Only if the user explicitly authorizes the
separate repository action:

1. `git init` in the repo path (if not already a repo).
2. Create an initial commit (README, .gitignore) if the repo is empty.
3. Ask once more before the external `gh repo create ... --push` mutation, then
   run it at most once. Prefer `gh` if available; otherwise ask for the remote
   URL. On ambiguous failure, inspect local/remote state before any retry.
4. Default to **private** unless the user says public.
5. Record the repo URL in `index.md` frontmatter `repo_url:`.

Skip git entirely if the project is docs-only or the user says no.

## After Creating

Update the company index project list (if it exists) and `wiki/Index.md` with
the new project route. Append a short `wiki/Log.md` entry for the meaningful
project creation; skip no-op/tiny typo, formatting, or link-only maintenance.

Do not store secrets, tokens, passwords, private customer data, or raw ticket
dumps.
