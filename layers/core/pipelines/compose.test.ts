import { describe, expect, it } from "vitest";
import type { PresetStep } from "../module-registry";
import { applyExclude, applyFeaturePatches, applyOverrides, applySchedules, mergePipelines } from "./compose";
import type { Patch } from "./compose";

type F = "a" | "b";

describe("applyFeaturePatches", () => {
  it("inserts steps before an anchor", () => {
    const pipelines = { p: ["one", "two", "three"] };
    const patches: readonly Patch<F>[] = [{ pipeline: "p", steps: ["inserted"], at: "before", anchor: "two" }];
    const result = applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a"]));
    expect(result.p).toEqual(["one", "inserted", "two", "three"]);
  });

  it("inserts steps at the start", () => {
    const pipelines = { p: ["one", "two"] };
    const patches: readonly Patch<F>[] = [{ pipeline: "p", steps: ["zero"], at: "start" }];
    const result = applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a"]));
    expect(result.p).toEqual(["zero", "one", "two"]);
  });

  it("inserts steps at the end", () => {
    const pipelines = { p: ["one", "two"] };
    const patches: readonly Patch<F>[] = [{ pipeline: "p", steps: ["three"], at: "end" }];
    const result = applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a"]));
    expect(result.p).toEqual(["one", "two", "three"]);
  });

  it("applies two before-patches against the same anchor so the later one lands after the earlier one", () => {
    const pipelines = { p: ["one", "anchor", "three"] };
    const patches: readonly Patch<F>[] = [
      { pipeline: "p", steps: ["first"], at: "before", anchor: "anchor" },
      { pipeline: "p", steps: ["second"], at: "before", anchor: "anchor" },
    ];
    const result = applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a"]));
    expect(result.p).toEqual(["one", "first", "second", "anchor", "three"]);
  });

  it("throws naming feature, pipeline and anchor when the anchor is missing", () => {
    const pipelines = { p: ["one", "two"] };
    const patches: readonly Patch<F>[] = [{ pipeline: "p", steps: ["x"], at: "before", anchor: "missing" }];
    expect(() => applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a"]))).toThrow(/"a".*"p".*"missing"/s);
  });

  it("throws naming feature, pipeline and anchor when the anchor occurs more than once", () => {
    const pipelines = { p: ["dup", "dup"] };
    const patches: readonly Patch<F>[] = [{ pipeline: "p", steps: ["x"], at: "before", anchor: "dup" }];
    expect(() => applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a"]))).toThrow(/"a".*"p".*"dup"/s);
  });

  it("throws when a step being inserted already exists in the pipeline", () => {
    const pipelines = { p: ["one", "two"] };
    const patches: readonly Patch<F>[] = [{ pipeline: "p", steps: ["one"], at: "end" }];
    expect(() => applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a"]))).toThrow();
  });

  it("skips a patch whose when-feature is not enabled", () => {
    const pipelines = { p: ["one"] };
    const patches: readonly Patch<F>[] = [{ pipeline: "p", steps: ["two"], when: "b", at: "end" }];
    const result = applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a"]));
    expect(result.p).toEqual(["one"]);
  });

  it("applies a patch whose when-feature is enabled", () => {
    const pipelines = { p: ["one"] };
    const patches: readonly Patch<F>[] = [{ pipeline: "p", steps: ["two"], when: "b", at: "end" }];
    const result = applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a", "b"]));
    expect(result.p).toEqual(["one", "two"]);
  });

  it("does not mutate the input pipelines", () => {
    const pipelines = { p: ["one"] };
    const patches: readonly Patch<F>[] = [{ pipeline: "p", steps: ["two"], at: "end" }];
    applyFeaturePatches(pipelines, "a", patches, new Set<F>(["a"]));
    expect(pipelines.p).toEqual(["one"]);
  });
});

describe("mergePipelines", () => {
  it("adds whole pipelines from a feature", () => {
    const base = { p: ["one"] };
    const result = mergePipelines(base, { q: ["two"] }, "a");
    expect(result).toEqual({ p: ["one"], q: ["two"] });
  });

  it("throws when a feature pipeline name collides with an existing one", () => {
    const base = { p: ["one"] };
    expect(() => mergePipelines(base, { p: ["two"] }, "a")).toThrow();
  });
});

describe("applyOverrides", () => {
  it("replaces the composed step list of a pipeline", () => {
    const pipelines = { p: ["one", "two"] };
    const result = applyOverrides(pipelines, { p: ["only"] });
    expect(result.p).toEqual(["only"]);
  });

  it("throws for an unknown pipeline name", () => {
    const pipelines = { p: ["one"] };
    expect(() => applyOverrides(pipelines, { missing: ["x"] })).toThrow();
  });
});

describe("applyExclude", () => {
  it("removes a pipeline and every trigger pointing at it", () => {
    const pipelines = { p: ["one"], q: ["two"] };
    const triggers = [{ pipeline: "p" }, { pipeline: "q" }];
    const result = applyExclude(pipelines, triggers, ["p"]);
    expect(result.pipelines).toEqual({ q: ["two"] });
    expect(result.triggers).toEqual([{ pipeline: "q" }]);
  });

  it("throws for an unknown pipeline name", () => {
    const pipelines = { p: ["one"] };
    expect(() => applyExclude(pipelines, [], ["missing"])).toThrow();
  });
});

describe("applySchedules", () => {
  it("replaces the cron expression of a matching cron trigger", () => {
    const triggers = [{ cron: "0 * * * *", pipeline: "p" }, { http: "GET /x", pipeline: "q" }] as const;
    const result = applySchedules(triggers, { p: "5 * * * *" });
    expect(result).toEqual([{ cron: "5 * * * *", pipeline: "p" }, { http: "GET /x", pipeline: "q" }]);
  });

  it("throws for an unknown or non-cron pipeline name", () => {
    const triggers = [{ http: "GET /x", pipeline: "q" }] as const;
    expect(() => applySchedules(triggers, { q: "5 * * * *" })).toThrow();
    expect(() => applySchedules(triggers, { missing: "5 * * * *" })).toThrow();
  });
});

describe("Patch typed against the step catalogue", () => {
  it("accepts registered step names", () => {
    const patch: Patch<F, PresetStep> = { pipeline: "uploadMedia", steps: ["sanitize.svg"], at: "before", anchor: "media.upload" };
    const result = applyFeaturePatches({ uploadMedia: ["media.upload"] }, "a", [patch], new Set<F>(["a"]));
    expect(result.uploadMedia).toEqual(["sanitize.svg", "media.upload"]);
  });

  it("rejects a misspelled step name", () => {
    // @ts-expect-error "authn.requireUsr" is not a registered step
    const patch: Patch<F, PresetStep> = { pipeline: "logout", steps: ["authn.requireUsr"], at: "start" };
    expect(patch.steps).toEqual(["authn.requireUsr"]);
  });

  it("rejects a misspelled anchor", () => {
    // @ts-expect-error "media.uplod" is not a registered step
    const patch: Patch<F, PresetStep> = { pipeline: "uploadMedia", steps: ["sanitize.svg"], at: "before", anchor: "media.uplod" };
    expect(patch.at).toBe("before");
  });
});
