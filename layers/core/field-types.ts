import { boundaryCast } from "./app/utils/cast";
import type { FieldType, SerializedBlock, SerializedField } from "./app/types/kestrel";

export const STORAGE_FIELD_TYPES = ["text", "richtext", "number", "boolean", "date", "slug", "json", "enum", "ref"] as const;

export type StorageFieldType = (typeof STORAGE_FIELD_TYPES)[number];

export interface FieldTypeDefinition {
  storage: StorageFieldType;
  schema: Record<string, unknown>;
  empty?: unknown;
}

export type FieldTypes = Record<string, FieldTypeDefinition>;

export interface FieldTypesModel {
  kind: "single" | "multi";
  fields: Record<string, unknown>;
}

export type CustomFieldTypes = Record<string, Record<string, string>>;

const FIELD_TYPE_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

const ADMIN_FIELD_TYPES = ["text", "slug", "richtext", "number", "boolean", "datetime", "choice", "link", "media", "relation", "repeater", "json"];

const RESERVED_FIELD_TYPE_NAMES = new Set<string>([...STORAGE_FIELD_TYPES, ...ADMIN_FIELD_TYPES]);

const ADMIN_TYPE_FOR_STORAGE: Record<StorageFieldType, FieldType> = {
  text: "text",
  richtext: "richtext",
  number: "number",
  boolean: "boolean",
  date: "datetime",
  slug: "slug",
  json: "json",
  enum: "choice",
  ref: "relation",
};

export function adminTypeForStorage(storage: StorageFieldType): FieldType {
  return ADMIN_TYPE_FOR_STORAGE[storage];
}

function isFieldObject(field: unknown): field is Record<string, unknown> {
  return typeof field === "object" && field !== null && !Array.isArray(field);
}

function fieldTypeName(field: unknown): string | undefined {
  if (typeof field === "string") return field;
  if (!isFieldObject(field)) return undefined;
  return typeof field.type === "string" ? field.type : undefined;
}

export function defineFieldTypes<T extends FieldTypes>(map: T): T {
  for (const [name, definition] of Object.entries(map)) {
    if (!FIELD_TYPE_NAME_PATTERN.test(name)) {
      throw new Error(`field-types: "${name}" must match ${FIELD_TYPE_NAME_PATTERN} (start with a lowercase letter, letters and digits only)`);
    }
    if (RESERVED_FIELD_TYPE_NAMES.has(name)) {
      throw new Error(`field-types: "${name}" is a built-in field type and cannot be redeclared`);
    }
    if (!isFieldObject(definition)) {
      throw new Error(`field-types: "${name}" must be an object with "storage" and "schema"`);
    }
    if (!(STORAGE_FIELD_TYPES as readonly string[]).includes(definition.storage)) {
      throw new Error(`field-types: "${name}" has storage "${String(definition.storage)}" – use one of ${STORAGE_FIELD_TYPES.join(", ")}`);
    }
    if (!isFieldObject(definition.schema)) {
      throw new Error(`field-types: "${name}" needs a JSON-schema fragment object as "schema"`);
    }
  }
  return map;
}

export function customFieldTypes(types: Record<string, FieldTypesModel>, fieldTypes: FieldTypes): CustomFieldTypes {
  const custom: CustomFieldTypes = {};
  for (const [collection, model] of Object.entries(types)) {
    const fields: Record<string, string> = {};
    for (const [field, raw] of Object.entries(model.fields)) {
      const type = fieldTypeName(raw);
      if (type !== undefined && type in fieldTypes) fields[field] = type;
    }
    if (Object.keys(fields).length > 0) custom[collection] = fields;
  }
  return custom;
}

export function resolveStorageTypes(types: Record<string, FieldTypesModel>, fieldTypes: FieldTypes, where: string): Record<string, FieldTypesModel> {
  const resolved: Record<string, FieldTypesModel> = {};
  for (const [collection, model] of Object.entries(types)) {
    const fields: Record<string, unknown> = {};
    for (const [field, raw] of Object.entries(model.fields)) {
      const type = fieldTypeName(raw);
      const definition = type === undefined ? undefined : fieldTypes[type];
      if (definition !== undefined) {
        fields[field] = isFieldObject(raw) ? { ...raw, type: definition.storage } : definition.storage;
        continue;
      }
      if (type !== undefined && !(STORAGE_FIELD_TYPES as readonly string[]).includes(type)) {
        throw new Error(
          `${where}: collection field "${collection}.${field}" has unknown field type "${type}" – declare it with defineFieldTypes() and pass it as "fieldTypes"`,
        );
      }
      fields[field] = raw;
    }
    resolved[collection] = { ...model, fields };
  }
  return resolved;
}

export function fieldTypeSchemas(types: Record<string, FieldTypesModel>, fieldTypes: FieldTypes): Record<string, Record<string, unknown>> {
  const schemas: Record<string, Record<string, unknown>> = {};
  for (const [collection, fields] of Object.entries(customFieldTypes(types, fieldTypes))) {
    for (const [field, type] of Object.entries(fields)) {
      const definition = fieldTypes[type];
      if (definition !== undefined) schemas[`${collection}.${field}`] = definition.schema;
    }
  }
  return schemas;
}

function nestedFields(field: SerializedField): Record<string, SerializedField> | undefined {
  const fields = field.options?.fields;
  return isFieldObject(fields) ? boundaryCast<Record<string, SerializedField>>(fields, "ast") : undefined;
}

function stampField(field: SerializedField, fieldTypes: FieldTypes): SerializedField {
  const nested = nestedFields(field);
  const withNested = nested === undefined ? field : { ...field, options: { ...field.options, fields: stampFields(nested, fieldTypes) } };
  const definition = fieldTypes[field.type];
  return definition === undefined ? withNested : { ...withNested, storageType: adminTypeForStorage(definition.storage) };
}

export function stampFields(fields: Record<string, SerializedField>, fieldTypes: FieldTypes): Record<string, SerializedField> {
  const stamped: Record<string, SerializedField> = {};
  for (const [name, field] of Object.entries(fields)) stamped[name] = stampField(field, fieldTypes);
  return stamped;
}

export function stampBlockFieldTypes(blocks: readonly SerializedBlock[], fieldTypes: FieldTypes): SerializedBlock[] {
  return blocks.map((block) => ({ ...block, fields: stampFields(block.fields, fieldTypes) }));
}
