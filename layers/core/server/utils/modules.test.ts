import { describe, expect, it } from "vitest";
import { hasModuleForStep, moduleConfigForStep, moduleIndexForStep, moduleNameForStep, type ConfigEntry, type ModuleLike } from "./modules";

const schema = (defaults: Record<string, unknown>): ModuleLike["configSchema"] => ({
  safeParse: (value) => (typeof value === "object" && value !== null ? { success: true, data: { ...defaults, ...value } } : { success: false }),
});

const media: ModuleLike = {
  name: "media/default",
  steps: () => ({ upload: () => undefined, list: () => undefined }),
  configSchema: schema({ maxBytes: 5242880, prefix: "media/" }),
};

const images: ModuleLike = {
  name: "images/default",
  steps: () => ({ register: () => undefined }),
  configSchema: schema({ publicPath: "/media" }),
};

const sanitize: ModuleLike = { name: "sanitize/svg", steps: () => ({ svg: () => undefined }) };

const entries: ConfigEntry[] = [
  { use: "@acme/cms-media-store", config: { maxBytes: 42 } },
  { use: "@michaelthielemann/kestrel-images-default", config: {} },
  { use: "@michaelthielemann/kestrel-sanitize-svg", config: {} },
];

describe("moduleIndexForStep", () => {
  it("finds a module by the step it registers, whatever the package is called", () => {
    expect(moduleIndexForStep([media, images, sanitize], "media.upload")).toBe(0);
    expect(moduleNameForStep([media, images, sanitize], "media.upload")).toBe("media/default");
    expect(hasModuleForStep([media, images, sanitize], "sanitize.svg")).toBe(true);
  });

  it("does not match a module that only shares the step prefix", () => {
    const other: ModuleLike = { name: "media/readonly", steps: () => ({ list: () => undefined }) };
    expect(moduleIndexForStep([other], "media.upload")).toBe(-1);
    expect(hasModuleForStep([other], "media.upload")).toBe(false);
  });

  it("ignores modules without steps and unknown prefixes", () => {
    expect(moduleIndexForStep([{ name: "persistence/sqlite" }], "media.upload")).toBe(-1);
    expect(moduleIndexForStep([media], "content.create")).toBe(-1);
  });

  it("falls back to the prefix when the step map cannot be built without an instance", () => {
    const throwing: ModuleLike = {
      name: "media/lazy",
      steps: () => {
        throw new Error("needs an instance");
      },
    };
    expect(moduleIndexForStep([throwing], "media.upload")).toBe(0);
  });
});

describe("moduleConfigForStep", () => {
  it("returns the entry config of the matching module, filled in by the module schema", () => {
    expect(moduleConfigForStep([media, images, sanitize], entries, "media.upload")).toEqual({ maxBytes: 42, prefix: "media/" });
    expect(moduleConfigForStep([media, images, sanitize], entries, "images.register")).toEqual({ publicPath: "/media" });
  });

  it("returns undefined when no module registers the step", () => {
    expect(moduleConfigForStep([media, images, sanitize], entries, "content.create")).toBeUndefined();
  });

  it("falls back to the raw entry config when the module schema rejects it", () => {
    const broken: ModuleLike = { name: "media/default", steps: () => ({ upload: () => undefined }), configSchema: { safeParse: () => ({ success: false }) } };
    expect(moduleConfigForStep([broken], [{ use: "x", config: { maxBytes: 7 } }], "media.upload")).toEqual({ maxBytes: 7 });
  });

  it("throws when the module list and the config entries are out of sync", () => {
    expect(() => moduleConfigForStep([media, images], entries, "media.upload")).toThrow(/same order/);
  });
});
