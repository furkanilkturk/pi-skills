---
name: metonia-orchestrator
description: Route Metonia work through the first-party metonia_delegate Pi tool by capability and a local provider profile. Use when a Metonia coding plan, repository lookup, fresh review, critical decision, document ingest, or video ingest should run in a fresh child without hard-coding a provider into durable skills. Do not use inside an already delegated child or for unrelated ad hoc delegation.
---

# Metonia Orchestrator

Use the repo-owned `metonia_delegate` Pi tool. It launches one fresh Pi child,
injects one Metonia skill, resolves a local provider/model profile, enforces a
writer lock and output contract, and appends a privacy-safe audit record. It has
no dependency on `pi-subagents` or another delegation package.

## Parent-only guard

Delegate only from the parent session. A child launched with a target skill
must do that work directly and must not load this skill or delegate again.

## Capability classification

Choose one capability before choosing a model:

| Capability | Use when |
|---|---|
| `efficient-read` | Bounded reconnaissance, metadata lookup, or source lookup; no writes. |
| `bounded-write` | Low-risk work with an exact write set of at most three files and deterministic checks. |
| `standard-write` | Larger, uncertain, technical, sensitive, or otherwise non-fast-lane coding implementation. |
| `bounded-learning` | One short, clean, high-confidence source or transcript. |
| `deep-learning` | Dense, long, multi-source, highly technical, or uncertain learning ingest. |
| `fresh-review` | Independent read-only inspection of the actual diff and evidence. |
| `deep-decision` | A bounded high-impact decision that ordinary execution must not guess. |

`bounded-write` is allowed only when risk is low, the base commit matches, all
effects are local, no human gate or sensitive domain is involved, and both the
write set and checks are exact. Any ambiguity or scope growth routes to
`standard-write`; it never grants broader scope.

`bounded-learning` requires one clean high-confidence source that is neither
dense nor highly technical. Any uncertainty routes to `deep-learning`. Learning
capabilities do not inherit coding review requirements.

## Resolve the route

Do not choose a provider or model in the prompt. `metonia_delegate` resolves
the chosen capability from `METONIA_ROUTING_CONFIG`, otherwise
`~/.pi/agent/metonia-routing.json`. Pass `profile` only when the user explicitly
selects a profile for this run. Otherwise the environment override or local
`active_profile` applies. With no local file, the built-in `portable` profile
inherits the parent model. If resolution fails, do not guess a provider/model.

## Launch contract

- Explicitly inject the target work skill because builtin agents do not inherit
  skills.
- Give the child an exact task, cwd, named inputs, boundaries, stop conditions,
  acceptance criteria, and evidence requirements.
- Supply `controls` for `bounded-write` or `bounded-learning`; the runtime
  rejects an ineligible fast-lane call instead of trusting the model's label.
- Allow only one writer in a cwd/worktree at a time.
- Use `efficient-read`, `fresh-review`, and `deep-decision` as read-only roles.
- Review is a workflow decision, not automatic: Quick and ordinary learning
  ingests may stop after deterministic evidence; Standard/Critical coding uses
  `fresh-review` when its plan requires it.
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

For review, pass the plan path, actual diff, commands/results, and residual
risks. For `deep-decision`, request a decision with alternatives, evidence,
tradeoffs, and the condition requiring human approval; do not let it mutate.
