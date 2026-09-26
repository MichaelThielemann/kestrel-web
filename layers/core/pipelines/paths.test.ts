import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset, collectionVerbs, definePreset, presetModuleConfig } from "./index";
import type { CollectionModel, Feature } from "./index";

const pages: CollectionModel = { kind: "multi", fields: { slug: { type: "slug", localized: true }, title: { localized: true }, body: { localized: true }, status: { localized: true } } };

const modules = [
  { use: "@michaelthielemann/kestrel-authn-multi" },
  { use: "@michaelthielemann/kestrel-authz-roles" },
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x", "redirects.rules": "y" } } },
  { use: "@michaelthielemann/kestrel-media-default" },
  { use: "@michaelthielemann/kestrel-references-default" },
  { use: "@michaelthielemann/kestrel-links-default" },
  { use: "@michaelthielemann/kestrel-revisions-default" },
  { use: "@michaelthielemann/kestrel-delivery-static" },
  { use: "@michaelthielemann/kestrel-renderer-nuxt" },
  { use: "@michaelthielemann/kestrel-redirects-default" },
  { use: "@michaelthielemann/kestrel-migrations-default" },
  { use: "@michaelthielemann/kestrel-events-inmemory" },
];

const direct = [...modules, { use: "@michaelthielemann/kestrel-events-direct" }];
const queued = [...modules.map((entry) => (entry.use.endsWith("delivery-static") ? { ...entry, config: { dependencies: { render: "events" } } } : entry)), { use: "@michaelthielemann/kestrel-events-queue", config: { lanes: { pages: ["republishOutput", "refreshLlms"] } } }];
const features: Feature[] = ["references", "links", "revisions", "delivery", "redirects", "migrations"];

function stepsOf(preset: { pipelines: { name: string; steps: readonly PipelineEntry[] }[] }, name: string): readonly PipelineEntry[] | undefined {
  return preset.pipelines.find((pipeline) => pipeline.name === name)?.steps;
}

describe("path index wiring of page writes", () => {
  const preset = definePreset({ modules: direct, features, collections: { pages } });

  it("ends every page write's atomic group with the path index and announces right after it", () => {
    expect(stepsOf(preset, "createPage")).toEqual([
      "authn.requireUser",
      "authz.require:pages.write",
      "validate.check:pages.body",
      "validate.sanitize:pages.body",
      "validate.check:pages.body",
      { atomic: ["references.check:pages", "content.create:pages", "revisions.record:pages", "references.index:pages", "links.extract:pages", "site.indexPath:pages"] },
      "site.announcePaths",
      "events.emit:page.created",
      "events.relay",
    ]);
    expect(stepsOf(preset, "deletePage")).toEqual([
      "authn.requireUser",
      "authz.require:pages.delete",
      { atomic: ["references.guard:pages", "content.remove:pages", "revisions.remove:pages", "references.unindex:pages", "links.unextract:pages", "site.indexPath:pages"] },
      "site.announcePaths",
      "events.emit:page.deleted",
      "events.relay",
    ]);
    expect(stepsOf(preset, "deletePageTranslation")).toEqual([
      "authn.requireUser",
      "authz.require:pages.write",
      { atomic: ["content.removeTranslation:pages", "revisions.removeTranslation:pages", "references.index:pages", "links.extract:pages", "site.indexPath:pages"] },
      "site.announcePaths",
      "events.emit:page.translationRemoved",
      "events.relay",
    ]);
  });

  it("gives a revision restore the same index and announcement as the update it reuses", () => {
    expect(stepsOf(preset, "restorePageRevision")).toEqual([
      "authn.requireUser",
      "authz.require:pages.write",
      "revisions.restore:pages",
      "validate.check:pages.body",
      "validate.sanitize:pages.body",
      "validate.check:pages.body",
      { atomic: ["references.check:pages", "content.update:pages", "revisions.record:pages", "references.index:pages", "links.extract:pages", "site.indexPath:pages"] },
      "site.announcePaths",
      "revisions.reportRestore",
      "events.emit:page.restored",
      "events.relay",
    ]);
  });

  it("no longer checks a page slug against reserved segments before the write", () => {
    expect(stepsOf(preset, "updatePage")).not.toContain("validate.check:pages.slug");
  });

  it("keeps the index last with the queue, folding the emit in before it and relaying after the announcement", () => {
    const withQueue = definePreset({ modules: queued, features: [...features, "eventsQueue"], collections: { pages } });
    expect(stepsOf(withQueue, "updatePage")).toEqual([
      "authn.requireUser",
      "authz.require:pages.write",
      "validate.check:pages.body",
      "validate.sanitize:pages.body",
      "validate.check:pages.body",
      { atomic: ["references.check:pages", "content.update:pages", "revisions.record:pages", "references.index:pages", "links.extract:pages", "events.emit:page.updated", "site.indexPath:pages"] },
      "site.announcePaths",
      "events.relay",
    ]);
  });
});

