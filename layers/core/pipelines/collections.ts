import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../module-registry";
import { resolveWorkflow } from "../collections-ui/workflow";
import type { WorkflowUi } from "../collections-ui/workflow";
import type { CollectionVerb, MultiVerb, SingleVerb } from "./capabilities";
import type { PresetEntry } from "./compose";

export interface CollectionModel {
  kind: "single" | "multi";
  fields: Record<string, unknown>;
}

const HARDCODED_COLLECTIONS = new Set(["settings", "redirects"]);

interface CollectionNames {
  plural: string;
  singular: string;
  event: string;
}

const NAME_OVERRIDES: Record<string, CollectionNames> = {
  pages: { plural: "Pages", singular: "Page", event: "page" },
};

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function uncapitalize(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function collectionNames(name: string): CollectionNames {
  const override = NAME_OVERRIDES[name];
  if (override) return override;
  const pascal = capitalize(name);
  return { plural: pascal, singular: pascal, event: name };
}

export function isGenericCollection(name: string): boolean {
  return !HARDCODED_COLLECTIONS.has(name);
}

export function hasLocalizedField(model: CollectionModel): boolean {
  return Object.values(model.fields).some((field) => typeof field === "object" && field !== null && (field as { localized?: unknown }).localized === true);
}

export interface PublicCollectionStep {
  pipeline: string;
  step: string;
  base: string;
}

export function statusQueryFor(name: string, model: CollectionModel, ui?: WorkflowUi): string {
  const workflow = resolveWorkflow(name, model, ui);
  return workflow === undefined ? "" : `?status=${encodeURIComponent(workflow.live)}`;
}

export function publicCollectionSteps(name: string, model: CollectionModel, ui?: WorkflowUi): PublicCollectionStep[] {
  const pipelines = collectionPipelines(name, model, ui);
  const query = statusQueryFor(name, model, ui);
  const steps: PublicCollectionStep[] = [];
  if (pipelines.list) steps.push({ pipeline: pipelines.list.name, base: `content.list:${name}`, step: `content.list:${name}${query}` });
  if (pipelines.read) steps.push({ pipeline: pipelines.read.name, base: `content.get:${name}`, step: `content.get:${name}${query}` });
  return steps;
}

export function customFieldChecks(name: string, customFields: Record<string, string> | undefined): PresetStep[] {
  return Object.keys(customFields ?? {}).sort().map((field): PresetStep => `validate.check:${name}.${field}`);
}

/** One pipeline a collection composer names, keyed by verb elsewhere; not a pipeline definition on its own. */
export interface CollectionPipeline {
  name: string;
  steps: PresetEntry<PresetStep>[];
}

/** Flattens a verb-keyed collection pipeline map into the plain `name -> steps` shape `mergePipelines` takes. */
export function pipelinesByName(pipelines: Partial<Record<CollectionVerb, CollectionPipeline>>): Record<string, PresetEntry<PresetStep>[]> {
  const result: Record<string, PresetEntry<PresetStep>[]> = {};
  for (const pipeline of Object.values(pipelines)) {
    if (pipeline !== undefined) result[pipeline.name] = pipeline.steps;
  }
  return result;
}

export function multiCollectionPipelines(name: string, model: CollectionModel, ui?: WorkflowUi, customFields?: Record<string, string>): Partial<Record<MultiVerb, CollectionPipeline>> {
  const { plural, singular, event } = collectionNames(name);
  const statusQuery = statusQueryFor(name, model, ui);
  const bodySteps: PresetStep[] = "body" in model.fields ? [`validate.check:${name}.body`, `validate.sanitize:${name}.body`, `validate.check:${name}.body`] : [];
  const customSteps = customFieldChecks(name, customFields);
  const pipelines: Partial<Record<MultiVerb, CollectionPipeline>> = {
    list: { name: `list${plural}`, steps: ["authn.identifyUser", `authz.require:${name}.read`, `content.list:${name}${statusQuery}`] },
    listAll: { name: `listAll${plural}`, steps: ["authn.requireUser", `authz.require:${name}.manage`, `content.list:${name}`] },
    read: { name: `read${singular}`, steps: ["authn.identifyUser", `authz.require:${name}.read`, `content.get:${name}${statusQuery}`] },
    readAny: { name: `readAny${singular}`, steps: ["authn.requireUser", `authz.require:${name}.manage`, `content.get:${name}`] },
    create: {
      name: `create${singular}`,
      steps: [
        "authn.requireUser",
        `authz.require:${name}.write`,
        ...bodySteps,
        ...customSteps,
        { atomic: [`content.create:${name}`] },
        `events.emit:${event}.created`,
      ],
    },
    update: {
      name: `update${singular}`,
      steps: [
        "authn.requireUser",
        `authz.require:${name}.write`,
        ...bodySteps,
        ...customSteps,
        { atomic: [`content.update:${name}`] },
        `events.emit:${event}.updated`,
      ],
    },
    delete: {
      name: `delete${singular}`,
      steps: [
        "authn.requireUser",
        `authz.require:${name}.delete`,
        { atomic: [`content.remove:${name}`] },
        `events.emit:${event}.deleted`,
      ],
    },
  };
  if (hasLocalizedField(model)) {
    pipelines.deleteTranslation = {
      name: `delete${singular}Translation`,
      steps: [
        "authn.requireUser",
        `authz.require:${name}.write`,
        { atomic: [`content.removeTranslation:${name}`] },
        `events.emit:${event}.translationRemoved`,
      ],
    };
  }
  return pipelines;
}

export function singleCollectionPipelines(name: string, customFields?: Record<string, string>): Partial<Record<SingleVerb, CollectionPipeline>> {
  const { plural } = collectionNames(name);
  return {
    get: { name: `get${plural}`, steps: ["authn.identifyUser", `authz.require:${name}.read`, `content.get:${name}`] },
    set: { name: `set${plural}`, steps: ["authn.requireUser", `authz.require:${name}.write`, ...customFieldChecks(name, customFields), `content.set:${name}`] },
  };
}

export function collectionPipelines(name: string, model: CollectionModel, ui?: WorkflowUi, customFields?: Record<string, string>): Partial<Record<CollectionVerb, CollectionPipeline>> {
  return model.kind === "multi" ? multiCollectionPipelines(name, model, ui, customFields) : singleCollectionPipelines(name, customFields);
}

export function buildCollectionPipelines(
  collections: Record<string, CollectionModel>,
  collectionsUi?: Record<string, WorkflowUi>,
  customFields?: Record<string, Record<string, string>>,
): Record<string, PresetEntry<PresetStep>[]> {
  const result: Record<string, PresetEntry<PresetStep>[]> = {};
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name)) continue;
    Object.assign(result, pipelinesByName(collectionPipelines(name, model, collectionsUi?.[name], customFields?.[name])));
  }
  return result;
}

