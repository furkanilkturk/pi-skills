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
`risk: low`; at most six files in one cohesive write set; exact deterministic
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

If the approved plan contains a `Parallel Execution Contract`, the parent owns
the shared plan/vault status and may emit one `metonia_delegate` call per step
in the current ready group in the same turn. Before launch it creates one
isolated worktree per writer from the recorded base commit and verifies that
the declared `Files:` sets do not overlap. Each child receives only its named
step/packet, uses that worktree as `cwd`, must not edit the shared plan or vault,
runs its step check, and returns `changed-files`, `commands-run`,
`residual-risks`, and `commit-sha`. A child failure blocks only its dependants;
unrelated successful work remains evidence, not permission to integrate early.

After every required writer passes, the named parent or writer integrator
combines commits into the declared target in the declared order and runs the
combined check. Any conflict or ownership overlap blocks integration unless the
approved contract already gives an exact resolution. Only then run the
read-only fresh reviewer against the integrated diff. A reviewer never creates
worktrees, merges commits, or resolves conflicts. Without this complete
contract, execute writes sequentially in one cwd.

After implementation evidence passes, use `fresh-review` with
`skill: "review-plan"` for required independent review with the plan path,
`reviewBase` set to the plan's approved base commit, commands/results,
plan-specific controls, residual risks, and only the exact plan-log event links
needed to prove the current execution. Never preload or paste the complete plan
`log.md`. The broker supplies the current
actual diff, changed-file list, clean state, and worktree list automatically;
do not spend parent tokens restating those generated artifacts. Keep the plan `in-progress` until required reviewer
blockers are resolved or explicitly deferred by the user. Execute directly in
the parent only when `metonia_delegate` is unavailable or the user explicitly
selects the parent session; record that exception in the plan.

## Workflow

1. Find the plan: the user gives a path, or list
   `wiki/projects/<Company>/<Project>/plans/*/index.md` and ask. A sibling
   `plans/<slug>.md` is a legacy collision and must be migrated before running.
   `plan_shape: archived` is closed historical evidence, not an executable
   package; do not load its recon/steps or resume it. New scope needs a new
   compact/packetized plan, while an incorrect lifecycle classification must be
   corrected explicitly before execution.
2. Read the compact plan index fully once, project `rules.md`, and only
   **Planning and Execution** and **Efficiency** in
   `wiki/projects/Work Context System.md`. Do not read anything else yet. Treat
   the prefix before `/wiki/projects/` in an absolute plan path as the vault
   root and resolve this policy file directly. Example:
   `C:/vault/wiki/projects/Acme/App/plans/x/index.md` maps to
   `C:/vault/wiki/projects/Work Context System.md`; preserve the full prefix
   through `/wiki/projects/` and never probe an ancestor or alternate path.
   Treat
   a missing `execution_mode` as `strict` for legacy plans. If the plan declares
   packets, load only the active packet; do not preload later packets, the
   complete reconnaissance history, or the plan `log.md`. The index's
   `Current Execution` section must contain enough state to resume. Read one
   exact linked log event only when that event is required to satisfy a resume,
   approval, retry, or review gate. `Relevant History` is the planner's bounded
   lineage summary; do not open its linked prior plans, decisions, lessons, or
   concepts unless the active packet names that exact artifact as an authorized
   read.
   For schema v2 verify `plan_schema`, `base_commit`, `risk`,
   `executor_profile`, and `review_profile` before changing files and honor each
   step's retry, idempotence, external-effect, and human-gate controls. A
   mismatch follows the plan/repo mismatch flow below.
3. Confirm the execution mode. `strict` is the default. `adaptive` is valid only
   when explicit user selection/approval is recorded in the plan `log.md` and
   linked from `Current Execution`;
   otherwise block and request that approval before implementation writes.
