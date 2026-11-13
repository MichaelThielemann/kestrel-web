import { resolve } from "node:path";
import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import { definePipeline as defineRawPipeline, isAtomicGroup, pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineDefinition } from "@michaelthielemann/kestrel/definePipeline";
import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../module-registry";
import type { Workflow } from "../app/types/kestrel";
import { customFieldTypes } from "../field-types";
import type { FieldTypes } from "../field-types";
import { appendRelay, applyFeaturePatches, emitEntryIndex, foldTrailingEmit, groupSignatureOf, mergePipelines, placeIndexStepsLast } from "./compose";
import type { GroupSignature, Patch, PresetEntry } from "./compose";
import { basePipelines } from "./base";
import { anonymousHolds, appendFieldCut, fieldCutSteps } from "./field-grants";
import type { PresetContext } from "./base";
import { canonicalTriggers } from "./triggers";
import { linkOverrideFields } from "./link-fields";
import { isRoutedCollection } from "./capabilities";
import { parentFieldOf, routedCollections } from "./paths";
import { routedPipelineNames } from "./delivery-names";
import { collectionPipelines, hasLocalizedField, insertCollectionTriggers, isGenericCollection, pipelinesByName, DEFAULT_COLLECTIONS } from "./collections";
import type { CollectionModel, CollectionPipelineName } from "./collections";
import ratelimit from "./features/ratelimit";
import sanitizeSvg from "./features/sanitizeSvg";
import references from "./features/references";
import links from "./features/links";
import delivery, { dependentsPipelineName, dependentsPipelineNames, REFRESH_INDEXES_PIPELINE, REFRESH_LLMS_PIPELINE, REPUBLISH_OUTPUT_PIPELINE } from "./features/delivery";
import { INDEX_EXPORT_DELAYS } from "./index-delays";
import redirects from "./features/redirects";
import images from "./features/images";
import replication from "./features/replication";
import migrations from "./features/migrations";
import insights from "./features/insights";
import audit, { AUDIT_MODULE, AUDIT_PRUNE_PIPELINE, AUDIT_RETENTION_KEY } from "./features/audit";
import eventsQueue from "./features/eventsQueue";
import revisions, { revisionPipelineNames } from "./features/revisions";
import mfa from "./features/mfa";
import { MEDIA_TRASH_MODULE, MEDIA_TRASH_PIPELINES, MEDIA_TRASH_RETENTION_KEY, mediaTrashEnabled } from "./media-trash";

export type { CollectionModel } from "./collections";

export type Feature = "ratelimit" | "sanitizeSvg" | "references" | "links" | "delivery" | "redirects" | "images" | "replication" | "migrations" | "audit" | "insights" | "eventsQueue" | "revisions" | "mfa";

export interface FeatureModule {
  modules: string[];
  pipelines: Record<string, PresetEntry<PresetStep>[]>;
  patches: readonly Patch<Feature, PresetStep>[];
  triggers?: readonly TriggerConfig[];
  derive?: (pipelines: Record<string, readonly PresetEntry[]>) => Record<string, PresetEntry[]>;
}

/** The pipelines a signed-in account without a configured role may run: reading its own identity and signing out. */
export const ROLELESS_PIPELINES: ReadonlySet<string> = new Set(["me", "logout"]);

/** Puts `authz.requireRole` right after `authn.requireUser`, unless it already follows it. */
export function withRoleRequired(entries: readonly PresetEntry[]): PresetEntry[] {
  const at = entries.findIndex((entry) => entry === "authn.requireUser");
  if (at === -1 || entries[at + 1] === "authz.requireRole") return [...entries];
  return [...entries.slice(0, at + 1), "authz.requireRole", ...entries.slice(at + 1)];
}

export const staticPipelineNames = [
  "login", "logout", "me", "changePassword", "confirmPassword", "adminSchemaModel", "listUsers", "createUser", "getUser", "updateUser", "deleteUser", "setPassword", "deactivateUser", "activateUser",
  "cleanupSessions", "getSettings", "setSettings", "listPages", "listAllPages", "readPage", "readAnyPage", "resolvePage", "createPage", "updatePage",
  "deletePage", "uploadMedia", "exportMedia", "listMediaFolders", "createMediaFolder", "renameMediaFolder", "deleteMediaFolder",
  "listMedia", "getMedia", "downloadMedia", "updateMedia", "deleteMedia", "reconcileMedia", "reconcileMediaReport", "reconcileMediaDelete",
  "serveMediaFile", "repairPublicMedia", "syncPublicMedia",
  "trashMedia", "trashMediaFolder", "restoreMedia", "listMediaTrash", "purgeMedia", "emptyMediaTrash", "purgeExpiredMedia",
  "eventsDeliveryStatus",
  "sweepRateLimits",
  "brokenReferences", "pageReferrers", "pageReferrersMany", "mediaReferrers", "mediaReferrersMany", "rebuildReferences", "scanReferences",
  "brokenLinks", "rebuildLinks", "checkLinks",
  "publishPage", "unpublishPage", "pagePublishStatus", "publishAllPages",
  "pageDependents", "settingsDependents", "mediaDependents", "republishOutput", "refreshIndexes", "refreshLlms", "resumeStalePages", "deliveryBuildCheck", "retryStalePages", "pagesStaleStatus",
  "getRedirects", "setRedirects", "renderRedirects",
  "serveImageVariant", "registerImageSizes", "registerImageSizesBoot", "listImageSizes", "syncImages", "pruneImages", "retryFailedImages", "imagesStatus", "planImageVariants", "generateImageVariants", "resumeImages",
  "replicate", "replicationStatus", "replicationPoints", "replicationSnapshot", "replicationRestore",
  "listMigrations", "applyMigrations",
  "auditAuth", "auditUsers", "anonymizeAuditUser", "setupSecondFactor", "secondFactorUsers", "resetSecondFactor", "forgetSecondFactor", "retryAnonymizeAuditUser", "pruneAudit",
  "insightsManifest", "insightsStats",
  "eventsQueueStatus", "eventsDead", "eventsRetryDead", "eventsRetryOne", "purgeEvents",
  "pageRevisions", "pageRevision", "labelPageRevision", "restorePageRevision", "pruneRevisions",
  "reassignRevisionAuthor", "retryReassignRevisionAuthor",
  "previewPagePath", "pageTree", "rebuildPaths", "resumePaths", "rebuildPathsAfterMigrations", "pathsMovedRedirects", "pathsMovedDelivery", "listAutoRedirects", "removeAutoRedirect",
] as const;

