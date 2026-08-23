import { createHash } from "node:crypto";

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
  if (status === "timed-out") return "timeout";
  if (status === "aborted") return "aborted";
  if (status === "invalid-contract") return "contract";
  if (status === "model-error") return "model";
  return "runtime";
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
    task_sha256: sha256(task),
  };
}
