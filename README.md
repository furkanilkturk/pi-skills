# pi-skills

Pi-native skills, delegation, and model routing for a Metonia vault.

This repository is the canonical Pi development and local-sync source. The
installed files under `~/.pi/agent` are a mirror. The public Metonia repository
ships the same first-party extension and provider-neutral skill contracts so
normal users can install Metonia without a second package. Provider names stay
outside durable vault plans and no third-party subagent package is required.

## Skill groups

### Coding and project context

| Skill | Purpose |
|---|---|
| `work-vault-context` | Route a coding task through durable project context. |
| `create-project` | Create context before a repository exists. |
| `add-project` | Inspect an existing repository and build its context pack. |
| `update-project` | Synchronize durable context after meaningful work. |
| `delete-project` | Archive or delete project context safely. |
| `create-plan` | Produce a Plan Schema v2 handoff for a fresh executor. |
| `execute-plan` | Execute exact steps with evidence, gates, and fresh review. |
| `review-plan` | Read-only post-execution review of the actual diff and plan controls. |
| `metonia-orchestrator` | Map work capabilities to a local profile and fresh child. |

### Obsidian learning

| Skill | Purpose |
|---|---|
| `doc-learning` | Turn documents, PDFs, articles, and lessons into vault memory. |
| `video-learning` | Turn videos and transcripts into lessons and living concepts. |

Learning workflows do not inherit the coding planner → executor → reviewer
chain. They launch one fresh vault writer with the selected learning skill
explicitly injected. Short clean sources use `bounded-learning`; dense,
uncertain, or highly technical sources use `deep-learning`.

Plan packages keep coding context bounded: `plans/<slug>/index.md` contains
only current controls and the resume snapshot, while `plans/<slug>/log.md`
stores append-only execution history. Executors load the index plus the active
packet; they read at most one exact linked log event when a gate requires it.
Reviewers receive the same bounded record instead of the complete historical
log.

Planning closes the knowledge loop without widening executor context.
`create-plan` performs one bounded lineage check and records zero to five exact
prior-plan, decision/lesson, or project-specific concept links under `Relevant
History`. Executors do not open those artifacts unless the active packet names
them. After reviewed work, a separate `update-project` closeout writes durable
project truth and reusable evidenced differences to the current project's
subsection on shared concept pages; coding workers never maintain concepts.

## First-party delegation runtime

`extensions/metonia-delegate` registers one synchronous Pi tool:
`metonia_delegate`. It is intentionally small and Metonia-specific:

- one fresh child process per call;
- one explicitly injected skill;
- provider-neutral capability routing over Pi's authenticated model catalog;
- truly read-only toolsets for reconnaissance/review/decision roles;
- a lightweight live widget for queued/running roles, selected models, and
  session completion/issue counts;
- a cross-process writer lock per cwd;
- required acceptance/evidence output; and
- a minimal local audit line in
  `$PI_CODING_AGENT_DIR/metonia-runs.jsonl` when configured (otherwise
  `~/.pi/agent/metonia-runs.jsonl`): task and cwd hashes, status, route
  metadata, and usage; never task text, absolute cwd, child stderr, or broker
  diagnostics.

Evidence labels are normalized for harmless underscore/space/hyphen variation,
while the child prompt prints the exact labels it must return. Failed runs expose
a short allowlisted reason such as `child-blocked`, `child-exit-nonzero`, or
`contract-missing-evidence` in the widget and audit record without persisting
private stderr. Fresh-review calls may set `reviewBase`; the broker then attaches
the actual base-to-HEAD diff, changed-file list, status, branch, and worktree list
instead of spending parent tokens restating Git evidence.

It uses Pi's own CLI and installed model/auth catalog. It does not depend on
`pi-subagents`, and it deliberately omits fleets, nested delegation, missions,
background jobs, inter-agent chat, and automatic worktree management.
The widget observes Pi's native parallel tool execution; it does not add a
scheduler and does not retain task text or working-directory paths in UI state.

The default `auto` broker asks Pi which models are available through the
current logins and selects the first capability-ranked candidate. It therefore
works across Codex, OpenCode Go, OpenCode/Claude, or any combination already
authenticated in Pi. If no ranked candidate is available—or catalog discovery
fails—it inherits the parent session model. The ranking is explicit policy,
not a claim that the runtime can measure model quality, quota, or billing health
live. A child model error fails closed with an authentication/quota diagnostic;
write-capable children are never retried automatically.

## Capability routing

| Capability | Work |
|---|---|
| `efficient-read` | Read-only reconnaissance and source lookup. |
| `bounded-write` | Exact low-risk write set of at most three files. |
| `standard-write` | Larger, uncertain, sensitive, or technical coding implementation. |
| `bounded-learning` | One short, clean, high-confidence learning source. |
| `deep-learning` | Dense, long, multi-source, technical, or uncertain ingest. |
| `fresh-review` | Independent read-only review of actual evidence. |
| `deep-decision` | Bounded high-impact decision analysis. |

