import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyEdits } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, LoadedProject, RuleContext, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { deliveryAsyncRule, deliveryDependenciesRule, mediaEventIdsRule, mediaPathsRule, queueLanesRule, serverCacheRule, settingsLlmsRule } from "./dependentsRules";
import { definePipeline } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset } from "../pipelines/checkPreset";
import type { PresetEntry } from "../pipelines/compose";
import type { PresetStep } from "../module-registry";
import { overrideEmitRule } from "./overrideEmit";
import { overrideGroupRule, overrideRelayRule, presetProblemsRule, relayScopeRule } from "./rules";

function stepsOf(value: unknown): PipelineEntry[] {
  return Array.isArray(value) ? value.filter((entry): entry is PipelineEntry => typeof entry === "string" || (typeof entry === "object" && entry !== null)) : [];
}

const FILE = "/fake/kestrel.config.ts";
const QUEUE = "@michaelthielemann/kestrel-events-queue";
const DELIVERY_STATIC = "@michaelthielemann/kestrel-delivery-static";
const RENDERER = "@michaelthielemann/kestrel-renderer-nuxt";

interface ProjectShape {
  source: string;
  modules: { use: string; config?: unknown }[];
  features: string[];
  problems?: { code: string; pipeline?: string; message: string }[];
  overrides?: Record<string, unknown>;
}

function contextFor(shape: ProjectShape): RuleContext {
  const project: LoadedProject = {
    input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: Object.entries(shape.overrides ?? {}).map(([name, steps]) => definePipeline({ name, steps: stepsOf(steps) })) },
    kind: "kestrel-web",
    configFile: FILE,
    moduleFiles: new Map(),
    pipelineFiles: [{ file: FILE, pipelines: Object.keys(shape.overrides ?? {}) }],
    data: {
      presetProblems: shape.problems ?? [],
      presetOptions: {
        modules: shape.modules,
        features: shape.features,
        collections: { pages: { kind: "multi", fields: { slug: {}, title: {}, body: {}, status: {} } } },
        ...(shape.overrides === undefined ? {} : { overrides: shape.overrides }),
      },
    },
  };
  return {
    root: "/fake",
    scratch: "/fake",
    project,
    bootCheck: { errors: [], warnings: [], notChecked: [] },
    readFile: (file) => (file === FILE ? shape.source : undefined),
    answers: new Map(),
  };
}

function patched(source: string, findings: readonly Finding[]): string {
  const edits = findings.flatMap((f) => (f.fix.kind === "auto" ? f.fix.edits : []));
  const { text, conflicted } = applyEdits(source, edits);
  const unresolved = conflicted.filter((c) => !edits.some((e) => e !== c && e.start <= c.start && e.end >= c.end && !conflicted.includes(e)));
  expect(unresolved).toEqual([]);
  return text;
}

