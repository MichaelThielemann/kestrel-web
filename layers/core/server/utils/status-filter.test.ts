import { describe, expect, it } from "vitest";
import { definePreset } from "#kestrel/pipelines";
import type { CollectionModel } from "#kestrel/pipelines";
import { contentCollections, statusFilterFailure, statusFilterProblems, type PipelineShape } from "./status-filter";

const baseModules = [{ use: "@michaelthielemann/kestrel-content-default" }];

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
    ]);
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

  it("ignores single collections and the hardcoded ones", () => {
    const single: Record<string, CollectionModel> = { profile: { kind: "single", fields: { status: { type: "enum", options: ["draft", "published"] } } } };
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
