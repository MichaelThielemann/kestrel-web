import { describe, expect, it, vi } from "vitest";
import { checkDeliveryBuild, siteUrlMismatch } from "./build-check";
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
    await checkDeliveryBuild(kestrel, { build: "b-2026", siteUrl: "https://Example.org/", dev: false, pipelines: composed, logger: logger() });
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

describe("checkDeliveryBuild after a reported database restore", () => {
  const withSync = [...composed, { name: "syncPublicMedia" }];

  function restoredHost(restored: boolean, syncStatus = 200, changed = restored): BuildCheckHost & { run: ReturnType<typeof vi.fn> } {
    return {
      run: vi.fn((pipeline: string) =>
        Promise.resolve(pipeline === "deliveryBuildCheck" ? { runId: "run-1", status: 200, result: { changed, restored, marked: changed ? 3 : 0 } } : syncStatus < 400 ? { runId: "run-2", status: syncStatus, result: {} } : { runId: "run-2", status: syncStatus, error: "the blob store is unavailable" }),
      ),
    };
  }

  it("rebuilds the public media copies once, triggered like a boot event, when the check handled a new restore", async () => {
    const kestrel = restoredHost(true);
    const log = logger();
    await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: withSync, logger: log });
    expect(kestrel.run.mock.calls.map((call: unknown[]) => call[0])).toEqual(["deliveryBuildCheck", "syncPublicMedia"]);
    expect(kestrel.run).toHaveBeenLastCalledWith("syncPublicMedia", { trigger: { kind: "event", name: "boot" } });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("leaves the public media copies alone when the check reports no new restore", async () => {
    const kestrel = restoredHost(false);
    await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: withSync, logger: logger() });
    expect(kestrel.run.mock.calls.map((call: unknown[]) => call[0])).toEqual(["deliveryBuildCheck"]);
  });

  it("rebuilds the public media copies after a restore of a database that already knew the running build", async () => {
    const kestrel = restoredHost(true, 200, false);
    await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: withSync, logger: logger() });
    expect(kestrel.run.mock.calls.map((call: unknown[]) => call[0])).toEqual(["deliveryBuildCheck", "syncPublicMedia"]);
  });

  it("leaves the public media copies alone after a new build without a restore", async () => {
    const kestrel = restoredHost(false, 200, true);
    await checkDeliveryBuild(kestrel, { build: "b-2027", dev: false, pipelines: withSync, logger: logger() });
    expect(kestrel.run.mock.calls.map((call: unknown[]) => call[0])).toEqual(["deliveryBuildCheck"]);
  });

  const stepwise = [{ name: "deliveryBuildCheck", steps: ["replication.checkRestored", "delivery.checkBuild", "delivery.requestIndexes"] }, { name: "syncPublicMedia", steps: ["media.syncPublic"] }];

  function failingAt(step: string): BuildCheckHost & { run: ReturnType<typeof vi.fn> } {
    return {
      run: vi.fn((pipeline: string) => Promise.resolve(pipeline === "deliveryBuildCheck" ? { runId: "run-1", status: 503, error: "the step could not finish", step } : { runId: "run-2", status: 200, result: {} })),
    };
  }

  it("runs no sync when the check failed before it stored the restore, so the next start handles the same restore again", async () => {
    for (const step of ["replication.checkRestored", "delivery.checkBuild"]) {
      const kestrel = failingAt(step);
      const log = logger();
      await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: stepwise, logger: log });
      expect(kestrel.run.mock.calls.map((call: unknown[]) => call[0])).toEqual(["deliveryBuildCheck"]);
      expect(log.error).toHaveBeenCalledWith("delivery: the new build could not mark the published pages for a re-render", { status: 503, reason: "the step could not finish" });
    }
  });

  it("rebuilds the public media copies when the check failed after it stored a possible restore, which the next start no longer reports", async () => {
    const kestrel = failingAt("delivery.requestIndexes");
    const log = logger();
    await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: stepwise, logger: log });
    expect(kestrel.run.mock.calls.map((call: unknown[]) => call[0])).toEqual(["deliveryBuildCheck", "syncPublicMedia"]);
    expect(log.error).toHaveBeenCalledWith("delivery: the index files could not be exported at start", { status: 503, reason: "the step could not finish" });
  });

  it("rebuilds the public media copies at every start whose check fails after delivery.checkBuild, whether or not a restore was reported", async () => {
    const kestrel = failingAt("delivery.requestIndexes");
    for (let start = 0; start < 3; start++) await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: stepwise, logger: logger() });
    expect(kestrel.run.mock.calls.map((call: unknown[]) => call[0])).toEqual(["deliveryBuildCheck", "syncPublicMedia", "deliveryBuildCheck", "syncPublicMedia", "deliveryBuildCheck", "syncPublicMedia"]);
  });

  it("runs no sync when a failed check names no step or the composed pipelines carry no steps", async () => {
    const unnamed = { run: vi.fn(() => Promise.resolve({ runId: "run-1", status: 503, error: "the marks could not be written" })) };
    await checkDeliveryBuild(unnamed, { build: "b-2026", dev: false, pipelines: stepwise, logger: logger() });
    expect(unnamed.run).toHaveBeenCalledTimes(1);
    const named = failingAt("delivery.requestIndexes");
    await checkDeliveryBuild(named, { build: "b-2026", dev: false, pipelines: withSync, logger: logger() });
    expect(named.run).toHaveBeenCalledTimes(1);
  });

  it("runs no sync without the syncPublicMedia pipeline", async () => {
    const kestrel = restoredHost(true);
    await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: composed, logger: logger() });
    expect(kestrel.run).toHaveBeenCalledTimes(1);
  });

  it("logs a failed sync instead of failing the start", async () => {
    const kestrel = restoredHost(true, 503);
    const log = logger();
    expect(await checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: withSync, logger: log })).toBe(true);
    expect(log.error).toHaveBeenCalledWith("media: the public copies could not be rebuilt after the database was restored", { status: 503, reason: "the blob store is unavailable" });
  });

  it("logs a sync whose run rejects instead of letting the rejection stop the start", async () => {
    const kestrel = { run: vi.fn((pipeline: string) => (pipeline === "deliveryBuildCheck" ? Promise.resolve({ runId: "run-1", status: 200, result: { restored: true } }) : Promise.reject(new Error("persistence closed")))) };
    const log = logger();
    await expect(checkDeliveryBuild(kestrel, { build: "b-2026", dev: false, pipelines: withSync, logger: log })).resolves.toBe(true);
    expect(log.error).toHaveBeenCalledWith("media: the public copies could not be rebuilt after the database was restored", { reason: "persistence closed" });
  });
});

