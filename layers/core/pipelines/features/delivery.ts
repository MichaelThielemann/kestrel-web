import { resolve } from "node:path";
import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../../module-registry";
import type { PresetContext, PresetModuleEntry } from "../base";
import { collectionNames, hasLocalizedField, isGenericCollection, uncapitalize, DEFAULT_COLLECTIONS } from "../collections";
import type { CollectionModel } from "../collections";
import type { PresetEntry } from "../compose";
import { INDEX_FILE_NAMES, INDEX_FILE_PIPELINES, indexFileRoute, PAGE_DELIVERY_PIPELINES, routedPipelineNames } from "../delivery-names";
import type { FeatureModule } from "../index";
import { mountedCollections, PATH_PIPELINES, PATHS_MOVED_EVENT } from "../paths";

export { INDEX_FILE_PIPELINES, PAGE_DELIVERY_PIPELINES } from "../delivery-names";

export const SETTINGS_DEPENDENTS_PIPELINE = "settingsDependents";
export const MEDIA_DEPENDENTS_PIPELINE = "mediaDependents";
export const REPUBLISH_OUTPUT_PIPELINE = "republishOutput";
export const REFRESH_LLMS_PIPELINE = "refreshLlms";
export const REFRESH_INDEXES_PIPELINE = "refreshIndexes";
export const BUILD_CHECK_PIPELINE = "deliveryBuildCheck";
export const RESUME_STALE_PIPELINE = "resumeStalePages";

/** The step that asks delivery-static for an export of sitemap.xml, robots.txt and llms.txt (and llms-full.txt with `llms.full`) without running it in the request. */
export const REQUEST_INDEXES_STEP = "delivery.requestIndexes";

const PERSISTENCE_MODULE = "@michaelthielemann/kestrel-persistence-sqlite";
const RESTORE_CHECKS: readonly { use: string; step: PresetStep }[] = [
  { use: "@michaelthielemann/kestrel-replication-sqlite", step: "replication.checkRestored" },
  { use: "@michaelthielemann/kestrel-backup-blobstore", step: "backup.checkRestored" },
];

function databaseFileOf(modules: readonly PresetModuleEntry[], use: string): string | undefined {
  const entry = modules.find((candidate) => candidate.use === use);
  const config = entry === undefined ? undefined : effectiveModuleConfig(entry);
  const file: unknown = typeof config === "object" && config !== null ? Reflect.get(config, "file") : undefined;
  return typeof file === "string" && file !== "" ? resolve(file) : undefined;
}

/**
 * The `checkRestored` step of the module that restores persistence-sqlite's database file (replication-sqlite, else
 * backup-blobstore), as an empty list when neither is configured on that file. It belongs directly before
 * `delivery.checkBuild`, which reads the restore it reports.
 */
export function restoreCheckSteps(modules: readonly PresetModuleEntry[] | undefined): PresetStep[] {
  const database = modules === undefined ? undefined : databaseFileOf(modules, PERSISTENCE_MODULE);
  if (modules === undefined || database === undefined) return [];
  const check = RESTORE_CHECKS.find((candidate) => databaseFileOf(modules, candidate.use) === database);
  return check === undefined ? [] : [check.step];
}

const MULTI_CHANGES = ["created", "updated", "deleted", "restored", "translationRemoved"] as const;
const SINGLE_CHANGES = ["updated"] as const;
/** The events that mark the pages reading a media item for a re-render; a trigger on one that no composed pipeline emits is left out. */
export const MEDIA_DEPENDENT_EVENTS: readonly string[] = ["media.updated", "media.deleted", "images.variantsChanged", "media.trashed", "media.restored"];

/** The pipeline that marks the pages which read a collection's documents: `pageDependents` for `pages`, `<name>Dependents` for any other collection. */
export function dependentsPipelineName(collection: string): string {
  return `${uncapitalize(collectionNames(collection).singular)}Dependents`;
}

/** Every dependents pipeline the `delivery` feature composes for `collections`: one per generic collection, plus settings and media. */
export function dependentsPipelineNames(collections: Record<string, CollectionModel>): string[] {
  const names = Object.keys(collections).filter(isGenericCollection).map(dependentsPipelineName);
  return [...names, SETTINGS_DEPENDENTS_PIPELINE, MEDIA_DEPENDENTS_PIPELINE];
}

function dependents(collections: Record<string, CollectionModel>): { pipelines: Record<string, PresetEntry<PresetStep>[]>; triggers: TriggerConfig[] } {
  const pipelines: Record<string, PresetEntry<PresetStep>[]> = {};
  const triggers: TriggerConfig[] = [];
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name)) continue;
    const pipeline = dependentsPipelineName(name);
    pipelines[pipeline] = [`delivery.markDependents:${name}`];
    const { event } = collectionNames(name);
    for (const change of model.kind === "multi" ? MULTI_CHANGES : SINGLE_CHANGES) triggers.push({ event: `${event}.${change}`, pipeline });
  }
  pipelines[SETTINGS_DEPENDENTS_PIPELINE] = ["delivery.markDependents:settings", REQUEST_INDEXES_STEP];
  triggers.push({ event: "settings.updated", pipeline: SETTINGS_DEPENDENTS_PIPELINE });
  pipelines[MEDIA_DEPENDENTS_PIPELINE] = ["delivery.markDependents:media"];
  for (const event of MEDIA_DEPENDENT_EVENTS) triggers.push({ event, pipeline: MEDIA_DEPENDENTS_PIPELINE });
  return { pipelines, triggers };
}

