import { describe, expect, it } from "vitest";
import { definePreset } from "#kestrel/pipelines";
import type { CollectionModel } from "#kestrel/pipelines";
import { linkCheckFailure, linkCheckProblems } from "./link-checks";

const modules = [{ use: "@michaelthielemann/kestrel-content-default" }, { use: "@michaelthielemann/kestrel-events-inmemory" }, { use: "@michaelthielemann/kestrel-events-direct" }];
const collections: Record<string, CollectionModel> = { news: { kind: "multi", fields: { title: { type: "text" }, cta: { type: "json" } } } };
const collectionsUi = { news: { label: { singular: "News", plural: "News" }, fieldOverrides: { cta: { type: "link" } } } };

function shapes(ui?: typeof collectionsUi) {
  return definePreset({ modules, features: [], collections, ...(ui === undefined ? {} : { collectionsUi: ui }) }).pipelines.map((p) => ({ name: p.name, steps: p.steps }));
}

describe("linkCheckProblems", () => {
  it("passes when the preset got the same collection UI", () => {
    expect(linkCheckProblems(collections, collectionsUi, shapes(collectionsUi))).toEqual([]);
  });

  it("names every write pipeline that does not check a field the collection UI shows as a link", () => {
    expect(linkCheckProblems(collections, collectionsUi, shapes())).toEqual([
      { collection: "news", field: "cta", pipeline: "createNews" },
      { collection: "news", field: "cta", pipeline: "updateNews" },
    ]);
    const message = linkCheckFailure(linkCheckProblems(collections, collectionsUi, shapes())) ?? "";
    expect(message).toContain('"createNews"');
    expect(message).toContain("validate.check:news.cta");
    expect(message).toContain("definePreset");
  });
});
