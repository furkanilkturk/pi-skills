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

## Capability Profiles

Use `metonia-orchestrator` by capability, not by the parent session model:

- **Quick recon:** `efficient-read` for bounded, read-only facts.
- **Quick execution:** `bounded-write` for mechanical,
  low-risk, reversible, one-file work with an exact check. No formal plan or
  independent review unless stricter project rules require them.
- **Bounded low-risk Standard:** `bounded-write` may execute an exact plan of at most
  three files with deterministic checks, no sensitive domain, no human gate,
  and no effect beyond `none` or `local-build`; use `fresh-review`.
- **Standard execution and review:** `standard-write`, then `fresh-review`.
  The writer owns one write set; review inspects the actual diff and evidence
  read-only.
- **Critical decision:** `deep-decision`, only for bounded questions with
  explicit alternatives, risk, and acceptance criteria.

The parent remains the planner/orchestrator. Persist facts, decisions,
evidence paths, and acceptance criteria in the vault; do not assume a child
inherits chat memory. A model profile is a capability contract, not permission
to broaden scope. Ambiguity, a mismatch, a failed safety check, or an expanding
write set escalates the mode and removes bounded-write eligibility.

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
3. For an existing repo, follow the system page's **Context Routing** before
   proposing a hierarchy: scan all project index frontmatter, reuse an exact
   `repo_path`/`repo_url` match, then ask the user to resolve related-name
   candidates as existing, related separate, or genuinely new.
4. Read the matched company index if it exists
   (`wiki/projects/<Company>/<Company>.md`), or list `wiki/projects/<Company>/`
   for the project.
5. If the project folder exists, read `index.md` + `rules.md`, then only the
   `Current State` and `Open Questions` sections of `log.md` by default
   (+ `skills.md` only if present). Read Decisions, latest Build Log entries,
   Lessons Learned, or `archive/log-YYYY.md` only when the task needs that
   history. If the project does not exist, create it from the template.
6. Then inspect the actual repo files for the coding task.
7. Update the project folder only with durable context: decisions, commands,
   architecture, recurring bugs, and lessons. Never create `skills.md` or
   `workflows.md` unless the project actually needs them.
8. For planned implementation, record the executor profile, base commit, exact
   write set, verification commands, retry safety, and whether fresh review is
   required. Treat a worker handoff as implementation evidence, not completion:
   accept only after named checks pass and required reviewer blockers are
   resolved or explicitly deferred by the user.

This skill routes coding projects only. Document and video ingestion use
`doc-learning` or `video-learning`; those vault-learning workflows do not
inherit coding planner/worker/reviewer requirements.

## Task Modes

Before real work, read **Efficiency** and **Mode Requirements** under **Task
Modes** in `wiki/projects/Work Context System.md`; that policy is canonical.
Announce **Quick**, **Standard**, or **Critical** with one reason, follow its
mutation ownership rules, and escalate if risk rises. Company and project rules
may only make this policy stricter.

## Boundaries

- Never store secrets, tokens, passwords, or private customer data.
- Keep company rules separate. Do not apply one company's rules to another
  unless the user asks.
- Existing repo style beats generic advice.
- Keep `Current State` to about 10 bullets. When `log.md` exceeds about 300
  lines, move the oldest Build Log entries only to
  `archive/log-YYYY.md`; never archive Current State or Open Questions. Keep
  Decisions and Lessons unless genuinely unwieldy, and create/load archives
  only when entries are moved/history is needed.
- Small code fixes do not need notes unless they teach a reusable lesson.

## Living Concepts

Follow **Learning From Work** in `wiki/projects/Work Context System.md`. Promote
only durable, evidenced ideas; preserve other projects' sections; keep one-off
facts in the project log; and route any new topic from [[Index]].
