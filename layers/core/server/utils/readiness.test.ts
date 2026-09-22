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
