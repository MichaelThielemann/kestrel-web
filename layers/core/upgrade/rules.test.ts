import { describe, expect, it, vi } from "vitest";
import type { BootCheck } from "@michaelthielemann/kestrel";
import type { Edit, LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { overrideDeliveryRule, overrideGroupRule, underscoreFieldOverrideRule } from "./rules";

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

function contextFor(options: { answer?: string; bootErrors?: BootCheck["errors"]; notChecked?: BootCheck["notChecked"] }): RuleContext {
  const answers = new Map<string, string>(options.answer === undefined ? [] : [[`override-group:updatePage`, options.answer]]);
  const previewBoot = vi.fn(async (_edits: readonly Edit[]): Promise<BootCheck | undefined> => ({ errors: options.bootErrors ?? [], warnings: [], notChecked: options.notChecked ?? [] }));
  const project: LoadedProject = {
    input: { config: { modules: [], triggers: [{ pipeline: "updatePage", http: "PATCH /pages/:id" }], http: null }, modules: [], pipelines: [] },
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

  it('does not offer "include", and refuses to apply it, when the preview did not check the pipeline', async () => {
    const notChecked: BootCheck["notChecked"] = [{ kind: "pipeline", name: "updatePage", because: "authn/multi is not consented" }];
    const asked = await overrideGroupRule.check(contextFor({ notChecked }));
    expect(asked[0]?.fix).toMatchObject({ kind: "ask", choices: ["exclude", "manual"] });
    if (asked[0]?.fix.kind !== "ask") throw new Error("expected ask");
    expect(asked[0].fix.prompt).toContain("not offered");
    expect(asked[0].fix.prompt).toContain("did not check");

    const answered = await overrideGroupRule.check(contextFor({ answer: "include", notChecked }));
    expect(answered[0]?.fix.kind).toBe("manual");
    expect(answered[0]?.suggestion).toContain("did not check");
  });

  it('answers "exclude" with a manual finding naming the routes/triggers it would remove, never an automatic edit', async () => {
    const ctx = contextFor({ answer: "exclude" });
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("manual");
    expect(finding?.suggestion).toContain("PATCH /pages/:id");
    expect(finding?.suggestion).toContain("pipelines/index.ts");
  });

  it('answers "manual" by leaving it for manual review', async () => {
    const ctx = contextFor({ answer: "manual" });
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("manual");
  });
});

describe("wrapAtomicGroup / overrideGroupRule: the auto wrap never deletes or reorders anything", () => {
  const SPREAD_SOURCE = `
export const preset = definePreset({
  overrides: {
    deletePage: [
      "authn.requireUser",
      "references.guard:pages",
      ...extraCleanup,
      "content.remove:pages",
      "references.unindex:pages",
      "links.unextract:pages",
      "events.emit:page.deleted",
    ],
  },
});
`;

  const REORDERED_SOURCE = `
export const preset = definePreset({
  overrides: {
    updatePage: [
      "authn.requireUser",
      "links.extract:pages",
      "references.index:pages",
      "content.update:pages",
      "references.check:pages",
      "events.emit:page.updated",
    ],
  },
});
`;

  function groupContextFor(source: string, pipeline: string, members: readonly string[]): RuleContext {
    const project: LoadedProject = {
      input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: [] },
      kind: "kestrel-web",
      configFile: FILE,
      moduleFiles: new Map(),
      pipelineFiles: new Map([[pipeline, FILE]]),
      data: {
        presetProblems: [{ code: "preset/override-drops-atomic-group", pipeline, message: `preset: override for "${pipeline}" drops the atomic group around "${members[0]}"` }],
        presetOptions: { ...presetOptions, overrides: { [pipeline]: [] } },
      },
    };
    return {
      root: "/fake",
      scratch: "/fake",
      project,
      bootCheck: { errors: [], warnings: [], notChecked: [] },
      readFile: (file) => (file === FILE ? source : undefined),
      answers: new Map(),
      ownsPackages: [],
    };
  }

  const DELETE_MEMBERS = ["references.guard:pages", "content.remove:pages", "references.unindex:pages", "links.unextract:pages"];
  const UPDATE_MEMBERS = ["references.check:pages", "content.update:pages", "references.index:pages", "links.extract:pages"];

  it("treats a spread inside the window as ambiguous, never dropping it", async () => {
    const ctx = groupContextFor(SPREAD_SOURCE, "deletePage", DELETE_MEMBERS);
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("ask");
    if (finding?.fix.kind !== "ask") throw new Error("expected ask");
    expect(finding.fix.prompt).toContain("extraCleanup");
  });

  it("treats a different step order as ambiguous, never silently reordering", async () => {
    const ctx = groupContextFor(REORDERED_SOURCE, "updatePage", UPDATE_MEMBERS);
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("ask");
  });

  it("wraps verbatim, byte for byte, when the window matches the default's members and order exactly", async () => {
    const EXACT_SOURCE = `
export const preset = definePreset({
  overrides: {
    updatePage: [
      "authn.requireUser",
      "references.check:pages",
      "content.update:pages",
      "references.index:pages",
      "links.extract:pages",
      "events.emit:page.updated",
    ],
  },
});
`;
    const ctx = groupContextFor(EXACT_SOURCE, "updatePage", UPDATE_MEMBERS);
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("auto");
    if (finding?.fix.kind !== "auto") throw new Error("expected auto");
    const edit = finding.fix.edits[0]!;
    const patched = EXACT_SOURCE.slice(0, edit.start) + edit.text + EXACT_SOURCE.slice(edit.end);
    expect(patched).toContain("{ atomic: [");
    expect(patched.indexOf('"references.check:pages"')).toBeLessThan(patched.indexOf('"content.update:pages"'));
    expect(patched.indexOf('"content.update:pages"')).toBeLessThan(patched.indexOf('"references.index:pages"'));
    expect(patched.indexOf('"references.index:pages"')).toBeLessThan(patched.indexOf('"links.extract:pages"'));
    for (const member of UPDATE_MEMBERS) expect(patched.match(new RegExp(`"${member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"))).toHaveLength(1);
  });
});

describe("overrideDeliveryRule: a forward-ported override still running delivery inline", () => {
  const DELIVERY_SOURCE = `
export const preset = definePreset({
  overrides: {
    updatePage: [
      "authn.requireUser",
      { atomic: ["references.check:pages", "content.update:pages", "references.index:pages", "links.extract:pages"] },
      "delivery.publish:pages",
      "delivery.exportLlms",
      "events.emit:page.updated",
      "events.relay",
    ],
  },
});
`;

  function deliveryContextFor(source: string): RuleContext {
    const updatePageSteps = ["authn.requireUser", { atomic: ["references.check:pages", "content.update:pages", "references.index:pages", "links.extract:pages"] }, "delivery.publish:pages", "delivery.exportLlms", "events.emit:page.updated", "events.relay"];
    const publishPageSteps = ["delivery.publish:pages", "delivery.exportLlms"];
    const project: LoadedProject = {
      input: {
        config: { modules: [], triggers: [{ pipeline: "publishPage", event: "page.updated" }], http: null },
        modules: [],
        pipelines: [
          { name: "updatePage", steps: updatePageSteps },
          { name: "publishPage", steps: publishPageSteps },
        ],
      },
      kind: "kestrel-web",
      configFile: FILE,
      moduleFiles: new Map(),
      pipelineFiles: new Map([["updatePage", FILE]]),
      data: { presetProblems: [], presetOptions: { ...presetOptions, overrides: { updatePage: [] } } },
    };
    return {
      root: "/fake",
      scratch: "/fake",
      project,
      bootCheck: { errors: [], warnings: [], notChecked: [] },
      readFile: (file) => (file === FILE ? source : undefined),
      answers: new Map(),
      ownsPackages: [],
    };
  }

  it("removes delivery.publish and delivery.exportLlms from a forward-ported override, automatically", async () => {
    const ctx = deliveryContextFor(DELIVERY_SOURCE);
    const [finding] = await overrideDeliveryRule.check(ctx);
    expect(finding?.fix.kind).toBe("auto");
    if (finding?.fix.kind !== "auto") throw new Error("expected auto");
    let patched = DELIVERY_SOURCE;
    for (const edit of [...finding.fix.edits].sort((a, b) => b.start - a.start)) patched = patched.slice(0, edit.start) + edit.text + patched.slice(edit.end);
    expect(patched).not.toContain("delivery.publish:pages");
    expect(patched).not.toContain("delivery.exportLlms");
    expect(patched).toContain("events.emit:page.updated");
    expect(patched).toContain('{ atomic: ["references.check:pages"');
  });

  it("does nothing when no relayed pipeline actually runs delivery (nothing would double-publish)", async () => {
    const ctx = deliveryContextFor(DELIVERY_SOURCE);
    ctx.project.input.pipelines = [
      { name: "updatePage", steps: ["authn.requireUser", "delivery.publish:pages", "events.emit:page.updated"] },
      { name: "publishPage", steps: ["authn.requireUser"] },
    ];
    const findings = await overrideDeliveryRule.check(ctx);
    expect(findings).toEqual([]);
  });
});

describe("underscoreFieldOverrideRule: verified-auto from a data report's counts", () => {
  const TYPE = "settings";
  const FIELD = "_legacyNote";
  const MODEL_FILE = "/fake/shared/model.ts";
  const MODEL_SOURCE = `
export const contentTypes = {
  settings: {
    kind: "single",
    fields: {
      _legacyNote: { type: "text" },
    },
  },
};
`;

  function underscoreContextFor(options: { answer?: string; dataReport?: Record<string, unknown> }): RuleContext {
    const answers = new Map<string, string>(options.answer === undefined ? [] : [[`underscore-field:${TYPE}.${FIELD}`, options.answer]]);
    const project: LoadedProject = {
      input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: [] },
      kind: "kestrel-web",
      configFile: "/fake/kestrel.config.ts",
      moduleFiles: new Map(),
      pipelineFiles: new Map(),
      data: {
        presetProblems: [],
        presetOptions: { modules: [], features: [], collections: { [TYPE]: { kind: "single", fields: { [FIELD]: { type: "text" } } } } },
      },
      ...(options.dataReport === undefined ? {} : { dataReport: options.dataReport }),
    };
    return {
      root: "/fake",
      scratch: "/fake",
      project,
      bootCheck: { errors: [], warnings: [], notChecked: [] },
      readFile: (file) => (file === MODEL_FILE ? MODEL_SOURCE : undefined),
      answers,
      ownsPackages: [],
    };
  }

  it("asks with no default when no data report is supplied", async () => {
    const ctx = underscoreContextFor({});
    const [finding] = await underscoreFieldOverrideRule.check(ctx);
    expect(finding?.fix).toMatchObject({ kind: "ask", question: `underscore-field:${TYPE}.${FIELD}`, choices: ["legacyNote", "remove"] });
    expect(finding?.fix as { defaultValue?: string }).not.toHaveProperty("defaultValue");
    if (finding?.fix.kind !== "ask") throw new Error("expected ask");
    expect(finding.fix.prompt).toContain("no data report");
  });

  it("renames automatically when a data report counts zero stored values in every locale", async () => {
    const ctx = underscoreContextFor({ dataReport: { underscoreFields: { [`${TYPE}.${FIELD}`]: { unlocalized: 0 } } } });
    const [finding] = await underscoreFieldOverrideRule.check(ctx);
    expect(finding?.fix.kind).toBe("auto");
    if (finding?.fix.kind !== "auto") throw new Error("expected auto");
    expect(finding.fix.edits).toHaveLength(1);
    const edit = finding.fix.edits[0]!;
    const patched = MODEL_SOURCE.slice(0, edit.start) + edit.text + MODEL_SOURCE.slice(edit.end);
    expect(patched).toContain("legacyNote:");
    expect(patched).not.toContain("_legacyNote");
  });

  it("still asks, with no default, when a data report counts a stored value", async () => {
    const ctx = underscoreContextFor({ dataReport: { underscoreFields: { [`${TYPE}.${FIELD}`]: { unlocalized: 3 } } } });
    const [finding] = await underscoreFieldOverrideRule.check(ctx);
    expect(finding?.fix).toMatchObject({ kind: "ask", question: `underscore-field:${TYPE}.${FIELD}`, choices: ["legacyNote", "remove"] });
    expect(finding?.fix as { defaultValue?: string }).not.toHaveProperty("defaultValue");
    expect(finding?.message).toContain("3 stored value");
  });

  it("renames on an explicit answer even with stored values, but only as a warning, never proven safe", async () => {
    const ctx = underscoreContextFor({ answer: "legacyNote", dataReport: { underscoreFields: { [`${TYPE}.${FIELD}`]: { unlocalized: 3 } } } });
    const [finding] = await underscoreFieldOverrideRule.check(ctx);
    expect(finding?.severity).toBe("warning");
    expect(finding?.fix.kind).toBe("auto");
    expect(finding?.suggestion).toContain("not a proving zero count");
  });

  it('"remove" leaves it for manual review instead of renaming, even with zero counts', async () => {
    const ctx = underscoreContextFor({ answer: "remove", dataReport: { underscoreFields: { [`${TYPE}.${FIELD}`]: { unlocalized: 0 } } } });
    const [finding] = await underscoreFieldOverrideRule.check(ctx);
    expect(finding?.fix.kind).toBe("ask");
  });
});

describe("underscoreFieldOverrideRule: the orphaned-column warning persists after an unproven rename", () => {
  const TYPE = "pages";
  const RENAMED_FIELD = "legacyNote";
  const ORPHAN_FIELD = "_legacyNote";

  function orphanContextFor(dataReport?: Record<string, unknown>): RuleContext {
    const project: LoadedProject = {
      input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: [] },
      kind: "kestrel-web",
      configFile: "/fake/kestrel.config.ts",
      moduleFiles: new Map(),
      pipelineFiles: new Map(),
      data: {
        presetProblems: [],
        presetOptions: { modules: [], features: [], collections: { [TYPE]: { kind: "multi", fields: { [RENAMED_FIELD]: { type: "text" } } } } },
      },
      ...(dataReport === undefined ? {} : { dataReport }),
    };
    return {
      root: "/fake",
      scratch: "/fake",
      project,
      bootCheck: { errors: [], warnings: [], notChecked: [] },
      readFile: () => undefined,
      answers: new Map(),
      ownsPackages: [],
    };
  }

  it("says nothing once the field is renamed and no data report exists yet", async () => {
    const findings = await underscoreFieldOverrideRule.check(orphanContextFor());
    expect(findings).toEqual([]);
  });

  it("says nothing once the shadow column is counted empty", async () => {
    const findings = await underscoreFieldOverrideRule.check(orphanContextFor({ underscoreFields: { [`${TYPE}.${ORPHAN_FIELD}`]: { unlocalized: 0 } } }));
    expect(findings).toEqual([]);
  });

  it("warns, on every check, while the old column still has stored data after the rename", async () => {
    const findings = await underscoreFieldOverrideRule.check(orphanContextFor({ underscoreFields: { [`${TYPE}.${ORPHAN_FIELD}`]: { unlocalized: 1, de: 1 } } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.fix.kind).toBe("none");
    expect(findings[0]?.message).toContain(`"${ORPHAN_FIELD}"`);
    expect(findings[0]?.message).toContain(`"${RENAMED_FIELD}"`);
  });
});
