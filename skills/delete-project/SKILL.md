---
name: delete-project
description: Remove or archive a project from the Metonia Obsidian work context system. Use when the user says /delete-project, remove project context, archive project, or asks whether to keep lessons before deleting a project note.
---

# Delete Project

Vault path: discovered Metonia vault (ask user or env METONIA_VAULT, fallback C:/Users/imust/repos/obsidian/metonia)

## Goal

Delete or archive a project note safely while preserving reusable lessons if the user wants them.

## Workflow

1. Identify the project folder `wiki/projects/<Company>/<Project>/`.
2. Ask the user:
   - delete permanently or archive?
   - keep lessons learned?
   - keep decisions/architecture history?
   - remove from company index?
3. If keeping lessons, extract reusable parts to one of:
   - company page `Lessons Learned`;
   - `wiki/projects/Work Lessons.md` if it exists or should be created;
   - relevant concept page, e.g. `[[Caching]]`, `[[HTTP]]`, `[[Database Engineering]]`.
4. Delete or move the project folder.
5. Update company index, `wiki/Index.md`, and `wiki/Log.md`.

## Default Recommendation

Prefer archive over delete unless the user explicitly wants deletion.

Archive path:

`wiki/projects/<Company>/archive/<Project>/` (keep folder structure)

## Boundaries

Never delete raw source code repos. This skill only manages Obsidian project context unless the user explicitly asks otherwise.
