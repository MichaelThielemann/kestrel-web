import { resolve } from "node:path";
import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import { mediaTypeAllowed } from "@michaelthielemann/kestrel-contracts/helpers/mediaType";
import { normalizeSiteUrl } from "@michaelthielemann/kestrel-delivery-static/site-url";
import { MEDIA_PUBLIC_PATH, MOUNT_PATH, MOUNTS_FIELD, RESERVED_PAGE_SEGMENTS, envBuildAssetsPath, servedPathPrefixes } from "../mount-path";
import { resolveWorkflow } from "../collections-ui/workflow";
import type { WorkflowUi } from "../collections-ui/workflow";
import { BLOCK_ALIASES_FIELD, BODY_FIELD } from "../collections-ui/serialize";
import { deviceKeys, envRobots, envStorageMigrations, mfaKey, type EnvMap, type SigningKeys } from "../config";
import { resolveStorageTypes } from "../field-types";
import type { FieldTypes } from "../field-types";
import { isGenericCollection } from "./collections";
import { layerBucket } from "./ratelimit-buckets";
import { MEDIA_TRASH_RETENTION_KEY } from "./media-trash";
import { anonymousFieldGrants, withConsumerGrants } from "./field-grants";
import { mountedCollections, parentFieldOf, routedCollections } from "./paths";
import type { PipelineChanges } from "./field-grants";
import type { CollectionModel } from "./collections";
import { INDEX_EXPORT_DELAYS } from "./index-delays";
import { delaysFor, lanesFor, presetSchemas, relayPipelinesFor } from "./index";
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
  /** Days a deleted media item stays in the trash before the nightly run removes it for good; default 30. `0` turns the trash off: no trash pipelines are composed, and the admin deletes for good after a confirmation dialog. Restore or empty the trash before setting `0`: items left in it cannot be listed, restored or purged while the trash is off. */
  trashRetentionDays?: number;
}

export interface PresetMfa {
  /** The key that seals every second factor's secret: 32 bytes as 64 hex digits or 43 base64url characters, kept outside the database; default `mfaKey()`, which reads `KESTREL_MFA_KEY`. */
  secretKey?: string;
  /** Keys `secretKey` replaced: factors sealed under one of them keep working and move to `secretKey` at their next sign-in. */
  previousSecretKeys?: string[];
  /** The name an authenticator app shows next to the account; the site title is a good choice. */
  issuer?: string;
  /** Who must set up a second factor before signing in; default every account. */
  enforce?: "all" | "none" | { permissions: string[] };
}

export interface PresetRateLimit {
  /** Sign-in attempts per client address (an IPv6 address by its /64). */
  login?: { limit: number; windowSeconds: number };
  /** Sign-in attempts per account, from any address; `maxBlockSeconds` bounds the growing block. */
  loginAccount?: { limit: number; windowSeconds: number; maxBlockSeconds?: number };
  /** Password checks of a signed-in user: changing the password and confirming it again. */
  passwordCheck?: { limit: number; windowSeconds: number; maxBlockSeconds?: number };
  /** Sign-in attempts from each device the account signed in from before, counted in place of `loginAccount`, so a block of the account does not stop its owner's devices. */
  knownDevice?: { limit: number; windowSeconds: number; maxBlockSeconds?: number };
  /** How the cookies of known devices are signed: `secretKey` (32 bytes as 64 hex digits or 43 base64url characters; default `deviceKeys()`: `KESTREL_DEVICE_KEY`, else the `mfa` feature's keys), `previousSecretKeys` it replaced, whose cookies stay valid until they expire, and `maxAgeSeconds` (default 30 days). */
  deviceCookies?: { secretKey?: string; previousSecretKeys?: string[]; maxAgeSeconds?: number };
}

export interface PresetLlms {
  full?: boolean;
  headings?: Record<string, string>;
}

