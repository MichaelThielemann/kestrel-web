import { describe, expect, it } from "vitest";
import { createFakePersistence } from "@michaelthielemann/kestrel-contracts/testing/fakePersistence";
import { probePersistence } from "./readiness";

function kestrelWith(persistence: ReturnType<typeof createFakePersistence>): { contracts: { find: () => typeof persistence } } {
  return { contracts: { find: () => persistence } };
}

describe("probePersistence", () => {
  it("reports ready when the store answers normally", async () => {
    const persistence = createFakePersistence();
    await persistence.ensureCollection("pages", {});
    const result = await probePersistence(kestrelWith(persistence), "pages");
    expect(result).toEqual({ ready: true });
  });

  it("reports degraded, without throwing, for a resolved Err from the store", async () => {
    const persistence = createFakePersistence();
    await persistence.ensureCollection("pages", {});
    persistence.failNext("TRANSIENT");
    const result = await probePersistence(kestrelWith(persistence), "pages");
    if (result.ready) throw new Error("expected the probe to report degraded");
    expect(result).toMatchObject({ state: "degraded", code: "degraded" });
    expect(result.error).toContain("TRANSIENT");
  });
});
