import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { definePreset, featureOrder, staticPipelineNames } from "./index";
import type { Feature } from "./index";
import { DEFAULT_COLLECTIONS, collectionPipelines, isGenericCollection } from "./collections";

const allFeaturesRecord = {
  ratelimit: 1,
  sanitizeSvg: 1,
  references: 1,
  links: 1,
  delivery: 1,
  redirects: 1,
  images: 1,
  replication: 1,
  migrations: 1,
  audit: 1,
  insights: 1,
  eventsQueue: 1,
  revisions: 1,
} satisfies Record<Feature, 1>;

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
  { use: "@michaelthielemann/kestrel-events-queue" },
  { use: "@michaelthielemann/kestrel-ratelimit-memory" },
  { use: "@michaelthielemann/kestrel-migrations-default" },
  { use: "@michaelthielemann/kestrel-insights" },
  { use: "@michaelthielemann/kestrel-revisions-default" },
];

const KEEPS_HISTORICAL_NAMES = new Set(["pages"]);

describe("featureOrder", () => {
  it("covers exactly the Feature union", () => {
    expect([...featureOrder].sort()).toEqual(Object.keys(allFeaturesRecord).sort());
  });
});

describe("staticPipelineNames", () => {
  it("equals definePreset's pipeline names for every feature and the default collections, minus collection-derived names", () => {
    const preset = definePreset({ modules: allModules, features: featureOrder, collections: DEFAULT_COLLECTIONS });
    const generated = new Set(preset.pipelines.map((pipeline) => pipeline.name));

    for (const [name, model] of Object.entries(DEFAULT_COLLECTIONS)) {
      if (KEEPS_HISTORICAL_NAMES.has(name) || !isGenericCollection(name)) continue;
      for (const pipelineName of Object.keys(collectionPipelines(name, model))) generated.delete(pipelineName);
    }

    expect(generated).toEqual(new Set(staticPipelineNames));
  });
});

describe("the features table in docs/consuming-kestrel-web.md", () => {
  it("lists exactly the features in featureOrder", () => {
    const docsPath = fileURLToPath(new URL("../../../docs/consuming-kestrel-web.md", import.meta.url));
    const doc = readFileSync(docsPath, "utf-8");
    const start = doc.indexOf("### Features\n");
    const afterHeading = doc.slice(start + "### Features\n".length);
    const end = afterHeading.search(/\n#{1,6} /);
    const section = end === -1 ? afterHeading : afterHeading.slice(0, end);

    const names = [...section.matchAll(/^\|\s*`([a-zA-Z]+)`\s*\|/gm)].map((match) => match[1]);

    expect(names.length).toBeGreaterThan(0);
    expect([...names].sort()).toEqual([...featureOrder].sort());
  });
});
