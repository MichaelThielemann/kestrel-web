import { describe, expect, it } from "vitest";
import { boundaryCast } from "#kestrel/cast";
import { blockSchema } from "./block-schema";
import { customFieldTypes, defineFieldTypes, fieldTypeSchemas, resolveStorageTypes, stampBlockFieldTypes } from "./field-types";
import type { FieldTypes } from "./field-types";
import type { SerializedBlock } from "./app/types/kestrel";

const color: FieldTypes = { color: { storage: "text", schema: { type: "string", pattern: "^#[0-9a-f]{6}$" }, empty: "#000000" } };

const model = {
  pages: { kind: "multi" as const, fields: { title: { type: "text" }, accent: { type: "color", localized: true }, body: "json" } },
  settings: { kind: "single" as const, fields: { brand: { type: "color" } } },
};

describe("defineFieldTypes", () => {
  it("returns the map it was given", () => {
    expect(defineFieldTypes(color)).toBe(color);
  });

  it.each(["Color", "my-color", "1color", "my_color"])("rejects the name %s", (name) => {
    expect(() => defineFieldTypes({ [name]: { storage: "text", schema: {} } })).toThrow(`field-types: "${name}" must match`);
  });

  it.each(["text", "json", "ref", "choice", "datetime", "repeater"])("rejects the built-in name %s", (name) => {
    expect(() => defineFieldTypes({ [name]: { storage: "text", schema: {} } })).toThrow(`field-types: "${name}" is a built-in field type`);
  });

  it("rejects a storage type content-default does not have", () => {
    const declared = boundaryCast<FieldTypes>({ color: { storage: "datetime", schema: {} } }, "json");
    expect(() => defineFieldTypes(declared)).toThrow('field-types: "color" has storage "datetime"');
  });

  it("rejects a schema that is not an object", () => {
    const declared = boundaryCast<FieldTypes>({ color: { storage: "text", schema: [] } }, "json");
    expect(() => defineFieldTypes(declared)).toThrow('field-types: "color" needs a JSON-schema fragment object');
  });
});

describe("customFieldTypes", () => {
  it("names every collection field of a declared type, including the localized one", () => {
    expect(customFieldTypes(model, color)).toEqual({ pages: { accent: "color" }, settings: { brand: "color" } });
  });

  it("is empty without declared types", () => {
    expect(customFieldTypes(model, {})).toEqual({});
  });
});

describe("resolveStorageTypes", () => {
  it("replaces the declared type by its storage type and keeps the other keys", () => {
    const resolved = resolveStorageTypes(model, color, "presetModuleConfig");
    expect(resolved.pages?.fields.accent).toEqual({ type: "text", localized: true });
    expect(resolved.pages?.fields.title).toEqual({ type: "text" });
    expect(resolved.pages?.fields.body).toBe("json");
  });

  it("throws naming collection and field for a type nobody declared", () => {
    expect(() => resolveStorageTypes(model, {}, "presetModuleConfig")).toThrow(
      'presetModuleConfig: collection field "pages.accent" has unknown field type "color"',
    );
  });
});

describe("fieldTypeSchemas", () => {
  it("emits one inline fragment per collection field of a declared type", () => {
    expect(fieldTypeSchemas(model, color)).toEqual({
      "pages.accent": { type: "string", pattern: "^#[0-9a-f]{6}$" },
      "settings.brand": { type: "string", pattern: "^#[0-9a-f]{6}$" },
    });
  });
});

describe("stampBlockFieldTypes", () => {
  const blocks: SerializedBlock[] = [
    {
      name: "hero",
      fields: {
        heading: { type: "text", required: true, unique: false },
        accent: { type: "color", required: false, unique: false },
        rows: {
          type: "repeater",
          required: false,
          unique: false,
          options: { fields: { tint: { type: "color", required: false, unique: false } } },
        },
      },
    },
  ];

  it("records the storage type's admin component for a declared type, nested rows included", () => {
    const [block] = stampBlockFieldTypes(blocks, color);
    expect(block?.fields.accent?.storageType).toBe("text");
    expect(block?.fields.heading?.storageType).toBeUndefined();
    const nested = block?.fields.rows?.options?.fields;
    expect(nested).toEqual({ tint: { type: "color", required: false, unique: false, storageType: "text" } });
  });
});

describe("blockSchema with declared field types", () => {
  const blocks: SerializedBlock[] = [
    { name: "hero", fields: { accent: { type: "color", required: false, unique: false } } },
    { name: "badge", fields: { accent: { type: "color", required: true, unique: false } } },
  ];

  it("uses the declared fragment instead of the open default branch", () => {
    const schema = blockSchema(blocks, color);
    const defs = boundaryCast<Record<string, { properties: { props: { properties: Record<string, unknown> } } }>>(schema.$defs, "json");
    expect(defs.hero?.properties.props.properties.accent).toEqual({
      anyOf: [{ type: "string", pattern: "^#[0-9a-f]{6}$" }, { type: "null" }],
    });
    expect(defs.badge?.properties.props.properties.accent).toEqual({ type: "string", pattern: "^#[0-9a-f]{6}$" });
  });

  it("stays open when the type is not declared", () => {
    const schema = blockSchema(blocks);
    const defs = boundaryCast<Record<string, { properties: { props: { properties: Record<string, unknown> } } }>>(schema.$defs, "json");
    expect(defs.hero?.properties.props.properties.accent).toEqual({});
  });
});
