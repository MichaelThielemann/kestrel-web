export interface SchemaBundle {
  mode: string;
  schemas: Record<string, unknown>;
}

export interface ModuleEntry {
  use: string;
  config?: unknown;
}

const VALIDATE_MODULE = "@michaelthielemann/kestrel-validate-jsonschema";

export function applyBundledSchemas<T extends ModuleEntry>(entries: readonly T[], bundle: SchemaBundle): T[] {
  return entries.map((entry) => {
    if (entry.use !== VALIDATE_MODULE || typeof entry.config !== "object" || entry.config === null) return entry;
    const config = entry.config as { schemas?: Record<string, unknown> };
    if (typeof config.schemas !== "object" || config.schemas === null) return entry;
    const schemas = { ...config.schemas };
    for (const key of Object.keys(schemas)) if (key in bundle.schemas) schemas[key] = bundle.schemas[key];
    return { ...entry, config: { ...config, schemas } };
  });
}
