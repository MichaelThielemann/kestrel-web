import { readdirSync } from "node:fs";
import { join } from "node:path";
import { findCalls, firstArgument, isAstNode, objectProperty, parseTs, propertyKeyName, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, SourceRule, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { deliveryEnabled, docsAnchor, LAYER_RANGE, layerPackageRange, manualFinding } from "./ruleHelpers";

const CONSUMER_APP_EXTENSIONS = [".ts", ".vue"];
const SKIP_DIRS = new Set(["node_modules", ".nuxt", ".output", "dist"]);

function walkFiles(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkFiles(join(dir, entry.name), out);
      continue;
    }
    if (CONSUMER_APP_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) out.push(join(dir, entry.name));
  }
}

function consumerFiles(ctx: SourceRuleContext, dirs: readonly string[]): string[] {
  const out: string[] = [];
  for (const dir of dirs) walkFiles(join(ctx.root, dir), out);
  return out;
}

function scriptBlocks(source: string, isVue: boolean): string[] {
  if (!isVue) return [source];
  const blocks: string[] = [];
  const pattern = /<script[^>]*>([\s\S]*?)<\/script>/g;
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) blocks.push(match[1] ?? "");
  return blocks;
}

/** One parsed script of a consumer's own code: a `.ts` file, or one `<script>` block of a `.vue` file. */
export interface ConsumerScript {
  file: string;
  root: AstNode;
}

/** Every script under the project's own `dirs` (default `app/`), skipping `node_modules` and build output; a block that does not parse is left out. */
export function consumerScripts(ctx: SourceRuleContext, dirs: readonly string[] = ["app"]): ConsumerScript[] {
  const scripts: ConsumerScript[] = [];
  for (const file of consumerFiles(ctx, dirs)) {
    const source = ctx.readFile(file);
    if (source === undefined) continue;
    for (const block of scriptBlocks(source, file.endsWith(".vue"))) {
      if (block.trim() === "") continue;
      try {
        scripts.push({ file, root: parseTs(block) });
      } catch {
        continue;
      }
    }
  }
  return scripts;
}

const OLD_SETTINGS_KEY = "site:settings";
const SETTINGS_KEY_FUNCTIONS = ["refreshNuxtData", "clearNuxtData", "useNuxtData"];

/** `useSiteSettings()` keys its data `site:settings:<locale>`; a caller of one of these three still naming the old, unscoped key never finds or clears it. */
export const settingsKeyRule: SourceRule = {
  id: "site/settings-key",
  needs: "source",
  check(ctx) {
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const { file, root } of consumerScripts(ctx)) {
      for (const fn of SETTINGS_KEY_FUNCTIONS) {
        for (const call of findCalls(root, fn)) {
          if (stringValue(firstArgument(call)) !== OLD_SETTINGS_KEY) continue;
          const key = `${file}:${fn}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push(
            manualFinding(
              "site/settings-key",
              "site/settings-key",
              { file },
              `${fn}("site:settings") still names the old, unscoped key; useSiteSettings() now stores it per locale`,
              `use the locale-scoped key, e.g. ${fn}(\`site:settings:\${locale.value}\`)`,
              docsAnchor("site-settings-key"),
            ),
          );
        }
      }
    }
    return findings;
  },
};

const KEYED_FETCH_FUNCTIONS = ["useAsyncData", "useFetch"];

function useIdBoundNames(root: AstNode): string[] {
  const names: string[] = [];
  walk(root, (node) => {
    if (node.type !== "VariableDeclarator") return;
    const id = node.id;
    const init = node.init;
    if (!isAstNode(id) || id.type !== "Identifier" || typeof id.name !== "string") return;
    if (!isAstNode(init) || init.type !== "CallExpression") return;
    const callee = init.callee;
    if (isAstNode(callee) && callee.type === "Identifier" && callee.name === "useId") names.push(id.name);
  });
  return names;
}

function referencesAny(node: AstNode, names: readonly string[]): boolean {
  let found = false;
  walk(node, (n) => {
    if (n.type === "Identifier" && typeof n.name === "string" && names.includes(n.name)) found = true;
  });
  return found;
}