describe("the delivery dependencies of a hand-written module list", () => {
  const source = `const modules = [\n  { use: "${RENDERER}", config: {} },\n  { use: "${DELIVERY_STATIC}", config: { types: { pages: {} } } },\n];\n`;

  it("adds dependencies with the background render mode next to the inline event delivery", async () => {
    const ctx = contextFor({ source, modules: [{ use: RENDERER }, { use: DELIVERY_STATIC, config: { types: { pages: {} } } }, { use: "@michaelthielemann/kestrel-events-direct" }], features: ["delivery"] });
    const findings = await deliveryDependenciesRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warning");
    expect(patched(source, findings)).toContain(`{ use: "${DELIVERY_STATIC}", config: { types: { pages: {} }, dependencies: { render: "background", rendererReadsDocument: true } } }`);
  });

  it("adds dependencies with the events render mode next to the queue, as the error the preset reports", async () => {
    const message = `preset: module "${DELIVERY_STATIC}" needs dependencies.render "events" with the "eventsQueue" feature – re-renders run as queue jobs; use presetModuleConfig()`;
    const ctx = contextFor({
      source,
      modules: [{ use: RENDERER }, { use: DELIVERY_STATIC, config: { types: { pages: {} } } }, { use: QUEUE }],
      features: ["delivery", "eventsQueue"],
      problems: [{ code: "preset/render-mode-needs-events", message }],
    });
    const findings = await deliveryDependenciesRule.check(ctx);
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.message).toBe(message);
    expect(patched(source, findings)).toContain('dependencies: { render: "events", rendererReadsDocument: true, maxAttempts: 5, backoffSeconds: [5, 30, 120, 600] }');
  });

  it("takes the queue's own attempts and backoff into the events render mode", async () => {
    const ctx = contextFor({
      source,
      modules: [{ use: RENDERER }, { use: DELIVERY_STATIC, config: { types: { pages: {} } } }, { use: QUEUE, config: { maxAttempts: 3, backoffSeconds: [1, 2] } }],
      features: ["delivery", "eventsQueue"],
    });
    expect(patched(source, await deliveryDependenciesRule.check(ctx))).toContain("maxAttempts: 3, backoffSeconds: [1, 2] }");
  });

  it("sets the queue render mode on an entry presetModuleConfig() builds, through its overrides", async () => {
    const problems = [{ code: "preset/render-mode-needs-events", message: "needs events" }];
    const derivedModules = [{ use: RENDERER }, { use: DELIVERY_STATIC, config: { dependencies: { render: "background", rendererReadsDocument: true } } }, { use: QUEUE }];
    const bare = "const presetModules = presetModuleConfig({ dataDir });\n";
    const findings = await deliveryDependenciesRule.check(contextFor({ source: bare, modules: derivedModules, features: ["delivery", "eventsQueue"], problems }));
    expect(findings[0]?.fix.kind).toBe("auto");
    expect(patched(bare, findings)).toBe(`const presetModules = presetModuleConfig({ dataDir, overrides: { "${DELIVERY_STATIC}": { dependencies: { render: "events", rendererReadsDocument: true, maxAttempts: 5, backoffSeconds: [5, 30, 120, 600] } } } });\n`);

    const withOverrides = `const presetModules = presetModuleConfig({ dataDir, overrides: { "${DELIVERY_STATIC}": { llms: { full: false } } } });\n`;
    const merged = await deliveryDependenciesRule.check(contextFor({ source: withOverrides, modules: derivedModules, features: ["delivery", "eventsQueue"], problems }));
    expect(patched(withOverrides, merged)).toContain(`"${DELIVERY_STATIC}": { llms: { full: false }, dependencies: { render: "events"`);
  });

  it("replaces a wrong render mode on a literal entry", async () => {
    const literal = `const modules = [{ use: "${DELIVERY_STATIC}", config: { dependencies: { render: "background", rendererReadsDocument: true } } }];\n`;
    const ctx = contextFor({
      source: literal,
      modules: [{ use: RENDERER }, { use: DELIVERY_STATIC, config: { dependencies: { render: "background", rendererReadsDocument: true } } }, { use: QUEUE }],
      features: ["delivery", "eventsQueue"],
      problems: [{ code: "preset/render-mode-needs-events", message: "needs events" }],
    });
    expect(patched(literal, await deliveryDependenciesRule.check(ctx))).toContain('dependencies: { render: "events", rendererReadsDocument: true }');
  });

  it("stays manual when the entry comes from more than one presetModuleConfig() call", async () => {
    const twice = "const a = presetModuleConfig({ dataDir });\nconst b = presetModuleConfig({ dataDir });\n";
    const ctx = contextFor({
      source: twice,
      modules: [{ use: RENDERER }, { use: DELIVERY_STATIC, config: { dependencies: { render: "background" } } }, { use: QUEUE }],
      features: ["delivery", "eventsQueue"],
      problems: [{ code: "preset/render-mode-needs-events", message: "needs events" }],
    });
    const findings = await deliveryDependenciesRule.check(ctx);
    expect(findings[0]?.fix.kind).toBe("manual");
    expect(findings[0]?.suggestion).toContain("presetModuleConfig({ overrides })");
  });

  it("says nothing once the entry has dependencies that match, or without delivery-static or renderer-nuxt", async () => {
    expect(await deliveryDependenciesRule.check(contextFor({ source, modules: [{ use: RENDERER }, { use: DELIVERY_STATIC, config: { dependencies: { render: "background", rendererReadsDocument: true } } }], features: ["delivery"] }))).toEqual([]);
    expect(await deliveryDependenciesRule.check(contextFor({ source, modules: [{ use: DELIVERY_STATIC, config: {} }], features: ["delivery"] }))).toEqual([]);
    expect(await deliveryDependenciesRule.check(contextFor({ source, modules: [{ use: RENDERER }], features: [] }))).toEqual([]);
  });
});

