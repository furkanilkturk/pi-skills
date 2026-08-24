import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { assertCapabilityControls, CAPABILITIES, loadRoutingConfig, resolveRoute } from "./routing.mjs";
import { isStaleContextError, RunTracker } from "./run-tracker.mjs";
import { collectReviewContext } from "./review-context.mjs";
import { buildAuditRecord, buildChildTransport, classifyRuntimeFailure, selectSkillCandidate, sha256, validateResult, workspaceHash } from "./runtime-contract.mjs";
import { acquireWriterLock, assertVaultRoot } from "./writer-lock.mjs";

const READ_ONLY = new Set(["efficient-read", "fresh-review", "deep-decision"]);
const VAULT_WRITER_SKILLS = new Set([
	"add-project",
	"create-plan",
	"create-project",
	"delete-project",
	"doc-learning",
	"update-project",
	"video-learning",
]);
const OUTPUT_LIMIT = 60 * 1024;
const MODEL_CACHE_MS = 60_000;

let modelCache: { expiresAt: number; ids: Set<string> } | undefined;
const runTracker = new RunTracker();
let widgetClearTimer: ReturnType<typeof setTimeout> | undefined;

const bundledSkillsDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"skills",
);

type Usage = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
};

type RunDetails = {
	runId: string;
	profile: string;
	capability: string;
	agent: string;
	model: string;
	cwd: string;
	cwdHash: string;
	skill: string;
	skillSource: "bundled" | "global";
	skillSha256: string;
	skillCollision: "none" | "same-hash" | "different-hash";
	status: string;
	exitCode: number | null;
	usage: Usage;
	selectionSource: string;
	availableModelCount?: number;
	candidateIndex?: number;
	brokerError?: string;
	stderr?: string;
	auditError?: string;
	failureReason?: string;
	blockedStep?: string;
	blocker?: string;
	resumeWhen?: string;
};

function shortModel(model?: string): string {
	if (!model) return "selecting model";
	return model;
}

function localTime(value: number | Date = Date.now()): string {
	const date = value instanceof Date ? value : new Date(value);
	const pad = (part: number) => String(part).padStart(2, "0");
	return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function runLines(run: any, theme?: ExtensionContext["ui"]["theme"]): string[] {
	const passed = run.status === "passed";
	const markerText = passed ? "✓ done" : `! ${run.status}`;
	const marker = theme
		? theme.fg(passed ? "success" : "warning", markerText)
		: markerText;
	const lines = [`${marker}  ${run.agent ?? "broker"} · ${run.capability} · ${shortModel(run.model)} · ${localTime(run.finishedAt)}`];
	if (!passed) {
		const step = run.blockedStep ? `${run.blockedStep} · ` : "";
		lines.push(`  ↳ ${step}${run.blocker ?? run.failureReason ?? "No structured blocker was reported."}`);
		if (run.resumeWhen) lines.push(`    resume: ${run.resumeWhen}`);
	}
	return lines;
}

function renderRunTracker(ctx: ExtensionContext): void {
	if (widgetClearTimer) {
		clearTimeout(widgetClearTimer);
		widgetClearTimer = undefined;
	}
	const snapshot = runTracker.snapshot();
	const counts = [
		`${snapshot.running} running`,
		`${snapshot.queued} queued`,
		`${snapshot.completed} done`,
	];
	if (snapshot.issues > 0) counts.push(`${snapshot.issues} issues`);
	const summary = `Metonia agents: ${counts.join(" · ")}`;
	ctx.ui.setStatus("metonia-agents", ctx.ui.theme.fg(snapshot.issues > 0 ? "warning" : "accent", summary));

	const lines = [ctx.ui.theme.bold(summary)];
	for (const run of snapshot.active) {
		const queued = run.phase === "queued";
		const marker = queued ? ctx.ui.theme.fg("muted", "○ queued") : ctx.ui.theme.fg("accent", "● running");
		lines.push(`${marker}  ${run.agent ?? "broker"} · ${run.capability} · ${shortModel(run.model)}`);
	}
	for (const run of snapshot.recent.slice(0, snapshot.active.length > 0 ? 2 : 4)) {
		lines.push(...runLines(run, ctx.ui.theme));
	}
	ctx.ui.setWidget("metonia-agents", lines, { placement: "aboveEditor" });

	if (snapshot.active.length === 0) {
		widgetClearTimer = setTimeout(() => {
			try {
				if (runTracker.snapshot().active.length === 0) ctx.ui.setWidget("metonia-agents", undefined);
			} catch (error) {
				if (!isStaleContextError(error)) throw error;
			} finally {
				widgetClearTimer = undefined;
			}
		}, 20_000);
		widgetClearTimer.unref?.();
	}
}

async function availableModelIds(signal: AbortSignal): Promise<Set<string>> {
	if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.ids;
	const runtime = await ModelRuntime.create();
	const models = await runtime.getAvailable(undefined, { signal });
	const ids = new Set(models.map((model: any) => `${model.provider}/${model.id}`));
	modelCache = { expiresAt: Date.now() + MODEL_CACHE_MS, ids };
	return ids;
}

function piInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtual = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtual && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const runtime = path.basename(process.execPath).toLowerCase();
	return /^(node|bun)(\.exe)?$/.test(runtime)
		? { command: "pi", args }
		: { command: process.execPath, args };
}