function callsUseSiteLocale(node: AstNode): boolean {
  let found = false;
  walk(node, (n) => {
    if (n.type !== "CallExpression") return;
    const callee = n.callee;
    if (isAstNode(callee) && callee.type === "Identifier" && callee.name === "useSiteLocale") found = true;
  });
  return found;
}

function hasWatchOnSiteLocale(call: AstNode): boolean {
  const args = Array.isArray(call.arguments) ? call.arguments.filter(isAstNode) : [];
  for (const arg of args) {
    if (arg.type !== "ObjectExpression") continue;
    const watch = objectProperty(arg, "watch");
    if (watch !== undefined && callsUseSiteLocale(watch)) return true;
  }
  return false;
}

/**
 * A heuristic, report-only check: a fetch key built from a `useId()` value is not deterministic across
 * a client navigation on a static site, and a `watch` on `useSiteLocale()` never fires inside a page —
 * both leave stale or missing data after navigating. Never edits.
 */
export const unstableKeyRule: SourceRule = {
  id: "static/unstable-key",
  needs: "source",
  check(ctx) {
    const findings: Finding[] = [];
    for (const { file, root } of consumerScripts(ctx)) {
      const useIdNames = useIdBoundNames(root);
      for (const fn of KEYED_FETCH_FUNCTIONS) {
        for (const call of findCalls(root, fn)) {
          const key = firstArgument(call);
          if (key === undefined) continue;
          const usesUseId = useIdNames.length > 0 && referencesAny(key, useIdNames);
          const watchesLocale = stringValue(key) !== undefined && hasWatchOnSiteLocale(call);
          if (!usesUseId && !watchesLocale) continue;
          const reason = usesUseId ? "its key is built from a useId() value, which is not deterministic across a client navigation" : "its key is fixed but watches useSiteLocale(), which never fires inside a page";
          findings.push({
            id: "static/unstable-key",
            rule: "static/unstable-key",
            severity: "info",
            tier: "source",
            where: { file },
            message: `${fn}() in ${file}: ${reason}`,
            suggestion: "derive the key from the same inputs the data depends on, including the locale, without useId() or a watch on it",
            fix: { kind: "none" },
            docs: docsAnchor("static-unstable-key"),
          });
        }
      }
    }
    return findings;
  },
};

const RESERVED_ROUTE_PREFIXES = ["/api", "/admin", "/media", "/_preview", "/_nuxt"];
const ROUTE_CACHE_KEYS = ["isr", "cache", "swr"];

function isPageRoute(pattern: string): boolean {
  return !RESERVED_ROUTE_PREFIXES.some((prefix) => pattern === prefix || pattern.startsWith(`${prefix}/`));
}

function turnsCachingOn(node: AstNode): boolean {
  return !(node.type === "BooleanLiteral" && node.value === false);
}

/** `isr`/`cache`/`swr` turned on for a page route makes `delivery-static`'s publish fail; the reserved prefixes (`/api`, `/admin`, `/media`, `/_preview`, `/_nuxt`) are never page routes. */
export const routeCacheRule: SourceRule = {
  id: "static/route-cache",
  needs: "source",
  check(ctx) {
    if (!deliveryEnabled(ctx)) return [];
    const source = ctx.readFile(join(ctx.root, "nuxt.config.ts"));
    if (source === undefined) return [];
    const root = parseTs(source);
    const findings: Finding[] = [];
    for (const call of findCalls(root, "defineNuxtConfig")) {
      const options = firstArgument(call);
      const routeRules = options === undefined ? undefined : objectProperty(options, "routeRules");
      if (routeRules === undefined || routeRules.type !== "ObjectExpression") continue;
      const properties = Array.isArray(routeRules.properties) ? routeRules.properties.filter(isAstNode) : [];
      for (const prop of properties) {
        const pattern = propertyKeyName(prop);
        const value = prop.value;
        if (pattern === undefined || !isPageRoute(pattern) || !isAstNode(value) || value.type !== "ObjectExpression") continue;
        const cacheKey = ROUTE_CACHE_KEYS.find((k) => {
          const prop = objectProperty(value, k);
          return prop !== undefined && turnsCachingOn(prop);
        });
        if (cacheKey === undefined) continue;
        findings.push({
          id: `static/route-cache:${pattern}`,
          rule: "static/route-cache",
          severity: "info",
          tier: "source",
          where: { file: join(ctx.root, "nuxt.config.ts"), path: pattern },
          message: `routeRules["${pattern}"] sets "${cacheKey}", but delivery is on and this pattern matches page routes`,
          suggestion: `remove "${cacheKey}" from routeRules["${pattern}"], or scope the pattern to a route delivery-static never publishes`,
          fix: { kind: "none" },
          docs: docsAnchor("static-route-cache"),
        });
      }
    }
    return findings;
  },
};

