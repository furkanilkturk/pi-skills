---
name: execute-plan
description: Execute a Metonia vault plan step by step with strict status tracking. Use when the user says /execute-plan, run the plan, continue the plan, or asks to implement a planned feature from wiki/projects/<Company>/<Project>/plans/.
---

# Execute Plan

Vault path: discovered Metonia vault (ask user or env METONIA_VAULT, fallback C:/Users/imust/repos/obsidian/metonia)

## Goal

Run a vault plan exactly as written, keeping statuses updated, so any model can resume at any time.

## Workflow

1. Find the plan: user gives a path, or list `wiki/projects/<Company>/<Project>/plans/` and ask.
2. Read the plan fully once. Read the project `rules.md`. Do not read anything else yet.
3. Set plan frontmatter `status: in-progress`.
4. For each step with `status: todo`, in order:
   - set step `doing`;
   - read only the files the step names;
   - make exactly the change described;
   - run the step's done-check;
   - pass → `done`; fail → retry once; still failing → `blocked` + paste error + stop and report.
5. Never skip steps, never reorder, never expand scope, never redesign the plan mid-run. If the plan is wrong, mark the step `blocked` with why and let the human decide.
6. When all steps are done:
   - run the project's full verification (lint/check/test as named in project index);
   - fill the plan's Success Criteria checkboxes;
   - set plan `status: done`;
   - append one line to project `log.md` Build Log (what shipped, deviations);
   - update `synced_commit`/`synced_at` in project `index.md` if repo work happened.

## Token Discipline

The plan replaces exploration. If you feel the urge to browse the repo "to understand", the plan is under-specified — mark the step blocked instead of exploring.

## Resuming

If some steps are `done`/`blocked`, start at the first non-done step. Trust the statuses; do not redo completed work unless a check fails.
