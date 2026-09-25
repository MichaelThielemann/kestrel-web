import { describe, expect, it, vi } from "vitest";
import { checkDeliveryBuild } from "./build-check";
import type { BuildCheckHost } from "./build-check";

const composed = [{ name: "deliveryBuildCheck" }, { name: "publishPage" }];

function host(status = 200, error?: string): BuildCheckHost & { run: ReturnType<typeof vi.fn> } {
  return { run: vi.fn(() => Promise.resolve(error === undefined ? { runId: "run-1", status } : { runId: "run-1", status, error })) };
}

function logger(): { error: ReturnType<typeof vi.fn> } {
  return { error: vi.fn() };
}

describe("checkDeliveryBuild", () => {
  it("runs deliveryBuildCheck once with the running build, triggered like a boot event", async () => {
    const kestrel = host();
    const log = logger();
    expect(await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: composed, logger: log })).toBe(true);
    expect(kestrel.run).toHaveBeenCalledTimes(1);
    expect(kestrel.run).toHaveBeenCalledWith("deliveryBuildCheck", { trigger: { kind: "event", name: "boot" }, payload: { build: "b-2026" } });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("runs nothing in dev, where every start is a new build", async () => {
    const kestrel = host();
    expect(await checkDeliveryBuild(kestrel, { build: "dev", dev: true, pipelines: composed, logger: logger() })).toBe(false);
    expect(kestrel.run).not.toHaveBeenCalled();
  });

  it("runs nothing without a build id or when the preset composes no build check", async () => {
    const kestrel = host();
    expect(await checkDeliveryBuild(kestrel, { build: undefined, dev: false, pipelines: composed, logger: logger() })).toBe(false);
    expect(await checkDeliveryBuild(kestrel, { build: "", dev: false, pipelines: composed, logger: logger() })).toBe(false);
    expect(await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: [{ name: "publishPage" }], logger: logger() })).toBe(false);
    expect(kestrel.run).not.toHaveBeenCalled();
  });

  it("logs a failed check instead of failing the start", async () => {
    const kestrel = host(503, "the marks could not be written");
    const log = logger();
    expect(await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: composed, logger: log })).toBe(true);
    expect(log.error).toHaveBeenCalledWith("delivery: the new build could not mark the published pages for a re-render", { status: 503, reason: "the marks could not be written" });
  });
});
