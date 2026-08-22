import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCapabilityControls,
  CAPABILITIES,
  resolveRoute,
} from "../extensions/metonia-delegate/routing.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(repoRoot, "config", "routing.example.json");
const profiles = ["portable", "codex", "opencode-go", "claude", "mixed"];
const expectedAgents = {
  "efficient-read": "scout",
  "bounded-write": "worker",
  "standard-write": "worker",
  "bounded-learning": "researcher",
  "deep-learning": "researcher",
  "fresh-review": "reviewer",
  "deep-decision": "oracle",
};

for (const profile of profiles) {
  for (const capability of CAPABILITIES) {
    const route = resolveRoute(capability, { configPath, profile });
    assert.equal(route.profile, profile);
    assert.equal(route.capability, capability);
    assert.equal(route.agent, expectedAgents[capability]);
    assert.ok(route.model === "$parent" || /^[^/]+\/.+:[a-z]+$/.test(route.model));
    assert.equal(route.context, "fresh");
  }
}

const allCandidates = new Set([
  "openai-codex/gpt-5.6-luna",
  "openai-codex/gpt-5.6-terra",
  "openai-codex/gpt-5.6-sol",
  "opencode/claude-haiku-4-5",
  "opencode/claude-sonnet-4-6",
  "opencode/claude-opus-4-8",
  "opencode-go/gpt-5.6-luna",
  "opencode-go/glm-5.1",
  "opencode-go/kimi-k2.7-code",
  "opencode-go/qwen3.7-plus",
  "opencode-go/qwen3.8-max",
]);
for (const capability of CAPABILITIES) {
  const route = resolveRoute(capability, { configPath, profile: "auto", availableModels: allCandidates });
  assert.equal(route.profile, "auto");
  assert.equal(route.agent, expectedAgents[capability]);
  assert.equal(route.selection_source, "auto-candidate");
  assert.ok(route.candidate_index >= 0);
  assert.notEqual(route.model, "$parent");
}

const codexFirst = resolveRoute("efficient-read", {
  configPath,
  profile: "auto",
  availableModels: new Set(["openai-codex/gpt-5.6-luna", "opencode-go/gpt-5.6-luna"]),
});
assert.equal(codexFirst.model, "openai-codex/gpt-5.6-luna:low");
assert.equal(codexFirst.candidate_index, 0);

const secondCandidate = resolveRoute("efficient-read", {
  configPath,
  profile: "auto",
  availableModels: new Set(["opencode-go/gpt-5.6-luna"]),
});
assert.equal(secondCandidate.model, "opencode-go/gpt-5.6-luna:low");
assert.equal(secondCandidate.candidate_index, 1);

const claudeLearning = resolveRoute("deep-learning", {
  configPath,
  profile: "auto",
  availableModels: new Set(["opencode/claude-sonnet-4-6"]),
});
assert.equal(claudeLearning.model, "opencode/claude-sonnet-4-6:medium");

const parentFallback = resolveRoute("deep-decision", {
  configPath,
  profile: "auto",
  availableModels: new Set(),
});
assert.equal(parentFallback.model, "$parent");
assert.equal(parentFallback.selection_source, "parent-fallback");
assert.equal(parentFallback.candidate_index, null);

const boundedCode = {
  risk: "low",
  writeFiles: ["src/example.ts"],
  deterministicChecks: true,
  sensitiveDecision: false,
  externalEffect: false,
  humanGate: false,
  baseCommitMatches: true,
};
assert.doesNotThrow(() => assertCapabilityControls("bounded-write", boundedCode));
assert.throws(
  () => assertCapabilityControls("bounded-write", { ...boundedCode, writeFiles: ["1", "2", "3", "4"] }),
  /use standard-write/,
);
assert.throws(
  () => assertCapabilityControls("bounded-write", { ...boundedCode, writeFiles: ["../outside.ts"] }),
  /use standard-write/,
);

const boundedLearning = {
  sourceCount: 1,
  sourceConfidence: "high",
  dense: false,
  highlyTechnical: false,
};
assert.doesNotThrow(() => assertCapabilityControls("bounded-learning", boundedLearning));
assert.throws(
  () => assertCapabilityControls("bounded-learning", { ...boundedLearning, sourceConfidence: "low" }),
  /use deep-learning/,
);

process.stdout.write(`ROUTING UNIT CLEAN (${profiles.length} manual profiles, ${CAPABILITIES.length} capabilities, auto broker)\n`);
