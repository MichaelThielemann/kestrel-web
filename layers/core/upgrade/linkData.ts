import type { Persistence } from "@michaelthielemann/kestrel-contracts/persistence";
import type { Finding } from "@michaelthielemann/kestrel-upgrade/plugin";
import { safeLinkUrl } from "../app/utils/link-url";
import { docsAnchor } from "./ruleHelpers";

const PAGE = 500;
const SHOWN = 10;

interface JsonColumn {
  type: string;
  field: string;
  column: string;
  locale: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonColumns(model: unknown): JsonColumn[] {
  if (!isRecord(model) || !isRecord(model.types)) return [];
  const locales = Array.isArray(model.locales) ? model.locales.filter((l): l is string => typeof l === "string") : [];
  const out: JsonColumn[] = [];
  for (const [type, def] of Object.entries(model.types)) {
    if (!isRecord(def) || !isRecord(def.fields)) continue;
    for (const [field, spec] of Object.entries(def.fields)) {
      if (!isRecord(spec) || spec.type !== "json") continue;
      if (spec.localized === true && locales.length > 0) for (const locale of locales) out.push({ type, field, column: `${field}__${locale}`, locale });
      else out.push({ type, field, column: field, locale: null });
    }
  }
  return out;
}

function unsafeTargets(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((n, item) => n + unsafeTargets(item), 0);
  if (!isRecord(value)) return 0;
  let count = value.type === "external" && typeof value.url === "string" && safeLinkUrl(value.url) === null ? 1 : 0;
  for (const child of Object.values(value)) count += unsafeTargets(child);
  return count;
}

async function scan(db: Persistence, column: JsonColumn): Promise<Array<{ id: string; count: number }>> {
  const ensured = await db.ensureCollection(column.type, { [column.column]: "json" });
  if (!ensured.ok) return [];
  const hits: Array<{ id: string; count: number }> = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await db.findMany(column.type, {}, { sort: { id: "asc" }, limit: PAGE, offset });
    if (!page.ok) return hits;
    for (const row of page.value.items) {
      const count = unsafeTargets(row[column.column]);
      if (count > 0) hits.push({ id: row.id, count });
    }
    if (page.value.items.length < PAGE) return hits;
  }
}

/**
 * The `data/link-target` findings for a project's stored content: every `json` field of the content model
 * (`shared/model.ts`'s `contentModel`), in every locale, walked for link values of type `external` whose `url`
 * the link target rule refuses. One error per collection and field, naming the documents and locales.
 */
export async function linkDataFindings(db: Persistence, model: unknown): Promise<Finding[]> {
  const byField = new Map<string, { total: number; where: string[] }>();
  for (const column of jsonColumns(model)) {
    for (const hit of await scan(db, column)) {
      const key = `${column.type}.${column.field}`;
      const entry = byField.get(key) ?? { total: 0, where: [] };
      entry.total += hit.count;
      entry.where.push(column.locale === null ? hit.id : `${hit.id} (${column.locale})`);
      byField.set(key, entry);
    }
  }
  return [...byField].map(([key, { total, where }]) => ({
    id: `data/link-target:${key}`,
    rule: "data/link-target",
    severity: "error",
    tier: "data",
    where: { path: key },
    message: `${total} stored link(s) in "${key}" point at a target other than http(s), mailto, tel or a site-relative path: ${where.slice(0, SHOWN).join(", ")}${where.length > SHOWN ? `, and ${where.length - SHOWN} more` : ""}`,
    suggestion: "open each document in the admin and replace the link target; the server refuses to save the document until then, and the site renders such a link without an href",
    fix: { kind: "manual" },
    docs: docsAnchor("link-targets"),
  }));
}
