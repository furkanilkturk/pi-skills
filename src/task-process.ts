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

export interface ChildResult {
	status: "completed" | "blocked" | "failed" | "aborted";
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
	onStatus?: (status: string) => void;
}): Promise<ChildResult> {
	const args = buildPiChildArgs(options);
	const invocation = getPiInvocation(args);
	const usage: UsageSummary = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
	let output = "";
	let stderr = "";
	let stopReason: string | undefined;
	let errorMessage: string | undefined;
	let aborted = false;

	const exitCode = await new Promise<number>((resolve) => {
		const child = spawn(invocation.command, invocation.args, {
			cwd: options.cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let buffer = "";

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
			if (text) output = text;
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
			}
		};

		child.stdout.on("data", (data: Buffer) => {
			buffer += data.toString();
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});
		child.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		let forceTimer: NodeJS.Timeout | undefined;
		const terminate = () => {
			if (aborted) return;
			aborted = true;
			if (process.platform === "win32" && child.pid) {
				const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
					shell: false,
					stdio: "ignore",
					windowsHide: true,
				});
				killer.on("error", () => child.kill("SIGTERM"));
				killer.unref();
			} else {
				child.kill("SIGTERM");
				forceTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
				forceTimer.unref();
			}
		};
		const timeout = setTimeout(terminate, options.timeoutSeconds * 1_000);
		timeout.unref();
		if (options.signal?.aborted) terminate();
		else options.signal?.addEventListener("abort", terminate, { once: true });

		child.on("close", (code) => {
			if (buffer.trim()) processLine(buffer);
			clearTimeout(timeout);
			if (forceTimer) clearTimeout(forceTimer);
			options.signal?.removeEventListener("abort", terminate);
			resolve(code ?? 1);
		});
		child.on("error", (error) => {
			stderr += error.message;
		});
	});

	const parsed = parseTaskStatusFooter(output || "(no assistant output)");
	const failedByModel = stopReason === "error" || stopReason === "aborted";
	return {
		status:
			aborted || stopReason === "aborted"
				? "aborted"
				: exitCode === 0 && !failedByModel
					? parsed.status ?? "completed"
					: "failed",
		output: parsed.output,
		error: errorMessage || stderr.trim() || undefined,
		blocker: parsed.blocker,
		usage,
		model: options.model,
	};
}
