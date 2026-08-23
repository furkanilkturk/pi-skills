import fs from "node:fs";
import path from "node:path";
import { workspaceHash } from "./runtime-contract.mjs";

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function acquireWriterLock(agentDir, cwd) {
  const lockDir = path.join(agentDir, "metonia-locks");
  fs.mkdirSync(lockDir, { recursive: true });
  const key = workspaceHash(cwd);
  const lockPath = path.join(lockDir, `${key}.lock`);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx", 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, cwd_sha256: key, started_at: new Date().toISOString() }));
      } catch (error) {
        try { fs.unlinkSync(lockPath); } catch { /* best effort */ }
        throw error;
      } finally {
        fs.closeSync(fd);
      }
      return () => {
        try { fs.unlinkSync(lockPath); } catch { /* already released */ }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const stale = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        if (Number.isInteger(stale.pid) && !processAlive(stale.pid)) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch (readError) {
        if (readError?.code === "ENOENT") continue;
      }
      throw new Error("another Metonia writer is active for this lock scope");
    }
  }
  throw new Error("could not acquire the Metonia writer lock for this lock scope");
}

export function assertVaultRoot(cwd) {
  const resolved = path.resolve(cwd);
  for (const relative of ["wiki/projects", "wiki/concepts"]) {
    if (!fs.existsSync(path.join(resolved, relative))) {
      throw new Error("vault writer requires cwd to be the Metonia vault root");
    }
  }
  return resolved;
}