export type StaticPipelineName = (typeof staticPipelineNames)[number];

export type PresetPipelineName<C extends Record<string, CollectionModel> = Record<string, CollectionModel>> =
  | StaticPipelineName
  | CollectionPipelineName<C>;

export type CronPipelineName = "resumePaths" | "cleanupSessions" | "sweepRateLimits" | "scanReferences" | "checkLinks" | "resumeImages" | "replicate" | "reconcileMedia" | "syncPublicMedia" | "purgeExpiredMedia" | "resumeStalePages" | "purgeEvents" | "pruneRevisions" | "pruneAudit";

export interface PresetOptions<C extends Record<string, CollectionModel> = Record<string, CollectionModel>, S extends string = PresetStep> {
  modules: readonly { use: string; config?: unknown }[];
  features: readonly Feature[];
  collections?: C;
  collectionsUi?: Record<string, { workflow?: Workflow; fieldOverrides?: Record<string, { type?: string }> }>;
  fieldTypes?: FieldTypes;
  overrides?: Partial<Record<PresetPipelineName<C>, readonly PresetEntry<NoInfer<S>>[]>>;
  exclude?: readonly PresetPipelineName<C>[];
  schedules?: Partial<Record<CronPipelineName, string>>;
  exportDir?: string;
  homeSlug?: string;
}

export interface Preset {
  pipelines: PipelineDefinition[];
  triggers: TriggerConfig[];
}

/**
 * One violation `checkPreset()` found while composing a preset: a stable `code`, the pipeline it concerns
 * when there is one, and a human-readable `message` — the same text `definePreset()` would throw for the
 * first problem it meets.
 */
export interface PresetProblem {
  code: string;
  pipeline?: string;
  message: string;
}

export interface PresetSink {
  report(problem: PresetProblem): void;
}

/** A sink that throws `Error(message)` at the first reported problem — `definePreset()`'s own behaviour. */
export function throwSink(): PresetSink {
  return {
    report(problem) {
      throw new Error(problem.message);
    },
  };
}

/** A sink that records every problem and never throws — what `checkPreset()` composes with. */
export function collectSink(into: PresetProblem[]): PresetSink {
  return {
    report(problem) {
      into.push(problem);
    },
  };
}

export interface CheckPresetResult {
  preset: Preset;
  problems: PresetProblem[];
}

/**
 * Composes a preset like `definePreset()`, but never throws: every violation it finds is collected into
 * `problems` instead, and composition keeps going as far as it safely can (an override naming an existing
 * pipeline is still applied exactly as given, so a boot check downstream sees what the consumer wrote).
 */
export function checkPreset<C extends Record<string, CollectionModel> = Record<string, CollectionModel>, S extends string = PresetStep>(
  options: PresetOptions<C, S>,
): CheckPresetResult {
  const problems: PresetProblem[] = [];
  const preset = buildPreset(options, collectSink(problems));
  return { preset, problems };
}

const featureFactories: Record<Feature, (context: PresetContext) => FeatureModule> = {
  ratelimit,
  sanitizeSvg,
  references,
  links,
  delivery,
  redirects,
  images,
  replication,
  migrations,
  audit,
  insights,
  eventsQueue,
  revisions,
  mfa,
};

function featureKeys(factories: Record<Feature, unknown>): readonly Feature[] {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Object.keys always returns string[]; factories is declared Record<Feature, unknown> so its keys are exactly Feature
  return Object.keys(factories) as Feature[];
}

export const featureOrder: readonly Feature[] = featureKeys(featureFactories);

const VALIDATE_JSONSCHEMA_MODULE = "@michaelthielemann/kestrel-validate-jsonschema";
const EVENTS_BUS_MODULE = "@michaelthielemann/kestrel-events-inmemory";
const EVENTS_QUEUE_MODULE = "@michaelthielemann/kestrel-events-queue";
const EVENTS_DIRECT_MODULE = "@michaelthielemann/kestrel-events-direct";
const DELIVERY_STATIC_MODULE = "@michaelthielemann/kestrel-delivery-static";
const PAGE_RENDER_LANE = "pages";
const INDEX_EXPORT_LANE = "indexes";
const IMAGE_VARIANT_LANE = "variants";

const MODULE_EMITS: Readonly<Record<string, readonly string[]>> = {
  "@michaelthielemann/kestrel-images-default": ["images.variantsChanged"],
  "@michaelthielemann/kestrel-site-default": ["site.pathsMoved"],
};

/** The event-triggered pipelines the `eventsQueue` module's relay may keep in the request; see `relayPipelinesFor`. */
export const RELAY_CANDIDATE_PIPELINES = ["publishPage", "unpublishPage"] as const;

/**
 * The `relayPipelines` that `presetModuleConfig()` gives the queue's relay: `RELAY_CANDIDATE_PIPELINES` when
 * `features` includes `delivery`, otherwise `[]`. It reads only the feature list, not the composed pipelines;
 * `definePreset()` checks the configured names against what it composes.
 */
export function relayPipelinesFor(features: readonly Feature[]): string[] {
  return features.includes("delivery") ? [...RELAY_CANDIDATE_PIPELINES] : [];
}

/**
 * The `lanes` that `presetModuleConfig()` gives the queue: with `eventsQueue`, `pages` (`republishOutput`,
 * `refreshLlms`) and `indexes` (`refreshIndexes`) when `features` includes `delivery`, and `variants`
 * (`generateImageVariants`) when it includes `images`; `{}` otherwise. Every pipeline it leaves out runs in the
 * queue's main lane. `definePreset()` checks the configured lanes against what it composes.
 */
export function lanesFor(features: readonly Feature[]): Record<string, string[]> {
  if (!features.includes("eventsQueue")) return {};
  const lanes: Record<string, string[]> = {};
  if (features.includes("delivery")) {
    lanes[PAGE_RENDER_LANE] = [REPUBLISH_OUTPUT_PIPELINE, REFRESH_LLMS_PIPELINE];
    lanes[INDEX_EXPORT_LANE] = [REFRESH_INDEXES_PIPELINE];
  }
  if (features.includes("images")) lanes[IMAGE_VARIANT_LANE] = ["generateImageVariants"];
  return lanes;
}

