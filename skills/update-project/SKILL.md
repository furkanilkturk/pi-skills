---
name: update-project
description: Sync an existing Metonia project note with the current codebase state. Use when the user says /update-project, sync project context, update project from commits, summarize recent repo changes, or refresh AI context for a large codebase.
---

# Update Project

Vault path: discover the Metonia vault by reading the `METONIA_VAULT`
environment variable, or by asking the user for the path. There is no
machine-specific fallback.

## Pi Orchestration

In a parent session, load `metonia-orchestrator` and call `metonia_delegate`
once with `skill: "update-project"` and `cwd` set to the Metonia vault root.
Use `bounded-write` for an unambiguous closeout or sync whose exact cohesive
write set is known in advance (at most six files), risk is low, the vault base
matches, checks are deterministic, and there is no human gate, sensitive
decision, or external effect. Pass all bounded-write controls. Use
`standard-write` when target files may expand, concept selection is unresolved,
or any fast-lane condition fails. A vault write is not standard merely because
it is a vault write.

Supply only the bounded closeout/update evidence and target project path. The
runtime rejects a repo cwd so all project and shared concept writes use one
vault-root lock. When this skill is injected into the child, update directly
and do not delegate again. If `metonia_delegate` is unavailable, run in the
current session, disclose that the shared lock was not available, and still
re-read targets immediately before writing.

## Goal

Refresh the project note so it remains a useful map of the codebase, not a copy
of the codebase.

## What Update Means

Update-project should sync **durable context** from repo changes:

- architecture changes;
- new important folders/modules;
- changed commands;
- changed dependencies/frameworks;
- new API/auth/database/cache/queue behavior;
- user/product flows, UI/design accessibility, or client/server/data/
  integrations/operations changes;
- decisions implied by commits;
- recurring bugs or lessons;
- TODOs/open questions worth tracking.

Do not summarize every commit. Do not copy code.

## Workflow

1. Identify the company and project folder (`wiki/projects/<Company>/<Project>/`).
   For a delegated write, set child `cwd` to the Metonia vault root, never the
   code repository; the shared-vault writer lock is keyed from that root.
2. Read `index.md` + `rules.md` and only the `Current State` and `Open
   Questions` sections of `log.md` by default. Read Decisions, latest Build Log
   entries, Lessons Learned, or an archive only when the update needs them.
   Identify the repo path from `index.md` frontmatter/body, or ask the user.
3. Inspect recent changes:
   - `git status --short`
   - recent commits, e.g. `git log --oneline -10`
   - if needed, `git diff --stat` and targeted diffs
   When invoked as plan closeout, prefer the supplied final diff summary,
   reviewer result, plan path, and exact final plan-log event; do not reload the
   complete plan log or rediscover already verified evidence.
4. Inspect the current structure only where changed.
5. Produce a short proposed update:
   - Context changes → `index.md`
   - Current snapshot/open questions/Decisions/Lessons/Build Log → `log.md`
   - Rule changes → `rules.md`
   - Only touch `skills.md` if the project has custom skills and they changed
6. Before proposing or writing a completed-plan closeout, search the current
   project Build Log and intended concept subsections for the exact completed
   plan link or final event block ID. If it is already recorded, do not append
   it again; reconcile only genuinely missing durable facts and report the
   closeout as already recorded when nothing is missing.
7. Ask before writing if changes are ambiguous.
8. After the writer lock is held, re-read every target vault file immediately
   before its first write and preserve unrelated/concurrent sections. Update the
   project folder files. Keep Current State to about 10 bullets. If
   `log.md` exceeds about 300 lines, move its oldest Build Log entries only to
   `archive/log-YYYY.md`; never archive Current State or Open Questions, and
   keep Decisions/Lessons unless genuinely unwieldy. Create an archive only
   when moving entries and read one only for history. Append to `wiki/Log.md`
   only for a meaningful project change; skip no-op/tiny typo, formatting, or
   link-only maintenance. Do not update `wiki/Index.md` unless a project route
   or hub is new, renamed, or moved.

## Living Concepts Sync

When repo work surfaces a durable, reusable idea — engineering, product, design,
business, or research — update `wiki/concepts/<Topic>.md`:

- Create if missing (what it is + minimal example/evidence), or append a
  `## <Project> — how we use/learned <Topic>` subsection + backlink (match the
  page's existing project-heading level; default `##`).
- Keep the concept as a single live page shared across projects.
- Preserve other projects' sections. Update or merge this project's existing
  subsection instead of creating duplicates, and describe what is distinct
  about this project's use rather than copying generic library documentation.
- Link the project subsection to the exact completed plan or final plan-log
  event that proves it. Add the concept to the project's Knowledge Lens when it
  is not already linked.
- New durable Decision and Lesson bullets must end in a unique stable block ID:
  `^decision-YYYYMMDD-<slug>` or `^lesson-YYYYMMDD-<slug>`. Later plans link
  that exact block, never the whole Decisions/Lessons section.
- One-off or project-specific facts stay in `log.md`; skip concept creation for
  tiny fixes.

## Plan Closeout and Learning Harvest

After reviewed plan execution, treat `update-project` as a separate vault-write
phase, never as extra work for coding workers:

1. Append exactly one Build Log line naming the completed plan and exact final
   event. This completion record is mandatory even when no reusable learning
   exists. `execute-plan` must not write it.
2. Update Current State, Open Questions, Decisions, Lessons, rules, or project
   index only when the reviewed evidence changed durable truth.
3. Promote at most three reusable ideas to living concepts. Each
   project-specific subsection must state the evidenced difference in usage and
   backlink to the completed plan or exact final event. Do not alter another
   project's subsection.
4. The new plan's
   `Relevant History` links create reverse Obsidian backlinks automatically; do
   not edit historical plans merely to manufacture bidirectional links.
5. If there is no durable context or reusable lesson beyond the completion
   record, make no other project/concept edits and report
   `Learning harvest: none`.

If a prior writer ended as `mutation-unconfirmed`, first re-read the exact
project/concept targets and search for the plan/final-event dedupe key. Resume
only the missing portion. Never repeat the whole update or any external action
from the failed child response.

Use local `DD.MM.YYYY HH:mm` for new human-visible Build Log and event text;
keep frontmatter `created`/`updated` as `YYYY-MM-DD` and repository/audit
timestamps as ISO. Never rename historical headings just to normalize format.

This closes the forward loop for later planners without adding execution-time
context: `create-plan` performs the bounded reverse lookup, while executors open
only history explicitly named by their active packet.

## Suggested Project Folder Sections

- `index.md`: Goal, Context, Architecture, Important Folders, Commands,
  Knowledge Lens (links to living concepts)
- `rules.md`: Rules / Preferences, What Not to Change, AI Instructions
- `log.md`: Current State, Open Questions, Decisions, Build Log, Lessons Learned
- `skills.md`: optional — only if the project needs custom AI skills
  (`workflows.md` for human workflows)

## Sync Frequency

Use when:

- starting/resuming after a break;
- after a meaningful feature/bugfix;
- after architecture/dependency changes;
- before asking AI to do a large task.

Skip for tiny obvious edits.
