import { describe, expect, it } from "vitest";
import { defineBlockTags, defineCollectionsUi } from "./index";
import type { CollectionModel } from "../pipelines";

describe("defineCollectionsUi", () => {
  it("throws when a label is missing", () => {
    const label = { singular: "n" };
    expect(() => defineCollectionsUi({ news: { label: label as never } })).toThrow(/label/);
  });

  it("throws for an invalid placement value", () => {
    expect(() => defineCollectionsUi({ news: { label: { singular: "n", plural: "n" }, placement: "nowhere" as never } })).toThrow(/placement/);
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
    expect(() => defineBlockTags({ hero: 42 as never })).toThrow(/blockTags\["hero"\]/);
  });

  it("throws when a label is an array", () => {
    expect(() => defineBlockTags({ hero: ["Hero"] as never })).toThrow(/blockTags\["hero"\]/);
  });
});
