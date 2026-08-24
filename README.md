# Pi learning skills

Two self-contained Pi skills for maintaining a source-backed Obsidian learning
vault:

- `doc-learning` turns documents, articles, PDFs, and lessons into connected
  notes.
- `video-learning` turns videos and transcripts into lessons, concepts, and
  recall material.

Both skills are self-contained and work in the current Pi session.

## Install or refresh

```powershell
pwsh -NoProfile -File ./scripts/sync-to-pi.ps1
```

The script copies only these two skill directories into the current user's Pi
skill directory. It does not modify authentication, model settings, or unrelated
skills.

Set `METONIA_VAULT` to the learning vault path, or let the skill ask for it.

## Check

```powershell
pwsh -NoProfile -File ./scripts/test-skills.ps1
```

The matching portable vault template lives at
[furkanilkturk/metonia](https://github.com/furkanilkturk/metonia).
