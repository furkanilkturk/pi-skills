import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { assertCapabilityControls, CAPABILITIES, loadRoutingConfig, resolveRoute } from "./routing.mjs";
import { buildAuditRecord, selectSkillCandidate, sha256, workspaceHash } from "./runtime-contract.mjs";

const READ_ONLY = new Set(["efficient-read", "fresh-review", "deep-decision"]);
const OUTPUT_LIMIT = 60 * 1024;
const MODEL_CACHE_MS = 60_000;

let modelCache: { expiresAt: number; ids: Set<string> } | undefined;

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
};

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

function outputContract(agent: string, capability: string, criteria: string[], evidence: string[]): string {
	const access = READ_ONLY.has(capability)
		? "You are read-only. Do not call edit or write tools and do not mutate files through shell commands."
		: "You are the only writer for this cwd. Stay inside the exact task scope and stop on scope growth.";
	return [
		`You are the Metonia ${agent} for capability ${capability}.`,
		access,
		"Do not delegate or spawn another agent. Start from only the supplied task, target skill, repository context files, and current working tree.",
		"Acceptance criteria:",
		...criteria.map((item) => `- ${item}`),
		"Required evidence:",
		...evidence.map((item) => `- ${item}`),
		"End the final response with exactly one status line followed by an evidence section:",
		"METONIA_RESULT: PASS",
		"or METONIA_RESULT: BLOCKED",
		"METONIA_EVIDENCE:",
		"- <evidence-name>: <result>",
	].join("\n");
}

function processAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error: any) {
		return error?.code === "EPERM";
	}
}

function acquireWriterLock(cwd: string): () => void {
	const lockDir = path.join(getAgentDir(), "metonia-locks");
	fs.mkdirSync(lockDir, { recursive: true });
	const key = workspaceHash(cwd);
	const lockPath = path.join(lockDir, `${key}.lock`);

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const fd = fs.openSync(lockPath, "wx", 0o600);
			try {
				fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, cwd_sha256: key, started_at: new Date().toISOString() }));
			} catch (error) {
				try { fs.unlinkSync(lockPath); } catch { /* best effort */ }
				throw error;
			} finally {
				fs.closeSync(fd);
			}
			return () => {
				try { fs.unlinkSync(lockPath); } catch { /* already released */ }
			};
		} catch (error: any) {
			if (error?.code !== "EEXIST") throw error;
			try {
				const stale = JSON.parse(fs.readFileSync(lockPath, "utf8"));
				if (Number.isInteger(stale.pid) && !processAlive(stale.pid)) {
					fs.unlinkSync(lockPath);
					continue;
				}
			} catch (readError: any) {
				if (readError?.code === "ENOENT") continue;
			}
			throw new Error("another Metonia writer is active for this working directory");
		}
	}
	throw new Error("could not acquire the Metonia writer lock for this working directory");
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

function validateResult(output: string, evidence: string[]): { ok: boolean; status: string; reason?: string } {
	if (/^METONIA_RESULT:\s*BLOCKED\s*$/mi.test(output)) return { ok: false, status: "blocked" };
	if (!/^METONIA_RESULT:\s*PASS\s*$/mi.test(output)) {
		return { ok: false, status: "invalid-contract", reason: "child omitted METONIA_RESULT" };
	}
	const missing = evidence.filter((name) => !output.toLowerCase().includes(name.toLowerCase()));
	if (missing.length > 0) {
		return { ok: false, status: "invalid-contract", reason: `missing evidence labels: ${missing.join(", ")}` };
	}
	return { ok: true, status: "passed" };
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

	pi.registerTool({
		name: "metonia_delegate",
		label: "Metonia Delegate",
		description: "Run one Metonia task in a fresh Pi child. The automatic broker chooses the first capability-ranked model available through the current Pi logins, then falls back to the parent model. Use only for Metonia coding/vault workflows; children cannot delegate again.",
		parameters: Parameters,
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const runId = randomUUID();
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
				if (!READ_ONLY.has(params.capability)) releaseLock = acquireWriterLock(cwd);

				promptDir = fs.mkdtempSync(path.join(os.tmpdir(), "metonia-delegate-"));
				const promptPath = path.join(promptDir, "contract.md");
				fs.writeFileSync(promptPath, outputContract(route.agent, params.capability, params.criteria, params.evidence), { encoding: "utf8", mode: 0o600 });

				const tools = READ_ONLY.has(params.capability)
					? ["read", "grep", "find", "ls"]
					: ["read", "bash", "edit", "write", "grep", "find", "ls"];
				const args = [
					"--mode", "json", "-p", "--no-session", "--no-extensions",
					"--no-skills", "--skill", skill.path,
					"--model", model,
					"--tools", tools.join(","),
					"--exclude-tools", "metonia_delegate,subagent",
					"--append-system-prompt", promptPath,
					params.task,
				];

				onUpdate?.({ content: [{ type: "text", text: `${route.profile}/${params.capability}: ${model}` }], details });
				let output = "";
				let stderr = "";
				let childModelError = false;
				let timedOut = false;
				const invocation = piInvocation(args);
				const proc = spawn(invocation.command, invocation.args, {
					cwd,
					shell: false,
					stdio: ["ignore", "pipe", "pipe"],
					env: { ...process.env, METONIA_DELEGATE_CHILD: "1" },
				});
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
					proc.on("error", () => resolve(1));
				});
				clearTimeout(timeout);
				if (forceStop) clearTimeout(forceStop);
				if (buffer.trim()) consume(buffer);

				details.exitCode = exitCode;
				details.stderr = stderr.trim().slice(0, 4000) || undefined;
				const contract = childModelError
					? { ok: false, status: "model-error", reason: "child model failed before producing a valid result; check provider authentication or quota" }
					: validateResult(output, params.evidence);
				if (timedOut) details.status = "timed-out";
				else if (signal.aborted) details.status = "aborted";
				else if (exitCode !== 0) details.status = "failed";
				else details.status = contract.status;
				details.auditError = appendAudit(details, params.task);

				const ok = exitCode === 0 && !timedOut && !signal.aborted && contract.ok;
				const prefix = ok ? "" : `${contract.reason ?? details.status}\n\n`;
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
					details.auditError = appendAudit(details, params.task);
				}
				return { content: [{ type: "text", text: `Metonia delegation failed: ${message}` }], details, isError: true };
			} finally {
				releaseLock?.();
				if (promptDir) fs.rmSync(promptDir, { recursive: true, force: true });
			}
		},
	});
}
