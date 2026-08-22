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

const PORTABLE_CONFIG = {
  schema_version: 1,
  active_profile: "portable",
  profiles: {
    portable: {
      description: "Use the parent session model for every capability.",
      capabilities: Object.fromEntries(CAPABILITIES.map((capability) => [
        capability,
        {
          agent: capability === "efficient-read" ? "scout" :
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
  return path.join(os.homedir(), ".pi", "agent", "metonia-routing.json");
}

export function loadRoutingConfig(configPath) {
  const explicitPath = configPath ?? process.env.METONIA_ROUTING_CONFIG;
  const resolvedPath = path.resolve(explicitPath ?? defaultRoutingConfigPath());
  if (!fs.existsSync(resolvedPath)) {
    if (explicitPath) {
      throw new Error(`routing config not found at ${resolvedPath}; run scripts/configure-routing.ps1`);
    }
    return { config: PORTABLE_CONFIG, configPath: "<built-in-portable>" };
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
    model: route.model,
    context: route.context,
    timeout_seconds: timeoutSeconds,
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
