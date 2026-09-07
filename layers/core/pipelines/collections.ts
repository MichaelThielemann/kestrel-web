import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../module-registry";

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

function collectionNames(name: string): CollectionNames {
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

export function multiCollectionPipelines(name: string, model: CollectionModel): Record<string, PresetStep[]> {
  const { plural, singular, event } = collectionNames(name);
  const statusQuery = "status" in model.fields ? "?status=published" : "";
  const bodySteps: PresetStep[] = "body" in model.fields ? [`validate.check:${name}.body`, `validate.sanitize:${name}.body`, `validate.check:${name}.body`] : [];
  const pipelines: Record<string, PresetStep[]> = {
    [`list${plural}`]: ["authn.identifyUser", `authz.require:${name}.read`, `content.list:${name}${statusQuery}`],
    [`listAll${plural}`]: ["authn.requireUser", `authz.require:${name}.manage`, `content.list:${name}`],
    [`read${singular}`]: ["authn.identifyUser", `authz.require:${name}.read`, `content.get:${name}${statusQuery}`],
    [`readAny${singular}`]: ["authn.requireUser", `authz.require:${name}.manage`, `content.get:${name}`],
    [`create${singular}`]: [
      "authn.requireUser",
      `authz.require:${name}.write`,
      ...bodySteps,
      `content.create:${name}`,
      `events.emit:${event}.created`,
    ],
    [`update${singular}`]: [
      "authn.requireUser",
      `authz.require:${name}.write`,
      ...bodySteps,
      `content.update:${name}`,
      `events.emit:${event}.updated`,
    ],
    [`delete${singular}`]: ["authn.requireUser", `authz.require:${name}.delete`, `content.remove:${name}`, `events.emit:${event}.deleted`],
  };
  if (hasLocalizedField(model)) {
    pipelines[`delete${singular}Translation`] = [
      "authn.requireUser",
      `authz.require:${name}.write`,
      `content.removeTranslation:${name}`,
      `events.emit:${event}.translationRemoved`,
    ];
  }
  return pipelines;
}

export function singleCollectionPipelines(name: string): Record<string, PresetStep[]> {
  const { plural } = collectionNames(name);
  return {
    [`get${plural}`]: ["authn.identifyUser", `authz.require:${name}.read`, `content.get:${name}`],
    [`set${plural}`]: ["authn.requireUser", `authz.require:${name}.write`, `content.set:${name}`],
  };
}

export function collectionPipelines(name: string, model: CollectionModel): Record<string, PresetStep[]> {
  return model.kind === "multi" ? multiCollectionPipelines(name, model) : singleCollectionPipelines(name);
}

export function buildCollectionPipelines(collections: Record<string, CollectionModel>): Record<string, PresetStep[]> {
  const result: Record<string, PresetStep[]> = {};
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name)) continue;
    Object.assign(result, collectionPipelines(name, model));
  }
  return result;
}

export function multiCollectionTriggers(name: string, model: CollectionModel): TriggerConfig[] {
  const { plural, singular } = collectionNames(name);
  const triggers: TriggerConfig[] = [
    { http: `GET /${name}`, pipeline: `list${plural}` },
    { http: `GET /admin/${name}`, pipeline: `listAll${plural}` },
    { http: `GET /admin/${name}/:id`, pipeline: `readAny${singular}` },
    { http: `GET /${name}/:id`, pipeline: `read${singular}` },
    { http: `POST /${name}`, pipeline: `create${singular}` },
    { http: `PATCH /${name}/:id`, pipeline: `update${singular}` },
    { http: `DELETE /${name}/:id`, pipeline: `delete${singular}` },
  ];
  if (hasLocalizedField(model)) {
    triggers.push({ http: `DELETE /${name}/:id/translations/:locale`, pipeline: `delete${singular}Translation` });
  }
  return triggers;
}

export function singleCollectionTriggers(name: string): TriggerConfig[] {
  const { plural } = collectionNames(name);
  return [
    { http: `GET /${name}`, pipeline: `get${plural}` },
    { http: `PUT /${name}`, pipeline: `set${plural}` },
  ];
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

export type MultiCollectionPipelineName<K extends string> =
  | `list${Capitalized<K>}`
  | `listAll${Capitalized<K>}`
  | `read${Capitalized<K>}`
  | `readAny${Capitalized<K>}`
  | `create${Capitalized<K>}`
  | `update${Capitalized<K>}`
  | `delete${Capitalized<K>}`
  | `delete${Capitalized<K>}Translation`;

export type SingleCollectionPipelineName<K extends string> = `get${Capitalized<K>}` | `set${Capitalized<K>}`;

type GenericCollectionKeys<C extends Record<string, CollectionModel>> = Exclude<keyof C & string, "pages" | "settings" | "redirects">;

export type CollectionPipelineName<C extends Record<string, CollectionModel>> = {
  [K in GenericCollectionKeys<C>]: C[K]["kind"] extends "multi" ? MultiCollectionPipelineName<K> : SingleCollectionPipelineName<K>;
}[GenericCollectionKeys<C>];

export const DEFAULT_COLLECTIONS: Record<string, CollectionModel> = {
  pages: { kind: "multi", fields: { slug: {}, title: {}, body: {}, seo: {}, status: {}, shareImage: {}, layout: {} } },
};