/** A one-time note, gone once the layer range is at 3.x: 3.0 changes what an exported page carries, and the first start of the upgraded build re-renders every published page in the background, so nothing needs running by hand. */
export const publishAllRule: SourceRule = {
  id: "ops/publish-all",
  needs: "source",
  check(ctx) {
    const range = layerPackageRange(ctx);
    if (!deliveryEnabled(ctx) || range === undefined || range === LAYER_RANGE) return [];
    return [
      {
        id: "ops/publish-all",
        rule: "ops/publish-all",
        severity: "info",
        tier: "source",
        where: {},
        message: "this upgrade changes what an exported page carries (the static marker, the build id, several page-data keys)",
        suggestion: "nothing to run: the first start of the upgraded build re-renders every published page in the background; System › Static delivery shows the progress",
        fix: { kind: "none" },
        docs: docsAnchor("ops-publish-all"),
      },
    ];
  },
};

const PRIVATE_MEDIA_FIELDS = ["folder", "createdAt", "updatedAt", "variantCounts"];
const PRIVATE_PAGE_FIELDS = ["createdAt", "updatedAt"];
const PAGE_DATA_FUNCTIONS = ["useNuxtData", "useAsyncData"];
const NON_PAGE_SITE_KEYS = ["site:settings", "site:locales"];

type LoadedKind = "media" | "page";

function calleeName(call: AstNode): string | undefined {
  const callee = call.callee;
  return isAstNode(callee) && callee.type === "Identifier" && typeof callee.name === "string" ? callee.name : undefined;
}

function keyPrefix(node: AstNode | undefined): string | undefined {
  if (node === undefined) return undefined;
  const literal = stringValue(node);
  if (literal !== undefined) return literal;
  if (node.type !== "TemplateLiteral" || !Array.isArray(node.quasis)) return undefined;
  const first: unknown = node.quasis[0];
  if (!isAstNode(first)) return undefined;
  const value: unknown = first.value;
  if (typeof value !== "object" || value === null || !("cooked" in value)) return undefined;
  return typeof value.cooked === "string" ? value.cooked : undefined;
}

function isPageDataKey(node: AstNode | undefined): boolean {
  const prefix = keyPrefix(node);
  return prefix !== undefined && prefix.startsWith("site:") && !NON_PAGE_SITE_KEYS.some((key) => prefix.startsWith(key));
}

function loadedKindOf(init: AstNode): LoadedKind | undefined {
  if (init.type !== "CallExpression") return undefined;
  const name = calleeName(init);
  if (name === "useMediaItem") return "media";
  if (name === "useSitePage") return "page";
  if (name !== undefined && PAGE_DATA_FUNCTIONS.includes(name) && isPageDataKey(firstArgument(init))) return "page";
  return undefined;
}

function boundNames(id: AstNode): string[] {
  if (id.type === "Identifier" && typeof id.name === "string") return [id.name];
  if (id.type !== "ObjectPattern") return [];
  const properties = Array.isArray(id.properties) ? id.properties.filter(isAstNode) : [];
  return properties.flatMap((prop) => {
    if (prop.type !== "ObjectProperty" || propertyKeyName(prop) !== "data") return [];
    const value = prop.value;
    return isAstNode(value) && value.type === "Identifier" && typeof value.name === "string" ? [value.name] : [];
  });
}

function namesPageDocument(node: unknown): boolean {
  let found = false;
  if (!isAstNode(node)) return false;
  walk(node, (n) => {
    if (n.type !== "TSTypeReference") return;
    const typeName = n.typeName;
    if (isAstNode(typeName) && typeName.type === "Identifier" && (typeName.name === "PageDocument" || typeName.name === "SiteResponse")) found = true;
  });
  return found;
}

