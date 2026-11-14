import { describe, expect, it } from "vitest";
import type { InstanceHealth } from "@michaelthielemann/kestrel/defineModule";
import { livenessFromHealth, readinessFromHealth } from "./readiness";

function kestrelWith(health: InstanceHealth): { health: () => InstanceHealth } {
  return { health: () => health };
}

const OK: InstanceHealth = { ok: true, restartRequired: false, modules: [] };

describe("readinessFromHealth", () => {
  it("reports ready when every module is healthy", () => {
    expect(readinessFromHealth(kestrelWith(OK))).toEqual({ ready: true });
  });

  it("reports degraded, naming the failing module and its reason, for contention that never restarts", () => {
    const health: InstanceHealth = {
      ok: false,
      restartRequired: false,
      modules: [{ module: "persistence/sqlite", ok: false, reason: "the store is unusable after a failed rollback", restartRequired: false }],
    };
    const result = readinessFromHealth(kestrelWith(health));
    if (result.ready) throw new Error("expected the readiness check to report degraded");
    expect(result).toMatchObject({ state: "degraded", code: "degraded" });
    expect(result.error).toContain("persistence/sqlite");
    expect(result.error).toContain("the store is unusable after a failed rollback");
  });

  it("reports degraded even when the failing module also needs a restart", () => {
    const health: InstanceHealth = {
      ok: false,
      restartRequired: true,
      modules: [{ module: "persistence/sqlite", ok: false, reason: "the store is unusable after a failed rollback", restartRequired: true }],
    };
    expect(readinessFromHealth(kestrelWith(health)).ready).toBe(false);
  });

  it("ignores a module that is ok with an informational note", () => {
    const health: InstanceHealth = { ok: true, restartRequired: false, modules: [{ module: "replication/sqlite", ok: true, note: "a restore is prepared" }] };
    expect(readinessFromHealth(kestrelWith(health))).toEqual({ ready: true });
  });
});

describe("livenessFromHealth", () => {
  it("reports live when nothing needs a restart", () => {
    expect(livenessFromHealth(kestrelWith(OK))).toEqual({ live: true });
  });

  it("stays live for a failing module that does not require a restart", () => {
    const health: InstanceHealth = {
      ok: false,
      restartRequired: false,
      modules: [{ module: "persistence/sqlite", ok: false, reason: "busy", restartRequired: false }],
    };
    expect(livenessFromHealth(kestrelWith(health))).toEqual({ live: true });
  });

  it("reports not live, naming the module and reason, once a module needs a restart", () => {
    const health: InstanceHealth = {
      ok: false,
      restartRequired: true,
      modules: [{ module: "persistence/sqlite", ok: false, reason: "the store is unusable after a failed rollback", restartRequired: true }],
    };
    const result = livenessFromHealth(kestrelWith(health));
    if (result.live) throw new Error("expected the liveness check to report not live");
    expect(result.error).toContain("persistence/sqlite");
    expect(result.error).toContain("the store is unusable after a failed rollback");
  });
});

describe("health reported by a lost instance lock", () => {
  const LOST: InstanceHealth = {
    ok: false,
    restartRequired: true,
    modules: [
      {
        module: "persistence/sqlite",
        ok: false,
        reason: "the instance lock /srv/app/data/kestrel.db.instance is owned by another instance; this process no longer holds the database alone",
        restartRequired: true,
      },
    ],
  };

  it("answers not ready and names the module and the lock", () => {
    const result = readinessFromHealth(kestrelWith(LOST));
    if (result.ready) throw new Error("expected the readiness check to report degraded");
    expect(result).toMatchObject({ state: "degraded", code: "degraded" });
    expect(result.error).toContain("persistence/sqlite");
    expect(result.error).toContain("no longer holds the database alone");
  });

  it("answers not live, so a supervisor restarts the process", () => {
    const result = livenessFromHealth(kestrelWith(LOST));
    if (result.live) throw new Error("expected the liveness check to report a restart");
    expect(result.error).toContain("persistence/sqlite");
    expect(result.error).toContain("kestrel.db.instance");
  });

  it("stays ready while the lock only notes a heartbeat that could not be written", () => {
    const noted: InstanceHealth = { ok: true, restartRequired: false, modules: [{ module: "persistence/sqlite", ok: true, note: "the heartbeat of /srv/app/data/kestrel.db.instance could not be written: EACCES" }] };
    expect(readinessFromHealth(kestrelWith(noted))).toEqual({ ready: true });
    expect(livenessFromHealth(kestrelWith(noted))).toEqual({ live: true });
  });
});
