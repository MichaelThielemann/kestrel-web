import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { definePipeline } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineDefinition } from "@michaelthielemann/kestrel/definePipeline";
import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../module-registry";
import { applyExclude, applyFeaturePatches, applyOverrides, applySchedules, mergePipelines } from "./compose";
import type { Patch } from "./compose";
import { basePipelines } from "./base";
import type { PresetContext } from "./base";
import { canonicalTriggers } from "./triggers";
import { collectionPipelines, hasLocalizedField, insertCollectionTriggers, isGenericCollection, DEFAULT_COLLECTIONS } from "./collections";
import type { CollectionModel, CollectionPipelineName } from "./collections";
import ratelimit from "./features/ratelimit";
import sanitizeSvg from "./features/sanitizeSvg";
import references from "./features/references";
import links from "./features/links";
import delivery from "./features/delivery";
import redirects from "./features/redirects";
import images from "./features/images";
import replication from "./features/replication";
import migrations from "./features/migrations";
import audit from "./features/audit";

export type { CollectionModel } from "./collections";
export type { PresetStep } from "../module-registry";

export type Feature = "ratelimit" | "sanitizeSvg" | "references" | "links" | "delivery" | "redirects" | "images" | "replication" | "migrations" | "audit";

export interface FeatureModule {
  modules: string[];
  pipelines: Record<string, PresetStep[]>;
  patches: readonly Patch<Feature, PresetStep>[];
}

export type StaticPipelineName =
  | "login" | "logout" | "me" | "changePassword" | "listUsers" | "createUser" | "getUser" | "setPassword" | "deactivateUser" | "activateUser"
  | "cleanupSessions" | "getSettings" | "setSettings" | "listPages" | "listAllPages" | "readPage" | "readAnyPage" | "resolvePage" | "createPage" | "updatePage"
  | "deletePage" | "uploadMedia" | "exportMedia" | "listMediaFolders" | "createMediaFolder" | "renameMediaFolder" | "deleteMediaFolder"
  | "listMedia" | "getMedia" | "downloadMedia" | "updateMedia" | "deleteMedia" | "reconcileMedia" | "reconcileMediaReport" | "reconcileMediaDelete"
  | "sweepRateLimits"
  | "brokenReferences" | "pageReferrers" | "pageReferrersMany" | "mediaReferrers" | "mediaReferrersMany" | "rebuildReferences" | "scanReferences"
  | "brokenLinks" | "rebuildLinks" | "checkLinks"
  | "pagePublishStatus" | "publishAllPages"
  | "getRedirects" | "setRedirects" | "renderRedirects"
  | "serveImageVariant" | "registerImageSizes" | "registerImageSizesBoot" | "listImageSizes" | "syncImages" | "pruneImages" | "imagesStatus" | "generateImageVariants" | "resumeImages"
  | "replicate" | "replicationStatus" | "replicationPoints" | "replicationSnapshot" | "replicationRestore"
  | "listMigrations" | "applyMigrations"
  | "auditAuth";

export type PresetPipelineName<C extends Record<string, CollectionModel> = Record<string, CollectionModel>> =
  | StaticPipelineName
  | CollectionPipelineName<C>;

export type CronPipelineName = "cleanupSessions" | "sweepRateLimits" | "scanReferences" | "checkLinks" | "resumeImages" | "replicate" | "reconcileMedia";

export interface PresetOptions<C extends Record<string, CollectionModel> = Record<string, CollectionModel>, S extends string = PresetStep> {
  modules: readonly { use: string; config?: unknown }[];
  features: readonly Feature[];
  collections?: C;
  overrides?: Partial<Record<PresetPipelineName<C>, readonly NoInfer<S>[]>>;
  exclude?: readonly PresetPipelineName<C>[];
  schedules?: Partial<Record<CronPipelineName, string>>;
  exportDir?: string;
  homeSlug?: string;
}

export interface Preset {
  pipelines: PipelineDefinition[];
  triggers: TriggerConfig[];
}

const featureOrder: readonly Feature[] = [
  "ratelimit",
  "sanitizeSvg",
  "references",
  "links",
  "delivery",
  "redirects",
  "images",
  "replication",
  "migrations",
  "audit",
];

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
};

const VALIDATE_JSONSCHEMA_MODULE = "@michaelthielemann/kestrel-validate-jsonschema";

function hasRedirectsRulesSchema(config: unknown): boolean {
  if (typeof config !== "object" || config === null || !("schemas" in config)) return false;
  const schemas = (config as { schemas?: unknown }).schemas;
  return typeof schemas === "object" && schemas !== null && "redirects.rules" in schemas;
}

const PAGE_REQUIRING_FEATURES: readonly Feature[] = ["references", "links", "delivery"];

const COLLECTION_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const RESERVED_COLLECTION_NAMES = new Set(["site", "media", "users", "health", "login", "logout", "me", "admin"]);

function validateCollectionNames(collections: Record<string, CollectionModel>): void {
  for (const name of Object.keys(collections)) {
    if (!COLLECTION_NAME_PATTERN.test(name)) {
      throw new Error(`preset: collection name "${name}" must match ${COLLECTION_NAME_PATTERN} (start with a lowercase letter, letters and digits only)`);
    }
    if (RESERVED_COLLECTION_NAMES.has(name)) {
      throw new Error(`preset: collection name "${name}" is reserved`);
    }
  }
}

