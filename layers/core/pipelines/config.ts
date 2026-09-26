import { resolve } from "node:path";
import { mediaTypeAllowed } from "@michaelthielemann/kestrel-contracts/mediaType";
import { MEDIA_PUBLIC_PATH, MOUNT_PATH, RESERVED_PAGE_SEGMENTS } from "../mount-path";
import { resolveWorkflow } from "../collections-ui/workflow";
import type { WorkflowUi } from "../collections-ui/workflow";
import { resolveStorageTypes } from "../field-types";
import type { FieldTypes } from "../field-types";
import { isGenericCollection, isPageLikeCollection } from "./collections";
import { anonymousFieldGrants, withConsumerGrants } from "./field-grants";
import { parentFieldOf } from "./paths";
import type { PipelineChanges } from "./field-grants";
import type { CollectionModel } from "./collections";
import { lanesFor, presetSchemas, relayPipelinesFor } from "./index";
import type { Feature } from "./index";

export interface ModuleEntry {
  use: string;
  config: unknown;
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
  login?: { limit: number; windowSeconds: number };
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
}

export interface PresetModuleConfigOptions {
  dataDir: string;
  blobstore: ModuleEntry;
  model: PresetContentModel;
  features: readonly Feature[];
  roles: PresetRoles;
  bootstrap: PresetBootstrap;
  collectionsUi?: Record<string, WorkflowUi>;
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

const DEFAULT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MEDIA_ALLOWED_TYPES = ["image/*", "application/pdf"];
const DEFAULT_MEDIA_DENIED_TYPES = ["text/html", "application/xhtml+xml"];
const SVG_CONTENT_TYPE = "image/svg+xml";
const MEDIA_MODULE = "@michaelthielemann/kestrel-media-default";
const SANITIZE_SVG_MODULE = "@michaelthielemann/kestrel-sanitize-svg";
const DEFAULT_LOGIN_BUCKET = { limit: 5, windowSeconds: 60 };
const DEFAULT_LLMS_HEADINGS = { [PAGES_COLLECTION]: "Pages" };
const DEFAULT_SESSION: Required<PresetSession> = { identifier: "username", minPasswordLength: 8, sessionTtlSeconds: 86400 };
const DEFAULT_LINKS = { timeoutMs: 10000, concurrency: 4, recheckAfterSeconds: 21600 };

function requireOption<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`presetModuleConfig: option "${name}" is required`);
  return value;
}

function typePatterns(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((pattern): pattern is string => typeof pattern === "string") : undefined;
}

function assertSvgSanitized(modules: readonly ModuleEntry[]): void {
  const media = modules.find((entry) => entry.use === MEDIA_MODULE)?.config;
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
  const targets: Record<string, ReferenceTarget> = {};
  if (PAGES_COLLECTION in types) targets[PAGES_COLLECTION] = { content: PAGES_COLLECTION };
  for (const model of Object.values(types)) {
    for (const field of Object.values(model.fields)) {
      const to = refTargetOf(field);
      if (to === undefined) continue;
      if (to === MEDIA_REFERENCE_TARGET) targets[to] = { media: true };
      else if (to in types) targets[to] = { content: to };
    }
  }
  return targets;
}

function deliveryTypes(types: Record<string, CollectionModel>): Record<string, Record<string, never>> {
  const delivered: Record<string, Record<string, never>> = {};
  for (const [name, model] of Object.entries(types)) {
    if (isPageLikeCollection(name, model)) delivered[name] = {};
  }
  return delivered;
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
  return {
    routes,
    prefixPrimary: options.prefixPrimary ?? false,
    reservedPaths: [...RESERVED_PATHS],
    ...(options.paths?.maxCascade === undefined ? {} : { maxCascade: options.paths.maxCascade }),
  };
}

function mergedConfig(config: unknown, override: Record<string, unknown>): unknown {
  return typeof config === "object" && config !== null ? { ...config, ...override } : { ...override };
}

