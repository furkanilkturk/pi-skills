import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import type { Api, Model } from "@earendil-works/pi-ai";
import registerTaskAgents from "../extensions/task-agents/index.ts";
import { installPack } from "../scripts/install-pack.mjs";
import { syncMetonia } from "../scripts/sync-metonia.mjs";
import {
	ContextResolutionError,
	formatContextData,
	normalizeGitRemote,
	resolveMetoniaContext,
} from "../src/context-resolver.ts";
import { routeModel } from "../src/model-router.ts";
import { buildPiChildArgs, parseTaskStatusFooter } from "../src/task-process.ts";
import { finalizeWorktree, prepareWorktree } from "../src/worktree.ts";

const exec = promisify(execFile);

function model(options: {
	id: string;
	reasoning: boolean;
	contextWindow: number;
	maxTokens: number;
	price: number;
}): Model<Api> {
	return {
		id: options.id,
		name: options.id,
		provider: "test" as Model<Api>["provider"],
		api: "openai-responses",
		baseUrl: "https://example.test",
		reasoning: options.reasoning,
		input: ["text"],
		cost: {
			input: options.price,
			output: options.price,
			cacheRead: options.price / 10,
			cacheWrite: options.price / 2,
		},
		contextWindow: options.contextWindow,
		maxTokens: options.maxTokens,
	};
}

test("normalizes common Git remote spellings", () => {
	assert.equal(normalizeGitRemote("git@GitHub.com:Acme/App.git"), "github.com/acme/app");
	assert.equal(normalizeGitRemote("https://github.com/acme/app/"), "github.com/acme/app");
	assert.equal(normalizeGitRemote("ssh://git@github.com/acme/app.git"), "github.com/acme/app");
});

test("routes model classes by metadata and honors exact override", () => {
	const models = [
		model({ id: "economy", reasoning: false, contextWindow: 128_000, maxTokens: 8_000, price: 0.2 }),
		model({ id: "middle", reasoning: true, contextWindow: 256_000, maxTokens: 32_000, price: 1 }),
		model({ id: "depth", reasoning: true, contextWindow: 1_000_000, maxTokens: 128_000, price: 4 }),
	];
	assert.equal(
		routeModel(models, { complexity: "light", priority: "cost", estimatedContextTokens: 10_000 }).model.id,
		"economy",
	);
	assert.equal(
		routeModel(models, { complexity: "deep", priority: "quality", estimatedContextTokens: 200_000 }).model.id,
		"depth",
	);
	assert.equal(
		routeModel(models, {
			complexity: "deep",
			priority: "quality",
			estimatedContextTokens: 1,
			modelOverride: "test/middle",
		}).model.id,
		"middle",
	);
});

test("deep routing prefers an equally capable current reasoning model or requests an override", () => {
	const first = model({ id: "first", reasoning: true, contextWindow: 1_000_000, maxTokens: 128_000, price: 2 });
	const current = model({ id: "current", reasoning: true, contextWindow: 1_000_000, maxTokens: 128_000, price: 2 });
	const request = { complexity: "deep" as const, priority: "quality" as const, estimatedContextTokens: 100_000 };
	assert.equal(routeModel([first, current], { ...request, currentModel: current }).model.id, "current");
	assert.throws(() => routeModel([first, current], request), /explicit provider\/model override/);
});

test("parses a structured blocked child result", () => {
	const parsed = parseTaskStatusFooter(`Need access to continue.\n<!-- TASK_AGENT_STATUS
status: blocked
blocker: missing repository permission
owner: repository admin
resume_when: read access is granted
next_action: grant access and retry
-->`);
	assert.equal(parsed.status, "blocked");
	assert.equal(parsed.output, "Need access to continue.");
	assert.deepEqual(parsed.blocker, {
		reason: "missing repository permission",
		owner: "repository admin",
		resumeCondition: "read access is granted",
		nextAction: "grant access and retry",
	});
});

test("child arguments disable skills by default and add only the explicit allowlist", () => {
	const base = { task: "inspect", model: "test/model", thinking: "low", readOnly: true };
	const isolated = buildPiChildArgs({ ...base, skills: [] });
	assert.ok(isolated.includes("--no-skills"));
	assert.equal(isolated.includes("--skill"), false);
	const allowed = buildPiChildArgs({ ...base, skills: ["/allowed/SKILL.md"] });
	assert.deepEqual(allowed.slice(allowed.indexOf("--skill"), allowed.indexOf("--skill") + 2), [
		"--skill",
		"/allowed/SKILL.md",
	]);
});

