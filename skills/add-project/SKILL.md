---
name: add-project
description: Add an existing codebase to the Metonia Obsidian work context system. Use when the user says /add-project, add existing project, understand this repo, create context from codebase, or wants the agent to inspect a repo then ask clarifying questions.
---

# Add Project

Vault path: discovered Metonia vault (ask user or env METONIA_VAULT, fallback C:/Users/imust/repos/Obsidian/metonia)

## Goal

Create a project note for an existing repo by inspecting the codebase first, then asking only necessary questions.

## Workflow

1. Ask for company/client if unclear: Frostium, Yuppo, Freelance, Personal, or custom.
2. Ask for repo path if not in the current working directory.
3. Inspect the repo minimally:
   - top-level files/folders;
   - README/package/config files;
   - framework/language;
   - app entry points;
   - test/build commands if obvious;
   - important backend boundaries: API, DB, cache, queue, auth, deployment.
4. Summarize what was inferred.
5. Ask the user to confirm/fill gaps:
   - project name;
   - real goal/domain;
   - team rules;
   - forbidden changes;
   - production/deploy notes if safe to store.
6. Create the project folder `wiki/projects/<Company>/<Project>/` with `index.md` + `rules.md` + `log.md` from `wiki/projects/_templates/Work Project Template.md`. Only add `skills.md` if project needs custom workflows.

## Living Concepts Update

When project uses a tech/lib (Zod, Drizzle, Better Auth, Paraglide, etc.):
- If `wiki/concepts/<Tech>.md` missing → create living concept page (what it is + minimal example).
- If exists → append `### <Project> — how we use <Tech>` subsection + backlink, preserve other projects' sections.
- Projects only link `[[Tech]]`, they don't duplicate the explanation.

## What to Store

Store durable context only:

- architecture map;
- important folders;
- commands;
- team rules;
- AI guardrails;
- decisions;
- recurring bugs;
- links to living concepts (backend + tech).

Do not copy large source files. Do not store secrets.

## Updates

Update company index, `wiki/Index.md` if important, and `wiki/Log.md`.
