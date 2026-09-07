import { resolve } from "node:path";
import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { definePreset, presetSchemas } from "#kestrel/pipelines";
import { contentModel, contentTypes, features } from "./shared/model";

const here = (path: string): string => resolve(process.env.KESTREL_APP_ROOT ?? process.cwd(), path);

const modules = [
  { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: here("./data/blobs") } },
  { use: "@michaelthielemann/kestrel-replication-sqlite", config: { file: here("./data/kestrel.db") } },
  { use: "@michaelthielemann/kestrel-persistence-sqlite", config: { file: here("./data/kestrel.db") } },
  { use: "@michaelthielemann/kestrel-sanitize-svg", config: {} },
  { use: "@michaelthielemann/kestrel-media-default", config: { prefix: "media/", allowedTypes: ["image/*", "application/pdf"], deniedTypes: ["text/html", "application/xhtml+xml"], maxBytes: 5242880, locales: ["de", "en"], defaultLocale: "de" } },
  { use: "@michaelthielemann/kestrel-images-default", config: { publicPath: "/api/media" } },
  {
    use: "@michaelthielemann/kestrel-authn-multi",
    config: {
      identifier: "username",
      minPasswordLength: 8,
      sessionTtlSeconds: 86400,
      bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98", roles: ["admin"] },
    },
  },
  { use: "@michaelthielemann/kestrel-authz-roles", config: { roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"] }, anonymous: ["pages.read", "settings.read", "media.read"] } },
  { use: "@michaelthielemann/kestrel-content-default", config: contentModel },
  { use: "@michaelthielemann/kestrel-site-default", config: {} },
  { use: "@michaelthielemann/kestrel-references-default", config: { targets: { pages: { content: "pages" }, media: { collection: "media_items" } } } },
  { use: "@michaelthielemann/kestrel-links-default", config: { timeoutMs: 10000, concurrency: 4, recheckAfterSeconds: 21600 } },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: presetSchemas({ features, collections: contentTypes }), watch: process.env.NODE_ENV !== "production" } },
  { use: "@michaelthielemann/kestrel-renderer-nuxt", config: {} },
  {
    use: "@michaelthielemann/kestrel-delivery-static",
    config: {
      types: { pages: {} },
      prefix: "site/",
      llms: { full: true, headings: { pages: "Pages" }, ...(process.env.NUXT_PUBLIC_SITE_URL ? { siteUrl: process.env.NUXT_PUBLIC_SITE_URL } : {}) },
    },
  },
  { use: "@michaelthielemann/kestrel-redirects-default", config: { prefix: "site/" } },
  { use: "@michaelthielemann/kestrel-audit-persistence", config: {} },
  { use: "@michaelthielemann/kestrel-events-inmemory", config: {} },
  { use: "@michaelthielemann/kestrel-ratelimit-memory", config: { buckets: { login: { limit: 5, windowSeconds: 60 } } } },
];

export const preset = definePreset({ modules, features, collections: contentTypes });

export default defineConfig({ modules, triggers: preset.triggers, http: null });
