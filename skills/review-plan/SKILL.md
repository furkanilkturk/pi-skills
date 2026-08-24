---
name: review-plan
description: Independently review an executed Metonia plan against the actual diff, declared boundaries, verification evidence, and required controls. Use only for a read-only post-execution review.
---

# Review Plan

Review only. Do not edit files, update plan status, run mutating commands, or
delegate. Treat the supplied plan, current working tree, actual diff, and named
command results as the review record; do not assume an implementation claim is
true without checking the diff.

When the handoff includes `AUTOMATIC_REVIEW_CONTEXT`, treat its resolved
base/HEAD, status, committed diff, staged diff, unstaged diff, untracked-file
names, and worktree list as broker-captured read-only Git evidence. Untracked
contents are not embedded; open each in-scope untracked file explicitly before
passing. Still require command results and plan-specific gate, retry, and
external-effect evidence from the parent; the Git snapshot cannot prove those
execution facts.

## Required inputs

Require all of the following before passing:

- the approved plan index path and its base commit, step/packet boundaries,
  success criteria, current-execution snapshot, and required review profile;
- the actual changed-file list and read-only diff against that base;
- every verification command, its result, and any residual risk or deviation;
- execution evidence for completed steps, retries, idempotence, external
  effects, and human gates when the plan declares those controls. Accept exact
  named headings/links from the plan `log.md`; do not read the full historical
  log by default.

If an input is missing, the base/diff cannot be inspected, a change is outside
the approved boundary, a required check failed or was not run, or a required
control/gate is unresolved, return `BLOCKED`. Do not repair the issue.

## Review procedure

1. Read the plan index and active controls, then only the exact plan-log events
   named by the handoff. Compare allowed files, active packets, step
   ordering, retry/idempotence rules, external-effect rules, and human gates
   to the actual diff and evidence.
2. Inspect the actual diff read-only. Check that every changed file and material
   behavior is justified by a completed plan step and that no declared boundary
   was silently widened.
3. Assess the named verification commands and evidence against the plan's
   success criteria. Distinguish command output from unverified assertions.
4. List concrete blockers with file/step/control and the condition required to
   resolve each. Small non-blocking suggestions may be noted separately.

## Output rubric

End with exactly one result and named evidence:

```text
METONIA_RESULT: PASS
METONIA_EVIDENCE:
- actual-diff: <reviewed base and changed-file result>
- plan-boundaries: <matched or mismatch>
- commands-and-evidence: <verified results>
- controls-and-gates: <resolved controls or blocker>
```

Use `METONIA_RESULT: BLOCKED` with the same labels whenever a required item is
missing or fails. Immediately follow a blocked result with
`METONIA_BLOCKED_STEP`, a short redacted `METONIA_BLOCKER`, and exact
`METONIA_RESUME_WHEN` so the parent and widget can show the real gate. A PASS
means the reviewed record matches the approved plan;
it does not authorize additional work.
