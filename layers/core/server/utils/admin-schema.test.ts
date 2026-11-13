import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { describe, expect, it } from "vitest";
import { definePreset } from "#kestrel/pipelines";
import { buildAdminSchema, maxCascadeOf, schemaFromRun } from "./admin-schema";
import type { HttpTriggerEntry } from "./admin-capabilities";
import { contentModel, contentTypes, defaultLocale, features, locales, prefixPrimary } from "../../../../playground/shared/model";
import fieldTypes from "../../../../playground/shared/field-types";
import { customFieldTypes } from "../../collections-ui";
import type { ContentType } from "../../collections-ui";
import collectionsUi from "../../../../playground/shared/collections-ui";

function readJson<T>(url: URL): T {
  const parsed: unknown = JSON.parse(readFileSync(fileURLToPath(url), "utf-8"));
  return boundaryCast<T>(parsed, "json");
}

const allModules = [
  { use: "@michaelthielemann/kestrel-blobstore-filesystem" },
  { use: "@michaelthielemann/kestrel-replication-sqlite" },
  { use: "@michaelthielemann/kestrel-persistence-sqlite" },
  { use: "@michaelthielemann/kestrel-sanitize-svg" },
  { use: "@michaelthielemann/kestrel-media-default", config: { trashRetentionDays: 30 } },
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
  { use: "@michaelthielemann/kestrel-mfa-totp", config: { secretKey: "5a".repeat(32) } },
];

function fullAccessTriggers(): HttpTriggerEntry[] {
  const preset = definePreset({ modules: allModules, features, collections: contentTypes, fieldTypes });
  return preset.triggers
    .filter((trigger): trigger is { http: string; pipeline: string } => "http" in trigger)
    .map((trigger) => {
      const [method, path] = trigger.http.split(" ");
      return { method: method ?? "", path: path ?? "", pipeline: trigger.pipeline };
    });
}

const describedTypes: Record<string, ContentType> = {
  ...contentTypes,
  pages: { ...contentTypes.pages, fields: { ...contentTypes.pages.fields, accent: { type: "text" }, blockAliases: { type: "json" } } },
  blog: { ...contentTypes.blog, fields: { ...contentTypes.blog.fields, blockAliases: { type: "json" } } },
  settings: { ...contentTypes.settings, fields: { ...contentTypes.settings.fields, mounts: { type: "json" } } },
};
const describedModel = { ...contentModel, types: describedTypes };
const customTypes = customFieldTypes(contentTypes, fieldTypes);
const triggers = fullAccessTriggers();

const schema = buildAdminSchema({
  model: describedModel,
  collectionsUi,
  features,
  prefixPrimary,
  locales,
  defaultLocale,
  customTypes,
  triggers,
  access: {},
  collections: contentTypes,
});

describe("buildAdminSchema", () => {
  it("matches the frozen playground fixture", () => {
    const fixture = readJson<unknown>(new URL("../__fixtures__/admin-schema.json", import.meta.url));
    expect(schema).toEqual(fixture);
  });

  it("orders collections like the model's types", () => {
    expect(schema.collections.map((collection) => collection.name)).toEqual(Object.keys(contentModel.types));
  });

  it("takes locales and the primary locale from the described model", () => {
    expect(schema.locales).toEqual({ all: [...contentModel.locales], primary: contentModel.defaultLocale, prefixPrimary });
  });

  it("falls back to the consumer locales when the model describes none", () => {
    const fallback = buildAdminSchema({
      model: { types: describedTypes },
      collectionsUi,
      features,
      prefixPrimary,
      locales,
      defaultLocale,
      triggers,
      access: {},
    });
    expect(fallback.locales).toEqual({ all: [...locales], primary: defaultLocale, prefixPrimary });
  });

  it("reports a collection unpublished when its publish-status pipeline never booted, even though its name is routed", () => {
    const unbooted = buildAdminSchema({
      model: describedModel,
      collectionsUi,
      features,
      prefixPrimary,
      locales,
      defaultLocale,
      customTypes,
      triggers: [],
      access: {},
    });
    const pages = unbooted.collections.find((collection) => collection.name === "pages");
    expect(pages?.routed).toBe(true);
    expect(pages?.published).toBe(false);
  });

  it("derives the pages workflow from the status enum", () => {
    const pages = schema.collections.find((collection) => collection.name === "pages");
    expect(pages?.workflow).toEqual({ field: "status", live: "published", draft: "draft", done: "finished" });
  });

  it("leaves a collection without a status field without a workflow", () => {
    const settings = schema.collections.find((collection) => collection.name === "settings");
    expect(settings?.workflow).toBeUndefined();
  });

  it("names every collection's verb capabilities, none denied", () => {
    const pages = schema.collections.find((collection) => collection.name === "pages");
    expect(pages?.capabilities.update).toEqual({ method: "PATCH", path: "/pages/:id" });
    expect(pages?.capabilities.delete).toEqual({ method: "DELETE", path: "/pages/:id" });
    const settings = schema.collections.find((collection) => collection.name === "settings");
    expect(settings?.capabilities.get).toEqual({ method: "GET", path: "/settings" });
  });

  it("never lists a collection's own pipeline in the top-level capabilities", () => {
    expect(schema.capabilities.updatePage).toBeUndefined();
    expect(schema.capabilities.getSettings).toBeUndefined();
  });

  it("lists a pipeline outside any collection under its own name", () => {
    expect(schema.capabilities.deleteUser).toEqual({ method: "DELETE", path: "/users/:id" });
  });
});

describe("schemaFromRun", () => {
  const sources = { collectionsUi, features, prefixPrimary, locales, defaultLocale, customTypes, triggers };

  it("turns a run whose result ends with authz.describePipelineAccess into a 200 admin schema", () => {
    const run = { runId: "r1", status: 200, result: { ...describedModel, pipelineAccess: { deleteUser: "granted" } } };
    const result = schemaFromRun(run, sources);
    expect(result.status).toBe(200);
  });

  it("answers 500 when the model run carries no pipeline access", () => {
    const run = { runId: "r2", status: 200, result: { ...describedModel } };
    const result = schemaFromRun(run, sources);
    expect(result).toEqual({
      status: 500,
      body: {
        error: "adminSchemaModel: result.pipelineAccess missing – the pipeline must end with authz.describePipelineAccess",
        code: "INTERNAL",
        retryable: false,
      },
    });
  });

  it("answers 500 when a step replaced ctx.result with a non-object", () => {
    const run = { runId: "r3", status: 200, result: "not an object" };
    const result = schemaFromRun(run, sources);
    expect(result.status).toBe(500);
  });

  it("answers 500 when pipelineAccess is an array instead of a verdict map", () => {
    const run = { runId: "r4", status: 200, result: { ...describedModel, pipelineAccess: [] } };
    const result = schemaFromRun(run, sources);
    expect(result.status).toBe(500);
  });
});

describe("maxCascadeOf", () => {
  const site = (config: unknown) => [{ use: "@michaelthielemann/kestrel-site-default", config }];

  it("reports site-default's maxCascade, its default with routes, and nothing without them", () => {
    expect(maxCascadeOf(site({ routes: { pages: {} }, maxCascade: 250 }))).toBe(250);
    expect(maxCascadeOf(site({ routes: { pages: {} } }))).toBe(1000);
    expect(maxCascadeOf(site({}))).toBeUndefined();
  });
});
