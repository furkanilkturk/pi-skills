import { createHash } from "node:crypto";

const SAFE_FAILURE_REASONS = new Set([
  "aborted",
  "broker-exception",
  "child-blocked",
  "child-exit-nonzero",
  "child-model-error",
  "contract-missing-evidence",
  "contract-missing-blocker-details",
  "contract-missing-result",
  "invalid-controls",
  "invalid-cwd",
  "routing-failure",
  "skill-not-found",
  "spawn-command-not-found",
  "timeout",
  "mutation-unconfirmed",
  "writer-lock-conflict",
  "vault-root-required",
]);

const SKILL_CAPABILITIES = new Map([
  ["add-project", new Set(["bounded-write", "standard-write"])],
  ["create-project", new Set(["standard-write"])],
  ["delete-project", new Set(["standard-write"])],
  ["doc-learning", new Set(["bounded-learning", "deep-learning"])],
  ["execute-plan", new Set(["bounded-write", "standard-write"])],
  ["review-plan", new Set(["fresh-review"])],
  ["update-project", new Set(["bounded-write", "standard-write"])],
  ["video-learning", new Set(["bounded-learning", "deep-learning"])],
  ["work-vault-context", new Set(["efficient-read"])],
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
  if (status === "mutation-unconfirmed") return "mutation";
  return "runtime";
}

export function assertSkillCapability(skill, capability) {
  if (skill === "create-plan" || skill === "metonia-orchestrator") {
    throw new Error(`${skill} is parent-owned and cannot be delegated`);
  }
  const allowed = SKILL_CAPABILITIES.get(skill);
  if (!allowed) throw new Error(`skill '${skill}' is not a delegatable Metonia skill`);
  if (!allowed.has(capability)) {
    throw new Error(`skill '${skill}' cannot run with capability '${capability}'`);
  }
}

export function normalizeEvidenceLabel(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

function cleanContractField(value, limit = 240) {
  if (!value) return undefined;
  const cleaned = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, limit) : undefined;
}

export function parseBlockedDetails(output) {
  const field = (name) => cleanContractField(
    String(output).match(new RegExp(`^${name}:\\s*(.+)$`, "mi"))?.[1],
  );
  return {
    blockedStep: field("METONIA_BLOCKED_STEP"),
    blocker: field("METONIA_BLOCKER"),
    resumeWhen: field("METONIA_RESUME_WHEN"),
  };
}

export function validateResult(output, evidence) {
  if (/^METONIA_RESULT:\s*BLOCKED\s*$/mi.test(output)) {
    const blocked = parseBlockedDetails(output);
    const missingDetails = [
      ["METONIA_BLOCKED_STEP", blocked.blockedStep],
      ["METONIA_BLOCKER", blocked.blocker],
      ["METONIA_RESUME_WHEN", blocked.resumeWhen],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missingDetails.length > 0) {
      return {
        ok: false,
        status: "invalid-contract",
        reason: `BLOCKED missing structured fields: ${missingDetails.join(", ")}`,
        reasonCode: "contract-missing-blocker-details",
      };
    }
    const evidenceCheck = validateEvidence(output, evidence);
    if (!evidenceCheck.ok) return evidenceCheck;
    return {
      ok: false,
      status: "blocked",
      reason: blocked.blocker ?? "child reported BLOCKED without a structured explanation",
      reasonCode: "child-blocked",
      ...blocked,
    };
  }
  if (!/^METONIA_RESULT:\s*PASS\s*$/mi.test(output)) {
    return {
      ok: false,
      status: "invalid-contract",
      reason: "child omitted METONIA_RESULT",
      reasonCode: "contract-missing-result",
    };
  }

  return validateEvidence(output, evidence);
}

function validateEvidence(output, evidence) {
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
  if (message.includes("vault writer requires cwd")) return "vault-root-required";
  if (message.includes("cwd is not a directory")) return "invalid-cwd";
  if (message.includes("installed skill not found")) return "skill-not-found";
  if (message.includes("parent-owned") || message.includes("cannot run with capability") || message.includes("not a delegatable")) return "invalid-controls";
  if (message.includes("requires controls") || message.includes("use standard-write") || message.includes("use deep-learning")) return "invalid-controls";
  if (message.includes("routing") || message.includes("parent session model")) return "routing-failure";
  return "broker-exception";
}

export function safeFailureReason(value) {
  return SAFE_FAILURE_REASONS.has(value) ? value : undefined;
}

// Pi print mode merges piped stdin into the initial prompt. Keep task/context
// out of argv so Windows command-line limits cannot reject large review diffs.
export function buildChildTransport({ skillPath, model, tools, promptPath, task }) {
  return {
    args: [
      "--mode", "json", "-p", "--no-session", "--no-extensions",
      "--no-skills", "--skill", skillPath,
      "--model", model,
      "--tools", tools.join(","),
      "--exclude-tools", "metonia_delegate,subagent",
      "--append-system-prompt", promptPath,
    ],
    stdin: task,
  };
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