/**
 * The `delayMs` that `presetModuleConfig()` gives the queue: with `eventsQueue` and `delivery`,
 * `refreshIndexes` 1000 ms and `refreshLlms` 3000 ms, so one export follows a burst of saves and llms-full.txt
 * trails the re-renders a save marks; `{}` otherwise. `definePreset()` checks the configured names against what
 * it composes.
 */
export function delaysFor(features: readonly Feature[]): Record<string, number> {
  if (!features.includes("eventsQueue") || !features.includes("delivery")) return {};
  return { [REFRESH_INDEXES_PIPELINE]: INDEX_EXPORT_DELAYS.refreshIndexes, [REFRESH_LLMS_PIPELINE]: INDEX_EXPORT_DELAYS.refreshLlms };
}

const CONDITIONAL_CRON_HINTS: Record<string, string> = {
  [AUDIT_PRUNE_PIPELINE]: `module "${AUDIT_MODULE}" has no "${AUDIT_RETENTION_KEY}", so there is nothing to prune – pass audit: { ${AUDIT_RETENTION_KEY} } to presetModuleConfig()`,
  [MEDIA_TRASH_PIPELINES.purgeExpired]: `module "${MEDIA_TRASH_MODULE}" has no "${MEDIA_TRASH_RETENTION_KEY}", so there is no trash to empty – leave media.${MEDIA_TRASH_RETENTION_KEY} of presetModuleConfig() above 0`,
};

function effectiveConfigOf(modules: readonly { use: string; config?: unknown }[], use: string): unknown {
  const entry = modules.find((candidate) => candidate.use === use);
  return entry === undefined ? undefined : effectiveModuleConfig(entry);
}

const PUBLIC_SITE_PREFIX = "site/";
const PUBLIC_PREFIX_SOURCES: readonly { use: string; path: readonly string[] }[] = [
  { use: DELIVERY_STATIC_MODULE, path: ["prefix"] },
  { use: "@michaelthielemann/kestrel-redirects-default", path: ["prefix"] },
  { use: "@michaelthielemann/kestrel-media-default", path: ["publicCopy", "prefix"] },
  { use: "@michaelthielemann/kestrel-images-default", path: ["publicCopy", "prefix"] },
];
const PRIVATE_PREFIX_SOURCES: readonly { use: string; key: string; fallback?: string }[] = [
  { use: "@michaelthielemann/kestrel-replication-sqlite", key: "prefix", fallback: "replica/" },
  { use: "@michaelthielemann/kestrel-backup-blobstore", key: "key" },
];

function stringAt(value: unknown, path: readonly string[]): string | undefined {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = Reflect.get(current, key);
  }
  return typeof current === "string" ? current : undefined;
}

function validatePrivatePrefixes(modules: readonly { use: string; config?: unknown }[], sink: PresetSink): void {
  const publicPrefixes = new Set([PUBLIC_SITE_PREFIX]);
  for (const source of PUBLIC_PREFIX_SOURCES) {
    const prefix = stringAt(effectiveConfigOf(modules, source.use), source.path);
    if (prefix !== undefined && prefix !== "") publicPrefixes.add(prefix);
  }
  for (const source of PRIVATE_PREFIX_SOURCES) {
    if (!modules.some((entry) => entry.use === source.use)) continue;
    const prefix = stringAt(effectiveConfigOf(modules, source.use), [source.key]) ?? source.fallback;
    if (prefix === undefined) continue;
    const exposed = [...publicPrefixes].find((pub) => prefix.startsWith(pub) || pub.startsWith(prefix));
    if (exposed === undefined) continue;
    sink.report({
      code: "preset/private-prefix-public",
      message: `preset: ${source.use} keeps the database under "${prefix}", which overlaps the public prefix "${exposed}" a bucket or static host may serve – choose a ${source.key} outside every public prefix`,
    });
  }
}

function configuredRelayPipelines(modules: readonly { use: string; config?: unknown }[]): string[] | undefined {
  const config = effectiveConfigOf(modules, EVENTS_QUEUE_MODULE);
  if (typeof config !== "object" || config === null || !("relayPipelines" in config)) return undefined;
  const value = Reflect.get(config, "relayPipelines");
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
}

function configuredLanes(modules: readonly { use: string; config?: unknown }[]): Map<string, string[]> | undefined {
  const config = effectiveConfigOf(modules, EVENTS_QUEUE_MODULE);
  if (typeof config !== "object" || config === null || !("lanes" in config)) return undefined;
  const lanes: unknown = Reflect.get(config, "lanes");
  if (typeof lanes !== "object" || lanes === null) return undefined;
  return new Map(Object.entries(lanes).map(([lane, entry]): [string, string[]] => [lane, Array.isArray(entry) ? entry.filter((name): name is string => typeof name === "string") : []]));
}

function configuredDelays(modules: readonly { use: string; config?: unknown }[]): string[] {
  const config = effectiveConfigOf(modules, EVENTS_QUEUE_MODULE);
  const delays: unknown = typeof config === "object" && config !== null ? Reflect.get(config, "delayMs") : undefined;
  return typeof delays === "object" && delays !== null ? Object.keys(delays) : [];
}

function configuredLaneMembers(modules: readonly { use: string; config?: unknown }[]): string[] | undefined {
  const lanes = configuredLanes(modules);
  return lanes === undefined ? undefined : [...lanes.values()].flat();
}

function configuredRenderMode(modules: readonly { use: string; config?: unknown }[]): unknown {
  const config = effectiveConfigOf(modules, DELIVERY_STATIC_MODULE);
  if (typeof config !== "object" || config === null || !("dependencies" in config)) return "background";
  const dependencies: unknown = Reflect.get(config, "dependencies");
  if (typeof dependencies !== "object" || dependencies === null || !("render" in dependencies)) return "background";
  return Reflect.get(dependencies, "render");
}