describe("the layer's own media-path wiring (the publicPath/publicCopy/reservedPaths subset of assertMediaPaths)", () => {
  const MEDIA_DEFAULT = "@michaelthielemann/kestrel-media-default";
  const IMAGES_DEFAULT = "@michaelthielemann/kestrel-images-default";

  it("flags a config check accepts but the real boot refuses: publicPath still /api/media, reservedPaths still just /api/media", async () => {
    const ctx = contextFor({
      source: "",
      modules: [
        { use: MEDIA_DEFAULT, config: { publicPath: "/api/media", publicCopy: { prefix: "site/" } } },
        { use: IMAGES_DEFAULT, config: { publicPath: "/api/media", publicCopy: { prefix: "site/" } } },
        { use: DELIVERY_STATIC, config: { prefix: "site/", reservedPaths: ["/api/media"] } },
      ],
      features: ["delivery", "images"],
    });
    const findings = await mediaPathsRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.fix.kind).toBe("manual");
    expect(findings[0]?.message).toContain('publicPath "/api/media" is not "/media"');
    expect(findings[0]?.message).toContain("reservedPaths must contain");
    expect(findings[0]?.suggestion).toContain('publicPath: "/media"');
  });

  it("says nothing once the wiring matches what the boot requires", async () => {
    const ctx = contextFor({
      source: "",
      modules: [
        { use: MEDIA_DEFAULT, config: { publicPath: "/media", publicCopy: { prefix: "site/" } } },
        { use: IMAGES_DEFAULT, config: { publicPath: "/media", publicCopy: { prefix: "site/" } } },
        { use: DELIVERY_STATIC, config: { prefix: "site/", reservedPaths: ["/api", "/admin", "/media"] } },
      ],
      features: ["delivery", "images"],
    });
    expect(await mediaPathsRule.check(ctx)).toEqual([]);
  });

  it("says nothing when media-default's publicPath is unset: the module defaults it to /media itself, which the real boot accepts", async () => {
    const ctx = contextFor({
      source: "",
      modules: [
        { use: MEDIA_DEFAULT, config: { publicCopy: { prefix: "site/" } } },
        { use: IMAGES_DEFAULT, config: { publicPath: "/media", publicCopy: { prefix: "site/" } } },
        { use: DELIVERY_STATIC, config: { prefix: "site/", reservedPaths: ["/api", "/admin", "/media"] } },
      ],
      features: ["delivery", "images"],
    });
    expect(await mediaPathsRule.check(ctx)).toEqual([]);
  });

  it("says nothing without either media module, and without delivery-static does not require reservedPaths or publicCopy", async () => {
    expect(await mediaPathsRule.check(contextFor({ source: "", modules: [{ use: DELIVERY_STATIC, config: {} }], features: ["delivery"] }))).toEqual([]);
    const noDelivery = await mediaPathsRule.check(contextFor({ source: "", modules: [{ use: MEDIA_DEFAULT, config: { publicPath: "/media" } }], features: [] }));
    expect(noDelivery).toEqual([]);
  });

  it("defers entirely to modules/delivery-media while delivery-static still has its old media option: one finding for one problem, not two with different advice", async () => {
    const ctx = contextFor({
      source: "",
      modules: [
        { use: MEDIA_DEFAULT, config: { publicPath: "/api/media", publicCopy: { prefix: "site/" } } },
        { use: IMAGES_DEFAULT, config: { publicPath: "/api/media", publicCopy: { prefix: "site/" } } },
        { use: DELIVERY_STATIC, config: { prefix: "site/", media: { publicPath: "/api/media" } } },
      ],
      features: ["delivery", "images"],
    });
    expect(await mediaPathsRule.check(ctx)).toEqual([]);
  });
});

