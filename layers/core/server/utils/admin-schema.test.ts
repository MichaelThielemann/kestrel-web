import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { describe, expect, it } from "vitest";
import { buildAdminSchema } from "./admin-schema";
import { contentModel, contentTypes, defaultLocale, features, locales, prefixPrimary } from "../../../../playground/shared/model";
import fieldTypes from "../../../../playground/shared/field-types";
import { customFieldTypes } from "../../collections-ui";
import type { ContentType } from "../../collections-ui";
import collectionsUi from "../../../../playground/shared/collections-ui";

function readJson<T>(url: URL): T {
  const parsed: unknown = JSON.parse(readFileSync(fileURLToPath(url), "utf-8"));
  return boundaryCast<T>(parsed, "json");
}

const describedTypes: Record<string, ContentType> = {
  ...contentTypes,
  pages: { ...contentTypes.pages, fields: { ...contentTypes.pages.fields, accent: { type: "text" } } },
};
const describedModel = { ...contentModel, types: describedTypes };
const customTypes = customFieldTypes(contentTypes, fieldTypes);

const schema = buildAdminSchema({
  model: describedModel,
  collectionsUi,
  features,
  prefixPrimary,
  locales,
  defaultLocale,
  customTypes,
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
      model: { types: contentModel.types },
      collectionsUi,
      features,
      prefixPrimary,
      locales,
      defaultLocale,
    });
    expect(fallback.locales).toEqual({ all: [...locales], primary: defaultLocale, prefixPrimary });
  });

  it("derives the pages workflow from the status enum", () => {
    const pages = schema.collections.find((collection) => collection.name === "pages");
    expect(pages?.workflow).toEqual({ field: "status", live: "published", draft: "draft", done: "finished" });
  });

  it("leaves a collection without a status field without a workflow", () => {
    const settings = schema.collections.find((collection) => collection.name === "settings");
    expect(settings?.workflow).toBeUndefined();
  });
});