describe("path reads", () => {
  const preset = definePreset({ modules: direct, features, collections: { pages } });

  it("adds reachable paths to the public list and read before the field cut", () => {
    expect(stepsOf(preset, "listPages")).toEqual(["authn.identifyUser", "authz.require:pages.read", "content.list:pages?status=published", "site.attachPaths:pages?reachable", "authz.fields:pages?shape=list"]);
    expect(stepsOf(preset, "readPage")).toEqual(["authn.identifyUser", "authz.require:pages.read", "content.get:pages?status=published", "site.attachPaths:pages?reachable", "authz.fields:pages?shape=item"]);
  });

  it("adds every valid path, drafts included, to the admin list and read", () => {
    expect(stepsOf(preset, "listAllPages")).toEqual(["authn.requireUser", "authz.require:pages.manage", "content.list:pages", "site.attachPaths:pages"]);
    expect(stepsOf(preset, "readAnyPage")).toEqual(["authn.requireUser", "authz.require:pages.manage", "content.get:pages", "site.attachPaths:pages"]);
  });
});

describe("path pipelines", () => {
  it("composes the preview, the rebuild and the resume cron with a pages collection", () => {
    const preset = definePreset({ modules: direct, features: [], collections: { pages } });
    expect(stepsOf(preset, "previewPagePath")).toEqual(["authn.requireUser", "authz.require:pages.write", "site.previewPath:pages"]);
    expect(stepsOf(preset, "rebuildPaths")).toEqual(["authn.requireUser", "authz.require:system.manage", "site.planRebuild", { atomic: ["site.applyRebuild"] }, "site.announcePaths"]);
    expect(stepsOf(preset, "resumePaths")).toEqual(["site.resumePaths"]);
    expect(preset.triggers).toContainEqual({ http: "POST /admin/pages/path-preview", pipeline: "previewPagePath" });
    expect(preset.triggers).toContainEqual({ http: "POST /admin/paths/rebuild", pipeline: "rebuildPaths" });
    expect(preset.triggers).toContainEqual({ cron: "* * * * *", pipeline: "resumePaths" });
  });

  it("feeds moved paths to automatic redirects and to re-renders, and rebuilds after migrations", () => {
    const preset = definePreset({ modules: direct, features, collections: { pages } });
    expect(stepsOf(preset, "pathsMovedRedirects")).toEqual(["redirects.recordMoves", "redirects.export"]);
    expect(stepsOf(preset, "pathsMovedDelivery")).toEqual(["delivery.markMoved"]);
    expect(stepsOf(preset, "listAutoRedirects")).toEqual(["authn.requireUser", "authz.require:redirects.read", "redirects.listAuto"]);
    expect(stepsOf(preset, "removeAutoRedirect")).toEqual(["authn.requireUser", "authz.require:redirects.write", "redirects.removeAuto", "redirects.export"]);
    expect(stepsOf(preset, "rebuildPathsAfterMigrations")).toEqual(["site.planRebuild", { atomic: ["site.applyRebuild"] }, "site.announcePaths"]);
    expect(preset.triggers).toContainEqual({ event: "site.pathsMoved", pipeline: "pathsMovedRedirects" });
    expect(preset.triggers).toContainEqual({ event: "site.pathsMoved", pipeline: "pathsMovedDelivery" });
    expect(preset.triggers).toContainEqual({ event: "migrations.applied", pipeline: "rebuildPathsAfterMigrations" });
    expect(preset.triggers).toContainEqual({ http: "GET /admin/redirects/auto", pipeline: "listAutoRedirects" });
    expect(preset.triggers).toContainEqual({ http: "DELETE /admin/redirects/auto/*path", pipeline: "removeAutoRedirect" });
  });

  it("composes no path pipeline without a pages collection", () => {
    const news: CollectionModel = { kind: "multi", fields: { title: {} } };
    const preset = definePreset({ modules: direct.filter((entry) => !entry.use.includes("delivery") && !entry.use.includes("renderer")), features: ["migrations"], collections: { news } });
    const names = preset.pipelines.map((pipeline) => pipeline.name);
    for (const name of ["previewPagePath", "rebuildPaths", "resumePaths", "rebuildPathsAfterMigrations", "pathsMovedRedirects", "listAutoRedirects"]) expect(names).not.toContain(name);
    expect(preset.triggers.some((trigger) => trigger.pipeline === "resumePaths")).toBe(false);
  });

  it("lets a consumer reschedule the resume cron", () => {
    const preset = definePreset({ modules: direct, features: [], collections: { pages }, schedules: { resumePaths: "*/2 * * * *" } });
    expect(preset.triggers).toContainEqual({ cron: "*/2 * * * *", pipeline: "resumePaths" });
  });
});

