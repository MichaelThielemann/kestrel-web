import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import insights from "@michaelthielemann/kestrel-insights";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { moduleRegistry, presetModules } from "./index";
import type { OptionalStep } from "./index";

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
    const result = presetModules([{ use: "@michaelthielemann/kestrel-content-default" }], { "@michaelthielemann/kestrel-content-default": boundaryCast(own, "json") });
    expect(result).toEqual([own]);
  });

  it("resolves a non-standard use value only from extra", () => {
    const own = { name: "own/module" };
    const result = presetModules([{ use: "./modules/my-module.ts" }], { "./modules/my-module.ts": boundaryCast(own, "json") });
    expect(result).toEqual([own]);
  });
});

interface PackageJson {
  dependencies?: Record<string, string>;
}

function readPackageJson(): PackageJson {
  const path = fileURLToPath(new URL("../../../package.json", import.meta.url));
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  return boundaryCast<PackageJson>(parsed, "json");
}

const EXCLUDED_SUFFIXES = ["-contracts", "-h3", "-openapi"];
const OPTIONAL_PEERS = new Set(["@michaelthielemann/kestrel-insights"]);

function isRegistryEligible(name: string): boolean {
  if (name === "@michaelthielemann/kestrel") return false;
  if (!name.startsWith("@michaelthielemann/kestrel-")) return false;
  if (EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return false;
  return !OPTIONAL_PEERS.has(name);
}

describe("moduleRegistry vs package.json", () => {
  it("has a registry entry for every eligible @michaelthielemann/kestrel-* dependency and no extra entries", () => {
    const { dependencies = {} } = readPackageJson();
    const eligible = Object.keys(dependencies).filter(isRegistryEligible).sort();
    const registryKeys = Object.keys(moduleRegistry).sort();
    expect(registryKeys).toEqual(eligible);
  });
});

describe("OptionalStep", () => {
  const asWritten = {
    "insights.readManifest": 1,
    "insights.readStats": 1,
  } satisfies Record<OptionalStep, 1>;

  it("lists exactly the steps the installed kestrel-insights module registers", () => {
    const prefix = insights.name.split("/")[0] ?? "";
    const stepMap = insights.steps?.(undefined) ?? {};
    const actual = Object.keys(stepMap)
      .map((key) => `${prefix}.${key}`)
      .sort();
    expect(actual).toEqual(Object.keys(asWritten).sort());
  });
});
