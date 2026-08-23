import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCapabilityControls,
  CAPABILITIES,
  defaultRoutingConfigPath,
  resolveRoute,
} from "../extensions/metonia-delegate/routing.mjs";
import {
  auditErrorClass,
  buildAuditRecord,
  selectSkillCandidate,
  sha256,
  workspaceHash,
} from "../extensions/metonia-delegate/runtime-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(repoRoot, "config", "routing.example.json");
const runtimeSource = fs.readFileSync(path.join(repoRoot, "extensions", "metonia-delegate", "index.ts"), "utf8");
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

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = path.join(repoRoot, ".test-agent-dir");
assert.equal(defaultRoutingConfigPath(), path.join(repoRoot, ".test-agent-dir", "metonia-routing.json"));
if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
else process.env.PI_CODING_AGENT_DIR = originalAgentDir;

const selectedBundled = selectSkillCandidate([
  { path: "private/bundle/SKILL.md", source: "bundled", exists: true, sha256: "a" },
  { path: "private/global/SKILL.md", source: "global", exists: true, sha256: "b" },
]);
assert.equal(selectedBundled.source, "bundled");
assert.equal(selectedBundled.collision, "different-hash");
assert.equal(selectSkillCandidate([
  { path: "bundle/SKILL.md", source: "bundled", exists: true, sha256: "same" },
  { path: "global/SKILL.md", source: "global", exists: true, sha256: "same" },
]).collision, "same-hash");
const selectedGlobal = selectSkillCandidate([
  { path: "bundle/SKILL.md", source: "bundled", exists: false },
  { path: "global/SKILL.md", source: "global", exists: true, sha256: "global" },
]);
assert.equal(selectedGlobal.source, "global");
assert.equal(selectedGlobal.collision, "none");

const privateCwd = "/private/example-user/project";
const audit = buildAuditRecord({
  runId: "run-1",
  profile: "auto",
  capability: "fresh-review",
  agent: "reviewer",
  model: "provider/model:medium",
  cwd: privateCwd,
  cwdHash: workspaceHash(privateCwd),
  skill: "review-plan",
  skillSource: "bundled",
  skillSha256: "skill-hash",
  skillCollision: "different-hash",
  status: "invalid-contract",
  exitCode: 0,
  usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: 0, turns: 1 },
  selectionSource: "auto-candidate",
  availableModelCount: 2,
  candidateIndex: 0,
  stderr: "private stderr",
  brokerError: "private broker diagnostic",
}, "private task content");
assert.equal(audit.schema_version, 2);
assert.equal(audit.cwd_sha256, workspaceHash(privateCwd));
assert.equal(audit.task_sha256, sha256("private task content"));
assert.equal(audit.error_class, "contract");
assert.equal(auditErrorClass("model-error"), "model");
for (const prohibited of ["cwd", "stderr", "brokerError", "auditError"]) {
  assert.equal(Object.hasOwn(audit, prohibited), false, `audit leaked ${prohibited}`);
}
assert.equal(JSON.stringify(audit).includes("private-user"), false);
assert.equal(JSON.stringify(audit).includes("private stderr"), false);
assert.equal(JSON.stringify(audit).includes("private broker diagnostic"), false);
assert.ok(runtimeSource.includes('"--no-extensions"'), "child must disable extension discovery");
assert.ok(
  runtimeSource.indexOf('source: "bundled"') < runtimeSource.indexOf('source: "global"'),
  "bundled skill candidates must precede global candidates",
);

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

const codexReviewFirst = resolveRoute("fresh-review", {
  configPath,
  profile: "auto",
  availableModels: new Set(["openai-codex/gpt-5.6-terra", "opencode/claude-sonnet-4-6"]),
});
assert.equal(codexReviewFirst.model, "openai-codex/gpt-5.6-terra:medium");

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
