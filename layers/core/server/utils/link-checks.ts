import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import { collectionVerbs } from "../../pipelines/capabilities";
import type { CollectionModel } from "../../pipelines/collections";
import { linkOverrideFields } from "../../pipelines/link-fields";
import { contentCollections, type PipelineShape } from "./status-filter";
import { moduleConfigForStep, type ConfigEntry, type ModuleLike } from "./modules";

export interface LinkCheckProblem {
  collection: string;
  field: string;
  pipeline: string;
}

/** Every write pipeline of a collection that does not run `validate.check:<collection>.<field>` for a field the collection UI shows as a link. */
export function linkCheckProblems(collections: Record<string, CollectionModel>, collectionsUi: Record<string, unknown>, pipelines: readonly PipelineShape[]): LinkCheckProblem[] {
  const byName = new Map(pipelines.map((pipeline) => [pipeline.name, pipelineSteps(pipeline.steps)]));
  const problems: LinkCheckProblem[] = [];
  for (const [collection, fields] of Object.entries(linkOverrideFields(collections, collectionsUi))) {
    const model = collections[collection];
    if (model === undefined) continue;
    const verbs = collectionVerbs(collection, model);
    for (const pipeline of [verbs.create, verbs.update, verbs.set]) {
      const steps = pipeline === undefined ? undefined : byName.get(pipeline);
      if (pipeline === undefined || steps === undefined) continue;
      for (const field of fields) if (!steps.includes(`validate.check:${collection}.${field}`)) problems.push({ collection, field, pipeline });
    }
  }
  return problems;
}

export function linkCheckFailure(problems: readonly LinkCheckProblem[]): string | undefined {
  if (problems.length === 0) return undefined;
  return [
    "collections-ui: a field the collection UI shows as a link is written without the link check",
    ...problems.map((problem) => `  ${problem.collection}.${problem.field}: pipeline "${problem.pipeline}" does not run "validate.check:${problem.collection}.${problem.field}"`),
    "  fix: pass the same map to the preset and its schemas – definePreset({ …, collectionsUi }) and presetSchemas({ …, collectionsUi })",
  ].join("\n");
}

/** The link-check failure of a project whose `content.list` step `contentOwner` provides, `undefined` when every link field is checked on write. */
export function projectLinkCheckFailure(
  modules: readonly ModuleLike[],
  configModules: readonly ConfigEntry[],
  contentOwner: string | undefined,
  collectionsUi: Record<string, unknown>,
  pipelines: readonly PipelineShape[],
): string | undefined {
  const content = moduleConfigForStep(modules, configModules, contentOwner);
  return linkCheckFailure(linkCheckProblems(contentCollections(content), collectionsUi, pipelines));
}
