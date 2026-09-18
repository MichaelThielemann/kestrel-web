import { describe, expect, it } from "vitest";
import { hasModuleForStep, moduleConfigForStep, moduleIndexForStep, moduleNameForStep, type ConfigEntry, type ModuleLike } from "./modules";

const schema = (defaults: Record<string, unknown>): ModuleLike["configSchema"] => ({
  safeParse: (value) => (typeof value === "object" && value !== null ? { success: true, data: { ...defaults, ...value } } : { success: false }),
});

const media: ModuleLike = { name: "media/default", configSchema: schema({ maxBytes: 5242880, prefix: "media/" }) };
const images: ModuleLike = { name: "images/default", configSchema: schema({ publicPath: "/media" }) };
const sanitize: ModuleLike = { name: "sanitize/svg" };

const entries: ConfigEntry[] = [
  { use: "@acme/cms-media-store", config: { maxBytes: 42 } },
  { use: "@michaelthielemann/kestrel-images-default", config: {} },
  { use: "@michaelthielemann/kestrel-sanitize-svg", config: {} },
];

describe("moduleIndexForStep", () => {
  it("finds a module by the owner name the booted step registry reports", () => {
    expect(moduleIndexForStep([media, images, sanitize], "media/default")).toBe(0);
    expect(moduleNameForStep([media, images, sanitize], "media/default")).toBe("media/default");
    expect(hasModuleForStep([media, images, sanitize], "sanitize/svg")).toBe(true);
  });

  it("returns -1 when no module registers the step", () => {
    expect(moduleIndexForStep([media, images, sanitize], undefined)).toBe(-1);
    expect(hasModuleForStep([media, images, sanitize], undefined)).toBe(false);
    expect(moduleNameForStep([media, images, sanitize], undefined)).toBeUndefined();
  });

  it("returns -1 when the owner name matches none of the configured modules", () => {
    expect(moduleIndexForStep([media], "media/other")).toBe(-1);
  });
});

describe("moduleConfigForStep", () => {
  it("returns the entry config of the matching module, filled in by the module schema", () => {
    expect(moduleConfigForStep([media, images, sanitize], entries, "media/default")).toEqual({ maxBytes: 42, prefix: "media/" });
    expect(moduleConfigForStep([media, images, sanitize], entries, "images/default")).toEqual({ publicPath: "/media" });
  });

  it("returns undefined when no module registers the step", () => {
    expect(moduleConfigForStep([media, images, sanitize], entries, undefined)).toBeUndefined();
  });

  it("falls back to the raw entry config when the module schema rejects it", () => {
    const broken: ModuleLike = { name: "media/default", configSchema: { safeParse: () => ({ success: false }) } };
    expect(moduleConfigForStep([broken], [{ use: "x", config: { maxBytes: 7 } }], "media/default")).toEqual({ maxBytes: 7 });
  });

  it("throws when the module list and the config entries are out of sync", () => {
    expect(() => moduleConfigForStep([media, images], entries, "media/default")).toThrow(/same order/);
  });
});
