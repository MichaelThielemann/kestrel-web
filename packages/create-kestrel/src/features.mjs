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

export const DEFAULT_FEATURES = ["references", "links", "delivery", "redirects", "images", "insights", "revisions"];

export const FEATURE_SUMMARY = {
  ratelimit: "rate limit for the login route",
  sanitizeSvg: "sanitize uploaded SVGs and serve them inline",
  references: "track which page or media a record points at",
  links: "extract and check the links inside page bodies",
  delivery: "render published pages to the blobstore as static HTML",
  redirects: "editable redirect rules",
  images: "derived image variants for the sizes your blocks declare",
  replication: "periodic snapshots of the SQLite database",
  migrations: "run content migrations from the admin",
  audit: "persist login and logout events",
  insights: "the /admin/insights page (needs three extra packages)",
  eventsQueue: "durable event queue instead of the in-memory one",
  revisions: "version history for every multi collection",
};

export const INSIGHTS_FEATURE = "insights";
export const MIGRATIONS_FEATURE = "migrations";
export const REDIRECTS_FEATURE = "redirects";

export function normalizeFeatures(requested) {
  const known = new Set(ALL_FEATURES);
  const unknown = requested.filter((feature) => !known.has(feature));
  const selected = ALL_FEATURES.filter((feature) => requested.includes(feature));
  return { features: selected, unknown };
}
