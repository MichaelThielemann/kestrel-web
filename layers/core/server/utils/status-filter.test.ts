import { describe, expect, it } from "vitest";
import { definePreset } from "#kestrel/pipelines";
import type { CollectionModel } from "#kestrel/pipelines";
import { contentCollections, statusFilterFailure, statusFilterProblems, type PipelineShape } from "./status-filter";

const baseModules = [
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-events-inmemory" },
  { use: "@michaelthielemann/kestrel-events-direct" },
];

const news: Record<string, CollectionModel> = {
  news: { kind: "multi", fields: { title: { type: "text" }, status: { type: "enum", options: ["entwurf", "live"] } } },
};

const workflowUi = { news: { workflow: { field: "status", live: "live", draft: "entwurf" } } };

function shapes(collections: Record<string, CollectionModel>, collectionsUi?: typeof workflowUi): PipelineShape[] {
  const preset = definePreset({ modules: baseModules, features: [], collections, ...(collectionsUi ? { collectionsUi } : {}) });
  return preset.pipelines.map((pipeline) => ({ name: pipeline.name, steps: pipeline.steps }));
}

describe("contentCollections", () => {
  it("reads the kind and fields of every declared type", () => {
    expect(contentCollections({ types: { news: { kind: "multi", fields: { title: {} } } } })).toEqual({
      news: { kind: "multi", fields: { title: {} } },
    });
  });

  it("treats anything but an explicit single as multi", () => {
    expect(contentCollections({ types: { a: { kind: "single", fields: {} }, b: { fields: {} } } })).toEqual({
      a: { kind: "single", fields: {} },
      b: { kind: "multi", fields: {} },
    });
  });

  it("answers with nothing for a config that declares no types", () => {
    expect(contentCollections(undefined)).toEqual({});
    expect(contentCollections({ types: "nope" })).toEqual({});
    expect(contentCollections({ types: { news: { kind: "multi" } } })).toEqual({});
  });
});

