# Live routing benchmark

Contract tests verify routing boundaries, not model quality. Use this small live
benchmark after a material skill or model change; do not run it on every commit.

Run each task in an isolated disposable repo or worktree with the same starting
commit and acceptance checks:

1. one-file mechanical Quick change;
2. three-file bounded Standard change;
3. four-file Standard change that must route to Terra;
4. one-file security-sensitive change that must route to Terra;
5. short, clean document ingest;
6. dense or low-confidence learning ingest.

For each run record the selected role/model, input and output tokens, reported
cost, wall time, acceptance result, reviewer blockers, retry/escalation, and
final human correction count. Compare Luna routing with a Terra-only baseline.
Keep Luna enabled only when acceptance pass rate and human correction rate stay
equivalent for eligible cases; token or cost savings alone are insufficient.

Use at least three runs per case before changing a route. Do not reuse mutated
worktrees or judge quality from the model's own completion claim; use the same
deterministic checks and fresh reviewer contract for both cohorts.
