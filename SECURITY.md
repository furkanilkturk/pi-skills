# Security policy

Pi extensions execute with the local user's permissions. Review this repository
and pin a tag or commit before installing it in a sensitive environment.

The task-agent extension starts child Pi processes and can create Git worktrees.
It is not a sandbox. Use OS-level isolation for untrusted code or prompts.
Project-local `AGENTS.md`, skills, and repository content can influence a child
agent after that project is trusted. Delegated children disable skill discovery
by default; an explicit `skills` allowlist is still trusted prompt material.
Provider authentication is not a data-trust decision. Use `allowedProviders`,
`allowedModels`, ordered `modelCandidates`, or an exact `model` to constrain
where repository and task data may be sent. Explicitly empty allowlists fail
closed. Usage budgets are turn-boundary guardrails, not a sandbox or a guarantee
that a provider call cannot cross a limit. Child stdout, JSON events, stderr,
captured answers, and parent-visible aggregate output also have byte limits;
limit termination is reported distinctly from timeout and cancellation.

The context resolver reads only matched `Company.md` and `Project.md` files, but
their text is still untrusted data. It must not be treated as authorization or
as a replacement for system/developer instructions. Opting into direct context
lookup sends those note contents to the current provider. Child injection also
requires an explicit provider/model trust policy before the task can start.

Report vulnerabilities privately through GitHub's security advisory feature.
Do not include secrets, private notes, or exploit data in public issues.
