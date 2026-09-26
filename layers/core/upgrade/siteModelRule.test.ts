import { describe, expect, it } from "vitest";
import type { Edit, LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { siteModelOptionsRule } from "./siteModelRule";

const CONFIG = "/fake/kestrel.config.ts";
const MODEL = "/fake/shared/model.ts";

const config = `import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import { contentModel, contentTypes, features } from "./shared/model";

const modules = presetModuleConfig({
  model: contentModel,
  features,
});

export const preset = definePreset({ modules, features, collections: contentTypes });
`;

function contextFor(model: string, siteConfig: unknown): RuleContext {
  const project: LoadedProject = {
    input: { config: { modules: [{ use: "@michaelthielemann/kestrel-site-default", config: siteConfig }], triggers: [], http: null }, modules: [], pipelines: [] },
    kind: "kestrel-web",
    configFile: CONFIG,
    moduleFiles: new Map(),
    pipelineFiles: [],
    data: { presetProblems: [] },
  };
  return { root: "/fake", scratch: "/fake", project, bootCheck: { errors: [], warnings: [], notChecked: [] }, readFile: (file) => (file === CONFIG ? config : file === MODEL ? model : undefined), answers: new Map() };
}

function applied(source: string, edits: readonly Edit[]): string {
  return [...edits].sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
}

describe("siteModelOptionsRule", () => {
  it("is an error that passes both options when shared/model's prefixPrimary would fail the boot", async () => {
    const [finding] = await siteModelOptionsRule.check(contextFor('export const prefixPrimary = true;\nexport const homeSlug = "home";\n', { routes: { pages: { home: "home" } }, prefixPrimary: false }));
    expect(finding).toMatchObject({ rule: "preset/site-model-options", severity: "error" });
    if (finding?.fix.kind !== "auto") throw new Error("expected an automatic fix");
    const fixed = applied(config, finding.fix.edits);
    expect(fixed).toContain('import { contentModel, contentTypes, features, homeSlug, prefixPrimary } from "./shared/model";');
    expect(fixed).toContain("  features,\n  homeSlug,\n  prefixPrimary,\n});");
    expect(fixed).toContain("definePreset({ modules, features, collections: contentTypes, homeSlug })");
  });

  it("is a warning while shared/model keeps the defaults", async () => {
    const [finding] = await siteModelOptionsRule.check(contextFor('export const prefixPrimary = false;\nexport const homeSlug = "home";\n', { routes: { pages: { home: "home" } } }));
    expect(finding?.severity).toBe("warning");
  });
});