function emitsOf(entries: readonly PresetEntry[]): string[] {
  return pipelineSteps(entries).flatMap((step) => (step.startsWith("events.emit:") ? [step.slice("events.emit:".length).split("?")[0] ?? ""] : []));
}

function emittedEvents(pipelines: Record<string, readonly PresetEntry[]>, modules: readonly { use: string }[]): Set<string> {
  const events = new Set(Object.values(pipelines).flatMap(emitsOf));
  for (const entry of modules) for (const event of MODULE_EMITS[entry.use] ?? []) events.add(event);
  return events;
}

function hasRedirectsRulesSchema(config: unknown): boolean {
  if (typeof config !== "object" || config === null || !("schemas" in config)) return false;
  const schemas = (config as { schemas?: unknown }).schemas;
  return typeof schemas === "object" && schemas !== null && "redirects.rules" in schemas;
}

const PAGE_REQUIRING_FEATURES: readonly Feature[] = ["references", "links", "delivery"];

const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const SERVER_ROUTE_NAMES = ["site", "media", "users", "health", "login", "logout", "me", "admin", "routes"];
const ADMIN_PAGE_NAMES = ["insights", "login", "media", "references", "system", "users"];
const COLLECTIONS_WITH_OWN_PIPELINES = new Set(["pages", "settings", "redirects"]);
let reservedNames: ReadonlyMap<string, string> | undefined;

function httpPathOf(trigger: TriggerConfig): string | undefined {
  return "http" in trigger ? trigger.http.split(" ")[1] : undefined;
}

/**
 * Every collection name the preset keeps for itself, with the reason: the prefix of every
 * `authz.require:<prefix>.*` permission its own pipelines (base and every feature) require, the first
 * segment of each of its own HTTP routes and the segment after `/admin/`, the server's own routes and the
 * admin's own pages. `pages`, `settings` and `redirects` are collections the preset composes itself and
 * are never reserved.
 */
export function reservedCollectionNames(): ReadonlyMap<string, string> {
  if (reservedNames !== undefined) return reservedNames;
  const reasons = new Map<string, string>();
  const add = (name: string | undefined, reason: string): void => {
    if (name === undefined || !COLLECTION_NAME_PATTERN.test(name) || COLLECTIONS_WITH_OWN_PIPELINES.has(name) || reasons.has(name)) return;
    reasons.set(name, reason);
  };
  const context: PresetContext = { exportDir: "", homeSlug: "home", collections: DEFAULT_COLLECTIONS, customFields: {}, mediaTrash: true };
  const own: Array<{ pipelines: Record<string, readonly PresetEntry[]>; triggers: readonly TriggerConfig[] }> = [
    { pipelines: basePipelines(context, DEFAULT_COLLECTIONS), triggers: canonicalTriggers.map((entry) => entry.trigger) },
    ...featureOrder.map((feature) => {
      const module = featureFactories[feature](context);
      return { pipelines: module.pipelines, triggers: module.triggers ?? [] };
    }),
  ];
  for (const { pipelines } of own) {
    for (const [pipeline, steps] of Object.entries(pipelines)) {
      for (const step of pipelineSteps(steps)) {
        const prefix = /^authz\.require:([a-z][a-z0-9_]*)\./.exec(step)?.[1];
        add(prefix, `the preset's pipeline "${pipeline}" requires "${prefix ?? ""}.*" permissions, which the collection's own permissions would grant`);
      }
    }
  }
  for (const { triggers } of own) {
    for (const trigger of triggers) {
      const path = httpPathOf(trigger);
      if (path === undefined) continue;
      const [first, second] = path.split("/").filter((segment) => segment !== "");
      add(first, `the preset's route ${path} starts with it`);
      if (first === "admin") add(second, `the preset's route ${path} lies where the collection's admin routes would`);
    }
  }
  for (const name of SERVER_ROUTE_NAMES) add(name, `the server answers /${name} itself`);
  for (const name of ADMIN_PAGE_NAMES) add(name, `the admin has its own page /admin/${name}`);
  reservedNames = reasons;
  return reasons;
}
const AUTHZ_MODULE = "@michaelthielemann/kestrel-authz-roles";

function anonymousPermissions(modules: readonly { use: string; config?: unknown }[]): string[] | undefined {
  const config = effectiveConfigOf(modules, AUTHZ_MODULE);
  if (typeof config !== "object" || config === null || !("anonymous" in config)) return undefined;
  const anonymous: unknown = Reflect.get(config, "anonymous");
  return Array.isArray(anonymous) ? anonymous.filter((entry): entry is string => typeof entry === "string") : undefined;
}

function validateHomeSlug(homeSlug: string, modules: readonly { use: string; config?: unknown }[], sink: PresetSink): void {
  const config = effectiveConfigOf(modules, "@michaelthielemann/kestrel-site-default");
  const routes: unknown = typeof config === "object" && config !== null ? Reflect.get(config, "routes") : undefined;
  const pages: unknown = typeof routes === "object" && routes !== null ? Reflect.get(routes, "pages") : undefined;
  const home: unknown = typeof pages === "object" && pages !== null ? Reflect.get(pages, "home") : undefined;
  if (typeof home !== "string" || home === homeSlug) return;
  sink.report({ code: "preset/home-slug", message: `preset: homeSlug "${homeSlug}" differs from site-default's home "${home}" – pass the same homeSlug to presetModuleConfig() and definePreset()` });
}

function isSlugField(field: unknown): boolean {
  return field === "slug" || (typeof field === "object" && field !== null && "type" in field && field.type === "slug");
}

function validateMounts(collections: Record<string, CollectionModel>, modules: readonly { use: string; config?: unknown }[], sink: PresetSink): void {
  const mounting = Object.entries(collections).filter(([, model]) => model.mount === true);
  for (const [name, model] of mounting) {
    if (name === "pages" || name === "page" || model.kind !== "multi") sink.report({ code: "preset/mount-invalid", message: `preset: collection "${name}" declares mount: true, but only a multi collection other than "pages" and "page" can be mounted` });
    else if (!isSlugField(model.fields.slug)) sink.report({ code: "preset/mount-invalid", message: `preset: mounted collection "${name}" needs a "slug" field of type "slug" for its public paths` });
  }
  if (mounting.length > 0 && !("pages" in collections)) sink.report({ code: "preset/mount-invalid", message: 'preset: a mounted collection lives under a page, which needs a "pages" collection' });
  const anonymous = anonymousPermissions(modules);
  if (anonymous === undefined || mounting.length === 0 || !anonymousHolds(anonymous, "pages.read")) return;
  for (const name of routedCollections(collections)) {
    if (anonymousHolds(anonymous, `${name}.read`)) continue;
    sink.report({
      code: "preset/routed-read",
      message: `preset: anonymous callers read pages, so they must hold "${name}.read" too – "${name}" has public paths, and a page path that belongs to it hands the visitor on to its own resolve route`,
    });
  }
}

