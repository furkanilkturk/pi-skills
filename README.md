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
chain. They use one vault writer, source links, confidence labels, and spot
checks. Short clean sources can use Luna/medium; dense or highly technical
sources use Terra/medium.

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

The script copies only this repository's `SKILL.md` files and never deletes
other installed skills.

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

Each skill is a self-contained folder with YAML frontmatter and a `SKILL.md`.
Before publishing changes, validate all skill folders and confirm the installed
mirror is synchronized.

## Privacy

This repository contains workflow instructions only. Do not add credentials,
customer data, private vault content, machine-specific paths, or real project
names.
