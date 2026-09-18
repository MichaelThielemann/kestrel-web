import { describe, expect, it } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { defineBlockTags, defineCollectionsUi, resolveWorkflow } from "./index";
import type { CollectionModel } from "../pipelines";

describe("defineCollectionsUi", () => {
  it("throws when a label is missing", () => {
    const label = { singular: "n" };
    expect(() => defineCollectionsUi({ news: { label: boundaryCast(label, "json") } })).toThrow(/label/);
  });

  it("throws for an invalid placement value", () => {
    expect(() => defineCollectionsUi({ news: { label: { singular: "n", plural: "n" }, placement: boundaryCast("nowhere", "json") } })).toThrow(/placement/);
  });

  it("passes without a collections model", () => {
    expect(() => defineCollectionsUi({ news: { label: { singular: "n", plural: "n" }, placement: "system" } })).not.toThrow();
  });

  it("throws when a multi-kind collection uses placement \"system\"", () => {
    const collections: Record<string, CollectionModel> = { news: { kind: "multi", fields: { title: {} } } };
    expect(() => defineCollectionsUi({ news: { label: { singular: "n", plural: "n" }, placement: "system" } }, collections)).toThrow(
      /"news".*"multi".*"system"/,
    );
  });

  it("throws when a multi-kind collection uses placement \"account\"", () => {
    const collections: Record<string, CollectionModel> = { news: { kind: "multi", fields: { title: {} } } };
    expect(() => defineCollectionsUi({ news: { label: { singular: "n", plural: "n" }, placement: "account" } }, collections)).toThrow(
      /"news".*"multi".*"account"/,
    );
  });

  it("allows a single-kind collection to use placement \"system\"", () => {
    const collections: Record<string, CollectionModel> = { profile: { kind: "single", fields: { bio: {} } } };
    expect(() => defineCollectionsUi({ profile: { label: { singular: "p", plural: "p" }, placement: "system" } }, collections)).not.toThrow();
  });

  it("allows a multi-kind collection to use the default rail placement", () => {
    const collections: Record<string, CollectionModel> = { news: { kind: "multi", fields: { title: {} } } };
    expect(() => defineCollectionsUi({ news: { label: { singular: "n", plural: "n" } } }, collections)).not.toThrow();
  });
});

describe("defineBlockTags", () => {
  it("passes through a map of plain strings and locale maps", () => {
    const map = { hero: "Hero", marketing: { en: "Marketing", de: "Marketing" } };
    expect(defineBlockTags(map)).toBe(map);
  });

  it("passes through an empty map", () => {
    expect(defineBlockTags({})).toEqual({});
  });

  it("throws when a label is neither a string nor a locale map", () => {
    expect(() => defineBlockTags({ hero: boundaryCast(42, "json") })).toThrow(/blockTags\["hero"\]/);
  });

  it("throws when a label is an array", () => {
    expect(() => defineBlockTags({ hero: boundaryCast(["Hero"], "json") })).toThrow(/blockTags\["hero"\]/);
  });
});

describe("defineCollectionsUi workflow validation", () => {
  const label = { singular: "n", plural: "n" };
  const collections: Record<string, CollectionModel> = {
    news: { kind: "multi", fields: { title: { type: "text" }, state: { type: "enum", options: ["entwurf", "live"] }, flag: { type: "boolean" } } },
  };

  it("accepts a workflow whose values are options of an enum field", () => {
    expect(() => defineCollectionsUi({ news: { label, workflow: { field: "state", live: "live", draft: "entwurf" } } }, collections)).not.toThrow();
  });

  it("throws naming collection and field when the field is missing from the model", () => {
    expect(() => defineCollectionsUi({ news: { label, workflow: { field: "nope", live: "live", draft: "entwurf" } } }, collections)).toThrow(
      /"news".*"nope"/,
    );
  });

  it("throws naming collection and field when the field is not an enum", () => {
    expect(() => defineCollectionsUi({ news: { label, workflow: { field: "flag", live: "live", draft: "entwurf" } } }, collections)).toThrow(
      /"news".*"flag".*"enum"/,
    );
  });

  it("throws when live is not one of the field options", () => {
    expect(() => defineCollectionsUi({ news: { label, workflow: { field: "state", live: "public", draft: "entwurf" } } }, collections)).toThrow(
      /"news".*"public".*"state"/,
    );
  });

  it("throws when done is set but not one of the field options", () => {
    expect(() =>
      defineCollectionsUi({ news: { label, workflow: { field: "state", live: "live", draft: "entwurf", done: "fertig" } } }, collections),
    ).toThrow(/"news".*"fertig".*"state"/);
  });

  it("throws when a workflow is declared but no content types were passed", () => {
    expect(() => defineCollectionsUi({ news: { label, workflow: { field: "state", live: "live", draft: "entwurf" } } })).toThrow(
      /"news".*second argument/,
    );
  });

  it("throws when the content types have no entry for the collection", () => {
    expect(() => defineCollectionsUi({ blog: { label, workflow: { field: "state", live: "live", draft: "entwurf" } } }, collections)).toThrow(
      /"blog".*content types/,
    );
  });
});

describe("resolveWorkflow", () => {
  it("returns the declared workflow unchanged", () => {
    const workflow = { field: "state", live: "live", draft: "entwurf" };
    expect(resolveWorkflow("news", { fields: { state: { type: "enum", options: ["entwurf", "live"] } } }, { workflow })).toBe(workflow);
  });

  it("returns undefined without a status field", () => {
    expect(resolveWorkflow("news", { fields: { title: { type: "text" } } })).toBeUndefined();
  });

  it("derives the conventional default from a status enum carrying the reserved options", () => {
    expect(resolveWorkflow("pages", { fields: { status: { type: "enum", options: ["draft", "finished", "published"] } } })).toEqual({
      field: "status",
      live: "published",
      draft: "draft",
      done: "finished",
    });
  });

  it("omits done when the status options lack it", () => {
    expect(resolveWorkflow("pages", { fields: { status: { type: "enum", options: ["draft", "published"] } } })).toEqual({
      field: "status",
      live: "published",
      draft: "draft",
    });
  });

  it("returns undefined when the status options miss draft or published", () => {
    expect(resolveWorkflow("pages", { fields: { status: { type: "enum", options: ["entwurf", "live"] } } })).toBeUndefined();
  });

  it("falls back to the conventional default for a status field without options", () => {
    expect(resolveWorkflow("pages", { fields: { status: {} } })).toEqual({ field: "status", live: "published", draft: "draft", done: "finished" });
  });
});
