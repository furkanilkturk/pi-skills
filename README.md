# pi-skills

Pi-specific skills and model routing for a Metonia vault.

This private repository is the canonical Pi deployment source. The installed
files under `~/.pi/agent/skills` are a mirror. The public Metonia repository may
ship provider-neutral copies; this repository adds Pi subagent roles, concrete
model routing, and local ownership rules without putting provider names into
durable vault plans.

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

### Obsidian learning

| Skill | Purpose |
|---|---|
| `doc-learning` | Turn documents, PDFs, articles, and lessons into vault memory. |
| `video-learning` | Turn videos and transcripts into lessons and living concepts. |

Learning workflows do not inherit the coding planner → executor → reviewer
chain. They launch one fresh vault writer with the selected learning skill
explicitly injected. Short clean sources use Luna/medium; dense, uncertain, or
highly technical sources use Terra/medium.

## Coding model routing

| Work | Pi route |
|---|---|
| Read-only reconnaissance | `scout` / `researcher` — Luna low |
| Quick one-file implementation | `worker` — Luna medium per-run override |
| Bounded low-risk Standard implementation | `worker` — Luna medium; fresh Terra review |
| Standard implementation and review | `worker` / `reviewer` — Terra medium |
| Critical bounded decision | `oracle` — Sol high |

The configured `worker` remains Terra/medium. Skills use Pi's higher-precedence
per-run model override only when Luna fast-lane conditions hold. This avoids a
second custom agent while preserving the builtin worker's tools and acceptance
behavior.

Luna may write only when scope and checks are exact, the total write set is at
most three files, risk is low, effects are local, no human gate or sensitive
domain is involved, and the base commit matches. Ambiguity, an unexpected
dependency, a failed safety check, or an expanding write set stops the run. A
Luna-to-Terra retry is allowed only when the plan declares `retry: safe-once`
and `idempotent: true`, and it consumes that single retry.

## Install or synchronize

Clone the repository anywhere you control. To copy its nine skills into Pi's
user-global skill directory:

```powershell
pwsh ./scripts/sync-to-pi.ps1
```

Check for drift without writing:

```powershell
pwsh ./scripts/sync-to-pi.ps1 -Check
```

Override the destination when needed:

```powershell
pwsh ./scripts/sync-to-pi.ps1 -Destination /path/to/.pi/agent/skills
```

The script copies every file in this repository's nine owned skill folders, so
future `references/`, `scripts/`, and assets are included. It never deletes
other installed skill folders. Extra files already present inside an owned
destination folder are left in place.

Pi can alternatively load the repository directly:

```json
{
  "skills": ["/absolute/path/to/pi-skills/skills"]
}
```

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
```

The first command validates skill identity/frontmatter, routing contracts,
upstream manifest coverage, and an isolated full-tree sync round trip. CI runs
the same checks. These are contract tests, not proof that one model will solve
every eligible task; use [the live benchmark protocol](evals/benchmark.md) for
quality, token, cost, and latency evidence.

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
