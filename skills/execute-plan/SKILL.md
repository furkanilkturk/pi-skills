---
name: execute-plan
description: Execute an approved Metonia work-project plan step by step with strict status tracking, bounded reads, evidence, and fresh review. Use for /execute-plan, run the plan, continue the plan, or implement this approved plan. Do not use for unplanned work or vault learning ingestion.
---

# Execute Plan

Vault path: discover the Metonia vault by reading the `METONIA_VAULT`
environment variable, or by asking the user for the path. There is no
machine-specific fallback.

## Goal

Run a vault plan exactly as written, keeping statuses updated, so any model can
resume at any time.

## Executor Profile and Handoff

This is a coding execution skill. Do not rely on the parent chat, persistent
memory, or unstated repo knowledge. The plan, its named files, and the current
working tree are the complete fresh-context handoff.

Use `standard-write` unless **all** bounded-write fast-lane conditions hold:
`risk: low`; at most three files in the complete write set; exact deterministic
checks; no architecture, auth, security, privacy, migration, concurrency, or
hard-to-reverse decision; every effect is `none` or `local-build`; every human
gate is `none`; and the base commit matches.

Any ambiguity, unexpected dependency, expanding write set, plan/repo mismatch,
or failed safety check removes fast-lane eligibility. Stop and return evidence;
do not let the bounded executor explore or invent scope. Use `deep-decision`
only for a bounded critical decision.

## Orchestration Contract

When this skill is loaded in the parent session, do not implement the approved
plan in that expensive context. Load `metonia-orchestrator`, verify approval,
schema, base commit, risk, and step controls, then call `metonia_delegate` with
`bounded-write` or `standard-write`. Explicitly inject `execute-plan`. When this
skill is injected into the child, execute directly and do not delegate again.

Use this shape with actual absolute paths:

```js
{
  capability: "bounded-write",
  task: "Execute the approved Metonia plan at <ABS_PLAN_PATH>. Obey its base commit, active packet, write set, gates, and stop conditions.",
  skill: "execute-plan",
  cwd: "<REPO_PATH>",
  criteria: ["Every completed step and success criterion has named evidence"],
  evidence: ["changed-files", "commands-run", "residual-risks"],
  controls: {
    risk: "low",
    writeFiles: ["<EXACT_FILE>"],
    deterministicChecks: true,
    sensitiveDecision: false,
    externalEffect: false,
    humanGate: false,
    baseCommitMatches: true
  }
}
```

For `standard-write`, omit `controls`; they are an executable guard for the
bounded route, not a claim that changes the plan's scope.

After implementation evidence passes, use `fresh-review` for required
independent review with the plan path, actual diff, commands/results, and
residual risks. Keep the plan `in-progress` until required reviewer
blockers are resolved or explicitly deferred by the user. Execute directly in
the parent only when `metonia_delegate` is unavailable or the user explicitly
selects the parent session; record that exception in the plan.

## Workflow

1. Find the plan: the user gives a path, or list
   `wiki/projects/<Company>/<Project>/plans/` and ask.
2. Read the compact plan header fully once, project `rules.md`, and only
   **Planning and Execution** and **Efficiency** in
   `wiki/projects/Work Context System.md`. Do not read anything else yet. Treat
   a missing `execution_mode` as `strict` for legacy plans. If the plan declares
   packets, load only the active packet; do not preload later packets or the
   complete reconnaissance history.
   For schema v2 verify `plan_schema`, `base_commit`, `risk`,
   `executor_profile`, and `review_profile` before changing files and honor each
   step's retry, idempotence, external-effect, and human-gate controls. A
   mismatch follows the plan/repo mismatch flow below.
3. Confirm the execution mode. `strict` is the default. `adaptive` is valid only
   when explicit user selection/approval is recorded in the plan Execution Log;
   otherwise block and request that approval before implementation writes.
4. Set plan frontmatter `status: in-progress`.
5. For each step with `status: todo`, in order:
   - set step `doing`;
   - load its packet when declared, then read only the files that packet/step names;
   - make exactly the change described, never making implementation writes
     outside `Files:`;
   - run the step's done-check;
   - pass → `done`; fail → retry only when `retry: safe-once` and
     `idempotent: true`; otherwise set the step `status: blocked`, paste the
     error, set plan `status: blocked` with `blocked_reason:` and `resume_when:`,
     then stop and report. A bounded-to-standard escalation consumes that one allowed
     retry and must keep the same base commit, write set, and acceptance contract.
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
   - read only the project index's **Commands** section, then run its full
     verification (lint/check/test);
   - apply the completed-work metric and stop rules from canonical **Planning
     and Execution**;
   - fill the plan's Success Criteria checkboxes;
   - keep plan `status: in-progress` while required independent review is
     pending; a passing implementation check is necessary but not completion;
   - update concepts or project index metadata only when the approved plan names
     those files; otherwise leave them for `/update-project`.
9. Apply the plan's acceptance contract. For a required review, use
   `fresh-review` with the plan path, changed-file list,
   verification commands and results. It must inspect the actual diff and
   report pass/fail plus blockers. Only after all steps/checks pass and required
   review blockers are resolved or explicitly deferred by the user, set plan
   `status: done`, refresh project `log.md` Current State (about 10 bullets
   maximum), and append one Build Log line (what shipped, deviations). If
   `log.md` now exceeds about 300 lines, move the oldest Build Log entries only
   to `archive/log-YYYY.md`; never archive Current State/Open Questions, and do
   not create archive scaffolding before entries move. Small non-blocking
   suggestions may be recorded as deferred.
   Escalate a critical unresolved decision with `deep-decision` and wait for
   the resulting human decision when scope or risk changes.

## Token Discipline

The plan replaces exploration. If you feel the urge to browse the repo "to
understand", the plan is under-specified: strict mode blocks immediately;
adaptive mode may use only the bounded read-only amendment procedure above.

## Resuming

If some steps are `done`/`blocked`, start at the first non-done step. Resume a
blocked step only when `resume_when:` is satisfied (including human amendment
approval), restore plan `status: in-progress`, and preserve completed work unless
a check fails.
