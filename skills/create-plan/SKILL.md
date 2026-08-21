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
2. Read `index.md` + `rules.md`, and skim `log.md` open questions. Read the repo
   only as needed to name exact files.
3. Ask the user for anything unclear: goal, scope, constraints, done definition.
4. Write `wiki/projects/<Company>/<Project>/plans/<slug>.md` from
   `wiki/projects/_templates/Plan Template.md`.
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
- Max ~10 steps; bigger goals become multiple plans (`<slug>-phase2`).

## Context Discipline

Link the minimum: project index + rules always; concepts only for steps that
touch them. If you cannot write a verifiable done-check for a step, split the
step or ask the user.

## Speed Policy

Plan fast; never trade the floor below for speed.

- **One plan by default.** Split only for genuinely independent
dependency/deployment/parallel ownership lanes, not merely because the task is
large. When you split, state the reason in the plan.
- **Reuse current context.** Use a current audit, recon, or research brief
instead of rereading the whole repository in a fresh context. Re-verify only
facts still uncertain and the exact paths/checks the plan names.
- **Soft wall-clock targets.** Quick ~5 minutes, Standard ~15, Critical ~30.
These are targets, never hard deadlines. At the target, report the
evidence-backed bottleneck; exceed it only for unresolved correctness,
security, privacy, or data-loss risk — never for prose polish.
- **Default 4-7 steps, roughly 80-150 lines** per plan (max ~10 steps). Exceed
the line guide only for evidence-backed Critical complexity and say why.
- **Lane plans share by reference.** Do not duplicate shared context across
lane plans; point to the exact produced contracts/files/plans and repeat only
the facts a memoryless executor in that lane needs.
- **One focused review.** Standard gets one focused review; Critical gets one
independent focused review. Batch all blockers into one correction pass and one
re-review. Mechanical template/link/lint checks do not need separate reviewers.
- **Quality floor is non-negotiable.** Exact paths, verifiable checks, failure
handling, security/privacy/data-loss validation, accessibility where relevant,
ownership, rollout/rollback, and explicit human gates remain.
- **Budget stalls, not correctness.** When delegation controls exist, use soft
turn/tool/runtime budgets to expose stalls; never let a hard cutoff hide an
unresolved Critical risk.

## After Creating

- Append one line to the project `log.md`: plan created, path, goal.
- Update `wiki/Log.md` if the plan is notable.
