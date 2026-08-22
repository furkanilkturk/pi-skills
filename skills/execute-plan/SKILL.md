---
name: execute-plan
description: Execute a Metonia vault plan step by step with strict status tracking. Use when the user says /execute-plan, run the plan, continue the plan, or asks to implement a planned feature from wiki/projects/<Company>/<Project>/plans/.
---

# Execute Plan

Vault path: discover the Metonia vault by reading the `METONIA_VAULT`
environment variable, or by asking the user for the path. There is no
machine-specific fallback.

## Goal

Run a vault plan exactly as written, keeping statuses updated, so any model can
resume at any time.

## Workflow

1. Find the plan: the user gives a path, or list
   `wiki/projects/<Company>/<Project>/plans/` and ask.
2. Read the plan fully once and read the project `rules.md`. Do not read anything
   else yet. Treat a missing `execution_mode` as `strict` for legacy plans.
3. Confirm the execution mode. `strict` is the default. `adaptive` is valid only
   when explicit user selection/approval is recorded in the plan Execution Log;
   otherwise block and request that approval before implementation writes.
4. Set plan frontmatter `status: in-progress`.
5. For each step with `status: todo`, in order:
   - set step `doing`;
   - read only the files the step names;
   - make exactly the change described, never making implementation writes
     outside `Files:`;
   - run the step's done-check;
   - pass → `done`; fail → retry once; still failing → set the step `status:
     blocked`, paste the error, set plan `status: blocked` with
     `blocked_reason:` and `resume_when:`, then stop and report.
6. On a plan/repo mismatch:
   - **Strict:** do not explore or write off-plan. Block the step and plan with
     the mismatch and the condition needed to resume, then stop.
   - **Adaptive:** stop implementation writes. If security, privacy, or data-loss
     uncertainty is involved, do not inspect adjacent files or speculate; use
     the existing mismatch evidence only. Otherwise inspect read-only at most
     five directly related adjacent files or callers. Append
     `## Proposed Amendment — YYYY-MM-DD` to the plan with the
     affected step, evidence and inspected files, revised exact paths, revised
     checks, and ownership. Set the step/plan blocked with `blocked_reason:` and
     `resume_when:`, then wait for human approval. Only these plan control-record
     writes are allowed before approval.
   - After explicit approval, amend the plan, record approval in its Execution
     Log, restore the step to `todo` and plan to `in-progress`, then resume.
7. Never skip or reorder steps. Adaptive changes the amendment procedure, not
   the permission to make off-plan writes.
8. When all steps are done:
   - run the project's full verification (lint/check/test as named in the
     project index);
   - fill the plan's Success Criteria checkboxes;
   - set plan `status: done` only when every step and full check passed;
   - refresh the project `log.md` Current State (about 10 bullets maximum) and
     append one Build Log line (what shipped, deviations);
   - if `log.md` now exceeds about 300 lines, move the oldest Build Log entries
     only to `archive/log-YYYY.md`; never archive Current State/Open Questions,
     and do not create archive scaffolding before entries move;
   - update concepts or project index metadata only when the approved plan names
     those files; otherwise leave them for `/update-project`.

## Token Discipline

The plan replaces exploration. If you feel the urge to browse the repo "to
understand", the plan is under-specified: strict mode blocks immediately;
adaptive mode may use only the bounded read-only amendment procedure above.

## Resuming

If some steps are `done`/`blocked`, start at the first non-done step. Resume a
blocked step only when `resume_when:` is satisfied (including human amendment
approval), restore plan `status: in-progress`, and preserve completed work unless
a check fails.
