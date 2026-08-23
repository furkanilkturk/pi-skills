import { createHash } from "node:crypto";

const SAFE_FAILURE_REASONS = new Set([
  "aborted",
  "broker-exception",
  "child-blocked",
  "child-exit-nonzero",
  "child-model-error",
  "contract-missing-evidence",
  "contract-missing-result",
  "invalid-controls",
  "invalid-cwd",
  "routing-failure",
  "skill-not-found",
  "spawn-command-not-found",
  "timeout",
  "writer-lock-conflict",
]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function workspaceHash(cwd) {
  return sha256(String(cwd).replace(/\\/g, "/").toLowerCase());
}

export function classifySkillCollision(bundledSha256, globalSha256) {
  if (!bundledSha256 || !globalSha256) return "none";
  return bundledSha256 === globalSha256 ? "same-hash" : "different-hash";
}

export function selectSkillCandidate(candidates) {
  const bundled = candidates.find((candidate) => candidate.source === "bundled" && candidate.exists);
  const global = candidates.find((candidate) => candidate.source === "global" && candidate.exists);
  const selected = bundled ?? global;
  if (!selected) return undefined;
  return {
    ...selected,
    collision: classifySkillCollision(bundled?.sha256, global?.sha256),
  };
}

export function auditErrorClass(status) {
  if (status === "passed") return "none";
  if (status === "blocked") return "blocked";
  if (status === "timed-out") return "timeout";
  if (status === "aborted") return "aborted";
  if (status === "invalid-contract") return "contract";
  if (status === "model-error") return "model";
  return "runtime";
}

export function normalizeEvidenceLabel(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

export function validateResult(output, evidence) {
  if (/^METONIA_RESULT:\s*BLOCKED\s*$/mi.test(output)) {
    return { ok: false, status: "blocked", reason: "child reported BLOCKED", reasonCode: "child-blocked" };
  }
  if (!/^METONIA_RESULT:\s*PASS\s*$/mi.test(output)) {
    return {
      ok: false,
      status: "invalid-contract",
      reason: "child omitted METONIA_RESULT",
      reasonCode: "contract-missing-result",
    };
  }

  const evidenceSection = output.split(/^METONIA_EVIDENCE:\s*$/mi)[1] ?? "";
  const reported = new Set(
    [...evidenceSection.matchAll(/^\s*-\s*([^:\r\n]+)\s*:/gm)]
      .map((match) => normalizeEvidenceLabel(match[1])),
  );
  const missing = evidence.filter((name) => !reported.has(normalizeEvidenceLabel(name)));
  if (missing.length > 0) {
    return {
      ok: false,
      status: "invalid-contract",
      reason: `missing evidence labels: ${missing.join(", ")}`,
      reasonCode: "contract-missing-evidence",
    };
  }
  return { ok: true, status: "passed", reasonCode: "none" };
}

export function classifyRuntimeFailure(error) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (code === "ENOENT") return "spawn-command-not-found";
  if (message.includes("another metonia writer is active")) return "writer-lock-conflict";
  if (message.includes("cwd is not a directory")) return "invalid-cwd";
  if (message.includes("installed skill not found")) return "skill-not-found";
  if (message.includes("requires controls") || message.includes("use standard-write") || message.includes("use deep-learning")) return "invalid-controls";
  if (message.includes("routing") || message.includes("parent session model")) return "routing-failure";
  return "broker-exception";
}

export function safeFailureReason(value) {
  return SAFE_FAILURE_REASONS.has(value) ? value : undefined;
}

// Deliberately enumerate fields: a RunDetails addition cannot accidentally leak
// task content, absolute paths, child stderr, or broker diagnostics into the audit.
export function buildAuditRecord(details, task) {
  return {
    schema_version: 2,
    timestamp: new Date().toISOString(),
    run_id: details.runId,
    profile: details.profile,
    capability: details.capability,
    agent: details.agent,
    model: details.model,
    cwd_sha256: details.cwdHash,
    skill: details.skill,
    skill_source: details.skillSource,
    skill_sha256: details.skillSha256,
    skill_collision: details.skillCollision,
    status: details.status,
    exit_code: details.exitCode,
    usage: details.usage,
    selection_source: details.selectionSource,
    available_model_count: details.availableModelCount,
    candidate_index: details.candidateIndex,
    error_class: auditErrorClass(details.status),
    failure_reason: safeFailureReason(details.failureReason),
    task_sha256: sha256(task),
  };
}
