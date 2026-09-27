import { resolve } from "node:path";
import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import { mediaTypeAllowed } from "@michaelthielemann/kestrel-contracts/helpers/mediaType";
import { MEDIA_PUBLIC_PATH, MOUNT_PATH, MOUNTS_FIELD, RESERVED_PAGE_SEGMENTS } from "../mount-path";
import { resolveWorkflow } from "../collections-ui/workflow";
import type { WorkflowUi } from "../collections-ui/workflow";
import { BLOCK_ALIASES_FIELD, BODY_FIELD } from "../collections-ui/serialize";
import { resolveStorageTypes } from "../field-types";
import type { FieldTypes } from "../field-types";
import { isGenericCollection } from "./collections";
import { anonymousFieldGrants, withConsumerGrants } from "./field-grants";
import { mountedCollections, parentFieldOf, routedCollections } from "./paths";
import type { PipelineChanges } from "./field-grants";
import type { CollectionModel } from "./collections";
import { lanesFor, presetSchemas, relayPipelinesFor } from "./index";
import type { Feature } from "./index";

export interface ModuleEntry {
  use: string;
  config?: unknown;
  /** Values `presetModuleConfig` computed for this module, reported by `describeConfig` as `status: "default"` with `source: "preset"` until `config` overrides a path. */
  defaults?: { from: string; values: Record<string, unknown> };
}

export interface PresetContentModel {
  locales?: string[];
  defaultLocale?: string;
  types: Record<string, CollectionModel>;
}

export interface PresetRoles {
  roles: Record<string, string[]>;
  anonymous: string[];
  /**
   * Fields a caller without a session keeps, per resource, on top of the grants the preset derives from the
   * content model and the features: a resource named here replaces the derived grant, an empty list removes it.
   */
  anonymousFields?: Record<string, string[]>;
  /** Per role, the fields a caller holding it keeps of a resource; a role without a grant for a resource keeps everything. */
  fields?: Record<string, Record<string, string[]>>;
}

export interface PresetBootstrap {
  username: string;
  passwordHash: string;
  roles?: string[];
}

export interface PresetMediaPolicy {
  maxBytes?: number;
  allowedTypes?: string[];
  deniedTypes?: string[];
}

export interface PresetRateLimit {
  /** Sign-in attempts per client address (an IPv6 address by its /64). */
  login?: { limit: number; windowSeconds: number };
  /** Sign-in attempts per account, from any address; `maxBlockSeconds` bounds the growing block. */
  loginAccount?: { limit: number; windowSeconds: number; maxBlockSeconds?: number };
  /** Password checks of a signed-in user: changing the password and confirming it again. */
  passwordCheck?: { limit: number; windowSeconds: number; maxBlockSeconds?: number };
}

export interface PresetLlms {
  full?: boolean;
  headings?: Record<string, string>;
  siteUrl?: string;
}

export interface PresetEventsQueue {
  pollMs?: number;
  batch?: number;
  maxAttempts?: number;
  backoffSeconds?: number[];
  lockTtlSeconds?: number;
  retentionDays?: number;
  relayMs?: number;
}

export interface PresetRevisions {
  keep?: number;
  maxSnapshotBytes?: number;
  pruneOnWrite?: boolean;
  maxLimit?: number;
}

export interface PresetAudit {
  retentionDays?: number;
}

export interface PresetMigrations {
  migrations: unknown[];
  mode?: string;
}

export interface PresetPaths {
  /**
   * The most paths (documents × locales) one save may move, `site-default`'s `maxCascade`. A save above it is
   * rejected; while a save below it runs, every other request waits.
   */
  maxCascade?: number;
}

export interface PresetSession {
  identifier?: "username" | "email";
  minPasswordLength?: number;
  sessionTtlSeconds?: number;
  /** Mark the session cookie `Secure` (default); `false` only to sign in over plain HTTP from another host during development. */
  secureCookie?: boolean;
}