/** What delivery-static writes to `robots.txt`; `false` leaves robots.txt to the site. */
export type PresetRobots =
  | {
      /** `"allow"` lets crawlers in, `"disallow"` keeps them out; without it, the policy `KESTREL_ROBOTS_POLICY` names, and with that unset too `allow` in a production build (`nuxt build` fixes `NODE_ENV` to `production` inside the server bundle, whatever the running process sets) and `disallow` under `nuxt dev`, with a warning at boot. */
      policy?: "allow" | "disallow";
      /** Lines appended verbatim after the policy, such as `Disallow: /preview/`. */
      extra?: string[];
    }
  | false;

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
  /** Whether delivery-static writes sitemap.xml; default `true`. */
  sitemap?: boolean;
  robots?: PresetRobots;
  migrations?: PresetMigrations;
  /** The second-factor settings of the `mfa` feature. */
  mfa?: PresetMfa;
  revisions?: PresetRevisions;
  audit?: PresetAudit;
  session?: PresetSession;
  eventsQueue?: PresetEventsQueue;
  /** The slug served at a locale's root; the same value `definePreset()` takes as `homeSlug`. Default `"home"`. */
  homeSlug?: string;
  /** Whether the default locale's public paths carry its prefix too, as `shared/model` declares it. Default `false`. */
  prefixPrimary?: boolean;
  paths?: PresetPaths;
  /**
   * The URL path the Nuxt build assets are served under, `app.baseURL` joined with `app.buildAssetsDir`
   * (`/assets` for `buildAssetsDir: "/assets/"`, `/site/assets` with `baseURL: "/site/"`). No redirect source may
   * lie under it. Default: the path `NUXT_APP_BASE_URL` and `NUXT_APP_BUILD_ASSETS_DIR` name when the server starts, `/_nuxt` without
   * them. A site that moves the build assets at build time sets this option or the same variables at start too.
   */
  buildAssetsPath?: string;
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
/** The name of the SQLite database file `presetModuleConfig()` opens in its `dataDir`. */
export const PRESET_DATABASE_FILE = "kestrel.db";

/** The SQLite database file `presetModuleConfig()` opens: `KESTREL_DATABASE_FILE` in `env` resolved against `base` when it is set, else {@link PRESET_DATABASE_FILE} in `dataDir`. */
export function presetDatabaseFile(dataDir: string, env: EnvMap = process.env, base: string = process.cwd()): string {
  const file = env.KESTREL_DATABASE_FILE;
  return file === undefined || file === "" ? resolve(dataDir, PRESET_DATABASE_FILE) : resolve(base, file);
}
/** The `maxAttempts` of `kestrel-events-queue` when its config names none; delivery-static retries a failed re-render as often. */
export const QUEUE_DEFAULT_MAX_ATTEMPTS = 5;
/** The `backoffSeconds` of `kestrel-events-queue` when its config names none; delivery-static waits as long between re-render attempts. */
export const QUEUE_DEFAULT_BACKOFF_SECONDS: readonly number[] = [5, 30, 120, 600];
const MEDIA_REFERENCE_TARGET = "media";
const PAGES_COLLECTION = "pages";
const PRESET_SOURCE = "preset";

const DEFAULT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MEDIA_TRASH_RETENTION_DAYS = 30;
const DEFAULT_MEDIA_ALLOWED_TYPES = ["image/*", "application/pdf"];
const DEFAULT_MEDIA_DENIED_TYPES = ["text/html", "application/xhtml+xml"];
const SVG_CONTENT_TYPE = "image/svg+xml";
const MEDIA_MODULE = "@michaelthielemann/kestrel-media-default";
const SANITIZE_SVG_MODULE = "@michaelthielemann/kestrel-sanitize-svg";
const DEFAULT_LLMS_HEADINGS = { [PAGES_COLLECTION]: "Pages" };
const DEFAULT_SESSION: Required<PresetSession> = { identifier: "username", minPasswordLength: 12, sessionTtlSeconds: 86400, secureCookie: true };
const DEFAULT_LINKS = { timeoutMs: 10000, concurrency: 4, recheckAfterSeconds: 21600 };

const MEDIA_LIST_GRANTS = new Set(["*", "media.*", "media.list"]);

/** Every role that may read media also lists the library: `media.list` joins a role that grants `media.read` without it. */
export function withMediaListing(roles: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(roles).map(([role, grants]) => [role, grants.includes("media.read") && !grants.some((grant) => MEDIA_LIST_GRANTS.has(grant)) ? [...grants, "media.list"] : grants]));
}

function requireOption<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`presetModuleConfig: option "${name}" is required`);
  return value;
}