test("task extension rejects parallel writers sharing a checkout", async () => {
	let registered: { execute: (...args: any[]) => Promise<any> } | undefined;
	registerTaskAgents({
		registerTool(tool: { execute: (...args: any[]) => Promise<any> }) {
			registered = tool;
		},
	} as any);
	assert.ok(registered);
	const result = await registered.execute(
		"test",
		{ tasks: [{ task: "change a" }, { task: "change b" }] },
		undefined,
		undefined,
		{},
	);
	assert.equal(result.isError, true);
	assert.match(result.content[0].text, /readOnly: true|worktree/);
});

test("task extension marks a queued task aborted before routing or spawn", async () => {
	let registered: { execute: (...args: any[]) => Promise<any> } | undefined;
	registerTaskAgents({
		registerTool(tool: { execute: (...args: any[]) => Promise<any> }) {
			registered = tool;
		},
	} as any);
	assert.ok(registered);
	const controller = new AbortController();
	controller.abort();
	const result = await registered.execute(
		"test",
		{ task: "never start" },
		controller.signal,
		undefined,
		{ scopedModels: [], modelRegistry: { getAvailable: () => [] } },
	);
	assert.equal(result.details.results[0].status, "aborted");
	assert.match(result.details.results[0].error, /before this queued task started/);
});

