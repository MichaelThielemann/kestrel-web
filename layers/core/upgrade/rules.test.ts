import { describe, expect, it, vi } from "vitest";
import type { BootCheck } from "@michaelthielemann/kestrel";
import type { Edit, LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { applyEdits } from "@michaelthielemann/kestrel-upgrade/codemods";
import { fieldGrantsRule, missingSanitizeSvgRule, overrideDeliveryRule, overrideDriftRule, overrideGroupRule, overrideRelayRule, ownPipelineDeliveryRule, publicOverrideFieldStepRule, relayScopeRule } from "./rules";

const FILE = "/fake/kestrel.config.ts";
const SANITIZE_SVG_PACKAGE = "@michaelthielemann/kestrel-sanitize-svg";

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
  const verifyEdits = vi.fn(async (_edits: readonly Edit[], verifyOptions?: { pipelines?: readonly string[] }) => {
    const pipelines = verifyOptions?.pipelines ?? [];
    const unchecked = (options.notChecked ?? [])
      .filter((n) => n.kind === "pipeline" && pipelines.includes(n.name))
      .map((n) => ({ name: n.name, because: n.because }));
    return { verified: unchecked.length === 0, newErrors: options.bootErrors ?? [], unchecked };
  });
  const project: LoadedProject = {
    input: { config: { modules: [], triggers: [{ pipeline: "updatePage", http: "PATCH /pages/:id" }], http: null }, modules: [], pipelines: [] },
    kind: "kestrel-web",
    configFile: FILE,
    moduleFiles: new Map(),
    pipelineFiles: [{ file: FILE, pipelines: ["updatePage"] }],
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
    verifyEdits,
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
    expect(asked[0].fix.prompt).toContain("authn/multi is not consented");

    const answered = await overrideGroupRule.check(contextFor({ answer: "include", notChecked }));
    expect(answered[0]?.fix.kind).toBe("manual");
    expect(answered[0]?.suggestion).toContain("did not check");
    expect(answered[0]?.suggestion).toContain("authn/multi is not consented");
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
      pipelineFiles: [{ file: FILE, pipelines: [pipeline] }],
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

  it("treats a different step order as manual, never silently reordering, without an empty include question", async () => {
    const ctx = groupContextFor(REORDERED_SOURCE, "updatePage", UPDATE_MEMBERS);
    const [finding] = await overrideGroupRule.check(ctx);
    expect(finding?.fix.kind).toBe("manual");
    if (finding?.fix.kind !== "manual") throw new Error("expected manual");
    expect(finding.suggestion).not.toContain("()");
    expect(finding.suggestion).not.toContain("include  in");
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
      pipelineFiles: [{ file: FILE, pipelines: ["updatePage"] }],
      data: { presetProblems: [], presetOptions: { ...presetOptions, overrides: { updatePage: [] } } },
    };
    return {
      root: "/fake",
      scratch: "/fake",
      project,
      bootCheck: { errors: [], warnings: [], notChecked: [] },
      readFile: (file) => (file === FILE ? source : undefined),
      answers: new Map(),
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

  it("removes only the delivery step the relayed pipeline actually runs, never another collection's", async () => {
    const source = `
export const preset = definePreset({
  overrides: {
    updatePage: [
      "authn.requireUser",
      "delivery.publish:pages",
      "delivery.publish:media",
      "events.emit:page.updated",
    ],
  },
});
`;
    const ctx = deliveryContextFor(source);
    ctx.project.input.pipelines = [
      { name: "updatePage", steps: ["authn.requireUser", "delivery.publish:pages", "delivery.publish:media", "events.emit:page.updated"] },
      { name: "publishPage", steps: ["delivery.publish:pages"] },
    ];
    const [finding] = await overrideDeliveryRule.check(ctx);
    expect(finding?.fix.kind).toBe("auto");
    if (finding?.fix.kind !== "auto") throw new Error("expected auto");
    let patched = source;
    for (const edit of [...finding.fix.edits].sort((a, b) => b.start - a.start)) patched = patched.slice(0, edit.start) + edit.text + patched.slice(edit.end);
    expect(patched).not.toContain("delivery.publish:pages");
    expect(patched).toContain("delivery.publish:media");
  });
});

describe("ownPipelineDeliveryRule: an own pipeline still running delivery inline while emitting a page event", () => {
  const PIPELINES_FILE = "/fake/pipelines/index.ts";
  const OWN_SOURCE = `
export const pipelines = [
  definePipeline({
    name: "customUpdatePage",
    steps: [
      "authn.requireUser",
      "content.update:pages",
      "delivery.publish:pages",
      "delivery.exportLlms",
      "events.emit:page.updated",
    ],
  }),
];
`;
  const OWN_STEPS = ["authn.requireUser", "content.update:pages", "delivery.publish:pages", "delivery.exportLlms", "events.emit:page.updated"];

  function ownContextFor(options: { answer?: string; overridden?: boolean }): RuleContext {
    const answers = new Map<string, string>(options.answer === undefined ? [] : [["own-pipeline-delivery:customUpdatePage", options.answer]]);
    const project: LoadedProject = {
      input: {
        config: { modules: [], triggers: [{ pipeline: "publishPage", event: "page.updated" }], http: null },
        modules: [],
        pipelines: [
          { name: "customUpdatePage", steps: OWN_STEPS },
          { name: "publishPage", steps: ["delivery.publish:pages", "delivery.exportLlms"] },
        ],
      },
      kind: "kestrel-web",
      configFile: FILE,
      moduleFiles: new Map(),
      pipelineFiles: [{ file: PIPELINES_FILE, pipelines: ["customUpdatePage"] }],
      data: { presetProblems: [], presetOptions: { ...presetOptions, overrides: options.overridden ? { customUpdatePage: [] } : {} } },
    };
    return {
      root: "/fake",
      scratch: "/fake",
      project,
      bootCheck: { errors: [], warnings: [], notChecked: [] },
      readFile: (file) => (file === PIPELINES_FILE ? OWN_SOURCE : undefined),
      answers,
    };
  }

  it("asks, defaulting to remove, when an own pipeline double-publishes", async () => {
    const [finding] = await ownPipelineDeliveryRule.check(ownContextFor({}));
    expect(finding?.fix).toMatchObject({ kind: "ask", question: "own-pipeline-delivery:customUpdatePage", choices: ["remove", "keep"], defaultValue: "remove" });
  });

  it('removes the delivery steps automatically once answered "remove"', async () => {
    const [finding] = await ownPipelineDeliveryRule.check(ownContextFor({ answer: "remove" }));
    expect(finding?.fix.kind).toBe("auto");
    if (finding?.fix.kind !== "auto") throw new Error("expected auto");
    let patched = OWN_SOURCE;
    for (const edit of [...finding.fix.edits].sort((a, b) => b.start - a.start)) patched = patched.slice(0, edit.start) + edit.text + patched.slice(edit.end);
    expect(patched).not.toContain("delivery.publish:pages");
    expect(patched).not.toContain("delivery.exportLlms");
    expect(patched).toContain("events.emit:page.updated");
  });

  it('keeps it, as information only, once answered "keep"', async () => {
    const [finding] = await ownPipelineDeliveryRule.check(ownContextFor({ answer: "keep" }));
    expect(finding?.fix.kind).toBe("none");
  });

  it("says nothing about a pipeline of the same name once it is an override (preset/override-delivery's job instead)", async () => {
    const findings = await ownPipelineDeliveryRule.check(ownContextFor({ overridden: true }));
    expect(findings).toEqual([]);
  });

  it("does nothing when no relayed pipeline actually runs delivery (nothing would double-publish)", async () => {
    const ctx = ownContextFor({});
    ctx.project.input.pipelines = [
      { name: "customUpdatePage", steps: OWN_STEPS },
      { name: "publishPage", steps: ["authn.requireUser"] },
    ];
    const findings = await ownPipelineDeliveryRule.check(ctx);
    expect(findings).toEqual([]);
  });

  it("does nothing when the relayed pipeline delivers a different collection (not the same step)", async () => {
    const ctx = ownContextFor({});
    ctx.project.input.pipelines = [
      { name: "customUpdatePage", steps: OWN_STEPS },
      { name: "publishPage", steps: ["delivery.publish:media"] },
    ];
    const findings = await ownPipelineDeliveryRule.check(ctx);
    expect(findings).toEqual([]);
  });
});

describe("relayScopeRule", () => {
  const RELAY_SOURCE = `
export const preset = definePreset({
  modules: [{ use: "@michaelthielemann/kestrel-events-queue", config: {} }],
});
`;

  function relayContextFor(features: string[]): RuleContext {
    const project: LoadedProject = {
      input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: [] },
      kind: "kestrel-web",
      configFile: FILE,
      moduleFiles: new Map(),
      pipelineFiles: [],
      data: { presetProblems: [], presetOptions: { ...presetOptions, features, modules: [{ use: "@michaelthielemann/kestrel-events-queue", config: {} }] } },
    };
    return {
      root: "/fake",
      scratch: "/fake",
      project,
      bootCheck: { errors: [], warnings: [], notChecked: [] },
      readFile: (file) => (file === FILE ? RELAY_SOURCE : undefined),
      answers: new Map(),
    };
  }

  it("suggests the layer's own relayPipelinesFor(features) candidates, not a hardcoded literal", async () => {
    const [finding] = await relayScopeRule.check(relayContextFor(["delivery"]));
    expect(finding?.suggestion).toContain('relayPipelines: ["publishPage", "unpublishPage"]');
  });

  it("suggests an empty relayPipelines when the delivery feature is off", async () => {
    const [finding] = await relayScopeRule.check(relayContextFor([]));
    expect(finding?.suggestion).toContain("relayPipelines: []");
  });
});

describe("override edits for the same pipeline compose without a conflict (no silently dropped edit)", () => {
  const COMBINED_SOURCE = `
export const preset = definePreset({
  overrides: {
    updatePage: [
      "authn.requireUser",
      "references.check:pages",
      "content.update:pages",
      "references.index:pages",
      "links.extract:pages",
      "delivery.publish:pages",
      "delivery.exportLlms",
      "events.emit:page.updated",
    ],
  },
});
`;
  const COMBINED_STEPS = ["authn.requireUser", "references.check:pages", "content.update:pages", "references.index:pages", "links.extract:pages", "delivery.publish:pages", "delivery.exportLlms", "events.emit:page.updated"];

  function combinedContextFor(): RuleContext {
    const project: LoadedProject = {
      input: {
        config: { modules: [], triggers: [{ pipeline: "publishPage", event: "page.updated" }], http: null },
        modules: [],
        pipelines: [
          { name: "updatePage", steps: COMBINED_STEPS },
          { name: "publishPage", steps: ["delivery.publish:pages", "delivery.exportLlms"] },
        ],
      },
      kind: "kestrel-web",
      configFile: FILE,
      moduleFiles: new Map(),
      pipelineFiles: [{ file: FILE, pipelines: ["updatePage"] }],
      data: {
        presetProblems: [
          { code: "preset/override-drops-atomic-group", pipeline: "updatePage", message: 'preset: override for "updatePage" drops the atomic group around "references.check:pages"' },
          { code: "preset/override-drops-relay", pipeline: "updatePage", message: 'preset: override for "updatePage" drops the relay after its emit' },
        ],
        presetOptions: { ...presetOptions, overrides: { updatePage: [] } },
      },
    };
    return {
      root: "/fake",
      scratch: "/fake",
      project,
      bootCheck: { errors: [], warnings: [], notChecked: [] },
      readFile: (file) => (file === FILE ? COMBINED_SOURCE : undefined),
      answers: new Map(),
    };
  }

  it("group-wrap, events.relay and the double-publish delivery-step removal all land as auto edits that apply together with nothing conflicted", async () => {
    const ctx = combinedContextFor();
    const groupFindings = await overrideGroupRule.check(ctx);
    const relayFindings = await overrideRelayRule.check(ctx);
    const deliveryFindings = await overrideDeliveryRule.check(ctx);
    const allFindings = [...groupFindings, ...relayFindings, ...deliveryFindings];
    expect(allFindings.every((f) => f.fix.kind === "auto")).toBe(true);
    const allEdits = allFindings.flatMap((f) => (f.fix.kind === "auto" ? f.fix.edits : []));
    expect(allEdits.length).toBeGreaterThanOrEqual(3);
    const { conflicted, text } = applyEdits(COMBINED_SOURCE, allEdits);
    expect(conflicted).toEqual([]);
    expect(text).toContain("{ atomic: [");
    expect(text).toContain("events.relay");
    expect(text).not.toContain("delivery.publish:pages");
    expect(text).not.toContain("delivery.exportLlms");
  });
});

describe("missingSanitizeSvgRule", () => {
  const MODEL_FILE = "/fake/shared/model.ts";

  function modelContextFor(source: string): RuleContext {
    const project: LoadedProject = {
      input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: [] },
      kind: "kestrel-web",
      configFile: FILE,
      moduleFiles: new Map(),
      pipelineFiles: [],
      data: { presetProblems: [], presetOptions },
    };
    return {
      root: "/fake",
      scratch: "/fake",
      project,
      bootCheck: { errors: [], warnings: [], notChecked: [] },
      readFile: (file) => (file === MODEL_FILE ? source : undefined),
      answers: new Map(),
    };
  }

  it('adds "sanitizeSvg" automatically when features has "delivery" but not "sanitizeSvg"', async () => {
    const source = 'export const features = ["delivery", "images"] as const satisfies readonly Feature[];\n';
    const ctx = modelContextFor(source);
    const [finding] = await missingSanitizeSvgRule.check(ctx);
    expect(finding?.fix.kind).toBe("auto");
    if (finding?.fix.kind !== "auto") throw new Error("expected auto");
    const edit = finding.fix.edits[0]!;
    const patched = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    expect(patched).toMatch(/"delivery",\s*"images",\s*"sanitizeSvg"/);
  });

  it('does nothing when "sanitizeSvg" is already present', async () => {
    const source = 'export const features = ["delivery", "images", "sanitizeSvg"] as const satisfies readonly Feature[];\n';
    const findings = await missingSanitizeSvgRule.check(modelContextFor(source));
    expect(findings).toEqual([]);
  });

  it('does nothing when "delivery" is not a feature', async () => {
    const source = 'export const features = ["images"] as const satisfies readonly Feature[];\n';
    const findings = await missingSanitizeSvgRule.check(modelContextFor(source));
    expect(findings).toEqual([]);
  });

  it('inserts into the spread array presetModuleConfig() actually sees, when features is [...presetFeatures, "eventsQueue"]', async () => {
    const source = 'export const presetFeatures = ["delivery", "images"] as const satisfies readonly Feature[];\nexport const features = [...presetFeatures, "eventsQueue"] as const satisfies readonly Feature[];\n';
    const ctx = modelContextFor(source);
    const [finding] = await missingSanitizeSvgRule.check(ctx);
    expect(finding?.fix.kind).toBe("auto");
    if (finding?.fix.kind !== "auto") throw new Error("expected auto");
    const edit = finding.fix.edits[0]!;
    const patched = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    expect(patched).toMatch(/presetFeatures = \["delivery", "images", "sanitizeSvg"\]/);
  });

  it('does nothing when "sanitizeSvg" is already in the spread source array', async () => {
    const source = 'export const presetFeatures = ["delivery", "images", "sanitizeSvg"] as const satisfies readonly Feature[];\nexport const features = [...presetFeatures, "eventsQueue"] as const satisfies readonly Feature[];\n';
    const findings = await missingSanitizeSvgRule.check(modelContextFor(source));
    expect(findings).toEqual([]);
  });

  function contextFor(files: Record<string, string>): RuleContext {
    return { ...modelContextFor(""), readFile: (file) => files[file] };
  }

  it('stays silent when features is built by a function call, not a plain array literal (e.g. withDelivery([...]))', async () => {
    const source = 'export const features = withDelivery(["images"]) satisfies readonly Feature[];\n';
    const findings = await missingSanitizeSvgRule.check(contextFor({ [MODEL_FILE]: source }));
    expect(findings).toEqual([]);
  });

  it("stays silent when the spread's array is not itself found in the same file (an imported array)", async () => {
    const source = 'import { presetFeatures } from "./preset-features";\nexport const features = [...presetFeatures, "eventsQueue"] as const satisfies readonly Feature[];\n';
    const findings = await missingSanitizeSvgRule.check(contextFor({ [MODEL_FILE]: source }));
    expect(findings).toEqual([]);
  });

  it('stays silent when kestrel.config.ts already denies "image/svg+xml" via media.deniedTypes', async () => {
    const modelSource = 'export const features = ["delivery", "images"] as const satisfies readonly Feature[];\n';
    const configSource = 'const modules = presetModuleConfig({ dataDir, features, media: { deniedTypes: ["image/svg+xml"] } });\n';
    const findings = await missingSanitizeSvgRule.check(contextFor({ [MODEL_FILE]: modelSource, [FILE]: configSource }));
    expect(findings).toEqual([]);
  });

  it("does not omit the dependency suggestion when media.deniedTypes denies a different type", async () => {
    const modelSource = 'export const features = ["delivery", "images"] as const satisfies readonly Feature[];\n';
    const configSource = 'const modules = presetModuleConfig({ dataDir, features, media: { deniedTypes: ["text/html"] } });\n';
    const [finding] = await missingSanitizeSvgRule.check(contextFor({ [MODEL_FILE]: modelSource, [FILE]: configSource }));
    expect(finding?.fix.kind).toBe("auto");
    expect(finding?.suggestion).toContain(SANITIZE_SVG_PACKAGE);
  });

  it("omits the dependency suggestion once package.json already lists kestrel-sanitize-svg", async () => {
    const modelSource = 'export const features = ["delivery", "images"] as const satisfies readonly Feature[];\n';
    const packageJson = `{ "dependencies": { "${SANITIZE_SVG_PACKAGE}": "^6.0.0" } }`;
    const [finding] = await missingSanitizeSvgRule.check(contextFor({ [MODEL_FILE]: modelSource, "/fake/package.json": packageJson }));
    expect(finding?.fix.kind).toBe("auto");
    expect(finding?.suggestion).not.toContain("dependencies");
    expect(finding?.suggestion).toBe('adds "sanitizeSvg" to features');
  });
});


