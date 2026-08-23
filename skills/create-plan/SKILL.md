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

## Capability Profiles and Fresh Handoff

This is a coding planner/orchestrator skill. The capable parent session authors
and challenges the plan; it does not implement later work merely because it
knows the answer. Children start fresh and receive only the approved plan and
the files it names. `metonia-orchestrator` maps capabilities to local models.

Map the canonical task mode to Pi by capability:

- **Quick:** normally needs no formal plan. Use `bounded-write` for a
  mechanical, low-risk, reversible change that stays in one file and has an
  exact check.
- **Bounded low-risk Standard:** `bounded-write` may execute when the plan has an
  exact write set of at most three files, no architecture/auth/security/data
  migration/concurrency decision, no external effect beyond `none` or
  `local-build`, no human gate, and deterministic checks. `fresh-review` is
  still required.
- **Standard:** use `standard-write` and required `fresh-review`.
- **Critical:** use `standard-write` and `fresh-review`. Use `deep-decision`
  only for a bounded critical question with alternatives, risks, and acceptance
  criteria.

Use `efficient-read` only for bounded read-only evidence. A
model route never broadens scope. Any ambiguity, plan/repo mismatch, unexpected
dependency, failed safety check, or expanding write set removes bounded-write
eligibility; stop and return evidence instead of exploring.

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
4. Create the directory `wiki/projects/<Company>/<Project>/plans/<slug>/` and
   write its `index.md` plus `log.md` from
   `wiki/projects/_templates/Plan Template.md`. Set `plan_schema: 2`, a
   non-empty `base_commit` (or `no-repo`), `risk`, provider-neutral
   `executor_profile` and `review_profile`, and `execution_mode: strict`.
   Use `adaptive` only after explicit user selection or approval and record that
   approval in the plan `log.md`. The Pi host maps an eligible executor through
   its local routing profile; keep model or provider names out of the plan.
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
- **Failure path** — classify every retry as `safe-once`, `safe-twice`, or
  `never` and state idempotence. `safe-once` permits one same-scope deterministic
  correction (two total attempts); `safe-twice` permits two corrections (three
  total attempts). Corrections stay in the same worktree, require
  `idempotent: true`, and have no external effect. Use `never`
  for deploys, submissions, billing, destructive data operations, and other
  external effects. No human approval is needed for those same-scope repairs;
  scope/risk/dependency/write-set/external-effect expansion or exhausting the
  selected correction limit requires approval. Otherwise mark blocked and stop;
  never improvise scope.
- **Acceptance contract** — name the required commands, expected result, and
  whether a fresh `reviewer` must inspect the final diff. Completion means the
  checks pass and required review findings are resolved or explicitly deferred
  by the user; it never means merely that files were edited.
- **Execution boundary** — strict plans block on any mismatch without off-plan
  exploration or writes. Adaptive plans still forbid off-plan implementation
  writes and use only the controlled amendment flow in the template.
- **Plan directory** — every plan is `plans/<slug>/index.md`; never create a
  sibling `plans/<slug>.md`. Keep current controls and the active-step summary
  in `index.md`; append execution evidence, approvals, deviations, and review
  results to `plans/<slug>/log.md`. Put shared reconnaissance in `recon.md` and
  executable work in `steps/<nn>-<slug>.md`. Do not copy historical log entries
  back into the index or packets.
- **Step packets** — create only the packets the dependency frontier requires.
  Keep the index compact: its `Current Execution` section names the active
  step, next action, last verified HEAD, and one exact `log.md` event link.
  Load only the active packet. Repeat exact reads,
  files, checks, retry, idempotence, external effects, and human gates in every
  packet; do not duplicate the reconnaissance narrative.
- **Optional parallel groups** — sequential is the default. Derive a group from
  the dynamic ready dependency frontier only when meaningful independent writer
  work will materially shorten execution. Read-only roles need no worktree.
  Add a `Parallel Execution Contract` that groups exact step numbers, names
  their completed dependencies, requires one isolated worktree per writer and
  non-overlapping `Files:` per step, and
  records the integration owner, target, order, conflict policy (`block`), and
  combined check. Do not create a group for trivial work or merely to use more
  agents.
- There is no fixed step count. Use as many bounded, verifiable steps as the
  accepted goal needs. Use packets to keep the active context small; split into
  multiple plans only when the work has genuinely separate acceptance,
  release, or human-approval boundaries.

## Routing and Review

- Include scout evidence paths in the plan instead of copying a conversational
  summary.
- Route only an eligible Quick or bounded low-risk Standard write to
  `bounded-write`. Give it the approved plan or
  task contract, exact write set, stop conditions, and checks.
- Route every other Standard or Critical implementation to the default
  `standard-write`. One child owns a write set or worktree at a time.
- Derive parallelism from the dynamic ready dependency frontier, not a fixed
  child count. Parallel writers require isolated worktrees, non-overlapping `Files:`,
  and a plan-owned integration contract naming the target, owner, order,
  conflict policy, and combined check. Otherwise keep writes sequential.
- Quick needs no independent review unless stricter project rules require it;
  fresh review, when required, inspects only the final integrated diff.
  Standard and Critical require `fresh-review` that inspects
  the actual diff, controls, and validation evidence without editing.
- Escalate an unresolved critical decision with `deep-decision` rather than
  asking a worker to invent scope.

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