function finalText(message: any): string {
	if (message?.role !== "assistant" || !Array.isArray(message.content)) return "";
	return message.content
		.filter((part: any) => part?.type === "text" && typeof part.text === "string")
		.map((part: any) => part.text)
		.join("\n");
}

function resolveSkillPath(skill: string): { path: string; source: "bundled" | "global"; sha256: string; collision: "none" | "same-hash" | "different-hash" } | undefined {
	const candidates = [
		{ path: path.join(bundledSkillsDir, skill, "SKILL.md"), source: "bundled" as const },
		{ path: path.join(getAgentDir(), "skills", skill, "SKILL.md"), source: "global" as const },
	].map((candidate) => {
		const exists = fs.existsSync(candidate.path);
		return { ...candidate, exists, sha256: exists ? sha256(fs.readFileSync(candidate.path)) : undefined };
	});
	const selected = selectSkillCandidate(candidates);
	return selected && { path: selected.path, source: selected.source, sha256: selected.sha256!, collision: selected.collision };
}

function outputContract(agent: string, capability: string, criteria: string[], evidence: string[], sharedVaultWrite: boolean): string {
	const access = READ_ONLY.has(capability)
		? "You are read-only. Do not call edit or write tools and do not mutate files through shell commands."
		: "You are the only writer for this cwd. Stay inside the exact task scope and stop on scope growth.";
	return [
		`You are the Metonia ${agent} for capability ${capability}.`,
		access,
		...(sharedVaultWrite ? ["This is a shared-vault write. Re-read every target vault file after the lock is held and immediately before its first write; preserve unrelated concurrent sections."] : []),
		"Do not delegate or spawn another agent. Start from only the supplied task, target skill, repository context files, and current working tree.",
		"Acceptance criteria:",
		...criteria.map((item) => `- ${item}`),
		"Required evidence:",
		...evidence.map((item) => `- ${item}`),
		"End the final response with exactly one status block:",
		"METONIA_RESULT: PASS",
		"or METONIA_RESULT: BLOCKED",
		"When BLOCKED, put these three single-line, redacted fields immediately after the status:",
		"METONIA_BLOCKED_STEP: <step, gate, or task area>",
		"METONIA_BLOCKER: <specific human-readable reason; no secrets, paths, stderr, or stack traces>",
		"METONIA_RESUME_WHEN: <exact condition that permits progress>",
		"METONIA_EVIDENCE:",
		...evidence.map((item) => `- ${item}: <result>`),
		"Use those exact evidence labels. Do not rename, translate, merge, or omit them.",
	].join("\n");
}

