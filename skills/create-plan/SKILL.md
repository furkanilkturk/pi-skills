---
name: create-plan
description: Create an executable plan file in the Metonia vault for a work project. Use when the user says /create-plan, plan this feature, make a plan for MechFlow/Frostium/etc., or wants a task broken into steps a weaker model can execute later.
---

# Create Plan

Vault path: discovered Metonia vault (ask user or env METONIA_VAULT, fallback C:/Users/imust/repos/obsidian/metonia)

## Goal

Turn a goal into a plan file that a **weak model with no chat memory** can execute step by step. The plan is the memory; the executor only needs the plan plus what it names.

## Workflow

1. Identify company and project folder `wiki/projects/<Company>/<Project>/` (ask if unclear).
2. Read `index.md` + `rules.md`, and skim `log.md` open questions. Read the repo only as needed to name exact files.
3. Ask the user for anything unclear: goal, scope, constraints, done definition.
4. Write `wiki/projects/<Company>/<Project>/plans/<slug>.md` from `wiki/projects/_templates/Plan Template.md`.
5. Set plan frontmatter `status: ready` when the user approves it.

## Executability Rules

A step is well-written when a model that has never seen this conversation can do it:

- **Exact paths** — every file named from repo root, no "the auth file".
- **One instruction block per step** — precise, includes the pattern to copy or file to imitate.
- **Verifiable done-check** — a command + expected result (lint, test, build, visible output). No "works correctly".
- **No cross-step memory** — if step 3 needs something from step 1, restate it or point at the produced file.
- **Failure path** — retry once, then mark blocked and stop. Never improvise scope.
- Max ~10 steps; bigger goals become multiple plans (`<slug>-phase2`).

## Context Discipline

Link the minimum: project index + rules always; concepts only for steps that touch them. If you cannot write a verifiable done-check for a step, split the step or ask the user.

## After Creating

- Append one line to the project `log.md`: plan created, path, goal.
- Update `wiki/Log.md` if the plan is notable.
