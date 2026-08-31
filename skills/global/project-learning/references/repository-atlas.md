# Comprehensive repository discovery

Use this reference for `register-existing` and for a comprehensive
`propose-update`. The objective is complete structural coverage with selective
semantic reading: account for every tracked path, then inspect the evidence that
defines how each meaningful part of the repository works. Do not load every
source file into one model context.

## Create a deterministic inventory

Run `scripts/repository-inventory.mjs` against the repository and write its JSON
to a unique temporary path outside the repository. Delete that exact temporary
file after curation. The inventory is path and Git metadata, not proof of
runtime behavior.

Record these provenance fields in the repository atlas:

- full HEAD and tree IDs, clean/dirty state, tracked file and directory counts;
- inventory SHA-256 and the count of every category;
- governing instruction files, manifests, and configuration entry points.

Every tracked file must appear in exactly one inventory category. Treat an
uncategorized or unexpectedly large `other` bucket as a discovery task, not as
permission to ignore it. Never enumerate secrets or inspect `.env` values,
credentials, exports, payload dumps, dependency caches, build output, or Git
object contents. Paths may be inventoried; sensitive contents may not.

## Discover in bounded semantic passes

Use compact notes between passes. Prefer authoritative documents, composition
roots, representative implementations from each file family, and tests that
demonstrate the rule. A pass may inspect roughly 8–12 focused sources, then
summarize before continuing. Continue until the coverage ledger below is
complete; do not impose one arbitrary total-file cap on a large repository.

1. **Identity and governance:** remotes, root instructions, README, manifests,
   workspace layout, canonical docs, generated/vendor boundaries.
2. **Product and domain:** user outcomes, domain modules, entities, states,
   invariants, permissions, workflows, and cross-domain effects.
3. **Runtime and layers:** entry points, routes/APIs, client/server/shared
   boundaries, data flow, dependency direction, background processes.
4. **Engineering contracts:** important libraries and patterns, required
   helpers/imports, file placement, error/result conventions, prohibited
   alternatives, and their verification tests.
5. **Delivery and operations:** build/typecheck/lint/test commands, CI,
   deployment topology, migrations, environment variable names only, storage,
   authentication, email/push, offline/realtime behavior, observability, and
   release gates.
6. **Change routing and freshness:** map common task types to the docs, folders,
   entry points, tests, and context notes a future agent should load.

For each inventory category mark one of:

- `covered` with the durable note and evidence paths that explain it;
- `generated` or `vendor` with the boundary and reason;
- `not-applicable` with a concrete reason;
- `open-question` when evidence conflicts or remains insufficient.

No nonempty category may disappear from the ledger. Inspect subtrees separately
when a category spans different responsibilities.

## Produce a layered context set

A mature repository (more than 100 tracked files or more than eight nonempty
categories) normally needs all four notes below. A smaller repository may merge
them when the same information remains easy to target. Keep each note concise,
usually 12–16 KiB maximum, and link it from `Project.md` under `## Context index`
with `Note | Load when | Sensitivity | Max bytes`.

### Repository Atlas.md

Include inventory provenance, top-level and semantic folder ownership,
composition roots, generated/vendor boundaries, file-family counts, the
coverage ledger, and a task-routing table:

```text
Task type | Read first | Likely folders/entry points | Verification
```

This note proves coverage and tells an agent where to look. It must not copy the
full inventory or pretend that a folder count explains behavior.

### Engineering Contracts.md

For every important package or repeated pattern record:

```text
Contract | Used for | Required helper/import | Belongs in | Do not | Evidence/test
```

Include only rules supported by accepted authority or current evidence. If Zod,
Drizzle, Railway Oriented Programming, a result type, validation boundary, query
helper, event mechanism, or equivalent is used, document the concrete local
convention—not merely the dependency name.

### Product and Domain Map.md

Record bounded domains, important entities and states, business invariants,
authorization/tenancy boundaries, and the route/API → application operation →
data/schema ownership chain. Note cross-domain side effects and the tests or
canonical docs that establish them. Distinguish current behavior from intended
plans.

### Delivery and Operations.md

Record runtime/deployment topology, supported environments, environment variable
names without values, build and quality commands, CI/release gates, database and
migration flow, authentication, storage, email/push, offline/PWA/realtime
behavior, observability, backups, and operational constraints. Mark absent or
unknown capabilities explicitly rather than inventing them.

## Keep normal coding context lean

`Project.md` remains the always-loaded capsule. It should state only the outcome,
authority, architecture invariants, highest-leverage engineering contracts,
security gates, and active decisions. The four detailed notes are retrieved by
their `Load when` descriptions for matching tasks. A future agent should not pay
the token cost of database, deployment, or UI detail when its task does not need
that material.

The full inventory is disposable discovery evidence. Persist only its hash,
counts, coverage ledger, meaningful folder map, and evidence paths. Do not store
an exhaustive file list, source dumps, test counts, or generated summaries that
cannot guide a future change.

## Update selectively

On `propose-update`, rerun the inventory and compare HEAD, tree, inventory hash,
category counts, governing files, and changed paths with the recorded
provenance. Reinspect only affected semantic passes plus any dependent contract.
Update the capsule or indexed notes only when durable behavior changed. A dirty
working tree is evidence to refresh the proposal, never a source of accepted
facts by itself.
