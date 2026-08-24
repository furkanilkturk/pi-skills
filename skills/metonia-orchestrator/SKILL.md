---
name: metonia-orchestrator
description: Route Metonia work through the first-party metonia_delegate Pi tool by capability and Pi's authenticated model catalog. Use when a Metonia coding plan, repository lookup, fresh review, critical decision, document ingest, or video ingest should run in a fresh child without hard-coding a provider into durable skills. Do not use inside an already delegated child or for unrelated ad hoc delegation.
---

# Metonia Orchestrator

Use the repo-owned `metonia_delegate` Pi tool. It launches one fresh Pi child,
injects one Metonia skill, selects an authenticated model, enforces a
writer lock and output contract, and appends a minimal local audit record. It has
no dependency on `pi-subagents` or another delegation package.

## Parent-only guard

Delegate only from the parent session. A child launched with a target skill
must do that work directly and must not load this skill or delegate again.

## Capability classification

Choose one capability before choosing a model:

| Capability | Use when |
|---|---|
| `efficient-read` | Bounded reconnaissance, metadata lookup, or source lookup; no writes. |
| `bounded-write` | Low-risk work with one cohesive exact write set of at most six files and deterministic checks. |
| `standard-write` | Larger, uncertain, technical, sensitive, or otherwise non-fast-lane coding implementation. |
| `bounded-learning` | One short, clean, high-confidence source or transcript. |
| `deep-learning` | Dense, long, multi-source, highly technical, or uncertain learning ingest. |
| `fresh-review` | Independent read-only inspection of the actual diff and evidence. |
| `deep-decision` | A bounded high-impact decision that ordinary execution must not guess. |

The role identity remains explicit after routing: reconnaissance uses `scout`,
learning/source synthesis uses `researcher`, implementation uses `worker`,
independent verification uses `reviewer`, and high-impact judgment uses
`oracle`. Include the intended capability in the task; do not collapse these
roles into a generic subagent.

`bounded-write` is allowed only when risk is low, the base commit matches, all
effects are local, no human gate or sensitive domain is involved, and both the
write set and checks are exact. Any ambiguity or scope growth routes to
`standard-write`; it never grants broader scope.

Classify the work that will actually execute, not the size of its surrounding
project or the existence of a plan. Test bounded-write eligibility first; do
not choose `standard-write` merely because the task writes vault files, follows
a plan, or belongs to a Critical workflow. Critical changes gate strength, not
implementation complexity. A known low-risk closeout such as an exact
`update-project` edit may use bounded-write; commit, push, build, deployment, or
another external effect remains standard-write.

The capable parent owns `create-plan` authorship. It may delegate bounded
read-only evidence collection or a deep decision, but it must select, compress,
and write the final plan itself. Do not delegate plan prose to a worker: that
loses the strong-planner/cheap-executor split and encourages scaffolding. When
the request is only an already-approved plan's commit/push/build/review/closeout,
reuse its log and do not create a release-successor plan.

The runtime enforces the first-party skill/capability matrix. In particular,
`review-plan` is read-only `fresh-review`, `execute-plan` is only a
bounded/standard writer, learning skills use learning capabilities, and
`update-project` may use bounded or standard write. `create-plan` and this
orchestrator are parent-owned and cannot be delegated. Treat a rejected pairing
as a caller bug; do not retry it with a more expensive capability.

`bounded-learning` requires one clean high-confidence source that is neither
dense nor highly technical. Any uncertainty routes to `deep-learning`. Learning
capabilities do not inherit coding review requirements.

## Resolve the route

Do not choose a provider or model in the prompt. By default,
`metonia_delegate` asks Pi for the models available through the current logins,
then selects the first available candidate ranked for the capability. If no
candidate is available or discovery fails, it inherits the parent model. This
ranking is an explicit policy, not a live quality judgment.

Pass `profile` only when the user explicitly requests a manual override for the
run. `METONIA_ROUTING_PROFILE` and the local `active_profile` are lower-priority
overrides. Provider-specific mappings live in `METONIA_ROUTING_CONFIG` or
`$PI_CODING_AGENT_DIR/metonia-routing.json` when configured (otherwise
`~/.pi/agent/metonia-routing.json`), never in durable plans or work skills.

## Launch contract

- Explicitly inject the target work skill because builtin agents do not inherit
  skills.
