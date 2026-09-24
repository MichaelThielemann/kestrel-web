import { describe, expect, it, vi } from "vitest";
import type { BootCheck } from "@michaelthielemann/kestrel";
import type { Edit, LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { overrideGroupRule } from "./rules";

const FILE = "/fake/kestrel.config.ts";

const OVERRIDE_SOURCE = `
export const preset = definePreset({
  modules,
  features,
  overrides: {
    updatePage: [
      "authn.requireUser",
      "authz.require:pages.write",
      "references.check:pages",
      "content.update:pages",
      "authn.identifyUser",
      "references.index:pages",
      "links.extract:pages",
      "events.emit:page.updated",
    ],
  },
});
`;

const presetOptions = {
  modules: [
    { use: "@michaelthielemann/kestrel-authn-multi" },
    { use: "@michaelthielemann/kestrel-authz-roles" },
    { use: "@michaelthielemann/kestrel-content-default" },
    { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
    { use: "@michaelthielemann/kestrel-media-default" },
    { use: "@michaelthielemann/kestrel-events-inmemory" },
    { use: "@michaelthielemann/kestrel-events-direct" },
    { use: "@michaelthielemann/kestrel-references-default" },
    { use: "@michaelthielemann/kestrel-links-default" },
  ],
  features: ["references", "links"],
  collections: {
    pages: {
      kind: "multi",
      fields: {
        slug: { type: "slug", required: true, unique: true, localized: true },
        title: { type: "text", required: true, localized: true },
        body: { type: "json", localized: true },
      },
    },
  },
};

function contextFor(options: { answer?: string; bootErrors?: BootCheck["errors"] }): RuleContext {
  const answers = new Map<string, string>(options.answer === undefined ? [] : [[`override-group:updatePage`, options.answer]]);
  const previewBoot = vi.fn(async (_edits: readonly Edit[]): Promise<BootCheck | undefined> => ({ errors: options.bootErrors ?? [], warnings: [], notChecked: [] }));
  const project: LoadedProject = {
    input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: [] },
    kind: "kestrel-web",
    configFile: FILE,
    moduleFiles: new Map(),
    pipelineFiles: new Map([["updatePage", FILE]]),
    data: {
      presetProblems: [{ code: "preset/override-drops-atomic-group", pipeline: "updatePage", message: 'preset: override for "updatePage" drops the atomic group around "references.check:pages"' }],
      presetOptions,
    },
  };
  return {
    root: "/fake",
    scratch: "/fake",
    project,
    bootCheck: { errors: [], warnings: [], notChecked: [] },
    readFile: (file) => (file === FILE ? OVERRIDE_SOURCE : undefined),
    answers,
    ownsPackages: [],
    previewBoot,
  };
}

describe("overrideGroupRule: the ambiguous window (a consumer step sits inside the default's atomic group)", () => {
  it("offers all three choices, no default, when the preview shows no new boot error", async () => {
    const ctx = contextFor({});
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix).toMatchObject({ kind: "ask", question: "override-group:updatePage", choices: ["include", "exclude", "manual"] });
    expect(finding?.fix as { defaultValue?: string }).not.toHaveProperty("defaultValue");
  });

  it("does not offer include when the preview shows a new boot error, and prints why", async () => {
    const ctx = contextFor({ bootErrors: [{ code: "atomic-unsafe-step", owner: "kestrel", reason: "authn.identifyUser is not atomicSafe" }] });
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix).toMatchObject({ kind: "ask", question: "override-group:updatePage", choices: ["exclude", "manual"] });
    if (finding?.fix.kind !== "ask") throw new Error("expected ask");
    expect(finding.fix.prompt).toContain("not offered");
    expect(finding.fix.prompt).toContain("authn.identifyUser is not atomicSafe");
  });

  it('answers "include" with an edit that wraps the whole window when verified safe', async () => {
    const ctx = contextFor({ answer: "include" });
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("auto");
    if (finding?.fix.kind !== "auto") throw new Error("expected auto");
    expect(finding.fix.edits).toHaveLength(1);
    const edit = finding.fix.edits[0]!;
    const patched = OVERRIDE_SOURCE.slice(0, edit.start) + edit.text + OVERRIDE_SOURCE.slice(edit.end);
    expect(patched).toContain("{ atomic: [");
    expect(patched).toContain("authn.identifyUser");
  });

  it('refuses to apply "include" when the preview shows a new boot error even though the answer says so', async () => {
    const ctx = contextFor({ answer: "include", bootErrors: [{ code: "atomic-unsafe-step", owner: "kestrel", reason: "authn.identifyUser is not atomicSafe" }] });
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("manual");
    expect(finding?.suggestion).toContain("could not be applied");
  });

  it('answers "exclude" by removing the override entry and adding the pipeline to exclude: [...]', async () => {
    const ctx = contextFor({ answer: "exclude" });
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("auto");
    if (finding?.fix.kind !== "auto") throw new Error("expected auto");
    let patched = OVERRIDE_SOURCE;
    for (const edit of [...finding.fix.edits].sort((a, b) => b.start - a.start)) {
      patched = patched.slice(0, edit.start) + edit.text + patched.slice(edit.end);
    }
    expect(patched).not.toContain("updatePage:");
    expect(patched).toMatch(/exclude:\s*\["updatePage"\]/);
  });

  it('answers "manual" by leaving it for manual review', async () => {
    const ctx = contextFor({ answer: "manual" });
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("manual");
  });
});
