import { describe, expect, it } from "vitest";
import { applyEdits, arrayElements, findCalls, firstArgument, isArrayExpression, objectProperty, parseTs, stringValue } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { definePipeline, pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset } from "../pipelines/checkPreset";
import type { PresetOptions } from "../pipelines/checkPreset";
import { settingsLlmsRule } from "./dependentsRules";
import { overrideEmitRule } from "./overrideEmit";
import { overrideGroupRule, overrideRelayRule } from "./rules";

const FILE = "/fake/kestrel.config.ts";
const RENDERER = "@michaelthielemann/kestrel-renderer-nuxt";
const DELIVERY_STATIC = "@michaelthielemann/kestrel-delivery-static";
const BASE_MODULES = [
  { use: "@michaelthielemann/kestrel-authn-multi" },
  { use: "@michaelthielemann/kestrel-authz-roles" },
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
  { use: "@michaelthielemann/kestrel-media-default" },
  { use: "@michaelthielemann/kestrel-events-inmemory" },
  { use: RENDERER },
];
const collections = { settings: { kind: "single" as const, fields: {} }, pages: { kind: "multi" as const, fields: { slug: {}, title: {}, body: {}, status: {} } } };

interface Mode {
  modules: { use: string; config?: unknown }[];
  features: string[];
}

const DIRECT: Mode = {
  modules: [...BASE_MODULES, { use: "@michaelthielemann/kestrel-events-direct" }, { use: DELIVERY_STATIC, config: {} }],
  features: ["delivery"],
};
const QUEUE: Mode = {
  modules: [
    ...BASE_MODULES,
    { use: "@michaelthielemann/kestrel-events-queue", config: { lanes: { pages: ["republishOutput", "refreshLlms"] } } },
    { use: DELIVERY_STATIC, config: { dependencies: { render: "events" } } },
  ],
  features: ["delivery", "eventsQueue"],
};

function entryOf(node: AstNode): PipelineEntry {
  const atomic = node.type === "ObjectExpression" ? objectProperty(node, "atomic") : undefined;
  if (isArrayExpression(atomic)) return { atomic: arrayElements(atomic).map((el) => stringValue(el) ?? "?") };
  return stringValue(node) ?? "?";
}

function overrideIn(source: string, pipelineName: string, which?: number): PipelineEntry[] {
  const calls = findCalls(parseTs(source), "definePreset");
  const call = calls[which ?? calls.length - 1]!;
  const array = objectProperty(objectProperty(firstArgument(call)!, "overrides")!, pipelineName);
  return isArrayExpression(array) ? arrayElements(array).map(entryOf) : [];
}

function presetOptions(mode: Mode, overrides: Record<string, PipelineEntry[]>): PresetOptions {
  return boundaryCast<PresetOptions>({ modules: mode.modules, features: mode.features, collections, overrides }, "ast");
}

function problemsOf(source: string, mode: Mode, pipelineName: string): { code: string; pipeline?: string; message: string }[] {
  return checkPreset(presetOptions(mode, { [pipelineName]: overrideIn(source, pipelineName) })).problems.filter((p) => p.pipeline === pipelineName);
}

function contextFor(source: string, mode: Mode, pipelineName: string): RuleContext {
  const loaded = overrideIn(source, pipelineName);
  const project: LoadedProject = {
    input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: [definePipeline({ name: pipelineName, steps: loaded })] },
    kind: "kestrel-web",
    configFile: FILE,
    moduleFiles: new Map(),
    pipelineFiles: [{ file: FILE, pipelines: [pipelineName] }],
    data: { presetProblems: problemsOf(source, mode, pipelineName), presetOptions: { modules: mode.modules, features: mode.features, collections } },
  };
  return { root: "/fake", scratch: "/fake", project, bootCheck: { errors: [], warnings: [], notChecked: [] }, readFile: (file) => (file === FILE ? source : undefined), answers: new Map() };
}

async function findingsFor(source: string, mode: Mode, pipelineName = "setSettings"): Promise<Finding[]> {
  const ctx = contextFor(source, mode, pipelineName);
  return [...(await overrideGroupRule.check(ctx)), ...(await overrideRelayRule.check(ctx)), ...(await overrideEmitRule.check(ctx)), ...(await settingsLlmsRule.check(ctx))];
}

async function fixOnce(source: string, mode: Mode, pipelineName = "setSettings"): Promise<string> {
  const findings = await findingsFor(source, mode, pipelineName);
  const edits = findings.flatMap((f) => (f.fix.kind === "auto" ? f.fix.edits : []));
  const { text, conflicted } = applyEdits(source, edits);
  expect(conflicted.filter((c) => !edits.some((e) => e !== c && e.start <= c.start && e.end >= c.end && !conflicted.includes(e)))).toEqual([]);
  return text;
}