Routes preserve role identity: `scout` for reconnaissance, `researcher` for
learning synthesis, `worker` for implementation, `reviewer` for independent
verification, and `oracle` for high-impact decisions. Pi executes multiple tool
calls from one model turn in parallel by default. The planner derives each wave
from the useful non-conflicting ready frontier rather than a fixed child count.
The cwd writer lock prevents competing writers. Vault-mutating skills use the
vault root as `cwd`, so different project repos still share one vault lock;
code executors retain their repo/worktree lock. Worktree count follows the
dynamic ready dependency frontier rather than a fixed number. Keep small work
sequential; use separate worktrees only for approved independent writers with
non-overlapping files, integration ownership, order, and combined verification.
Read-only roles never need a worktree, retry/correction remains in the same
writer worktree, and fresh review sees only the final integrated diff.

Durable plans and work skills mention capability and role only; provider/model
candidate policy is runtime-local configuration. `config/routing.example.json` ships
the automatic candidate policy plus `portable`, `codex`, `opencode-go`,
`claude`, and `mixed` manual profiles. An optional active copy lives at
`$PI_CODING_AGENT_DIR/metonia-routing.json` when set (otherwise
`~/.pi/agent/metonia-routing.json`). Edit candidate order or manual mappings
without changing vault plans or skill semantics.

`bounded-write` may run only when scope and checks are exact, the total write
set is at most three files, risk is low, effects are local, no human gate or
sensitive domain is involved, and the base commit matches. Ambiguity, a failed
safety check, or scope growth stops the run. Same-scope deterministic repairs
follow the plan's retry policy: `safe-once` permits one correction and
`safe-twice` two; both require idempotence, no external effect, the same writer
worktree, and the same canonical gates. Expansion or an exhausted limit waits
for approval.

## Install or synchronize

Clone the repository anywhere you control. To copy its skills and delegation
extension into Pi's user-global directories, then create or migrate the local
automatic routing config:

```powershell
pwsh ./scripts/sync-to-pi.ps1
pwsh ./scripts/configure-routing.ps1 -Profile auto
```

Pi can also install this repository directly. The built-in automatic broker
works without another package or a routing file:

```powershell
pi install https://github.com/furkanilkturk/pi-skills
```

Install either this package or `furkanilkturk/metonia`, never both: each
registers the same `metonia_delegate` tool. Metonia users should normally choose
the main repository; use this one for standalone Pi development or local sync.

Manual profiles are available for debugging, benchmarking, or an explicit
provider-only session; normal use does not require switching them:

```powershell
pwsh ./scripts/configure-routing.ps1 -Profile mixed
pwsh ./scripts/configure-routing.ps1 -Profile claude
```

For a one-off run, set `METONIA_ROUTING_PROFILE` or pass `profile` to
`metonia_delegate`; neither changes the local default.
Custom profile names are supported: add one to the local JSON, then pass its
name to `configure-routing.ps1 -Profile`.

Inspect recent privacy-safe delegation records:

```powershell
pwsh ./scripts/show-runs.ps1 -Count 20
```

Check for drift without writing:

```powershell
pwsh ./scripts/sync-to-pi.ps1 -Check
pwsh ./scripts/configure-routing.ps1 -Check
```

Override the destination when needed:

```powershell
pwsh ./scripts/sync-to-pi.ps1 -Destination /path/to/.pi/agent/skills
```

The sync script copies every file in the owned skill folders and the
`metonia-delegate` extension. It never deletes other installed resources.

Pi can alternatively load the repository directly:

```json
{
  "skills": ["/absolute/path/to/pi-skills/skills"],
  "extensions": ["/absolute/path/to/pi-skills/extensions/metonia-delegate/index.ts"]
}
```

Direct loading uses the built-in automatic candidate policy when no local
routing config exists. Create a local config only to customize candidate order
or use a manual profile.

Do not configure both direct loading and a second divergent copy. Choose one
canonical source and use `-Check` when keeping an installed mirror.

## Vault discovery

Skills resolve the vault through `METONIA_VAULT`. If it is absent, they ask for
the path. No machine-specific vault or company path is stored in this repo.

## Validation

Run the repository checks before publishing:

```powershell
pwsh ./scripts/test-skills.ps1
pwsh ./scripts/sync-to-pi.ps1 -Check
pwsh ./scripts/configure-routing.ps1 -Check
```

The first command validates skill identity/frontmatter, runtime safety
contracts, every profile/capability route, upstream manifest coverage, and an
isolated full-tree sync round trip. CI runs the same checks. These are contract
tests, not proof that a model mapping is good; use
[the live benchmark protocol](evals/benchmark.md) for quality, token, cost, and
latency evidence.

## Metonia upstream drift

`upstream-manifest.json` records the provider-neutral Metonia skill hashes on
which these Pi adaptations are based. Check a local Metonia clone with:

```powershell
pwsh ./scripts/check-metonia-drift.ps1 -MetoniaRoot /path/to/metonia
```

After reviewing and porting legitimate upstream changes, refresh the baseline
with `-Update`. CI checks the manifest against the public Metonia repository.

## Privacy

This repository contains workflow instructions only. Do not add credentials,
customer data, private vault content, machine-specific paths, or real project
names.
