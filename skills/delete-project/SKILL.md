---
name: delete-project
description: Remove or archive a project from the Metonia work context system. Use when the user says /delete-project, remove project context, archive project, or asks whether to keep lessons before deleting a project note.
---

# Delete Project

Vault path: discover the Metonia vault by reading the `METONIA_VAULT`
environment variable, or by asking the user for the path. There is no
machine-specific fallback.

## Goal

Delete or archive a project note safely while preserving reusable lessons if the
user wants them.

## Workflow

1. Identify the project folder `wiki/projects/<Company>/<Project>/`.
2. Ask the user:
   - delete permanently or archive?
   - keep lessons learned?
   - keep decisions/architecture history?
   - remove from the company index?
3. If keeping lessons, extract reusable parts to one of:
   - the company page's `Lessons Learned` section;
   - `wiki/projects/Work Lessons.md`;
   - the relevant concept page — only for durable, reusable ideas, never
     one-off or project-specific facts.
4. Delete or move the project folder.
5. Update the company index (if it exists) and `wiki/Index.md` because the
   project route changed. Append a short `wiki/Log.md` entry for the meaningful
   deletion or archive; skip no-op/tiny typo, formatting, or link-only
   maintenance.

## Default Recommendation

Prefer archive over delete unless the user explicitly wants deletion.

Archive path:

```text
wiki/projects/<Company>/archive/<Project>/  (keep folder structure)
```

## Boundaries

Never delete raw source code repos. This skill only manages project context
unless the user explicitly asks otherwise.