function trashRetention(media: PresetMediaPolicy | undefined): Record<string, number> {
  const days = media?.trashRetentionDays ?? DEFAULT_MEDIA_TRASH_RETENTION_DAYS;
  if (!Number.isInteger(days) || days < 0) throw new Error("presetModuleConfig: media.trashRetentionDays must be a whole number of days, 0 to turn the trash off");
  return days === 0 ? {} : { [MEDIA_TRASH_RETENTION_KEY]: days };
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
  if (!queued) return { render: "background", rendererReadsDocument: true, indexesDelayMs: INDEX_EXPORT_DELAYS.background };
  return {
    render: "events",
    rendererReadsDocument: true,
    maxAttempts: queue?.maxAttempts ?? QUEUE_DEFAULT_MAX_ATTEMPTS,
    backoffSeconds: [...(queue?.backoffSeconds ?? QUEUE_DEFAULT_BACKOFF_SECONDS)],
  };
}

let warnedWithoutSiteUrl = false;

function assertNoLlmsSiteUrl(llms: PresetLlms | undefined): void {
  if (llms !== undefined && "siteUrl" in llms) {
    throw new Error("presetModuleConfig: llms.siteUrl is gone – sitemap.xml, llms.txt and every page's canonical link, og:url and og:image take the site URL from NUXT_PUBLIC_SITE_URL; remove llms.siteUrl and set NUXT_PUBLIC_SITE_URL instead");
  }
}

