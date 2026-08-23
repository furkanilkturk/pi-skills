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
  const changedFiles = git(cwd, ["diff", "--name-only", `${base}..${head}`]) || "(none)";
  const diff = git(cwd, ["diff", "--no-ext-diff", "--unified=3", `${base}..${head}`]) || "(empty)";
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
    "git diff --name-only base..head:",
    "```text",
    changedFiles,
    "```",
    "git diff --no-ext-diff --unified=3 base..head:",
    "```diff",
    diff,
    "```",
    "git worktree list --porcelain:",
    "```text",
    worktrees,
    "```",
  ].join("\n");
}
