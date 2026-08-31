import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import type { Api, Model } from "@earendil-works/pi-ai";
import registerTaskAgents, { buildTaskContract } from "../extensions/task-agents/index.ts";
import { detectMetoniaSpace } from "../extensions/metonia-context/index.ts";
import registerMetoniaInterview, { orderMetoniaOptions } from "../extensions/metonia-interview/index.ts";
import { installPack } from "../scripts/install-pack.mjs";
import { syncMetonia } from "../scripts/sync-metonia.mjs";
import { buildRepositoryInventory } from "../skills/global/project-learning/scripts/repository-inventory.mjs";
import {
	ContextResolutionError,
	formatContextData,
	normalizeGitRemote,
	resolveMetoniaContext,
} from "../src/context-resolver.ts";
import { routeModel } from "../src/model-router.ts";
import {
	buildPiChildArgs,
	clipUtf8,
	findBudgetViolation,
	parseTaskStatusFooter,
	runPiChild,
	truncateUtf8Prefix,
} from "../src/task-process.ts";
import { finalizeWorktree, prepareWorktree } from "../src/worktree.ts";

const exec = promisify(execFile);

function model(options: {
	id: string;
	reasoning: boolean;
	contextWindow: number;
	maxTokens: number;
	price: number;
	provider?: string;
}): Model<Api> {
	return {
		id: options.id,
		name: options.id,
		provider: (options.provider ?? "test") as Model<Api>["provider"],
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

test("routes efficient work by price and honors ordered quality policy or exact override", () => {
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
		routeModel(models, {
			complexity: "deep",
			priority: "quality",
			estimatedContextTokens: 200_000,
			modelCandidates: ["test/depth", "test/middle"],
		}).model.id,
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

test("quality routing keeps an eligible current model and otherwise stays deterministic", () => {
	const first = model({ id: "first", reasoning: true, contextWindow: 1_000_000, maxTokens: 128_000, price: 2 });
	const current = model({ id: "current", reasoning: true, contextWindow: 1_000_000, maxTokens: 128_000, price: 2 });
	const request = { complexity: "deep" as const, priority: "quality" as const, estimatedContextTokens: 100_000 };
	assert.equal(routeModel([first, current], { ...request, currentModel: current }).model.id, "current");
	const fallback = routeModel([first, current], request);
	assert.equal(fallback.model.id, "current");
	assert.match(fallback.limitation ?? "", /quality profile|modelCandidates/);
});

test("routing treats capacity as eligibility, preserves zero price, and enforces trust filters", () => {
	const free = model({ id: "free", reasoning: true, contextWindow: 256_000, maxTokens: 32_000, price: 0, provider: "go" });
	const huge = model({ id: "huge", reasoning: true, contextWindow: 1_000_000, maxTokens: 256_000, price: 4, provider: "other" });
	assert.equal(
		routeModel([huge, free], {
			complexity: "standard",
			priority: "balanced",
			estimatedContextTokens: 20_000,
		}).model.id,
		"free",
	);
	assert.equal(
		routeModel([huge, free], {
			complexity: "light",
			priority: "cost",
			estimatedContextTokens: 1_000,
			allowedProviders: ["go"],
		}).model.id,
		"free",
	);
	assert.throws(
		() =>
			routeModel([huge, free], {
				complexity: "light",
				priority: "cost",
				estimatedContextTokens: 1_000,
				allowedProviders: ["trusted-only"],
			}),
		/trust policy/,
	);
});

test("ordered model candidates skip unavailable providers without changing declared order", () => {
	const firstAvailable = model({ id: "first", reasoning: false, contextWindow: 256_000, maxTokens: 32_000, price: 2 });
	const secondAvailable = model({ id: "second", reasoning: true, contextWindow: 256_000, maxTokens: 32_000, price: 1 });
	const route = routeModel([secondAvailable, firstAvailable], {
		complexity: "standard",
		priority: "quality",
		estimatedContextTokens: 10_000,
		modelCandidates: ["missing/model", "test/first", "test/second"],
	});
	assert.equal(route.model.id, "first");
	assert.match(route.limitation ?? "", /missing\/model/);
});

test("explicit model overrides preserve bypass semantics unless an output allowance is requested", () => {
	const small = model({ id: "small", reasoning: false, contextWindow: 16_000, maxTokens: 1_000, price: 1 });
	assert.equal(
		routeModel([small], {
			complexity: "deep",
			priority: "quality",
			estimatedContextTokens: 100_000,
			modelOverride: "test/small",
		}).model.id,
		"small",
	);
	assert.throws(
		() =>
			routeModel([small], {
				complexity: "deep",
				priority: "quality",
				estimatedContextTokens: 100_000,
				expectedOutputTokens: 2_000,
				modelOverride: "test/small",
			}),
		/does not fit/,
	);
});

test("explicitly empty trust policies fail closed", () => {
	const available = model({ id: "available", reasoning: true, contextWindow: 256_000, maxTokens: 32_000, price: 1 });
	assert.throws(
		() =>
			routeModel([available], {
				complexity: "standard",
				priority: "balanced",
				estimatedContextTokens: 1_000,
				allowedProviders: [],
			}),
		/trust policy/,
	);
	assert.throws(
		() =>
			routeModel([available], {
				complexity: "standard",
				priority: "balanced",
				estimatedContextTokens: 1_000,
				allowedModels: ["   "],
			}),
		/trust policy/,
	);
});

test("child usage budgets stop before an extra tool turn and after reported token/cost overruns", () => {
	const usage = { input: 2_000, output: 500, cacheRead: 0, cacheWrite: 0, cost: 0.2, turns: 2 };
	assert.equal(findBudgetViolation(usage, { maxTurns: 2, maxInputTokens: 2_000, maxCost: 0.2 }), undefined);
	assert.match(findBudgetViolation(usage, { maxTurns: 2 }, "toolUse") ?? "", /before another tool round/);
	assert.match(findBudgetViolation({ ...usage, turns: 3 }, { maxTurns: 2 }) ?? "", /turn limit/);
	assert.match(findBudgetViolation({ ...usage, output: 501 }, { maxOutputTokens: 500 }) ?? "", /output-token/);
});

test("UTF-8 child output capture is bounded without splitting the returned byte budget", () => {
	const clipped = clipUtf8("😀".repeat(200), 128);
	assert.ok(Buffer.byteLength(clipped, "utf8") <= 128);
	assert.match(clipped, /truncated/);
	assert.ok(Buffer.byteLength(clipUtf8("oversized", 4), "utf8") <= 4);
});

test("large multibyte truncation remains bounded and avoids a quadratic scan", () => {
	const source = "😀漢字".repeat(64 * 1024);
	const started = Date.now();
	const clipped = truncateUtf8Prefix(source, 256 * 1024);
	assert.ok(Buffer.byteLength(clipped, "utf8") <= 256 * 1024);
	assert.doesNotMatch(clipped, /[\uD800-\uDBFF]$/);
	assert.ok(Date.now() - started < 2_000);
});

test("a final JSON event without a newline records a budget stop without a stale kill", async () => {
	const event = JSON.stringify({
		type: "message_end",
		message: {
			role: "assistant",
			model: "fixture",
			content: [{ type: "text", text: "finished" }],
			stopReason: "stop",
			usage: { input: 10, output: 11, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 } },
		},
	});
	const result = await runPiChild(
		{
			cwd: process.cwd(),
			task: "fixture",
			model: "fixture/model",
			thinking: "off",
			timeoutSeconds: 30,
			readOnly: true,
			skills: [],
			budget: { maxOutputTokens: 10 },
		},
		{ command: process.execPath, args: ["-e", `process.stdout.write(${JSON.stringify(event)})`] },
	);
	assert.equal(result.status, "aborted");
	assert.equal(result.terminationReason, "budget");
	assert.equal(result.output, "finished");
	assert.equal(result.usage.output, 11);
});

test("an oversized no-newline child stream terminates with a structured output limit", async () => {
	const result = await runPiChild(
		{
			cwd: process.cwd(),
			task: "fixture",
			model: "fixture/model",
			thinking: "off",
			timeoutSeconds: 30,
			readOnly: true,
			skills: [],
		},
		{
			command: process.execPath,
			args: ["-e", 'process.stdout.write("x".repeat(9 * 1024 * 1024)); setInterval(() => {}, 1000)'],
		},
	);
	assert.equal(result.status, "aborted");
	assert.equal(result.terminationReason, "output-limit");
	assert.match(result.error ?? "", /JSON event|stdout/);
});

test("delegated task contracts keep deliverables, acceptance, and constraints explicit", () => {
	const contract = buildTaskContract(
		{
			task: "Implement the bounded parser change.",
			deliverable: "A tested parser patch.",
			acceptanceCriteria: ["Existing tests pass", "New edge case is covered"],
			constraints: ["Do not change the public API"],
		},
		"builder",
	);
	assert.match(contract, /^Role: builder/);
	assert.match(contract, /Deliverable:\nA tested parser patch/);
	assert.match(contract, /- Existing tests pass/);
	assert.match(contract, /- Do not change the public API/);
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
		registerCommand() {},
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
		registerCommand() {},
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

test("caller context estimates cannot undercut the known delegated prompt size", async () => {
	let registered: { execute: (...args: any[]) => Promise<any> } | undefined;
	registerTaskAgents({
		registerCommand() {},
		registerTool(tool: { execute: (...args: any[]) => Promise<any> }) {
			registered = tool;
		},
	} as any);
	assert.ok(registered);
	const small = model({ id: "small", reasoning: false, contextWindow: 12_000, maxTokens: 8_000, price: 1 });
	const result = await registered.execute(
		"test",
		{ task: "x".repeat(40_000), complexity: "light", estimatedContextTokens: 1 },
		undefined,
		undefined,
		{
			cwd: process.cwd(),
			scopedModels: [],
			modelRegistry: { getAvailable: () => [small] },
			model: small,
			thinkingLevel: "medium",
		},
	);
	assert.equal(result.isError, true);
	assert.match(result.details.results[0].error, /No allowed model fits/);
});

test("private Metonia context requires an explicit provider or model trust policy", async () => {
	let registered: { execute: (...args: any[]) => Promise<any> } | undefined;
	registerTaskAgents({
		registerCommand() {},
		registerTool(tool: { execute: (...args: any[]) => Promise<any> }) {
			registered = tool;
		},
	} as any);
	assert.ok(registered);
	const available = model({ id: "available", reasoning: true, contextWindow: 256_000, maxTokens: 32_000, price: 1 });
	const result = await registered.execute(
		"test",
		{ task: "inspect private project context", includeMetoniaContext: true, model: "available" },
		undefined,
		undefined,
		{
			cwd: process.cwd(),
			scopedModels: [],
			modelRegistry: { getAvailable: () => [available] },
			model: available,
			thinkingLevel: "medium",
		},
	);
	assert.equal(result.isError, true);
	assert.match(result.details.results[0].error, /trust policy/);
});

test("task extension registers the subagent dashboard command", () => {
	const commands: string[] = [];
	registerTaskAgents({
		registerCommand(name: string) {
			commands.push(name);
		},
		registerTool() {},
	} as any);
	assert.deepEqual(commands, ["agents"]);
});

test("detects Metonia agent spaces from the Pi working directory", () => {
	const vault = path.resolve("C:/vault");
	assert.deepEqual(detectMetoniaSpace(path.join(vault, "Learning", "Courses"), vault), {
		kind: "learning",
		label: "Learning",
	});
	assert.deepEqual(
		detectMetoniaSpace(path.join(vault, "Work", "Companies", "Acme", "Projects", "App"), vault),
		{ kind: "work", label: "Work · Acme · App" },
	);
	assert.deepEqual(detectMetoniaSpace(path.join(vault, "Studio", "Video", "Concepts"), vault), {
		kind: "video",
		label: "Studio · Video",
	});
	assert.equal(detectMetoniaSpace(path.join(vault, "template", "Learning"), vault).kind, "learning");
	assert.equal(detectMetoniaSpace(path.resolve("C:/elsewhere"), vault).kind, "external");
});

test("Metonia interview presents its recommendation first", () => {
	const ordered = orderMetoniaOptions([
		{ label: "Manual" },
		{ label: "Automated", recommended: true },
		{ label: "Hybrid" },
	]);
	assert.deepEqual(ordered.map((option) => option.label), ["Automated", "Manual", "Hybrid"]);
});

test("Metonia interview returns structured TUI answers without a companion package", async () => {
	let registered: { execute: (...args: any[]) => Promise<any> } | undefined;
	registerMetoniaInterview({
		registerTool(tool: { execute: (...args: any[]) => Promise<any> }) {
			registered = tool;
		},
	} as any);
	assert.ok(registered);
	const seenRows: string[][] = [];
	const result = await registered.execute(
		"test",
		{
			questions: [
				{
					id: "storage",
					question: "Where should the plan live?",
					options: [
						{ label: "Repository", description: "Transient execution state" },
						{ label: "Obsidian", description: "Durable reviewed plan", recommended: true },
					],
				},
			],
		},
		undefined,
		undefined,
		{
			hasUI: true,
			ui: {
				select: async (_title: string, rows: string[]) => {
					seenRows.push(rows);
					return rows[0];
				},
				input: async () => undefined,
			},
		},
	);
	assert.match(seenRows[0][0], /Obsidian \[recommended\]/);
	assert.deepEqual(result.details.answers, [{ id: "storage", answer: "Obsidian", wasCustom: false }]);
	assert.equal(result.details.cancelled, false);
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
	await fs.writeFile(
		path.join(companyDir, "Company.md"),
		[
			"---",
			"sensitivity: restricted",
			"---",
			"# Acme",
			"## Context capsule",
			"- Company guardrail.",
			"## Decisions and improvement queue",
			"| ID | State | Decision or improvement | Evidence | Planning trigger |",
			"| --- | --- | --- | --- | --- |",
			"| ACME-001 | open | Resolve company policy. | Company docs | Before release |",
			"## Context index",
			"- [[Context/Operations]] — load when changing operations.",
			"- [[../invalid]] — malformed legacy link must not break routine retrieval.",
			"## Full-only company detail",
			"Do not inject this into routine coding.",
		].join("\n"),
	);
	await fs.mkdir(path.join(companyDir, "Context"));
	await fs.writeFile(
		path.join(companyDir, "Context", "Operations.md"),
		"---\nsensitivity: internal\n---\n# Operations detail\nTargeted company contract.",
	);
	await fs.mkdir(path.join(projectDir, "Context"));
	await fs.writeFile(
		path.join(projectDir, "Context", "Engineering.md"),
		"---\nsensitivity: public\n---\n# Engineering detail\nTargeted persistence contract.",
	);
	await fs.writeFile(
		path.join(projectDir, "Project.md"),
		[
			"---",
			"type: project",
			"repository: git@github.com:Acme/App.git",
			"sensitivity: internal",
			"verified_commit: deadbeef",
			"---",
			"# App",
			"## Context capsule",
			"- Project coding contract.",
			"## Decisions and improvement queue",
			"| ID | State | Decision or improvement | Evidence | Planning trigger |",
			"| --- | --- | --- | --- | --- |",
			"| APP-001 | deferred | Revisit storage. | src/db.ts | Storage plan |",
			"## Context index",
			"| Note | Load when | Sensitivity | Max bytes |",
			"| --- | --- | --- | --- |",
			"| [[Context/Engineering]] | Changing persistence | restricted | 128 |",
			"## Full-only project detail",
			"Do not inject this into routine coding.",
		].join("\n"),
	);
	await exec("git", ["init"], { cwd: repo });
	await exec("git", ["config", "user.email", "tests@metonia.invalid"], { cwd: repo });
	await exec("git", ["config", "user.name", "Metonia Tests"], { cwd: repo });
	await fs.writeFile(path.join(repo, "README.md"), "fixture");
	await exec("git", ["add", "README.md"], { cwd: repo });
	await exec("git", ["commit", "-m", "fixture"], { cwd: repo });
	const verifiedCommit = (await exec("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
	const projectPage = path.join(projectDir, "Project.md");
	await fs.writeFile(projectPage, (await fs.readFile(projectPage, "utf8")).replace("deadbeef", verifiedCommit));
	await exec("git", ["remote", "add", "origin", "https://github.com/acme/app.git"], { cwd: repo });

	const result = await resolveMetoniaContext({ vaultPath: vault, cwd: repo });
	assert.equal(result.matchedRemote, "github.com/acme/app");
	assert.match(result.company, /Company guardrail/);
	assert.match(result.project, /Project coding contract/);
	assert.doesNotMatch(result.company, /Resolve company policy|Full-only/);
	assert.doesNotMatch(result.project, /Revisit storage|Full-only/);
	assert.equal(result.profile, "coding");
	assert.equal(result.sensitivity, "restricted");
	assert.equal(result.freshness.status, "fresh");
	assert.deepEqual(result.legacyFallbacks, []);
	assert.equal(
		Object.keys(result).sort().join(","),
		"company,companyPath,contextBytes,contextNotes,freshness,legacyFallbacks,matchedRemote,notesOnly,profile,project,projectPath,repositoryRoot,sensitivity",
	);
	const visible = formatContextData(result);
	assert.doesNotMatch(visible, new RegExp(temp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.match(visible, /Profile: coding/);

	await fs.writeFile(path.join(repo, "new-untracked.ts"), "export {};\n");
	const dirty = await resolveMetoniaContext({ vaultPath: vault, cwd: repo });
	assert.equal(dirty.freshness.status, "dirty");
	await exec("git", ["add", "new-untracked.ts"], { cwd: repo });
	await exec("git", ["commit", "-m", "ahead"], { cwd: repo });
	const ahead = await resolveMetoniaContext({ vaultPath: vault, cwd: repo });
	assert.equal(ahead.freshness.status, "ahead");

	const planning = await resolveMetoniaContext({ vaultPath: vault, cwd: repo, profile: "planning" });
	assert.match(planning.company, /ACME-001/);
	assert.match(planning.project, /APP-001/);
	assert.match(planning.project, /Context\/Engineering/);
	assert.doesNotMatch(planning.project, /Full-only project detail/);
	const targeted = await resolveMetoniaContext({
		vaultPath: vault,
		cwd: repo,
		profile: "planning",
		contextNotes: ["Context/Engineering"],
		notesOnly: true,
	});
	assert.equal(targeted.contextNotes.length, 1);
	assert.equal(targeted.contextNotes[0].sensitivity, "restricted");
	assert.equal(targeted.company, "");
	assert.equal(targeted.project, "");
	assert.match(targeted.contextNotes[0].text, /Targeted persistence contract/);
	assert.doesNotMatch(targeted.contextNotes[0].text, /sensitivity: public/);
	const targetedVisible = formatContextData(targeted);
	assert.match(targetedVisible, /INDEXED CONTEXT DATA: project:Context\/Engineering/);
	assert.doesNotMatch(targetedVisible, /COMPANY CONTEXT DATA|PROJECT CONTEXT DATA/);
	await fs.writeFile(projectPage, (await fs.readFile(projectPage, "utf8")).replace("| restricted | 128 |", "| restricted | 10 |"));
	await assert.rejects(
		resolveMetoniaContext({
			vaultPath: vault,
			cwd: repo,
			profile: "planning",
			contextNotes: ["project:Context/Engineering"],
			notesOnly: true,
		}),
		(error: unknown) => error instanceof ContextResolutionError && error.code === "context-budget-exceeded",
	);
	const companyTargeted = await resolveMetoniaContext({
		vaultPath: vault,
		cwd: repo,
		profile: "planning",
		contextNotes: ["company:Context/Operations"],
		notesOnly: true,
	});
	assert.equal(companyTargeted.contextNotes[0].target, "company:Context/Operations");
	assert.match(companyTargeted.contextNotes[0].text, /Targeted company contract/);
	await assert.rejects(
		resolveMetoniaContext({
			vaultPath: vault,
			cwd: repo,
			profile: "planning",
			contextNotes: ["Context/Invented"],
		}),
		(error: unknown) => error instanceof ContextResolutionError && error.code === "invalid-context-note",
	);

	const full = await resolveMetoniaContext({ vaultPath: vault, cwd: repo, profile: "full" });
	assert.match(full.company, /Full-only company detail/);
	assert.match(full.project, /Full-only project detail/);

	await fs.writeFile(projectPage, (await fs.readFile(projectPage, "utf8")).replace(verifiedCommit, "HEAD"));
	const invalidProvenance = await resolveMetoniaContext({ vaultPath: vault, cwd: repo });
	assert.equal(invalidProvenance.freshness.status, "unknown");
	assert.equal(invalidProvenance.freshness.verifiedCommit, undefined);
});

test("resolver exposes bounded legacy fallback and refuses oversized compact context", async (t) => {
	const temp = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-context-budget-test-"));
	t.after(() => fs.rm(temp, { recursive: true, force: true }));
	const projectDir = path.join(temp, "Work", "Companies", "Acme", "Projects", "App");
	await fs.mkdir(projectDir, { recursive: true });
	await fs.writeFile(
		path.join(temp, "Work", "Companies", "Acme", "Company.md"),
		"---\nsensitivity: public\n---\n# Acme\nLegacy company context.",
	);
	await fs.writeFile(
		path.join(projectDir, "Project.md"),
		"---\nrepository: https://github.com/acme/app\nsensitivity: public\n---\n# App\n## Context capsule\n- Small project contract.",
	);

	const legacy = await resolveMetoniaContext({
		vaultPath: temp,
		cwd: temp,
		remote: "git@github.com:acme/app.git",
	});
	assert.deepEqual(legacy.legacyFallbacks, ["company"]);
	assert.match(formatContextData(legacy), /Legacy fallback: company/);
	await fs.writeFile(
		path.join(temp, "Work", "Companies", "Acme", "Company.md"),
		"---\nsensitivity: internal\n---\n# Acme\nLegacy company context.",
	);
	await assert.rejects(
		resolveMetoniaContext({ vaultPath: temp, cwd: temp, remote: "https://github.com/acme/app" }),
		(error: unknown) => error instanceof ContextResolutionError && error.code === "legacy-sensitive-context",
	);
	await fs.writeFile(
		path.join(temp, "Work", "Companies", "Acme", "Company.md"),
		"---\nsensitivity: public\n---\n# Acme\nLegacy company context.",
	);

	await fs.writeFile(
		path.join(projectDir, "Project.md"),
		`---\nrepository: https://github.com/acme/app\nsensitivity: public\n---\n# App\n## Context capsule\n${"x".repeat(17 * 1024)}`,
	);
	await assert.rejects(
		resolveMetoniaContext({ vaultPath: temp, cwd: temp, remote: "https://github.com/acme/app" }),
		(error: unknown) => error instanceof ContextResolutionError && error.code === "context-budget-exceeded",
	);
	await assert.rejects(
		resolveMetoniaContext({
			vaultPath: temp,
			cwd: temp,
			remote: "https://github.com/acme/app",
			profile: "typo" as any,
		}),
		(error: unknown) => error instanceof ContextResolutionError && error.code === "invalid-profile",
	);
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

test("repository inventory accounts for every tracked path deterministically", async (t) => {
	const repo = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-repository-inventory-test-"));
	t.after(() => fs.rm(repo, { recursive: true, force: true }));
	const fixture: Record<string, string> = {
		"AGENTS.md": "# Repository rules\n",
		"docs/architecture.md": "# Architecture\n",
		"src/routes/api.ts": "export const api = true;\n",
		"src/lib/server/db.ts": "export const db = true;\n",
		"src/lib/client/view.ts": "export const view = true;\n",
		"src/lib/shared/types.ts": "export type Id = string;\n",
		"tests/app.test.ts": "export {};\n",
		"deploy/Caddyfile": "example.test\n",
		"package.json": '{"name":"fixture"}\n',
		"messages/en.json": "{}\n",
	};
	for (const [relative, content] of Object.entries(fixture)) {
		const target = path.join(repo, ...relative.split("/"));
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, content);
	}
	await exec("git", ["init"], { cwd: repo });
	await exec("git", ["config", "user.email", "tests@metonia.invalid"], { cwd: repo });
	await exec("git", ["config", "user.name", "Metonia Tests"], { cwd: repo });
	await exec("git", ["add", "."], { cwd: repo });
	await exec("git", ["commit", "-m", "inventory fixture"], { cwd: repo });

	const inventory = await buildRepositoryInventory(repo);
	assert.equal(inventory.coverage.trackedFiles, Object.keys(fixture).length);
	assert.equal(inventory.files.length, Object.keys(fixture).length);
	assert.equal(inventory.repository.clean, true);
	assert.match(inventory.coverage.inventoryHash, /^[0-9a-f]{64}$/);
	assert.deepEqual(inventory.guidanceFiles, ["AGENTS.md"]);
	const categories = new Map(inventory.coverage.categories.map(({ name, count }) => [name, count]));
	for (const expected of [
		"instructions",
		"documentation",
		"routes-api",
		"server-runtime",
		"client-ui",
		"shared-contracts",
		"tests-quality",
		"delivery-operations",
		"build-configuration",
		"localization",
	]) {
		assert.equal(categories.get(expected), 1, `${expected} should contain one file`);
	}
	assert.ok(inventory.directories.some((directory) => directory.path === "src/lib/server" && directory.totalFiles === 1));

	await fs.writeFile(path.join(repo, "src", "lib", "server", "db.ts"), "export const db = false;\n");
	const dirtyInventory = await buildRepositoryInventory(repo);
	assert.equal(dirtyInventory.repository.clean, false);
	assert.equal(dirtyInventory.coverage.inventoryHash, inventory.coverage.inventoryHash);
});

test("Metonia sync targets scoped skills and removes retired project-learning copy", async (t) => {
	const template = await fs.mkdtemp(path.join(os.tmpdir(), "metonia-sync-test-"));
	t.after(() => fs.rm(template, { recursive: true, force: true }));
	const retired = path.join(template, "Work", ".agents", "skills", "project-learning", "SKILL.md");
	await fs.mkdir(path.dirname(retired), { recursive: true });
	await fs.writeFile(retired, "stale scoped copy");
	await syncMetonia(template);
	for (const relative of [
		"Learning/.agents/skills/doc-learning/SKILL.md",
		"Learning/.agents/skills/video-learning/SKILL.md",
		"Work/.agents/skills/project-planning/SKILL.md",
		"Studio/Video/.agents/skills/video-research/SKILL.md",
		"Studio/Video/.agents/skills/video-concept/SKILL.md",
		"Studio/Video/.agents/skills/video-review/SKILL.md",
	]) {
		await fs.access(path.join(template, ...relative.split("/")));
	}
	await assert.rejects(fs.access(retired));
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
