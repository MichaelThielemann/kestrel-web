import { resolveStorageTypes } from "../field-types";
import type { FieldTypes } from "../field-types";
import { MOUNTS_FIELD } from "../mount-path";
import { BLOCK_ALIASES_FIELD, BODY_FIELD } from "../collections-ui/serialize";
import { mountedCollections } from "./paths";
import type { CollectionModel } from "./collections";

export type SchemaMap = Record<string, string | Record<string, unknown>>;

export const REFERENCES_MODULE = "@michaelthielemann/kestrel-references-default";

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
  return Object.fromEntries(Object.entries(schemas).filter(([key]) => {
    const [type = "", field = ""] = key.split(".");
    return storesJson(types, options.collectionsUi, type, field);
  }));
}