4. Set plan frontmatter `status: in-progress`.
5. For each step with `status: todo`, in order:
   - resolve its human gate once: when an exact plan-log approval already covers
     the bounded sequence and `Current Execution` links that event, treat the
     named actions as approved without asking again at every commit/push/build
     step. Approval never authorizes a retry, wider scope, or another external
     action;
   - set step `doing`;
   - load its packet when declared, then read only the files that packet/step names;
   - make exactly the change described, never making implementation writes
     outside `Files:`;
   - run the step's done-check;
   - pass → `done`; append the command/result evidence to plan `log.md`, then
     update only the bounded `Current Execution` snapshot in `index.md`;
     fail → allow no correction for `retry: never`, one same-scope
     deterministic correction for `retry: safe-once` (two total attempts), or
     two corrections for `retry: safe-twice` (three total attempts), only when
     `idempotent: true` and `external_effects: none|local-build`; keep the same
     worktree and canonical gates. If the scope, risk, dependency, write set,
     external effects, or selected correction limit changes, stop for approval. Otherwise
     set the step `status: blocked`, append the exact error/evidence to plan
     `log.md`, set plan `status: blocked` with `blocked_reason:` and
     `resume_when:`, link that event from `Current Execution`, then stop and
     report `METONIA_BLOCKED_STEP`, a short redacted `METONIA_BLOCKER`, and
     exact `METONIA_RESUME_WHEN`. Do not expose secrets, absolute paths, raw
     stderr, or stack traces in those human status fields.
   For an authorized parallel group, the parent applies this state machine to
   every meaningful ready member while each child is limited to its assigned
   step; read-only roles use no worktrees, while each writer gets one isolated
   worktree; the
   integration contract replaces only scheduling, never step checks or gates.
6. On a plan/repo mismatch:
   - **Strict:** do not explore or write off-plan. Block the step and plan with
     the mismatch and the condition needed to resume, then stop.
   - **Adaptive:** stop implementation writes. If security, privacy, or data-loss
     uncertainty is involved, do not inspect adjacent files or speculate; use
     the existing mismatch evidence only. Otherwise inspect read-only at most
   five directly related adjacent files or callers. Append
   `## Proposed Amendment — YYYY-MM-DD` to plan `log.md` with the
     affected step, evidence and inspected files, revised exact paths, revised
     checks, and ownership. Set the step/plan blocked with `blocked_reason:` and
     `resume_when:`, then wait for human approval. Only these plan control-record
     writes are allowed before approval.
   - After explicit approval, amend the current controls in `index.md`/the
     active packet, record approval in plan `log.md`, link that event from
     `Current Execution`, restore the step to `todo` and plan to `in-progress`,
     then resume.
7. Never skip or reorder steps. Adaptive changes the amendment procedure, not
   the permission to make off-plan writes.
   Do not create a new plan during execution merely to perform an already
   approved commit, push, build, review, or `update-project` closeout. Append
   evidence to the current plan log. A genuinely new scope returns to planning.
8. When all steps are done:
   - read only the project index's **Commands** section, then run its full
     verification (lint/check/test);
   - apply the completed-work metric and stop rules from canonical **Planning
     and Execution**;
   - fill the plan's Success Criteria checkboxes and update its bounded
     `Current Execution` snapshot;
   - keep plan `status: in-progress` while required independent review is
     pending; a passing implementation check is necessary but not completion;
   - do not update project `index.md`, `log.md`, `rules.md`, Knowledge Lens, or
     concepts. Those shared-vault writes belong only to `update-project`, even
     when the implementation plan names them as context.
9. Apply the plan's acceptance contract. For a required review, use
   `fresh-review` with `skill: "review-plan"`, the plan path, changed-file list,
   `reviewBase`, verification commands/results, and exact current plan-log event
   links only. It must inspect the broker's
   automatic actual diff and
   report pass/fail plus blockers. Only after all steps/checks pass and required
   review blockers are resolved or explicitly deferred by the user, set plan
   `status: done` and append one final plan-log event containing the final diff
   summary, verification result, review result, and deviations. Do not write any
   project or concept page from the coding executor.

   The parent must then run `update-project` exactly once as a separate
   `standard-write` closeout with `cwd` set to the Metonia vault root. Give it
   only the project path, completed plan path, final diff summary, review result,
   and exact final plan-log event; never the complete plan log. `update-project`
   owns the Build Log and every project/concept update. It still records the
   completed plan when no reusable learning exists, reports
   `Learning harvest: none`, and skips other project/concept writes.
   Escalate a critical unresolved decision with `deep-decision` and wait for
   the resulting human decision when scope or risk changes.

## Token Discipline

The plan replaces exploration. Do not load the plan's full `log.md` to recover
context; `Current Execution`, the active packet, and at most one exact linked
event are the resume packet. If you feel the urge to browse the repo "to
understand", the plan is under-specified: strict mode blocks immediately;
adaptive mode may use only the bounded read-only amendment procedure above.

Human-visible plan-log event headings use local `DD.MM.YYYY HH:mm — Title`
plus a stable `^event-YYYYMMDD-HHmm-slug` block ID. Keep frontmatter dates as
`YYYY-MM-DD` and never rename legacy event headings merely to normalize time;
existing resume/review links may target them.

## Resuming

If some steps are `done`/`blocked`, start at the first non-done step. Resume a
blocked step only when `resume_when:` is satisfied (including human amendment
approval), restore plan `status: in-progress`, and preserve completed work unless
a check fails.