export interface PresetModuleConfigOptions {
  dataDir: string;
  blobstore: ModuleEntry;
  model: PresetContentModel;
  features: readonly Feature[];
  roles: PresetRoles;
  bootstrap: PresetBootstrap;
  collectionsUi?: Record<string, WorkflowUi & { editor?: "fields" | "blocks"; fieldOverrides?: Record<string, { type?: string }> }>;
  fieldTypes?: FieldTypes;
  media?: PresetMediaPolicy;
  ratelimit?: PresetRateLimit;
  llms?: PresetLlms;
  migrations?: PresetMigrations;
  revisions?: PresetRevisions;
  audit?: PresetAudit;
  session?: PresetSession;
  eventsQueue?: PresetEventsQueue;
  /** The slug served at a locale's root; the same value `definePreset()` takes as `homeSlug`. Default `"home"`. */
  homeSlug?: string;
  /** Whether the default locale's public paths carry its prefix too, as `shared/model` declares it. Default `false`. */
  prefixPrimary?: boolean;
  paths?: PresetPaths;
  overrides?: Partial<Record<string, Record<string, unknown>>>;
  /**
   * The `exclude` and `overrides` given to `definePreset()`, the same object: a resource whose every preset
   * read they exclude or override without its `authz.fields` step gets no derived anonymous field grant.
   */
  pipelines?: PipelineChanges;
}

type ReferenceTarget = { content: string } | { media: true };

const MEDIA_PREFIX = "media/";
const SITE_PREFIX = "site/";
const DATABASE_FILE = "kestrel.db";
/** The `maxAttempts` of `kestrel-events-queue` when its config names none; delivery-static retries a failed re-render as often. */
export const QUEUE_DEFAULT_MAX_ATTEMPTS = 5;
/** The `backoffSeconds` of `kestrel-events-queue` when its config names none; delivery-static waits as long between re-render attempts. */
export const QUEUE_DEFAULT_BACKOFF_SECONDS: readonly number[] = [5, 30, 120, 600];
const MEDIA_REFERENCE_TARGET = "media";
const PAGES_COLLECTION = "pages";
const PRESET_SOURCE = "preset";

const DEFAULT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MEDIA_ALLOWED_TYPES = ["image/*", "application/pdf"];
const DEFAULT_MEDIA_DENIED_TYPES = ["text/html", "application/xhtml+xml"];
const SVG_CONTENT_TYPE = "image/svg+xml";
const MEDIA_MODULE = "@michaelthielemann/kestrel-media-default";
const SANITIZE_SVG_MODULE = "@michaelthielemann/kestrel-sanitize-svg";
const DEFAULT_LOGIN_BUCKET = { limit: 5, windowSeconds: 60 };
const DEFAULT_LOGIN_ACCOUNT_BUCKET = { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 };
const DEFAULT_PASSWORD_CHECK_BUCKET = { limit: 5, windowSeconds: 300, maxBlockSeconds: 900 };
const DEFAULT_LLMS_HEADINGS = { [PAGES_COLLECTION]: "Pages" };
const DEFAULT_SESSION: Required<PresetSession> = { identifier: "username", minPasswordLength: 12, sessionTtlSeconds: 86400, secureCookie: true };
const DEFAULT_LINKS = { timeoutMs: 10000, concurrency: 4, recheckAfterSeconds: 21600 };

function requireOption<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`presetModuleConfig: option "${name}" is required`);
  return value;
}

function preset(use: string, values: Record<string, unknown>): ModuleEntry {
  return { use, defaults: { from: PRESET_SOURCE, values } };
}

function typePatterns(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((pattern): pattern is string => typeof pattern === "string") : undefined;
}

function assertSvgSanitized(modules: readonly ModuleEntry[]): void {
  const mediaEntry = modules.find((entry) => entry.use === MEDIA_MODULE);
  const media = mediaEntry === undefined ? undefined : effectiveModuleConfig(mediaEntry);
  if (typeof media !== "object" || media === null || !("publicCopy" in media) || media.publicCopy === undefined || media.publicCopy === null) return;
  if (modules.some((entry) => entry.use === SANITIZE_SVG_MODULE)) return;
  const allowed = ("allowedTypes" in media ? typePatterns(media.allowedTypes) : undefined) ?? DEFAULT_MEDIA_ALLOWED_TYPES;
  const denied = ("deniedTypes" in media ? typePatterns(media.deniedTypes) : undefined) ?? [];
  if (!mediaTypeAllowed(allowed, denied, SVG_CONTENT_TYPE)) return;
  throw new Error(
    `presetModuleConfig: media-default has publicCopy set (the "delivery" feature sets it) and its allowedTypes allow "${SVG_CONTENT_TYPE}", but the "sanitizeSvg" feature is not enabled`
    + ` – either add "sanitizeSvg" to features (it inserts sanitize.svg before media.upload) or deny "${SVG_CONTENT_TYPE}" in media.deniedTypes`,
  );
}

