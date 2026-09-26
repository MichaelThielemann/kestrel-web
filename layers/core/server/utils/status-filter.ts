import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { isGenericCollection, publicCollectionSteps } from "../../pipelines/collections";
import type { CollectionModel } from "../../pipelines/collections";
import type { WorkflowUi } from "../../collections-ui/workflow";
import { moduleConfigForStep, type ConfigEntry, type ModuleLike } from "./modules";

export interface PipelineShape {
  name: string;
  steps: readonly PipelineEntry<string>[];
}

export interface StatusFilterProblem {
  collection: string;
  pipeline: string;
  expected: string;
  actual: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function contentCollections(config: unknown): Record<string, CollectionModel> {
  if (!isRecord(config) || !isRecord(config.types)) return {};
  const collections: Record<string, CollectionModel> = {};
  for (const [name, type] of Object.entries(config.types)) {
    if (!isRecord(type) || !isRecord(type.fields)) continue;
    collections[name] = { kind: type.kind === "single" ? "single" : "multi", fields: type.fields };
  }
  return collections;
}

export function statusFilterProblems(
  collections: Record<string, CollectionModel>,
  collectionsUi: Record<string, WorkflowUi>,
  pipelines: readonly PipelineShape[],
): StatusFilterProblem[] {
  const byName = new Map(pipelines.map((pipeline) => [pipeline.name, pipelineSteps(pipeline.steps)]));
  const problems: StatusFilterProblem[] = [];
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name) || model.kind !== "multi") continue;
    for (const expected of publicCollectionSteps(name, model, collectionsUi[name])) {
      const steps = byName.get(expected.pipeline);
      if (steps === undefined) continue;
      const actual = steps.find((step) => step === expected.base || step.startsWith(`${expected.base}?`));
      if (actual === undefined || actual === expected.step) continue;
      problems.push({ collection: name, pipeline: expected.pipeline, expected: expected.step, actual });
    }
  }
  return problems;
}

export function statusFilterFailure(problems: readonly StatusFilterProblem[]): string | undefined {
  if (problems.length === 0) return undefined;
  const lines = problems.map(
    (problem) => `  ${problem.collection}: pipeline "${problem.pipeline}" runs "${problem.actual}" but the declared workflow needs "${problem.expected}"`,
  );
  return [
    "collections-ui: the public read pipelines do not filter on the declared workflow status",
    ...lines,
    "  fix: pass the same map to the preset – definePreset({ modules, features, collections, collectionsUi })",
  ].join("\n");
}

/** The status-filter failure of a project whose `content.list` step `contentOwner` provides, `undefined` when its public read pipelines filter as declared. */
export function projectStatusFilterFailure(
  modules: readonly ModuleLike[],
  configModules: readonly ConfigEntry[],
  contentOwner: string | undefined,
  collectionsUi: Record<string, WorkflowUi>,
  pipelines: readonly PipelineShape[],
): string | undefined {
  const content = moduleConfigForStep(modules, configModules, contentOwner);
  const shapes = pipelines.map((pipeline) => ({ name: pipeline.name, steps: pipeline.steps }));
  return statusFilterFailure(statusFilterProblems(contentCollections(content), collectionsUi, shapes));
}