function validateCollectionNames(collections: Record<string, CollectionModel>, sink: PresetSink): void {
  for (const name of Object.keys(collections)) {
    if (!COLLECTION_NAME_PATTERN.test(name)) {
      sink.report({
        code: "preset/collection-name-invalid",
        message:
          `preset: collection name "${name}" must match ${COLLECTION_NAME_PATTERN} (lowercase letters, digits and underscores, starting with a letter)`
          + " – kestrel-content-default and kestrel-validate-jsonschema reject anything else at boot",
      });
    } else {
      const reason = reservedCollectionNames().get(name);
      if (reason !== undefined) sink.report({ code: "preset/collection-name-reserved", message: `preset: collection name "${name}" is reserved: ${reason}` });
    }
  }
}

function isUniqueSlug(field: unknown): boolean {
  return typeof field === "object" && field !== null && "unique" in field && field.unique === true;
}

function validateRoutedSlugs(collections: Record<string, CollectionModel>, sink: PresetSink): void {
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name) || !isRoutedCollection(name, model) || !isUniqueSlug(model.fields.slug)) continue;
    if (parentFieldOf(name, model) === undefined && model.mount !== true) continue;
    sink.report({
      code: "preset/routed-slug-unique",
      message: `preset: "${name}.slug" must not be unique – the public path is what is unique, and a unique slug rejects the same slug under two different parents without naming the page that holds it; remove "unique: true"`,
    });
  }
}

/**
 * Composes a preset from `options`, reporting every violation to `sink` instead of stopping at the first.
 * `throwSink()` reproduces `definePreset()`'s exact behaviour (same messages, same order, stops at the
 * first problem); `collectSink()` is what `checkPreset()` uses to keep composing as far as it safely can,
 * so a caller sees every independent problem in one pass. A problem that leaves no safe choice (an
 * override naming a pipeline the preset never composed, an exclude naming one that does not exist) is
 * skipped rather than guessed at; every other pipeline is still composed and, for an override, applied
 * exactly as given so a later boot check sees what the consumer wrote.
 */