describe("the lanes of a hand-written queue entry", () => {
  const lanes = '{ pages: ["republishOutput", "refreshLlms"], variants: ["generateImageVariants"] }';

  it("sets lanes to lanesFor(features), keeping the entry's own config", async () => {
    const source = `const modules = [{ use: "${QUEUE}", config: { pollMs: 200, relayPipelines: ["publishPage", "unpublishPage"] } }];\n`;
    const ctx = contextFor({ source, modules: [{ use: QUEUE, config: { pollMs: 200, relayPipelines: ["publishPage", "unpublishPage"] } }], features: ["eventsQueue", "delivery", "images"] });
    const findings = await queueLanesRule.check(ctx);
    expect(findings[0]?.fix.kind).toBe("auto");
    expect(patched(source, findings)).toBe(`const modules = [{ use: "${QUEUE}", config: { pollMs: 200, relayPipelines: ["publishPage", "unpublishPage"], lanes: ${lanes} } }];\n`);
  });

  it("adds relayPipelines and lanes to an empty config in one edit that composes with the relay scope fix", async () => {
    const source = `const modules = [{ use: "${QUEUE}", config: {} }];\n`;
    const ctx = contextFor({ source, modules: [{ use: QUEUE, config: {} }], features: ["eventsQueue", "delivery", "images"] });
    const findings = [...(await relayScopeRule.check(ctx)), ...(await queueLanesRule.check(ctx))];
    expect(findings.map((f) => f.fix.kind)).toEqual(["auto", "auto"]);
    expect(patched(source, findings)).toBe(`const modules = [{ use: "${QUEUE}", config: { relayPipelines: ["publishPage", "unpublishPage"], lanes: ${lanes} } }];\n`);
  });

  it("adds a config to an entry without one", async () => {
    const source = `const modules = [{ use: "${QUEUE}" }];\n`;
    const findings = await queueLanesRule.check(contextFor({ source, modules: [{ use: QUEUE }], features: ["eventsQueue", "delivery"] }));
    expect(patched(source, findings)).toBe(`const modules = [{ use: "${QUEUE}", config: { relayPipelines: ["publishPage", "unpublishPage"], lanes: { pages: ["republishOutput", "refreshLlms"] } } }];\n`);
  });

  it("stays manual when the lanes exist but leave page renders or variants out, and says nothing when no lane is needed", async () => {
    const source = `const modules = [{ use: "${QUEUE}", config: { lanes: {} } }];\n`;
    const ctx = contextFor({ source, modules: [{ use: QUEUE, config: { lanes: {} } }], features: ["eventsQueue", "delivery"], problems: [{ code: "preset/page-renders-lane", message: "renders need their lane" }] });
    const findings = await queueLanesRule.check(ctx);
    expect(findings[0]?.fix.kind).toBe("manual");
    expect(findings[0]?.message).toBe("renders need their lane");
    expect(await queueLanesRule.check(contextFor({ source, modules: [{ use: QUEUE }], features: ["eventsQueue"] }))).toEqual([]);
  });

  it("leaves the lane, render mode and dropped emit problems to their own rules instead of the generic preset problem rule", async () => {
    const ctx = contextFor({
      source: "",
      modules: [],
      features: [],
      problems: [
        { code: "preset/page-renders-lane", message: "a" },
        { code: "preset/generate-image-variants-lane", pipeline: "generateImageVariants", message: "b" },
        { code: "preset/render-mode-needs-events", message: "c" },
        { code: "preset/override-drops-watched-emit", pipeline: "setSettings", message: "d" },
        { code: "preset/lane-pipeline-unknown", pipeline: "refreshLlms", message: "e" },
      ],
    });
    const findings = await presetProblemsRule.check(ctx);
    expect(findings.map((f) => f.message)).toEqual(["e"]);
    expect(findings[0]?.rule).toBe("preset/lane-pipeline-unknown");
    expect(findings[0]?.id).toBe("preset/lane-pipeline-unknown:refreshLlms");
  });
});

