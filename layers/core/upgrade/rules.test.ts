import { describe, expect, it, vi } from "vitest";
import type { BootCheck } from "@michaelthielemann/kestrel";
import type { Edit, LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { applyEdits } from "@michaelthielemann/kestrel-upgrade/codemods";
import { overrideDeliveryRule, overrideGroupRule, overrideRelayRule, ownPipelineDeliveryRule, relayScopeRule } from "./rules";

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
  const verifyEdits = vi.fn(async (_edits: readonly Edit[], verifyOptions?: { pipelines?: readonly string[] }) => {
    const pipelines = verifyOptions?.pipelines ?? [];
    const unchecked = (options.notChecked ?? []).filter((n) => n.kind === "pipeline" && pipelines.includes(n.name)).map((n) => n.name);
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
    ownsPackages: [],
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
      ownsPackages: [],
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
      ownsPackages: [],
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
      ownsPackages: [],
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

