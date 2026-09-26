/** The page delivery pipelines the `delivery` feature composes, by role. */
export const PAGE_DELIVERY_PIPELINES = {
  publish: "publishPage",
  unpublish: "unpublishPage",
  publishStatus: "pagePublishStatus",
  staleStatus: "pagesStaleStatus",
  retryStale: "retryStalePages",
  publishAll: "publishAllPages",
} as const;

/** The pipelines the preset composes per routed collection, by role. */
export interface RoutedPipelineNames {
  publish: string;
  unpublish: string;
  publishStatus: string;
  referrers: string;
  referrersMany: string;
  preview: string;
  resolve: string;
  publishAll: string;
}

/**
 * The per-collection pipeline names of a routed collection: `pages` keeps `publishPage`, `pagePublishStatus`,
 * `pageReferrers`, `previewPagePath`, `resolvePage` and so on; any other collection gets `publish<Name>`,
 * `<name>PublishStatus`, `<name>Referrers`, `preview<Name>Path`, `resolve<Name>` with its own name.
 */
export function routedPipelineNames(collection: string): RoutedPipelineNames {
  const singular = collection === "pages" ? "Page" : collection.charAt(0).toUpperCase() + collection.slice(1);
  const lower = singular.charAt(0).toLowerCase() + singular.slice(1);
  return {
    publish: `publish${singular}`,
    unpublish: `unpublish${singular}`,
    publishStatus: `${lower}PublishStatus`,
    referrers: `${lower}Referrers`,
    referrersMany: `${lower}ReferrersMany`,
    preview: `preview${singular}Path`,
    resolve: `resolve${singular}`,
    publishAll: collection === "pages" ? PAGE_DELIVERY_PIPELINES.publishAll : `publishAll${collection.charAt(0).toUpperCase() + collection.slice(1)}`,
  };
}

/** Whether a pipeline is one of the per-document publish or unpublish pipelines a routed collection's write starts. */
export function isOwnDeliveryPipeline(pipeline: string): boolean {
  return /^(?:un)?publish[A-Z]/.test(pipeline) && !pipeline.startsWith("publishAll");
}
