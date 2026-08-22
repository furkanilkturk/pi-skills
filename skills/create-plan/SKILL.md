---
name: create-plan
description: Create an executable plan file in the Metonia vault for a work project. Use when the user says /create-plan, plan this feature, make a plan, or wants a task broken into steps a weaker model can execute later.
---

# Create Plan

Vault path: discover the Metonia vault by reading the `METONIA_VAULT`
environment variable, or by asking the user for the path. There is no
machine-specific fallback.

## Goal

Turn a goal into a plan file that a **weak model with no chat memory** can
execute step by step. The plan is the memory; the executor only needs the plan
plus what it names.

## Workflow

1. Identify the company and project folder
   `wiki/projects/<Company>/<Project>/` (ask if unclear).
2. Read `index.md` + `rules.md`, then only `Current State` and `Open Questions`
   from `log.md` by default. Read Decisions, latest Build Log entries, Lessons,
   or an archive only when task-relevant. Read the repo only as needed to name
   exact files.
3. Follow **Planning and Execution** in `wiki/projects/Work Context System.md`.
   Ask only decision-changing questions about goal, scope, constraints, done
   definition, or adaptive execution. Strict is the default.
4. Write `wiki/projects/<Company>/<Project>/plans/<slug>.md` from
   `wiki/projects/_templates/Plan Template.md`. Set frontmatter
   `execution_mode: strict`; use `adaptive` only after explicit user selection
   or approval and record that approval in the Execution Log.
5. Set plan frontmatter `status: ready` when the user approves it.

## Executability Rules

A step is well-written when a model that has never seen this conversation can do
it:

- **Exact paths** — every file named from repo root, no "the auth file".
- **One instruction block per step** — precise, includes the pattern to copy or
  file to imitate.
- **Verifiable done-check** — a command + expected result (lint, test, build,
  visible output). No "works correctly".
- **No cross-step memory** — if step 3 needs something from step 1, restate it
  or point at the produced file.
- **Failure path** — retry once, then mark blocked and stop. Never improvise
  scope.
- **Execution boundary** — strict plans block on any mismatch without off-plan
  exploration or writes. Adaptive plans still forbid off-plan implementation
  writes and use only the controlled amendment flow in the template.
- Max ~10 steps; bigger goals become multiple plans (`<slug>-phase2`).

## Context Discipline

Link the minimum: project index + rules always; concepts only for steps that
touch them. If you cannot write a verifiable done-check for a step, split the
step or ask the user.

## Efficiency

Follow canonical **Planning and Execution** and **Task Modes** (including
**Efficiency**) in `wiki/projects/Work Context System.md`; do not restate them in
the plan.

## After Creating

- Append one line to the project `log.md` Build Log: plan created, path, goal.
  If this takes `log.md` past about 300 lines, move the oldest Build Log entries
  only to `archive/log-YYYY.md`; never archive Current State/Open Questions or
  pre-create archive scaffolding.
- Update `wiki/Log.md` if the plan is notable.
