import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { describe, expect, it } from "vitest";
import { checkPreset, definePreset } from "./index";
import type { PresetOptions } from "./index";

function options(raw: unknown): PresetOptions {
  return boundaryCast<PresetOptions>(raw, "json");
}

const baseModules = [
  { use: "@michaelthielemann/kestrel-authn-multi" },
  { use: "@michaelthielemann/kestrel-authz-roles" },
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
  { use: "@michaelthielemann/kestrel-media-default" },
  { use: "@michaelthielemann/kestrel-events-inmemory" },
  { use: "@michaelthielemann/kestrel-events-direct" },
];

const eventsBus = "@michaelthielemann/kestrel-events-inmemory";

describe("checkPreset parity with definePreset", () => {
  it("collects the same message definePreset throws, for an invalid collection name", () => {
    const testOptions: PresetOptions = { modules: baseModules, features: [], collections: { "Bad-Name": { kind: "single", fields: {} } } };
    expect(() => definePreset(testOptions)).toThrow();
    let thrown: string | undefined;
    try {
      definePreset(testOptions);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }
    const { problems } = checkPreset(testOptions);
    expect(problems[0]?.code).toBe("preset/collection-name-invalid");
    expect(problems[0]?.message).toBe(thrown);
  });

  it("collects the same message definePreset throws, for a reserved collection name", () => {
    const testOptions: PresetOptions = { modules: baseModules, features: [], collections: { media: { kind: "single", fields: {} } } };
    let thrown: string | undefined;
    try {
      definePreset(testOptions);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }
    const { problems } = checkPreset(testOptions);
    expect(problems[0]?.code).toBe("preset/collection-name-reserved");
    expect(problems[0]?.message).toBe(thrown);
  });

  it("collects the same message definePreset throws, for a missing event bus", () => {
    const modules = baseModules.filter((m) => m.use !== eventsBus);
    const testOptions: PresetOptions = { modules, features: [] };
    let thrown: string | undefined;
    try {
      definePreset(testOptions);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }
    const { problems } = checkPreset(testOptions);
    expect(problems.map((p) => p.code)).toContain("preset/missing-event-bus");
    expect(problems.find((p) => p.code === "preset/missing-event-bus")?.message).toBe(thrown);
  });

  it("collects the same message definePreset throws, for an override naming an unknown pipeline", () => {
    const testOptions = options({ modules: baseModules, features: [], overrides: { doesNotExist: ["authn.requireUser"] } });
    let thrown: string | undefined;
    try {
      definePreset(testOptions);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }
    const { preset, problems } = checkPreset(testOptions);
    expect(problems[0]?.code).toBe("preset/override-unknown-pipeline");
    expect(problems[0]?.message).toBe(thrown);
    expect(preset.pipelines.some((p) => p.name === "doesNotExist")).toBe(false);
  });

  it("never throws, unlike definePreset, and still composes a preset", () => {
    const testOptions = options({ modules: baseModules, features: [], exclude: ["doesNotExist"] });
    expect(() => checkPreset(testOptions)).not.toThrow();
    const { preset, problems } = checkPreset(testOptions);
    expect(problems[0]?.code).toBe("preset/exclude-unknown-pipeline");
    expect(preset.pipelines.length).toBeGreaterThan(0);
  });

  it("applies a valid override exactly as given even when a different, unrelated problem exists", () => {
    const testOptions = options({
      modules: baseModules.filter((m) => m.use !== eventsBus),
      features: [],
      overrides: { me: ["authn.requireUser", "authn.loadIdentity", "events.emit:me.viewed"] },
    });
    const { preset, problems } = checkPreset(testOptions);
    expect(problems.some((p) => p.code === "preset/missing-event-bus")).toBe(true);
    expect(preset.pipelines.find((p) => p.name === "me")?.steps).toEqual(["authn.requireUser", "authn.loadIdentity", "events.emit:me.viewed"]);
  });

  it("collects every independent problem in one call instead of stopping at the first", () => {
    const testOptions = options({
      modules: baseModules.filter((m) => m.use !== eventsBus),
      features: [],
      collections: { "Bad-Name": { kind: "single", fields: {} } },
      overrides: { login: ["authn.login"], doesNotExist: ["authn.requireUser"] },
      exclude: ["login", "alsoMissing"],
    });
    const { problems } = checkPreset(testOptions);
    const codes = problems.map((p) => p.code);
    expect(codes).toContain("preset/collection-name-invalid");
    expect(codes).toContain("preset/missing-event-bus");
    expect(codes).toContain("preset/override-unknown-pipeline");
    expect(codes).toContain("preset/exclude-unknown-pipeline");
    expect(codes).toContain("preset/override-and-exclude");
    expect(problems.length).toBeGreaterThanOrEqual(5);
  });

  it("drops the atomic group around a content write and is still reported, with the override applied as given", () => {
    const testOptions = options({
      modules: baseModules,
      features: [],
      overrides: { deletePage: ["authn.requireUser", "authz.require:pages.manage", "content.remove:pages"] },
    });
    const { preset, problems } = checkPreset(testOptions);
    expect(problems.some((p) => p.code === "preset/override-drops-atomic-group" && p.pipeline === "deletePage")).toBe(true);
    expect(preset.pipelines.find((p) => p.name === "deletePage")?.steps).toEqual(["authn.requireUser", "authz.require:pages.manage", "content.remove:pages"]);
  });
});
