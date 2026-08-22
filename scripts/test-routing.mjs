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

for (const profile of profiles) {
  for (const capability of CAPABILITIES) {
    const route = resolveRoute(capability, { configPath, profile });
    assert.equal(route.profile, profile);
    assert.equal(route.capability, capability);
    assert.ok(route.model === "$parent" || /^[^/]+\/.+:[a-z]+$/.test(route.model));
    assert.equal(route.context, "fresh");
  }
}

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

process.stdout.write(`ROUTING UNIT CLEAN (${profiles.length} profiles, ${CAPABILITIES.length} capabilities)\n`);
