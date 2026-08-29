import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface WorktreeLease {
	executionCwd: string;
	worktreeRoot?: string;
	sourceRoot?: string;
	baseHead?: string;
	tempRoot?: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
	return (
		await execFileAsync("git", ["-C", cwd, ...args], {
			encoding: "utf8",
		})
	).stdout.trim();
}

export async function prepareWorktree(cwd: string, isolated: boolean): Promise<WorktreeLease> {
	const executionCwd = path.resolve(cwd);
	if (!isolated) return { executionCwd };

	let sourceRoot: string;
	try {
		sourceRoot = await git(executionCwd, ["rev-parse", "--show-toplevel"]);
	} catch {
		throw new Error(`Worktree isolation requires a Git repository: ${executionCwd}`);
	}
	const relativeCwd = path.relative(sourceRoot, executionCwd);
	if (relativeCwd.startsWith("..") || path.isAbsolute(relativeCwd)) {
		throw new Error(`Working directory is outside its Git root: ${executionCwd}`);
	}

	const baseHead = await git(sourceRoot, ["rev-parse", "HEAD"]);
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-task-"));
	const worktreeRoot = path.join(tempRoot, "worktree");
	try {
		await execFileAsync("git", ["-C", sourceRoot, "worktree", "add", "--detach", worktreeRoot, baseHead], {
			encoding: "utf8",
		});
	} catch (error) {
		await fs.rm(tempRoot, { recursive: true, force: true });
		throw error;
	}
	return {
		executionCwd: path.join(worktreeRoot, relativeCwd),
		worktreeRoot,
		sourceRoot,
		baseHead,
		tempRoot,
	};
}

export async function finalizeWorktree(lease: WorktreeLease): Promise<{
	preserved: boolean;
	path?: string;
	reason?: string;
}> {
	if (!lease.worktreeRoot || !lease.sourceRoot || !lease.baseHead) return { preserved: false };

	let status = "";
	let head = lease.baseHead;
	try {
		status = await git(lease.worktreeRoot, ["status", "--porcelain"]);
		head = await git(lease.worktreeRoot, ["rev-parse", "HEAD"]);
	} catch {
		return { preserved: true, path: lease.worktreeRoot, reason: "worktree state could not be verified" };
	}

	if (status || head !== lease.baseHead) {
		return {
			preserved: true,
			path: lease.worktreeRoot,
			reason: status ? "uncommitted changes" : `new commit ${head}`,
		};
	}

	try {
		await execFileAsync("git", ["-C", lease.sourceRoot, "worktree", "remove", "--force", lease.worktreeRoot], {
			encoding: "utf8",
		});
		if (lease.tempRoot) await fs.rm(lease.tempRoot, { recursive: true, force: true });
		return { preserved: false };
	} catch {
		return { preserved: true, path: lease.worktreeRoot, reason: "automatic cleanup failed" };
	}
}
