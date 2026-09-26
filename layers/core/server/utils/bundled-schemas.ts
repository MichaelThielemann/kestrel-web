export interface SchemaBundle {
  mode: string;
  schemas: Record<string, unknown>;
}

export interface ModuleEntry {
  use: string;
  config?: unknown;
  defaults?: { from: string; values: Record<string, unknown> };
}

const VALIDATE_MODULE = "@michaelthielemann/kestrel-validate-jsonschema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemasOf(config: unknown): Record<string, unknown> | undefined {
  if (!isRecord(config)) return undefined;
  const schemas: unknown = Reflect.get(config, "schemas");
  return isRecord(schemas) ? schemas : undefined;
}

function replacedSchemas(schemas: Record<string, unknown>, bundle: SchemaBundle): Record<string, unknown> {
  const out = { ...schemas };
  const bundledByPath = new Map(Object.keys(out).filter((key) => key in bundle.schemas).map((key) => [out[key], bundle.schemas[key]]));
  for (const key of Object.keys(out)) {
    if (key in bundle.schemas) out[key] = bundle.schemas[key];
    else if (bundledByPath.has(out[key])) out[key] = bundledByPath.get(out[key]);
  }
  return out;
}

/**
 * Replaces each validate-jsonschema schema the build bundled by the bundled one: by its key, or, for a key
 * pointing at the same file as a bundled key (a mounted collection's body on the pages' block schema), by
 * that key's bundled schema. Rewrites whichever layer — the entry's own config, or a preset's defaults —
 * carries the schemas.
 */
export function applyBundledSchemas<T extends ModuleEntry>(entries: readonly T[], bundle: SchemaBundle): T[] {
  return entries.map((entry) => {
    if (entry.use !== VALIDATE_MODULE) return entry;
    const configSchemas = schemasOf(entry.config);
    const config = configSchemas !== undefined && isRecord(entry.config) ? { ...entry.config, schemas: replacedSchemas(configSchemas, bundle) } : entry.config;
    const defaults = entry.defaults;
    const defaultsSchemas = schemasOf(defaults?.values);
    const nextDefaults =
      defaultsSchemas !== undefined && defaults !== undefined && isRecord(defaults.values)
        ? { from: defaults.from, values: { ...defaults.values, schemas: replacedSchemas(defaultsSchemas, bundle) } }
        : defaults;
    return { ...entry, config, defaults: nextDefaults };
  });
}
