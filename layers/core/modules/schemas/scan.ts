import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type BundledSchemas = { mode: "paths"; schemas: Record<string, string> } | { mode: "inline"; schemas: Record<string, unknown> };

export interface SchemaSources {
  rootDir: string;
  buildDir: string;
  navigationDefault: string;
  redirectsDefault: string;
}

const BODY_SUFFIX = ".body.json";

function consumerBodySchemas(rootDir: string, list: (dir: string) => string[], exists: (path: string) => boolean): Record<string, string> {
  const dir = join(rootDir, "schemas");
  if (!exists(dir)) return {};
  const out: Record<string, string> = {};
  for (const file of list(dir)) {
    if (!file.endsWith(BODY_SUFFIX)) continue;
    out[`${file.slice(0, -BODY_SUFFIX.length)}.body`] = join(dir, file);
  }
  return out;
}

export function bundledSchemaPaths(
  sources: SchemaSources,
  exists: (path: string) => boolean = existsSync,
  list: (dir: string) => string[] = (dir) => readdirSync(dir),
): Record<string, string> {
  const consumerNavigation = join(sources.rootDir, "schemas", "settings.navigation.json");
  const pagesBody = join(sources.buildDir, "kestrel", "pages.body.json");
  return {
    ...consumerBodySchemas(sources.rootDir, list, exists),
    ...(exists(pagesBody) ? { "pages.body": pagesBody } : {}),
    "settings.navigation": exists(consumerNavigation) ? consumerNavigation : sources.navigationDefault,
    "redirects.rules": sources.redirectsDefault,
  };
}

export function inlineSchemas(paths: Record<string, string>, read: (path: string) => string = (path) => readFileSync(path, "utf8")): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(paths)) out[key] = JSON.parse(read(path));
  return out;
}

export function renderSchemasModule(bundle: BundledSchemas): string {
  return `export default ${JSON.stringify(bundle)};\n`;
}
