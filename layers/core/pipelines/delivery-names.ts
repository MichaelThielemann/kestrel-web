/** The page delivery pipelines the `delivery` feature composes, by role. */
export const PAGE_DELIVERY_PIPELINES = {
  publish: "publishPage",
  unpublish: "unpublishPage",
  publishStatus: "pagePublishStatus",
  staleStatus: "pagesStaleStatus",
  retryStale: "retryStalePages",
} as const;