function deliverySiteUrl(): string | undefined {
  const value = process.env.NUXT_PUBLIC_SITE_URL;
  if (value === undefined || value === "") return undefined;
  try {
    return normalizeSiteUrl(value);
  } catch (err) {
    throw new Error(`presetModuleConfig: NUXT_PUBLIC_SITE_URL "${value}" is not a site URL – ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

let warnedRobotsDefault = false;
let warnedRobotsEnvIgnored = false;

function warnRobotsEnvIgnored(env: "allow" | "disallow", policy: "allow" | "disallow" | false): void {
  if (warnedRobotsEnvIgnored) return;
  warnedRobotsEnvIgnored = true;
  console.warn(policy === false
    ? `presetModuleConfig: KESTREL_ROBOTS_POLICY is "${env}" but is ignored, since the robots option of presetModuleConfig() is false and no robots.txt is written – remove robots: false to let the variable decide, or unset KESTREL_ROBOTS_POLICY`
    : `presetModuleConfig: KESTREL_ROBOTS_POLICY is "${env}" but is ignored, since the robots option of presetModuleConfig() sets robots.policy "${policy}" – remove robots.policy to let the variable decide, or unset KESTREL_ROBOTS_POLICY`);
}

function robotsWithPolicy(robots: PresetRobots | undefined): PresetRobots {
  const configured = envRobots().policy;
  if (robots === false) {
    if (configured !== undefined) warnRobotsEnvIgnored(configured, false);
    return false;
  }
  if (robots?.policy !== undefined) {
    if (configured !== undefined && robots.policy !== configured) warnRobotsEnvIgnored(configured, robots.policy);
    return robots;
  }
  if (configured !== undefined) return { ...robots, policy: configured };
  const policy = process.env.NODE_ENV === "production" ? "allow" : "disallow";
  if (!warnedRobotsDefault) {
    warnedRobotsDefault = true;
    console.warn(policy === "allow"
      ? "presetModuleConfig: robots.policy is not set – robots.txt allows crawlers because this is a production build; set robots.policy or KESTREL_ROBOTS_POLICY"
      : "presetModuleConfig: robots.policy is not set – robots.txt keeps crawlers out because this is not a production build; set robots.policy or KESTREL_ROBOTS_POLICY");
  }
  return { ...robots, policy };
}

function warnWithoutSiteUrl(): void {
  if (warnedWithoutSiteUrl) return;
  warnedWithoutSiteUrl = true;
  console.warn("presetModuleConfig: NUXT_PUBLIC_SITE_URL is not set, so the site has no site URL – no sitemap.xml is written, llms.txt lists paths instead of URLs and pages carry no canonical link");
}

function requireBuildAssetsPath(value: string): string {
  const path = value.replace(/\/+$/, "");
  if (!path.startsWith("/") || path === "") throw new Error(`presetModuleConfig: buildAssetsPath must be a URL path below the root, such as "/_nuxt", not ${JSON.stringify(value)}`);
  return path;
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

  const buildAssetsPath = options.buildAssetsPath === undefined ? envBuildAssetsPath() : requireBuildAssetsPath(options.buildAssetsPath);
  const enabled = new Set<Feature>(features);
  const databaseFile = presetDatabaseFile(dataDir);
  const session = { ...DEFAULT_SESSION, ...options.session };
  assertNoLlmsSiteUrl(options.llms);
  const publicCopy = enabled.has("delivery") ? { publicCopy: { prefix: SITE_PREFIX } } : {};
  const mediaAllowedTypes = options.media?.allowedTypes ?? DEFAULT_MEDIA_ALLOWED_TYPES;
  const mediaDeniedTypes = options.media?.deniedTypes ?? DEFAULT_MEDIA_DENIED_TYPES;
  const storageMigrations = envStorageMigrations();

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
    storageMigrations,
    ...trashRetention(options.media),
  }));

  if (enabled.has("images")) {
    modules.push(preset("@michaelthielemann/kestrel-images-default", { publicPath: MEDIA_PUBLIC_PATH, ...publicCopy, storageMigrations }));
  }

  modules.push(preset("@michaelthielemann/kestrel-authn-multi", {
    identifier: session.identifier,
    minPasswordLength: session.minPasswordLength,
    sessionTtlSeconds: session.sessionTtlSeconds,
    secureCookie: session.secureCookie,
    bootstrap: { username: bootstrap.username, passwordHash: bootstrap.passwordHash, roles: bootstrap.roles ?? ["admin"] },
  }));
  modules.push(preset("@michaelthielemann/kestrel-authz-roles", {
    roles: withMediaListing(roles.roles),
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
    const siteUrl = deliverySiteUrl();
    if (siteUrl === undefined) warnWithoutSiteUrl();
    modules.push({ use: "@michaelthielemann/kestrel-renderer-nuxt", config: {} });
    modules.push(preset("@michaelthielemann/kestrel-delivery-static", {
      types: deliveryTypes(types),
      prefix: SITE_PREFIX,
      prefixPrimary: options.prefixPrimary ?? false,
      reservedPaths: [...RESERVED_PATHS],
      ...(siteUrl === undefined ? {} : { siteUrl }),
      ...(options.sitemap === undefined ? {} : { sitemap: options.sitemap }),
      robots: robotsWithPolicy(options.robots),
      llms: {
        full: options.llms?.full ?? true,
        headings: options.llms?.headings ?? llmsHeadings(types, options.collectionsUi),
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

  if (enabled.has("redirects")) modules.push(preset("@michaelthielemann/kestrel-redirects-default", { prefix: SITE_PREFIX, reservedPaths: servedPathPrefixes(buildAssetsPath) }));
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
          delayMs: delaysFor(features),
        })
      : { use: "@michaelthielemann/kestrel-events-direct", config: {} },
  );
  const mfaOptions = options.mfa ?? {};
  const mfaKeys: SigningKeys | undefined = enabled.has("mfa") ? { secretKey: mfaOptions.secretKey ?? mfaKey(), ...(mfaOptions.previousSecretKeys === undefined ? {} : { previousSecretKeys: mfaOptions.previousSecretKeys }) } : undefined;
  if (enabled.has("ratelimit")) {
    const ownDeviceKey = options.ratelimit?.deviceCookies?.secretKey;
    const deviceSigning: SigningKeys = ownDeviceKey === undefined ? deviceKeys(mfaKeys) : { secretKey: ownDeviceKey };
    const previousDeviceKeys = options.ratelimit?.deviceCookies?.previousSecretKeys ?? deviceSigning.previousSecretKeys;
    modules.push(preset("@michaelthielemann/kestrel-ratelimit-memory", {
      buckets: {
        login: layerBucket("login", session.identifier, options.ratelimit?.login),
        loginAccount: layerBucket("loginAccount", session.identifier, options.ratelimit?.loginAccount, options.ratelimit?.knownDevice),
        passwordCheck: layerBucket("passwordCheck", session.identifier, options.ratelimit?.passwordCheck),
      },
      deviceCookies: {
        secretKey: deviceSigning.secretKey,
        ...(previousDeviceKeys === undefined ? {} : { previousSecretKeys: previousDeviceKeys }),
        ...(options.ratelimit?.deviceCookies?.maxAgeSeconds === undefined ? {} : { maxAgeSeconds: options.ratelimit.deviceCookies.maxAgeSeconds }),
        secure: session.secureCookie,
      },
    }));
  }
  if (mfaKeys !== undefined) {
    const mfa = mfaOptions;
    modules.push(preset("@michaelthielemann/kestrel-mfa-totp", {
      ...mfaKeys,
      ...(mfa.issuer === undefined ? {} : { issuer: mfa.issuer }),
      ...(mfa.enforce === undefined ? {} : { enforce: mfa.enforce }),
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