export function multiCollectionTriggers(name: string, model: CollectionModel): TriggerConfig[] {
  const pipelines = multiCollectionPipelines(name, model);
  const triggers: TriggerConfig[] = [];
  if (pipelines.list) triggers.push({ http: `GET /${name}`, pipeline: pipelines.list.name });
  if (pipelines.listAll) triggers.push({ http: `GET /admin/${name}`, pipeline: pipelines.listAll.name });
  if (pipelines.readAny) triggers.push({ http: `GET /admin/${name}/:id`, pipeline: pipelines.readAny.name });
  if (pipelines.read) triggers.push({ http: `GET /${name}/:id`, pipeline: pipelines.read.name });
  if (pipelines.create) triggers.push({ http: `POST /${name}`, pipeline: pipelines.create.name });
  if (pipelines.update) triggers.push({ http: `PATCH /${name}/:id`, pipeline: pipelines.update.name });
  if (pipelines.delete) triggers.push({ http: `DELETE /${name}/:id`, pipeline: pipelines.delete.name });
  if (pipelines.deleteTranslation) triggers.push({ http: `DELETE /${name}/:id/translations/:locale`, pipeline: pipelines.deleteTranslation.name });
  return triggers;
}

export function singleCollectionTriggers(name: string): TriggerConfig[] {
  const pipelines = singleCollectionPipelines(name);
  const triggers: TriggerConfig[] = [];
  if (pipelines.get) triggers.push({ http: `GET /${name}`, pipeline: pipelines.get.name });
  if (pipelines.set) triggers.push({ http: `PUT /${name}`, pipeline: pipelines.set.name });
  return triggers;
}

export function collectionTriggers(name: string, model: CollectionModel): TriggerConfig[] {
  return model.kind === "multi" ? multiCollectionTriggers(name, model) : singleCollectionTriggers(name);
}

export function insertCollectionTriggers(triggers: TriggerConfig[], collections: Record<string, CollectionModel>): TriggerConfig[] {
  const pagesModel = collections.pages;
  const resolveIndex = triggers.findIndex((trigger) => "http" in trigger && trigger.pipeline === "resolvePage");
  let result = triggers;
  if (pagesModel && resolveIndex !== -1) {
    result = [...triggers.slice(0, resolveIndex + 1), ...multiCollectionTriggers("pages", pagesModel), ...triggers.slice(resolveIndex + 1)];
  }
  const extra: TriggerConfig[] = [];
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name) || name === "pages") continue;
    extra.push(...collectionTriggers(name, model));
  }
  return [...result, ...extra];
}

type Capitalized<S extends string> = S extends `${infer F}${infer R}` ? `${Uppercase<F>}${R}` : S;

export type RevisionPipelineName<K extends string> =
  | `${K}Revisions`
  | `${K}Revision`
  | `label${Capitalized<K>}Revision`
  | `restore${Capitalized<K>}Revision`;

export type MultiCollectionPipelineName<K extends string> =
  | `list${Capitalized<K>}`
  | `listAll${Capitalized<K>}`
  | `read${Capitalized<K>}`
  | `readAny${Capitalized<K>}`
  | `create${Capitalized<K>}`
  | `update${Capitalized<K>}`
  | `delete${Capitalized<K>}`
  | `delete${Capitalized<K>}Translation`
  | RevisionPipelineName<K>;

export type SingleCollectionPipelineName<K extends string> = `get${Capitalized<K>}` | `set${Capitalized<K>}`;

type GenericCollectionKeys<C extends Record<string, CollectionModel>> = Exclude<keyof C & string, "pages" | "settings" | "redirects">;

export type CollectionPipelineName<C extends Record<string, CollectionModel>> = {
  [K in GenericCollectionKeys<C>]: C[K]["kind"] extends "multi" ? MultiCollectionPipelineName<K> : SingleCollectionPipelineName<K>;
}[GenericCollectionKeys<C>];

export const DEFAULT_COLLECTIONS: Record<string, CollectionModel> = {
  pages: { kind: "multi", fields: { slug: {}, title: {}, body: {}, seo: {}, status: {}, shareImage: {}, layout: {} } },
};
