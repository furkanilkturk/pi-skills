const SUCCESS = new Set(["passed"]);

export function isStaleContextError(error) {
  return String(error?.message ?? error ?? "").includes("extension ctx is stale");
}

export class RunTracker {
  constructor(historyLimit = 4) {
    this.historyLimit = historyLimit;
    this.active = new Map();
    this.recent = [];
    this.completed = 0;
    this.issues = 0;
  }

  queue(runId, capability, now = Date.now()) {
    this.active.set(runId, {
      runId,
      capability,
      agent: undefined,
      model: undefined,
      phase: "queued",
      startedAt: now,
    });
  }

  start(runId, details = {}) {
    const current = this.active.get(runId);
    if (!current) return;
    this.active.set(runId, {
      ...current,
      agent: details.agent ?? current.agent,
      model: details.model ?? current.model,
      phase: "running",
    });
  }

  finish(runId, status, details = {}, now = Date.now()) {
    const current = this.active.get(runId);
    if (!current) return;
    this.active.delete(runId);
    const finished = {
      ...current,
      agent: details.agent ?? current.agent,
      model: details.model ?? current.model,
      failureReason: details.failureReason,
      blockedStep: details.blockedStep,
      blocker: details.blocker,
      resumeWhen: details.resumeWhen,
      phase: "done",
      status,
      finishedAt: now,
    };
    this.completed++;
    if (!SUCCESS.has(status)) this.issues++;
    this.recent.unshift(finished);
    this.recent.length = Math.min(this.recent.length, this.historyLimit);
  }

  snapshot() {
    const active = [...this.active.values()].sort((a, b) => a.startedAt - b.startedAt);
    return {
      queued: active.filter((run) => run.phase === "queued").length,
      running: active.filter((run) => run.phase === "running").length,
      completed: this.completed,
      issues: this.issues,
      active,
      recent: [...this.recent],
    };
  }
}