export function buildPreset<C extends Record<string, CollectionModel> = Record<string, CollectionModel>, S extends string = PresetStep>(
  options: PresetOptions<C, S>,
  sink: PresetSink,
): Preset {
  const exportDir = options.exportDir ?? resolve(process.env.KESTREL_APP_ROOT ?? process.cwd(), "data/export");
  const homeSlug = options.homeSlug ?? "home";
  const collections: Record<string, CollectionModel> = options.collections ?? DEFAULT_COLLECTIONS;
  validateCollectionNames(collections, sink);
  validateRoutedSlugs(collections, sink);
  validateMounts(collections, options.modules, sink);
  validateHomeSlug(homeSlug, options.modules, sink);
  validatePrivatePrefixes(options.modules, sink);
  const customFields = customFieldTypes(collections, options.fieldTypes ?? {});
  for (const [name, fields] of Object.entries(linkOverrideFields(collections, options.collectionsUi))) {
    customFields[name] = { ...Object.fromEntries(fields.map((field) => [field, "link"])), ...customFields[name] };
  }
  const prefixPrimary = Reflect.get(Object(effectiveConfigOf(options.modules, "@michaelthielemann/kestrel-site-default")), "prefixPrimary") === true;
  const context: PresetContext = { exportDir, homeSlug, prefixPrimary, collections, customFields, modules: options.modules, ...(options.collectionsUi === undefined ? {} : { collectionsUi: options.collectionsUi }) };

  const pagesModel = collections.pages;
  context.pagesTranslatable = pagesModel !== undefined && pagesModel.kind === "multi" && hasLocalizedField(pagesModel);

  const enabledFeatures = new Set<Feature>(options.features);
  const configuredModules = new Set(options.modules.map((entry) => entry.use));
  context.eventsQueued = enabledFeatures.has("eventsQueue");
  context.mediaTrash = mediaTrashEnabled(options.modules);

  if (!("pages" in collections)) {
    for (const feature of PAGE_REQUIRING_FEATURES) {
      if (enabledFeatures.has(feature)) {
        sink.report({ code: "preset/feature-requires-pages", message: `preset: feature "${feature}" requires a "pages" collection` });
      }
    }
  }

  let pipelines: Record<string, PresetEntry[]> = basePipelines(context, collections);
  const composablePipelineNames = new Set<string>([...staticPipelineNames, ...RELAY_CANDIDATE_PIPELINES]);
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name)) continue;
    const generated = collectionPipelines(name, model, options.collectionsUi?.[name], customFields[name]);
    for (const pipeline of Object.values(generated)) composablePipelineNames.add(pipeline.name);
    composablePipelineNames.add(dependentsPipelineName(name));
    if (isRoutedCollection(name, model)) {
      const routed = routedPipelineNames(name);
      for (const pipeline of [routed.publish, routed.unpublish, routed.publishStatus, routed.referrers, routed.referrersMany, routed.preview, routed.resolve, routed.publishAll]) composablePipelineNames.add(pipeline);
    }
    try {
      pipelines = mergePipelines(pipelines, pipelinesByName(generated), name, "collection");
    } catch (err) {
      sink.report({ code: "preset/merge-collision", pipeline: name, message: err instanceof Error ? err.message : String(err) });
    }
    if (model.kind === "multi") {
      const names = revisionPipelineNames(name);
      composablePipelineNames.add(names.revisions);
      composablePipelineNames.add(names.revision);
      composablePipelineNames.add(names.labelRevision);
      composablePipelineNames.add(names.restoreRevision);
    }
  }

  const featureTriggers: TriggerConfig[] = [];
  for (const feature of featureOrder) {
    const module = featureFactories[feature](context);
    if (enabledFeatures.has(feature)) {
      let missingModule = false;
      for (const use of module.modules) {
        if (!configuredModules.has(use)) {
          sink.report({ code: "preset/feature-requires-module", message: `preset: feature "${feature}" requires module "${use}"` });
          missingModule = true;
        }
      }
      if (missingModule) continue;
      try {
        pipelines = mergePipelines(pipelines, module.pipelines, feature);
      } catch (err) {
        sink.report({ code: "preset/merge-collision", message: err instanceof Error ? err.message : String(err) });
      }
      try {
        pipelines = applyFeaturePatches(pipelines, feature, module.patches, enabledFeatures);
      } catch (err) {
        sink.report({ code: "preset/feature-patch", message: err instanceof Error ? err.message : String(err) });
      }
      if (module.derive) {
        try {
          pipelines = mergePipelines(pipelines, module.derive(pipelines), feature);
        } catch (err) {
          sink.report({ code: "preset/merge-collision", message: err instanceof Error ? err.message : String(err) });
        }
      }
      featureTriggers.push(...(module.triggers ?? []));
    } else {
      for (const use of module.modules) {
        if (configuredModules.has(use) && feature !== "eventsQueue") {
          console.warn(`preset: module "${use}" is configured but feature "${feature}" is not enabled – its pipelines and steps are not wired`);
        }
      }
    }
  }

  const folded: Record<string, PresetEntry[]> = {};
  for (const [name, composed] of Object.entries(pipelines)) {
    const entries = placeIndexStepsLast(composed);
    let withEmitPlaced = entries;
    if (enabledFeatures.has("eventsQueue")) {
      try {
        withEmitPlaced = foldTrailingEmit(name, entries);
      } catch (err) {
        sink.report({ code: "preset/fold-emit-multiple-groups", pipeline: name, message: err instanceof Error ? err.message : String(err) });
      }
    }
    folded[name] = appendRelay(withEmitPlaced);
  }
  const fieldCuts = fieldCutSteps(collections);
  pipelines = Object.fromEntries(Object.entries(folded).map(([name, entries]) => {
    const step = fieldCuts[name];
    return [name, step === undefined ? entries : appendFieldCut(entries, step)];
  }));

  const groupedSignatures = new Map<string, GroupSignature>();
  const relayedPipelines = new Set<string>();
  for (const [name, entries] of Object.entries(pipelines)) {
    for (const entry of entries) {
      if (!isAtomicGroup(entry)) continue;
      const signature = groupSignatureOf(entry);
      if (signature !== undefined) groupedSignatures.set(name, signature);
    }
    if (pipelineSteps(entries).includes("events.relay")) relayedPipelines.add(name);
  }

  if (enabledFeatures.has("redirects")) {
    const validateModule = options.modules.find((entry) => entry.use === VALIDATE_JSONSCHEMA_MODULE);
    if (validateModule === undefined) {
      sink.report({ code: "preset/redirects-needs-module", message: `preset: feature "redirects" needs module "${VALIDATE_JSONSCHEMA_MODULE}" with schema "redirects.rules" – use presetSchemas()` });
    } else if (!hasRedirectsRulesSchema(effectiveModuleConfig(validateModule))) {
      sink.report({ code: "preset/redirects-needs-schema", message: 'preset: feature "redirects" needs schema "redirects.rules" in validate-jsonschema config – use presetSchemas()' });
    }
  }

  if (enabledFeatures.has("mfa") && !enabledFeatures.has("ratelimit")) {
    sink.report({ code: "preset/mfa-needs-ratelimit", message: 'preset: feature "mfa" needs the "ratelimit" feature – it limits sign-ins and second-factor setups per address and per account' });
  }

  if (!configuredModules.has(EVENTS_BUS_MODULE)) {
    sink.report({ code: "preset/missing-event-bus", message: `preset: every instance needs module "${EVENTS_BUS_MODULE}" – it provides events@1 – use presetModuleConfig()` });
  }
  const deliveryModules = [EVENTS_QUEUE_MODULE, EVENTS_DIRECT_MODULE].filter((use) => configuredModules.has(use));
  if (deliveryModules.length !== 1) {
    sink.report({
      code: "preset/event-delivery-count",
      message: `preset: configure exactly one event delivery module, "${EVENTS_QUEUE_MODULE}" or "${EVENTS_DIRECT_MODULE}" – found ${
        deliveryModules.length === 0 ? "none" : deliveryModules.map((use) => `"${use}"`).join(" and ")
      }`,
    });
  }
  if (!enabledFeatures.has("eventsQueue") && configuredModules.has(EVENTS_QUEUE_MODULE)) {
    sink.report({ code: "preset/event-queue-feature-off", message: `preset: module "${EVENTS_QUEUE_MODULE}" is configured but feature "eventsQueue" is not enabled – use presetModuleConfig()` });
  }
  if (enabledFeatures.has("delivery")) {
    const render = configuredRenderMode(options.modules);
    if (enabledFeatures.has("eventsQueue") && render !== "events") {
      sink.report({
        code: "preset/render-mode-needs-events",
        message: `preset: module "${DELIVERY_STATIC_MODULE}" needs dependencies.render "events" with the "eventsQueue" feature – re-renders run as queue jobs; use presetModuleConfig()`,
      });
    }
    if (!enabledFeatures.has("eventsQueue") && render === "events") {
      sink.report({
        code: "preset/render-mode-needs-queue",
        message: `preset: module "${DELIVERY_STATIC_MODULE}" has dependencies.render "events", which needs the "eventsQueue" feature – use "background", or presetModuleConfig()`,
      });
    }
  }

  let triggers: TriggerConfig[] = canonicalTriggers
    .filter((entry) => entry.feature === undefined || enabledFeatures.has(entry.feature))
    .filter((entry) => entry.pages !== true || "pages" in collections)
    .filter((entry) => entry.parent !== true || (collections.pages !== undefined && parentFieldOf("pages", collections.pages) !== undefined))
    .filter((entry) => entry.mediaTrash !== true || context.mediaTrash === true)
    .map((entry) => entry.trigger);
  triggers = [...insertCollectionTriggers(triggers, collections, options.collectionsUi), ...featureTriggers];

  const overrideNames = new Set(Object.keys(options.overrides ?? {}));
  const excludeNames = new Set<string>(options.exclude ?? []);
  for (const name of excludeNames) {
    if (overrideNames.has(name)) {
      sink.report({ code: "preset/override-and-exclude", pipeline: name, message: `preset: pipeline "${name}" is both overridden and excluded` });
    }
  }

  const cronPipelineNames = new Set(triggers.filter((trigger) => "cron" in trigger).map((trigger) => trigger.pipeline));
  const cronPipelineFeatures = new Map(
    canonicalTriggers.filter((entry) => "cron" in entry.trigger).map((entry) => [entry.trigger.pipeline, entry.feature]),
  );
  const validSchedules: Array<[string, string]> = [];
  for (const [name, cron] of Object.entries(options.schedules ?? {})) {
    if (cron === undefined) continue;
    if (!cronPipelineNames.has(name)) {
      const hint = CONDITIONAL_CRON_HINTS[name];
      if (hint !== undefined) {
        sink.report({ code: "preset/schedule-conditional", pipeline: name, message: `preset: schedule for pipeline "${name}" – ${hint}` });
        continue;
      }
      const gatingFeature = cronPipelineFeatures.get(name);
      if (gatingFeature !== undefined) {
        sink.report({ code: "preset/schedule-feature-off", pipeline: name, message: `preset: schedule for pipeline "${name}" – feature "${gatingFeature}" is not enabled` });
        continue;
      }
      sink.report({ code: "preset/schedule-unknown-pipeline", pipeline: name, message: `preset: schedule for unknown cron pipeline "${name}"` });
      continue;
    }
    if (excludeNames.has(name)) {
      sink.report({ code: "preset/schedule-excluded", pipeline: name, message: `preset: pipeline "${name}" is both excluded and rescheduled` });
      continue;
    }
    validSchedules.push([name, cron]);
  }

  const watchedEvents = new Set(
    enabledFeatures.has("delivery")
      ? triggers.flatMap((trigger) => ("event" in trigger && dependentsPipelineNames(collections).includes(trigger.pipeline) ? [trigger.event] : []))
      : [],
  );
  const emitsBefore = new Map(Object.entries(pipelines).map(([name, entries]) => [name, emitsOf(entries).filter((event) => watchedEvents.has(event))]));

  const overrides: Partial<Record<string, readonly PresetEntry[]>> = options.overrides ?? {};
  const nextPipelines: Record<string, PresetEntry[]> = { ...pipelines };
  for (const [name, steps] of Object.entries(overrides)) {
    if (steps === undefined) continue;
    if (!(name in nextPipelines)) {
      sink.report({ code: "preset/override-unknown-pipeline", pipeline: name, message: `preset: override for unknown pipeline "${name}"` });
      continue;
    }
    nextPipelines[name] = [...steps];
  }
  pipelines = Object.fromEntries(Object.entries(nextPipelines).map(([name, entries]) => [name, ROLELESS_PIPELINES.has(name) ? entries : withRoleRequired(entries)]));

  for (const name of Object.keys(overrides)) {
    const entries = pipelines[name];
    if (entries === undefined) continue;
    const kept = new Set(emitsOf(entries));
    const dropped = (emitsBefore.get(name) ?? []).find((event) => !kept.has(event));
    if (dropped !== undefined) {
      sink.report({
        code: "preset/override-drops-watched-emit",
        pipeline: name,
        message: `preset: override for "${name}" drops "events.emit:${dropped}" – the pages that show what it writes would never be re-rendered; keep the emit, or exclude the pipeline and define your own`,
      });
    }
  }

  for (const [name, signature] of groupedSignatures) {
    const entries = pipelines[name];
    if (entries === undefined) continue;
    const stillGrouped = entries.some((entry) => {
      if (!isAtomicGroup(entry)) return false;
      const overridden = groupSignatureOf(entry);
      if (overridden === undefined) return false;
      return signature.target !== undefined ? overridden.target === signature.target : overridden.step === signature.step;
    });
    if (!stillGrouped) {
      sink.report({
        code: "preset/override-drops-atomic-group",
        pipeline: name,
        message: `preset: override for "${name}" drops the atomic group around "${signature.step}" – wrap the write steps in { atomic: [...] } or exclude the pipeline`,
      });
    }
  }

  for (const name of relayedPipelines) {
    const entries = pipelines[name];
    if (entries === undefined) continue;
    const relayIndex = entries.findIndex((entry) => !isAtomicGroup(entry) && entry === "events.relay");
    if (relayIndex === -1) {
      sink.report({
        code: "preset/override-drops-relay",
        pipeline: name,
        message: `preset: override for "${name}" drops "events.relay" – append it after the pipeline's events.emit: step, or exclude the pipeline and define your own`,
      });
      continue;
    }
    const emitIndex = emitEntryIndex(entries);
    if (emitIndex === -1) continue;
    if (relayIndex <= emitIndex) {
      sink.report({
        code: "preset/override-relay-before-emit",
        pipeline: name,
        message: `preset: override for "${name}" places "events.relay" before the entry carrying its events.emit: step – a relay reported before the emit runs answers "done" before delivery starts; move it after that entry`,
      });
    }
  }

  const adminSchemaModel = pipelines.adminSchemaModel;
  if (adminSchemaModel !== undefined && !pipelineSteps(adminSchemaModel).includes("authz.describePipelineAccess")) {
    sink.report({ code: "preset/override-drops-schema-access", pipeline: "adminSchemaModel", message: 'preset: override for "adminSchemaModel" drops "authz.describePipelineAccess" – the admin reads the caller\'s pipeline access from it' });
  }

  const generateImageVariants = pipelines.generateImageVariants;
  if (enabledFeatures.has("eventsQueue")) {
    const planImageVariants = pipelines.planImageVariants;
    if (planImageVariants !== undefined) {
      const steps = pipelineSteps(planImageVariants);
      if (steps[0] !== "images.plan" || steps[1] !== "events.emit:images.planned") {
        sink.report({
          code: "preset/plan-image-variants-shape",
          pipeline: "planImageVariants",
          message: 'preset: override for "planImageVariants" must run "images.plan" and emit "images.planned" – items would stay unavailable until the repair pass',
        });
      }
    }
    if (generateImageVariants !== undefined && pipelineSteps(generateImageVariants).includes("images.plan")) {
      sink.report({ code: "preset/generate-image-variants-places-inline", pipeline: "generateImageVariants", message: 'preset: override for "generateImageVariants" must not place – placing runs in the main lane' });
    }
    if (generateImageVariants !== undefined && enabledFeatures.has("images") && configuredModules.has(EVENTS_QUEUE_MODULE) && !excludeNames.has("generateImageVariants")) {
      const laneMembers = configuredLaneMembers(options.modules) ?? [];
      if (!laneMembers.includes("generateImageVariants")) {
        sink.report({
          code: "preset/generate-image-variants-lane",
          pipeline: "generateImageVariants",
          message: `preset: module "${EVENTS_QUEUE_MODULE}" must run "generateImageVariants" in a lane of its own – a render must never block placing new items`,
        });
      }
    }
  } else if (generateImageVariants !== undefined && pipelineSteps(generateImageVariants).includes("images.plan")) {
    sink.report({ code: "preset/generate-image-variants-inline-plan", pipeline: "generateImageVariants", message: 'preset: override for "generateImageVariants" runs "images.plan" inline – placeholders are never written in the upload request' });
  }

  const validExcludes = (options.exclude ?? []).filter((name) => {
    if (!(name in pipelines)) {
      sink.report({ code: "preset/exclude-unknown-pipeline", pipeline: name, message: `preset: exclude for unknown pipeline "${name}"` });
      return false;
    }
    return true;
  });
  const excludeSet = new Set<string>(validExcludes);
  pipelines = Object.fromEntries(Object.entries(pipelines).filter(([name]) => !excludeSet.has(name)));
  triggers = triggers.filter((trigger) => !excludeSet.has(trigger.pipeline));

  if (enabledFeatures.has("delivery")) {
    const emitted = emittedEvents(pipelines, options.modules);
    const dependents = new Set(dependentsPipelineNames(collections));
    triggers = triggers.filter((trigger) => !("event" in trigger) || !dependents.has(trigger.pipeline) || emitted.has(trigger.event));
  }

  const lanes = configuredLanes(options.modules) ?? (configuredModules.has(EVENTS_QUEUE_MODULE) ? new Map<string, string[]>() : undefined);
  if (lanes !== undefined) {
    for (const [lane, members] of lanes) {
      for (const name of members) {
        if (!composablePipelineNames.has(name) || Object.hasOwn(pipelines, name)) continue;
        sink.report({
          code: "preset/lane-pipeline-unknown",
          pipeline: name,
          message: `preset: module "${EVENTS_QUEUE_MODULE}" runs pipeline "${name}" in lane "${lane}", which the preset does not compose – remove it from lanes too, or keep the pipeline`,
        });
      }
    }
    const renders = [REPUBLISH_OUTPUT_PIPELINE, REFRESH_LLMS_PIPELINE].filter((name) => Object.hasOwn(pipelines, name));
    const laneOf = (name: string): string | undefined => [...lanes].find(([, members]) => members.includes(name))?.[0];
    const renderLanes = new Set(renders.map(laneOf));
    const [renderLane] = renderLanes;
    const shared = renderLane !== undefined && (lanes.get(renderLane) ?? []).some((name) => name !== REPUBLISH_OUTPUT_PIPELINE && name !== REFRESH_LLMS_PIPELINE);
    if (renders.length > 0 && (renderLanes.size !== 1 || renderLane === undefined || shared)) {
      sink.report({
        code: "preset/page-renders-lane",
        message: `preset: module "${EVENTS_QUEUE_MODULE}" must run "${REPUBLISH_OUTPUT_PIPELINE}" and "${REFRESH_LLMS_PIPELINE}" together in a lane of their own – re-renders must never delay other queued work, and the export must follow them`,
      });
    }
    if (Object.hasOwn(pipelines, REFRESH_INDEXES_PIPELINE)) {
      const indexLane = laneOf(REFRESH_INDEXES_PIPELINE);
      const alone = indexLane !== undefined && (lanes.get(indexLane) ?? []).every((name) => name === REFRESH_INDEXES_PIPELINE);
      if (!alone) {
        sink.report({
          code: "preset/index-exports-lane",
          pipeline: REFRESH_INDEXES_PIPELINE,
          message: `preset: module "${EVENTS_QUEUE_MODULE}" must run "${REFRESH_INDEXES_PIPELINE}" in a lane of its own – sitemap.xml, robots.txt and llms.txt must never wait for a re-render backlog or other queued work`,
        });
      }
    }
  }

  if (configuredModules.has(EVENTS_QUEUE_MODULE)) {
    for (const name of configuredDelays(options.modules)) {
      if (!composablePipelineNames.has(name) || Object.hasOwn(pipelines, name)) continue;
      sink.report({
        code: "preset/delay-pipeline-unknown",
        pipeline: name,
        message: `preset: module "${EVENTS_QUEUE_MODULE}" holds back pipeline "${name}" in delayMs, which the preset does not compose – remove it from delayMs too, or keep the pipeline`,
      });
    }
  }

  const configuredRelay = configuredRelayPipelines(options.modules);
  if (configuredRelay !== undefined) {
    for (const name of configuredRelay) {
      if (!composablePipelineNames.has(name)) continue;
      if (!Object.hasOwn(pipelines, name)) {
        sink.report({
          code: "preset/relay-pipeline-unknown",
          pipeline: name,
          message: `preset: module "${EVENTS_QUEUE_MODULE}" is configured to relay pipeline "${name}", which the preset does not compose – exclude it from relayPipelines too, or keep the pipeline`,
        });
      }
    }
  }

  triggers = triggers.map((trigger) => {
    if (!("cron" in trigger)) return trigger;
    const found = validSchedules.find(([name]) => name === trigger.pipeline);
    return found === undefined ? trigger : { ...trigger, cron: found[1] };
  });

  const pipelineDefs = Object.keys(pipelines)
    .sort()
    .map((name) => defineRawPipeline({ name, steps: pipelines[name] ?? [] }));

  return { pipelines: pipelineDefs, triggers };
}
