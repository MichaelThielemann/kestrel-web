import { describe, expect, it } from "vitest";
import { KestrelBootError } from "@michaelthielemann/kestrel";
import { BOOT_FAILED_MESSAGE, bootBanner, bootFailure, reportBootFailure } from "./boot-failure";

describe("bootFailure", () => {
  it("answers 503 with the state and the reason as data", () => {
    expect(bootFailure({ state: "failed", error: "persistence is unreachable" })).toEqual({
      statusCode: 503,
      statusMessage: BOOT_FAILED_MESSAGE,
      data: { state: "failed", error: "persistence is unreachable" },
    });
  });

  it("carries a state without a reason unchanged", () => {
    expect(bootFailure({ state: "booting" }).data).toEqual({ state: "booting" });
  });
});

const LOCKED_REASON =
  '/srv/app/data/kestrel.db is in use by another process: host "web-1", pid 4242, started 2026-11-14T08:00:00.000Z, last heartbeat 2026-11-14T08:05:00.000Z (lock file /srv/app/data/kestrel.db.instance). The lock is taken over automatically from 2026-11-14T08:06:00.000Z if that process sends no further heartbeat. Stop that process, or set allowConcurrentProcesses: true to run several processes on this database on purpose.';

function recordingLogger() {
  const lines: string[] = [];
  return { lines, logger: { error: (line: string) => void lines.push(line) } };
}

describe("bootBanner", () => {
  it("tells a configuration failure to fix the config and restart", () => {
    const lines = bootBanner({ module: "authz/roles", reason: "no roles", code: "invalid-module-config" });
    expect(lines).toContain("  module: authz/roles");
    expect(lines).toContain("  reason: no roles");
    expect(lines).toContain("  fix kestrel.config.ts and restart");
  });

  it("names the running process with host and PID for an instance lock held by another process", () => {
    const lines = bootBanner({ module: "persistence/sqlite", reason: LOCKED_REASON, code: "instance-locked" });
    expect(lines).toContain('  another process is running on this database: host "web-1", pid 4242');
    expect(lines).toContain("  stop it, or set allowConcurrentProcesses: true to run several processes on one database on purpose");
    expect(lines.join("\n")).not.toContain("fix kestrel.config.ts");
  });

  it("falls back to a general hint when the lock holder could not be read", () => {
    const reason = "/srv/app/data/kestrel.db is locked by /srv/app/data/kestrel.db.instance, which is unreadable and was written within the last 60 s; it is taken over once it is older.";
    const lines = bootBanner({ module: "persistence/sqlite", reason, code: "instance-locked" });
    expect(lines).toContain("  another process holds this database; the lock file names no host or PID");
    expect(lines.join("\n")).not.toContain("pid");
  });
});

describe("reportBootFailure", () => {
  it("logs the banner and exits with 1 in production", () => {
    const { lines, logger } = recordingLogger();
    const exits: number[] = [];
    const message = reportBootFailure(new KestrelBootError("persistence/sqlite", LOCKED_REASON, "instance-locked"), { logger, dev: false, exit: (code) => exits.push(code) });
    expect(exits).toEqual([1]);
    expect(message).toBe(`[persistence/sqlite] ${LOCKED_REASON}`);
    expect(lines.some((line) => line.includes('host "web-1", pid 4242'))).toBe(true);
  });

  it("keeps the process running in development", () => {
    const { logger } = recordingLogger();
    const exits: number[] = [];
    reportBootFailure(new KestrelBootError("persistence/sqlite", LOCKED_REASON, "instance-locked"), { logger, dev: true, exit: (code) => exits.push(code) });
    expect(exits).toEqual([]);
  });

  it("treats a plain error as a failure of kestrel itself", () => {
    const { lines, logger } = recordingLogger();
    const message = reportBootFailure(new Error("boom"), { logger, dev: true, exit: () => {} });
    expect(message).toBe("boom");
    expect(lines).toContain("  module: kestrel");
    expect(lines).toContain("  fix kestrel.config.ts and restart");
  });

  it("names the lock holder for an instance lock error that comes from another copy of kestrel", () => {
    const { lines, logger } = recordingLogger();
    const foreign = new Error(`[persistence/sqlite] ${LOCKED_REASON}`);
    Object.assign(foreign, { module: "persistence/sqlite", reason: LOCKED_REASON, code: "instance-locked" });
    Object.defineProperty(foreign, Symbol.for("kestrel.bootError"), { value: true });
    reportBootFailure(foreign, { logger, dev: true, exit: () => {} });
    expect(lines).toContain('  another process is running on this database: host "web-1", pid 4242');
  });
});
