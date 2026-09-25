import { resolve } from "node:path";
import { definePipeline as defineRawPipeline, isAtomicGroup, pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineDefinition } from "@michaelthielemann/kestrel/definePipeline";
import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../module-registry";
import type { Workflow } from "../app/types/kestrel";
import { customFieldTypes } from "../field-types";
import type { FieldTypes } from "../field-types";
import { appendRelay, applyFeaturePatches, emitEntryIndex, foldTrailingEmit, groupSignatureOf, mergePipelines } from "./compose";
import type { GroupSignature, Patch, PresetEntry } from "./compose";
import { basePipelines } from "./base";
import { appendFieldCut, fieldCutSteps } from "./field-grants";
import type { PresetContext } from "./base";
import { canonicalTriggers } from "./triggers";
import { collectionPipelines, hasLocalizedField, insertCollectionTriggers, isGenericCollection, pipelinesByName, DEFAULT_COLLECTIONS } from "./collections";
import type { CollectionModel, CollectionPipelineName } from "./collections";
import ratelimit from "./features/ratelimit";
import sanitizeSvg from "./features/sanitizeSvg";
import references from "./features/references";
import links from "./features/links";
import delivery, { dependentsPipelineName, dependentsPipelineNames, REFRESH_LLMS_PIPELINE, REPUBLISH_OUTPUT_PIPELINE } from "./features/delivery";
import redirects from "./features/redirects";
import images from "./features/images";
import replication from "./features/replication";
import migrations from "./features/migrations";
import insights from "./features/insights";
import audit, { AUDIT_MODULE, AUDIT_PRUNE_PIPELINE, AUDIT_RETENTION_KEY } from "./features/audit";
import eventsQueue from "./features/eventsQueue";
import revisions, { revisionPipelineNames } from "./features/revisions";

export type { CollectionModel } from "./collections";

export type Feature = "ratelimit" | "sanitizeSvg" | "references" | "links" | "delivery" | "redirects" | "images" | "replication" | "migrations" | "audit" | "insights" | "eventsQueue" | "revisions";

export interface FeatureModule {
  modules: string[];
  pipelines: Record<string, PresetEntry<PresetStep>[]>;
  patches: readonly Patch<Feature, PresetStep>[];
  triggers?: readonly TriggerConfig[];
  derive?: (pipelines: Record<string, readonly PresetEntry[]>) => Record<string, PresetEntry[]>;
}

export const staticPipelineNames = [
  "login", "logout", "me", "changePassword", "adminSchemaModel", "listUsers", "createUser", "getUser", "updateUser", "deleteUser", "setPassword", "deactivateUser", "activateUser",
  "cleanupSessions", "getSettings", "setSettings", "listPages", "listAllPages", "readPage", "readAnyPage", "resolvePage", "createPage", "updatePage",
  "deletePage", "uploadMedia", "exportMedia", "listMediaFolders", "createMediaFolder", "renameMediaFolder", "deleteMediaFolder",
  "listMedia", "getMedia", "downloadMedia", "updateMedia", "deleteMedia", "reconcileMedia", "reconcileMediaReport", "reconcileMediaDelete",
  "serveMediaFile", "repairPublicMedia", "syncPublicMedia",
  "eventsDeliveryStatus",
  "sweepRateLimits",
  "brokenReferences", "pageReferrers", "pageReferrersMany", "mediaReferrers", "mediaReferrersMany", "rebuildReferences", "scanReferences",
  "brokenLinks", "rebuildLinks", "checkLinks",
  "publishPage", "unpublishPage", "pagePublishStatus", "publishAllPages",
  "pageDependents", "settingsDependents", "mediaDependents", "republishOutput", "refreshLlms", "resumeStalePages", "deliveryBuildCheck", "retryStalePages", "pagesStaleStatus",
  "getRedirects", "setRedirects", "renderRedirects",
  "serveImageVariant", "registerImageSizes", "registerImageSizesBoot", "listImageSizes", "syncImages", "pruneImages", "retryFailedImages", "imagesStatus", "planImageVariants", "generateImageVariants", "resumeImages",
  "replicate", "replicationStatus", "replicationPoints", "replicationSnapshot", "replicationRestore",
  "listMigrations", "applyMigrations",
  "auditAuth", "anonymizeAuditUser", "retryAnonymizeAuditUser", "pruneAudit",
  "insightsManifest", "insightsStats",
  "eventsQueueStatus", "eventsDead", "eventsRetryDead", "eventsRetryOne", "purgeEvents",
  "pageRevisions", "pageRevision", "labelPageRevision", "restorePageRevision", "pruneRevisions",
  "reassignRevisionAuthor", "retryReassignRevisionAuthor",
] as const;

export type StaticPipelineName = (typeof staticPipelineNames)[number];

export type PresetPipelineName<C extends Record<string, CollectionModel> = Record<string, CollectionModel>> =
  | StaticPipelineName
  | CollectionPipelineName<C>;

export type CronPipelineName = "cleanupSessions" | "sweepRateLimits" | "scanReferences" | "checkLinks" | "resumeImages" | "replicate" | "reconcileMedia" | "syncPublicMedia" | "resumeStalePages" | "purgeEvents" | "pruneRevisions" | "pruneAudit";