function applyModuleOverrides(modules: ModuleEntry[], overrides: Partial<Record<string, Record<string, unknown>>> | undefined): ModuleEntry[] {
  if (overrides === undefined) return modules;
  const enabled = new Set(modules.map((entry) => entry.use));
  for (const use of Object.keys(overrides)) {
    if (!enabled.has(use)) throw new Error(`presetModuleConfig: overrides name module "${use}" which is not enabled`);
  }
  return modules.map((entry) => {
    const override = overrides[entry.use];
    return override === undefined ? entry : { use: entry.use, config: mergedConfig(entry.config, override) };
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
  const types: Record<string, CollectionModel> = resolveStorageTypes(declaredTypes, fieldTypes, "presetModuleConfig");

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

  if (enabled.has("replication")) modules.push({ use: "@michaelthielemann/kestrel-replication-sqlite", config: { file: databaseFile } });
  modules.push({ use: "@michaelthielemann/kestrel-persistence-sqlite", config: { file: databaseFile } });
  if (enabled.has("sanitizeSvg")) modules.push({ use: SANITIZE_SVG_MODULE, config: {} });

  modules.push({
    use: MEDIA_MODULE,
    config: {
      prefix: MEDIA_PREFIX,
      publicPath: MEDIA_PUBLIC_PATH,
      allowedTypes: mediaAllowedTypes,
      deniedTypes: mediaDeniedTypes,
      maxBytes: options.media?.maxBytes ?? DEFAULT_MEDIA_MAX_BYTES,
      ...(model.locales === undefined ? {} : { locales: [...model.locales] }),
      ...(model.defaultLocale === undefined ? {} : { defaultLocale: model.defaultLocale }),
      ...publicCopy,
    },
  });

  if (enabled.has("images")) {
    modules.push({ use: "@michaelthielemann/kestrel-images-default", config: { publicPath: MEDIA_PUBLIC_PATH, ...publicCopy } });
  }

  modules.push({
    use: "@michaelthielemann/kestrel-authn-multi",
    config: {
      identifier: session.identifier,
      minPasswordLength: session.minPasswordLength,
      sessionTtlSeconds: session.sessionTtlSeconds,
      bootstrap: { username: bootstrap.username, passwordHash: bootstrap.passwordHash, roles: bootstrap.roles ?? ["admin"] },
    },
  });
  modules.push({
    use: "@michaelthielemann/kestrel-authz-roles",
    config: {
      roles: roles.roles,
      anonymous: roles.anonymous,
      anonymousFields: withConsumerGrants(anonymousFieldGrants({ ...(model.locales === undefined ? {} : { locales: model.locales }), types }, features, roles.anonymous, options.pipelines), roles.anonymousFields),
      ...(roles.fields === undefined ? {} : { fields: roles.fields }),
    },
  });
  modules.push({
    use: "@michaelthielemann/kestrel-content-default",
    config: {
      ...(model.locales === undefined ? {} : { locales: [...model.locales] }),
      ...(model.defaultLocale === undefined ? {} : { defaultLocale: model.defaultLocale }),
      types,
    },
  });
  modules.push({ use: "@michaelthielemann/kestrel-site-default", config: siteConfig(types, options) });

  if (enabled.has("references")) modules.push({ use: "@michaelthielemann/kestrel-references-default", config: { targets: referenceTargets(types) } });
  if (enabled.has("links")) modules.push({ use: "@michaelthielemann/kestrel-links-default", config: { ...DEFAULT_LINKS } });

  modules.push({
    use: "@michaelthielemann/kestrel-validate-jsonschema",
    config: { schemas: presetSchemas({ features, collections: declaredTypes, fieldTypes }), watch: process.env.NODE_ENV !== "production" },
  });

  if (enabled.has("delivery")) {
    modules.push({ use: "@michaelthielemann/kestrel-renderer-nuxt", config: {} });
    modules.push({
      use: "@michaelthielemann/kestrel-delivery-static",
      config: {
        types: deliveryTypes(types),
        prefix: SITE_PREFIX,
        reservedPaths: [...RESERVED_PATHS],
        llms: {
          full: options.llms?.full ?? true,
          headings: options.llms?.headings ?? { ...DEFAULT_LLMS_HEADINGS },
          ...(siteUrl === undefined ? {} : { siteUrl }),
        },
        dependencies: renderDependencies(enabled.has("eventsQueue"), options.eventsQueue),
      },
    });
  }

  if (enabled.has("revisions")) {
    const live = liveStatesOf(types, options.collectionsUi);
    modules.push({
      use: "@michaelthielemann/kestrel-revisions-default",
      config: {
        ...(options.revisions?.keep === undefined ? {} : { keep: options.revisions.keep }),
        ...(options.revisions?.maxSnapshotBytes === undefined ? {} : { maxSnapshotBytes: options.revisions.maxSnapshotBytes }),
        ...(options.revisions?.pruneOnWrite === undefined ? {} : { pruneOnWrite: options.revisions.pruneOnWrite }),
        ...(options.revisions?.maxLimit === undefined ? {} : { maxLimit: options.revisions.maxLimit }),
        ...(live === undefined ? {} : live),
      },
    });
  }

  if (enabled.has("redirects")) modules.push({ use: "@michaelthielemann/kestrel-redirects-default", config: { prefix: SITE_PREFIX } });
  if (enabled.has("audit")) {
    modules.push({
      use: "@michaelthielemann/kestrel-audit-persistence",
      config: { ...(options.audit?.retentionDays === undefined ? {} : { retentionDays: options.audit.retentionDays }) },
    });
  }
  modules.push({ use: "@michaelthielemann/kestrel-events-inmemory", config: {} });
  modules.push(
    enabled.has("eventsQueue")
      ? {
          use: "@michaelthielemann/kestrel-events-queue",
          config: {
            ...options.eventsQueue,
            relayPipelines: relayPipelinesFor(features),
            lanes: lanesFor(features),
          },
        }
      : { use: "@michaelthielemann/kestrel-events-direct", config: {} },
  );
  if (enabled.has("ratelimit")) {
    modules.push({
      use: "@michaelthielemann/kestrel-ratelimit-memory",
      config: { buckets: { login: { ...(options.ratelimit?.login ?? DEFAULT_LOGIN_BUCKET) } } },
    });
  }
  if (enabled.has("insights")) modules.push({ use: "@michaelthielemann/kestrel-insights", config: {} });
  if (enabled.has("migrations")) {
    const migrations = requireOption(options.migrations, "migrations");
    modules.push({
      use: "@michaelthielemann/kestrel-migrations-default",
      config: { migrations: [...migrations.migrations], ...(migrations.mode === undefined ? {} : { mode: migrations.mode }) },
    });
  }

  const merged = applyModuleOverrides(modules, options.overrides);
  assertSvgSanitized(merged);
  return merged;
}
