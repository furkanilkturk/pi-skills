import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
  buildChildTransport,
  classifyRuntimeFailure,
  normalizeEvidenceLabel,
  safeFailureReason,
  selectSkillCandidate,
  sha256,
  validateResult,
  workspaceHash,
} from "../extensions/metonia-delegate/runtime-contract.mjs";
import { collectReviewContext } from "../extensions/metonia-delegate/review-context.mjs";
import { isStaleContextError, RunTracker } from "../extensions/metonia-delegate/run-tracker.mjs";
import { acquireWriterLock, assertVaultRoot } from "../extensions/metonia-delegate/writer-lock.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(repoRoot, "config", "routing.example.json");
const runtimeSource = fs.readFileSync(path.join(repoRoot, "extensions", "metonia-delegate", "index.ts"), "utf8");
const runtimeContractSource = fs.readFileSync(path.join(repoRoot, "extensions", "metonia-delegate", "runtime-contract.mjs"), "utf8");
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
const auditDetails = {
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
  failureReason: "contract-missing-evidence",
  stderr: "private stderr",
  brokerError: "private broker diagnostic",
};
const audit = buildAuditRecord(auditDetails, "private task content");
assert.equal(audit.schema_version, 2);
assert.equal(audit.cwd_sha256, workspaceHash(privateCwd));
assert.equal(audit.task_sha256, sha256("private task content"));
assert.equal(audit.error_class, "contract");
assert.equal(audit.failure_reason, "contract-missing-evidence");
assert.equal(auditErrorClass("model-error"), "model");
assert.equal(auditErrorClass("blocked"), "blocked");
for (const prohibited of ["cwd", "stderr", "brokerError", "auditError"]) {
  assert.equal(Object.hasOwn(audit, prohibited), false, `audit leaked ${prohibited}`);
}
assert.equal(JSON.stringify(audit).includes("private-user"), false);
assert.equal(JSON.stringify(audit).includes("private stderr"), false);
assert.equal(JSON.stringify(audit).includes("private broker diagnostic"), false);
assert.ok(runtimeSource.includes("collectReviewContext"), "fresh review must support automatic Git context");
assert.ok(runtimeSource.includes("VAULT_WRITER_SKILLS"), "runtime must distinguish shared-vault writers");
assert.ok(runtimeSource.includes("assertVaultRoot(cwd)"), "shared-vault writers must lock from the vault root");
assert.ok(runtimeSource.includes("Re-read every target vault file"), "vault writer contract must defend concurrent sections");
assert.ok(
  runtimeSource.indexOf('source: "bundled"') < runtimeSource.indexOf('source: "global"'),
  "bundled skill candidates must precede global candidates",
);

const largeAutomaticReviewContext = `AUTOMATIC_REVIEW_CONTEXT\n${"diff-line\n".repeat(5_000)}`;
assert.ok(Buffer.byteLength(largeAutomaticReviewContext) > 40_000, "review regression fixture must exceed Windows argv risk threshold");
const childTransport = buildChildTransport({
  skillPath: "/private/bundled/review-plan/SKILL.md",
  model: "provider/model:medium",
  tools: ["read", "grep", "find", "ls"],
  promptPath: "/private/contract.md",
  task: `Review the plan.\n\n${largeAutomaticReviewContext}`,
});
assert.equal(childTransport.stdin.endsWith(largeAutomaticReviewContext), true);
assert.equal(childTransport.args.some((arg) => arg.includes("AUTOMATIC_REVIEW_CONTEXT")), false, "large review context must not enter argv");
for (const requiredArg of ["-p", "--no-session", "--no-extensions", "--no-skills", "--skill", "--append-system-prompt"]) {
  assert.ok(childTransport.args.includes(requiredArg), `child transport lost isolation/contract arg ${requiredArg}`);
}
assert.ok(runtimeContractSource.includes('"--no-extensions"'), "child transport must disable extension discovery");
assert.ok(runtimeSource.includes("proc.stdin.end(transport.stdin)"), "runtime must pipe the task into child stdin");
assert.ok(runtimeSource.includes("appendAudit(details, params.task)"), "audit must retain the caller task contract rather than review context");
const largeReviewAudit = buildAuditRecord({ ...auditDetails, runId: "run-large-review" }, "Review the plan");
assert.equal(largeReviewAudit.task_sha256, sha256("Review the plan"));
assert.equal(JSON.stringify(largeReviewAudit).includes("AUTOMATIC_REVIEW_CONTEXT"), false, "audit must not retain automatic review context");