describe("a project with a collection named like the preset's own pipelines", () => {
  it("reports it as an error naming the collection and why", async () => {
    const collections = { pages: { kind: "multi" as const, fields: { slug: {}, title: {}, body: {}, status: {} } }, system: { kind: "multi" as const, fields: { title: {} } } };
    const { problems } = checkPreset({ modules: [{ use: "@michaelthielemann/kestrel-content-default" }], features: [], collections });
    const findings = await presetProblemsRule.check(contextFor({ source: "", modules: [], features: [], problems }));
    const reserved = findings.filter((f) => f.rule === "preset/collection-name-reserved");
    expect(reserved).toHaveLength(1);
    expect(reserved[0]).toMatchObject({ severity: "error", fix: { kind: "manual" } });
    expect(reserved[0]?.message).toContain('"system" is reserved: ');
  });
});

describe("an override of setSettings", () => {
  const source = `export const preset = definePreset({\n  modules,\n  features,\n  overrides: {\n    setSettings: ["authn.requireUser", "authz.require:settings.write", "validate.check:settings.navigation", "content.set:settings", "delivery.exportLlms"],\n  },\n});\n`;
  const override = ["authn.requireUser", "authz.require:settings.write", "validate.check:settings.navigation", "content.set:settings", "delivery.exportLlms"];
  const modules = [
    { use: "@michaelthielemann/kestrel-authn-multi" },
    { use: "@michaelthielemann/kestrel-authz-roles" },
    { use: "@michaelthielemann/kestrel-content-default" },
    { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
    { use: "@michaelthielemann/kestrel-media-default" },
    { use: "@michaelthielemann/kestrel-events-inmemory" },
    { use: "@michaelthielemann/kestrel-events-direct" },
  ];

  it("notes an inline llms.txt export as information", async () => {
    const findings = await settingsLlmsRule.check(contextFor({ source, modules, features: [], overrides: { setSettings: override } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("info");
    expect(findings[0]?.where.pipeline).toBe("setSettings");
    expect(await settingsLlmsRule.check(contextFor({ source, modules, features: [], overrides: { setSettings: override.slice(0, 4) } }))).toEqual([]);
  });

  it("gets its write wrapped in the atomic group the default now has, automatically", async () => {
    const ctx = contextFor({
      source,
      modules,
      features: [],
      overrides: { setSettings: override },
      problems: [{ code: "preset/override-drops-atomic-group", pipeline: "setSettings", message: 'preset: override for "setSettings" drops the atomic group around "content.set:settings"' }],
    });
    const findings = await overrideGroupRule.check(ctx);
    expect(findings[0]?.fix.kind).toBe("auto");
    expect(patched(source, findings)).toContain('{ atomic: ["content.set:settings"] }, "delivery.exportLlms"');
  });

  const multiLine = `export const preset = definePreset({\n  overrides: {\n    setSettings: [\n      "authn.requireUser",\n      "authz.require:settings.write",\n      "validate.check:settings.navigation",\n      "content.set:settings",\n      "delivery.exportLlms",\n    ],\n  },\n});\n`;
  const problems = [
    { code: "preset/override-drops-atomic-group", pipeline: "setSettings", message: "group" },
    { code: "preset/override-drops-relay", pipeline: "setSettings", message: "relay" },
    { code: "preset/override-drops-watched-emit", pipeline: "setSettings", message: 'preset: override for "setSettings" drops "events.emit:settings.updated"' },
  ];

  it("gets its group, emit and relay and loses its inline llms.txt export in one edit that supersedes the group wrap", async () => {
    const ctx = contextFor({ source: multiLine, modules, features: ["delivery"], overrides: { setSettings: override }, problems });
    const emit = await overrideEmitRule.check(ctx);
    expect(emit[0]?.fix.kind).toBe("auto");
    expect(await overrideRelayRule.check(ctx)).toEqual([]);
    const text = patched(multiLine, [...(await overrideGroupRule.check(ctx)), ...emit]);
    expect(text).toBe(`export const preset = definePreset({\n  overrides: {\n    setSettings: [\n      "authn.requireUser",\n      "authz.require:settings.write",\n      "validate.check:settings.navigation",\n      { atomic: ["content.set:settings"] },\n      "events.emit:settings.updated",\n      "events.relay",\n    ],\n  },\n});\n`);
    expect(await settingsLlmsRule.check(ctx)).toEqual([]);
  });

  it("leaves an override the preset accepts in both delivery modes", () => {
    const fixed: PresetEntry<PresetStep>[] = ["authn.requireUser", "authz.require:settings.write", "validate.check:settings.navigation", { atomic: ["content.set:settings"] }, "events.emit:settings.updated", "events.relay"];
    const collections = { settings: { kind: "single" as const, fields: {} }, pages: { kind: "multi" as const, fields: { slug: {}, title: {}, body: {}, status: {} } } };
    const direct = [...modules, { use: RENDERER }, { use: DELIVERY_STATIC, config: {} }];
    expect(checkPreset({ modules: direct, features: ["delivery"], collections, overrides: { setSettings: fixed } }).problems).toEqual([]);
    const queued = [...modules.filter((m) => m.use !== "@michaelthielemann/kestrel-events-direct"), { use: QUEUE, config: { lanes: { pages: ["republishOutput", "refreshLlms"] } } }, { use: RENDERER }, { use: DELIVERY_STATIC, config: { dependencies: { render: "events" } } }];
    expect(checkPreset({ modules: queued, features: ["delivery", "eventsQueue"], collections, overrides: { setSettings: fixed } }).problems).toEqual([]);
  });

  it("stays manual when the write is not one exact run, and only names the problem", async () => {
    const mixed = ["authn.requireUser", "content.set:settings", "authn.requireUser", "delivery.exportLlms"];
    const source2 = `definePreset({ overrides: { setSettings: ["authn.requireUser", "content.set:settings", "authn.requireUser", "delivery.exportLlms"] } });\n`;
    const withProblem = contextFor({ source: source2, modules, features: ["delivery"], overrides: { setSettings: mixed }, problems: problems.slice(2) });
    expect((await overrideEmitRule.check(withProblem))[0]?.fix.kind).toBe("auto");
    const split = ["authn.requireUser", "delivery.exportLlms"];
    const source3 = `definePreset({ overrides: { setSettings: ["authn.requireUser", "delivery.exportLlms"] } });\n`;
    const missingWrite = await overrideEmitRule.check(contextFor({ source: source3, modules, features: ["delivery"], overrides: { setSettings: split }, problems: problems.slice(2) }));
    expect(missingWrite[0]?.fix.kind).toBe("manual");
    expect(missingWrite[0]?.suggestion).toContain("one run");
  });
});

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true });
});

