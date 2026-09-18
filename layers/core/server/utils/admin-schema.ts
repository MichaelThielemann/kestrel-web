import type { AdminSchema } from "../../app/types/api";
import type { Feature } from "#kestrel/pipelines";
import type { CollectionUi, ContentType } from "../../collections-ui";
import { serializeCollections } from "../../collections-ui";

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
  pipelines: readonly string[];
}

export function buildAdminSchema({ model, collectionsUi, features, prefixPrimary, locales, defaultLocale, pipelines }: AdminSchemaSources): AdminSchema {
  return {
    locales: { all: [...(model.locales ?? locales)], primary: model.defaultLocale ?? defaultLocale, prefixPrimary },
    collections: serializeCollections(model.types, collectionsUi),
    features: [...features],
    capabilities: { pipelines: [...pipelines] },
  };
}
