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

function contextFor(options: { files?: Record<string, string>; existingFiles?: string[]; features?: string[]; configModules?: Array<{ use: string }> }): RuleContext {
  const files = new Map<string, string>([[MODEL_FILE, MODEL_SOURCE], ...Object.entries(options.files ?? {})]);
  vi.mocked(existsSync).mockImplementation((p) => (options.existingFiles ?? []).includes(String(p)));
  return {
    root: "/fake",
    scratch: "/fake",
    project: {
      input: { config: { modules: options.configModules ?? [], triggers: [], http: null }, modules: [], pipelines: [] },
      kind: "kestrel-web",
      configFile: CONFIG_FILE,
      moduleFiles: new Map(),
      pipelineFiles: [],
      data: { presetProblems: [], presetOptions: { modules: [], features: options.features ?? [], collections: {} } },
    },
    bootCheck: { errors: [], warnings: [], notChecked: [] },
    readFile: (file) => files.get(file),
    answers: new Map(),
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

  it("replaces a hand-written events-direct entry with events-queue and the caller's own relayPipelines answer", async () => {
    const source = `import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";\nexport default defineConfig({ modules: [{ use: "@michaelthielemann/kestrel-events-direct" }], triggers: [], http: null });\n`;
    const result = await layerSwitchEdits(contextFor({ files: { [CONFIG_FILE]: source }, features: ["delivery"] }), ["updatePage"]);
    const edits = result.parts["kestrel.config.ts's hand-written events-direct entry"];
    expect(edits).toHaveLength(1);
    const edit = edits![0]!;
    const patched = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    expect(patched).toContain('"@michaelthielemann/kestrel-events-queue"');
    expect(patched).not.toContain("kestrel-events-direct");
    expect(patched).toMatch(/relayPipelines:\s*\["updatePage"\]/);
  });

  it("writes an empty relayPipelines when the answer is empty, regardless of features", async () => {
    const source = `import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";\nexport default defineConfig({ modules: [{ use: "@michaelthielemann/kestrel-events-direct" }], triggers: [], http: null });\n`;
    const result = await layerSwitchEdits(contextFor({ files: { [CONFIG_FILE]: source }, features: ["delivery"] }), []);
    const edits = result.parts["kestrel.config.ts's hand-written events-direct entry"];
    const edit = edits![0]!;
    const patched = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    expect(patched).toMatch(/relayPipelines:\s*\[\]/);
  });

  it("does not add a hand-written-module-list part at all when events-direct is not named literally", async () => {
    const result = await layerSwitchEdits(contextFor({}), []);
    expect(result.parts).not.toHaveProperty("kestrel.config.ts's hand-written events-direct entry");
  });

  it("skips the literal replacement when a delivery module is already registered twice, keeping only the features edit", async () => {
    const source = `import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";\nconst presetModules = presetModuleConfig({});\nconst modules = [...presetModules, { use: "@michaelthielemann/kestrel-events-direct", config: {} }];\nexport default defineConfig({ modules, triggers: [], http: null });\n`;
    const result = await layerSwitchEdits(
      contextFor({ files: { [CONFIG_FILE]: source }, features: ["delivery"], configModules: [{ use: "@michaelthielemann/kestrel-events-direct" }, { use: "@michaelthielemann/kestrel-events-direct" }] }),
      ["updatePage"],
    );
    expect(result.parts).not.toHaveProperty("kestrel.config.ts's hand-written events-direct entry");
    expect(result.parts["shared/model.ts's features array"]).toHaveLength(1);
  });

  it("still replaces the literal when only one delivery module is currently registered", async () => {
    const source = `import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";\nexport default defineConfig({ modules: [{ use: "@michaelthielemann/kestrel-events-direct" }], triggers: [], http: null });\n`;
    const result = await layerSwitchEdits(contextFor({ files: { [CONFIG_FILE]: source }, configModules: [{ use: "@michaelthielemann/kestrel-events-direct" }] }), ["updatePage"]);
    expect(result.parts["kestrel.config.ts's hand-written events-direct entry"]).toHaveLength(1);
  });
});