function projectWith(files: Record<string, string>): SourceRuleContext {
  const root = mkdtempSync(join(tmpdir(), "kestrel-web-dependents-rules-"));
  created.push(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return {
    root,
    scratch: root,
    readFile: (file) => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return undefined;
      }
    },
    answers: new Map(),
  };
}

const DELIVERY_MODEL = 'export const features = ["delivery", "sanitizeSvg"] as const satisfies readonly Feature[];\n';

describe("own triggers on media events", () => {
  it("notes every own trigger on media.updated, media.deleted or images.variantsChanged, in the config and in pipelines/index.ts", async () => {
    const ctx = projectWith({
      "kestrel.config.ts": 'export default defineConfig({ modules, triggers: [...preset.triggers, { event: "media.deleted", pipeline: "notifyArchive" }, { event: "page.updated", pipeline: "notifyEditors" }], http: null });\n',
      "pipelines/index.ts": 'export const triggers = [{ event: "images.variantsChanged", pipeline: "warmCdn" }, { event: "media.updated", pipeline: "notifyArchive" }];\n',
    });
    const findings = await mediaEventIdsRule.check(ctx);
    expect(findings.map((f) => [f.where.pipeline, f.severity, f.fix.kind])).toEqual([
      ["notifyArchive", "info", "none"],
      ["warmCdn", "info", "none"],
      ["notifyArchive", "info", "none"],
    ]);
    expect(findings[0]?.message).toContain("id: null");
    expect(findings[1]?.message).toContain('"images.variantsChanged"');
  });

  it("says nothing without such a trigger", async () => {
    expect(await mediaEventIdsRule.check(projectWith({ "kestrel.config.ts": 'export default defineConfig({ modules, triggers: preset.triggers, http: null });\n' }))).toEqual([]);
  });
});

