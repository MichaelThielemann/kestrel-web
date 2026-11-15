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
    expect(lines).toContain("  stop it and restart the server, or set allowConcurrentProcesses: true to run several processes on one database on purpose");
    expect(lines.join("\n")).not.toContain("fix kestrel.config.ts");
  });

  it("tells a lock from another PID namespace to stop the process if it still runs or to delete the lock file if nothing does", () => {
    const reason = LOCKED_REASON.replace(
      "if that process sends no further heartbeat.",
      "if that process sends no further heartbeat. The lock comes from another PID namespace on this host, such as an earlier run of this container; if no process uses the database any more, delete /srv/app/data/kestrel.db.instance to start at once.",
    );
    const text = bootBanner({ module: "persistence/sqlite", reason, code: "instance-locked" })
      .filter((line) => !line.startsWith("  reason:"))
      .join("\n");
    expect(text).toContain('  the lock comes from another PID namespace on this host, for example an earlier run of this container: host "web-1", pid 4242 there');
    expect(text).toContain("if that process is still running, stop it");
    expect(text).toContain("if no process uses the database any more, delete the lock file named above");
    expect(text).toContain("restart the server once the takeover time has passed");
    expect(text).not.toContain("is running on this database");
    expect(text).not.toContain("allowConcurrentProcesses");
  });

  it("points a development restart that overlaps the old process to restarting once more", () => {
    const dev = bootBanner({ module: "persistence/sqlite", reason: LOCKED_REASON, code: "instance-locked", dev: true }).join("\n");
    expect(dev).toContain("a restart of the development server can overlap the process it replaces; if that process has just exited, restart once more");
    expect(dev).toContain('another process is running on this database: host "web-1", pid 4242');
    const production = bootBanner({ module: "persistence/sqlite", reason: LOCKED_REASON, code: "instance-locked", dev: false }).join("\n");
    expect(production).not.toContain("development server");
  });

  it("falls back to a general hint when the lock holder could not be read", () => {
    const reason = "/srv/app/data/kestrel.db is locked by /srv/app/data/kestrel.db.instance, which is unreadable and was written within the last 60 s; it is taken over once it is older.";
    const lines = bootBanner({ module: "persistence/sqlite", reason, code: "instance-locked" });
    expect(lines).toContain("  another process holds this database; the lock file names no host or PID");
    expect(lines.join("\n")).toContain("stop it and restart the server");
    expect(lines.join("\n")).not.toContain("pid");
  });
});

describe("bootBanner for an instance lock that could not be taken", () => {
  const LOCK = "/srv/app/data/kestrel.db.instance";
  const CHURN = `/srv/app/data/kestrel.db: could not take the instance lock ${LOCK} because other processes kept changing it; retry once they have settled`;
  const UNNAMED = `/srv/app/data/kestrel.db: could not take the instance lock ${LOCK} because a process that did not name itself kept its takeover marker ${LOCK}.guard for more than 6 s; retry once that process has finished`;
  const NAMED = `/srv/app/data/kestrel.db: could not take the instance lock ${LOCK} because host "web-2", pid 77 kept its takeover marker ${LOCK}.guard for more than 6 s; retry once that process has finished`;

  function banner(reason: string): string {
    return bootBanner({ module: "persistence/sqlite", reason, code: "instance-locked" }).join("\n");
  }

  it("asks to retry when other processes kept changing the lock, without a claim about the lock file or an opt-out", () => {
    const text = banner(CHURN);
    expect(text).toContain("  another process is taking or holding the lock; retry by restarting the server once it has settled");
    expect(text).not.toContain("names no host or PID");
    expect(text).not.toContain("stop it");
    expect(text).not.toContain("allowConcurrentProcesses");
    expect(text).not.toContain("fix kestrel.config.ts");
  });

  it("asks to retry when an unnamed process kept its takeover marker, without a claim about the lock file or an opt-out", () => {
    const text = banner(UNNAMED);
    expect(text).toContain("  another process is taking or holding the lock; retry by restarting the server once it has settled");
    expect(text).not.toContain("names no host or PID");
    expect(text).not.toContain("stop it");
    expect(text).not.toContain("allowConcurrentProcesses");
  });

  it("names the process that kept its takeover marker and asks to retry instead of to stop it", () => {
    const text = banner(NAMED);
    expect(text).toContain('  another process is taking over the lock: host "web-2", pid 77; retry by restarting the server once it has finished');
    expect(text).not.toContain("is running on this database");
    expect(text).not.toContain("stop it");
    expect(text).not.toContain("allowConcurrentProcesses");
  });

  it("says nothing about the lock file for an unrecognised reason and gives no opt-out", () => {
    const text = banner("something else about the lock");
    expect(text).toContain("  another process is taking or holding the lock; see the reason above");
    expect(text).not.toContain("names no host or PID");
    expect(text).not.toContain("allowConcurrentProcesses");
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

  it("adds the development restart hint only when the server runs in development", () => {
    const dev = recordingLogger();
    reportBootFailure(new KestrelBootError("persistence/sqlite", LOCKED_REASON, "instance-locked"), { logger: dev.logger, dev: true, exit: () => {} });
    expect(dev.lines.join("\n")).toContain("development server");
    const prod = recordingLogger();
    reportBootFailure(new KestrelBootError("persistence/sqlite", LOCKED_REASON, "instance-locked"), { logger: prod.logger, dev: false, exit: () => {} });
    expect(prod.lines.join("\n")).not.toContain("development server");
  });
});
