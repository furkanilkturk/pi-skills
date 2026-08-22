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

1. Ask for company/client if unclear (the `wiki/projects/<Company>/` folder).
2. Ask for the repo path if it is not the current working directory.
3. Inspect the repo minimally:
   - top-level files/folders;
   - README/package/config files;
   - framework/language;
   - app entry points;
   - folder/file structure conventions (where UI, server, shared code, state,
     controllers, tests live — name the actual folders);
   - test/build commands if obvious;
   - important system boundaries: user/product flows, UI/design accessibility,
     client/server, data, auth, integrations, operations — whichever apply.
4. Summarize what was inferred.
5. Ask the user to confirm/fill gaps:
   - project name;
   - real goal/domain;
   - team rules;
   - forbidden changes;
   - production/deploy notes if safe to store.
6. Create the project folder `wiki/projects/<Company>/<Project>/` with
   `index.md` + `rules.md` + `log.md` from
   `wiki/projects/_templates/Work Project Template.md`. Start the log with
   `Current State` (about 10 bullets maximum), then `Open Questions`, followed
   by Decisions, Build Log, and Lessons Learned; do not pre-create archives.
   Only add `skills.md` if the project needs custom AI skills, `workflows.md`
   only for human workflows.

## Structure Conventions

Record the repo's real layout in the project `index.md` under **Important
Folders** (tree + one-line purpose each). Then check the company page's
**Project Structure** section:

- If empty → propose filling it from this repo (ask first).
- If present → note where this repo follows or deviates from it.
- Never copy one company's conventions into another company's page.

## Living Concepts Update

When the project surfaces a durable, reusable idea — engineering, product,
design, business, or otherwise — update the concept:

- If `wiki/concepts/<Topic>.md` missing → create a living concept page (what it
  is + minimal example/evidence).
- If it exists → append a `## <Project> — how we use/learned <Topic>` subsection
  + backlink (match the page's existing project-heading level; default `##`),
  preserve other projects' sections.
- Projects only link `[[<Topic>]]`, they don't duplicate the explanation.
- One-off fixes and project-specific facts stay in the project `log.md` — don't
  create a concept for a tiny fix.

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

Add the new project route to the company index (if it exists) and
`wiki/Index.md`. Append a short `wiki/Log.md` entry for the meaningful project
addition; skip no-op/tiny typo, formatting, or link-only maintenance.
