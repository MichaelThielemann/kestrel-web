import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { RunResult } from "@michaelthielemann/kestrel";
import type { AdminSchema } from "../../app/types/api";
import type { AdminCollection } from "../../app/types/kestrel";
import type { Feature, CollectionModel, CollectionVerb } from "#kestrel/pipelines";
import { collectionVerbs, isRoutedCollection } from "#kestrel/pipelines";
import type { CollectionRouting, CollectionUi, ContentType, CustomFieldTypes } from "../../collections-ui";
import { serializeCollections } from "../../collections-ui";
import type { HttpTriggerEntry, PipelineVerdict } from "./admin-capabilities";
import { buildCapabilities, isPipelineVerdict } from "./admin-capabilities";

export interface DescribedModel {
  locales?: string[];
  defaultLocale?: string;
  types: Record<string, ContentType>;
}

export interface AdminSchemaSources {
  model: DescribedModel;
  collectionsUi: Record<string, CollectionUi>;
  features: readonly Feature[];
  prefixPrimary: boolean;
  locales: readonly string[];
  defaultLocale: string;
  customTypes?: CustomFieldTypes;
  triggers: readonly HttpTriggerEntry[];
  access: Readonly<Record<string, PipelineVerdict>>;
  /** The model as the preset composed it, which carries each collection's `mount` flag the stored model does not. */
  collections?: Readonly<Record<string, { kind: string; mount?: boolean }>>;
}

function toCollectionModel(type: ContentType, mount: boolean): CollectionModel {
  return { kind: type.kind, fields: type.fields, ...(mount ? { mount: true } : {}) };
}

export function buildAdminSchema({ model, collectionsUi, features, prefixPrimary, locales, defaultLocale, customTypes, triggers, access, collections: declared }: AdminSchemaSources): AdminSchema {
  const verbs: Record<string, Partial<Record<CollectionVerb, string>>> = {};
  const routing: Record<string, CollectionRouting> = {};
  for (const name of Object.keys(model.types)) {
    const type = model.types[name];
    if (type === undefined) continue;
    const collection = toCollectionModel(type, declared?.[name]?.mount === true);
    verbs[name] = collectionVerbs(name, collection, collectionsUi[name], customTypes?.[name]);
    const publishStatusPipeline = verbs[name]?.publishStatus;
    const published = publishStatusPipeline !== undefined && triggers.some((trigger) => trigger.pipeline === publishStatusPipeline);
    routing[name] = { routed: isRoutedCollection(name, collection), published };
  }

  const serialized = serializeCollections(model.types, collectionsUi, routing, customTypes ?? {});
  const capabilities = buildCapabilities({ triggers, access, verbs });
  const collections: AdminCollection[] = serialized.map((collection) => ({
    ...collection,
    capabilities: capabilities.collections[collection.name] ?? {},
  }));

  return {
    locales: { all: [...(model.locales ?? locales)], primary: model.defaultLocale ?? defaultLocale, prefixPrimary },
    collections,
    features: [...features],
    capabilities: capabilities.global,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPipelineAccess(value: unknown): value is Record<string, PipelineVerdict> {
  return isRecord(value) && Object.values(value).every(isPipelineVerdict);
}

export type SchemaSourcesWithoutRunFields = Omit<AdminSchemaSources, "model" | "triggers" | "access">;

export interface SchemaRunSources extends SchemaSourcesWithoutRunFields {
  triggers: readonly HttpTriggerEntry[];
}

/**
 * Turns the `adminSchemaModel` pipeline's run into the admin schema, or an error body when the run
 * did not end with `authz.describePipelineAccess`: a preset override dropped the step, or replaced
 * `ctx.result` with something that is not an object.
 */
export function schemaFromRun(run: RunResult, sources: SchemaRunSources): { status: 200; body: AdminSchema } | { status: 500; body: { error: string; code: string; retryable: boolean } } {
  const result: unknown = run.result;
  const pipelineAccess = isRecord(result) ? result.pipelineAccess : undefined;
  if (!isPipelineAccess(pipelineAccess)) {
    return {
      status: 500,
      body: {
        error: "adminSchemaModel: result.pipelineAccess missing – the pipeline must end with authz.describePipelineAccess",
        code: "INTERNAL",
        retryable: false,
      },
    };
  }
  const model = boundaryCast<DescribedModel>(result, "json");
  return { status: 200, body: buildAdminSchema({ ...sources, model, access: pipelineAccess }) };
}
