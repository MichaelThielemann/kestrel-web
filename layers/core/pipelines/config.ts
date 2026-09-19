import { resolve } from "node:path";
import { MOUNT_PATH } from "../mount-path";
import { resolveWorkflow } from "../collections-ui/workflow";
import type { WorkflowUi } from "../collections-ui/workflow";
import { resolveStorageTypes } from "../field-types";
import type { FieldTypes } from "../field-types";
import { isGenericCollection } from "./collections";
import type { CollectionModel } from "./collections";
import { presetSchemas } from "./index";
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
}

export interface PresetRevisions {
  keep?: number;
  maxSnapshotBytes?: number;
  pruneOnWrite?: boolean;
  maxLimit?: number;
}

export interface PresetMigrations {
  migrations: unknown[];
  mode?: string;
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
  session?: PresetSession;
  eventsQueue?: PresetEventsQueue;
  overrides?: Partial<Record<string, Record<string, unknown>>>;
}

type ReferenceTarget = { content: string } | { collection: string };

const MEDIA_PUBLIC_PATH = `${MOUNT_PATH}/media`;
const MEDIA_PREFIX = "media/";
const SITE_PREFIX = "site/";
const DATABASE_FILE = "kestrel.db";
const MEDIA_REFERENCE_TARGET = "media";
const MEDIA_REFERENCE_COLLECTION = "media_items";
const PAGES_COLLECTION = "pages";
const PAGE_LIKE_FIELDS = ["slug", "status", "body"];

const DEFAULT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MEDIA_ALLOWED_TYPES = ["image/*", "application/pdf"];
const DEFAULT_MEDIA_DENIED_TYPES = ["text/html", "application/xhtml+xml"];
const DEFAULT_LOGIN_BUCKET = { limit: 5, windowSeconds: 60 };
const DEFAULT_LLMS_HEADINGS = { [PAGES_COLLECTION]: "Pages" };
const DEFAULT_SESSION: Required<PresetSession> = { identifier: "username", minPasswordLength: 8, sessionTtlSeconds: 86400 };
const DEFAULT_LINKS = { timeoutMs: 10000, concurrency: 4, recheckAfterSeconds: 21600 };

function requireOption<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`presetModuleConfig: option "${name}" is required`);
  return value;
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
      if (to === MEDIA_REFERENCE_TARGET) targets[to] = { collection: MEDIA_REFERENCE_COLLECTION };
      else if (to in types) targets[to] = { content: to };
    }
  }
  return targets;
}

function isPageLike(name: string, model: CollectionModel): boolean {
  return isGenericCollection(name) && model.kind === "multi" && PAGE_LIKE_FIELDS.every((field) => field in model.fields);
}

function deliveryTypes(types: Record<string, CollectionModel>): Record<string, Record<string, never>> {
  const delivered: Record<string, Record<string, never>> = {};
  for (const [name, model] of Object.entries(types)) {
    if (isPageLike(name, model)) delivered[name] = {};
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

  const enabled = new Set<Feature>(features);
  const databaseFile = resolve(dataDir, DATABASE_FILE);
  const session = { ...DEFAULT_SESSION, ...options.session };
  const siteUrl = siteUrlOf(options.llms);

  const modules: ModuleEntry[] = [{ use: blobstore.use, config: blobstore.config }];

  if (enabled.has("replication")) modules.push({ use: "@michaelthielemann/kestrel-replication-sqlite", config: { file: databaseFile } });
  modules.push({ use: "@michaelthielemann/kestrel-persistence-sqlite", config: { file: databaseFile } });
  if (enabled.has("sanitizeSvg")) modules.push({ use: "@michaelthielemann/kestrel-sanitize-svg", config: {} });

  modules.push({
    use: "@michaelthielemann/kestrel-media-default",
    config: {
      prefix: MEDIA_PREFIX,
      allowedTypes: options.media?.allowedTypes ?? DEFAULT_MEDIA_ALLOWED_TYPES,
      deniedTypes: options.media?.deniedTypes ?? DEFAULT_MEDIA_DENIED_TYPES,
      maxBytes: options.media?.maxBytes ?? DEFAULT_MEDIA_MAX_BYTES,
      ...(model.locales === undefined ? {} : { locales: [...model.locales] }),
      ...(model.defaultLocale === undefined ? {} : { defaultLocale: model.defaultLocale }),
    },
  });

  if (enabled.has("images")) modules.push({ use: "@michaelthielemann/kestrel-images-default", config: { publicPath: MEDIA_PUBLIC_PATH } });

  modules.push({
    use: "@michaelthielemann/kestrel-authn-multi",
    config: {
      identifier: session.identifier,
      minPasswordLength: session.minPasswordLength,
      sessionTtlSeconds: session.sessionTtlSeconds,
      bootstrap: { username: bootstrap.username, passwordHash: bootstrap.passwordHash, roles: bootstrap.roles ?? ["admin"] },
    },
  });
  modules.push({ use: "@michaelthielemann/kestrel-authz-roles", config: { roles: roles.roles, anonymous: roles.anonymous } });
  modules.push({
    use: "@michaelthielemann/kestrel-content-default",
    config: {
      ...(model.locales === undefined ? {} : { locales: [...model.locales] }),
      ...(model.defaultLocale === undefined ? {} : { defaultLocale: model.defaultLocale }),
      types,
    },
  });
  modules.push({ use: "@michaelthielemann/kestrel-site-default", config: {} });

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
        media: { publicPath: MEDIA_PUBLIC_PATH },
        llms: {
          full: options.llms?.full ?? true,
          headings: options.llms?.headings ?? { ...DEFAULT_LLMS_HEADINGS },
          ...(siteUrl === undefined ? {} : { siteUrl }),
        },
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
  if (enabled.has("audit")) modules.push({ use: "@michaelthielemann/kestrel-audit-persistence", config: {} });
  if (enabled.has("eventsQueue")) modules.push({ use: "@michaelthielemann/kestrel-events-queue", config: { ...options.eventsQueue } });
  else modules.push({ use: "@michaelthielemann/kestrel-events-inmemory", config: {} });
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

  return applyModuleOverrides(modules, options.overrides);
}