export function definePreset<C extends Record<string, CollectionModel> = Record<string, CollectionModel>, S extends string = PresetStep>(
  options: PresetOptions<C, S>,
): Preset {
  const exportDir = options.exportDir ?? resolve(process.env.KESTREL_APP_ROOT ?? process.cwd(), "data/export");
  const homeSlug = options.homeSlug ?? "home";
  const context: PresetContext = { exportDir, homeSlug };
  const collections: Record<string, CollectionModel> = options.collections ?? DEFAULT_COLLECTIONS;
  validateCollectionNames(collections);

  const pagesModel = collections.pages;
  context.pagesTranslatable = pagesModel !== undefined && pagesModel.kind === "multi" && hasLocalizedField(pagesModel);

  const enabledFeatures = new Set<Feature>(options.features);
  const configuredModules = new Set(options.modules.map((entry) => entry.use));

  if (!("pages" in collections)) {
    for (const feature of PAGE_REQUIRING_FEATURES) {
      if (enabledFeatures.has(feature)) {
        throw new Error(`preset: feature "${feature}" requires a "pages" collection`);
      }
    }
  }

  let pipelines: Record<string, string[]> = basePipelines(context, collections);
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name)) continue;
    pipelines = mergePipelines(pipelines, collectionPipelines(name, model), name, "collection");
  }

  for (const feature of featureOrder) {
    const module = featureFactories[feature](context);
    if (enabledFeatures.has(feature)) {
      for (const use of module.modules) {
        if (!configuredModules.has(use)) {
          throw new Error(`preset: feature "${feature}" requires module "${use}"`);
        }
      }
      pipelines = mergePipelines(pipelines, module.pipelines, feature);
      pipelines = applyFeaturePatches(pipelines, feature, module.patches, enabledFeatures);
    } else {
      for (const use of module.modules) {
        if (configuredModules.has(use)) {
          console.warn(`preset: module "${use}" is configured but feature "${feature}" is not enabled – its pipelines and steps are not wired`);
        }
      }
    }
  }

  if (enabledFeatures.has("redirects")) {
    const validateModule = options.modules.find((entry) => entry.use === VALIDATE_JSONSCHEMA_MODULE);
    if (validateModule === undefined) {
      throw new Error(`preset: feature "redirects" needs module "${VALIDATE_JSONSCHEMA_MODULE}" with schema "redirects.rules" – use presetSchemas()`);
    }
    if (!hasRedirectsRulesSchema(validateModule.config)) {
      throw new Error('preset: feature "redirects" needs schema "redirects.rules" in validate-jsonschema config – use presetSchemas()');
    }
  }

  let triggers: TriggerConfig[] = canonicalTriggers
    .filter((entry) => entry.feature === undefined || enabledFeatures.has(entry.feature))
    .filter((entry) => !("http" in entry.trigger) || entry.trigger.pipeline !== "resolvePage" || "pages" in collections)
    .map((entry) => entry.trigger);
  triggers = insertCollectionTriggers(triggers, collections);

  const overrideNames = new Set(Object.keys(options.overrides ?? {}));
  const excludeNames = new Set<string>(options.exclude ?? []);
  for (const name of excludeNames) {
    if (overrideNames.has(name)) {
      throw new Error(`preset: pipeline "${name}" is both overridden and excluded`);
    }
  }

  const cronPipelineNames = new Set(triggers.filter((trigger) => "cron" in trigger).map((trigger) => trigger.pipeline));
  const cronPipelineFeatures = new Map(
    canonicalTriggers.filter((entry) => "cron" in entry.trigger).map((entry) => [entry.trigger.pipeline, entry.feature]),
  );
  for (const [name, cron] of Object.entries(options.schedules ?? {})) {
    if (cron === undefined) continue;
    if (!cronPipelineNames.has(name)) {
      const gatingFeature = cronPipelineFeatures.get(name);
      if (gatingFeature !== undefined) {
        throw new Error(`preset: schedule for pipeline "${name}" – feature "${gatingFeature}" is not enabled`);
      }
      throw new Error(`preset: schedule for unknown cron pipeline "${name}"`);
    }
    if (excludeNames.has(name)) {
      throw new Error(`preset: pipeline "${name}" is both excluded and rescheduled`);
    }
  }

  pipelines = applyOverrides(pipelines, options.overrides ?? {});

  const excluded = applyExclude(pipelines, triggers, options.exclude ?? []);
  pipelines = excluded.pipelines;
  triggers = excluded.triggers;

  triggers = applySchedules(triggers, options.schedules ?? {});

  const pipelineDefs = Object.keys(pipelines)
    .sort()
    .map((name) => definePipeline({ name, steps: pipelines[name] ?? [] }));

  return { pipelines: pipelineDefs, triggers };
}

export function presetSchemas({
  features,
  collections,
}: {
  features: readonly Feature[];
  collections?: Record<string, CollectionModel>;
}): Record<string, string> {
  const appRoot = process.env.KESTREL_APP_ROOT ?? process.cwd();
  const navigationConsumerPath = resolve(appRoot, "schemas/settings.navigation.json");
  const navigationDefaultPath = process.env.KESTREL_NAVIGATION_SCHEMA_DEFAULT ?? fileURLToPath(new URL("../schemas/settings.navigation.json", import.meta.url));
  const schemas: Record<string, string> = {
    "settings.navigation": existsSync(navigationConsumerPath) ? navigationConsumerPath : navigationDefaultPath,
  };
  for (const [name, model] of Object.entries(collections ?? DEFAULT_COLLECTIONS)) {
    if (model.kind !== "multi" || !("body" in model.fields)) continue;
    schemas[`${name}.body`] =
      name === "pages" ? process.env.KESTREL_BLOCK_SCHEMA ?? resolve(appRoot, ".nuxt/kestrel/pages.body.json") : resolve(appRoot, `schemas/${name}.body.json`);
  }
  if (features.includes("redirects")) {
    schemas["redirects.rules"] = process.env.KESTREL_REDIRECTS_SCHEMA ?? fileURLToPath(new URL("../schemas/redirects.rules.json", import.meta.url));
  }
  return schemas;
}
