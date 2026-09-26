export interface SchemaBundle {
  mode: string;
  schemas: Record<string, unknown>;
}

export interface ModuleEntry {
  use: string;
  config?: unknown;
}

const VALIDATE_MODULE = "@michaelthielemann/kestrel-validate-jsonschema";

/**
 * Replaces each validate-jsonschema schema the build bundled by the bundled one: by its key, or, for a key
 * pointing at the same file as a bundled key (a mounted collection's body on the pages' block schema), by
 * that key's bundled schema.
 */
export function applyBundledSchemas<T extends ModuleEntry>(entries: readonly T[], bundle: SchemaBundle): T[] {
  return entries.map((entry) => {
    if (entry.use !== VALIDATE_MODULE || typeof entry.config !== "object" || entry.config === null) return entry;
    const config = entry.config as { schemas?: Record<string, unknown> };
    if (typeof config.schemas !== "object" || config.schemas === null) return entry;
    const schemas = { ...config.schemas };
    const bundledByPath = new Map(Object.keys(schemas).filter((key) => key in bundle.schemas).map((key) => [schemas[key], bundle.schemas[key]]));
    for (const key of Object.keys(schemas)) {
      if (key in bundle.schemas) schemas[key] = bundle.schemas[key];
      else if (bundledByPath.has(schemas[key])) schemas[key] = bundledByPath.get(schemas[key]);
    }
    return { ...entry, config: { ...config, schemas } };
  });
}