assert.equal(normalizeEvidenceLabel("Commands_Run"), "commands-run");
assert.deepEqual(
  validateResult("METONIA_RESULT: PASS\nMETONIA_EVIDENCE:\n- changed_files: clean\n- commands-run: PASS", ["changed-files", "commands-run"]),
  { ok: true, status: "passed", reasonCode: "none" },
);
assert.equal(
  validateResult("METONIA_RESULT: PASS\nMETONIA_EVIDENCE:\n- commands-run: PASS", ["changed-files", "commands-run"]).reasonCode,
  "contract-missing-evidence",
);
assert.equal(
  validateResult("METONIA_RESULT: BLOCKED\nMETONIA_EVIDENCE:\n- blocker: reason", ["blocker"]).reasonCode,
  "child-blocked",
);
assert.equal(classifyRuntimeFailure({ code: "ENOENT" }), "spawn-command-not-found");
assert.equal(classifyRuntimeFailure(new Error("another Metonia writer is active")), "writer-lock-conflict");
assert.equal(classifyRuntimeFailure(new Error("vault writer requires cwd to be the Metonia vault root")), "vault-root-required");
assert.equal(safeFailureReason("contract-missing-result"), "contract-missing-result");
assert.equal(safeFailureReason("private provider error"), undefined);

const reviewContext = collectReviewContext(repoRoot, "HEAD");
for (const marker of ["AUTOMATIC_REVIEW_CONTEXT", "base:", "head:", "git status --short:", "git diff --name-only base..head:", "git worktree list --porcelain:"]) {
  assert.ok(reviewContext.includes(marker), `review context missing ${marker}`);
}

const tracker = new RunTracker(2);
assert.equal(isStaleContextError(new Error("This extension ctx is stale after session replacement")), true);
assert.equal(isStaleContextError(new Error("ordinary UI failure")), false);
tracker.queue("queued", "efficient-read", 1);
tracker.queue("running", "fresh-review", 2);
tracker.start("running", { agent: "reviewer", model: "provider/model:medium" });
let trackerState = tracker.snapshot();
assert.equal(trackerState.queued, 1);
assert.equal(trackerState.running, 1);
assert.equal(trackerState.completed, 0);
tracker.finish("running", "passed", {}, 3);
tracker.finish("queued", "model-error", { agent: "scout", failureReason: "child-model-error" }, 4);
trackerState = tracker.snapshot();
assert.equal(trackerState.active.length, 0);
assert.equal(trackerState.completed, 2);
assert.equal(trackerState.issues, 1);
assert.equal(trackerState.recent[0].status, "model-error");
assert.equal(trackerState.recent[0].failureReason, "child-model-error");

const adaptiveTracker = new RunTracker();
for (let index = 0; index < 12; index++) {
  adaptiveTracker.queue(`run-${index}`, "efficient-read", index);
  adaptiveTracker.start(`run-${index}`, { agent: "scout", model: "provider/model:low" });
}
assert.equal(adaptiveTracker.snapshot().running, 12, "tracker must not impose a fixed agent ceiling");

const lockAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), "metonia-lock-test-"));
const mainCwd = path.join(lockAgentDir, "repo");
const worktreeCwd = path.join(lockAgentDir, "repo-worker-a");
const vaultCwd = path.join(lockAgentDir, "vault");
fs.mkdirSync(mainCwd);
fs.mkdirSync(worktreeCwd);
fs.mkdirSync(path.join(vaultCwd, "wiki", "projects"), { recursive: true });
fs.mkdirSync(path.join(vaultCwd, "wiki", "concepts"), { recursive: true });
assert.equal(assertVaultRoot(vaultCwd), path.resolve(vaultCwd));
assert.throws(() => assertVaultRoot(mainCwd), /vault writer requires cwd/);
let releaseMain;
let releaseWorktree;
try {
  releaseMain = acquireWriterLock(lockAgentDir, mainCwd);
  assert.throws(
    () => acquireWriterLock(lockAgentDir, mainCwd),
    /another Metonia writer is active/,
    "the same cwd must allow only one writer",
  );
  releaseWorktree = acquireWriterLock(lockAgentDir, worktreeCwd);
  assert.notEqual(workspaceHash(mainCwd), workspaceHash(worktreeCwd));
} finally {
  releaseWorktree?.();
  releaseMain?.();
  fs.rmSync(lockAgentDir, { recursive: true, force: true });
}

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
