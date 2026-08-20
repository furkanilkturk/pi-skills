# pi-skills

Private collection of Pi agent skills for the Metonia vault + work context system.

## Skills

- `work-vault-context` — use Metonia Obsidian vault as durable AI context across Frostium/Yuppo/Freelance/Personal
- `create-project` — create new project folder (index/rules/log) from questionnaire, optionally init git
- `add-project` — add existing codebase (inspect repo, then create context)
- `update-project` — sync project context from repo changes (diff from synced_commit)
- `delete-project` — archive/delete project context, preserve lessons
- `video-learning` — ingest any video/transcript → raw + full teach-from-zero lesson + living concepts + recall

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

Vault: `C:/Users/imust/repos/Obsidian/metonia`

```text
/skill:create-project
/skill:add-project
/skill:update-project
/skill:delete-project
# work context auto-loads via work-vault-context when you mention Frostium/Yuppo/etc.
/skill:video-learning
```

All skills are versioned here; Metonia vault's `.pi/skills/` is a mirror for portability.

## Privacy

Private repo — contains workflow and structure only. No secrets, tokens, or customer data are stored in skills.
