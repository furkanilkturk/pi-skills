import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum, type Api, type Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { modelRef, routeModel, type TaskComplexity } from "../../src/model-router.ts";

export interface MetoniaInterviewOption {
	label: string;
	description?: string;
	recommended?: boolean;
}

interface MetoniaInterviewQuestion {
	id: string;
	question: string;
	options: MetoniaInterviewOption[];
	allowOther?: boolean;
}

interface MetoniaInterviewAnswer {
	id: string;
	answer: string;
	wasCustom: boolean;
}

interface MetoniaInterviewDetails {
	questions: MetoniaInterviewQuestion[];
	answers: MetoniaInterviewAnswer[];
	cancelled: boolean;
	cancelledAt?: string;
}

interface MetoniaModelSelectionDetails {
	task: string;
	availableModels: number;
	eligibleModels: number;
	currentModel?: string;
	selection?: {
		mode: "current" | "delegate";
		model: string;
		automatic: boolean;
		wasOther: boolean;
	};
	taskAgents?: {
		model: string;
		allowedModels: string[];
		readOnly: true;
		isolation: "process";
	};
	cancelled: boolean;
}

const OptionSchema = Type.Object({
	label: Type.String({ minLength: 1, maxLength: 80, description: "Short option label" }),
	description: Type.Optional(Type.String({ maxLength: 180, description: "One-line consequence or tradeoff" })),
	recommended: Type.Optional(Type.Boolean({ description: "Mark at most one option per question as recommended" })),
});

const QuestionSchema = Type.Object({
	id: Type.String({ minLength: 1, maxLength: 64, description: "Stable answer identifier" }),
	question: Type.String({ minLength: 1, maxLength: 320, description: "One concrete decision question" }),
	options: Type.Array(OptionSchema, {
		minItems: 2,
		maxItems: 4,
		description: "Two to four mutually exclusive choices",
	}),
	allowOther: Type.Optional(Type.Boolean({ description: "Allow a free-form answer; defaults to true" })),
});

const Params = Type.Object({
	questions: Type.Array(QuestionSchema, {
		minItems: 1,
		maxItems: 4,
		description: "One dependent question, or up to four genuinely independent questions",
	}),
});

const ModelSelectionParams = Type.Object({
	task: Type.String({ minLength: 1, maxLength: 240, description: "Short description of the delegated work" }),
	complexity: Type.Optional(StringEnum(["light", "standard", "deep"] as const)),
	estimatedContextTokens: Type.Optional(Type.Integer({ minimum: 1 })),
	expectedOutputTokens: Type.Optional(Type.Integer({ minimum: 1 })),
});

function outputReserve(complexity: TaskComplexity): number {
	return complexity === "deep" ? 32_000 : complexity === "standard" ? 16_000 : 8_000;
}

function defaultContextEstimate(complexity: TaskComplexity): number {
	return complexity === "deep" ? 96_000 : complexity === "standard" ? 32_000 : 8_000;
}

export function eligibleModelsForSelection(
	models: readonly Model<Api>[],
	complexity: TaskComplexity,
	estimatedContextTokens = defaultContextEstimate(complexity),
	expectedOutputTokens = outputReserve(complexity),
): Model<Api>[] {
	const requiredContext = Math.max(1, estimatedContextTokens) + Math.max(1, expectedOutputTokens);
	return models.filter(
		(model) => model.contextWindow >= requiredContext && model.maxTokens >= expectedOutputTokens,
	);
}

function normalizedSearch(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
}

export function searchAvailableModels(models: readonly Model<Api>[], query: string): Model<Api>[] {
	const tokens = normalizedSearch(query);
	if (tokens.length === 0) return [];
	return models
		.filter((model) => {
			const searchable = normalizedSearch(`${modelRef(model)} ${model.name}`).join(" ");
			return tokens.every((token) => searchable.includes(token));
		})
		.sort((left, right) => modelRef(left).localeCompare(modelRef(right)));
}