function loadedBindings(root: AstNode): Map<string, LoadedKind> {
  const bindings = new Map<string, LoadedKind>();
  walk(root, (node) => {
    if (node.type === "Identifier" && typeof node.name === "string" && namesPageDocument(node.typeAnnotation)) bindings.set(node.name, "page");
    if (node.type !== "VariableDeclarator") return;
    const init = node.init;
    const id = node.id;
    if (!isAstNode(init) || !isAstNode(id)) return;
    const kind = loadedKindOf(init);
    if (kind === undefined) return;
    for (const name of boundNames(id)) bindings.set(name, kind);
  });
  return bindings;
}

function isMemberAccess(node: AstNode): boolean {
  return node.type === "MemberExpression" || node.type === "OptionalMemberExpression";
}

function chainRootName(node: unknown): string | undefined {
  if (!isAstNode(node)) return undefined;
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  if (isMemberAccess(node)) return chainRootName(node.object);
  return undefined;
}

function chainMentionsVariants(node: unknown): boolean {
  if (!isAstNode(node)) return false;
  let found = false;
  walk(node, (n) => {
    if (n.type === "Identifier" && n.name === "variants") found = true;
  });
  return found;
}

function privateFieldOf(kind: LoadedKind, property: string, object: unknown): string | undefined {
  if (kind === "page") return PRIVATE_PAGE_FIELDS.includes(property) ? property : undefined;
  if (property === "state" && chainMentionsVariants(object)) return "variants[].state";
  return PRIVATE_MEDIA_FIELDS.includes(property) ? property : undefined;
}

const LOADED_WORDING: Record<LoadedKind, { what: string; shape: string; suggestion: (field: string) => string }> = {
  media: { what: "a media item", shape: "PublicMediaItem does not carry it", suggestion: (field) => `stop reading "${field}"; it is undefined on the static site and on every anonymous read` },
  page: {
    what: "a page",
    shape: "a public page carries no timestamps, for a signed-in viewer neither",
    suggestion: (field) => `stop reading "${field}"; show a date through a field of your content model instead`,
  },
};

/**
 * A public page and a media item the layer loaded carry only what a visitor without a session receives:
 * reading `folder`, a timestamp, `variantCounts` or a variant's `state` off a `useMediaItem()` result, or a
 * timestamp off `useSitePage()`, the page data under a `site:` key or a value typed `PageDocument`, gets
 * `undefined`. Info only, since the fix is to stop reading the field.
 */
export const privateFieldsRule: SourceRule = {
  id: "site/private-fields",
  needs: "source",
  check(ctx) {
    const findings: Finding[] = [];
    for (const { file, root } of consumerScripts(ctx)) {
      const bindings = loadedBindings(root);
      if (bindings.size === 0) continue;
      const reported = new Set<string>();
      walk(root, (node) => {
        if (!isMemberAccess(node) || node.computed === true) return;
        const property = node.property;
        if (!isAstNode(property) || property.type !== "Identifier" || typeof property.name !== "string") return;
        const rootName = chainRootName(node.object);
        const kind = rootName === undefined ? undefined : bindings.get(rootName);
        if (kind === undefined) return;
        const field = privateFieldOf(kind, property.name, node.object);
        if (field === undefined || reported.has(`${kind}:${field}`)) return;
        reported.add(`${kind}:${field}`);
        const wording = LOADED_WORDING[kind];
        findings.push({
          id: `site/private-fields:${kind === "page" ? "page." : ""}${field}`,
          rule: "site/private-fields",
          severity: "info",
          tier: "source",
          where: { file, path: field },
          message: `reads "${field}" of ${wording.what} the layer loaded; ${wording.shape}`,
          suggestion: wording.suggestion(field),
          fix: { kind: "none" },
          docs: docsAnchor("site-private-fields"),
        });
      });
    }
    return findings;
  },
};

export const consumerRules: readonly SourceRule[] = [settingsKeyRule, unstableKeyRule, routeCacheRule, publishAllRule, privateFieldsRule];
