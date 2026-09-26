import type { WorkflowUi } from "../collections-ui/workflow";
import { SETTINGS_PIPELINES } from "./base";
import { collectionPipelines, isGenericCollection } from "./collections";
import type { CollectionModel, CollectionPipeline } from "./collections";
import { routedPipelineNames } from "./delivery-names";
import { REDIRECTS_PIPELINES } from "./features/redirects";
import { PATH_PIPELINES, parentFieldOf } from "./paths";
import { revisionPipelineNames } from "./features/revisions";

export const MULTI_VERBS = [
  "list", "listAll", "read", "readAny", "create", "update", "delete", "deleteTranslation",
  "revisions", "revision", "labelRevision", "restoreRevision", "publishStatus", "referrers", "referrersMany", "previewPath", "tree",
] as const;

export const SINGLE_VERBS = ["get", "set"] as const;

export type MultiVerb = (typeof MULTI_VERBS)[number];
export type SingleVerb = (typeof SINGLE_VERBS)[number];
export type CollectionVerb = MultiVerb | SingleVerb;

const ALL_VERBS: readonly CollectionVerb[] = [...MULTI_VERBS, ...SINGLE_VERBS];

/**
 * Whether `site-default` owns this collection's public paths: `pages`, and every multi collection declaring
 * `mount: true`. The preset composes the path index, the public resolve route and delivery for exactly these,
 * independent of the caller's access.
 */
export function isRoutedCollection(name: string, model: Pick<CollectionModel, "kind" | "mount">): boolean {
  return name === "pages" || (model.kind === "multi" && model.mount === true);
}

function namesOf(pipelines: Partial<Record<CollectionVerb, CollectionPipeline>>): Partial<Record<CollectionVerb, string>> {
  const result: Partial<Record<CollectionVerb, string>> = {};
  for (const verb of ALL_VERBS) {
    const pipeline = pipelines[verb];
    if (pipeline !== undefined) result[verb] = pipeline.name;
  }
  return result;
}

/** The pipeline behind each verb of one collection, as the preset's composers name it; whether it is booted is the manifest's business. */
export function collectionVerbs(
  name: string,
  model: CollectionModel,
  ui?: WorkflowUi,
  customFields?: Record<string, string>,
): Partial<Record<CollectionVerb, string>> {
  if (name === "settings") return { ...SETTINGS_PIPELINES };
  if (name === "redirects") return { ...REDIRECTS_PIPELINES };
  if (!isGenericCollection(name)) return {};

  const verbs = namesOf(collectionPipelines(name, model, ui, customFields));
  if (model.kind === "multi") {
    const revisionNames = revisionPipelineNames(name);
    verbs.revisions = revisionNames.revisions;
    verbs.revision = revisionNames.revision;
    verbs.labelRevision = revisionNames.labelRevision;
    verbs.restoreRevision = revisionNames.restoreRevision;
  }
  if (isRoutedCollection(name, model)) {
    const routed = routedPipelineNames(name);
    verbs.publishStatus = routed.publishStatus;
    verbs.referrers = routed.referrers;
    verbs.referrersMany = routed.referrersMany;
    verbs.previewPath = routed.preview;
    if (parentFieldOf(name, model) !== undefined) verbs.tree = PATH_PIPELINES.tree;
  }
  return verbs;
}
