import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { layerSwitchEdits } from "./switchEdits";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(actual.existsSync), readdirSync: vi.fn(() => []) };
});

const MODEL_FILE = "/fake/shared/model.ts";
const MODEL_SOURCE = `export const features = ["references"] as const satisfies readonly Feature[];\n`;
const CONFIG_FILE = "/fake/kestrel.config.ts";

function contextFor(options: { files?: Record<string, string>; existingFiles?: string[] }): RuleContext {
  const files = new Map<string, string>([[MODEL_FILE, MODEL_SOURCE], ...Object.entries(options.files ?? {})]);
  vi.mocked(existsSync).mockImplementation((p) => (options.existingFiles ?? []).includes(String(p)));
  return {
    root: "/fake",
    scratch: "/fake",
    project: { input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: [] }, kind: "kestrel-web", configFile: CONFIG_FILE, moduleFiles: new Map(), pipelineFiles: [] },
    bootCheck: { errors: [], warnings: [], notChecked: [] },
    readFile: (file) => files.get(file),
    answers: new Map(),
    ownsPackages: [],
  };
}

describe("layerSwitchEdits", () => {
  it("adds eventsQueue to shared/model.ts's features array, no blockers, on a plain project", async () => {
    const result = await layerSwitchEdits(contextFor({}), []);
    expect(result.blockers).toEqual([]);
    const edits = result.parts["shared/model.ts's features array"];
    expect(edits).toHaveLength(1);
    const edit = edits![0]!;
    const patched = MODEL_SOURCE.slice(0, edit.start) + edit.text + MODEL_SOURCE.slice(edit.end);
    expect(patched).toContain('"eventsQueue"');
  });

  it("blocks on a generic serverless marker file", async () => {
    const result = await layerSwitchEdits(contextFor({ existingFiles: ["/fake/vercel.json"] }), []);
    expect(result.blockers.some((b) => b.includes("vercel.json"))).toBe(true);
  });

  it("blocks on nitro.preset in nuxt.config.ts", async () => {
    const result = await layerSwitchEdits(contextFor({ files: { "/fake/nuxt.config.ts": 'export default defineNuxtConfig({ nitro: { preset: "vercel" } });\n' } }), []);
    expect(result.blockers.some((b) => b.includes("vercel"))).toBe(true);
  });

  it("blocks on NITRO_PRESET in a package.json script", async () => {
    const result = await layerSwitchEdits(contextFor({ files: { "/fake/package.json": JSON.stringify({ scripts: { build: "NITRO_PRESET=vercel nuxt build" } }) } }), []);
    expect(result.blockers.some((b) => b.includes("NITRO_PRESET"))).toBe(true);
  });

  it("reports a hand-written events-direct entry as a missing part, not a guessed edit", async () => {
    const source = `import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";\nexport default defineConfig({ modules: [{ use: "@michaelthielemann/kestrel-events-direct" }], triggers: [], http: null });\n`;
    const result = await layerSwitchEdits(contextFor({ files: { [CONFIG_FILE]: source } }), []);
    expect(result.parts["kestrel.config.ts's hand-written events-direct entry"]).toBeUndefined();
  });
});
