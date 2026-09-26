import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipelineDefiner } from "@michaelthielemann/kestrel/definePipeline";
import type { PresetStep } from "../module-registry";
import { fieldTypeSchemas } from "../field-types";
import type { FieldTypes } from "../field-types";
import { MOUNTS_FIELD, RESERVED_PAGE_SEGMENTS } from "../mount-path";
import { buildPreset, throwSink } from "./checkPreset";
import { mountedCollections } from "./paths";
import type { CollectionModel, Feature, Preset, PresetOptions } from "./checkPreset";
import { DEFAULT_COLLECTIONS, hasSlugValueSchema } from "./collections";

export type { CollectionModel } from "./collections";
export type { PresetEntry } from "./compose";
export { collectionVerbs, isRoutedCollection, MULTI_VERBS, SINGLE_VERBS } from "./capabilities";
export { MOUNTS_FIELD, PATH_PIPELINES, PATHS_MOVED_EVENT, mountedCollections, routedCollections } from "./paths";
export { routedPipelineNames } from "./delivery-names";
export type { CollectionVerb, MultiVerb, SingleVerb } from "./capabilities";
export type { Workflow } from "../app/types/kestrel";
export type { PresetStep } from "../module-registry";
export { presetModuleConfig } from "./config";
export { anonymousFieldGrants, fieldCutSteps } from "./field-grants";
export type { FieldCutShape, FieldGrantModel, FieldGrants, PipelineChanges } from "./field-grants";
export { defineFieldTypes } from "../field-types";
export type { CustomFieldTypes, FieldTypeDefinition, FieldTypes, StorageFieldType } from "../field-types";
export type {
  ModuleEntry,
  PresetAudit,
  PresetBootstrap,
  PresetContentModel,
  PresetLlms,
  PresetMediaPolicy,
  PresetMigrations,
  PresetModuleConfigOptions,
  PresetRateLimit,
  PresetPaths,
  PresetRevisions,
  PresetRoles,
  PresetSession,
} from "./config";
export {
  checkPreset,
  featureOrder,
  lanesFor,
  RELAY_CANDIDATE_PIPELINES,
  relayPipelinesFor,
  staticPipelineNames,
} from "./checkPreset";
export type {
  CheckPresetResult,
  CronPipelineName,
  Feature,
  FeatureModule,
  Preset,
  PresetOptions,
  PresetPipelineName,
  PresetProblem,
  StaticPipelineName,
} from "./checkPreset";

export const definePipeline = pipelineDefiner<PresetStep>();

/**
 * Composes a preset, throwing at the first problem — the same engine, messages and order as
 * `checkPreset()`, which instead collects every problem it finds.
 */
export function definePreset<C extends Record<string, CollectionModel> = Record<string, CollectionModel>, S extends string = PresetStep>(
  options: PresetOptions<C, S>,
): Preset {
  return buildPreset(options, throwSink());
}

/**
 * The `exclude` and `overrides` of `definePreset()`. Pass one object of this type to both functions:
 * `presetModuleConfig({ …, pipelines: changes })` and `definePreset({ …, ...changes })`.
 */
export type PresetPipelineChanges<C extends Record<string, CollectionModel> = Record<string, CollectionModel>, S extends string = PresetStep> = Pick<PresetOptions<C, S>, "exclude" | "overrides">;

export function presetSchemas({
  features,
  collections,
  fieldTypes,
}: {
  features: readonly Feature[];
  collections?: Record<string, CollectionModel>;
  fieldTypes?: FieldTypes;
}): Record<string, string | Record<string, unknown>> {
  const appRoot = process.env.KESTREL_APP_ROOT ?? process.cwd();
  const navigationConsumerPath = resolve(appRoot, "schemas/settings.navigation.json");
  const navigationDefaultPath = process.env.KESTREL_NAVIGATION_SCHEMA_DEFAULT ?? fileURLToPath(new URL("../schemas/settings.navigation.json", import.meta.url));
  const resolved = collections ?? DEFAULT_COLLECTIONS;
  const schemas: Record<string, string | Record<string, unknown>> = {
    "settings.navigation": existsSync(navigationConsumerPath) ? navigationConsumerPath : navigationDefaultPath,
  };
  for (const [name, model] of Object.entries(resolved)) {
    if (model.kind !== "multi" || !("body" in model.fields)) continue;
    const own = resolve(appRoot, `schemas/${name}.body.json`);
    const blocks = process.env.KESTREL_BLOCK_SCHEMA ?? resolve(appRoot, ".nuxt/kestrel/pages.body.json");
    schemas[`${name}.body`] = name === "pages" || (model.mount === true && !existsSync(own)) ? blocks : own;
  }
  for (const [name, model] of Object.entries(resolved)) {
    if (!hasSlugValueSchema(name, model)) continue;
    schemas[`${name}.slug`] = { type: ["string", "null"], not: { enum: [...RESERVED_PAGE_SEGMENTS] } };
  }
  const mounted = mountedCollections(resolved);
  if (mounted.length > 0) {
    schemas[`settings.${MOUNTS_FIELD}`] = {
      type: ["object", "null"],
      properties: Object.fromEntries(mounted.map((name) => [name, { type: ["string", "null"] }])),
      additionalProperties: false,
    };
  }
  if (features.includes("redirects")) {
    schemas["redirects.rules"] = process.env.KESTREL_REDIRECTS_SCHEMA ?? fileURLToPath(new URL("../schemas/redirects.rules.json", import.meta.url));
  }
  for (const [target, schema] of Object.entries(fieldTypeSchemas(resolved, fieldTypes ?? {}))) schemas[target] = schema;
  return schemas;
}