async function fixThreeTimes(source: string, mode: Mode, pipelineName = "setSettings"): Promise<[string, string, string]> {
  const first = await fixOnce(source, mode, pipelineName);
  const second = await fixOnce(first, mode, pipelineName);
  const third = await fixOnce(second, mode, pipelineName);
  return [first, second, third];
}

function presetWith(steps: string): string {
  return `export const preset = definePreset({\n  overrides: {\n    setSettings: ${steps},\n  },\n});\n`;
}

const commented = presetWith(`[
      "authn.requireUser", // who may write
      "authz.require:settings.write",
      // the navigation must be valid
      "validate.check:settings.navigation",
      /* the write */ "content.set:settings",
      "delivery.exportLlms", // written inline before 3.0
    ]`);

describe("preset/override-emit keeps an override's comments where they are", () => {
  it("wraps the write, adds the emit and the relay after it, and drops the inline export's line, on the inline delivery", async () => {
    const [first, second, third] = await fixThreeTimes(commented, DIRECT);
    expect(first).toBe(
      presetWith(`[
      "authn.requireUser", // who may write
      "authz.require:settings.write",
      // the navigation must be valid
      "validate.check:settings.navigation",
      /* the write */ { atomic: ["content.set:settings"] },
      "events.emit:settings.updated",
      "events.relay",
    ]`),
    );
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(problemsOf(first, DIRECT, "setSettings")).toEqual([]);
  });

  it("puts the emit at the end of the write's group with the queue, as the 3.0 default has it", async () => {
    const [first, second, third] = await fixThreeTimes(commented, QUEUE);
    expect(first).toContain(`      /* the write */ { atomic: ["content.set:settings", "events.emit:settings.updated"] },\n      "events.relay",\n    ]`);
    expect(first).toContain(`"authn.requireUser", // who may write\n`);
    expect(first).toContain(`      // the navigation must be valid\n`);
    expect(first).not.toContain("delivery.exportLlms");
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(problemsOf(first, QUEUE, "setSettings")).toEqual([]);
  });

  it("keeps comments in a single-line array and drops an export with arguments", async () => {
    const source = presetWith(`["authn.requireUser", /* gate */ "authz.require:settings.write", "content.set:settings" /* the write */, "delivery.exportLlms?full=1"]`);
    const [first, second] = await fixThreeTimes(source, DIRECT);
    expect(first).toBe(presetWith(`["authn.requireUser", /* gate */ "authz.require:settings.write", { atomic: ["content.set:settings"] } /* the write */, "events.emit:settings.updated", "events.relay"]`));
    expect(second).toBe(first);
    expect(problemsOf(first, DIRECT, "setSettings")).toEqual([]);
  });

  it("keeps a comment on a line of its own in a multi-line group", async () => {
    const source = presetWith(`[
      "authn.requireUser",
      "authz.require:settings.write",
      {
        // one transaction
        atomic: [
          "content.set:settings",
        ],
      },
    ]`);
    const first = await fixOnce(source, QUEUE);
    expect(first).toContain(`        // one transaction\n        atomic: [\n          "content.set:settings",\n          "events.emit:settings.updated",\n        ],\n      },\n      "events.relay",\n    ]`);
    expect(problemsOf(first, QUEUE, "setSettings")).toEqual([]);
  });
});