test("resolver returns only the uniquely matched company and project", async (t) => {
	const temp = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-context-test-"));
	t.after(() => fs.rm(temp, { recursive: true, force: true }));
	const vault = path.join(temp, "vault");
	const companyDir = path.join(vault, "Work", "Companies", "Acme");
	const projectDir = path.join(companyDir, "Projects", "App");
	const repo = path.join(temp, "repo");
	await fs.mkdir(projectDir, { recursive: true });
	await fs.mkdir(repo);
	await fs.writeFile(path.join(companyDir, "Company.md"), "# Acme\nHow Acme works.");
	await fs.writeFile(
		path.join(projectDir, "Project.md"),
		"---\ntype: project\nrepository: git@github.com:Acme/App.git\n---\n# App\nProject facts.",
	);
	await exec("git", ["init"], { cwd: repo });
	await exec("git", ["remote", "add", "origin", "https://github.com/acme/app.git"], { cwd: repo });

	const result = await resolveMetoniaContext({ vaultPath: vault, cwd: repo });
	assert.equal(result.matchedRemote, "github.com/acme/app");
	assert.match(result.company, /How Acme works/);
	assert.match(result.project, /Project facts/);
	assert.equal(Object.keys(result).sort().join(","), "company,companyPath,matchedRemote,project,projectPath,repositoryRoot");
	const visible = formatContextData(result);
	assert.doesNotMatch(visible, new RegExp(temp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("resolver refuses a symlink or junction in the project index", async (t) => {
	const temp = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-link-test-"));
	t.after(() => fs.rm(temp, { recursive: true, force: true }));
	const vault = path.join(temp, "vault");
	const outside = path.join(temp, "outside-companies");
	await fs.mkdir(path.join(vault, "Work"), { recursive: true });
	await fs.mkdir(outside);
	try {
		await fs.symlink(outside, path.join(vault, "Work", "Companies"), process.platform === "win32" ? "junction" : "dir");
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && ["EPERM", "EACCES"].includes(String(error.code))) {
			t.skip("Creating a test symlink/junction is not permitted on this host.");
			return;
		}
		throw error;
	}
	await assert.rejects(
		resolveMetoniaContext({ vaultPath: vault, cwd: vault, remote: "https://github.com/acme/app" }),
		(error: unknown) => error instanceof ContextResolutionError && error.code === "invalid-vault",
	);
});

test("resolver fails clearly on ambiguous matches", async (t) => {
	const temp = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-ambiguous-test-"));
	t.after(() => fs.rm(temp, { recursive: true, force: true }));
	for (const company of ["One", "Two"]) {
		const dir = path.join(temp, "Work", "Companies", company, "Projects", "App");
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(temp, "Work", "Companies", company, "Company.md"), `# ${company}`);
		await fs.writeFile(path.join(dir, "Project.md"), "---\nrepository: https://github.com/acme/app\n---\n# App");
	}
	await assert.rejects(
		resolveMetoniaContext({ vaultPath: temp, cwd: temp, remote: "git@github.com:acme/app.git" }),
		(error: unknown) => error instanceof ContextResolutionError && error.code === "ambiguous-repository" && error.candidates.length === 2,
	);
});

test("pack installer replaces owned skills and preserves unrelated ones", async (t) => {
	const temp = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-pack-test-"));
	t.after(() => fs.rm(temp, { recursive: true, force: true }));
	const target = path.join(temp, ".agents", "skills");
	await fs.mkdir(path.join(target, "doc-learning"), { recursive: true });
	await fs.writeFile(path.join(target, "doc-learning", "stale.txt"), "stale");
	await fs.mkdir(path.join(target, "custom-skill"));
	await fs.writeFile(path.join(target, "custom-skill", "SKILL.md"), "custom");

	await installPack("learning", target);
	await fs.access(path.join(target, "doc-learning", "SKILL.md"));
	await fs.access(path.join(target, "video-learning", "SKILL.md"));
	await fs.access(path.join(target, "custom-skill", "SKILL.md"));
	await assert.rejects(fs.access(path.join(target, "doc-learning", "stale.txt")));
});

test("pack installer refuses a non-scoped target", async (t) => {
	const temp = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-pack-guard-test-"));
	t.after(() => fs.rm(temp, { recursive: true, force: true }));
	await assert.rejects(installPack("learning", temp), /\.agents.*skills/);
});

test("Metonia sync targets the three agent-space skill directories", async (t) => {
	const template = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-sync-test-"));
	t.after(() => fs.rm(template, { recursive: true, force: true }));
	await syncMetonia(template);
	for (const relative of [
		"Learning/.agents/skills/doc-learning/SKILL.md",
		"Learning/.agents/skills/video-learning/SKILL.md",
		"Work/.agents/skills/project-learning/SKILL.md",
		"Studio/Video/.agents/skills/video-research/SKILL.md",
		"Studio/Video/.agents/skills/video-concept/SKILL.md",
		"Studio/Video/.agents/skills/video-review/SKILL.md",
	]) {
		await fs.access(path.join(template, ...relative.split("/")));
	}
});

test("clean detached worktree is removed automatically", async (t) => {
	const temp = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-worktree-test-"));
	t.after(() => fs.rm(temp, { recursive: true, force: true }));
	await exec("git", ["init"], { cwd: temp });
	await exec("git", ["config", "user.email", "tests@example.test"], { cwd: temp });
	await exec("git", ["config", "user.name", "Tests"], { cwd: temp });
	await fs.writeFile(path.join(temp, "README.md"), "test");
	await exec("git", ["add", "README.md"], { cwd: temp });
	await exec("git", ["commit", "-m", "test fixture"], { cwd: temp });

	const lease = await prepareWorktree(temp, true);
	assert.ok(lease.worktreeRoot);
	await fs.access(lease.worktreeRoot!);
	const disposition = await finalizeWorktree(lease);
	assert.equal(disposition.preserved, false);
	await assert.rejects(fs.access(lease.worktreeRoot!));
});

test("dirty detached worktree is preserved for manual integration", async (t) => {
	const source = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-dirty-worktree-test-"));
	let lease: Awaited<ReturnType<typeof prepareWorktree>> | undefined;
	t.after(async () => {
		if (lease?.worktreeRoot) {
			try {
				await exec("git", ["worktree", "remove", "--force", lease.worktreeRoot], { cwd: source });
			} catch {
				// Source cleanup below handles any remaining fixture files.
			}
		}
		if (lease?.tempRoot) await fs.rm(lease.tempRoot, { recursive: true, force: true });
		await fs.rm(source, { recursive: true, force: true });
	});
	await exec("git", ["init"], { cwd: source });
	await exec("git", ["config", "user.email", "tests@example.test"], { cwd: source });
	await exec("git", ["config", "user.name", "Tests"], { cwd: source });
	await fs.writeFile(path.join(source, "README.md"), "test");
	await exec("git", ["add", "README.md"], { cwd: source });
	await exec("git", ["commit", "-m", "test fixture"], { cwd: source });

	lease = await prepareWorktree(source, true);
	await fs.writeFile(path.join(lease.worktreeRoot!, "changed.txt"), "preserve me");
	const disposition = await finalizeWorktree(lease);
	assert.equal(disposition.preserved, true);
	assert.match(disposition.reason ?? "", /uncommitted changes/);
	await fs.access(path.join(lease.worktreeRoot!, "changed.txt"));
});