export interface PresetOptions<C extends Record<string, CollectionModel> = Record<string, CollectionModel>, S extends string = PresetStep> {
  modules: readonly { use: string; config?: unknown }[];
  features: readonly Feature[];
  collections?: C;
  collectionsUi?: Record<string, { workflow?: Workflow }>;
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
const IMAGE_VARIANT_LANE = "variants";

const MODULE_EMITS: Readonly<Record<string, readonly string[]>> = {
  "@michaelthielemann/kestrel-images-default": ["images.variantsChanged"],
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
 * `refreshLlms`) when `features` includes `delivery`, and `variants` (`generateImageVariants`) when it includes
 * `images`; `{}` otherwise. Every pipeline it leaves out runs in the queue's main lane. `definePreset()` checks the
 * configured lanes against what it composes.
 */
export function lanesFor(features: readonly Feature[]): Record<string, string[]> {
  if (!features.includes("eventsQueue")) return {};
  const lanes: Record<string, string[]> = {};
  if (features.includes("delivery")) lanes[PAGE_RENDER_LANE] = [REPUBLISH_OUTPUT_PIPELINE, REFRESH_LLMS_PIPELINE];
  if (features.includes("images")) lanes[IMAGE_VARIANT_LANE] = ["generateImageVariants"];
  return lanes;
}

const CONDITIONAL_CRON_HINTS: Record<string, string> = {
  [AUDIT_PRUNE_PIPELINE]: `module "${AUDIT_MODULE}" has no "${AUDIT_RETENTION_KEY}", so there is nothing to prune – pass audit: { ${AUDIT_RETENTION_KEY} } to presetModuleConfig()`,
};

function configuredRelayPipelines(modules: readonly { use: string; config?: unknown }[]): string[] | undefined {
  const config = modules.find((entry) => entry.use === EVENTS_QUEUE_MODULE)?.config;
  if (typeof config !== "object" || config === null || !("relayPipelines" in config)) return undefined;
  const value = Reflect.get(config, "relayPipelines");
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
}

function configuredLanes(modules: readonly { use: string; config?: unknown }[]): Map<string, string[]> | undefined {
  const config = modules.find((entry) => entry.use === EVENTS_QUEUE_MODULE)?.config;
  if (typeof config !== "object" || config === null || !("lanes" in config)) return undefined;
  const lanes: unknown = Reflect.get(config, "lanes");
  if (typeof lanes !== "object" || lanes === null) return undefined;
  return new Map(Object.entries(lanes).map(([lane, entry]): [string, string[]] => [lane, Array.isArray(entry) ? entry.filter((name): name is string => typeof name === "string") : []]));
}

function configuredLaneMembers(modules: readonly { use: string; config?: unknown }[]): string[] | undefined {
  const lanes = configuredLanes(modules);
  return lanes === undefined ? undefined : [...lanes.values()].flat();
}

function configuredRenderMode(modules: readonly { use: string; config?: unknown }[]): unknown {
  const config = modules.find((entry) => entry.use === DELIVERY_STATIC_MODULE)?.config;
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
const RESERVED_COLLECTION_NAMES = new Set(["site", "media", "users", "health", "login", "logout", "me", "admin"]);

function validateCollectionNames(collections: Record<string, CollectionModel>, sink: PresetSink): void {
  for (const name of Object.keys(collections)) {
    if (!COLLECTION_NAME_PATTERN.test(name)) {
      sink.report({
        code: "preset/collection-name-invalid",
        message:
          `preset: collection name "${name}" must match ${COLLECTION_NAME_PATTERN} (lowercase letters, digits and underscores, starting with a letter)`
          + " – kestrel-content-default and kestrel-validate-jsonschema reject anything else at boot",
      });
    } else if (RESERVED_COLLECTION_NAMES.has(name)) {
      sink.report({ code: "preset/collection-name-reserved", message: `preset: collection name "${name}" is reserved` });
    }
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
  const customFields = customFieldTypes(collections, options.fieldTypes ?? {});
  const context: PresetContext = { exportDir, homeSlug, collections, customFields, modules: options.modules, ...(options.collectionsUi === undefined ? {} : { collectionsUi: options.collectionsUi }) };

  const pagesModel = collections.pages;
  context.pagesTranslatable = pagesModel !== undefined && pagesModel.kind === "multi" && hasLocalizedField(pagesModel);

  const enabledFeatures = new Set<Feature>(options.features);
  const configuredModules = new Set(options.modules.map((entry) => entry.use));
  context.eventsQueued = enabledFeatures.has("eventsQueue");

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
  for (const [name, entries] of Object.entries(pipelines)) {
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
    } else if (!hasRedirectsRulesSchema(validateModule.config)) {
      sink.report({ code: "preset/redirects-needs-schema", message: 'preset: feature "redirects" needs schema "redirects.rules" in validate-jsonschema config – use presetSchemas()' });
    }
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
    .filter((entry) => !("http" in entry.trigger) || entry.trigger.pipeline !== "resolvePage" || "pages" in collections)
    .map((entry) => entry.trigger);
  triggers = [...insertCollectionTriggers(triggers, collections), ...featureTriggers];

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
  pipelines = nextPipelines;

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
