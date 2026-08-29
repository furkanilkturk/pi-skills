# Metonia Pi Kit

Scoped knowledge skills and small Pi extensions for the
[Metonia](https://github.com/furkanilkturk/metonia) Obsidian system.

Metonia treats a focused folder as an **agent space**: `AGENTS.md` describes the
space, while `.agents/skills/` contains only the capabilities that belong there.
Opening Pi from a coding repository therefore does not load document-learning or
video-production skills.

## What is included

| Resource | Purpose | Loaded by the Pi package? |
| --- | --- | --- |
| `learning` pack | Documents and existing videos → source-backed knowledge | No |
| `work` pack | Company → project context curation | No |
| `video` pack | Research, concept development, and review | No |
| `task_agents` | Isolated, bounded subagent dispatch with metadata-based model routing | Yes |
| `metonia_context` | Resolve an external Git repository to its Company and Project notes | Yes |

The `skills: []` package manifest is intentional. Skills are copied into the
agent space that owns them, so their names and descriptions do not consume every
coding session's context.

## Install the Pi extensions

Review third-party extension code before installation: Pi extensions run with
your local user's permissions.

```bash
pi install git:github.com/furkanilkturk/pi-skills
```

The package installs the two extensions only. It does not change model or
authentication settings and does not install skills globally.

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

Only the six named skill directories are replaced. Unrelated skills in the
target are preserved. The installer rejects targets that do not end in
`.agents/skills`.

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

**Privacy:** invoking `metonia_context`, or setting
`includeMetoniaContext: true` on `task_agents`, sends the matched notes to the
selected model provider. Context injection is never automatic; opt in only when
those private notes are appropriate for that provider and task.

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
control, not a claim about provider capacity. Selection modes are:

- `light`: favor the lowest static price among models that fit the estimated context;
- `standard`: balance price, reasoning support, context, and output capacity;
- `deep`: favor reasoning and headroom for hard or long tasks.

These are model-class heuristics, not hardcoded product names. `model` always
overrides routing. Pi does not expose live provider capacity or latency here;
the `latency` priority uses static model cost as an efficiency proxy and the
result says so.

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