function modelFacts(model: Model<Api>): string {
	return [
		`${model.contextWindow.toLocaleString()} ctx`,
		`${model.maxTokens.toLocaleString()} out`,
		model.reasoning ? "reasoning" : "no reasoning",
		model.input.includes("image") ? "vision" : undefined,
	]
		.filter(Boolean)
		.join(" · ");
}

function modelRow(model: Model<Api>): string {
	return `${modelRef(model)} — ${modelFacts(model)}`;
}

function uniqueModels(models: readonly Model<Api>[]): Model<Api>[] {
	const seen = new Set<string>();
	return models.filter((model) => {
		const ref = modelRef(model).toLowerCase();
		if (seen.has(ref)) return false;
		seen.add(ref);
		return true;
	});
}

export function shortlistModels(
	eligible: readonly Model<Api>[],
	automatic: Model<Api>,
	current?: Model<Api>,
	limit = 6,
): Model<Api>[] {
	const largest = [...eligible].sort(
		(left, right) => right.contextWindow - left.contextWindow || modelRef(left).localeCompare(modelRef(right)),
	);
	const alphabetical = [...eligible].sort((left, right) => modelRef(left).localeCompare(modelRef(right)));
	return uniqueModels([automatic, ...(current ? [current] : []), ...largest.slice(0, 2), ...alphabetical]).slice(0, limit);
}

async function searchOtherModel(
	models: readonly Model<Api>[],
	ctx: ExtensionContext,
): Promise<Model<Api> | undefined> {
	while (true) {
		const query = await ctx.ui.input("Other model", "Search provider/model, for example: glm 5.3 flash");
		if (!query?.trim()) return undefined;
		const matches = searchAvailableModels(models, query);
		if (matches.length === 0) {
			const action = await ctx.ui.select(
				"No authenticated fitting model matched that search",
				["Search again", "Cancel"],
			);
			if (action !== "Search again") return undefined;
			continue;
		}
		const visible = matches.slice(0, 30);
		const rows = visible.map(modelRow);
		if (matches.length > visible.length) rows.push(`Search again — ${matches.length - visible.length} more matches hidden`);
		const selected = await ctx.ui.select(`Authenticated models matching “${query.trim()}”`, rows);
		if (!selected) return undefined;
		if (selected.startsWith("Search again —")) continue;
		return visible[rows.indexOf(selected)];
	}
}

function cancelledModelSelection(
	task: string,
	availableModels: number,
	eligibleModels: number,
	currentModel?: string,
) {
	return {
		content: [{ type: "text" as const, text: "Model selection was cancelled. Do not delegate silently." }],
		details: {
			task,
			availableModels,
			eligibleModels,
			currentModel,
			cancelled: true,
		} satisfies MetoniaModelSelectionDetails,
	};
}

export function orderMetoniaOptions(options: MetoniaInterviewOption[]): MetoniaInterviewOption[] {
	return [...options].sort((left, right) => Number(Boolean(right.recommended)) - Number(Boolean(left.recommended)));
}

function renderOption(option: MetoniaInterviewOption, index: number): string {
	const recommended = option.recommended ? " [recommended]" : "";
	const description = option.description ? ` — ${option.description}` : "";
	return `${index + 1}. ${option.label}${recommended}${description}`;
}

function invalidResult(message: string, questions: MetoniaInterviewQuestion[]) {
	return {
		content: [{ type: "text" as const, text: message }],
		details: { questions, answers: [], cancelled: true } satisfies MetoniaInterviewDetails,
		isError: true,
	};
}

