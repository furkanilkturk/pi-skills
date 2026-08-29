import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface UsageSummary {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
}

export interface ChildBudget {
	maxTurns?: number;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	maxCost?: number;
}

export type ChildTerminationReason = "budget" | "timeout" | "cancelled" | "output-limit";

export interface ChildResult {
	status: "completed" | "blocked" | "failed" | "aborted";
	terminationReason?: ChildTerminationReason;
	output: string;
	error?: string;
	blocker?: {
		reason: string;
		owner: string;
		resumeCondition: string;
		nextAction: string;
	};
	usage: UsageSummary;
	model?: string;
}

const STATUS_FOOTER = /\n?<!--\s*TASK_AGENT_STATUS\s*\r?\n([\s\S]*?)\r?\n-->\s*$/i;
const MAX_CHILD_STDOUT_BYTES = 64 * 1024 * 1024;
const MAX_CHILD_JSON_EVENT_BYTES = 8 * 1024 * 1024;
const MAX_CHILD_STDERR_BYTES = 1024 * 1024;
const MAX_CAPTURED_ASSISTANT_OUTPUT_BYTES = 256 * 1024;

export function truncateUtf8Prefix(text: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	let low = 0;
	let high = text.length;
	let best = 0;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		if (Buffer.byteLength(text.slice(0, middle), "utf8") <= maxBytes) {
			best = middle;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	const last = text.charCodeAt(best - 1);
	const next = text.charCodeAt(best);
	if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) best -= 1;
	return text.slice(0, best);
}

export function clipUtf8(text: string, maxBytes: number): string {
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	const marker = "\n\n[Child output truncated at the process capture limit.]";
	if (Buffer.byteLength(marker, "utf8") >= maxBytes) {
		return truncateUtf8Prefix(marker, maxBytes);
	}
	const contentLimit = Math.max(0, maxBytes - Buffer.byteLength(marker, "utf8"));
	return `${truncateUtf8Prefix(text, contentLimit)}${marker}`;
}

function childWillContinue(stopReason: string | undefined): boolean {
	return stopReason?.toLowerCase() === "tooluse";
}

export function findBudgetViolation(
	usage: UsageSummary,
	budget: ChildBudget | undefined,
	stopReason?: string,
): string | undefined {
	if (!budget) return undefined;
	if (budget.maxTurns !== undefined && usage.turns > budget.maxTurns) {
		return `Child exceeded the configured ${budget.maxTurns}-turn limit.`;
	}
	if (budget.maxTurns !== undefined && usage.turns >= budget.maxTurns && childWillContinue(stopReason)) {
		return `Child reached the configured ${budget.maxTurns}-turn limit before another tool round.`;
	}
	if (budget.maxInputTokens !== undefined && usage.input > budget.maxInputTokens) {
		return `Child exceeded the configured ${budget.maxInputTokens.toLocaleString()} input-token limit.`;
	}
	if (budget.maxOutputTokens !== undefined && usage.output > budget.maxOutputTokens) {
		return `Child exceeded the configured ${budget.maxOutputTokens.toLocaleString()} output-token limit.`;
	}
	if (budget.maxCost !== undefined && usage.cost > budget.maxCost) {
		return `Child exceeded the configured $${budget.maxCost.toFixed(4)} reported-cost limit.`;
	}
	return undefined;
}

export function parseTaskStatusFooter(output: string): {
	output: string;
	status?: "completed" | "blocked";
	blocker?: ChildResult["blocker"];
} {
	const match = output.match(STATUS_FOOTER);
	if (!match) return { output };
	const fields = new Map<string, string>();
	for (const line of match[1].split(/\r?\n/)) {
		const field = line.match(/^([a-z_]+):\s*(.*)$/i);
		if (field) fields.set(field[1].toLowerCase(), field[2].trim());
	}
	const status = fields.get("status")?.toLowerCase();
	if (status !== "completed" && status !== "blocked") return { output };
	if (status === "completed") return { output: output.replace(STATUS_FOOTER, "").trimEnd(), status };
	return {
		output: output.replace(STATUS_FOOTER, "").trimEnd(),
		status,
		blocker: {
			reason: fields.get("blocker") || "Child reported a blocker without a reason.",
			owner: fields.get("owner") || "unspecified",
			resumeCondition: fields.get("resume_when") || "blocker is resolved",
			nextAction: fields.get("next_action") || "clarify the blocking condition",
		},
	};
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const executable = path.basename(process.execPath).toLowerCase();
	if (!/^(node|bun)(\.exe)?$/.test(executable)) return { command: process.execPath, args };
	return { command: "pi", args };
}

function extractText(message: Record<string, unknown>): string {
	if (message.role !== "assistant" || !Array.isArray(message.content)) return "";
	return message.content
		.filter((part): part is { type: string; text: string } => {
			return Boolean(part && typeof part === "object" && part.type === "text" && typeof part.text === "string");
		})
		.map((part) => part.text)
		.join("\n");
}

export function buildPiChildArgs(options: {
	task: string;
	model: string;
	thinking: string;
	readOnly: boolean;
	skills: string[];
}): string[] {
	return [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--no-extensions",
		"--no-skills",
		...options.skills.flatMap((skill) => ["--skill", skill]),
		...(options.readOnly ? ["--tools", "read,grep,find,ls"] : []),
		"--model",
		options.model,
		"--thinking",
		options.thinking,
		`Task: ${options.task}`,
	];
}

