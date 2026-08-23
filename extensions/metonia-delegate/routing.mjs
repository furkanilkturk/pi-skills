import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CAPABILITIES = [
  "efficient-read",
  "bounded-write",
  "standard-write",
  "bounded-learning",
  "deep-learning",
  "fresh-review",
  "deep-decision",
];

const AUTO_ROUTES = {
  "efficient-read": {
    agent: "scout",
    candidates: [
      "openai-codex/gpt-5.6-luna:low",
      "opencode-go/gpt-5.6-luna:low",
      "opencode/claude-haiku-4-5:low",
      "opencode-go/glm-5.1:low",
    ],
    fallback: "$parent",
    context: "fresh",
  },
  "bounded-write": {
    agent: "worker",
    candidates: [
      "openai-codex/gpt-5.6-luna:medium",
      "opencode-go/gpt-5.6-luna:medium",
      "opencode-go/kimi-k2.7-code:medium",
      "opencode/claude-sonnet-4-6:medium",
    ],
    fallback: "$parent",
    context: "fresh",
  },
  "standard-write": {
    agent: "worker",
    candidates: [
      "openai-codex/gpt-5.6-terra:medium",
      "opencode/claude-sonnet-4-6:medium",
      "opencode-go/kimi-k2.7-code:medium",
    ],
    fallback: "$parent",
    context: "fresh",
  },
  "bounded-learning": {
    agent: "researcher",
    candidates: [
      "openai-codex/gpt-5.6-luna:medium",
      "opencode-go/gpt-5.6-luna:medium",
      "opencode/claude-haiku-4-5:medium",
    ],
    fallback: "$parent",
    context: "fresh",
  },
  "deep-learning": {
    agent: "researcher",
    candidates: [
      "openai-codex/gpt-5.6-terra:medium",
      "opencode/claude-sonnet-4-6:medium",
      "opencode-go/qwen3.7-plus:medium",
    ],
    fallback: "$parent",
    context: "fresh",
  },
  "fresh-review": {
    agent: "reviewer",
    candidates: [
      "openai-codex/gpt-5.6-terra:medium",
      "opencode/claude-sonnet-4-6:medium",
      "opencode-go/qwen3.7-plus:medium",
    ],
    fallback: "$parent",
    context: "fresh",
  },
  "deep-decision": {
    agent: "oracle",
    candidates: [
      "openai-codex/gpt-5.6-sol:high",
      "opencode/claude-opus-4-8:high",
      "opencode-go/qwen3.8-max:high",
    ],
    fallback: "$parent",
    context: "fresh",
  },
};

const PORTABLE_CONFIG = {
  schema_version: 1,
  active_profile: "auto",
  auto_routes: AUTO_ROUTES,
  profiles: {
    portable: {
      description: "Use the parent session model for every capability.",
      capabilities: Object.fromEntries(CAPABILITIES.map((capability) => [
        capability,
        {
          agent: capability === "efficient-read" ? "scout" :
            capability === "bounded-learning" || capability === "deep-learning" ? "researcher" :
            capability === "fresh-review" ? "reviewer" :
              capability === "deep-decision" ? "oracle" : "worker",
          model: "$parent",
          context: "fresh",
        },
      ])),
    },
  },
};

export function defaultRoutingConfigPath() {
  const agentDir = process.env.PI_CODING_AGENT_DIR?.trim();
  return path.join(agentDir ? path.resolve(agentDir) : path.join(os.homedir(), ".pi", "agent"), "metonia-routing.json");
}

