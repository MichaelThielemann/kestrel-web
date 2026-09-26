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
    expect(authz).toMatchObject({ anonymousFields: { pages: expect.not.arrayContaining(["parent"]) } });
    expect(authz).toMatchObject({ anonymousFields: { pages: expect.arrayContaining(["_paths"]) } });
  });

  it("does not treat a localized parent reference as a parent field", () => {
    const localized: CollectionModel = { kind: "multi", fields: { ...pages.fields, parent: { type: "ref", to: "pages", localized: true } } };
    expect(collectionVerbs("pages", localized).tree).toBeUndefined();
  });
});
