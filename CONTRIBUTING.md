# Contributing

Keep the runtime small and the skill boundaries sharp.

1. Open an issue before adding a new pack or runtime dependency.
2. Put a skill in the narrowest pack that owns its workflow. Do not make it a
   globally loaded package resource.
3. Keep `SKILL.md` focused; add supporting files only when they save repeated,
   task-specific work.
4. Run `npm run validate` and `npm pack --dry-run` before submitting a change.

Commits should be small, imperative, and limited to one logical change. Never
include credentials, private vault content, copyrighted transcripts, or customer
data in fixtures or reports.