function refTargetOf(field: unknown): string | undefined {
  if (typeof field !== "object" || field === null) return undefined;
  if (!("type" in field) || field.type !== "ref") return undefined;
  if (!("to" in field) || typeof field.to !== "string" || field.to.length === 0) return undefined;
  return field.to;
}

function referenceTargets(types: Record<string, CollectionModel>): Record<string, ReferenceTarget> {
  const targets: Record<string, ReferenceTarget> = { [MEDIA_REFERENCE_TARGET]: { media: true } };
  for (const [name, model] of Object.entries(types)) {
    if (model.kind === "multi") targets[name] = { content: name };
  }
  for (const model of Object.values(types)) {
    for (const field of Object.values(model.fields)) {
      const to = refTargetOf(field);
      if (to !== undefined && to !== MEDIA_REFERENCE_TARGET && to in types) targets[to] = { content: to };
    }
  }
  return targets;
}

function isJsonField(field: unknown): boolean {
  return typeof field === "object" && field !== null && "type" in field && field.type === "json";
}

function withDerivedBlockAliases(types: Record<string, CollectionModel>, collectionsUi: Record<string, { editor?: "fields" | "blocks" }> | undefined): Record<string, CollectionModel> {
  const result: Record<string, CollectionModel> = {};
  for (const [name, model] of Object.entries(types)) {
    const derives = collectionsUi?.[name]?.editor === "blocks" && BODY_FIELD in model.fields && !(BLOCK_ALIASES_FIELD in model.fields);
    result[name] = derives ? { ...model, fields: { ...model.fields, [BLOCK_ALIASES_FIELD]: { type: "json" } } } : model;
  }
  return result;
}

function referenceSchemas(stored: Record<string, CollectionModel>, schemas: Record<string, string | Record<string, unknown>>): Record<string, string | Record<string, unknown>> {
  return Object.fromEntries(Object.entries(schemas).filter(([key]) => {
    const [type = "", field = ""] = key.split(".");
    return isJsonField(stored[type]?.fields[field]);
  }));
}

function referencesConfig(types: Record<string, CollectionModel>, schemas: Record<string, string | Record<string, unknown>>): Record<string, unknown> {
  const indexed = referenceSchemas(contentTypesOf(types), schemas);
  return { targets: referenceTargets(types), ...(Object.keys(indexed).length === 0 ? {} : { schemas: indexed, watch: process.env.NODE_ENV !== "production" }) };
}

function deliveryTypes(types: Record<string, CollectionModel>): Record<string, Record<string, never>> {
  return Object.fromEntries(routedCollections(types).map((name) => [name, {}]));
}

function pluralLabel(name: string, ui: WorkflowUi | undefined): string {
  const label: unknown = typeof ui === "object" && ui !== null && "label" in ui ? Reflect.get(ui, "label") : undefined;
  const plural: unknown = typeof label === "object" && label !== null ? Reflect.get(label, "plural") : undefined;
  if (typeof plural === "string") return plural;
  const en: unknown = typeof plural === "object" && plural !== null ? Reflect.get(plural, "en") : undefined;
  return typeof en === "string" ? en : name.charAt(0).toUpperCase() + name.slice(1);
}

function llmsHeadings(types: Record<string, CollectionModel>, collectionsUi: Record<string, WorkflowUi> | undefined): Record<string, string> {
  return { ...DEFAULT_LLMS_HEADINGS, ...Object.fromEntries(mountedCollections(types).map((name) => [name, pluralLabel(name, collectionsUi?.[name])])) };
}

function contentTypesOf(types: Record<string, CollectionModel>): Record<string, CollectionModel> {
  const stored = Object.fromEntries(Object.entries(types).map(([name, { mount: _mount, ...model }]) => [name, model]));
  if (mountedCollections(types).length === 0) return stored;
  const settings = stored.settings;
  if (settings === undefined || settings.kind !== "single") throw new Error(`presetModuleConfig: collection "${mountedCollections(types)[0] ?? ""}" is mounted, which needs a single "settings" collection to store the mount pages`);
  if (MOUNTS_FIELD in settings.fields) throw new Error(`presetModuleConfig: "settings.${MOUNTS_FIELD}" is reserved for the mount pages of mounted collections`);
  return { ...stored, settings: { ...settings, fields: { ...settings.fields, [MOUNTS_FIELD]: { type: "json", required: true } } } };
}