describe("routed slug uniqueness", () => {
  const nested: CollectionModel = { kind: "multi", fields: { ...pages.fields, parent: { type: "ref", to: "pages" } } };
  const unique = { type: "slug", unique: true, localized: true };

  it("reports a unique slug on pages with subpages, whose full path is what must be unique", () => {
    const { problems } = checkPreset({ modules: direct, features: [], collections: { pages: { ...nested, fields: { ...nested.fields, slug: unique } } } });
    expect(problems).toContainEqual(expect.objectContaining({ code: "preset/routed-slug-unique" }));
  });

  it("leaves a unique slug on flat pages to site-default's warning and the upgrade tool", () => {
    const { problems } = checkPreset({ modules: direct, features: [], collections: { pages: { ...pages, fields: { ...pages.fields, slug: unique } } } });
    expect(problems.filter((problem) => problem.code === "preset/routed-slug-unique")).toEqual([]);
  });

  it("reports nothing for a slug without unique", () => {
    const { problems } = checkPreset({ modules: direct, features: [], collections: { pages: nested } });
    expect(problems.filter((problem) => problem.code === "preset/routed-slug-unique")).toEqual([]);
  });
});

describe("subpages", () => {
  const nested: CollectionModel = { kind: "multi", fields: { ...pages.fields, parent: { type: "ref", to: "pages" } } };

  it("composes the page tree for pages with a parent field, behind pages.manage", () => {
    const preset = definePreset({ modules: direct, features: [], collections: { pages: nested } });
    expect(stepsOf(preset, "pageTree")).toEqual(["authn.requireUser", "authz.require:pages.manage", "site.readTree:pages"]);
    expect(preset.triggers).toContainEqual({ http: "GET /admin/pages/tree", pipeline: "pageTree" });
  });

  it("composes no page tree for flat pages", () => {
    const preset = definePreset({ modules: direct, features: [], collections: { pages } });
    expect(stepsOf(preset, "pageTree")).toBeUndefined();
    expect(preset.triggers.some((trigger) => trigger.pipeline === "pageTree")).toBe(false);
  });

  it("names the tree as the pages' tree verb only with a parent field", () => {
    expect(collectionVerbs("pages", nested).tree).toBe("pageTree");
    expect(collectionVerbs("pages", pages).tree).toBeUndefined();
  });

  it("routes pages through their parent field and never grants the parent to anonymous callers", () => {
    const modules = presetModuleConfig({
      dataDir: "/srv/data",
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: "/srv/data/blobs" } },
      model: { locales: ["de", "en"], defaultLocale: "de", types: { pages: nested } },
      features: [],
      roles: { roles: { admin: ["*"] }, anonymous: ["pages.read"] },
      bootstrap: { username: "admin", passwordHash: "x" },
    });
    const site = modules.find((entry) => entry.use === "@michaelthielemann/kestrel-site-default")?.config;
    expect(site).toMatchObject({ routes: { pages: { parentField: "parent" } } });
    const authz = modules.find((entry) => entry.use === "@michaelthielemann/kestrel-authz-roles")?.config;
    const fields: unknown = typeof authz === "object" && authz !== null ? Reflect.get(authz, "anonymousFields") : undefined;
    const grant: unknown = typeof fields === "object" && fields !== null ? Reflect.get(fields, "pages") : undefined;
    expect(grant).toContain("_paths");
    expect(grant).not.toContain("parent");
  });

  it("does not treat a localized parent reference as a parent field", () => {
    const localized: CollectionModel = { kind: "multi", fields: { ...pages.fields, parent: { type: "ref", to: "pages", localized: true } } };
    expect(collectionVerbs("pages", localized).tree).toBeUndefined();
  });
});

