import { describe, expect, it } from "vitest";
import { moduleRegistry, presetModules } from "./index";

describe("presetModules", () => {
  it("returns implementations in the same order as the config modules array", () => {
    const modules = [{ use: "@michaelthielemann/kestrel-content-default" }, { use: "@michaelthielemann/kestrel-persistence-sqlite" }];
    const result = presetModules(modules);
    expect(result).toEqual([moduleRegistry["@michaelthielemann/kestrel-content-default"], moduleRegistry["@michaelthielemann/kestrel-persistence-sqlite"]]);
  });

  it("throws naming the use value when it is not in the registry", () => {
    expect(() => presetModules([{ use: "@example/not-a-kestrel-module" }])).toThrow(/"@example\/not-a-kestrel-module"/);
  });

  it("prefers an extra implementation over the registry", () => {
    const own = { name: "own/module" };
    const result = presetModules([{ use: "@michaelthielemann/kestrel-content-default" }], { "@michaelthielemann/kestrel-content-default": own as never });
    expect(result).toEqual([own]);
  });

  it("resolves a non-standard use value only from extra", () => {
    const own = { name: "own/module" };
    const result = presetModules([{ use: "./modules/my-module.ts" }], { "./modules/my-module.ts": own as never });
    expect(result).toEqual([own]);
  });
});
