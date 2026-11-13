import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import { describe, expect, it } from "vitest";
import { definePreset, delaysFor, lanesFor } from "./index";
import type { CollectionModel, Feature, Preset, PresetOptions } from "./index";

const DELIVERY_STATIC = "@michaelthielemann/kestrel-delivery-static";
const EVENTS_QUEUE = "@michaelthielemann/kestrel-events-queue";
const EVENTS_DIRECT = "@michaelthielemann/kestrel-events-direct";

const collections = {
  settings: { kind: "single", fields: { title: { type: "text", localized: true } } },
  pages: { kind: "multi", fields: { slug: { type: "slug", localized: true }, title: { type: "text", localized: true }, body: { type: "json", localized: true }, status: { type: "enum", localized: true } } },
  speakers: { kind: "multi", fields: { name: { type: "text", localized: true }, status: { type: "enum" } } },
  venues: { kind: "multi", fields: { name: { type: "text" } } },
  profile: { kind: "single", fields: { bio: { type: "text" } } },
} as const satisfies Record<string, CollectionModel>;

type ModuleList = { use: string; config?: unknown }[];

function modulesFor(features: readonly Feature[], render?: "events" | "background", trash = false): ModuleList {
  const queued = features.includes("eventsQueue");
  const modules: ModuleList = [
    { use: "@michaelthielemann/kestrel-authn-multi" },
    { use: "@michaelthielemann/kestrel-authz-roles" },
    { use: "@michaelthielemann/kestrel-content-default" },
    { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
    trash ? { use: "@michaelthielemann/kestrel-media-default", config: { trashRetentionDays: 30 } } : { use: "@michaelthielemann/kestrel-media-default" },
    { use: "@michaelthielemann/kestrel-events-inmemory" },
    queued ? { use: EVENTS_QUEUE, config: { lanes: lanesFor(features) } } : { use: EVENTS_DIRECT },
  ];
  if (features.includes("delivery")) {
    modules.push({ use: "@michaelthielemann/kestrel-renderer-nuxt" });
    modules.push({ use: DELIVERY_STATIC, config: { types: { pages: {} }, dependencies: { render: render ?? (queued ? "events" : "background"), rendererReadsDocument: true } } });
  }
  if (features.includes("images")) modules.push({ use: "@michaelthielemann/kestrel-images-default" });
  if (features.includes("revisions")) modules.push({ use: "@michaelthielemann/kestrel-revisions-default" });
  if (features.includes("audit")) modules.push({ use: "@michaelthielemann/kestrel-audit-persistence" });
  return modules;
}

function compose(features: readonly Feature[], extra: Partial<PresetOptions<typeof collections>> = {}): Preset {
  return definePreset({ modules: modulesFor(features), features, collections, ...extra });
}

function stepsOf(preset: Preset, name: string): unknown {
  return preset.pipelines.find((pipeline) => pipeline.name === name)?.steps;
}

function eventsTriggering(preset: Preset, pipeline: string): string[] {
  return preset.triggers.flatMap((trigger: TriggerConfig) => ("event" in trigger && trigger.pipeline === pipeline ? [trigger.event] : []));
}

function names(preset: Preset): Set<string> {
  return new Set(preset.pipelines.map((pipeline) => pipeline.name));
}

describe("settings and single collections report their writes", () => {
  it("writes settings inside an atomic group and emits settings.updated, with or without delivery", () => {
    for (const features of [[], ["delivery"]] satisfies Feature[][]) {
      expect(stepsOf(compose(features), "setSettings")).toEqual([
        "authn.requireUser",
        "authz.requireRole",
        "authz.require:settings.write",
        "validate.check:settings.navigation",
        { atomic: ["content.set:settings"] },
        "events.emit:settings.updated",
        "events.relay",
      ]);
    }
  });

  it("folds the settings emit into the group with the queue, and exports no llms.txt from the request", () => {
    const preset = compose(["eventsQueue", "delivery"]);
    expect(stepsOf(preset, "setSettings")).toEqual([
      "authn.requireUser",
      "authz.requireRole",
      "authz.require:settings.write",
      "validate.check:settings.navigation",
      { atomic: ["content.set:settings", "events.emit:settings.updated"] },
      "events.relay",
    ]);
  });

  it("writes a single collection inside an atomic group and emits <name>.updated", () => {
    expect(stepsOf(compose([]), "setProfile")).toEqual([
      "authn.requireUser",
      "authz.requireRole",
      "authz.require:profile.write",
      { atomic: ["content.set:profile"] },
      "events.emit:profile.updated",
      "events.relay",
    ]);
  });

  it("rejects an override of setSettings that drops the group around content.set:settings", () => {
    expect(() =>
      compose(["delivery"], { overrides: { setSettings: ["authn.requireUser", "authz.requireRole", "authz.require:settings.write", "content.set:settings", "events.emit:settings.updated", "events.relay"] } }),
    ).toThrow('preset: override for "setSettings" drops the atomic group around "content.set:settings"');
  });
});

describe("dependents: marking the pages that read a change", () => {
  it("marks the readers of every collection, of settings and of media", () => {
    const preset = compose(["delivery"]);
    expect(stepsOf(preset, "pageDependents")).toEqual(["delivery.markDependents:pages"]);
    expect(stepsOf(preset, "speakersDependents")).toEqual(["delivery.markDependents:speakers"]);
    expect(stepsOf(preset, "venuesDependents")).toEqual(["delivery.markDependents:venues"]);
    expect(stepsOf(preset, "profileDependents")).toEqual(["delivery.markDependents:profile"]);
    expect(stepsOf(preset, "settingsDependents")).toEqual(["delivery.markDependents:settings", "delivery.requestIndexes"]);
    expect(stepsOf(preset, "mediaDependents")).toEqual(["delivery.markDependents:media"]);
  });

  it("subscribes each dependents pipeline to exactly the change events its collection's pipelines emit", () => {
    const preset = compose(["delivery"]);
    expect(eventsTriggering(preset, "pageDependents")).toEqual(["page.created", "page.updated", "page.deleted", "page.translationRemoved"]);
    expect(eventsTriggering(preset, "speakersDependents")).toEqual(["speakers.created", "speakers.updated", "speakers.deleted", "speakers.translationRemoved"]);
    expect(eventsTriggering(preset, "venuesDependents")).toEqual(["venues.created", "venues.updated", "venues.deleted"]);
    expect(eventsTriggering(preset, "profileDependents")).toEqual(["profile.updated"]);
    expect(eventsTriggering(preset, "settingsDependents")).toEqual(["settings.updated"]);
    expect(eventsTriggering(preset, "mediaDependents")).toEqual(["media.updated", "media.deleted"]);
  });

  it("adds the restored events once revisions emit them", () => {
    const preset = compose(["delivery", "revisions"]);
    expect(eventsTriggering(preset, "pageDependents")).toContain("page.restored");
    expect(eventsTriggering(preset, "speakersDependents")).toContain("speakers.restored");
  });

  it("composes no dependents trigger for an event no composed pipeline emits", () => {
    const preset = compose(["delivery"], { exclude: ["updateMedia", "deleteVenues"] });
    expect(eventsTriggering(preset, "mediaDependents")).toEqual(["media.deleted"]);
    expect(eventsTriggering(preset, "venuesDependents")).toEqual(["venues.created", "venues.updated"]);
  });

  it("also marks the readers of media whose image variants changed, when images-default raises that event", () => {
    expect(eventsTriggering(compose(["delivery", "images"]), "mediaDependents")).toEqual(["media.updated", "media.deleted", "images.variantsChanged"]);
    const withoutEdits = compose(["delivery", "images"], { exclude: ["updateMedia"] });
    expect(eventsTriggering(withoutEdits, "mediaDependents")).toEqual(["media.deleted", "images.variantsChanged"]);
  });

  it("also marks the readers of media moved to or out of the trash, once the trash pipelines emit those events", () => {
    const withTrash = definePreset({ modules: modulesFor(["delivery", "images"], undefined, true), features: ["delivery", "images"], collections });
    expect(eventsTriggering(withTrash, "mediaDependents")).toEqual(["media.updated", "media.deleted", "images.variantsChanged", "media.trashed", "media.restored"]);
    const withoutRestore = definePreset({ modules: modulesFor(["delivery"], undefined, true), features: ["delivery"], collections, exclude: ["restoreMedia"] });
    expect(eventsTriggering(withoutRestore, "mediaDependents")).toEqual(["media.updated", "media.deleted", "media.trashed"]);
    expect(eventsTriggering(compose(["delivery", "images"]), "mediaDependents")).not.toContain("media.trashed");
  });

  it("refuses an override of a trash pipeline that drops its emit", () => {
    expect(() =>
      definePreset({ modules: modulesFor(["delivery"], undefined, true), features: ["delivery"], collections, overrides: { trashMedia: ["authn.requireUser", "authz.require:media.delete", "media.trash", "events.relay"] } }),
    ).toThrow('preset: override for "trashMedia" drops "events.emit:media.trashed"');
  });

  it("refuses an override that drops the emit a dependents pipeline listens to, naming the pipeline", () => {
    expect(() =>
      compose(["delivery"], { overrides: { setSettings: ["authn.requireUser", "authz.requireRole", "authz.require:settings.write", "validate.check:settings.navigation", { atomic: ["content.set:settings"] }, "events.relay"] } }),
    ).toThrow('preset: override for "setSettings" drops "events.emit:settings.updated" – the pages that show what it writes would never be re-rendered; keep the emit, or exclude the pipeline and define your own');
    expect(() => compose(["delivery"], { overrides: { setProfile: ["authn.requireUser", "authz.requireRole", "authz.require:profile.write", { atomic: ["content.set:profile"] }, "events.relay"] } })).toThrow(
      'preset: override for "setProfile" drops "events.emit:profile.updated"',
    );
    expect(() => compose(["delivery"], { overrides: { updateSpeakers: ["authn.requireUser", "authz.requireRole", "authz.require:speakers.write", { atomic: ["content.update:speakers"] }, "events.relay"] } })).toThrow(
      'preset: override for "updateSpeakers" drops "events.emit:speakers.updated"',
    );
  });

  it("accepts an override that keeps the emit, and one that drops it without delivery", () => {
    const kept = compose(["delivery"], { overrides: { setProfile: ["authn.requireUser", { atomic: ["content.set:profile", "events.emit:profile.updated"] }, "events.relay"] } });
    expect(eventsTriggering(kept, "profileDependents")).toEqual(["profile.updated"]);
    expect(() => compose([], { overrides: { setProfile: ["authn.requireUser", "authz.requireRole", "authz.require:profile.write", { atomic: ["content.set:profile"] }, "events.relay"] } })).not.toThrow();
  });

  it("drops the triggers of an excluded dependents pipeline", () => {
    const excluded = compose(["delivery"], { exclude: ["speakersDependents"] });
    expect(names(excluded).has("speakersDependents")).toBe(false);
    expect(excluded.triggers.some((trigger) => trigger.pipeline === "speakersDependents")).toBe(false);
  });

  it("composes no dependents pipeline without delivery", () => {
    const preset = compose([]);
    for (const name of ["pageDependents", "speakersDependents", "settingsDependents", "mediaDependents", "resumeStalePages", "deliveryBuildCheck"]) {
      expect(names(preset).has(name), name).toBe(false);
    }
  });
});

describe("dependents: rendering the marked pages outside the request", () => {
  it("publishes and unpublishes a page, then requests the index exports instead of writing them", () => {
    const preset = compose(["delivery"]);
    expect(stepsOf(preset, "publishPage")).toEqual(["delivery.publish:pages", "delivery.requestIndexes"]);
    expect(stepsOf(preset, "unpublishPage")).toEqual(["delivery.unpublish:pages", "delivery.requestIndexes"]);
  });

  it("renders marked pages and exports the index files and llms-full.txt as queue jobs only with the queue", () => {
    const queued = compose(["eventsQueue", "delivery"]);
    expect(stepsOf(queued, "republishOutput")).toEqual(["delivery.republishOutput"]);
    expect(stepsOf(queued, "refreshIndexes")).toEqual(["delivery.exportIndexes"]);
    expect(stepsOf(queued, "refreshLlms")).toEqual(["delivery.exportLlmsFull"]);
    expect(eventsTriggering(queued, "republishOutput")).toEqual(["delivery.outputStale"]);
    expect(eventsTriggering(queued, "refreshIndexes")).toEqual(["delivery.indexesStale"]);
    expect(eventsTriggering(queued, "refreshLlms")).toEqual(["delivery.llmsStale"]);

    const direct = compose(["delivery"]);
    for (const name of ["republishOutput", "refreshIndexes", "refreshLlms"]) expect(names(direct).has(name), name).toBe(false);
  });

  it("exports the index files only in the indexes lane and llms-full.txt only in the pages lane: never in a request, a relayed pipeline or the main lane", () => {
    const features: Feature[] = ["eventsQueue", "delivery", "images", "audit", "revisions"];
    const queued = compose(features);
    const lanes = lanesFor(features);
    const lanesOf = (step: string): string[] => queued.pipelines.filter((pipeline) => pipelineSteps(pipeline.steps).includes(step)).map((pipeline) => pipeline.name);
    expect(lanesOf("delivery.exportIndexes")).toEqual(lanes.indexes);
    expect(lanesOf("delivery.exportLlmsFull").every((name) => lanes.pages?.includes(name))).toBe(true);
    const direct = compose(["delivery", "images", "audit", "revisions"]);
    expect(direct.pipelines.filter((pipeline) => pipelineSteps(pipeline.steps).some((step) => step.startsWith("delivery.export")))).toEqual([]);
  });

  it("makes Publish all only mark the pages and request the index exports, with and without images", () => {
    for (const features of [["delivery"], ["delivery", "images"], ["eventsQueue", "delivery", "images"]] satisfies Feature[][]) {
      expect(stepsOf(compose(features), "publishAllPages")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:pages.manage", "delivery.markAll:pages", "delivery.requestIndexes"]);
    }
  });

  it("re-renders every delivered page and requests the index exports after migrations rebuilt the paths", () => {
    const withMigrations = definePreset({ modules: [...modulesFor(["delivery"]), { use: "@michaelthielemann/kestrel-migrations-default" }], features: ["delivery", "migrations"], collections });
    expect(stepsOf(withMigrations, "rebuildPathsAfterMigrations")).toEqual(["site.planRebuild", { atomic: ["site.applyRebuild"] }, "site.announcePaths", "delivery.markAll:pages", "delivery.requestIndexes"]);
    const withoutDelivery = definePreset({ modules: [...modulesFor([]), { use: "@michaelthielemann/kestrel-migrations-default" }], features: ["migrations"], collections });
    expect(stepsOf(withoutDelivery, "rebuildPathsAfterMigrations")).toEqual(["site.planRebuild", { atomic: ["site.applyRebuild"] }, "site.announcePaths"]);
  });

  it("recovers marks every five minutes, serves the stale status and the retry behind pages.manage, and leaves the build check, which requests the index exports, to the host", () => {
    const preset = compose(["delivery"]);
    expect(stepsOf(preset, "resumeStalePages")).toEqual(["delivery.resumeStale"]);
    expect(preset.triggers).toContainEqual({ cron: "*/5 * * * *", pipeline: "resumeStalePages" });
    expect(stepsOf(preset, "pagesStaleStatus")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:pages.manage", "delivery.readStaleStatus"]);
    expect(preset.triggers).toContainEqual({ http: "GET /admin/publish-status/pages", pipeline: "pagesStaleStatus" });
    expect(stepsOf(preset, "retryStalePages")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:pages.manage", "delivery.retryStale", "delivery.requestIndexes"]);
    expect(preset.triggers).toContainEqual({ http: "POST /admin/publish-stale/pages/retry", pipeline: "retryStalePages" });
    expect(stepsOf(preset, "deliveryBuildCheck")).toEqual(["delivery.checkBuild", "delivery.requestIndexes"]);
    expect(preset.triggers.some((trigger) => trigger.pipeline === "deliveryBuildCheck")).toBe(false);
  });

  it("checks for a database restore directly before the build check, with the module that restores the database file", () => {
    const database = { use: "@michaelthielemann/kestrel-persistence-sqlite", config: { file: "data/kestrel.db" } };
    const withModules = (extra: ModuleList): Preset => definePreset({ modules: [...modulesFor(["delivery"]), database, ...extra], features: ["delivery"], collections });
    expect(stepsOf(withModules([{ use: "@michaelthielemann/kestrel-replication-sqlite", config: { file: "data/kestrel.db" } }]), "deliveryBuildCheck")).toEqual([
      "replication.checkRestored",
      "delivery.checkBuild",
      "delivery.requestIndexes",
    ]);
    expect(stepsOf(withModules([{ use: "@michaelthielemann/kestrel-backup-blobstore", config: { file: "./data/kestrel.db" } }]), "deliveryBuildCheck")).toEqual([
      "backup.checkRestored",
      "delivery.checkBuild",
      "delivery.requestIndexes",
    ]);
    expect(stepsOf(withModules([{ use: "@michaelthielemann/kestrel-backup-blobstore", config: { file: "data/other.db" } }]), "deliveryBuildCheck")).toEqual(["delivery.checkBuild", "delivery.requestIndexes"]);
  });

  it("lets a consumer reschedule the recovery", () => {
    const preset = compose(["delivery"], { schedules: { resumeStalePages: "*/10 * * * *" } });
    expect(preset.triggers).toContainEqual({ cron: "*/10 * * * *", pipeline: "resumeStalePages" });
  });
});

describe("dependents: the render mode matches the event delivery", () => {
  it("refuses dependencies.render \"events\" without the queue, naming the key", () => {
    expect(() => definePreset({ modules: modulesFor(["delivery"], "events"), features: ["delivery"], collections })).toThrow(
      `preset: module "${DELIVERY_STATIC}" has dependencies.render "events", which needs the "eventsQueue" feature – use "background", or presetModuleConfig()`,
    );
  });

  it("refuses the queue with dependencies.render left at \"background\", naming the key", () => {
    const features: Feature[] = ["eventsQueue", "delivery"];
    expect(() => definePreset({ modules: modulesFor(features, "background"), features, collections })).toThrow(
      `preset: module "${DELIVERY_STATIC}" needs dependencies.render "events" with the "eventsQueue" feature – re-renders run as queue jobs; use presetModuleConfig()`,
    );
    const withoutDependencies = modulesFor(features).map((entry) => (entry.use === DELIVERY_STATIC ? { use: DELIVERY_STATIC, config: { types: { pages: {} } } } : entry));
    expect(() => definePreset({ modules: withoutDependencies, features, collections })).toThrow('needs dependencies.render "events"');
  });
});

describe("dependents: queue lanes", () => {
  it("derives the pages and indexes lanes with delivery and the variants lane with images, and nothing else", () => {
    expect(lanesFor(["eventsQueue"])).toEqual({});
    expect(lanesFor(["eventsQueue", "delivery"])).toEqual({ pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"] });
    expect(lanesFor(["eventsQueue", "images"])).toEqual({ variants: ["generateImageVariants"] });
    expect(lanesFor(["eventsQueue", "delivery", "images", "audit"])).toEqual({ pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"], variants: ["generateImageVariants"] });
  });

  it("holds the index exports back with the queue and delivery, and nothing else", () => {
    expect(delaysFor(["eventsQueue", "delivery"])).toEqual({ refreshIndexes: 1000, refreshLlms: 3000 });
    expect(delaysFor(["delivery"])).toEqual({});
    expect(delaysFor(["eventsQueue", "images"])).toEqual({});
  });

  it("names only pipelines the preset composes in delayMs, for every feature subset", () => {
    const optional: Feature[] = ["delivery", "images", "audit"];
    for (let mask = 0; mask < 1 << optional.length; mask++) {
      const features: Feature[] = ["eventsQueue", ...optional.filter((_, index) => (mask & (1 << index)) !== 0)];
      const composed = names(compose(features));
      for (const name of Object.keys(delaysFor(features))) expect(composed.has(name), `${name} with ${features.join(", ")}`).toBe(true);
    }
  });

  it("rejects a delayMs config that names a delivery pipeline this configuration does not compose", () => {
    const modules = modulesFor(["eventsQueue"]).map((entry) => (entry.use === EVENTS_QUEUE ? { use: EVENTS_QUEUE, config: { delayMs: { refreshIndexes: 1000 } } } : entry));
    expect(() => definePreset({ modules, features: ["eventsQueue"], collections })).toThrow(
      `preset: module "${EVENTS_QUEUE}" holds back pipeline "refreshIndexes" in delayMs, which the preset does not compose – remove it from delayMs too, or keep the pipeline`,
    );
    const own = modulesFor(["eventsQueue"]).map((entry) => (entry.use === EVENTS_QUEUE ? { use: EVENTS_QUEUE, config: { delayMs: { myOwnPipeline: 1000 } } } : entry));
    expect(() => definePreset({ modules: own, features: ["eventsQueue"], collections })).not.toThrow();
  });

  it("rejects a lanes config that leaves the index export in the main lane or shares its lane", () => {
    const features: Feature[] = ["eventsQueue", "delivery"];
    const withLanes = (lanes: Record<string, string[]>): ModuleList =>
      modulesFor(features).map((entry) => (entry.use === EVENTS_QUEUE ? { use: EVENTS_QUEUE, config: { lanes } } : entry));
    const message = `preset: module "${EVENTS_QUEUE}" must run "refreshIndexes" in a lane of its own – sitemap.xml, robots.txt and llms.txt must never wait for a re-render backlog or other queued work`;
    expect(() => definePreset({ modules: withLanes({ pages: ["republishOutput", "refreshLlms"] }), features, collections })).toThrow(message);
    expect(() => definePreset({ modules: withLanes({ pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes", "purgeEvents"] }), features, collections })).toThrow(message);
    expect(() => definePreset({ modules: withLanes({ pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"] }), features, collections })).not.toThrow();
  });

  it("names only pipelines the preset composes, for every feature subset", () => {
    const optional: Feature[] = ["delivery", "images", "audit", "revisions"];
    for (let mask = 0; mask < 1 << optional.length; mask++) {
      const features: Feature[] = ["eventsQueue", ...optional.filter((_, index) => (mask & (1 << index)) !== 0)];
      const composed = names(compose(features));
      for (const members of Object.values(lanesFor(features))) {
        for (const member of members) expect(composed.has(member), `${member} with ${features.join(", ")}`).toBe(true);
      }
      const lanes = Object.values(lanesFor(features)).flat();
      expect(lanes).not.toContain("auditAuth");
      expect(lanes).not.toContain("planImageVariants");
      expect(lanesFor(features).pages ?? []).not.toContain("generateImageVariants");
    }
  });

  it("rejects a lanes config that names a delivery pipeline this configuration does not compose", () => {
    const modules = modulesFor(["eventsQueue"]).map((entry) => (entry.use === EVENTS_QUEUE ? { use: EVENTS_QUEUE, config: { lanes: { pages: ["republishOutput"] } } } : entry));
    expect(() => definePreset({ modules, features: ["eventsQueue"], collections })).toThrow(
      `preset: module "${EVENTS_QUEUE}" runs pipeline "republishOutput" in lane "pages", which the preset does not compose – remove it from lanes too, or keep the pipeline`,
    );
  });

  it("refuses a queue entry without lanes when delivery is on, since page renders would then run in the main lane", () => {
    const features: Feature[] = ["eventsQueue", "delivery"];
    const message = `preset: module "${EVENTS_QUEUE}" must run "republishOutput" and "refreshLlms" together in a lane of their own`;
    for (const config of [undefined, {}, { relayPipelines: ["publishPage", "unpublishPage"] }]) {
      const modules = modulesFor(features).map((entry) => (entry.use === EVENTS_QUEUE ? (config === undefined ? { use: EVENTS_QUEUE } : { use: EVENTS_QUEUE, config }) : entry));
      expect(() => definePreset({ modules, features, collections }), JSON.stringify(config)).toThrow(message);
    }
    const withoutDelivery = modulesFor(["eventsQueue"]).map((entry) => (entry.use === EVENTS_QUEUE ? { use: EVENTS_QUEUE } : entry));
    expect(() => definePreset({ modules: withoutDelivery, features: ["eventsQueue"], collections })).not.toThrow();
  });

  it("rejects a lanes config that leaves the page renders or the llms.txt export in the main lane, or splits them", () => {
    const features: Feature[] = ["eventsQueue", "delivery"];
    const withLanes = (lanes: Record<string, string[]>): ModuleList =>
      modulesFor(features).map((entry) => (entry.use === EVENTS_QUEUE ? { use: EVENTS_QUEUE, config: { lanes } } : entry));
    const message = `preset: module "${EVENTS_QUEUE}" must run "republishOutput" and "refreshLlms" together in a lane of their own – re-renders must never delay other queued work, and the export must follow them`;
    expect(() => definePreset({ modules: withLanes({ pages: ["republishOutput"] }), features, collections })).toThrow(message);
    expect(() => definePreset({ modules: withLanes({ pages: ["republishOutput"], llms: ["refreshLlms"] }), features, collections })).toThrow(message);
    expect(() => definePreset({ modules: withLanes({ pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"] }), features, collections })).not.toThrow();
  });
});
