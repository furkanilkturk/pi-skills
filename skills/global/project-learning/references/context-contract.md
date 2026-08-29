# Software project context contract

Use this reference only while registering or curating a software repository.
The goal is a small, decision-useful context capsule backed by repository
evidence—not a package inventory, copied manual, or full architecture audit.

## Classify authority before extracting

Read narrowly, expanding only when evidence requires it:

1. User-approved Metonia decisions and explicit current requirements are
   accepted intent.
2. Repository `AGENTS.md` and documents it names canonical are normative rules.
3. Current configuration, representative implementation, and tests describe
   as-is behavior.
4. Roadmaps, plans, audits, TODOs, and old verification snapshots describe
   intended or historical state unless current authority says otherwise.
5. Manifests prove a dependency exists, not how or whether production code
   should use it.

Record evidence with short repository-relative paths and, when useful, the
verified commit. If code and an old plan differ but authority already establishes
which wins, record documentation drift as an improvement instead of asking a
fake architecture question.

## Bound the registration scan

Registration is context curation, not an unlimited engineering audit. Inspect
Git remotes, HEAD and dirty-path summary; the nearest `AGENTS.md`; README; one
manifest/config entry point; up to three documents that the governing
instructions identify as relevant; and targeted implementation/tests. Stop at
eight source files or about 12K source tokens. If that is insufficient, finish
the identity mapping and propose a separate focused audit.

Do not inspect `.env` files, credentials, customer exports, incident payloads,
or unrelated private material. Record `sensitivity` (`public`, `internal`, or
`restricted`) without embedding a provider name in the note. Do not send
internal/restricted evidence to a child agent unless the user has explicitly
allowed that provider/model. A single-project observation becomes company
policy only through explicit cross-project approval.

## Build the always-loaded capsule

`Project.md` and `Company.md` may contain a `## Context capsule` section. The
default `metonia_context` coding profile loads that section instead of the full
note. Keep it independently understandable and high leverage:

- outcome and explicit non-goals that change implementation choices;
- authority order and owner/escalation boundary;
- architectural invariants and prohibited approaches;
- engineering contracts: for each important library or pattern say **what it is
  used for, where it belongs, the required entry point/helper, and what not to
  do**;
- security/approval gates and required verification;
- only active decisions or improvements that can change the next task.

Prefer one sentence per contract and roughly 5–8 project-specific bullets. Do
not include semver inventories, exhaustive routes, transient milestones, current
test counts, or prose already available in the repository. If examples,
tradeoffs, or evidence would crowd the capsule, put them in one focused note
under `Context/` and add it to the `## Context index` as `Note | Load when |
Sensitivity | Max bytes`. Do not create empty topic-note directories.

Project frontmatter should record `context_schema`, `sensitivity`, and the full
`verified_commit` used for engineering evidence. Freshness metadata is not an
engineering claim: a later `ahead` or `dirty` result is a targeted review signal,
not permission to inject a diff or rewrite the capsule automatically.

## Detect and question pattern conflicts

A pattern conflict is material only when competing choices affect architecture,
security, data integrity, operability, or repeated implementation work and no
accepted authority resolves it. For each candidate show:

- the two or more concrete observations and their evidence;
- why the difference matters;
- 2–3 viable choices, one evidence-based recommendation, and the consequence of
  each;
- an option to defer when a decision is not needed now.

Ask one dependent conflict at a time, highest consequence first. A clear stale
path, completed plan step, or isolated code smell is an improvement finding, not
a forced user question. Ask at most one pattern-triage question during ordinary
registration; offer a separate audit if more than three material candidates
exist. Across registration ask no more than four decision questions plus one
dependent follow-up. Registration never repairs the repository.

## Record decisions and improvements compactly

Use `## Decisions and improvement queue` in the owning page. Keep a short table
with stable local IDs:

```text
ID | State | Decision or improvement | Evidence | Planning trigger
```

States are `accepted-constraint`, `accepted-debt`, `open-question`, `deferred`,
`rejected-alternative`, or `superseded`.
Deduplicate by scope plus normalized topic. The same conclusion adds evidence or
freshness; a different accepted conclusion requires explicit supersession. Keep
only current/high-impact rows in the capsule-bearing page. Link a separate
Decision note when rationale or history is consequential; link a focused Context
note when a planner needs detail. Never turn an ordinary task checklist into the
queue.

An answered onboarding question becomes an accepted constraint/debt or rejected
alternative row. A deferred answer becomes an open question/deferred row with a
concrete planning trigger. Rejected alternatives require rationale and a review
trigger. Observed drift or suspicion cannot become an authoritative rule without
approval. Later plans must cite the relevant ID, honor accepted outcomes, and
may schedule open improvements without silently deciding them.

## Check freshness

Store evidence provenance separately from transient status. A verified commit
may be useful, but never claim that historical passing tests are current. Mark a
capsule stale when its repository identity, governing rules, architecture,
security boundary, deployment topology, or accepted decisions materially change.
Before writing an approved proposal, recompute the repository HEAD, dirty-path
summary, and hashes of each target note. Any change invalidates the preview and
requires a refreshed proposal.
