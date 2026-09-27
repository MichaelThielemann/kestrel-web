/** A collection's fields whose `collectionsUi` entry shows them as a `link` (`fieldOverrides.<field>.type: "link"`), by collection. */
export function linkOverrideFields(collections: Record<string, { fields: Record<string, unknown> }>, collectionsUi: Record<string, unknown> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, model] of Object.entries(collections)) {
    const ui = collectionsUi?.[name];
    const overrides: unknown = typeof ui === "object" && ui !== null ? Reflect.get(ui, "fieldOverrides") : undefined;
    if (typeof overrides !== "object" || overrides === null) continue;
    const fields = Object.entries(overrides)
      .filter(([field, override]) => field in model.fields && typeof override === "object" && override !== null && Reflect.get(override, "type") === "link")
      .map(([field]) => field)
      .sort();
    if (fields.length > 0) out[name] = fields;
  }
  return out;
}