function mountedDelivery(collections: Record<string, CollectionModel>): { pipelines: Record<string, PresetEntry<PresetStep>[]>; triggers: TriggerConfig[] } {
  const pipelines: Record<string, PresetEntry<PresetStep>[]> = {};
  const triggers: TriggerConfig[] = [];
  for (const name of mountedCollections(collections)) {
    const names = routedPipelineNames(name);
    const { event } = collectionNames(name);
    pipelines[names.publish] = [`delivery.publish:${name}`, REQUEST_INDEXES_STEP];
    pipelines[names.unpublish] = [`delivery.unpublish:${name}`, REQUEST_INDEXES_STEP];
    pipelines[names.publishStatus] = ["authn.requireUser", `authz.require:${name}.manage`, `delivery.readStatus:${name}`];
    pipelines[names.publishAll] = ["authn.requireUser", `authz.require:${name}.manage`, `delivery.markAll:${name}`, REQUEST_INDEXES_STEP];
    triggers.push({ http: `POST /admin/publish-all/${name}`, pipeline: names.publishAll });
    triggers.push({ http: `GET /admin/publish-status/${name}/:id`, pipeline: names.publishStatus });
    for (const change of ["created", "updated", "restored"]) triggers.push({ event: `${event}.${change}`, pipeline: names.publish });
    triggers.push({ event: `${event}.deleted`, pipeline: names.unpublish });
    const model = collections[name];
    if (model !== undefined && hasLocalizedField(model)) triggers.push({ event: `${event}.translationRemoved`, pipeline: names.publish });
  }
  return { pipelines, triggers };
}

function indexFiles(): { pipelines: Record<string, PresetEntry<PresetStep>[]>; triggers: TriggerConfig[] } {
  const pipelines: Record<string, PresetEntry<PresetStep>[]> = {};
  const triggers: TriggerConfig[] = [];
  for (const file of INDEX_FILE_NAMES) {
    const pipeline = INDEX_FILE_PIPELINES[file];
    pipelines[pipeline] = [`delivery.readIndexFile:${file}`];
    triggers.push({ http: indexFileRoute(file), pipeline });
  }
  return { pipelines, triggers };
}

export default function delivery(context: PresetContext): FeatureModule {
  const triggers: TriggerConfig[] = [
    { event: "page.created", pipeline: PAGE_DELIVERY_PIPELINES.publish },
    { event: "page.updated", pipeline: PAGE_DELIVERY_PIPELINES.publish },
    { event: "page.restored", pipeline: PAGE_DELIVERY_PIPELINES.publish },
    { event: "page.deleted", pipeline: PAGE_DELIVERY_PIPELINES.unpublish },
    { event: PATHS_MOVED_EVENT, pipeline: PATH_PIPELINES.movedDelivery },
  ];
  if (context.pagesTranslatable) {
    triggers.push({ event: "page.translationRemoved", pipeline: PAGE_DELIVERY_PIPELINES.publish });
  }
  const marking = dependents(context.collections ?? DEFAULT_COLLECTIONS);
  const mounted = mountedDelivery(context.collections ?? DEFAULT_COLLECTIONS);
  const served = indexFiles();
  triggers.push(...mounted.triggers, ...marking.triggers, ...served.triggers);
  const pipelines: FeatureModule["pipelines"] = {
    [PAGE_DELIVERY_PIPELINES.publish]: ["delivery.publish:pages", REQUEST_INDEXES_STEP],
    [PAGE_DELIVERY_PIPELINES.unpublish]: ["delivery.unpublish:pages", REQUEST_INDEXES_STEP],
    [PAGE_DELIVERY_PIPELINES.publishStatus]: ["authn.requireUser", "authz.require:pages.manage", "delivery.readStatus:pages"],
    [PAGE_DELIVERY_PIPELINES.staleStatus]: ["authn.requireUser", "authz.require:pages.manage", "delivery.readStaleStatus"],
    [PAGE_DELIVERY_PIPELINES.retryStale]: ["authn.requireUser", "authz.require:pages.manage", "delivery.retryStale", REQUEST_INDEXES_STEP],
    [PAGE_DELIVERY_PIPELINES.publishAll]: ["authn.requireUser", "authz.require:pages.manage", "delivery.markAll:pages", REQUEST_INDEXES_STEP],
    [RESUME_STALE_PIPELINE]: ["delivery.resumeStale"],
    [BUILD_CHECK_PIPELINE]: [...restoreCheckSteps(context.modules), "delivery.checkBuild", REQUEST_INDEXES_STEP],
    repairPublicMedia: ["authn.requireUser", "authz.require:media.manage", "media.syncPublic"],
    syncPublicMedia: ["media.syncPublic"],
    [PATH_PIPELINES.movedDelivery]: ["delivery.markMoved"],
    ...mounted.pipelines,
    ...marking.pipelines,
    ...served.pipelines,
  };
  if (context.eventsQueued) {
    pipelines[REPUBLISH_OUTPUT_PIPELINE] = ["delivery.republishOutput"];
    pipelines[REFRESH_INDEXES_PIPELINE] = ["delivery.exportIndexes"];
    pipelines[REFRESH_LLMS_PIPELINE] = ["delivery.exportLlmsFull"];
    triggers.push(
      { event: "delivery.outputStale", pipeline: REPUBLISH_OUTPUT_PIPELINE },
      { event: "delivery.indexesStale", pipeline: REFRESH_INDEXES_PIPELINE },
      { event: "delivery.llmsStale", pipeline: REFRESH_LLMS_PIPELINE },
    );
  }
  return {
    modules: ["@michaelthielemann/kestrel-delivery-static", "@michaelthielemann/kestrel-renderer-nuxt"],
    pipelines,
    patches: [
      { pipeline: "repairPublicMedia", steps: ["images.syncPublic"], at: "end", when: "images" },
      { pipeline: "syncPublicMedia", steps: ["images.syncPublic"], at: "end", when: "images" },
    ],
    triggers,
  };
}
