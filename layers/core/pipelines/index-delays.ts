/**
 * How long, in milliseconds, the preset holds back each index export after the first request of a window: the
 * queue's `delayMs` for `refreshIndexes` (sitemap.xml, robots.txt, llms.txt) and `refreshLlms` (llms-full.txt,
 * which reads the HTML and so trails the re-renders a save marks), and delivery-static's
 * `dependencies.indexesDelayMs` for the background loop.
 */
export const INDEX_EXPORT_DELAYS = { refreshIndexes: 1000, refreshLlms: 3000, background: 1000 } as const;
