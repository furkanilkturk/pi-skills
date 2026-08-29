import type { Api, Model } from "@earendil-works/pi-ai";

export type TaskComplexity = "light" | "standard" | "deep";
export type RoutePriority = "balanced" | "cost" | "latency" | "quality";

export interface RouteRequest {
	complexity: TaskComplexity;
	priority: RoutePriority;
	estimatedContextTokens: number;
	expectedOutputTokens?: number;
	modelOverride?: string;
	modelCandidates?: readonly string[];
	allowedProviders?: readonly string[];
	allowedModels?: readonly string[];
	currentModel?: Model<Api>;
}

export interface RouteDecision {
	model: Model<Api>;
	modelRef: string;
	tier: "explicit" | "policy" | "efficiency" | "balanced" | "depth";
	reason: string;
	limitation?: string;
}

export function modelRef(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}

function normalizedSet(values: readonly string[] | undefined): Set<string> | undefined {
	if (values === undefined) return undefined;
	return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function staticPrice(model: Model<Api>): number | undefined {
	const values = [model.cost.input, model.cost.output, model.cost.cacheRead, model.cost.cacheWrite];
	if (!values.some(Number.isFinite)) return undefined;
	const [input = 0, output = 0, cacheRead = 0, cacheWrite = 0] = values;
	return input + output * 2 + cacheRead * 0.25 + cacheWrite * 0.5;
}

function compareEfficient(left: Model<Api>, right: Model<Api>, currentRef?: string): number {
	const leftPrice = staticPrice(left);
	const rightPrice = staticPrice(right);
	if (leftPrice !== undefined && rightPrice === undefined) return -1;
	if (leftPrice === undefined && rightPrice !== undefined) return 1;
	if (leftPrice !== undefined && rightPrice !== undefined && leftPrice !== rightPrice) return leftPrice - rightPrice;
	const leftCurrent = modelRef(left) === currentRef;
	const rightCurrent = modelRef(right) === currentRef;
	if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
	return modelRef(left).localeCompare(modelRef(right));
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

function filterByTrustPolicy(models: readonly Model<Api>[], request: RouteRequest): Model<Api>[] {
	const providers = normalizedSet(request.allowedProviders);
	const modelRefs = normalizedSet(request.allowedModels);
	const filtered = models.filter((model) => {
		if (providers && !providers.has(String(model.provider).toLowerCase())) return false;
		if (modelRefs && !modelRefs.has(modelRef(model).toLowerCase())) return false;
		return true;
	});
	if (filtered.length === 0) {
		throw new Error("No authenticated Pi model remains after applying the provider/model trust policy.");
	}
	return filtered;
}

function orderedPolicyModels(models: readonly Model<Api>[], requested: readonly string[]): {
	models: Model<Api>[];
	unavailable: string[];
} {
	const byRef = new Map(models.map((model) => [modelRef(model).toLowerCase(), model]));
	const ordered: Model<Api>[] = [];
	const unavailable: string[] = [];
	const seen = new Set<string>();
	for (const raw of requested) {
		const wanted = raw.trim().toLowerCase();
		if (!wanted || seen.has(wanted)) continue;
		seen.add(wanted);
		if (!wanted.includes("/")) {
			throw new Error(`Model candidate "${raw}" must use an exact provider/model reference.`);
		}
		const model = byRef.get(wanted);
		if (model) ordered.push(model);
		else unavailable.push(raw);
	}
	if (ordered.length === 0) {
		throw new Error(
			`None of the ordered model candidates are authenticated and allowed: ${requested.join(", ") || "none"}`,
		);
	}
	return { models: ordered, unavailable };
}

function outputReserve(complexity: TaskComplexity): number {
	return complexity === "deep" ? 32_000 : complexity === "standard" ? 16_000 : 8_000;
}

function formatPrice(model: Model<Api>): string {
	const price = staticPrice(model);
	return price === undefined ? "price metadata unavailable" : price === 0 ? "zero static price" : "static price considered";
}

export function routeModel(models: readonly Model<Api>[], request: RouteRequest): RouteDecision {
	if (models.length === 0) throw new Error("No authenticated Pi models are available for delegation.");

	const trusted = filterByTrustPolicy(models, request);
	const expectedOutput = request.expectedOutputTokens ?? outputReserve(request.complexity);
	const requiredContext = Math.max(1, request.estimatedContextTokens) + Math.max(1, expectedOutput);
	const fits = (model: Model<Api>) => model.contextWindow >= requiredContext && model.maxTokens >= expectedOutput;

	if (request.modelOverride) {
		const model = resolveModelOverride(trusted, request.modelOverride);
		if (request.expectedOutputTokens !== undefined && !fits(model)) {
			throw new Error(
				`Explicit model ${modelRef(model)} does not fit the estimated ${request.estimatedContextTokens.toLocaleString()}-token input ` +
				`and ${expectedOutput.toLocaleString()}-token output allowance.`,
			);
		}
		return {
			model,
			modelRef: modelRef(model),
			tier: "explicit",
			reason:
				request.expectedOutputTokens === undefined
					? "Explicit model override; automatic routing and inferred capacity checks were bypassed after trust checks."
					: "Explicit model override; automatic routing was bypassed after trust and caller-requested capacity checks.",
		};
	}

	let pool = trusted;
	let unavailablePolicyModels: string[] = [];
	if (request.modelCandidates?.length) {
		const policy = orderedPolicyModels(trusted, request.modelCandidates);
		pool = policy.models;
		unavailablePolicyModels = policy.unavailable;
	}

	let fitting = pool.filter(fits);
	if (!request.modelCandidates?.length && request.complexity === "deep") {
		const reasoning = fitting.filter((model) => model.reasoning);
		if (reasoning.length > 0) fitting = reasoning;
	}
	if (fitting.length === 0) {
		const largest = [...pool].sort((left, right) => right.contextWindow - left.contextWindow)[0];
		throw new Error(
			`No allowed model fits the estimated ${request.estimatedContextTokens.toLocaleString()}-token input ` +
				`and ${expectedOutput.toLocaleString()}-token output allowance. ` +
				`Largest allowed window is ${largest.contextWindow.toLocaleString()} (${modelRef(largest)}).`,
		);
	}

	if (request.modelCandidates?.length) {
		const model = fitting[0];
		return {
			model,
			modelRef: modelRef(model),
			tier: "policy",
			reason: `First eligible model from the ordered provider-agnostic candidate policy (${formatPrice(model)}).`,
			limitation: unavailablePolicyModels.length
				? `Skipped unavailable or disallowed candidates: ${unavailablePolicyModels.join(", ")}.`
				: undefined,
		};
	}

	const currentRef = request.currentModel ? modelRef(request.currentModel) : undefined;
	const current = currentRef ? fitting.find((model) => modelRef(model) === currentRef) : undefined;
	let chosen: Model<Api>;
	let limitation: string | undefined;

	if (request.priority === "quality" && current) {
		chosen = current;
		limitation =
			"No provider-agnostic empirical quality signal is available; the current eligible model was retained. " +
			"Use modelCandidates or an exact model override for an intentional quality policy.";
	} else {
		const preferred =
			request.complexity === "light" || request.priority === "cost" || request.priority === "latency"
				? fitting
				: fitting.some((model) => model.reasoning)
					? fitting.filter((model) => model.reasoning)
					: fitting;
		chosen = [...preferred].sort((left, right) => compareEfficient(left, right, currentRef))[0];
		if (request.priority === "quality") {
			limitation =
				"No eligible current model or empirical cross-provider quality profile was available; selected deterministically by capability and static cost. " +
				"Use modelCandidates or an exact model override for critical work.";
		} else if (request.priority === "latency") {
			limitation =
				"Pi exposes no live latency or provider-capacity signal; static cost was used only as an efficiency proxy.";
		}
	}

	const tier = request.complexity === "light" ? "efficiency" : request.complexity === "deep" ? "depth" : "balanced";
	const facts = [
		chosen.reasoning ? "reasoning-capable" : "non-reasoning",
		`${chosen.contextWindow.toLocaleString()} context`,
		`${chosen.maxTokens.toLocaleString()} max output`,
		formatPrice(chosen),
	];

	return {
		model: chosen,
		modelRef: modelRef(chosen),
		tier,
		reason: `${tier} route for ${request.complexity} complexity and ${request.priority} priority (${facts.join(", ")}). ` +
			"Context and maximum output were treated as eligibility limits, not intelligence scores.",
		limitation,
	};
}