interface LiveStates {
  statusField: string;
  liveStatuses: string[];
}

function liveStatesOf(types: Record<string, CollectionModel>, collectionsUi: Record<string, WorkflowUi> | undefined): LiveStates | undefined {
  const fields = new Set<string>();
  const live = new Set<string>();
  for (const [name, model] of Object.entries(types)) {
    if (!isGenericCollection(name) || model.kind !== "multi") continue;
    const workflow = resolveWorkflow(name, model, collectionsUi?.[name]);
    if (workflow === undefined) continue;
    fields.add(workflow.field);
    live.add(workflow.live);
  }
  if (fields.size === 0) return undefined;
  if (fields.size > 1) {
    throw new Error(
      `presetModuleConfig: feature "revisions" needs one status field across the collections, found ${[...fields].map((field) => `"${field}"`).join(", ")}`
      + ' – set "statusField" and "liveStatuses" via overrides["@michaelthielemann/kestrel-revisions-default"]',
    );
  }
  return { statusField: [...fields][0] ?? "", liveStatuses: [...live].sort() };
}

const RESERVED_PATHS = [MOUNT_PATH, "/admin", MEDIA_PUBLIC_PATH];
const DEFAULT_HOME_SLUG = "home";

function liveWhenOf(name: string, model: CollectionModel, ui: WorkflowUi | undefined): Record<string, string> {
  const workflow = resolveWorkflow(name, model, ui);
  return workflow === undefined ? {} : { [workflow.field]: workflow.live };
}

function siteConfig(types: Record<string, CollectionModel>, options: PresetModuleConfigOptions): Record<string, unknown> {
  const pages = types[PAGES_COLLECTION];
  if (pages === undefined) return {};
  const routes: Record<string, Record<string, unknown>> = {
    [PAGES_COLLECTION]: { home: options.homeSlug ?? DEFAULT_HOME_SLUG, liveWhen: liveWhenOf(PAGES_COLLECTION, pages, options.collectionsUi?.[PAGES_COLLECTION]) },
  };
  const parentField = parentFieldOf(PAGES_COLLECTION, pages);
  if (parentField !== undefined && routes[PAGES_COLLECTION] !== undefined) routes[PAGES_COLLECTION].parentField = parentField;
  const mounted = mountedCollections(types);
  for (const name of mounted) {
    const model = types[name];
    if (model !== undefined) routes[name] = { mount: true, liveWhen: liveWhenOf(name, model, options.collectionsUi?.[name]) };
  }
  return {
    routes,
    ...(mounted.length === 0 ? {} : { mounts: { type: "settings", field: MOUNTS_FIELD } }),
    prefixPrimary: options.prefixPrimary ?? false,
    reservedPaths: [...RESERVED_PATHS],
    ...(options.paths?.maxCascade === undefined ? {} : { maxCascade: options.paths.maxCascade }),
  };
}

function mergedConfig(config: unknown, override: Record<string, unknown>): unknown {
  return typeof config === "object" && config !== null ? { ...config, ...override } : { ...override };
}

function withoutKeys(values: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const excluded = new Set(keys);
  return Object.fromEntries(Object.entries(values).filter(([key]) => !excluded.has(key)));
}

function applyModuleOverrides(modules: ModuleEntry[], overrides: Partial<Record<string, Record<string, unknown>>> | undefined): ModuleEntry[] {
  if (overrides === undefined) return modules;
  const enabled = new Set(modules.map((entry) => entry.use));
  for (const use of Object.keys(overrides)) {
    if (!enabled.has(use)) throw new Error(`presetModuleConfig: overrides name module "${use}" which is not enabled`);
  }
  return modules.map((entry) => {
    const override = overrides[entry.use];
    if (override === undefined) return entry;
    if (entry.defaults !== undefined) {
      const values = withoutKeys(entry.defaults.values, Object.keys(override));
      return { use: entry.use, defaults: { from: entry.defaults.from, values }, config: override };
    }
    return { use: entry.use, config: mergedConfig(entry.config, override) };
  });
}

function renderDependencies(queued: boolean, queue: PresetEventsQueue | undefined): Record<string, unknown> {
  if (!queued) return { render: "background", rendererReadsDocument: true };
  return {
    render: "events",
    rendererReadsDocument: true,
    maxAttempts: queue?.maxAttempts ?? QUEUE_DEFAULT_MAX_ATTEMPTS,
    backoffSeconds: [...(queue?.backoffSeconds ?? QUEUE_DEFAULT_BACKOFF_SECONDS)],
  };
}

