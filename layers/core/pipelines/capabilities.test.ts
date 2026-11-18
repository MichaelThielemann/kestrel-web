import { describe, expect, it } from "vitest";
import { collectionVerbs } from "./capabilities";
import { collectionPipelines, collectionTriggers } from "./collections";
import { definePreset, featureOrder } from "./index";
import type { Feature } from "./index";
import { syntheticContentTypes } from "./__fixtures__/synthetic-collections";
import { contentTypes } from "../../../playground/shared/model";
import fieldTypes from "../../../playground/shared/field-types";

const allFeatures: readonly Feature[] = featureOrder.filter((feature) => feature !== "migrations" && feature !== "eventsQueue");

const playgroundModules = [
  { use: "@michaelthielemann/kestrel-blobstore-filesystem" },
  { use: "@michaelthielemann/kestrel-replication-sqlite" },
  { use: "@michaelthielemann/kestrel-persistence-sqlite" },
  { use: "@michaelthielemann/kestrel-sanitize-svg" },
  { use: "@michaelthielemann/kestrel-media-default", config: { trashRetentionDays: 30 } },
  { use: "@michaelthielemann/kestrel-images-default" },
  { use: "@michaelthielemann/kestrel-authn-multi" },
  { use: "@michaelthielemann/kestrel-authz-roles" },
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-references-default", config: { schemas: { "pages.body": "x", "redirects.rules": "y" } } },
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
  { use: "@michaelthielemann/kestrel-mfa-totp", config: { secretKey: "5a".repeat(32) } },
];

const syntheticModules = [
  ...playgroundModules.filter((entry) => entry.use !== "@michaelthielemann/kestrel-validate-jsonschema" && entry.use !== "@michaelthielemann/kestrel-references-default"),
  { use: "@michaelthielemann/kestrel-references-default", config: { schemas: { "pages.body": "x", "news.body": "x", "redirects.rules": "y" } } },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x", "news.body": "x", "redirects.rules": "y" } } },
];

function checkAgainstComposed(collections: Record<string, { kind: "single" | "multi"; fields: Record<string, unknown> }>, composedNames: ReadonlySet<string>): void {
  for (const [name, model] of Object.entries(collections)) {
    const verbs = collectionVerbs(name, model);
    for (const [verb, pipelineName] of Object.entries(verbs)) {
      expect(composedNames.has(pipelineName), `expected "${name}"."${verb}" pipeline "${pipelineName}" to be composed`).toBe(true);
    }
  }
}

describe("collectionVerbs", () => {
  it("names only pipelines the preset composes, for the playground collections with every feature", () => {
    const preset = definePreset({ modules: playgroundModules, features: allFeatures, collections: contentTypes, fieldTypes });
    checkAgainstComposed(contentTypes, new Set(preset.pipelines.map((pipeline) => pipeline.name)));
  });

  it("names only pipelines the preset composes, for synthetic collections (multi, single, and the two hardcoded ones)", () => {
    const preset = definePreset({ modules: syntheticModules, features: allFeatures, collections: syntheticContentTypes });
    checkAgainstComposed(syntheticContentTypes, new Set(preset.pipelines.map((pipeline) => pipeline.name)));
  });

  it("returns the fixed pipeline names for settings and redirects without restating the naming rule", () => {
    expect(collectionVerbs("settings", { kind: "single", fields: {} })).toEqual({ get: "getSettings", set: "setSettings" });
    expect(collectionVerbs("redirects", { kind: "single", fields: {} })).toEqual({ get: "getRedirects", set: "setRedirects" });
  });

  it("adds the delivery verbs only for pages and the reference verbs for every multi collection", () => {
    const pagesVerbs = collectionVerbs("pages", { kind: "multi", fields: { title: {} } });
    expect(pagesVerbs.publishStatus).toBe("pagePublishStatus");
    expect(pagesVerbs.referrers).toBe("pageReferrers");
    expect(pagesVerbs.referrersMany).toBe("pageReferrersMany");

    const newsVerbs = collectionVerbs("news", { kind: "multi", fields: { title: {} } });
    expect(newsVerbs.publishStatus).toBeUndefined();
    expect(newsVerbs.referrers).toBe("newsReferrers");
    expect(newsVerbs.referrersMany).toBe("newsReferrersMany");
    expect(collectionVerbs("profile", { kind: "single", fields: { bio: {} } }).referrers).toBeUndefined();
  });

  it("adds the revision verbs only for a multi collection", () => {
    const multiVerbs = collectionVerbs("news", { kind: "multi", fields: { title: {} } });
    expect(multiVerbs.revisions).toBe("newsRevisions");
    expect(multiVerbs.restoreRevision).toBe("restoreNewsRevision");

    const singleVerbs = collectionVerbs("profile", { kind: "single", fields: { bio: {} } });
    expect(singleVerbs.revisions).toBeUndefined();
    expect(singleVerbs.get).toBe("getProfile");
  });
});

describe("a single collection with a publish workflow", () => {
  const profile = { kind: "single" as const, fields: { bio: {}, status: { type: "enum", options: ["draft", "published"] } } };

  it("filters its public read on the live status and adds an admin read of the stored state", () => {
    const pipelines = collectionPipelines("profile", profile);
    expect(pipelines.get?.steps).toEqual(["authn.identifyUser", "authz.require:profile.read", "content.get:profile?status=published"]);
    expect(pipelines.getAny?.steps).toEqual(["authn.requireUser", "authz.require:profile.manage", "content.get:profile"]);
    expect(collectionVerbs("profile", profile).getAny).toBe("getAnyProfile");
    expect(collectionTriggers("profile", profile)).toContainEqual({ http: "GET /admin/profile", pipeline: "getAnyProfile" });
  });

  it("keeps a single collection without a workflow on one unfiltered read", () => {
    const plain = { kind: "single" as const, fields: { bio: {} } };
    expect(collectionPipelines("profile", plain).get?.steps).toEqual(["authn.identifyUser", "authz.require:profile.read", "content.get:profile"]);
    expect(collectionPipelines("profile", plain).getAny).toBeUndefined();
    expect(collectionTriggers("profile", plain).map((t) => ("http" in t ? t.http : undefined))).toEqual(["GET /profile", "PUT /profile"]);
  });
});
