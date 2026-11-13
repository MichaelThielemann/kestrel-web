import { resolve } from "node:path";
import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import { describe, expect, it } from "vitest";
import { anonymousFieldGrants, definePreset, featureOrder, presetModuleConfig } from "./index";
import type { CollectionModel, Feature, ModuleEntry, PresetContentModel, PresetPipelineChanges } from "./index";
import { syntheticContentTypes } from "./__fixtures__/synthetic-collections";
import { contentModel, contentTypes } from "../../../playground/shared/model";
import fieldTypes from "../../../playground/shared/field-types";

const EXPORT_DIR = "<exportDir>";

const allModules: { use: string; config?: unknown }[] = [
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
  { use: "@michaelthielemann/kestrel-mfa-totp", config: { secretKey: "5a".repeat(32) } },
];
const allFeatures: readonly Feature[] = featureOrder.filter((feature) => feature !== "migrations" && feature !== "eventsQueue");
const queuedModules = allModules
  .filter((entry) => entry.use !== "@michaelthielemann/kestrel-events-direct")
  .map((entry) => (entry.use === "@michaelthielemann/kestrel-delivery-static" ? { ...entry, config: { dependencies: { render: "events" } } } : entry))
  .concat([{ use: "@michaelthielemann/kestrel-events-queue", config: { lanes: { pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"], variants: ["generateImageVariants"] } } }]);

const PUBLIC_READS_WITH_IMAGES: Record<string, string> = {
  resolvePage: "authz.fields:pages?shape=item",
  resolveBlog: "authz.fields:blog?shape=item",
  readBlog: "authz.fields:blog?shape=item",
  listBlog: "authz.fields:blog?shape=list",
  readPage: "authz.fields:pages?shape=item",
  listPages: "authz.fields:pages?shape=list",
  getSettings: "authz.fields:settings?shape=item",
  getMedia: "authz.fields:media?shape=item",
  listMedia: "authz.fields:media?shape=list",
  downloadMedia: "authz.fields:mediaFile?shape=file",
  serveMediaFile: "authz.fields:mediaFile?shape=file",
  serveImageVariant: "authz.fields:mediaFile?shape=file",
  setMediaFraming: "authz.fields:media?shape=item",
  renderRedirects: "authz.fields:redirectRules?shape=array",
  getRedirects: "authz.fields:redirects?shape=item",
};

function cutSteps(preset: ReturnType<typeof definePreset>): Record<string, string> {
  const cuts: Record<string, string> = {};
  for (const pipeline of preset.pipelines) {
    const steps = pipelineSteps(pipeline.steps);
    const index = steps.findIndex((step) => step.startsWith("authz.fields:"));
    if (index === -1) continue;
    expect(index, `${pipeline.name}: authz.fields is not its last step`).toBe(steps.length - 1);
    cuts[pipeline.name] = steps[index] ?? "";
  }
  return cuts;
}

describe("the preset's field cut on public reads", () => {
  it("ends exactly the public reads and the media framing write of the playground composition with authz.fields, and nothing else", () => {
    const preset = definePreset({ modules: allModules, features: allFeatures, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
    expect(cutSteps(preset)).toEqual(PUBLIC_READS_WITH_IMAGES);
  });

  it("does the same with queued event delivery", () => {
    const preset = definePreset({ modules: queuedModules, features: [...allFeatures, "eventsQueue"], collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
    expect(cutSteps(preset)).toEqual(PUBLIC_READS_WITH_IMAGES);
  });

  it("cuts after images.attach and after the redirect lookup's page read", () => {
    const preset = definePreset({ modules: allModules, features: allFeatures, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
    const steps = (name: string) => pipelineSteps(preset.pipelines.find((pipeline) => pipeline.name === name)?.steps ?? []);
    expect(steps("getMedia").slice(-2)).toEqual(["images.attach", "authz.fields:media?shape=item"]);
    expect(steps("listMedia").slice(-2)).toEqual(["images.attach", "authz.fields:media?shape=list"]);
    expect(steps("resolvePage")).toEqual([
      "authn.identifyUser",
      "authz.require:pages.read",
      "redirects.lookup",
      "site.route:pages?home=home&status=published&fallback=true",
      "site.resolve:pages?home=home&status=published&fallback=true",
      "site.resolveLinks:pages?home=home&status=published&fallback=true",
      "authz.fields:pages?shape=item",
    ]);
  });

  it("leaves serveImageVariant, setMediaFraming, renderRedirects and getRedirects out without their features", () => {
    const modules = allModules.filter((entry) => entry.use !== "@michaelthielemann/kestrel-images-default" && entry.use !== "@michaelthielemann/kestrel-redirects-default");
    const features = allFeatures.filter((feature) => feature !== "images" && feature !== "redirects");
    const preset = definePreset({ modules, features, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });
    const { serveImageVariant: _variant, setMediaFraming: _framing, renderRedirects: _rules, getRedirects: _redirects, ...expected } = PUBLIC_READS_WITH_IMAGES;
    expect(cutSteps(preset)).toEqual(expected);
  });

  it("ends every collection's public list, read and get with a cut named after the collection", () => {
    const modules = [
      { use: "@michaelthielemann/kestrel-redirects-default" },
      { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "redirects.rules": "y" } } },
      { use: "@michaelthielemann/kestrel-events-inmemory" },
      { use: "@michaelthielemann/kestrel-events-direct" },
    ];
    const preset = definePreset({ modules, features: ["redirects"], collections: syntheticContentTypes, exportDir: EXPORT_DIR });
    const cuts = cutSteps(preset);
    expect(cuts.listNews).toBe("authz.fields:news?shape=list");
    expect(cuts.readNews).toBe("authz.fields:news?shape=item");
    expect(cuts.getProfile).toBe("authz.fields:profile?shape=item");
    expect(cuts.getNotifications).toBe("authz.fields:notifications?shape=item");
    expect(cuts.listAllNews).toBeUndefined();
    expect(cuts.readAnyNews).toBeUndefined();
  });

  it("keeps a consumer's override exactly as written, without appending the cut", () => {
    const override = ["authn.identifyUser", "authz.require:media.read", "media.get"] as const;
    const preset = definePreset({ modules: allModules, features: allFeatures, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR, overrides: { getMedia: override } });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "getMedia")?.steps).toEqual([...override]);
  });
});

const DATA_DIR = "/srv/kestrel/data";
const PASSWORD_HASH = "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";
const MEDIA_FIELDS = ["id", "path", "filename", "contentType", "size", "width", "height", "alt", "title", "description", "provenance"];
const IMAGE_FIELDS = ["focus", "variants[].size", "variants[].width", "variants[].height", "variants[].format", "variants[].path", "variants[].crop"];
const PUBLIC_READS = ["pages.read", "settings.read", "media.read"];

function authzConfig(options: { model?: PresetContentModel; features: readonly Feature[]; roles?: Record<string, unknown> }): Record<string, unknown> {
  const modules = presetModuleConfig({
    dataDir: DATA_DIR,
    blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(DATA_DIR, "blobs") } },
    model: options.model ?? contentModel,
    features: options.features,
    fieldTypes,
    roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "settings.read", "media.read"], ...options.roles },
    bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    ...(options.features.includes("migrations") ? { migrations: { migrations: [] } } : {}),
  });
  const entry = modules.find((candidate) => candidate.use === "@michaelthielemann/kestrel-authz-roles");
  const config = entry === undefined ? undefined : effectiveModuleConfig(entry);
  if (typeof config !== "object" || config === null) throw new Error("expected an authz-roles entry");
  return Object.fromEntries(Object.entries(config));
}

describe("the anonymous field grants presetModuleConfig derives", () => {
  it("grants the playground's anonymously readable model fields, the public media fields, the file headers and the redirect rules", () => {
    expect(authzConfig({ features: ["delivery", "sanitizeSvg", "images", "redirects"] }).anonymousFields).toEqual({
      settings: ["id", "title", "titlePosition", "titleSeparator", "description", "navigation", "_locales", "_translations", "_links"],
      pages: ["id", "slug", "title", "body", "seo", "status", "shareImage", "accent", "layout", "_locales", "_translations", "_locale", "_links", "redirect", "_paths", "route.type"],
      media: [...MEDIA_FIELDS, ...IMAGE_FIELDS],
      mediaFile: ["headers.cache-control", "headers.x-content-provenance", "headers.x-kestrel-variant"],
      redirectRules: ["from", "pattern", "target", "status"],
    });
  });

  it("drops the variant fields and the variant header without images, and every redirect grant without redirects", () => {
    const grants = anonymousFieldGrants(contentModel, [], PUBLIC_READS);
    expect(grants.media).toEqual(MEDIA_FIELDS);
    expect(grants.mediaFile).toEqual(["headers.cache-control", "headers.x-content-provenance"]);
    expect(grants.pages).not.toContain("redirect");
    expect(Object.keys(grants).sort()).toEqual(["media", "mediaFile", "pages", "settings"]);
  });

  it("never grants a blockAliases field, on pages or on any other collection", () => {
    const types: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { slug: { type: "slug" }, title: { type: "text" }, body: { type: "json" }, blockAliases: { type: "json" }, status: { type: "enum", options: ["draft", "published"] } } },
      news: { kind: "multi", fields: { title: { type: "text" }, body: { type: "json" }, blockAliases: { type: "json" } } },
    };
    const grants = anonymousFieldGrants({ types }, ["redirects"], ["*"]);
    expect(grants.pages).not.toContain("blockAliases");
    expect(grants.news).not.toContain("blockAliases");
  });

  it("grants no locale members for a model without locales, but keeps the resolved links", () => {
    const types: Record<string, CollectionModel> = {
      settings: { kind: "single", fields: { title: { type: "text" } } },
      pages: { kind: "multi", fields: { slug: { type: "slug" }, title: { type: "text" }, body: { type: "json" }, status: { type: "enum", options: ["draft", "published"] } } },
    };
    const grants = anonymousFieldGrants({ types }, ["redirects"], PUBLIC_READS);
    expect(grants.settings).toEqual(["id", "title", "_links"]);
    expect(grants.pages).toEqual(["id", "slug", "title", "body", "status", "_links", "redirect", "_paths"]);
  });

  it("grants every generic collection its model fields, with the locale members when the model has locales", () => {
    const grants = anonymousFieldGrants({ locales: ["de", "en"], types: syntheticContentTypes }, ["redirects"], ["*"]);
    expect(grants.news).toEqual(["id", "title", "body", "status", "_locales", "_translations"]);
    expect(grants.profile).toEqual(["id", "bio", "_locales", "_translations"]);
    expect(grants.notifications).toEqual(["id", "emailDigest", "_locales", "_translations"]);
    expect(anonymousFieldGrants({ types: syntheticContentTypes }, [], ["news.read"]).news).toEqual(["id", "title", "body", "status"]);
  });

  it("grants only the resources whose read permission anonymous callers hold, matching wildcards as authz-roles does", () => {
    const model = { locales: ["de", "en"], types: syntheticContentTypes };
    expect(Object.keys(anonymousFieldGrants(model, ["redirects", "images"], ["pages.read", "media.read"])).sort()).toEqual(["media", "mediaFile", "pages", "redirectRules"]);
    expect(Object.keys(anonymousFieldGrants(model, ["redirects"], ["news.*", "profile.read"])).sort()).toEqual(["news", "profile", "redirectRules"]);
    expect(Object.keys(anonymousFieldGrants(model, ["redirects"], ["*"])).sort()).toEqual(["media", "mediaFile", "news", "notifications", "pages", "profile", "redirectRules", "redirects", "settings"]);
    expect(anonymousFieldGrants(model, [], [])).toEqual({});
  });

  it("lets roles.anonymousFields replace a derived resource, leave the others alone and drop one with an empty list", () => {
    const config = authzConfig({ features: ["images"], roles: { anonymous: PUBLIC_READS, anonymousFields: { media: ["id", "path"], settings: [] } } });
    const grants = config.anonymousFields;
    expect(grants).toMatchObject({ media: ["id", "path"], mediaFile: ["headers.cache-control", "headers.x-content-provenance", "headers.x-kestrel-variant"] });
    expect(grants).not.toHaveProperty("settings");
    expect(grants).toHaveProperty("pages");
  });

  it("passes roles.fields through and sets no fields key without it", () => {
    const withFields = authzConfig({ features: [], roles: { roles: { admin: ["*"], reviewer: ["pages.read"] }, fields: { reviewer: { pages: ["createdAt"] } } } });
    expect(withFields.fields).toEqual({ reviewer: { pages: ["createdAt"] } });
    expect(authzConfig({ features: [] })).not.toHaveProperty("fields");
  });
});

describe("the grants presetModuleConfig derives from the same pipeline changes as definePreset", () => {
  const types = {
    settings: { kind: "single", fields: { title: { type: "text" } } },
    redirects: { kind: "single", fields: { rules: { type: "json" } } },
    pages: { kind: "multi", fields: { slug: { type: "slug" }, title: { type: "text" }, body: { type: "json" }, status: { type: "enum", options: ["draft", "published"] } } },
    news: { kind: "multi", fields: { title: { type: "text" }, status: { type: "enum", options: ["draft", "published"] } } },
  } satisfies Record<string, CollectionModel>;
  const features: readonly Feature[] = ["redirects", "images"];

  function modulesFor(anonymous: string[], pipelines: PresetPipelineChanges<typeof types> = {}, anonymousFields?: Record<string, string[]>): ModuleEntry[] {
    return presetModuleConfig({
      dataDir: DATA_DIR,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(DATA_DIR, "blobs") } },
      model: { types },
      features,
      roles: { roles: { admin: ["*"] }, anonymous, ...(anonymousFields === undefined ? {} : { anonymousFields }) },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
      pipelines,
    });
  }

  function grantsOf(modules: readonly ModuleEntry[]): Record<string, unknown> {
    const entry = modules.find((candidate) => candidate.use === "@michaelthielemann/kestrel-authz-roles");
    const config = entry === undefined ? undefined : effectiveModuleConfig(entry);
    const grants: unknown = typeof config === "object" && config !== null ? Reflect.get(config, "anonymousFields") : undefined;
    if (typeof grants !== "object" || grants === null) throw new Error("expected anonymousFields");
    return Object.fromEntries(Object.entries(grants));
  }

  it("grants every resource a preset read still cuts", () => {
    expect(Object.keys(grantsOf(modulesFor(["*"]))).sort()).toEqual(["media", "mediaFile", "news", "pages", "redirectRules", "redirects", "settings"]);
  });

  it("grants nothing for a collection whose every read is excluded", () => {
    expect(grantsOf(modulesFor(["*"], { exclude: ["listNews", "readNews"] }))).not.toHaveProperty("news");
  });

  it("grants nothing for a collection whose every read is overridden without the cut", () => {
    const pipelines: PresetPipelineChanges<typeof types> = {
      overrides: { listNews: ["authn.requireUser", "authz.require:news.read", "content.list:news"], readNews: ["authn.requireUser", "authz.require:news.read", "content.get:news"] },
    };
    expect(grantsOf(modulesFor(["*"], pipelines))).not.toHaveProperty("news");
  });

  it("keeps the grant while one read still ends with its cut, overridden or not", () => {
    expect(grantsOf(modulesFor(["*"], { exclude: ["listNews"] }))).toHaveProperty("news");
    const changes: PresetPipelineChanges<typeof types> = { exclude: ["listNews"], overrides: { readNews: ["authn.identifyUser", "authz.require:news.read", "content.get:news", "authz.fields:news?shape=item"] } };
    expect(grantsOf(modulesFor(["*"], changes))).toHaveProperty("news");
  });

  it("grants nothing for redirects without getRedirects, and nothing for media files without a file route", () => {
    const grants = grantsOf(modulesFor(["*"], { exclude: ["getRedirects", "downloadMedia", "serveMediaFile", "serveImageVariant"] }));
    expect(grants).not.toHaveProperty("redirects");
    expect(grants).not.toHaveProperty("mediaFile");
    expect(grants).toHaveProperty("media");
  });

  it("counts serveImageVariant only with the images feature", () => {
    const modules = presetModuleConfig({
      dataDir: DATA_DIR,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(DATA_DIR, "blobs") } },
      model: { types },
      features: ["redirects"],
      roles: { roles: { admin: ["*"] }, anonymous: ["*"] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
      pipelines: { exclude: ["downloadMedia", "serveMediaFile"] },
    });
    expect(grantsOf(modules)).not.toHaveProperty("mediaFile");
  });

  it("keeps a grant the consumer named in roles.anonymousFields", () => {
    expect(grantsOf(modulesFor(["*"], { exclude: ["listNews", "readNews"] }, { news: ["id", "title"] }))).toEqual(expect.objectContaining({ news: ["id", "title"] }));
  });

  it("derives the same grants however often it runs, and definePreset leaves them as they are", () => {
    const changes: PresetPipelineChanges<typeof types> = { exclude: ["listNews", "readNews"] };
    const modules = modulesFor(["*"], changes);
    const before = structuredClone(modules);
    expect(modulesFor(["*"], changes)).toEqual(modules);
    definePreset({ modules, features, collections: types });
    definePreset({ modules, features, collections: types, ...changes });
    expect(modules).toEqual(before);
  });
});