function appendAudit(details: RunDetails, task: string): string | undefined {
	try {
		const auditPath = path.join(getAgentDir(), "metonia-runs.jsonl");
		const record = buildAuditRecord(details, task);
		fs.appendFileSync(auditPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
		return undefined;
	} catch (error: any) {
		return error?.message ?? String(error);
	}
}

const Parameters = Type.Object({
	capability: Type.Union(CAPABILITIES.map((value) => Type.Literal(value)), {
		description: "Provider-neutral work class chosen before model selection",
	}),
	task: Type.String({ description: "Exact bounded task, inputs, scope, and stop conditions" }),
	skill: Type.String({ description: "Installed Metonia skill name to inject into the fresh child" }),
	cwd: Type.String({ description: "Absolute or parent-cwd-relative working directory" }),
	criteria: Type.Array(Type.String(), { minItems: 1, description: "Observable pass conditions" }),
	evidence: Type.Array(Type.String(), { minItems: 1, description: "Named evidence the child must report" }),
	reviewBase: Type.Optional(Type.String({ description: "Git base commit/ref used by fresh-review to attach an automatic read-only diff snapshot" })),
	profile: Type.Optional(Type.String({ description: "Optional routing profile override for this run" })),
	controls: Type.Optional(Type.Object({
		risk: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high"), Type.Literal("critical")])),
		writeFiles: Type.Optional(Type.Array(Type.String())),
		deterministicChecks: Type.Optional(Type.Boolean()),
		sensitiveDecision: Type.Optional(Type.Boolean()),
		externalEffect: Type.Optional(Type.Boolean()),
		humanGate: Type.Optional(Type.Boolean()),
		baseCommitMatches: Type.Optional(Type.Boolean()),
		sourceCount: Type.Optional(Type.Integer({ minimum: 1 })),
		sourceConfidence: Type.Optional(Type.Union([Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")])),
		dense: Type.Optional(Type.Boolean()),
		highlyTechnical: Type.Optional(Type.Boolean()),
	}, { description: "Required eligibility evidence for bounded code or learning routes" })),
});

export default function registerMetoniaDelegate(pi: ExtensionAPI): void {
	if (process.env.METONIA_DELEGATE_CHILD === "1") return;

	pi.registerCommand("metonia-status", {
		description: "Show active and recent Metonia agent runs with blocker details",
		handler: async (_args, ctx) => {
			const snapshot = runTracker.snapshot();
			if (snapshot.active.length === 0 && snapshot.recent.length === 0) {
				ctx.ui.notify("No Metonia agent runs in this session.", "info");
				return;
			}
			const lines = [`Metonia agents: ${snapshot.running} running · ${snapshot.queued} queued · ${snapshot.completed} done · ${snapshot.issues} issues`];
			for (const run of snapshot.active) lines.push(`● ${run.phase} · ${run.agent ?? "broker"} · ${run.capability} · ${shortModel(run.model)}`);
			for (const run of snapshot.recent) lines.push(...runLines(run));
			ctx.ui.notify(lines.join("\n"), snapshot.issues > 0 ? "warning" : "info");
			renderRunTracker(ctx);
		},
	});

	pi.registerTool({
		name: "metonia_delegate",
		label: "Metonia Delegate",
		description: "Run one Metonia task in a fresh Pi child. The automatic broker chooses the first capability-ranked model available through the current Pi logins, then falls back to the parent model. Use only for Metonia coding/vault workflows; children cannot delegate again.",
		parameters: Parameters,
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const runId = randomUUID();
			runTracker.queue(runId, params.capability);
			renderRunTracker(ctx);
			let releaseLock: (() => void) | undefined;
			let promptDir: string | undefined;
			let details: RunDetails | undefined;

			try {
				if (!/^[a-z0-9-]+$/.test(params.skill)) throw new Error("skill must be a hyphen-case installed skill name");
				const cwd = path.resolve(ctx.cwd, params.cwd);
				if (!fs.statSync(cwd).isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
				const skill = resolveSkillPath(params.skill);
				if (!skill) throw new Error(`installed skill not found: ${params.skill}`);

				const { config } = loadRoutingConfig();
				const requestedProfile = params.profile ?? process.env.METONIA_ROUTING_PROFILE ?? config.active_profile;
				let availableModels: Set<string> | undefined;
				let brokerError: string | undefined;
				if (requestedProfile === "auto") {
					try {
						availableModels = await availableModelIds(signal);
					} catch (error: any) {
						availableModels = new Set();
						brokerError = error?.message ?? String(error);
					}
				}
				const route = resolveRoute(params.capability, {
					profile: requestedProfile,
					availableModels,
				});
				const model = route.model === "$parent"
					? ctx.model
						? `${ctx.model.provider}/${ctx.model.id}:${ctx.thinkingLevel ?? "medium"}`
						: undefined
					: route.model;
				if (!model) throw new Error("portable routing requires a parent session model");
				details = {
					runId,
					profile: route.profile,
					capability: params.capability,
					agent: route.agent,
					model,
					cwd,
					cwdHash: workspaceHash(cwd),
					skill: params.skill,
					skillSource: skill.source,
					skillSha256: skill.sha256,
					skillCollision: skill.collision,
					status: "running",
					exitCode: null,
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
					selectionSource: route.selection_source,
					availableModelCount: availableModels?.size,
					candidateIndex: route.candidate_index ?? undefined,
					brokerError,
				};
				assertCapabilityControls(params.capability, params.controls);
				const sharedVaultWrite = !READ_ONLY.has(params.capability) && VAULT_WRITER_SKILLS.has(params.skill);
				const lockScope = sharedVaultWrite ? assertVaultRoot(cwd) : cwd;
				if (!READ_ONLY.has(params.capability)) releaseLock = acquireWriterLock(getAgentDir(), lockScope);

				promptDir = fs.mkdtempSync(path.join(os.tmpdir(), "metonia-delegate-"));
				const promptPath = path.join(promptDir, "contract.md");
				fs.writeFileSync(promptPath, outputContract(route.agent, params.capability, params.criteria, params.evidence, sharedVaultWrite), { encoding: "utf8", mode: 0o600 });

				const tools = READ_ONLY.has(params.capability)
					? ["read", "grep", "find", "ls"]
					: ["read", "bash", "edit", "write", "grep", "find", "ls"];
				const automaticReviewContext = params.capability === "fresh-review"
					? collectReviewContext(cwd, params.reviewBase)
					: undefined;
				const childTask = automaticReviewContext
					? `${params.task}\n\n${automaticReviewContext}`
					: params.task;
				const transport = buildChildTransport({
					skillPath: skill.path,
					model,
					tools,
					promptPath,
					task: childTask,
				});

				onUpdate?.({ content: [{ type: "text", text: `${route.profile}/${params.capability}: ${model}` }], details });
				let output = "";
				let stderr = "";
				let childModelError = false;
				let timedOut = false;
				let processError: Error | undefined;
				const invocation = piInvocation(transport.args);
				const proc = spawn(invocation.command, invocation.args, {
					cwd,
					shell: false,
					stdio: ["pipe", "pipe", "pipe"],
					env: { ...process.env, METONIA_DELEGATE_CHILD: "1" },
				});
				proc.stdin.on("error", () => { /* child exit can close stdin before the write completes */ });
				proc.stdin.end(transport.stdin);
				runTracker.start(runId, { agent: route.agent, model });
				renderRunTracker(ctx);
				let buffer = "";

				const consume = (line: string) => {
					if (!line.trim()) return;
					try {
						const event = JSON.parse(line);
						if (event.type !== "message_end") return;
						if (event.message?.role === "assistant" && event.message?.stopReason === "error") {
							childModelError = true;
						}
						const text = finalText(event.message);
						if (text) output = text;
						if (event.message?.role === "assistant") {
							const usage = event.message.usage ?? {};
							details!.usage.turns++;
							details!.usage.input += usage.input ?? 0;
							details!.usage.output += usage.output ?? 0;
							details!.usage.cacheRead += usage.cacheRead ?? 0;
							details!.usage.cacheWrite += usage.cacheWrite ?? 0;
							details!.usage.cost += usage.cost?.total ?? 0;
						}
						onUpdate?.({ content: [{ type: "text", text: output || "(running)" }], details: details! });
					} catch { /* ignore non-JSON diagnostics */ }
				};

				proc.stdout.on("data", (chunk) => {
					buffer += chunk.toString();
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) consume(line);
				});
				proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

				let forceStop: ReturnType<typeof setTimeout> | undefined;
				const stop = () => {
					if (proc.exitCode !== null) return;
					try { proc.kill("SIGTERM"); } catch { return; }
					forceStop ??= setTimeout(() => {
						if (proc.exitCode === null) {
							try { proc.kill("SIGKILL"); } catch { /* already exited */ }
						}
					}, 5000);
				};
				if (signal.aborted) stop();
				else signal.addEventListener("abort", stop, { once: true });
				const timeout = setTimeout(() => { timedOut = true; stop(); }, route.timeout_seconds * 1000);
				const exitCode = await new Promise<number>((resolve) => {
					proc.on("close", (code) => resolve(code ?? 1));
					proc.on("error", (error) => {
						processError = error;
						resolve(1);
					});
				});
				clearTimeout(timeout);
				if (forceStop) clearTimeout(forceStop);
				if (buffer.trim()) consume(buffer);

				details.exitCode = exitCode;
				details.stderr = (stderr.trim() || processError?.message)?.slice(0, 4000) || undefined;
				const contract = childModelError
					? { ok: false, status: "model-error", reason: "child model failed before producing a valid result; check provider authentication or quota", reasonCode: "child-model-error" }
					: validateResult(output, params.evidence);
				if (timedOut) {
					details.status = "timed-out";
					details.failureReason = "timeout";
				} else if (signal.aborted) {
					details.status = "aborted";
					details.failureReason = "aborted";
				} else if (processError) {
					details.status = "failed";
					details.failureReason = classifyRuntimeFailure(processError);
				} else if (exitCode !== 0) {
					details.status = "failed";
					details.failureReason = "child-exit-nonzero";
				} else {
					details.status = contract.status;
					details.failureReason = contract.reasonCode;
					details.blockedStep = contract.blockedStep;
					details.blocker = contract.blocker;
					details.resumeWhen = contract.resumeWhen;
				}
				details.auditError = appendAudit(details, params.task);

				const ok = exitCode === 0 && !timedOut && !signal.aborted && contract.ok;
				const diagnostic = details.failureReason === contract.reasonCode
					? contract.reason
					: details.stderr ?? contract.reason ?? details.status;
				const blockerLines = details.blocker
					? [`step: ${details.blockedStep ?? "unspecified"}`, `blocker: ${details.blocker}`, `resume: ${details.resumeWhen ?? "unspecified"}`]
					: [];
				const prefix = ok
					? ""
					: details.blocker
						? `[${details.failureReason ?? "child-blocked"}] ${localTime()}\n${blockerLines.join("\n")}\n\n`
						: `[${details.failureReason ?? "unknown"}] ${localTime()} · ${diagnostic}\n\n`;
				return {
					content: [{ type: "text", text: `${prefix}${output || stderr || "(no child output)"}`.slice(0, OUTPUT_LIMIT) }],
					details,
					isError: !ok,
				};
			} catch (error: any) {
				const message = error?.message ?? String(error);
				if (details) {
					details.status = "failed";
					details.stderr = message;
					details.failureReason = classifyRuntimeFailure(error);
					details.auditError = appendAudit(details, params.task);
				}
				return { content: [{ type: "text", text: `Metonia delegation failed: ${message}` }], details, isError: true };
			} finally {
				releaseLock?.();
				if (promptDir) fs.rmSync(promptDir, { recursive: true, force: true });
				runTracker.finish(runId, details?.status === "running" || !details?.status ? "failed" : details.status, {
					agent: details?.agent,
					model: details?.model,
					failureReason: details?.failureReason,
					blockedStep: details?.blockedStep,
					blocker: details?.blocker,
					resumeWhen: details?.resumeWhen,
				});
				renderRunTracker(ctx);
			}
		},
	});
}