describe("siteUrlMismatch", () => {
  const delivery = (siteUrl?: string) => [{ use: "@michaelthielemann/kestrel-delivery-static", defaults: { from: "preset", values: siteUrl === undefined ? {} : { siteUrl } } }];

  it("stays silent when delivery-static and the pages use the same site URL, compared in normalised form", () => {
    expect(siteUrlMismatch(delivery("https://example.org/de"), "https://Example.org:443/de/")).toBeUndefined();
    expect(siteUrlMismatch([{ use: "@michaelthielemann/kestrel-delivery-static", config: { siteUrl: "https://example.org" } }], "https://example.org/")).toBeUndefined();
    expect(siteUrlMismatch(delivery(), "")).toBeUndefined();
  });

  it("stays silent without delivery-static", () => {
    expect(siteUrlMismatch([], "https://example.org")).toBeUndefined();
  });

  it("names both URLs when sitemap.xml and the canonical links would differ, also when one of them is missing", () => {
    expect(siteUrlMismatch(delivery("https://example.org"), "https://www.example.org")).toBe(
      'delivery-static writes sitemap.xml and llms.txt with siteUrl "https://example.org", but the pages build their canonical link, og:url and og:image from NUXT_PUBLIC_SITE_URL "https://www.example.org" – give both the same URL',
    );
    expect(siteUrlMismatch(delivery("https://example.org"), "")).toContain('NUXT_PUBLIC_SITE_URL ""');
    expect(siteUrlMismatch(delivery(), "https://example.org")).toContain('with no siteUrl');
  });
});
