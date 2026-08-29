import type { Api, Model } from "@earendil-works/pi-ai";

export type TaskComplexity = "light" | "standard" | "deep";
export type RoutePriority = "balanced" | "cost" | "latency" | "quality";

export interface RouteRequest {
	complexity: TaskComplexity;
	priority: RoutePriority;
	estimatedContextTokens: number;
	modelOverride?: string;
	currentModel?: Model<Api>;
}

export interface RouteDecision {
	model: Model<Api>;
	modelRef: string;
	tier: "explicit" | "efficiency" | "balanced" | "depth";
	reason: string;
	limitation?: string;
}

export function modelRef(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}

function normalize(values: number[]): (value: number) => number {
	const finite = values.filter(Number.isFinite);
	const min = Math.min(...finite);
	const max = Math.max(...finite);
	if (!Number.isFinite(min) || min === max) return () => 0.5;
	return (value) => (value - min) / (max - min);
}

function staticPrice(model: Model<Api>): number | undefined {
	const values = [model.cost.input, model.cost.output, model.cost.cacheRead, model.cost.cacheWrite];
	if (values.every((value) => !value)) return undefined;
	return model.cost.input + model.cost.output * 2 + model.cost.cacheRead * 0.25 + model.cost.cacheWrite * 0.5;
}

export function resolveModelOverride(models: readonly Model<Api>[], requested: string): Model<Api> {
	const wanted = requested.trim().toLowerCase();
	const canonical = models.filter((model) => modelRef(model).toLowerCase() === wanted);
	if (canonical.length === 1) return canonical[0];

	const bare = models.filter(
		(model) => model.id.toLowerCase() === wanted || model.name.toLowerCase() === wanted,
	);
	if (bare.length === 1) return bare[0];
	if (bare.length > 1) {
		throw new Error(
			`Model override "${requested}" is ambiguous. Use one of: ${bare.map(modelRef).join(", ")}`,
		);
	}
	throw new Error(
		`Model override "${requested}" is unavailable. Available models: ${models.map(modelRef).join(", ") || "none"}`,
	);
}

export function routeModel(models: readonly Model<Api>[], request: RouteRequest): RouteDecision {
	if (models.length === 0) throw new Error("No authenticated Pi models are available for delegation.");

	if (request.modelOverride) {
		const model = resolveModelOverride(models, request.modelOverride);
		return {
			model,
			modelRef: modelRef(model),
			tier: "explicit",
			reason: "Explicit model override; automatic routing was bypassed.",
		};
	}

	const reserve = request.complexity === "deep" ? 32_000 : request.complexity === "standard" ? 16_000 : 8_000;
	const required = Math.max(1, request.estimatedContextTokens) + reserve;
	const fitting = models.filter((model) => model.contextWindow >= required);
	if (fitting.length === 0) {
		const largest = [...models].sort((a, b) => b.contextWindow - a.contextWindow)[0];
		throw new Error(
			`No available model fits the estimated ${request.estimatedContextTokens.toLocaleString()}-token context plus reserve. ` +
				`Largest available window is ${largest.contextWindow.toLocaleString()} (${modelRef(largest)}).`,
		);
	}

	const logContext = fitting.map((model) => Math.log2(Math.max(1, model.contextWindow)));
	const logOutput = fitting.map((model) => Math.log2(Math.max(1, model.maxTokens)));
	const knownPrices = fitting.map(staticPrice).filter((value): value is number => value !== undefined);
	const contextScore = normalize(logContext);
	const outputScore = normalize(logOutput);
	const priceScore = knownPrices.length > 0 ? normalize(knownPrices.map((price) => Math.log2(Math.max(price, 1e-9)))) : () => 0.5;
	const currentRef = request.currentModel ? modelRef(request.currentModel) : undefined;

	const scored = fitting.map((model) => {
		const price = staticPrice(model);
		const costUtility = price === undefined ? 0.5 : 1 - priceScore(Math.log2(Math.max(price, 1e-9)));
		const reasoning = model.reasoning ? 1 : 0;
		const context = contextScore(Math.log2(Math.max(1, model.contextWindow)));
		const output = outputScore(Math.log2(Math.max(1, model.maxTokens)));
		const current = currentRef === modelRef(model) ? 1 : 0;
		let score: number;

		if (request.complexity === "light") score = costUtility * 3 + context * 0.5 + output * 0.25 + current * 0.2;
		else if (request.complexity === "deep") score = reasoning * 4 + output * 2 + context * 1.5 + costUtility * 0.2;
		else score = reasoning * 1.5 + output + context + costUtility * 1.5 + current * 0.25;

		if (request.priority === "cost") score += costUtility * 3;
		else if (request.priority === "latency") score += costUtility * 2.5 + output * 0.25;
		else if (request.priority === "quality") score += reasoning * 2 + output + context * 0.5;

		return { model, score, price };
	});

	scored.sort((a, b) => b.score - a.score);
	const topScore = scored[0].score;
	const tied = scored.filter((candidate) => Math.abs(candidate.score - topScore) < 1e-9);
	let chosen = scored[0];
	if (request.complexity === "deep" && tied.length > 1) {
		const current = tied.find(
			(candidate) => candidate.model.reasoning && currentRef === modelRef(candidate.model),
		);
		if (!current) {
			throw new Error(
				`Deep-task routing is ambiguous among equally scored models: ${tied.map(({ model }) => modelRef(model)).join(", ")}. ` +
					"Pass an explicit provider/model override.",
			);
		}
		chosen = current;
	}
	const tier = request.complexity === "light" ? "efficiency" : request.complexity === "deep" ? "depth" : "balanced";
	const facts = [
		chosen.model.reasoning ? "reasoning-capable" : "non-reasoning",
		`${chosen.model.contextWindow.toLocaleString()} context`,
		`${chosen.model.maxTokens.toLocaleString()} max output`,
		chosen.price === undefined ? "price metadata unavailable" : "static price metadata considered",
	];

	return {
		model: chosen.model,
		modelRef: modelRef(chosen.model),
		tier,
		reason: `${tier} route for ${request.complexity} complexity and ${request.priority} priority (${facts.join(", ")}).`,
		limitation:
			request.priority === "latency"
				? "Pi exposes no live latency or provider-capacity signal; static cost/output metadata was used only as an efficiency proxy."
				: undefined,
	};
}
