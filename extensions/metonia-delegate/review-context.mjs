import { spawnSync } from "node:child_process";

const SECTION_LIMIT = 48 * 1024;

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || `git ${args[0]} failed`).trim();
    throw new Error(detail);
  }
  const output = String(result.stdout ?? "").trimEnd();
  if (output.length <= SECTION_LIMIT) return output;
  return `${output.slice(0, SECTION_LIMIT)}\n[truncated by Metonia broker]`;
}

export function collectReviewContext(cwd, baseRef) {
  if (!baseRef) return undefined;
  const base = git(cwd, ["rev-parse", "--verify", `${baseRef}^{commit}`]).trim();
  const head = git(cwd, ["rev-parse", "HEAD"]).trim();
  const branch = git(cwd, ["branch", "--show-current"]).trim() || "(detached)";
  const status = git(cwd, ["status", "--short"]) || "(clean)";
  const committedFiles = git(cwd, ["diff", "--name-only", `${base}..${head}`]) || "(none)";
  const committedDiff = git(cwd, ["diff", "--no-ext-diff", "--unified=3", `${base}..${head}`]) || "(empty)";
  const stagedFiles = git(cwd, ["diff", "--cached", "--name-only"]) || "(none)";
  const stagedDiff = git(cwd, ["diff", "--cached", "--no-ext-diff", "--unified=3"]) || "(empty)";
  const unstagedFiles = git(cwd, ["diff", "--name-only"]) || "(none)";
  const unstagedDiff = git(cwd, ["diff", "--no-ext-diff", "--unified=3"]) || "(empty)";
  const untrackedFiles = git(cwd, ["ls-files", "--others", "--exclude-standard"]) || "(none)";
  const worktrees = git(cwd, ["worktree", "list", "--porcelain"]);

  return [
    "AUTOMATIC_REVIEW_CONTEXT (read-only broker snapshot; verify against the plan):",
    `base: ${base}`,
    `head: ${head}`,
    `branch: ${branch}`,
    "git status --short:",
    "```text",
    status,
    "```",
    "committed files (base..head):",
    "```text",
    committedFiles,
    "```",
    "committed diff (base..head):",
    "```diff",
    committedDiff,
    "```",
    "staged files:",
    "```text",
    stagedFiles,
    "```",
    "staged diff:",
    "```diff",
    stagedDiff,
    "```",
    "unstaged files:",
    "```text",
    unstagedFiles,
    "```",
    "unstaged diff:",
    "```diff",
    unstagedDiff,
    "```",
    "untracked files (names only; contents are not embedded—review them explicitly when in scope):",
    "```text",
    untrackedFiles,
    "```",
    "git worktree list --porcelain:",
    "```text",
    worktrees,
    "```",
  ].join("\n");
}
