# Security policy

Pi extensions execute with the local user's permissions. Review this repository
and pin a tag or commit before installing it in a sensitive environment.

The task-agent extension starts child Pi processes and can create Git worktrees.
It is not a sandbox. Use OS-level isolation for untrusted code or prompts.
Project-local `AGENTS.md`, skills, and repository content can influence a child
agent after that project is trusted. Delegated children disable skill discovery
by default; an explicit `skills` allowlist is still trusted prompt material.

The context resolver reads only matched `Company.md` and `Project.md` files, but
their text is still untrusted data. It must not be treated as authorization or
as a replacement for system/developer instructions. Opting into a context tool
or child injection sends those note contents to the selected model provider.

Report vulnerabilities privately through GitHub's security advisory feature.
Do not include secrets, private notes, or exploit data in public issues.