describe("mounted collections", () => {
  const settings: CollectionModel = { kind: "single", fields: { title: { type: "text" } } };
  const blog: CollectionModel = { kind: "multi", mount: true, fields: { slug: { type: "slug", localized: true }, title: { localized: true }, body: { localized: true }, status: { localized: true } } };
  const collections = { settings, pages, blog };
  const withAuthz = direct.map((entry) => (entry.use.endsWith("authz-roles") ? { ...entry, config: { anonymous: ["pages.read", "blog.read"] } } : entry));
  const preset = definePreset({ modules: withAuthz, features, collections });

  it("indexes a mounted collection's writes and adds _paths to its reads like pages", () => {
    expect(stepsOf(preset, "createBlog")).toEqual([
      "authn.requireUser",
      "authz.require:blog.write",
      "validate.check:blog.body",
      "validate.sanitize:blog.body",
      "validate.check:blog.body",
      { atomic: ["references.check:blog", "content.create:blog", "revisions.record:blog", "references.index:blog", "links.extract:blog", "site.indexPath:blog"] },
      "site.announcePaths",
      "events.emit:blog.created",
      "events.relay",
    ]);
    expect(stepsOf(preset, "listBlog")).toEqual(["authn.identifyUser", "authz.require:blog.read", "content.list:blog?status=published", "site.attachPaths:blog?reachable", "authz.fields:blog?shape=list"]);
  });

  it("gives it a public resolve route, a path preview, delivery and referrers of its own", () => {
    expect(stepsOf(preset, "resolveBlog")).toEqual(["authn.identifyUser", "authz.require:blog.read", "site.resolve:blog?status=published&fallback=true", "site.resolveLinks:blog?status=published&fallback=true", "authz.fields:blog?shape=item"]);
    expect(stepsOf(preset, "previewBlogPath")).toEqual(["authn.requireUser", "authz.require:blog.write", "site.previewPath:blog"]);
    expect(stepsOf(preset, "publishBlog")).toEqual(["delivery.publish:blog", "delivery.requestLlms"]);
    expect(stepsOf(preset, "unpublishBlog")).toEqual(["delivery.unpublish:blog", "delivery.requestLlms"]);
    expect(stepsOf(preset, "blogPublishStatus")).toEqual(["authn.requireUser", "authz.require:blog.manage", "delivery.readStatus:blog"]);
    expect(stepsOf(preset, "blogReferrers")).toEqual(["authn.requireUser", "authz.require:blog.manage", "references.referrers:blog"]);
    for (const trigger of [
      { http: "GET /routes/blog/*path", pipeline: "resolveBlog" },
      { http: "POST /admin/blog/path-preview", pipeline: "previewBlogPath" },
      { http: "GET /admin/publish-status/blog/:id", pipeline: "blogPublishStatus" },
      { event: "blog.updated", pipeline: "publishBlog" },
      { event: "blog.deleted", pipeline: "unpublishBlog" },
    ]) expect(preset.triggers).toContainEqual(trigger);
    expect(collectionVerbs("blog", blog)).toMatchObject({ publishStatus: "blogPublishStatus", referrers: "blogReferrers", previewPath: "previewBlogPath" });
  });

  it("hands a page path that belongs to a mounted collection on with a route hint, after the redirect lookup", () => {
    expect(stepsOf(preset, "resolvePage")).toEqual([
      "authn.identifyUser",
      "authz.require:pages.read",
      "redirects.lookup",
      "site.route:pages?home=home&status=published&fallback=true",
      "site.resolve:pages?home=home&status=published&fallback=true",
      "site.resolveLinks:pages?home=home&status=published&fallback=true",
      "authz.fields:pages?shape=item",
    ]);
  });

  it("checks the mount assignment and moves the collection inside the settings write", () => {
    expect(stepsOf(preset, "setSettings")).toEqual([
      "authn.requireUser",
      "authz.require:settings.write",
      "validate.check:settings.navigation",
      "validate.check:settings.mounts",
      { atomic: ["content.set:settings", "site.indexMounts"] },
      "site.announcePaths",
      "events.emit:settings.updated",
      "events.relay",
    ]);
  });

  it("configures site-default and content-default for the mount", () => {
    const modules = presetModuleConfig({
      dataDir: "/srv/data",
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: "/srv/data/blobs" } },
      model: { locales: ["de", "en"], defaultLocale: "de", types: collections },
      features: [],
      roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "blog.read"] },
      bootstrap: { username: "admin", passwordHash: "x" },
    });
    const site = modules.find((entry) => entry.use === "@michaelthielemann/kestrel-site-default")?.config;
    expect(site).toMatchObject({ routes: { blog: { mount: true, home: "-", liveWhen: { status: "published" } } }, mounts: { type: "settings", field: "mounts" } });
    const content = modules.find((entry) => entry.use === "@michaelthielemann/kestrel-content-default")?.config;
    expect(content).toMatchObject({ types: { settings: { fields: { mounts: { type: "json" } } } } });
    expect(content).not.toMatchObject({ types: { blog: { mount: true } } });
    const validate = modules.find((entry) => entry.use === "@michaelthielemann/kestrel-validate-jsonschema")?.config;
    expect(validate).toMatchObject({ schemas: { "settings.mounts": { type: ["object", "null"], properties: { blog: { type: ["string", "null"] } }, additionalProperties: false } } });
  });

  it("requires anonymous callers to read every routed collection", () => {
    const { problems } = checkPreset({ modules: direct.map((entry) => (entry.use.endsWith("authz-roles") ? { ...entry, config: { anonymous: ["pages.read"] } } : entry)), features: [], collections });
    expect(problems).toContainEqual(expect.objectContaining({ code: "preset/routed-read" }));
  });

  it("refuses a mounted single collection and reserves the name routes", () => {
    const { problems } = checkPreset({ modules: direct, features: [], collections: { settings, pages, notes: { kind: "single", mount: true, fields: {} }, routes: { kind: "multi", fields: {} } } });
    expect(problems).toContainEqual(expect.objectContaining({ code: "preset/mount-invalid" }));
    expect(problems).toContainEqual(expect.objectContaining({ code: "preset/collection-name-reserved" }));
  });
});

