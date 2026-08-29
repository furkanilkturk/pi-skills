import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

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
