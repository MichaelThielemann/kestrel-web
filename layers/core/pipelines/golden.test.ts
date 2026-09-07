import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { definePreset } from "./index";
import type { Feature } from "./index";
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
import { syntheticContentTypes } from "./__fixtures__/synthetic-collections";
import { contentTypes } from "../../../playground/shared/model";

const EXPORT_DIR = "<exportDir>";

const HOST_RUN_PIPELINES = new Set(["registerImageSizesBoot"]);

interface Fixture {
  pipelines: Record<string, string[]>;
  triggers: unknown[];
}

function readFixture(name: string): Fixture {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  return parsed as Fixture;
}

function pipelinesMap(pipelines: { name: string; steps: readonly string[] }[]): Record<string, string[]> {
  return Object.fromEntries(pipelines.map((pipeline) => [pipeline.name, [...pipeline.steps]]));
}

const allFeatures: readonly Feature[] = ["ratelimit", "sanitizeSvg", "references", "links", "delivery", "redirects", "images", "replication", "audit"];

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
  { use: "@michaelthielemann/kestrel-audit-persistence" },
  { use: "@michaelthielemann/kestrel-events-inmemory" },
  { use: "@michaelthielemann/kestrel-ratelimit-memory" },
];

describe("golden: playground", () => {
  it("matches playground.json pipelines and triggers exactly", () => {
    const fixture = readFixture("playground.json");
    const preset = definePreset({ modules: allModules, features: allFeatures, collections: contentTypes, exportDir: EXPORT_DIR });
    expect(pipelinesMap(preset.pipelines)).toEqual(fixture.pipelines);
    expect(preset.triggers).toEqual(fixture.triggers);
  });
});

describe("golden: consumer without the images feature", () => {
  it("matches without-images.json pipelines and triggers exactly", () => {
    const fixture = readFixture("without-images.json");
    const modules = allModules.filter((entry) => entry.use !== "@michaelthielemann/kestrel-images-default");
    const features = allFeatures.filter((feature) => feature !== "images");
    const preset = definePreset({ modules, features, collections: contentTypes, exportDir: EXPORT_DIR });
    expect(pipelinesMap(preset.pipelines)).toEqual(fixture.pipelines);
    expect(preset.triggers).toEqual(fixture.triggers);
  });
});

describe("golden: synthetic collections (news multi, profile system single, notifications account single)", () => {
  const syntheticModules = [
    { use: "@michaelthielemann/kestrel-redirects-default" },
    { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "redirects.rules": "y" } } },
    { use: "@michaelthielemann/kestrel-migrations-default" },
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
  const context = { exportDir: EXPORT_DIR, homeSlug: "home" };
  const collections = { pages: { kind: "multi" as const, fields: {} } };
  const featureFactories = { ratelimit, sanitizeSvg, references, links, delivery, redirects, images, replication, migrations, audit };
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
    for (const [feature, names] of featurePipelineNames) {
      for (const name of names) {
        if (HOST_RUN_PIPELINES.has(name)) continue;
        const hasTrigger = canonicalTriggers.some((entry) => entry.trigger.pipeline === name);
        expect(hasTrigger, `${feature} pipeline "${name}" has no trigger in canonicalTriggers`).toBe(true);
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
    expect(deleteMediaFolder?.steps).toEqual(["authn.requireUser", "authz.require:media.delete", "media.folderItems", "images.removeMany", "media.removeFolder"]);
  });
});