describe("the home slug in both places", () => {
  it("reports a definePreset homeSlug that differs from site-default's route", () => {
    const withSite = [...direct, { use: "@michaelthielemann/kestrel-site-default", config: { routes: { pages: { home: "home" } } } }];
    expect(checkPreset({ modules: withSite, features: [], collections: { pages }, homeSlug: "start" }).problems).toContainEqual(expect.objectContaining({ code: "preset/home-slug" }));
    expect(checkPreset({ modules: withSite, features: [], collections: { pages }, homeSlug: "home" }).problems.filter((p) => p.code === "preset/home-slug")).toEqual([]);
  });
});

describe("re-rendering everything", () => {
  it("marks every mounted collection's outputs too, before the redirect export", () => {
    const settings: CollectionModel = { kind: "single", fields: { title: {} } };
    const blog: CollectionModel = { kind: "multi", mount: true, fields: { slug: { type: "slug" }, title: {}, status: {} } };
    const withAuthz = direct.map((entry) => (entry.use.endsWith("authz-roles") ? { ...entry, config: { anonymous: ["pages.read", "blog.read"] } } : entry));
    const preset = definePreset({ modules: withAuthz, features, collections: { settings, pages, blog } });
    expect(stepsOf(preset, "publishAllPages")).toEqual(["authn.requireUser", "authz.require:pages.manage", "delivery.markAll:pages", "delivery.markAll:blog", "redirects.export"]);
  });
});

describe("the pages workflow in resolvePage", () => {
  it("resolves pages with the workflow's live status, the same one site-default's liveWhen gets", () => {
    const state: CollectionModel = { kind: "multi", fields: { slug: { type: "slug" }, title: {}, body: {}, state: { type: "enum", options: ["hidden", "listed"] } } };
    const ui = { pages: { workflow: { field: "state", live: "listed", draft: "hidden" } } };
    const preset = definePreset({ modules: direct, features: ["redirects"], collections: { pages: state }, collectionsUi: ui });
    expect(stepsOf(preset, "resolvePage")).toContain("site.resolve:pages?home=home&state=listed&fallback=true");
    expect(stepsOf(preset, "resolvePage")?.[2]).toBe("redirects.lookup");
  });
});
