# Metonia Pi Kit

Scoped knowledge skills and small Pi extensions for the
[Metonia](https://github.com/furkanilkturk/metonia) Obsidian system.

Metonia treats a focused folder as an **agent space**: `AGENTS.md` describes the
space, while `.agents/skills/` contains only the capabilities that belong there.
Opening Pi from a coding repository therefore does not load document-learning or
video-production skills. Pi resolves this from its working directory, not from
the file currently selected in Obsidian.

## What is included

| Resource | Purpose | Loaded by the Pi package? |
| --- | --- | --- |
| `learning` pack | Documents and existing videos → source-backed knowledge | No |
| `work` pack | Durable project planning inside the Work space | No |
| `video` pack | Research, concept development, and review | No |
| `task_agents` | Isolated, bounded subagent dispatch with metadata-based model routing | Yes |
| `metonia_context` | Resolve an external Git repository to its Company and Project notes | Yes |
| `metonia_interview` | Bundled selectable TUI for consequential decisions | Yes |
| `metonia-interview` | Small workflow that decides when and how to interview | Yes |
| `metonia-context` | Navigate agent spaces and durable-knowledge boundaries | Yes |
| `project-learning` | Register projects and curate Company/Project knowledge from any repository | Yes |

The three cross-cutting skills are package-global. Their descriptions are
discoverable, while full instructions are loaded only when invoked. The six
domain skills remain in their owning agent spaces, so learning, video, and
planning instructions do not consume every coding session's context.

## Install the Pi extensions

Review third-party extension code before installation: Pi extensions run with
your local user's permissions.

```bash
pi install git:github.com/furkanilkturk/pi-skills
```

The package installs three extensions and three global skills. It does not
change model or authentication settings.
The selectable interview is bundled and uses Pi's own UI API; users do not need
to install another package. In non-interactive runs, the skill falls back to a
concise chat question instead of pretending a selector is available.

## See the current context

Run `/metonia` in Pi. It shows the current agent space, every active skill
command, and the Metonia tools available in that session. Typical discovery is:

| Pi working directory | Scoped skills added to the three global skills |
| --- | --- |
| External coding repository or vault root | None |
| `Learning/` or a descendant | `doc-learning`, `video-learning` |
| `Work/` or a company/project descendant | `project-planning` |
| `Studio/Video/` or a descendant | `video-research`, `video-concept`, `video-review` |

Use `/skill:metonia-interview` for the Metonia-specific selectable interview
and `/agents` for the subagent run dashboard.

## Install a scoped skill pack

Pass the destination `.agents/skills` directory explicitly:

```bash
node scripts/install-pack.mjs --pack learning --target /path/to/vault/Learning/.agents/skills
node scripts/install-pack.mjs --pack work --target /path/to/vault/Work/.agents/skills
node scripts/install-pack.mjs --pack video --target /path/to/vault/Studio/Video/.agents/skills
```

To vendor all three packs into a Metonia template:

```bash
node scripts/sync-metonia.mjs --template /path/to/metonia/template
```

Only the six named domain skill directories are replaced. Unrelated skills in
the target are preserved. Updating the Work pack removes the retired scoped
`project-learning` copy because that skill is now package-global. The installer
rejects targets that do not end in `.agents/skills`.

## Company and project context from coding repositories

Set `METONIA_VAULT` to the vault or template root. A `Project.md` declares its
canonical Git remote in frontmatter:

```yaml
---
type: project
repository: https://github.com/acme/payments-api.git
---
```

`metonia_context` normalizes the current repository's configured remotes,
requires exactly one matching `Project.md`, and returns only that project and
its parent `Company.md`. The Markdown is explicitly marked as contextual data,
not as agent instructions, and absolute vault paths are omitted from the
model-visible result. Symlink/junction roots and index paths are rejected.
Unknown and ambiguous matches are errors.

From any Git repository, invoke `/skill:project-learning register-existing` or
`register-new` to propose its Metonia company/project mapping. After verified
changes, invoke `/skill:project-learning propose-update`. The skill never
modifies the repository and writes durable vault knowledge only after the
company, project, remote, target paths, and exact changes are approved.

**Privacy:** invoking `metonia_context`, or setting
`includeMetoniaContext: true` on `task_agents`, sends the matched notes to the
selected model provider. Context injection is never automatic. A delegated task
that requests it must also declare an exact `model`, ordered `modelCandidates`,
`allowedProviders`, or `allowedModels` trust policy; authentication alone does
not make a provider appropriate for private company data.

You can inspect the same result outside Pi:

```bash
node scripts/resolve-context.mjs --vault /path/to/vault --cwd /path/to/repository
```

`METONIA_VAULT` only identifies the index. It does not enable context injection.

## Task agents

`task_agents` accepts one task or a queued parallel list. Every child is a
separate `pi --mode json --no-session` process. The default concurrency ceiling
is derived from logical CPUs and memory; set `METONIA_AGENT_MAX_CONCURRENCY` and
`METONIA_AGENT_MAX_TASKS` to intentional positive bounds. This is local resource
control, not a claim about provider capacity.

The parent remains the default execution owner. It should delegate only when
parallelism, context isolation, specialization, cost, or independent
verification outweighs process and handoff overhead. A short or tightly coupled
task stays with the parent. A clear low-risk task may go directly to one
efficient child; there is no mandatory planner-builder-reviewer pipeline and no
automatic retry or review-repair loop.

Make delegated work independently verifiable with `deliverable`,
`acceptanceCriteria`, and `constraints`. For example, a well-specified isolated
task can use `complexity: "light"` with `priority: "cost"` without paying for a
planning stage. Selection modes are:

- `light`: favor the lowest static price among models that fit the estimated context;
- `standard`: favor an eligible reasoning-capable model, then static efficiency;
- `deep`: require reasoning when available and retain the eligible current model
  for `quality` unless an intentional model policy is supplied.

Context window and maximum output are eligibility limits, not intelligence
scores. Pi has no empirical cross-provider quality ranking. Use ordered exact
`provider/model` references in `modelCandidates` for a portable fallback policy,
or `model` for one exact override. Candidate order is authoritative even for a
`deep` task; reasoning metadata never silently reorders an explicit policy.
`allowedProviders` and `allowedModels` are hard trust filters applied before
routing, and an explicitly empty allowlist fails closed. No provider or product
name is baked into the router. Pi does not expose live provider capacity or
latency here; the `latency` priority uses static model cost only as an
efficiency proxy and the result says so.

A caller may provide `estimatedContextTokens`, but it cannot undercut the prompt
and explicit skill content that the extension has already assembled. Automatic
estimates add a complexity-based exploration allowance to that known lower
bound.

Optional per-child budgets—`maxTurns`, `maxInputTokens`, `maxOutputTokens`, and
`maxCost`—are checked at assistant-turn boundaries. `maxTurns` stops before an
additional tool round once the configured count is reached; token and cost
limits stop after Pi receives a completed turn that crosses the bound. They are
guardrails, not prepaid guarantees: a single provider turn can cross a limit
before Pi receives its usage. Timeout, cancellation, budget, and output-limit
termination remain distinguishable in structured results. Task count and
concurrency are separate bounds. Child streams, individual captured answers,
and model-visible combined output are byte-bounded. The combined response starts
with a compact all-task status manifest before equally budgeted excerpts, so a
large early answer cannot hide a later failed or blocked task. Bounded details
remain available in `/agents`.

While a run is active, Pi shows a compact contextual status and a bounded task
widget. `/agents` opens the keyboard-driven run list, then reveals one task's
model, route, blocker, error, and output. The same screen can cancel unfinished
children. It also shows routing limitations and which context classes were sent.
Completed detail stays collapsed until requested so ordinary coding sessions do
not become a wall of status text.

Parallel tasks must set `readOnly: true` or use `isolation: "worktree"`.
Read-only children receive only Pi's read, grep, find, and list tools. Each child
has a role and reports `completed`, `blocked`, `failed`, or `aborted`; a blocked
result includes its reason, owner, resume condition, and next action.

Delegated children start with `--no-skills`, even if skills are globally
installed. To opt in, pass only the required skill file or directory paths in
the `skills` allowlist; each entry becomes an explicit Pi `--skill` argument.
Children also start with extensions disabled to keep their context isolated.

For writing tasks, choose `isolation: "worktree"`. A detached temporary Git
worktree is removed only if it remains unchanged. Modified or committed
worktrees are preserved and reported for manual integration. Worktrees start at
the current `HEAD`; uncommitted changes from the source checkout are not copied.

## Develop and validate

```bash
npm install
npm run validate
npm pack --dry-run
```

Requires Node.js 22.19 or newer and Pi 0.84.2 or newer.