describe("statusFilterProblems", () => {
  it("passes when the preset was built from the same collection UI", () => {
    expect(statusFilterProblems(news, workflowUi, shapes(news, workflowUi))).toEqual([]);
  });

  it("passes when neither the model nor the UI resolves a workflow", () => {
    expect(statusFilterProblems(news, {}, shapes(news))).toEqual([]);
  });

  it("reports the unfiltered pipelines when the collection UI never reached the preset", () => {
    const problems = statusFilterProblems(news, workflowUi, shapes(news));
    expect(problems).toEqual([
      { collection: "news", pipeline: "listNews", expected: "content.list:news?status=live", actual: "content.list:news" },
      { collection: "news", pipeline: "readNews", expected: "content.get:news?status=live", actual: "content.get:news" },
    ]);
  });

  it("reports a filter left over from a workflow that was renamed", () => {
    const pages: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { title: { type: "text" }, status: { type: "enum", options: ["draft", "finished", "published"] } } },
    };
    const renamed = { pages: { workflow: { field: "status", live: "finished", draft: "draft" } } };
    expect(statusFilterProblems(pages, renamed, shapes(pages))).toEqual([
      { collection: "pages", pipeline: "listPages", expected: "content.list:pages?status=finished", actual: "content.list:pages?status=published" },
      { collection: "pages", pipeline: "readPage", expected: "content.get:pages?status=finished", actual: "content.get:pages?status=published" },
      { collection: "pages", pipeline: "resolvePage", expected: "site.resolve:pages?home=home&status=finished&fallback=true", actual: "site.resolve:pages?home=home&status=published&fallback=true" },
      { collection: "pages", pipeline: "resolvePage", expected: "site.resolveLinks:pages?home=home&status=finished&fallback=true", actual: "site.resolveLinks:pages?home=home&status=published&fallback=true" },
    ]);
  });

  it("passes the resolve pipelines of pages and of a mounted collection that the preset built", () => {
    const routed: Record<string, CollectionModel> = {
      settings: { kind: "single", fields: { title: { type: "text" } } },
      pages: { kind: "multi", fields: { slug: { type: "slug" }, title: { type: "text" }, status: { type: "enum", options: ["draft", "published"] } } },
      blog: { kind: "multi", mount: true, fields: { slug: { type: "slug" }, title: { type: "text" }, status: { type: "enum", options: ["draft", "published"] } } },
    };
    const built = shapes(routed);
    expect(built.some((pipeline) => pipeline.name === "resolveBlog")).toBe(true);
    expect(statusFilterProblems(routed, {}, built)).toEqual([]);
  });

  it("reports a public resolve pipeline that an override left without the workflow filter", () => {
    const pages: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { slug: { type: "slug" }, title: { type: "text" }, status: { type: "enum", options: ["draft", "published"] } } },
    };
    const overridden = shapes(pages).map((pipeline) =>
      pipeline.name === "resolvePage" ? { name: pipeline.name, steps: ["authn.identifyUser", "authz.require:pages.read", "site.resolve:pages?home=home&fallback=true"] } : pipeline,
    );
    expect(statusFilterProblems(pages, {}, overridden)).toEqual([
      { collection: "pages", pipeline: "resolvePage", expected: "site.resolve:pages?home=home&fallback=true&status=published", actual: "site.resolve:pages?home=home&fallback=true" },
    ]);
  });

  it("leaves a resolve behind authn.requireUser unfiltered, as a signed-in preview, but not one behind authn.identifyUser", () => {
    const pages: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { slug: { type: "slug" }, title: { type: "text" }, status: { type: "enum", options: ["draft", "published"] } } },
    };
    const extra: PipelineShape[] = [
      { name: "previewPageDraft", steps: ["authn.requireUser", "authz.require:pages.write", "site.resolve:pages?home=home"] },
      { name: "resolvePageAgain", steps: ["authn.identifyUser", "site.resolve:pages?home=home"] },
    ];
    expect(statusFilterProblems(pages, {}, [...shapes(pages), ...extra]).map((problem) => problem.pipeline)).toEqual(["resolvePageAgain"]);
  });

  it("ignores a pipeline the consumer excluded", () => {
    const withoutList = shapes(news).filter((pipeline) => pipeline.name !== "listNews");
    expect(statusFilterProblems(news, workflowUi, withoutList).map((problem) => problem.pipeline)).toEqual(["readNews"]);
  });

  it("ignores a pipeline whose content step the consumer replaced", () => {
    const overridden = shapes(news).map((pipeline) =>
      pipeline.name === "listNews" ? { name: pipeline.name, steps: ["authn.identifyUser", "content.list:archive"] } : pipeline,
    );
    expect(statusFilterProblems(news, workflowUi, overridden).map((problem) => problem.pipeline)).toEqual(["readNews"]);
  });

  it("passes a single collection with a workflow when the preset built its read pipeline", () => {
    const single: Record<string, CollectionModel> = { profile: { kind: "single", fields: { status: { type: "enum", options: ["draft", "published"] } } } };
    expect(statusFilterProblems(single, {}, shapes(single))).toEqual([]);
  });

  it("reports a single collection's public read pipeline that an override left without the status filter", () => {
    const single: Record<string, CollectionModel> = { profile: { kind: "single", fields: { status: { type: "enum", options: ["draft", "published"] } } } };
    const overridden = shapes(single).map((pipeline) =>
      pipeline.name === "getProfile" ? { name: pipeline.name, steps: ["authn.identifyUser", "authz.require:profile.read", "content.get:profile"] } : pipeline,
    );
    expect(statusFilterProblems(single, {}, overridden)).toEqual([
      { collection: "profile", pipeline: "getProfile", expected: "content.get:profile?status=published", actual: "content.get:profile" },
    ]);
  });

  it("ignores a single collection without a workflow and the hardcoded ones", () => {
    const single: Record<string, CollectionModel> = { profile: { kind: "single", fields: { bio: { type: "text" } } }, settings: { kind: "single", fields: { status: { type: "enum", options: ["draft", "published"] } } } };
    expect(statusFilterProblems(single, {}, shapes(single))).toEqual([]);
  });
});

describe("statusFilterFailure", () => {
  it("stays silent without problems", () => {
    expect(statusFilterFailure([])).toBeUndefined();
  });

  it("names the collection, the expected filter and the fix", () => {
    const message = statusFilterFailure(statusFilterProblems(news, workflowUi, shapes(news))) ?? "";
    expect(message).toContain("news");
    expect(message).toContain("content.list:news?status=live");
    expect(message).toContain("definePreset({ modules, features, collections, collectionsUi })");
  });
});
