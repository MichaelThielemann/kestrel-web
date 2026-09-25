import { readdirSync } from "node:fs";
import { join } from "node:path";
import { findCalls, firstArgument, isAstNode, objectProperty, parseTs, propertyKeyName, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, SourceRule, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { deliveryEnabled, docsAnchor, manualFinding } from "./ruleHelpers";

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

function consumerAppFiles(ctx: SourceRuleContext): string[] {
  const out: string[] = [];
  walkFiles(join(ctx.root, "app"), out);
  return out;
}

function scriptBlocks(source: string, isVue: boolean): string[] {
  if (!isVue) return [source];
  const blocks: string[] = [];
  const pattern = /<script[^>]*>([\s\S]*?)<\/script>/g;
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) blocks.push(match[1] ?? "");
  return blocks;
}

interface ConsumerScript {
  file: string;
  root: AstNode;
}

function consumerScripts(ctx: SourceRuleContext): ConsumerScript[] {
  const scripts: ConsumerScript[] = [];
  for (const file of consumerAppFiles(ctx)) {
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
        const cacheKey = ROUTE_CACHE_KEYS.find((k) => objectProperty(value, k) !== undefined);
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

/** A one-time reminder, gone once the layer range is at 3.x: 6.0/3.0 changes what an exported page carries, so a page published under the old release keeps navigating through `/api` until it is republished. */
export const publishAllRule: SourceRule = {
  id: "ops/publish-all",
  needs: "source",
  check(ctx) {
    if (!deliveryEnabled(ctx)) return [];
    return [
      {
        id: "ops/publish-all",
        rule: "ops/publish-all",
        severity: "warning",
        tier: "source",
        where: {},
        message: "this upgrade changes what an exported page carries (the static marker, the build id, several page-data keys)",
        suggestion: "run Publish all once after the upgrade completes, so every already-published page picks up the change",
        fix: { kind: "manual" },
        docs: docsAnchor("ops-publish-all"),
      },
    ];
  },
};

const PRIVATE_MEDIA_FIELDS = ["folder", "createdAt", "updatedAt", "variantCounts"];

function mediaItemBindings(root: AstNode): string[] {
  const names: string[] = [];
  walk(root, (node) => {
    if (node.type !== "VariableDeclarator") return;
    const init = node.init;
    if (!isAstNode(init) || init.type !== "CallExpression") return;
    const callee = init.callee;
    if (!isAstNode(callee) || callee.type !== "Identifier" || callee.name !== "useMediaItem") return;
    const id = node.id;
    if (!isAstNode(id)) return;
    if (id.type === "Identifier" && typeof id.name === "string") {
      names.push(id.name);
      return;
    }
    if (id.type !== "ObjectPattern") return;
    const properties = Array.isArray(id.properties) ? id.properties.filter(isAstNode) : [];
    for (const prop of properties) {
      if (prop.type !== "ObjectProperty" || propertyKeyName(prop) !== "data") continue;
      const value = prop.value;
      if (isAstNode(value) && value.type === "Identifier" && typeof value.name === "string") names.push(value.name);
    }
  });
  return names;
}

function chainRootName(node: unknown): string | undefined {
  if (!isAstNode(node)) return undefined;
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  if (node.type === "MemberExpression") return chainRootName(node.object);
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

/** `PublicMediaItem` drops `folder`, the timestamps, `variantCounts` and every variant's `state`; a consumer reading them off a `useMediaItem()` result gets `undefined`. Info only, since the fix is to stop reading the field. */
export const privateFieldsRule: SourceRule = {
  id: "site/private-fields",
  needs: "source",
  check(ctx) {
    const findings: Finding[] = [];
    for (const { file, root } of consumerScripts(ctx)) {
      const trackedNames = mediaItemBindings(root);
      if (trackedNames.length === 0) continue;
      const reported = new Set<string>();
      walk(root, (node) => {
        if (node.type !== "MemberExpression" || node.computed === true) return;
        const property = node.property;
        if (!isAstNode(property) || property.type !== "Identifier" || typeof property.name !== "string") return;
        const rootName = chainRootName(node.object);
        if (rootName === undefined || !trackedNames.includes(rootName)) return;
        const isPrivateField = PRIVATE_MEDIA_FIELDS.includes(property.name);
        const isVariantState = property.name === "state" && chainMentionsVariants(node.object);
        if (!isPrivateField && !isVariantState) return;
        const field = isVariantState ? "variants[].state" : property.name;
        const key = `${field}`;
        if (reported.has(key)) return;
        reported.add(key);
        findings.push({
          id: `site/private-fields:${field}`,
          rule: "site/private-fields",
          severity: "info",
          tier: "source",
          where: { file, path: field },
          message: `reads "${field}" of a media item the layer loaded; PublicMediaItem does not carry it`,
          suggestion: `stop reading "${field}"; it is undefined on the static site and on every anonymous read`,
          fix: { kind: "none" },
          docs: docsAnchor("site-private-fields"),
        });
      });
    }
    return findings;
  },
};

export const consumerRules: readonly SourceRule[] = [settingsKeyRule, unstableKeyRule, routeCacheRule, publishAllRule, privateFieldsRule];
