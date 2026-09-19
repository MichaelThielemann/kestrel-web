import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { boundaryCast } from "../../app/utils/cast";
import { defineFieldTypes } from "../../field-types";
import type { FieldTypes } from "../../field-types";

export const FIELD_TYPES_ID = "#kestrel/field-types";
export const FIELD_TYPES_ENTRY = "shared/field-types.ts";

export function fieldTypesEntry(rootDir: string): string | undefined {
  const entry = resolve(rootDir, FIELD_TYPES_ENTRY);
  return existsSync(entry) ? entry : undefined;
}

export async function loadFieldTypes(rootDir: string): Promise<FieldTypes> {
  const entry = fieldTypesEntry(rootDir);
  if (entry === undefined) return {};
  const loaded: unknown = await import(pathToFileURL(entry).href);
  const exported = boundaryCast<{ default?: unknown }>(loaded, "host").default;
  if (exported === undefined || typeof exported !== "object" || exported === null) {
    throw new Error(`${FIELD_TYPES_ENTRY} must export the result of defineFieldTypes() as its default export`);
  }
  return defineFieldTypes(boundaryCast<FieldTypes>(exported, "host"));
}
