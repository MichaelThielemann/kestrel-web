export const ALL_FEATURES = [
  "ratelimit",
  "sanitizeSvg",
  "references",
  "links",
  "delivery",
  "redirects",
  "images",
  "replication",
  "migrations",
  "audit",
  "insights",
  "eventsQueue",
  "revisions",
];

export const DEFAULT_FEATURES = ["ratelimit", "sanitizeSvg", "references", "links", "delivery", "redirects", "images", "audit", "insights", "eventsQueue", "revisions"];

export const FEATURE_SUMMARY = {
  ratelimit: "rate limits for sign-in (per address and per account) and password checks",
  sanitizeSvg: "sanitize uploaded SVGs and serve them inline",
  references: "track which page or media a record points at",
  links: "extract and check the links inside page bodies",
  delivery: "render published pages to the blobstore as static HTML (adds sanitizeSvg)",
  redirects: "editable redirect rules",
  images: "derived image variants for the sizes your blocks declare",
  replication: "periodic snapshots of the SQLite database",
  migrations: "run content migrations from the admin",
  audit: "persist sign-ins, failed sign-ins, account changes, denied and rate-limited requests",
  insights: "the /admin/insights page (needs three extra packages)",
  eventsQueue: "durable event queue instead of inline delivery",
  revisions: "version history for every multi collection",
};

export const INSIGHTS_FEATURE = "insights";
export const MIGRATIONS_FEATURE = "migrations";
export const REDIRECTS_FEATURE = "redirects";

const IMPLIED_FEATURES = { delivery: ["sanitizeSvg"] };

export function normalizeFeatures(requested) {
  const known = new Set(ALL_FEATURES);
  const unknown = requested.filter((feature) => !known.has(feature));
  const wanted = new Set(requested.filter((feature) => known.has(feature)));
  for (const feature of [...wanted]) for (const implied of IMPLIED_FEATURES[feature] ?? []) wanted.add(implied);
  const selected = ALL_FEATURES.filter((feature) => wanted.has(feature));
  return { features: selected, unknown };
}
