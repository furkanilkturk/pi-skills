# pi-skills

Pi-native skills, delegation, and model routing for a Metonia vault.

This private repository is the canonical Pi deployment source. The installed
files under `~/.pi/agent` are a mirror. The public Metonia repository may ship
provider-neutral skill copies; this repository adds a small first-party Pi
delegation extension and local routing profiles without putting provider names
into durable vault plans or requiring a third-party subagent package.

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

## First-party delegation runtime

`extensions/metonia-delegate` registers one synchronous Pi tool:
`metonia_delegate`. It is intentionally small and Metonia-specific:

- one fresh child process per call;
- one explicitly injected skill;
- provider-neutral capability routing;
- truly read-only toolsets for reconnaissance/review/decision roles;
- a cross-process writer lock per cwd;
- required acceptance/evidence output; and
- a privacy-safe audit line in `~/.pi/agent/metonia-runs.jsonl` (task hash, not
  task text).

It uses Pi's own CLI and installed model/auth catalog. It does not depend on
`pi-subagents`, and it deliberately omits fleets, nested delegation, missions,
background jobs, inter-agent chat, and automatic worktree management.

With no local routing file, the built-in `portable` profile inherits the
parent session model. That makes the package provider-neutral and immediately
usable; configured profiles add cost/quality specialization.

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

Durable skills mention capabilities only. `config/routing.example.json` ships
starter `portable`, `codex`, `opencode-go`, `claude`, and `mixed` profiles; an
optional active copy lives at `~/.pi/agent/metonia-routing.json`. Edit or
replace those mappings without changing vault plans or skill semantics.

`bounded-write` may run only when scope and checks are exact, the total write
set is at most three files, risk is low, effects are local, no human gate or
sensitive domain is involved, and the base commit matches. Ambiguity, a failed
safety check, or scope growth stops the run. A bounded-to-standard retry is
allowed only when the plan declares `retry: safe-once` and `idempotent: true`.

## Install or synchronize

Clone the repository anywhere you control. To copy its skills and delegation
extension into Pi's user-global directories, then create the local routing
config:

```powershell
pwsh ./scripts/sync-to-pi.ps1
pwsh ./scripts/configure-routing.ps1 -Profile codex
```

Pi can also install this repository directly; the provider-neutral `portable`
profile works without another package or a routing file:

```powershell
pi install https://github.com/furkanilkturk/pi-skills
```

Switch profiles without editing skills:

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

Direct loading uses `portable` when no local routing config exists. Create a
local config only when you want specialized model mappings.

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
