# pi-skills

Private collection of Pi agent skills for the Metonia vault + work context system.

## Skills

- `work-vault-context` — use Metonia Obsidian vault as durable AI context across Frostium/Yuppo/Freelance/Personal
- `create-project` — create new project folder (index/rules/log) from questionnaire, optionally init git
- `add-project` — add existing codebase (inspect repo, then create context)
- `update-project` — sync project context from repo changes (diff from synced_commit)
- `delete-project` — archive/delete project context, preserve lessons
- `create-plan` — turn a goal into a plan file executable by a weak model with no chat memory
- `execute-plan` — run a vault plan step by step with strict status tracking

Learning skills (`video-learning`, `doc-learning`) live in the Metonia vault repo under `.pi/skills/`.

## Install

Clone to your Pi skills directory or add to Pi config:

```json
{
  "skills": ["C:/Users/imust/repos/pi-skills/skills"]
}
```

Or symlink:

```bash
# from pi-skills repo root
ln -s "$(pwd)/skills" ~/.pi/agent/skills  # or copy
```

## Usage with Metonia vault

Vault: `C:/Users/imust/repos/obsidian/metonia`

```text
create project / add project / update project / delete project
# work context auto-loads via work-vault-context when you mention Frostium/Yuppo/etc.
create plan / execute plan
```

## Privacy

Private repo — contains workflow and structure only. No secrets, tokens, or customer data are stored in skills.
