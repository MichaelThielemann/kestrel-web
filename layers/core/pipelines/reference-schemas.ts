import { REF_KEYWORD } from "@michaelthielemann/kestrel-references-default/impl";
import { resolveStorageTypes, STORAGE_FIELD_TYPES } from "../field-types";
import type { FieldTypes } from "../field-types";
import { MOUNTS_FIELD } from "../mount-path";
import { BLOCK_ALIASES_FIELD, BODY_FIELD } from "../collections-ui/serialize";
import { mountedCollections } from "./paths";
import type { CollectionModel } from "./collections";

export type SchemaMap = Record<string, string | Record<string, unknown>>;

export const REFERENCES_MODULE = "@michaelthielemann/kestrel-references-default";

export function schemasOf(config: unknown): SchemaMap | undefined {
  const schemas: unknown = typeof config === "object" && config !== null ? Reflect.get(config, "schemas") : undefined;
  if (typeof schemas !== "object" || schemas === null) return undefined;
  const result: SchemaMap = {};
  const entries: [string, unknown][] = Object.entries(schemas);
  for (const [key, value] of entries) {
    if (typeof value === "string") result[key] = value;
    else if (typeof value === "object" && value !== null) result[key] = { ...value };
  }
  return result;
}

function isJsonField(field: unknown): boolean {
  return typeof field === "object" && field !== null && "type" in field && field.type === "json";
}

function editsBlocks(collectionsUi: Record<string, unknown> | undefined, name: string): boolean {
  const ui = collectionsUi?.[name];
  return typeof ui === "object" && ui !== null && "editor" in ui && ui.editor === "blocks";
}

function storesJson(types: Record<string, CollectionModel>, collectionsUi: Record<string, unknown> | undefined, type: string, field: string): boolean {
  const model = types[type];
  if (model === undefined) return false;
  if (field in model.fields) return isJsonField(model.fields[field]);
  if (type === "settings" && field === MOUNTS_FIELD) return mountedCollections(types).length > 0;
  return field === BLOCK_ALIASES_FIELD && BODY_FIELD in model.fields && editsBlocks(collectionsUi, type);
}

function splitKey(key: string): [string, string] {
  const [type = "", field = ""] = key.split(".");
  return [type, field];
}

/**
 * The entries of `schemas` whose key `<collection>.<field>` names a field stored as `json`: a declared `json` field,
 * a custom field type stored as `json`, a blocks editor's derived block aliases or the mount pages of mounted collections.
 * Throws, naming `where`, for a field of a type neither built in nor in `fieldTypes`.
 */
export function jsonFieldSchemas(
  collections: Record<string, CollectionModel>,
  schemas: SchemaMap,
  options: { fieldTypes?: FieldTypes; collectionsUi?: Record<string, unknown>; where: string },
): SchemaMap {
  const types = resolveStorageTypes(collections, options.fieldTypes ?? {}, options.where);
  return Object.fromEntries(Object.entries(schemas).filter(([key]) => storesJson(types, options.collectionsUi, ...splitKey(key))));
}

function fieldTypeName(field: unknown): string | undefined {
  if (typeof field === "string") return field;
  return typeof field === "object" && field !== null && "type" in field && typeof field.type === "string" ? field.type : undefined;
}

function withUnknownTypesAsJson(collections: Record<string, CollectionModel>, fieldTypes: FieldTypes): FieldTypes {
  const known = new Set<string>([...STORAGE_FIELD_TYPES, ...Object.keys(fieldTypes)]);
  const result: FieldTypes = { ...fieldTypes };
  for (const model of Object.values(collections)) {
    for (const raw of Object.values(model.fields)) {
      const type = fieldTypeName(raw);
      if (type !== undefined && !known.has(type)) result[type] = { storage: "json", schema: {} };
    }
  }
  return result;
}

function marksReferences(schema: unknown): boolean {
  if (Array.isArray(schema)) return schema.some(marksReferences);
  if (typeof schema !== "object" || schema === null) return false;
  return Object.entries(schema).some(([key, value]) => key === REF_KEYWORD || marksReferences(value));
}

/**
 * The keys of `schemas` a `references-default` entry must carry so that no reference goes unindexed: every
 * `<collection>.body` schema of a field stored as `json` (the block schema, read from a file) and every other
 * `json` field schema given inline that carries `x-kestrel-ref`. A schema file other than a body schema is not
 * read. A field of a type neither built in nor in `fieldTypes` counts as stored as `json`.
 */
export function requiredReferenceSchemaKeys(
  collections: Record<string, CollectionModel>,
  schemas: SchemaMap,
  options: { fieldTypes?: FieldTypes; collectionsUi?: Record<string, unknown> },
): string[] {
  const types = resolveStorageTypes(collections, withUnknownTypesAsJson(collections, options.fieldTypes ?? {}), "references");
  return Object.entries(schemas)
    .filter(([key, schema]) => {
      const [type, field] = splitKey(key);
      if (!storesJson(types, options.collectionsUi, type, field)) return false;
      return field === BODY_FIELD || marksReferences(schema);
    })
    .map(([key]) => key);
}