describe("clients reading the old delivery answers", () => {
  it("notes a read of _llms and a Publish all caller reading its old counts, in app/ and server/", async () => {
    const ctx = projectWith({
      "app/composables/useSettingsSave.ts": 'export async function save(api) { const res = await api("/settings", { method: "PUT" }); return res._llms?.entries }\n',
      "server/api/republish.post.ts": 'export default defineEventHandler(async () => { const r = await $fetch("/api/admin/publish-all/pages", { method: "POST" }); return r.documents + r.errors })\n',
      "app/components/Stats.vue": '<script setup lang="ts">\nconst stats = { documents: 1 }\nconsole.log(stats.documents)\n</script>\n',
    });
    const findings = await deliveryAsyncRule.check(ctx);
    expect(findings).toHaveLength(2);
    expect(findings.find((f) => f.message.includes("_llms"))?.where.file).toContain("useSettingsSave.ts");
    expect(findings.find((f) => f.message.includes("Publish all"))?.message).toContain("documents, errors");
    expect(findings.every((f) => f.severity === "info" && f.fix.kind === "none")).toBe(true);
    expect(findings.every((f) => !f.message.includes(ctx.root))).toBe(true);
  });
});

describe("server caches near API reads", () => {
  it("notes cached handlers, cached functions, storage and cached /api route rules once delivery is on", async () => {
    const ctx = projectWith({
      "shared/model.ts": DELIVERY_MODEL,
      "server/utils/speakers.ts": "export const speakers = defineCachedFunction(async () => $fetch('/api/speakers'), { maxAge: 60 })\n",
      "app/composables/useLineup.ts": "export function useLineup() { return useStorage('lineups') }\n",
      "nuxt.config.ts": 'export default defineNuxtConfig({ routeRules: { "/api/speakers/**": { swr: 60 }, "/about": { prerender: true } } });\n',
    });
    const findings = await serverCacheRule.check(ctx);
    expect(findings).toHaveLength(3);
    expect(findings[0]?.message).toMatch(/^app\/composables\/useLineup\.ts uses useStorage;/);
    expect(findings[1]?.message).toMatch(/^server\/utils\/speakers\.ts uses defineCachedFunction;/);
    expect(findings[2]?.where.path).toBe("/api/speakers/**");
    expect(findings.every((f) => f.severity === "info")).toBe(true);
    expect(findings.every((f) => !f.message.includes(ctx.root))).toBe(true);
  });

  it("says nothing without delivery", async () => {
    const ctx = projectWith({
      "shared/model.ts": 'export const features = ["images"] as const satisfies readonly Feature[];\n',
      "server/utils/speakers.ts": "export const speakers = defineCachedFunction(async () => [])\n",
    });
    expect(await serverCacheRule.check(ctx)).toEqual([]);
  });
});