export default function metoniaInterview(pi: ExtensionAPI) {
	pi.registerTool({
		name: "metonia_model_select",
		label: "Metonia Model Select",
		description:
			"Inspect Pi's authenticated, session-scoped model registry and ask the user which model may handle a planned delegated task. " +
			"Use before an expensive project-learning registration scan when the user has not already chosen an exact model. " +
			"The native TUI offers the current agent without delegation when it fits, a bounded shortlist, and Other search across every authenticated fitting model. " +
			"Capacity and static routing metadata are eligibility signals, not cross-provider intelligence rankings.",
		promptSnippet: "Ask the user to select an authenticated model before costly delegated project analysis.",
		promptGuidelines: [
			"Run cheap deterministic preflight first so context and output estimates are evidence-based.",
			"Treat an exact user selection as task-scoped provider authorization; pass the returned exact model as task_agents.model and allowedModels.",
			"If the user chooses the current agent, do not create a child merely to reproduce the same work.",
			"If selection is cancelled or no model fits, pause instead of silently choosing another provider.",
		],
		parameters: ModelSelectionParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const task = params.task.trim();
			const complexity = params.complexity ?? "deep";
			const estimatedContextTokens = params.estimatedContextTokens ?? defaultContextEstimate(complexity);
			const expectedOutputTokens = params.expectedOutputTokens ?? outputReserve(complexity);
			const available = ctx.scopedModels.length > 0
				? ctx.scopedModels.map((entry) => entry.model)
				: ctx.modelRegistry.getAvailable();
			const eligible = eligibleModelsForSelection(
				available,
				complexity,
				estimatedContextTokens,
				expectedOutputTokens,
			);
			const currentRef = ctx.model ? modelRef(ctx.model) : undefined;
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "metonia_model_select requires Pi's TUI or RPC UI. Ask the user for an exact provider/model before delegating." }],
					details: {
						task,
						availableModels: available.length,
						eligibleModels: eligible.length,
						currentModel: currentRef,
						cancelled: true,
					} satisfies MetoniaModelSelectionDetails,
					isError: true,
				};
			}
			if (eligible.length === 0) {
				return {
					content: [{ type: "text", text: `No authenticated session model fits the estimated ${estimatedContextTokens.toLocaleString()} input and ${expectedOutputTokens.toLocaleString()} output tokens.` }],
					details: {
						task,
						availableModels: available.length,
						eligibleModels: 0,
						currentModel: currentRef,
						cancelled: true,
					} satisfies MetoniaModelSelectionDetails,
					isError: true,
				};
			}

			const automatic = routeModel(eligible, {
				complexity,
				priority: "balanced",
				estimatedContextTokens,
				expectedOutputTokens,
				currentModel: ctx.model,
			}).model;
			const current = ctx.model
				? eligible.find((model) => modelRef(model).toLowerCase() === currentRef?.toLowerCase())
				: undefined;
			const shortlist = shortlistModels(eligible, automatic, current);
			const automaticRow = `Automatic — ${modelRef(automatic)} [recommended] — ${modelFacts(automatic)}`;
			const currentRow = current ? `Current agent — ${modelRef(current)} — no delegation` : undefined;
			const exactRows = shortlist
				.filter((model) => modelRef(model) !== modelRef(automatic) && (!current || modelRef(model) !== modelRef(current)))
				.map(modelRow);
			const otherRow = `Other — search all ${eligible.length} authenticated fitting models`;
			const rows = [automaticRow, currentRow, ...exactRows, otherRow].filter((row): row is string => Boolean(row));
			const selection = await ctx.ui.select(
				`${task} — which model may inspect this task's repository/context?`,
				rows,
			);
			if (!selection) return cancelledModelSelection(task, available.length, eligible.length, currentRef);

			let selectedModel: Model<Api> | undefined;
			let mode: "current" | "delegate" = "delegate";
			let automaticChoice = false;
			let wasOther = false;
			if (selection === automaticRow) {
				selectedModel = automatic;
				automaticChoice = true;
				if (currentRef && modelRef(automatic).toLowerCase() === currentRef.toLowerCase()) mode = "current";
			} else if (currentRow && selection === currentRow) {
				selectedModel = current;
				mode = "current";
			} else if (selection === otherRow) {
				selectedModel = await searchOtherModel(eligible, ctx);
				wasOther = true;
			} else {
				selectedModel = shortlist.find((model) => selection === modelRow(model));
			}
			if (!selectedModel) return cancelledModelSelection(task, available.length, eligible.length, currentRef);

			const selectedRef = modelRef(selectedModel);
			const details = {
				task,
				availableModels: available.length,
				eligibleModels: eligible.length,
				currentModel: currentRef,
				selection: {
					mode,
					model: selectedRef,
					automatic: automaticChoice,
					wasOther,
				},
				taskAgents: mode === "delegate"
					? {
						model: selectedRef,
						allowedModels: [selectedRef],
						readOnly: true,
						isolation: "process",
					}
					: undefined,
				cancelled: false,
			} satisfies MetoniaModelSelectionDetails;
			return {
				content: [
					{
						type: "text",
						text: mode === "current"
							? `Use the current agent (${selectedRef}); do not delegate this scan.`
							: `Delegate the scan to exact model ${selectedRef}. Pass model: "${selectedRef}" and allowedModels: ["${selectedRef}"] to task_agents.`,
					},
				],
				details,
			};
		},
	});

	pi.registerTool({
		name: "metonia_interview",
		label: "Metonia Interview",
		description:
			"Ask one focused decision question, or a small batch of independent questions, in Metonia's built-in selectable Pi UI. " +
			"Use only when the answer materially changes scope, architecture, risk, cost, ownership, or acceptance. " +
			"Inspect discoverable facts first. Offer 2-4 mutually exclusive options, mark at most one recommendation, " +
			"state each consequence, and keep free-form answers enabled unless the domain is strictly closed.",
		promptSnippet: "Clarify consequential decisions through Metonia's selectable interview.",
		promptGuidelines: [
			"Ask dependent questions one at a time; batch only questions whose answers cannot change each other.",
			"Do not ask for facts that local files, documentation, or safe inspection can answer.",
			"Carry accepted answers forward and stop when a stated reversible assumption is sufficient.",
		],
		parameters: Params,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) return invalidResult("metonia_interview requires Pi's TUI or RPC UI.", params.questions);
			const ids = new Set<string>();
			for (const question of params.questions) {
				if (ids.has(question.id)) return invalidResult(`Duplicate question id: ${question.id}`, params.questions);
				ids.add(question.id);
				if (question.options.filter((option) => option.recommended).length > 1) {
					return invalidResult(`Question ${question.id} marks more than one option as recommended.`, params.questions);
				}
			}

			const answers: MetoniaInterviewAnswer[] = [];
			for (let questionIndex = 0; questionIndex < params.questions.length; questionIndex += 1) {
				const question = params.questions[questionIndex];
				const ordered = orderMetoniaOptions(question.options);
				const rows = ordered.map(renderOption);
				const otherRow = "Other — write a different answer";
				if (question.allowOther !== false) rows.push(otherRow);
				const progress = params.questions.length > 1 ? `[${questionIndex + 1}/${params.questions.length}] ` : "";
				const selection = await ctx.ui.select(`${progress}${question.question}`, rows);
				if (!selection) {
					return {
						content: [{ type: "text", text: `User cancelled at question ${question.id}.` }],
						details: {
							questions: params.questions,
							answers,
							cancelled: true,
							cancelledAt: question.id,
						} satisfies MetoniaInterviewDetails,
					};
				}

				if (selection === otherRow) {
					const custom = await ctx.ui.input(`${progress}Your answer`, "Type the decision or constraint");
					if (!custom?.trim()) {
						return {
							content: [{ type: "text", text: `User cancelled at question ${question.id}.` }],
							details: {
								questions: params.questions,
								answers,
								cancelled: true,
								cancelledAt: question.id,
							} satisfies MetoniaInterviewDetails,
						};
					}
					answers.push({ id: question.id, answer: custom.trim(), wasCustom: true });
					continue;
				}

				const selectedIndex = rows.indexOf(selection);
				const selected = ordered[selectedIndex];
				if (!selected) return invalidResult(`Unknown selection returned for question ${question.id}.`, params.questions);
				answers.push({ id: question.id, answer: selected.label, wasCustom: false });
			}

			return {
				content: [
					{
						type: "text",
						text: answers.map((answer) => `${answer.id}: ${answer.answer}`).join("\n"),
					},
				],
				details: { questions: params.questions, answers, cancelled: false } satisfies MetoniaInterviewDetails,
			};
		},
	});
}