describe("publicOverrideFieldStepRule", () => {
  function overrideContextFor(overrides: Record<string, string[]>, anonymous: string[] = ["pages.read", "settings.read", "media.read"]): RuleContext {
    const authz = { use: "@michaelthielemann/kestrel-authz-roles", config: { roles: { admin: ["*"] }, anonymous } };
    const project: LoadedProject = {
      input: { config: { modules: [authz], triggers: [], http: null }, modules: [], pipelines: Object.entries(overrides).map(([name, steps]) => ({ name, steps })) },
      kind: "kestrel-web",
      configFile: FILE,
      moduleFiles: new Map(),
      pipelineFiles: [{ file: FILE, pipelines: Object.keys(overrides) }],
      data: { presetProblems: [], presetOptions: { ...presetOptions, overrides } },
    };
    return { root: "/fake", scratch: "/fake", project, bootCheck: { errors: [], warnings: [], notChecked: [] }, readFile: () => undefined, answers: new Map() };
  }

  it("names an override of a public read anonymous callers reach that does not end with its field step, and the step to append", async () => {
    const findings = await publicOverrideFieldStepRule.check(overrideContextFor({ getMedia: ["authn.identifyUser", "authz.require:media.read", "media.get"] }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "pipelines/public-override-field-step", severity: "info", tier: "source", where: { pipeline: "getMedia", file: FILE }, fix: { kind: "none" } });
    expect(findings[0]?.message).toContain("anonymous callers reach it, so the server does not start");
    expect(findings[0]?.suggestion).toContain('"authz.fields:media?shape=item"');
  });

  it("names a collection's public read by the collection's resource", async () => {
    const findings = await publicOverrideFieldStepRule.check(overrideContextFor({ listPages: ["authn.identifyUser", "authz.require:pages.read", "content.list:pages?status=published"] }));
    expect(findings[0]?.suggestion).toContain('"authz.fields:pages?shape=list"');
  });

  it("calls an override harmless while anonymous callers cannot reach it, naming what keeps them out", async () => {
    const behindSession = await publicOverrideFieldStepRule.check(overrideContextFor({ listPages: ["authn.requireUser", "authz.require:pages.read", "content.list:pages"] }));
    expect(behindSession[0]?.message).toContain("harmless while anonymous callers cannot reach it");
    expect(behindSession[0]?.message).toContain("authn.requireUser");
    const ungranted = await publicOverrideFieldStepRule.check(overrideContextFor({ getMedia: ["authn.identifyUser", "authz.require:media.read", "media.get"] }, ["pages.read"]));
    expect(ungranted[0]?.message).toContain("harmless while anonymous callers cannot reach it");
    expect(ungranted[0]?.message).toContain('"media.read"');
    expect(ungranted[0]?.suggestion).toContain('"authz.fields:media?shape=item"');
  });

  it("names an override whose field step cuts another resource than the preset's", async () => {
    const findings = await publicOverrideFieldStepRule.check(overrideContextFor({ getMedia: ["authn.identifyUser", "authz.require:media.read", "media.get", "authz.fields:pages?shape=item"] }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('ends with "authz.fields:pages?shape=item"');
    expect(findings[0]?.message).toContain('the grant of "pages"');
    expect(findings[0]?.suggestion).toContain('"authz.fields:media?shape=item"');
  });

  it("is the only finding about the field step: override drift leaves it out", async () => {
    const ctx = overrideContextFor({ getMedia: ["authn.identifyUser", "authz.require:media.read", "media.get"] });
    expect(await overrideDriftRule.check(ctx)).toEqual([]);
  });

  it("says nothing for an override that ends with the preset's field step, or of a pipeline the preset does not cut", async () => {
    const findings = await publicOverrideFieldStepRule.check(
      overrideContextFor({
        getMedia: ["authn.identifyUser", "authz.require:media.read", "media.get", "authz.fields:media?shape=item"],
        updatePage: ["authn.requireUser", "authz.require:pages.write", "content.update:pages"],
      }),
    );
    expect(findings).toEqual([]);
  });
});

describe("fieldGrantsRule", () => {
  const CONTENT = { use: "@michaelthielemann/kestrel-content-default", config: { locales: ["de", "en"], defaultLocale: "de", types: { settings: { kind: "single", fields: { title: { type: "text" } } }, pages: presetOptions.collections.pages } } };

  const CUT_PIPELINES = [
    { name: "resolvePage", steps: ["authn.identifyUser", "authz.require:pages.read", "site.resolve:pages", "authz.fields:pages?shape=item"] },
    { name: "getSettings", steps: ["authn.identifyUser", "authz.require:settings.read", "content.get:settings", "authz.fields:settings?shape=item"] },
    { name: "getMedia", steps: ["authn.identifyUser", "authz.require:media.read", "media.get", "images.attach", "authz.fields:media?shape=item"] },
    { name: "downloadMedia", steps: ["authn.identifyUser", "authz.require:media.read", "media.download", "authz.fields:mediaFile?shape=file"] },
  ];

  function grantsContextFor(authz: Record<string, unknown>, layerRange: string): RuleContext {
    const project: LoadedProject = {
      input: { config: { modules: [CONTENT, { use: "@michaelthielemann/kestrel-authz-roles", config: authz }], triggers: [], http: null }, modules: [], pipelines: CUT_PIPELINES },
      kind: "kestrel-web",
      configFile: FILE,
      moduleFiles: new Map(),
      pipelineFiles: [],
      data: { presetProblems: [], presetOptions: { ...presetOptions, features: ["images"] } },
    };
    const packageJson = `{ "dependencies": { "@michaelthielemann/kestrel-web": "${layerRange}" } }`;
    return { root: "/fake", scratch: "/fake", project, bootCheck: { errors: [], warnings: [], notChecked: [] }, readFile: (file) => (file === "/fake/package.json" ? packageJson : undefined), answers: new Map() };
  }

  it("leaves out a resource no loaded pipeline cuts", async () => {
    const findings = await fieldGrantsRule.check(grantsContextFor({ roles: { admin: ["*"] }, anonymous: ["*"] }, "^3.0.0"));
    expect(findings[0]?.suggestion).toContain("settings:");
    expect(findings[0]?.suggestion).not.toContain("redirects:");
    expect(findings[0]?.suggestion).not.toContain("redirectRules:");
  });

  it("shows a hand-written authz-roles entry without grants the grants the preset derives for its model and anonymous permissions", async () => {
    const findings = await fieldGrantsRule.check(grantsContextFor({ roles: { admin: ["*"] }, anonymous: ["pages.read", "media.read"] }, "^3.0.0"));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "preset/field-grants", severity: "info", fix: { kind: "none" } });
    expect(findings[0]?.suggestion).toContain('pages: ["id", "slug", "title", "body", "_locales", "_translations", "_locale", "_links"]');
    expect(findings[0]?.suggestion).toContain('"variants[].path"');
    expect(findings[0]?.suggestion).not.toContain("settings:");
  });

  it("tells a presetModuleConfig() project on its 2.x range once what anonymous callers keep", async () => {
    const findings = await fieldGrantsRule.check(grantsContextFor({ roles: { admin: ["*"] }, anonymous: ["pages.read"], anonymousFields: { pages: ["id", "title"], media: ["id", "path"] } }, "^2.0.1"));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("pages: id, title");
    expect(findings[0]?.suggestion).toContain("roles.anonymousFields");
  });

  it("says nothing once the grants are set and the layer is on its 3.x range", async () => {
    expect(await fieldGrantsRule.check(grantsContextFor({ roles: { admin: ["*"] }, anonymous: [], anonymousFields: { media: ["id"] } }, "^3.0.0"))).toEqual([]);
  });
});
