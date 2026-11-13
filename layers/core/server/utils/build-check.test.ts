import { describe, expect, it, vi } from "vitest";
import { checkDeliveryBuild, deliverySiteUrl } from "./build-check";
import type { BuildCheckHost } from "./build-check";

const composed = [{ name: "deliveryBuildCheck" }, { name: "publishPage" }];

function host(status = 200, error?: string): BuildCheckHost & { run: ReturnType<typeof vi.fn> } {
  return { run: vi.fn(() => Promise.resolve(error === undefined ? { runId: "run-1", status } : { runId: "run-1", status, error })) };
}

function logger(): { error: ReturnType<typeof vi.fn> } {
  return { error: vi.fn() };
}

describe("checkDeliveryBuild", () => {
  it("runs deliveryBuildCheck once with the running build and the site URL, triggered like a boot event", async () => {
    const kestrel = host();
    const log = logger();
    expect(await checkDeliveryBuild(kestrel, { build: "b-2026", siteUrl: "https://example.org", dev: false, pipelines: composed, logger: log })).toBe(true);
    expect(kestrel.run).toHaveBeenCalledTimes(1);
    expect(kestrel.run).toHaveBeenCalledWith("deliveryBuildCheck", { trigger: { kind: "event", name: "boot" }, payload: { build: "b-2026|https://example.org" } });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("gives a changed site URL a different build key, so the pages are rendered again with their new absolute URLs", async () => {
    const kestrel = host();
    await checkDeliveryBuild(kestrel, { build: "b-2026", siteUrl: "https://example.org", dev: false, pipelines: composed, logger: logger() });
    await checkDeliveryBuild(kestrel, { build: "b-2026", siteUrl: "https://example.com", dev: false, pipelines: composed, logger: logger() });
    await checkDeliveryBuild(kestrel, { build: "b-2026", siteUrl: undefined, dev: false, pipelines: composed, logger: logger() });
    const builds = kestrel.run.mock.calls.map((call: unknown[]) => JSON.stringify(call[1]));
    expect(builds).toEqual([
      JSON.stringify({ trigger: { kind: "event", name: "boot" }, payload: { build: "b-2026|https://example.org" } }),
      JSON.stringify({ trigger: { kind: "event", name: "boot" }, payload: { build: "b-2026|https://example.com" } }),
      JSON.stringify({ trigger: { kind: "event", name: "boot" }, payload: { build: "b-2026|" } }),
    ]);
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

  it("logs a check whose run rejects instead of letting the rejection stop the start", async () => {
    const kestrel = { run: vi.fn(() => Promise.reject(new Error("persistence closed"))) };
    const log = logger();
    await expect(checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: composed, logger: log })).resolves.toBe(true);
    expect(log.error).toHaveBeenCalledWith("delivery: the new build could not mark the published pages for a re-render", { reason: "persistence closed" });
  });
});

describe("deliverySiteUrl", () => {
  it("reads delivery-static's siteUrl in its normalised form, from the config or the preset's defaults", () => {
    expect(deliverySiteUrl([{ use: "@michaelthielemann/kestrel-delivery-static", config: { siteUrl: "https://Example.org/de/" } }])).toBe("https://example.org/de");
    expect(deliverySiteUrl([{ use: "@michaelthielemann/kestrel-delivery-static", defaults: { from: "preset", values: { siteUrl: "https://example.org" } } }])).toBe("https://example.org");
  });

  it("answers undefined without delivery-static or without a siteUrl", () => {
    expect(deliverySiteUrl([])).toBeUndefined();
    expect(deliverySiteUrl([{ use: "@michaelthielemann/kestrel-delivery-static", config: { types: {} } }])).toBeUndefined();
  });
});