export function loadRoutingConfig(configPath) {
  const explicitPath = configPath ?? process.env.METONIA_ROUTING_CONFIG;
  const resolvedPath = path.resolve(explicitPath ?? defaultRoutingConfigPath());
  if (!fs.existsSync(resolvedPath)) {
    if (explicitPath) {
      throw new Error(`routing config not found at ${resolvedPath}; run scripts/configure-routing.ps1`);
    }
    return { config: PORTABLE_CONFIG, configPath: "<built-in-auto>" };
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${resolvedPath}: ${error.message}`);
  }

  if (config.schema_version !== 1 || !config.profiles || typeof config.profiles !== "object") {
    throw new Error("routing config must use schema_version 1 and contain profiles");
  }
  return { config, configPath: resolvedPath };
}

export function resolveRoute(capability, options = {}) {
  if (!CAPABILITIES.includes(capability)) {
    throw new Error(`unknown capability '${capability ?? ""}'`);
  }

  const { config, configPath } = loadRoutingConfig(options.configPath);
  const profileName =
    options.profile ?? process.env.METONIA_ROUTING_PROFILE ?? config.active_profile;
  if (profileName === "auto") {
    const route = config.auto_routes?.[capability];
    if (!route) throw new Error(`automatic routing has no '${capability}' route`);
    if (typeof route.agent !== "string" || !route.agent.trim()) {
      throw new Error("auto route.agent must be a non-empty string");
    }
    if (!Array.isArray(route.candidates) || route.candidates.length === 0 ||
      route.candidates.some((model) => typeof model !== "string" || !/^[^/]+\/.+:[a-z]+$/.test(model))) {
      throw new Error("auto route.candidates must contain provider/model:thinking entries");
    }
    if (route.fallback !== "$parent") throw new Error("auto route.fallback must be $parent");
    if (route.context !== "fresh") throw new Error("auto route.context must be 'fresh'");

    const available = new Set(Array.from(options.availableModels ?? [], (model) => String(model)));
    const candidateIndex = route.candidates.findIndex((model) => available.has(modelBase(model)));
    const model = candidateIndex >= 0 ? route.candidates[candidateIndex] : route.fallback;
    return resolvedRoute(configPath, profileName, capability, route, model, {
      selection_source: candidateIndex >= 0 ? "auto-candidate" : "parent-fallback",
      candidate_index: candidateIndex >= 0 ? candidateIndex : null,
      candidate_count: route.candidates.length,
    });
  }

  const profile = config.profiles[profileName];
  if (!profile) throw new Error(`routing profile '${profileName ?? ""}' does not exist`);

  const route = profile.capabilities?.[capability];
  if (!route) throw new Error(`profile '${profileName}' has no '${capability}' route`);
  if (typeof route.agent !== "string" || !route.agent.trim()) {
    throw new Error("route.agent must be a non-empty string");
  }
  if (typeof route.model !== "string" || (route.model !== "$parent" && !/^[^/]+\/.+:[a-z]+$/.test(route.model))) {
    throw new Error("route.model must be $parent or provider/model:thinking");
  }
  if (route.context !== "fresh") throw new Error("route.context must be 'fresh'");

  return resolvedRoute(configPath, profileName, capability, route, route.model, {
    selection_source: "profile",
    candidate_index: null,
    candidate_count: 0,
  });
}

export function modelBase(model) {
  const slash = model.indexOf("/");
  const colon = model.lastIndexOf(":");
  return slash >= 0 && colon > slash ? model.slice(0, colon) : model;
}

function resolvedRoute(configPath, profileName, capability, route, model, selection) {
  const defaultTimeout = capability === "efficient-read" ? 600 : 1200;
  const timeoutSeconds = route.timeout_seconds ?? defaultTimeout;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 7200) {
    throw new Error("route.timeout_seconds must be an integer from 30 to 7200");
  }

  return {
    schema_version: 1,
    config_path: configPath,
    profile: profileName,
    capability,
    agent: route.agent,
    model,
    context: route.context,
    timeout_seconds: timeoutSeconds,
    ...selection,
  };
}

export function assertCapabilityControls(capability, controls) {
  if (capability === "bounded-write") {
    if (!controls) throw new Error("bounded-write requires explicit safety controls");
    const rawFiles = Array.isArray(controls.writeFiles) ? controls.writeFiles : [];
    const validFiles = rawFiles.every((file) => typeof file === "string" && file.trim() &&
      !path.isAbsolute(file) && !file.split(/[\\/]+/).includes(".."));
    const uniqueFiles = new Set(rawFiles.map((file) => typeof file === "string" ? file.trim().toLowerCase() : file));
    const eligible = controls.risk === "low" && validFiles && rawFiles.length >= 1 &&
      rawFiles.length <= 3 && uniqueFiles.size === rawFiles.length &&
      controls.deterministicChecks === true && controls.sensitiveDecision === false &&
      controls.externalEffect === false && controls.humanGate === false &&
      controls.baseCommitMatches === true;
    if (!eligible) throw new Error("bounded-write safety controls are not eligible; use standard-write");
  }

  if (capability === "bounded-learning") {
    if (!controls) throw new Error("bounded-learning requires explicit source controls");
    const eligible = controls.sourceCount === 1 && controls.sourceConfidence === "high" &&
      controls.dense === false && controls.highlyTechnical === false;
    if (!eligible) throw new Error("bounded-learning source controls are not eligible; use deep-learning");
  }
}