- Give the child an exact task, cwd, named inputs, boundaries, stop conditions,
  acceptance criteria, and evidence requirements.
- A blocked child must return `METONIA_BLOCKED_STEP`, a short redacted
  `METONIA_BLOCKER`, and exact `METONIA_RESUME_WHEN` in addition to its
  evidence. These fields are the human status surface; never put secrets,
  absolute paths, stderr, or stack traces in them.
- Supply `controls` for `bounded-write` or `bounded-learning`; the runtime
  rejects an ineligible fast-lane call instead of trusting the model's label.
- Allow only one writer in a cwd/worktree at a time. Vault-mutating skills must
  use the Metonia vault root as `cwd`; the runtime rejects another cwd and keys
  their shared writer lock from that root. Code executors keep the repo/worktree
  cwd. Read-only roles never need a worktree; a retry/correction stays in the
  same writer worktree.
- Same-scope deterministic repairs follow the plan's retry policy: `safe-once`
  allows one correction, `safe-twice` allows two, and `never` allows none.
  Repairs require idempotence, no external effect, the same writer worktree,
  and the same canonical gates. Scope/risk/dependency/write-set/effect
  expansion or limit exhaustion stops for approval.
- Read-only discovery/preflight may use `safe-once` or `safe-twice`; a local
  idempotent edit/check may use `safe-once`. The actual submission, deployment,
  billed build invocation, destructive operation, or other external mutation
  always uses `never`. If a writer ends with `mutation-unconfirmed`, inspect
  the named local and external state before another call. Never interpret a
  transport, model, timeout, or output-contract failure as proof that an
  external mutation did not happen.
- Only one parent session may own shared vault planning/status/closeout writes
  at a time. Executor children never edit plan or project notes; they return
  evidence to that parent, which re-reads the target immediately before its
  small state update. Vault-writing delegated skills continue to use the
  runtime's vault-root lock.
- Before delegating, identify the dynamic ready dependency frontier: useful tasks whose
  dependencies are satisfied and whose reads or write sets do not conflict.
  Derive the wave size from that frontier; there is no fixed agent count. Emit
  independent read-only scout/research/review calls in the same turn; Pi runs
  the tool calls in parallel by default. Do not create duplicate or speculative
  tasks merely to increase concurrency. Split a wave when its cost/rate budget
  or one very slow task would dominate the batch.
- Keep small work sequential. Do not parallelize writers against the same cwd.
  Separate worktrees may run independently only when the approved plan gives each writer a non-overlapping
  write set and names the merge boundary, integration owner, integration order,
  and combined verification. The parent or a named writer integrates; the
  read-only reviewer never merges or resolves conflicts.
- Use `efficient-read`, `fresh-review`, and `deep-decision` as read-only roles.
- Review is a workflow decision, not automatic: Quick and ordinary learning
  ingests may stop after deterministic evidence; Standard/Critical coding uses
  `fresh-review` with `skill: "review-plan"` when its plan requires it. Review
  only the final integrated diff; do not review isolated writer diffs as a
  substitute for integration review.
- If `metonia_delegate` is unavailable, run in the current session and report
  the routing exception.

Use this call shape:

```js
{
  capability: "<CAPABILITY>",
  task: "<EXACT_TASK_AND_BOUNDARIES>",
  skill: "<INSTALLED_TARGET_SKILL>",
  cwd: "<ABSOLUTE_CWD>",
  criteria: ["<PASS_CONDITION>"],
  evidence: ["<NAMED_EVIDENCE>"]
}
```

For review, explicitly inject `review-plan`, set `reviewBase` to the approved
plan base commit, and pass the plan path, commands/results, execution controls,
and residual risks. The broker then attaches a read-only snapshot containing
the resolved base/HEAD, branch, clean state, changed-file list, actual diff,
and worktree list. Do not duplicate that generated Git material in `task`, but
do include verification output and plan-specific setup/gate evidence that Git
cannot infer. For `deep-decision`, request a decision with alternatives, evidence,
tradeoffs, and the condition requiring human approval; do not let it mutate.

Use `/metonia-status` to reopen the current session's active and four most
recent runs, including structured blocker and resume details. Human-facing
runtime times use local `DD.MM.YYYY HH:mm`; audit JSON remains ISO UTC.
The recent-run surface is session-local; after restarting Pi, use the
content-minimized audit file for counts and routing diagnostics, not task text.
