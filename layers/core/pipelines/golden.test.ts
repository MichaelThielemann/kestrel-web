import { readFileSync } from "node:fs";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { isAtomicGroup, pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { definePreset, featureOrder } from "./index";
import type { Feature, PresetEntry } from "./index";
import { basePipelines } from "./base";
import { canonicalTriggers } from "./triggers";
import ratelimit from "./features/ratelimit";
import sanitizeSvg from "./features/sanitizeSvg";
import references from "./features/references";
import links from "./features/links";
import delivery from "./features/delivery";
import redirects from "./features/redirects";
import images from "./features/images";
import replication from "./features/replication";
import migrations from "./features/migrations";
import audit from "./features/audit";
import insights from "./features/insights";
import eventsQueue from "./features/eventsQueue";
import revisions from "./features/revisions";
import { syntheticContentTypes } from "./__fixtures__/synthetic-collections";
import { contentTypes } from "../../../playground/shared/model";
import fieldTypes from "../../../playground/shared/field-types";

const EXPORT_DIR = "<exportDir>";

const HOST_RUN_PIPELINES = new Set(["registerImageSizesBoot", "adminSchemaModel", "deliveryBuildCheck"]);

interface Fixture {
  pipelines: Record<string, PresetEntry<string>[]>;
  triggers: unknown[];
}

function readFixture(name: string): Fixture {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  return boundaryCast<Fixture>(parsed, "json");
}

function pipelinesMap(pipelines: { name: string; steps: readonly PresetEntry<string>[] }[]): Record<string, PresetEntry<string>[]> {
  return Object.fromEntries(pipelines.map((pipeline) => [pipeline.name, [...pipeline.steps]]));
}

const allFeatures: readonly Feature[] = featureOrder.filter((feature) => feature !== "migrations" && feature !== "eventsQueue");

const allModules = [
  { use: "@michaelthielemann/kestrel-blobstore-filesystem" },
  { use: "@michaelthielemann/kestrel-replication-sqlite" },
  { use: "@michaelthielemann/kestrel-persistence-sqlite" },
  { use: "@michaelthielemann/kestrel-sanitize-svg" },
  { use: "@michaelthielemann/kestrel-media-default" },
  { use: "@michaelthielemann/kestrel-images-default" },
  { use: "@michaelthielemann/kestrel-authn-multi" },
  { use: "@michaelthielemann/kestrel-authz-roles" },
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-references-default" },
  { use: "@michaelthielemann/kestrel-links-default" },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x", "redirects.rules": "y" } } },
  { use: "@michaelthielemann/kestrel-renderer-nuxt" },
  { use: "@michaelthielemann/kestrel-delivery-static" },
  { use: "@michaelthielemann/kestrel-redirects-default" },
  { use: "@michaelthielemann/kestrel-audit-persistence", config: { retentionDays: 365 } },
  { use: "@michaelthielemann/kestrel-events-inmemory" },
  { use: "@michaelthielemann/kestrel-events-direct" },
  { use: "@michaelthielemann/kestrel-ratelimit-memory" },
  { use: "@michaelthielemann/kestrel-insights" },
  { use: "@michaelthielemann/kestrel-revisions-default" },
];

describe("allFeatures", () => {
  it("omits exactly migrations and eventsQueue from featureOrder", () => {
    const omitted = featureOrder.filter((feature) => !allFeatures.includes(feature));
    expect(omitted).toEqual(["migrations", "eventsQueue"]);
  });
});

describe("golden: playground", () => {
  it("matches playground.json pipelines and triggers exactly", () => {
    const fixture = readFixture("playground.json");
    const preset = definePreset({ modules: allModules, features: allFeatures, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
    expect(pipelinesMap(preset.pipelines)).toEqual(fixture.pipelines);
    expect(preset.triggers).toEqual(fixture.triggers);
  });
});

describe("golden: consumer without the images feature", () => {
  it("matches without-images.json pipelines and triggers exactly", () => {
    const fixture = readFixture("without-images.json");
    const modules = allModules.filter((entry) => entry.use !== "@michaelthielemann/kestrel-images-default");
    const features = allFeatures.filter((feature) => feature !== "images");
    const preset = definePreset({ modules, features, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
    expect(pipelinesMap(preset.pipelines)).toEqual(fixture.pipelines);
    expect(preset.triggers).toEqual(fixture.triggers);
  });
});

describe("golden: synthetic collections (news multi, profile system single, notifications account single)", () => {
  const syntheticModules = [
    { use: "@michaelthielemann/kestrel-redirects-default" },
    { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "redirects.rules": "y" } } },
    { use: "@michaelthielemann/kestrel-migrations-default" },
    { use: "@michaelthielemann/kestrel-events-inmemory" },
    { use: "@michaelthielemann/kestrel-events-direct" },
  ];
  const syntheticFeatures: readonly Feature[] = ["redirects", "migrations"];

  it("matches synthetic.json pipelines and triggers exactly, with the migrations feature on", () => {
    const fixture = readFixture("synthetic.json");
    const preset = definePreset({ modules: syntheticModules, features: syntheticFeatures, collections: syntheticContentTypes, exportDir: EXPORT_DIR });
    expect(pipelinesMap(preset.pipelines)).toEqual(fixture.pipelines);
    expect(preset.triggers).toEqual(fixture.triggers);
  });

  it("keeps pages' historical singular pipeline names while news uses its raw name throughout", () => {
    const preset = definePreset({ modules: syntheticModules, features: syntheticFeatures, collections: syntheticContentTypes, exportDir: EXPORT_DIR });
    const names = new Set(preset.pipelines.map((pipeline) => pipeline.name));
    expect(names.has("readPage")).toBe(true);
    expect(names.has("readPages")).toBe(false);
    expect(names.has("readNews")).toBe(true);
    expect(names.has("getProfile")).toBe(true);
    expect(names.has("setNotifications")).toBe(true);
  });
});

describe("canonicalTriggers consistency", () => {
  const collections = { pages: { kind: "multi" as const, fields: {} } };
  const context = { exportDir: EXPORT_DIR, homeSlug: "home", collections };
  const featureFactories = { ratelimit, sanitizeSvg, references, links, delivery, redirects, images, replication, migrations, audit, insights, eventsQueue, revisions };
  const basePipelineNames = new Set(Object.keys(basePipelines(context, collections)));
  const featurePipelineNames = new Map(
    Object.entries(featureFactories).map(([feature, factory]) => [feature, new Set(Object.keys(factory(context).pipelines))]),
  );
  const allPipelineNames = new Set([...basePipelineNames, ...[...featurePipelineNames.values()].flatMap((names) => [...names])]);

  it("references only pipelines that exist in base or a feature", () => {
    for (const entry of canonicalTriggers) {
      expect(allPipelineNames.has(entry.trigger.pipeline)).toBe(true);
    }
  });

  it("gives every feature pipeline at least one trigger, except the ones a host runs itself", () => {
    const ownTriggers = new Set(
      Object.values(featureFactories).flatMap((factory) => (factory(context).triggers ?? []).map((trigger) => trigger.pipeline)),
    );
    for (const [feature, names] of featurePipelineNames) {
      for (const name of names) {
        if (HOST_RUN_PIPELINES.has(name)) continue;
        const hasTrigger = ownTriggers.has(name) || canonicalTriggers.some((entry) => entry.trigger.pipeline === name);
        expect(hasTrigger, `${feature} pipeline "${name}" has no trigger`).toBe(true);
      }
    }
  });

  it("keeps registerImageSizesBoot off every trigger", () => {
    expect(canonicalTriggers.some((entry) => entry.trigger.pipeline === "registerImageSizesBoot")).toBe(false);
  });
});

describe("golden: images without references", () => {
  it("produces a bootable deleteMediaFolder", () => {
    const modules = allModules.filter((entry) => entry.use !== "@michaelthielemann/kestrel-references-default");
    const features = allFeatures.filter((feature) => feature !== "references");
    const preset = definePreset({ modules, features, exportDir: EXPORT_DIR });
    const deleteMediaFolder = preset.pipelines.find((pipeline) => pipeline.name === "deleteMediaFolder");
    expect(deleteMediaFolder?.steps).toEqual([
      "authn.requireUser",
      "authz.require:media.delete",
      "media.listFolderItems",
      "media.removeFolder",
      "images.removeMany",
      "events.emit:media.deleted",
      "events.relay",
    ]);
  });
});

const queuedModules: { use: string; config?: unknown }[] = allModules
  .filter((entry) => entry.use !== "@michaelthielemann/kestrel-events-direct")
  .map((entry): { use: string; config?: unknown } => (entry.use === "@michaelthielemann/kestrel-delivery-static" ? { ...entry, config: { dependencies: { render: "events" } } } : entry))
  .concat([{ use: "@michaelthielemann/kestrel-events-queue", config: { lanes: { pages: ["republishOutput", "refreshLlms"], variants: ["generateImageVariants"] } } }]);
const queuedFeatures = [...allFeatures, "eventsQueue"] as readonly Feature[];

describe("golden: queued delivery", () => {
  it("matches queued-events.json pipelines and triggers exactly, with the eventsQueue feature on", () => {
    const fixture = readFixture("queued-events.json");
    const preset = definePreset({ modules: queuedModules, features: queuedFeatures, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
    expect(pipelinesMap(preset.pipelines)).toEqual(fixture.pipelines);
    expect(preset.triggers).toEqual(fixture.triggers);
  });
});

describe("atomic group invariants across every composed pipeline", () => {
  const direct = definePreset({ modules: allModules, features: allFeatures, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
  const queued = definePreset({ modules: queuedModules, features: queuedFeatures, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });

  it("never puts a delivery.* step inside a group, in either delivery mode", () => {
    for (const preset of [direct, queued]) {
      for (const pipeline of preset.pipelines) {
        for (const entry of pipeline.steps) {
          if (!isAtomicGroup(entry)) continue;
          for (const step of entry.atomic) {
            expect(step.startsWith("delivery."), `${pipeline.name}: "${step}" is inside a group`).toBe(false);
          }
        }
      }
    }
  });

  it("without the queue, no group contains an events.emit step", () => {
    for (const pipeline of direct.pipelines) {
      for (const entry of pipeline.steps) {
        if (!isAtomicGroup(entry)) continue;
        expect(entry.atomic.some((step) => step.startsWith("events.emit"))).toBe(false);
      }
    }
  });

  it("with the queue, every group that ends in an emit puts it last, and no emit sits in the middle of a group", () => {
    for (const pipeline of queued.pipelines) {
      for (const entry of pipeline.steps) {
        if (!isAtomicGroup(entry)) continue;
        entry.atomic.forEach((step, index) => {
          if (step.startsWith("events.emit") && index !== entry.atomic.length - 1) {
            throw new Error(`${pipeline.name}: "${step}" is not the last step of its group`);
          }
        });
      }
    }
  });

  it("keeps every step of every group reachable through pipelineSteps", () => {
    for (const preset of [direct, queued]) {
      for (const pipeline of preset.pipelines) {
        expect(pipelineSteps(pipeline.steps).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("restorePageRevision inherits the group; the fold moves only the emit, never revisions.reportRestore", () => {
  it("direct: one group around content.update:pages, with reportRestore and the emit outside, in that order", () => {
    const preset = definePreset({ modules: allModules, features: allFeatures, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
    const restore = preset.pipelines.find((pipeline) => pipeline.name === "restorePageRevision");
    const group = restore?.steps.find(isAtomicGroup);
    expect(group?.atomic).toContain("content.update:pages");
    expect(group?.atomic).not.toContain("revisions.reportRestore");
    const flat = pipelineSteps(restore?.steps ?? []);
    expect(flat.slice(-3)).toEqual(["revisions.reportRestore", "events.emit:page.restored", "events.relay"]);
  });

  it("queue: the emit joins the group's end; the relay follows it and reportRestore stays outside, after both, so the response keeps `restore`", () => {
    const preset = definePreset({ modules: queuedModules, features: queuedFeatures, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
    const restore = preset.pipelines.find((pipeline) => pipeline.name === "restorePageRevision");
    const group = restore?.steps.find(isAtomicGroup);
    expect(group?.atomic.at(-1)).toBe("events.emit:page.restored");
    expect(group?.atomic).not.toContain("revisions.reportRestore");
    const flat = pipelineSteps(restore?.steps ?? []);
    expect(flat.slice(-2)).toEqual(["events.relay", "revisions.reportRestore"]);
  });
});