function siteUrlOf(llms: PresetLlms | undefined): string | undefined {
  if (llms?.siteUrl !== undefined) return llms.siteUrl;
  const fromEnv = process.env.NUXT_PUBLIC_SITE_URL;
  return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : undefined;
}

export function presetModuleConfig(options: PresetModuleConfigOptions): ModuleEntry[] {
  const dataDir = requireOption(options.dataDir, "dataDir");
  const blobstore = requireOption(options.blobstore, "blobstore");
  const model = requireOption(options.model, "model");
  const features = requireOption(options.features, "features");
  const roles = requireOption(options.roles, "roles");
  const bootstrap = requireOption(options.bootstrap, "bootstrap");
  const declaredTypes = requireOption(model.types, "model.types");
  const fieldTypes = options.fieldTypes ?? {};
  const types: Record<string, CollectionModel> = withDerivedBlockAliases(resolveStorageTypes(declaredTypes, fieldTypes, "presetModuleConfig"), options.collectionsUi);

  for (const locale of [...(model.locales ?? []), ...(model.defaultLocale === undefined ? [] : [model.defaultLocale])]) {
    if ((RESERVED_PAGE_SEGMENTS as readonly string[]).includes(locale)) {
      throw new Error(`presetModuleConfig: locale "${locale}" is reserved (it would put pages under /${locale}/, which the server uses for ${locale})`);
    }
  }

  const enabled = new Set<Feature>(features);
  const databaseFile = resolve(dataDir, DATABASE_FILE);
  const session = { ...DEFAULT_SESSION, ...options.session };
  const siteUrl = siteUrlOf(options.llms);
  const publicCopy = enabled.has("delivery") ? { publicCopy: { prefix: SITE_PREFIX } } : {};
  const mediaAllowedTypes = options.media?.allowedTypes ?? DEFAULT_MEDIA_ALLOWED_TYPES;
  const mediaDeniedTypes = options.media?.deniedTypes ?? DEFAULT_MEDIA_DENIED_TYPES;

  const modules: ModuleEntry[] = [{ use: blobstore.use, config: blobstore.config }];

  if (enabled.has("replication")) modules.push(preset("@michaelthielemann/kestrel-replication-sqlite", { file: databaseFile }));
  modules.push(preset("@michaelthielemann/kestrel-persistence-sqlite", { file: databaseFile }));
  if (enabled.has("sanitizeSvg")) modules.push({ use: SANITIZE_SVG_MODULE, config: {} });

  modules.push(preset(MEDIA_MODULE, {
    prefix: MEDIA_PREFIX,
    publicPath: MEDIA_PUBLIC_PATH,
    allowedTypes: mediaAllowedTypes,
    deniedTypes: mediaDeniedTypes,
    maxBytes: options.media?.maxBytes ?? DEFAULT_MEDIA_MAX_BYTES,
    ...(model.locales === undefined ? {} : { locales: [...model.locales] }),
    ...(model.defaultLocale === undefined ? {} : { defaultLocale: model.defaultLocale }),
    ...publicCopy,
  }));

  if (enabled.has("images")) {
    modules.push(preset("@michaelthielemann/kestrel-images-default", { publicPath: MEDIA_PUBLIC_PATH, ...publicCopy }));
  }

  modules.push(preset("@michaelthielemann/kestrel-authn-multi", {
    identifier: session.identifier,
    minPasswordLength: session.minPasswordLength,
    sessionTtlSeconds: session.sessionTtlSeconds,
    secureCookie: session.secureCookie,
    bootstrap: { username: bootstrap.username, passwordHash: bootstrap.passwordHash, roles: bootstrap.roles ?? ["admin"] },
  }));
  modules.push(preset("@michaelthielemann/kestrel-authz-roles", {
    roles: roles.roles,
    anonymous: roles.anonymous,
    anonymousFields: withConsumerGrants(anonymousFieldGrants({ ...(model.locales === undefined ? {} : { locales: model.locales }), types }, features, roles.anonymous, options.pipelines), roles.anonymousFields),
    ...(roles.fields === undefined ? {} : { fields: roles.fields }),
  }));
  modules.push(preset("@michaelthielemann/kestrel-content-default", {
    ...(model.locales === undefined ? {} : { locales: [...model.locales] }),
    ...(model.defaultLocale === undefined ? {} : { defaultLocale: model.defaultLocale }),
    types: contentTypesOf(types),
  }));
  modules.push(preset("@michaelthielemann/kestrel-site-default", siteConfig(types, options)));

  const schemas = presetSchemas({ features, collections: declaredTypes, fieldTypes, ...(options.collectionsUi === undefined ? {} : { collectionsUi: options.collectionsUi }) });
  if (enabled.has("references")) modules.push(preset("@michaelthielemann/kestrel-references-default", referencesConfig(types, schemas)));
  if (enabled.has("links")) modules.push(preset("@michaelthielemann/kestrel-links-default", { ...DEFAULT_LINKS }));

  modules.push(preset("@michaelthielemann/kestrel-validate-jsonschema", {
    schemas,
    watch: process.env.NODE_ENV !== "production",
  }));

  if (enabled.has("delivery")) {
    modules.push({ use: "@michaelthielemann/kestrel-renderer-nuxt", config: {} });
    modules.push(preset("@michaelthielemann/kestrel-delivery-static", {
      types: deliveryTypes(types),
      prefix: SITE_PREFIX,
      reservedPaths: [...RESERVED_PATHS],
      llms: {
        full: options.llms?.full ?? true,
        headings: options.llms?.headings ?? llmsHeadings(types, options.collectionsUi),
        ...(siteUrl === undefined ? {} : { siteUrl }),
      },
      dependencies: renderDependencies(enabled.has("eventsQueue"), options.eventsQueue),
    }));
  }

  if (enabled.has("revisions")) {
    const live = liveStatesOf(types, options.collectionsUi);
    modules.push(preset("@michaelthielemann/kestrel-revisions-default", {
      ...(options.revisions?.keep === undefined ? {} : { keep: options.revisions.keep }),
      ...(options.revisions?.maxSnapshotBytes === undefined ? {} : { maxSnapshotBytes: options.revisions.maxSnapshotBytes }),
      ...(options.revisions?.pruneOnWrite === undefined ? {} : { pruneOnWrite: options.revisions.pruneOnWrite }),
      ...(options.revisions?.maxLimit === undefined ? {} : { maxLimit: options.revisions.maxLimit }),
      ...(live === undefined ? {} : live),
    }));
  }

  if (enabled.has("redirects")) modules.push(preset("@michaelthielemann/kestrel-redirects-default", { prefix: SITE_PREFIX }));
  if (enabled.has("audit")) {
    modules.push(preset("@michaelthielemann/kestrel-audit-persistence", {
      ...(options.audit?.retentionDays === undefined ? {} : { retentionDays: options.audit.retentionDays }),
    }));
  }
  modules.push({ use: "@michaelthielemann/kestrel-events-inmemory", config: {} });
  modules.push(
    enabled.has("eventsQueue")
      ? preset("@michaelthielemann/kestrel-events-queue", {
          ...options.eventsQueue,
          relayPipelines: relayPipelinesFor(features),
          lanes: lanesFor(features),
        })
      : { use: "@michaelthielemann/kestrel-events-direct", config: {} },
  );
  if (enabled.has("ratelimit")) {
    modules.push(preset("@michaelthielemann/kestrel-ratelimit-memory", {
      buckets: {
        login: { ...(options.ratelimit?.login ?? DEFAULT_LOGIN_BUCKET) },
        loginAccount: { ...(options.ratelimit?.loginAccount ?? DEFAULT_LOGIN_ACCOUNT_BUCKET), key: "username" },
        passwordCheck: { ...(options.ratelimit?.passwordCheck ?? DEFAULT_PASSWORD_CHECK_BUCKET), key: "identity" },
      },
    }));
  }
  if (enabled.has("insights")) modules.push({ use: "@michaelthielemann/kestrel-insights", config: {} });
  if (enabled.has("migrations")) {
    const migrations = requireOption(options.migrations, "migrations");
    modules.push(preset("@michaelthielemann/kestrel-migrations-default", {
      migrations: [...migrations.migrations],
      ...(migrations.mode === undefined ? {} : { mode: migrations.mode }),
    }));
  }

  const merged = applyModuleOverrides(modules, options.overrides);
  assertSvgSanitized(merged);
  return merged;
}
