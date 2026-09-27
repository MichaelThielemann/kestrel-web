import type { CollectionModel, Feature } from "#kestrel/pipelines";

export const contentTypes: Record<string, CollectionModel> = {
  news: { kind: "multi", fields: { title: { type: "text" }, cta: { type: "json" } } },
};

export const features: Feature[] = [];
