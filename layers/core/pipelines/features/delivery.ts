import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../../module-registry";
import type { PresetContext } from "../base";
import { collectionNames, isGenericCollection, uncapitalize, DEFAULT_COLLECTIONS } from "../collections";
import type { CollectionModel } from "../collections";
import type { PresetEntry } from "../compose";
import { PAGE_DELIVERY_PIPELINES } from "../delivery-names";
import type { FeatureModule } from "../index";

export { PAGE_DELIVERY_PIPELINES } from "../delivery-names";

export const SETTINGS_DEPENDENTS_PIPELINE = "settingsDependents";
export const MEDIA_DEPENDENTS_PIPELINE = "mediaDependents";
export const REPUBLISH_OUTPUT_PIPELINE = "republishOutput";
export const REFRESH_LLMS_PIPELINE = "refreshLlms";
export const BUILD_CHECK_PIPELINE = "deliveryBuildCheck";
export const RESUME_STALE_PIPELINE = "resumeStalePages";

const MULTI_CHANGES = ["created", "updated", "deleted", "restored", "translationRemoved"] as const;
const SINGLE_CHANGES = ["updated"] as const;

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
  pipelines[SETTINGS_DEPENDENTS_PIPELINE] = ["delivery.markDependents:settings", "delivery.requestLlms"];
  triggers.push({ event: "settings.updated", pipeline: SETTINGS_DEPENDENTS_PIPELINE });
  pipelines[MEDIA_DEPENDENTS_PIPELINE] = ["delivery.markDependents:media"];
  triggers.push({ event: "media.updated", pipeline: MEDIA_DEPENDENTS_PIPELINE }, { event: "media.deleted", pipeline: MEDIA_DEPENDENTS_PIPELINE });
  return { pipelines, triggers };
}

export default function delivery(context: PresetContext): FeatureModule {
  const triggers: TriggerConfig[] = [
    { event: "page.created", pipeline: PAGE_DELIVERY_PIPELINES.publish },
    { event: "page.updated", pipeline: PAGE_DELIVERY_PIPELINES.publish },
    { event: "page.restored", pipeline: PAGE_DELIVERY_PIPELINES.publish },
    { event: "page.deleted", pipeline: PAGE_DELIVERY_PIPELINES.unpublish },
  ];
  if (context.pagesTranslatable) {
    triggers.push({ event: "page.translationRemoved", pipeline: PAGE_DELIVERY_PIPELINES.publish });
  }
  const marking = dependents(context.collections ?? DEFAULT_COLLECTIONS);
  triggers.push(...marking.triggers);
  const pipelines: FeatureModule["pipelines"] = {
    [PAGE_DELIVERY_PIPELINES.publish]: ["delivery.publish:pages", "delivery.requestLlms"],
    [PAGE_DELIVERY_PIPELINES.unpublish]: ["delivery.unpublish:pages", "delivery.requestLlms"],
    [PAGE_DELIVERY_PIPELINES.publishStatus]: ["authn.requireUser", "authz.require:pages.manage", "delivery.readStatus:pages"],
    [PAGE_DELIVERY_PIPELINES.staleStatus]: ["authn.requireUser", "authz.require:pages.manage", "delivery.readStaleStatus"],
    [PAGE_DELIVERY_PIPELINES.retryStale]: ["authn.requireUser", "authz.require:pages.manage", "delivery.retryStale"],
    publishAllPages: ["authn.requireUser", "authz.require:pages.manage", "delivery.markAll:pages"],
    [RESUME_STALE_PIPELINE]: ["delivery.resumeStale"],
    [BUILD_CHECK_PIPELINE]: ["delivery.checkBuild"],
    repairPublicMedia: ["authn.requireUser", "authz.require:media.manage", "media.syncPublic"],
    syncPublicMedia: ["media.syncPublic"],
    ...marking.pipelines,
  };
  if (context.eventsQueued) {
    pipelines[REPUBLISH_OUTPUT_PIPELINE] = ["delivery.republishOutput"];
    pipelines[REFRESH_LLMS_PIPELINE] = ["delivery.exportLlms"];
    triggers.push({ event: "delivery.outputStale", pipeline: REPUBLISH_OUTPUT_PIPELINE }, { event: "delivery.llmsStale", pipeline: REFRESH_LLMS_PIPELINE });
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