export async function runPiChild(options: {
	cwd: string;
	task: string;
	model: string;
	thinking: string;
	signal?: AbortSignal;
	timeoutSeconds: number;
	readOnly: boolean;
	skills: string[];
	budget?: ChildBudget;
	onStatus?: (status: string) => void;
}, invocationOverride?: { command: string; args: string[] }): Promise<ChildResult> {
	const args = buildPiChildArgs(options);
	const invocation = invocationOverride ?? getPiInvocation(args);
	const usage: UsageSummary = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
	let output = "";
	let stderr = "";
	let stopReason: string | undefined;
	let errorMessage: string | undefined;
	let budgetViolation: string | undefined;
	let terminationReason: ChildTerminationReason | undefined;
	let terminationMessage: string | undefined;
	let aborted = false;

	const exitCode = await new Promise<number>((resolve) => {
		const child = spawn(invocation.command, invocation.args, {
			cwd: options.cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let buffer = "";
		let closed = false;
		let killStarted = false;
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let fallbackTimer: NodeJS.Timeout | undefined;
		let forceTimer: NodeJS.Timeout | undefined;

		const fallbackKill = () => {
			if (!closed) child.kill("SIGTERM");
		};

		const terminate = (reason: ChildTerminationReason, message: string) => {
			terminationReason ??= reason;
			terminationMessage ??= message;
			aborted = true;
			if (closed || killStarted) return;
			killStarted = true;

			if (process.platform === "win32" && child.pid) {
				const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
					shell: false,
					stdio: "ignore",
					windowsHide: true,
				});
				killer.once("error", fallbackKill);
				killer.once("close", (code) => {
					if (code !== 0) fallbackKill();
				});
				killer.unref();
				fallbackTimer = setTimeout(fallbackKill, 3_000);
				fallbackTimer.unref();
			} else {
				fallbackKill();
			}

			forceTimer = setTimeout(() => {
				if (!closed) child.kill("SIGKILL");
			}, 5_000);
			forceTimer.unref();
		};

		const appendStderr = (value: string) => {
			stderr = clipUtf8(`${stderr}${value}`, MAX_CHILD_STDERR_BYTES);
		};

		const processLine = (line: string) => {
			if (!line.trim()) return;
			let event: Record<string, unknown>;
			try {
				event = JSON.parse(line) as Record<string, unknown>;
			} catch {
				return;
			}
			if (event.type !== "message_end" || !event.message || typeof event.message !== "object") return;
			const message = event.message as Record<string, unknown>;
			const text = extractText(message);
			if (text) output = clipUtf8(text, MAX_CAPTURED_ASSISTANT_OUTPUT_BYTES);
			if (message.role === "assistant") {
				usage.turns += 1;
				if (message.model && typeof message.model === "string") options.onStatus?.(`turn ${usage.turns} · ${message.model}`);
				const rawUsage = message.usage as Record<string, unknown> | undefined;
				if (rawUsage) {
					usage.input += Number(rawUsage.input) || 0;
					usage.output += Number(rawUsage.output) || 0;
					usage.cacheRead += Number(rawUsage.cacheRead) || 0;
					usage.cacheWrite += Number(rawUsage.cacheWrite) || 0;
					const cost = rawUsage.cost as Record<string, unknown> | undefined;
					usage.cost += Number(cost?.total) || 0;
				}
				if (typeof message.stopReason === "string") stopReason = message.stopReason;
				if (typeof message.errorMessage === "string") errorMessage = message.errorMessage;
				budgetViolation ??= findBudgetViolation(usage, options.budget, stopReason);
				if (budgetViolation) terminate("budget", budgetViolation);
			}
		};

		child.stdout.on("data", (data: Buffer) => {
			stdoutBytes += data.length;
			if (stdoutBytes > MAX_CHILD_STDOUT_BYTES) {
				buffer = "";
				terminate("output-limit", `Child stdout exceeded the ${MAX_CHILD_STDOUT_BYTES.toLocaleString()}-byte stream limit.`);
				return;
			}
			buffer += data.toString();
			if (Buffer.byteLength(buffer, "utf8") > MAX_CHILD_JSON_EVENT_BYTES) {
				buffer = "";
				terminate("output-limit", `Child emitted a JSON event larger than ${MAX_CHILD_JSON_EVENT_BYTES.toLocaleString()} bytes.`);
				return;
			}
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});
		child.stderr.on("data", (data: Buffer) => {
			stderrBytes += data.length;
			appendStderr(data.toString());
			if (stderrBytes > MAX_CHILD_STDERR_BYTES) {
				terminate("output-limit", `Child stderr exceeded the ${MAX_CHILD_STDERR_BYTES.toLocaleString()}-byte stream limit.`);
			}
		});

		const timeout = setTimeout(
			() => terminate("timeout", `Child exceeded the configured ${options.timeoutSeconds}-second timeout.`),
			options.timeoutSeconds * 1_000,
		);
		timeout.unref();
		const cancel = () => terminate("cancelled", "Child was cancelled by the parent.");
		if (options.signal?.aborted) cancel();
		else options.signal?.addEventListener("abort", cancel, { once: true });

		child.on("close", (code) => {
			closed = true;
			if (buffer.trim()) processLine(buffer);
			clearTimeout(timeout);
			if (fallbackTimer) clearTimeout(fallbackTimer);
			if (forceTimer) clearTimeout(forceTimer);
			options.signal?.removeEventListener("abort", cancel);
			resolve(code ?? 1);
		});
		child.on("error", (error) => {
			appendStderr(error.message);
		});
	});

	const parsed = parseTaskStatusFooter(output || "(no assistant output)");
	const failedByModel = stopReason === "error" || stopReason === "aborted";
	return {
		status:
			aborted || terminationReason !== undefined || stopReason === "aborted"
				? "aborted"
				: exitCode === 0 && !failedByModel
					? parsed.status ?? "completed"
					: "failed",
		output: parsed.output,
		terminationReason,
		error: errorMessage || budgetViolation || terminationMessage || stderr.trim() || undefined,
		blocker: parsed.blocker,
		usage,
		model: options.model,
	};
}