describe("preset/override-emit anchors on the write", () => {
  it("never on a consumer group that does not hold the write", async () => {
    const source = presetWith(`["authn.requireUser", { atomic: ["authn.identifyUser"] }, "content.set:settings"]`);
    const [first, second, third] = await fixThreeTimes(source, DIRECT);
    expect(first).toBe(presetWith(`["authn.requireUser", { atomic: ["authn.identifyUser"] }, { atomic: ["content.set:settings"] }, "events.emit:settings.updated", "events.relay"]`));
    const steps = pipelineSteps(overrideIn(first, "setSettings"));
    expect(steps.indexOf("events.emit:settings.updated")).toBeGreaterThan(steps.indexOf("content.set:settings"));
    expect([second, third]).toEqual([first, first]);
    expect(problemsOf(first, DIRECT, "setSettings")).toEqual([]);
  });

  it("on the group holding the write, with the consumer's own step in it", async () => {
    const source = presetWith(`["authn.requireUser", { atomic: ["authn.identifyUser", "content.set:settings"] }]`);
    expect(await fixOnce(source, DIRECT)).toBe(presetWith(`["authn.requireUser", { atomic: ["authn.identifyUser", "content.set:settings"] }, "events.emit:settings.updated", "events.relay"]`));
    expect(await fixOnce(source, QUEUE)).toBe(presetWith(`["authn.requireUser", { atomic: ["authn.identifyUser", "content.set:settings", "events.emit:settings.updated"] }, "events.relay"]`));
  });

  it("moves an events.relay that sits before the write to after the new emit", async () => {
    const source = presetWith(`[
      "authn.requireUser",
      "events.relay", // relays what?
      "content.set:settings",
    ]`);
    const [first, second, third] = await fixThreeTimes(source, DIRECT);
    expect(first).toBe(
      presetWith(`[
      "authn.requireUser",
      { atomic: ["content.set:settings"] },
      "events.emit:settings.updated",
      "events.relay",
    ]`),
    );
    expect([second, third]).toEqual([first, first]);
  });

  it("keeps an events.relay already after the write, and adds the emit before it", async () => {
    const source = presetWith(`["authn.requireUser", "content.set:settings", "events.relay"]`);
    expect(await fixOnce(source, DIRECT)).toBe(presetWith(`["authn.requireUser", { atomic: ["content.set:settings"] }, "events.emit:settings.updated", "events.relay"]`));
  });
});

describe("preset/override-emit edits the override the project loads", () => {
  const draft = `const draft = definePreset({\n  overrides: {\n    setSettings: ["authn.requireUser", "content.set:settings"],\n  },\n});\n`;

  it("the one of two definePreset() calls that holds the loaded steps, and a second and third run add nothing", async () => {
    const source = `${draft}${presetWith(`["authn.requireUser", "authz.require:settings.write", "content.set:settings", "delivery.exportLlms"]`)}`;
    const [first, second, third] = await fixThreeTimes(source, DIRECT);
    expect(first).toBe(`${draft}${presetWith(`["authn.requireUser", "authz.require:settings.write", { atomic: ["content.set:settings"] }, "events.emit:settings.updated", "events.relay"]`)}`);
    expect([second, third]).toEqual([first, first]);
    expect(problemsOf(first, DIRECT, "setSettings")).toEqual([]);
  });

  it("manual when two definePreset() calls hold the same steps, and no run edits either", async () => {
    const steps = `["authn.requireUser", "content.set:settings"]`;
    const source = `const draft = definePreset({\n  overrides: {\n    setSettings: ${steps},\n  },\n});\n${presetWith(steps)}`;
    const findings = await findingsFor(source, DIRECT);
    const emit = findings.find((f) => f.rule === "preset/override-emit");
    expect(emit?.fix.kind).toBe("manual");
    expect(findings.find((f) => f.rule === "preset/override-group")?.fix.kind).toBe("manual");
    expect(emit?.suggestion).toContain("2 definePreset() calls override the pipeline");
    const [first, second, third] = await fixThreeTimes(source, DIRECT);
    expect([first, second, third]).toEqual([source, source, source]);
  });

  it("manual when the one override in the file is not the one the project loads", async () => {
    const ctx = contextFor(presetWith(`["authn.requireUser", "content.set:settings"]`), DIRECT, "setSettings");
    const loadedElsewhere = definePipeline({ name: "setSettings", steps: ["authn.requireUser", "authz.require:settings.write", "content.set:settings"] });
    const other: RuleContext = { ...ctx, project: { ...ctx.project, input: { ...ctx.project.input, pipelines: [loadedElsewhere] } } };
    const [emit] = await overrideEmitRule.check(other);
    expect(emit?.fix.kind).toBe("manual");
    expect(emit?.suggestion).toContain("does not hold the steps the project loads");
  });
});

describe("preset/override-emit on a pipeline whose default has no atomic group", () => {
  it("adds the emit and the relay right after the step before the default's emit", async () => {
    const source = `export const preset = definePreset({\n  overrides: {\n    updateMedia: ["authn.requireUser", "authz.require:media.write", "media.update", "authn.identifyUser"],\n  },\n});\n`;
    const [first, second] = await fixThreeTimes(source, DIRECT, "updateMedia");
    expect(first).toContain(`updateMedia: ["authn.requireUser", "authz.require:media.write", "media.update", "events.emit:media.updated", "events.relay", "authn.identifyUser"]`);
    expect(second).toBe(first);
    expect(problemsOf(first, DIRECT, "updateMedia")).toEqual([]);
  });
});
