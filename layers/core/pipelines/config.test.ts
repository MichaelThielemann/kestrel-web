import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { normalizeSiteUrl, pageUrl } from "@michaelthielemann/kestrel-delivery-static/site-url";
import { presetModuleConfig } from "./config";
import type { ModuleEntry, PresetModuleConfigOptions } from "./config";
import eventsQueueModule from "@michaelthielemann/kestrel-events-queue";
import { delaysFor, lanesFor, presetSchemas } from "./index";
import type { Feature } from "./index";
import type { CollectionModel } from "./collections";
import { deviceKeys } from "../config";
import { canonicalUrl } from "../app/utils/canonical";
import { resolveStorageTypes } from "../field-types";
import { contentModel, contentTypes, features } from "../../../playground/shared/model";
import fieldTypes from "../../../playground/shared/field-types";

const DATA_DIR = "/srv/kestrel/data";
const DATABASE_FILE = resolve(DATA_DIR, "kestrel.db");
const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

const blobstore = { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(DATA_DIR, "blobs") } };
const roles = {
  roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"] },
  anonymous: ["pages.read", "settings.read", "media.read"],
};

function playgroundOptions(): PresetModuleConfigOptions {
  return { dataDir: DATA_DIR, blobstore, model: contentModel, features, fieldTypes, roles, bootstrap: { username: "admin", passwordHash: PASSWORD_HASH } };
}

function configFor(modules: readonly ModuleEntry[], use: string): unknown {
  const entry = modules.find((entry) => entry.use === `@michaelthielemann/kestrel-${use}`);
  return entry === undefined ? undefined : effectiveModuleConfig(entry);
}

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const field: unknown = Reflect.get(value, key);
  return field;
}

function moduleNames(modules: readonly ModuleEntry[]): string[] {
  return modules.map((entry) => entry.use);
}

beforeEach(() => {
  vi.stubEnv("NUXT_PUBLIC_SITE_URL", undefined);
  vi.stubEnv("KESTREL_ROBOTS_POLICY", undefined);
  vi.stubEnv("NUXT_APP_BASE_URL", undefined);
  vi.stubEnv("NUXT_APP_BUILD_ASSETS_DIR", undefined);
  vi.stubEnv("KESTREL_STORAGE_MIGRATIONS", undefined);
  vi.stubEnv("KESTREL_MIGRATIONS", undefined);
  vi.stubEnv("KESTREL_DATABASE_FILE", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("presetModuleConfig with the playground inputs", () => {
  it("produces the module list the playground spelled out by hand, plus delivery's media publicPath", () => {
    const resolved = resolveStorageTypes(contentTypes, fieldTypes, "presetModuleConfig");
    const { mount: _mount, ...blog } = contentTypes.blog;
    const storedTypes = { ...resolved, blog, settings: { ...resolved.settings, fields: { ...resolved.settings?.fields, mounts: { type: "json", required: true } } } };
    function preset(values: Record<string, unknown>): { defaults: { from: string; values: Record<string, unknown> } } {
      return { defaults: { from: "preset", values } };
    }

    const validated = presetSchemas({ features, collections: contentTypes, fieldTypes });

    expect(presetModuleConfig(playgroundOptions())).toEqual([
      { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(DATA_DIR, "blobs") } },
      { use: "@michaelthielemann/kestrel-replication-sqlite", ...preset({ file: DATABASE_FILE }) },
      { use: "@michaelthielemann/kestrel-persistence-sqlite", ...preset({ file: DATABASE_FILE }) },
      { use: "@michaelthielemann/kestrel-sanitize-svg", config: {} },
      {
        use: "@michaelthielemann/kestrel-media-default",
        ...preset({
          prefix: "media/",
          publicPath: "/media",
          allowedTypes: ["image/*", "application/pdf"],
          deniedTypes: ["text/html", "application/xhtml+xml"],
          maxBytes: 5242880,
          locales: ["de", "en"],
          defaultLocale: "de",
          publicCopy: { prefix: "site/" },
          storageMigrations: "check",
          trashRetentionDays: 30,
        }),
      },
      { use: "@michaelthielemann/kestrel-images-default", ...preset({ publicPath: "/media", publicCopy: { prefix: "site/" }, storageMigrations: "check" }) },
      {
        use: "@michaelthielemann/kestrel-authn-multi",
        ...preset({
          identifier: "username",
          minPasswordLength: 12,
          sessionTtlSeconds: 86400,
          secureCookie: true,
          bootstrap: { username: "admin", passwordHash: PASSWORD_HASH, roles: ["admin"] },
        }),
      },
      {
        use: "@michaelthielemann/kestrel-authz-roles",
        ...preset({
          roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"] },
          anonymous: ["pages.read", "settings.read", "media.read"],
          anonymousFields: {
            settings: ["id", "title", "titlePosition", "titleSeparator", "description", "navigation", "_locales", "_translations", "_links"],
            pages: ["id", "slug", "title", "body", "seo", "status", "shareImage", "accent", "layout", "_locales", "_translations", "_locale", "_links", "redirect", "_paths", "route.type"],
            media: ["id", "path", "filename", "contentType", "size", "width", "height", "alt", "title", "description", "provenance", "focus", "variants[].size", "variants[].width", "variants[].height", "variants[].format", "variants[].path", "variants[].crop", "framing.width", "framing.height"],
            mediaFile: ["headers.cache-control", "headers.x-content-provenance", "headers.x-kestrel-variant"],
            redirectRules: ["from", "pattern", "target", "status"],
          },
        }),
      },
      {
        use: "@michaelthielemann/kestrel-content-default",
        ...preset({ ...contentModel, types: storedTypes }),
      },
      {
        use: "@michaelthielemann/kestrel-site-default",
        ...preset({
          routes: { pages: { home: "home", liveWhen: { status: "published" }, parentField: "parent" }, blog: { mount: true, liveWhen: { status: "published" } } },
          mounts: { type: "settings", field: "mounts" },
          prefixPrimary: false,
          reservedPaths: ["/api", "/admin", "/media"],
        }),
      },
      {
        use: "@michaelthielemann/kestrel-references-default",
        ...preset({
          targets: { pages: { content: "pages" }, blog: { content: "blog" }, media: { media: true } },
          schemas: Object.fromEntries(Object.entries(validated).filter(([key]) => ["blog.body", "pages.body", "redirects.rules", "settings.mounts", "settings.navigation"].includes(key))),
          watch: process.env.NODE_ENV !== "production",
        }),
      },
      { use: "@michaelthielemann/kestrel-links-default", ...preset({ timeoutMs: 10000, concurrency: 4, recheckAfterSeconds: 21600 }) },
      {
        use: "@michaelthielemann/kestrel-validate-jsonschema",
        ...preset({ schemas: validated, watch: process.env.NODE_ENV !== "production" }),
      },
      { use: "@michaelthielemann/kestrel-renderer-nuxt", config: {} },
      {
        use: "@michaelthielemann/kestrel-delivery-static",
        ...preset({
          types: { pages: {}, blog: {} },
          prefix: "site/",
          prefixPrimary: false,
          reservedPaths: ["/api", "/admin", "/media"],
          robots: { policy: "disallow" },
          llms: { full: true, headings: { pages: "Pages", blog: "Blog" } },
          dependencies: { render: "background", rendererReadsDocument: true, indexesDelayMs: 1000 },
        }),
      },
      { use: "@michaelthielemann/kestrel-revisions-default", ...preset({ statusField: "status", liveStatuses: ["published"] }) },
      { use: "@michaelthielemann/kestrel-redirects-default", ...preset({ prefix: "site/", reservedPaths: ["/api", "/admin", "/media", "/_nuxt", "/__nuxt_island", "/__nuxt_error", "/_ipx", "/_preview"] }) },
      { use: "@michaelthielemann/kestrel-audit-persistence", ...preset({}) },
      { use: "@michaelthielemann/kestrel-events-inmemory", config: {} },
      { use: "@michaelthielemann/kestrel-events-direct", config: {} },
      { use: "@michaelthielemann/kestrel-ratelimit-memory", ...preset({ buckets: { login: { limit: 20, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "username", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } }, deviceCookies: { secretKey: deviceKeys().secretKey, secure: true } }) },
      { use: "@michaelthielemann/kestrel-insights", config: {} },
    ]);
  });
});

describe("presetModuleConfig attributes its own values to the preset, never to raw config", () => {
  it("gives every value it computes a defaults layer, and leaves the consumer's own blobstore entry as plain config", () => {
    const modules = presetModuleConfig(playgroundOptions());
    const blobstore = modules.find((entry) => entry.use === "@michaelthielemann/kestrel-blobstore-filesystem");
    expect(blobstore?.defaults).toBeUndefined();
    expect(blobstore?.config).toEqual({ root: resolve(DATA_DIR, "blobs") });

    for (const use of [
      "@michaelthielemann/kestrel-persistence-sqlite",
      "@michaelthielemann/kestrel-media-default",
      "@michaelthielemann/kestrel-delivery-static",
      "@michaelthielemann/kestrel-ratelimit-memory",
    ]) {
      const entry = modules.find((candidate) => candidate.use === use);
      expect(entry?.config, `${use} carries raw config instead of defaults`).toBeUndefined();
      expect(entry?.defaults?.from).toBe("preset");
    }

    const persistence = modules.find((entry) => entry.use === "@michaelthielemann/kestrel-persistence-sqlite");
    expect(persistence?.defaults).toEqual({ from: "preset", values: { file: DATABASE_FILE } });
  });
});

describe("presetModuleConfig keeps the values a consumer passes to its options as that module's own config", () => {
  function entryOf(modules: readonly ModuleEntry[], use: string): ModuleEntry | undefined {
    return modules.find((entry) => entry.use === `@michaelthielemann/kestrel-${use}`);
  }

  it("puts audit retentionDays into config and leaves it out of the preset's defaults", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["audit"], audit: { retentionDays: 90 } });
    const audit = entryOf(modules, "audit-persistence");

    expect(audit?.config).toEqual({ retentionDays: 90 });
    expect(audit?.defaults?.values).not.toHaveProperty("retentionDays");
  });

  it("puts the second factor's enforce, issuer and keys into config when the options give them", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      features: [...features, "mfa"],
      mfa: { enforce: "none", issuer: "Example Site", secretKey: "cd".repeat(32) },
    });
    const mfa = entryOf(modules, "mfa-totp");

    expect(mfa?.config).toEqual({ enforce: "none", issuer: "Example Site", secretKey: "cd".repeat(32) });
    expect(mfa?.defaults?.values).toEqual({});
  });

  it("splits a nested option into config and leaves the derived siblings in defaults", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      ratelimit: { login: { limit: 9, windowSeconds: 30 }, deviceCookies: { maxAgeSeconds: 3600 } },
      session: { minPasswordLength: 16 },
      homeSlug: "start",
      llms: { full: false },
      sitemap: false,
    });

    const ratelimit = entryOf(modules, "ratelimit-memory");
    expect(ratelimit?.config).toEqual({ buckets: { login: { limit: 9, windowSeconds: 30 } }, deviceCookies: { maxAgeSeconds: 3600 } });
    expect(fieldOf(fieldOf(ratelimit?.defaults?.values, "buckets"), "login")).toBeUndefined();
    expect(fieldOf(fieldOf(ratelimit?.defaults?.values, "deviceCookies"), "secretKey")).toBe(deviceKeys().secretKey);
    expect(entryOf(modules, "authn-multi")?.config).toEqual({ minPasswordLength: 16 });
    expect(entryOf(modules, "site-default")?.config).toEqual({ routes: { pages: { home: "start" } } });
    expect(entryOf(modules, "delivery-static")?.config).toEqual({ sitemap: false, llms: { full: false } });
  });

  it("keeps the effective config of every module the same as one layer of values", () => {
    const options: PresetModuleConfigOptions = {
      ...playgroundOptions(),
      features: [...features, "audit", "mfa", "eventsQueue"],
      audit: { retentionDays: 90 },
      mfa: { enforce: "none", secretKey: "cd".repeat(32) },
      revisions: { keep: 7 },
      eventsQueue: { pollMs: 250 },
      media: { maxBytes: 1024 },
      ratelimit: { loginAccount: { limit: 3, windowSeconds: 60 }, knownDevice: { limit: 4, windowSeconds: 60 } },
      robots: { policy: "allow" },
    };
    const modules = presetModuleConfig(options);

    expect(configFor(modules, "audit-persistence")).toEqual({ retentionDays: 90 });
    expect(configFor(modules, "revisions-default")).toMatchObject({ keep: 7, statusField: "status" });
    expect(configFor(modules, "events-queue")).toMatchObject({ pollMs: 250 });
    expect(entryOf(modules, "events-queue")?.config).toEqual({ pollMs: 250 });
    expect(configFor(modules, "media-default")).toMatchObject({ maxBytes: 1024, prefix: "media/" });
    expect(fieldOf(fieldOf(configFor(modules, "ratelimit-memory"), "buckets"), "loginAccount")).toEqual({
      limit: 3, windowSeconds: 60, key: "username", field: "username", counts: "failures", knownDevices: { limit: 4, windowSeconds: 60 },
    });
    expect(fieldOf(configFor(modules, "delivery-static"), "robots")).toEqual({ policy: "allow" });
    expect(fieldOf(entryOf(modules, "delivery-static")?.config, "robots")).toEqual({ policy: "allow" });
  });

  it("merges an override with the consumer's own values of the same module", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      features: ["audit"],
      audit: { retentionDays: 90 },
      overrides: { "@michaelthielemann/kestrel-audit-persistence": { securityEvents: false } },
    });

    expect(entryOf(modules, "audit-persistence")?.config).toEqual({ retentionDays: 90, securityEvents: false });
  });
});

describe("derived references targets", () => {
  it("maps pages to its content type, a media ref to the media@1 files and a ref to another collection to that content type", () => {
    const types: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { slug: {}, status: {}, body: {}, shareImage: { type: "ref", to: "media" } } },
      news: { kind: "multi", fields: { slug: {}, status: {}, body: {}, author: { type: "ref", to: "people" }, cover: { type: "ref", to: "media" } } },
      people: { kind: "multi", fields: { name: {} } },
    };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["references"] });

    expect(configFor(modules, "references-default")).toEqual({
      targets: { pages: { content: "pages" }, media: { media: true }, news: { content: "news" }, people: { content: "people" } },
    });
  });

  it("ignores a ref whose target is neither media nor a collection in the model", () => {
    const types: Record<string, CollectionModel> = { pages: { kind: "multi", fields: { slug: {}, status: {}, body: {}, owner: { type: "ref", to: "nowhere" } } } };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["references"] });

    expect(configFor(modules, "references-default")).toEqual({ targets: { pages: { content: "pages" }, media: { media: true } } });
  });

  it("targets the media files and every multi collection, so ids inside blocks can point at them", () => {
    const types: Record<string, CollectionModel> = {
      settings: { kind: "single", fields: { title: { type: "text" } } },
      pages: { kind: "multi", fields: { slug: {}, status: {}, body: { type: "json" } } },
      authors: { kind: "multi", fields: { name: { type: "text" } } },
    };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["references"] });

    expect(fieldOf(configFor(modules, "references-default"), "targets")).toEqual({ pages: { content: "pages" }, media: { media: true }, authors: { content: "authors" } });
  });

  it("hands references-default the schema of every json field the validator checks, so ids inside blocks are indexed", () => {
    vi.stubEnv("KESTREL_BLOCK_SCHEMA", "/srv/app/.nuxt/kestrel/pages.body.json");
    const types: Record<string, CollectionModel> = {
      settings: { kind: "single", fields: { title: { type: "text" }, navigation: { type: "json" } } },
      pages: { kind: "multi", fields: { slug: { type: "slug" }, status: {}, body: { type: "json" } } },
      news: { kind: "multi", fields: { slug: { type: "slug" }, status: {}, body: { type: "json" } }, mount: true },
    };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["references"] });
    const schemas = fieldOf(configFor(modules, "references-default"), "schemas");
    const validated = fieldOf(configFor(modules, "validate-jsonschema"), "schemas");

    expect(Object.keys(schemas ?? {}).sort()).toEqual(["news.body", "pages.body", "settings.mounts", "settings.navigation"]);
    expect(fieldOf(schemas, "pages.body")).toBe("/srv/app/.nuxt/kestrel/pages.body.json");
    expect(fieldOf(schemas, "news.body")).toBe("/srv/app/.nuxt/kestrel/pages.body.json");
    expect(fieldOf(schemas, "settings.navigation")).toEqual(fieldOf(validated, "settings.navigation"));
    expect(fieldOf(configFor(modules, "references-default"), "watch")).toBe(fieldOf(configFor(modules, "validate-jsonschema"), "watch"));
  });
});

describe("derived delivery types", () => {
  it("delivers pages and every mounted collection and leaves the others out, with a heading per mounted collection", () => {
    const types: Record<string, CollectionModel> = {
      settings: { kind: "single", fields: { title: {} } },
      redirects: { kind: "single", fields: { rules: {} } },
      pages: { kind: "multi", fields: { slug: {}, status: {}, body: {} } },
      news: { kind: "multi", fields: { slug: {}, status: {}, body: {} }, mount: true },
      archive: { kind: "multi", fields: { slug: {}, status: {}, body: {} } },
      people: { kind: "multi", fields: { slug: {}, name: {} } },
      profile: { kind: "single", fields: { slug: {}, status: {}, body: {} } },
    };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["delivery", "sanitizeSvg"] });
    const delivery = configFor(modules, "delivery-static");

    expect(delivery).toEqual({
      types: { pages: {}, news: {} },
      prefix: "site/",
      prefixPrimary: false,
      reservedPaths: ["/api", "/admin", "/media"],
      robots: { policy: "disallow" },
      llms: { full: true, headings: { pages: "Pages", news: "News" } },
      dependencies: { render: "background", rendererReadsDocument: true, indexesDelayMs: 1000 },
    });
  });
});

describe("derived media locales", () => {
  it("takes locales and defaultLocale from the content model", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { locales: ["fr", "it"], defaultLocale: "it", types: contentTypes } });

    expect(configFor(modules, "media-default")).toEqual({
      prefix: "media/",
      publicPath: "/media",
      allowedTypes: ["image/*", "application/pdf"],
      deniedTypes: ["text/html", "application/xhtml+xml"],
      maxBytes: 5242880,
      locales: ["fr", "it"],
      defaultLocale: "it",
      publicCopy: { prefix: "site/" },
      storageMigrations: "check",
      trashRetentionDays: 30,
    });
  });

  it("omits both keys for a model without locales", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types: contentTypes } });

    expect(configFor(modules, "media-default")).toEqual({
      prefix: "media/",
      publicPath: "/media",
      allowedTypes: ["image/*", "application/pdf"],
      deniedTypes: ["text/html", "application/xhtml+xml"],
      maxBytes: 5242880,
      publicCopy: { prefix: "site/" },
      storageMigrations: "check",
      trashRetentionDays: 30,
    });
  });

  it("throws naming a reserved locale", () => {
    expect(() => presetModuleConfig({ ...playgroundOptions(), model: { locales: ["de", "media"], defaultLocale: "de", types: contentTypes } })).toThrow(
      'presetModuleConfig: locale "media" is reserved (it would put pages under /media/, which the server uses for media)',
    );
    expect(() => presetModuleConfig({ ...playgroundOptions(), model: { locales: ["de"], defaultLocale: "api", types: contentTypes } })).toThrow(
      'presetModuleConfig: locale "api" is reserved (it would put pages under /api/, which the server uses for api)',
    );
  });
});

describe("public media copies", () => {
  it("omits publicCopy from media-default and images-default without the delivery feature", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["images"] });
    expect(configFor(modules, "media-default")).not.toHaveProperty("publicCopy");
    expect(configFor(modules, "images-default")).toEqual({ publicPath: "/media", storageMigrations: "check" });
  });

  it("sets publicCopy on media-default alone when images is not enabled", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["delivery", "sanitizeSvg"] });
    expect(configFor(modules, "media-default")).toMatchObject({ publicCopy: { prefix: "site/" } });
    expect(configFor(modules, "images-default")).toBeUndefined();
  });
});

describe("storage migrations switch", () => {
  it("sets storageMigrations check on media-default and images-default when KESTREL_STORAGE_MIGRATIONS is unset, also in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const modules = presetModuleConfig(playgroundOptions());
    expect(fieldOf(configFor(modules, "media-default"), "storageMigrations")).toBe("check");
    expect(fieldOf(configFor(modules, "images-default"), "storageMigrations")).toBe("check");
  });

  it("takes apply from KESTREL_STORAGE_MIGRATIONS for both modules", () => {
    vi.stubEnv("KESTREL_STORAGE_MIGRATIONS", "apply");
    const modules = presetModuleConfig(playgroundOptions());
    expect(fieldOf(configFor(modules, "media-default"), "storageMigrations")).toBe("apply");
    expect(fieldOf(configFor(modules, "images-default"), "storageMigrations")).toBe("apply");
  });

  it("is not switched by KESTREL_MIGRATIONS, which belongs to the content migrations", () => {
    vi.stubEnv("KESTREL_MIGRATIONS", "apply");
    const modules = presetModuleConfig({ ...playgroundOptions(), features: [...features, "migrations"], migrations: { migrations: [], mode: "apply" } });
    expect(fieldOf(configFor(modules, "media-default"), "storageMigrations")).toBe("check");
    expect(fieldOf(configFor(modules, "images-default"), "storageMigrations")).toBe("check");
    expect(fieldOf(configFor(modules, "migrations-default"), "mode")).toBe("apply");
  });

  it("refuses another value of KESTREL_STORAGE_MIGRATIONS while the config loads", () => {
    vi.stubEnv("KESTREL_STORAGE_MIGRATIONS", "yes");
    expect(() => presetModuleConfig(playgroundOptions())).toThrow('kestrel.config: KESTREL_STORAGE_MIGRATIONS must be "check" or "apply", not "yes"');
  });

  it("lets an override of the module win over the variable", () => {
    vi.stubEnv("KESTREL_STORAGE_MIGRATIONS", "apply");
    const modules = presetModuleConfig({ ...playgroundOptions(), overrides: { "@michaelthielemann/kestrel-images-default": { storageMigrations: "check" } } });
    expect(fieldOf(configFor(modules, "images-default"), "storageMigrations")).toBe("check");
    expect(fieldOf(configFor(modules, "media-default"), "storageMigrations")).toBe("apply");
  });
});

describe("database file", () => {
  it("opens KESTREL_DATABASE_FILE instead of kestrel.db in the data directory when it is set, for persistence and replication", () => {
    vi.stubEnv("KESTREL_DATABASE_FILE", "/srv/work/migrated.db");
    const modules = presetModuleConfig({ ...playgroundOptions(), features: [...features, "replication"] });
    expect(fieldOf(configFor(modules, "persistence-sqlite"), "file")).toBe("/srv/work/migrated.db");
    expect(fieldOf(configFor(modules, "replication-sqlite"), "file")).toBe("/srv/work/migrated.db");
  });

  it("resolves a relative KESTREL_DATABASE_FILE against the process cwd and ignores an empty one", () => {
    vi.stubEnv("KESTREL_DATABASE_FILE", "state/site.db");
    expect(fieldOf(configFor(presetModuleConfig(playgroundOptions()), "persistence-sqlite"), "file")).toBe(resolve("state/site.db"));
    vi.stubEnv("KESTREL_DATABASE_FILE", "");
    expect(fieldOf(configFor(presetModuleConfig(playgroundOptions()), "persistence-sqlite"), "file")).toBe(DATABASE_FILE);
  });
});

describe("svg sanitize guard", () => {
  it("throws when publicCopy is on, svg is allowed by default, and sanitizeSvg is not enabled", () => {
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"] })).toThrow(
      'presetModuleConfig: media-default has publicCopy set (the "delivery" feature sets it) and its allowedTypes allow "image/svg+xml", but the "sanitizeSvg" feature is not enabled'
      + ' – either add "sanitizeSvg" to features (it inserts sanitize.svg before media.upload) or deny "image/svg+xml" in media.deniedTypes',
    );
  });

  it("passes when sanitizeSvg is enabled alongside publicCopy", () => {
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery", "sanitizeSvg"] })).not.toThrow();
  });

  it("passes when publicCopy is on but media.deniedTypes explicitly excludes svg", () => {
    expect(() =>
      presetModuleConfig({
        ...playgroundOptions(),
        features: ["delivery"],
        media: { deniedTypes: ["text/html", "application/xhtml+xml", "image/svg+xml"] },
      }),
    ).not.toThrow();
  });

  it("passes when publicCopy is on but media.allowedTypes never matches svg", () => {
    expect(() =>
      presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { allowedTypes: ["application/pdf"] } }),
    ).not.toThrow();
  });

  it("passes without the delivery feature, even with svg allowed and sanitizeSvg off", () => {
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["images"] })).not.toThrow();
  });

  it("passes when overrides deny svg on media-default", () => {
    expect(() =>
      presetModuleConfig({
        ...playgroundOptions(),
        features: ["delivery"],
        overrides: { "@michaelthielemann/kestrel-media-default": { deniedTypes: ["text/html", "image/svg+xml"] } },
      }),
    ).not.toThrow();
  });

  it("throws when overrides allow svg again after media.deniedTypes denied it", () => {
    expect(() =>
      presetModuleConfig({
        ...playgroundOptions(),
        features: ["delivery"],
        media: { deniedTypes: ["image/svg+xml"] },
        overrides: { "@michaelthielemann/kestrel-media-default": { deniedTypes: ["text/html"] } },
      }),
    ).toThrow(/sanitizeSvg/);
  });

  it("throws when overrides set publicCopy without the delivery feature", () => {
    expect(() =>
      presetModuleConfig({
        ...playgroundOptions(),
        features: ["images"],
        overrides: { "@michaelthielemann/kestrel-media-default": { publicCopy: { prefix: "site/" } } },
      }),
    ).toThrow(/sanitizeSvg/);
  });

  it("compares types case-insensitively and ignores parameters", () => {
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { deniedTypes: ["Image/SVG+XML"] } })).not.toThrow();
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { deniedTypes: [" image/svg+xml; charset=utf-8"] } })).not.toThrow();
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { allowedTypes: ["IMAGE/*"] } })).toThrow(/sanitizeSvg/);
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { allowedTypes: ["Image/Svg+Xml"] } })).toThrow(/sanitizeSvg/);
  });

  it("treats image/*, */* and * as allowing svg, and as denying it", () => {
    for (const pattern of ["image/*", "*/*", "*"]) {
      expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { allowedTypes: [pattern] } }), pattern).toThrow(/sanitizeSvg/);
      expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { deniedTypes: [pattern] } }), pattern).not.toThrow();
    }
  });

  it("lets a malformed pattern match nothing, allowed or denied", () => {
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { allowedTypes: ["image/svg+xml, text/html"] } })).not.toThrow();
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { deniedTypes: ["image/svg+xml,"] } })).toThrow(/sanitizeSvg/);
  });

  it("does not treat another type family's wildcard as svg", () => {
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["delivery"], media: { allowedTypes: ["application/*", "video/*"] } })).not.toThrow();
  });
});

describe("events-queue lanes", () => {
  it("puts generateImageVariants in its own lane when eventsQueue and images are both on", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue", "images"] });
    expect(configFor(modules, "events-queue")).toEqual({ relayPipelines: [], lanes: { variants: ["generateImageVariants"] }, delayMs: {} });
  });

  it("has no lanes without images and delivery", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue"] });
    expect(configFor(modules, "events-queue")).toEqual({ relayPipelines: [], lanes: {}, delayMs: {} });
  });

  it("sets the queue's lanes to lanesFor(features) for every feature subset", () => {
    const optional: Feature[] = ["delivery", "images", "audit", "sanitizeSvg"];
    for (let mask = 0; mask < 1 << optional.length; mask++) {
      const chosen: Feature[] = ["eventsQueue", ...optional.filter((_, index) => (mask & (1 << index)) !== 0)];
      if (chosen.includes("delivery") && !chosen.includes("sanitizeSvg")) continue;
      const lanes = fieldOf(configFor(presetModuleConfig({ ...playgroundOptions(), features: chosen }), "events-queue"), "lanes");
      expect(lanes, chosen.join(", ")).toEqual(lanesFor(chosen));
    }
  });

  it("runs page re-renders and the llms-full.txt export in the pages lane, the index export in the indexes lane and image variants in the variants lane", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue", "delivery", "images", "sanitizeSvg", "audit"] });
    expect(fieldOf(configFor(modules, "events-queue"), "lanes")).toEqual({ pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"], variants: ["generateImageVariants"] });
  });

  it("holds the index exports back by delaysFor(features), which a queue option cannot replace", () => {
    const features: Feature[] = ["eventsQueue", "delivery", "sanitizeSvg"];
    const modules = presetModuleConfig({ ...playgroundOptions(), features, eventsQueue: { pollMs: 200 } });
    expect(fieldOf(configFor(modules, "events-queue"), "delayMs")).toEqual({ refreshIndexes: 1000, refreshLlms: 3000 });
    expect(fieldOf(configFor(modules, "events-queue"), "delayMs")).toEqual(delaysFor(features));
  });
});

describe("dependent re-rendering", () => {
  function dependenciesOf(modules: readonly ModuleEntry[]): unknown {
    return fieldOf(configFor(modules, "delivery-static"), "dependencies");
  }

  it("renders marked pages in the background, records what the renderer reads and holds the index exports back a second without the queue", () => {
    expect(dependenciesOf(presetModuleConfig(playgroundOptions()))).toEqual({ render: "background", rendererReadsDocument: true, indexesDelayMs: 1000 });
  });

  it("renders marked pages as queue jobs with the queue's own attempts and backoff", () => {
    const features: Feature[] = ["eventsQueue", "delivery", "sanitizeSvg"];
    const defaults: unknown = eventsQueueModule.configSchema.parse({});
    expect(dependenciesOf(presetModuleConfig({ ...playgroundOptions(), features }))).toEqual({
      render: "events",
      rendererReadsDocument: true,
      maxAttempts: fieldOf(defaults, "maxAttempts"),
      backoffSeconds: fieldOf(defaults, "backoffSeconds"),
    });
    expect(dependenciesOf(presetModuleConfig({ ...playgroundOptions(), features, eventsQueue: { maxAttempts: 3, backoffSeconds: [1, 2] } }))).toEqual({
      render: "events",
      rendererReadsDocument: true,
      maxAttempts: 3,
      backoffSeconds: [1, 2],
    });
  });
});

describe("feature gating", () => {
  it("keeps only the always-on modules when no feature is enabled", () => {
    expect(moduleNames(presetModuleConfig({ ...playgroundOptions(), features: [] }))).toEqual([
      "@michaelthielemann/kestrel-blobstore-filesystem",
      "@michaelthielemann/kestrel-persistence-sqlite",
      "@michaelthielemann/kestrel-media-default",
      "@michaelthielemann/kestrel-authn-multi",
      "@michaelthielemann/kestrel-authz-roles",
      "@michaelthielemann/kestrel-content-default",
      "@michaelthielemann/kestrel-site-default",
      "@michaelthielemann/kestrel-validate-jsonschema",
      "@michaelthielemann/kestrel-events-inmemory",
      "@michaelthielemann/kestrel-events-direct",
    ]);
  });

  it("adds exactly the modules a single feature requires", () => {
    const base = moduleNames(presetModuleConfig({ ...playgroundOptions(), features: [] }));
    const SANITIZE_SVG_MODULE = "@michaelthielemann/kestrel-sanitize-svg";
    const added: Record<string, string[]> = {};
    for (const feature of features) {
      const activeFeatures: Feature[] = feature === "delivery" ? [feature, "sanitizeSvg"] : [feature];
      added[feature] = moduleNames(presetModuleConfig({ ...playgroundOptions(), features: activeFeatures }))
        .filter((use) => !base.includes(use) && !(feature === "delivery" && use === SANITIZE_SVG_MODULE));
    }

    expect(added).toEqual({
      references: ["@michaelthielemann/kestrel-references-default"],
      links: ["@michaelthielemann/kestrel-links-default"],
      delivery: ["@michaelthielemann/kestrel-renderer-nuxt", "@michaelthielemann/kestrel-delivery-static"],
      redirects: ["@michaelthielemann/kestrel-redirects-default"],
      images: ["@michaelthielemann/kestrel-images-default"],
      replication: ["@michaelthielemann/kestrel-replication-sqlite"],
      ratelimit: ["@michaelthielemann/kestrel-ratelimit-memory"],
      audit: ["@michaelthielemann/kestrel-audit-persistence"],
      sanitizeSvg: ["@michaelthielemann/kestrel-sanitize-svg"],
      insights: ["@michaelthielemann/kestrel-insights"],
      revisions: ["@michaelthielemann/kestrel-revisions-default"],
    });
  });

  it("takes the audit retention from the options and leaves the module config empty without it", () => {
    expect(configFor(presetModuleConfig({ ...playgroundOptions(), features: ["audit"] }), "audit-persistence")).toEqual({});
    expect(configFor(presetModuleConfig({ ...playgroundOptions(), features: ["audit"], audit: { retentionDays: 365 } }), "audit-persistence")).toEqual({ retentionDays: 365 });
  });

  it("takes the revisions retention from the options and the live states from the collection workflow", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["revisions"], revisions: { keep: 20, maxSnapshotBytes: 2048 } });
    expect(configFor(modules, "revisions-default")).toEqual({ keep: 20, maxSnapshotBytes: 2048, statusField: "status", liveStatuses: ["published"] });
  });

  it("follows a custom workflow from collectionsUi instead of the status defaults", () => {
    const types: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { slug: {}, status: {}, body: {}, state: { type: "enum", options: ["hidden", "listed"] } } },
    };
    const collectionsUi = { pages: { workflow: { field: "state", live: "listed", draft: "hidden" } } };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["revisions"], collectionsUi });
    expect(configFor(modules, "revisions-default")).toEqual({ statusField: "state", liveStatuses: ["listed"] });
  });

  it("refuses to guess when two collections disagree about their status field", () => {
    const types: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { slug: {}, status: {}, body: {} } },
      news: { kind: "multi", fields: { title: {}, state: { type: "enum", options: ["hidden", "listed"] } } },
    };
    const collectionsUi = { news: { workflow: { field: "state", live: "listed", draft: "hidden" } } };
    expect(() => presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["revisions"], collectionsUi })).toThrow(/one status field/);
  });

  it("leaves the module's own defaults in place when no collection declares a workflow", () => {
    const types: Record<string, CollectionModel> = { pages: { kind: "multi", fields: { slug: {}, title: {} } } };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["revisions"] });
    expect(configFor(modules, "revisions-default")).toEqual({});
  });
});

describe("derived blockAliases field", () => {
  it("adds a blockAliases field to a collection whose editor is blocks and which has a body field, without the consumer declaring it", () => {
    const types: Record<string, CollectionModel> = { pages: { kind: "multi", fields: { slug: {}, title: {}, body: {} } } };
    const collectionsUi = { pages: { editor: "blocks" as const } };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, collectionsUi });
    expect(fieldOf(configFor(modules, "content-default"), "types")).toEqual({ pages: { kind: "multi", fields: { slug: {}, title: {}, body: {}, blockAliases: { type: "json" } } } });
  });

  it("does not add a blockAliases field to a fields-editor collection or one without a body field", () => {
    const types: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { slug: {}, title: {} } },
      authors: { kind: "multi", fields: { name: {}, body: {} } },
    };
    const collectionsUi = { pages: { editor: "fields" as const } };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, collectionsUi });
    const stored = fieldOf(configFor(modules, "content-default"), "types");
    expect(fieldOf(fieldOf(stored, "pages"), "fields")).not.toHaveProperty("blockAliases");
    expect(fieldOf(fieldOf(stored, "authors"), "fields")).not.toHaveProperty("blockAliases");
  });

  it("leaves an already-declared blockAliases field untouched instead of overwriting it", () => {
    const types: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { slug: {}, title: {}, body: {}, blockAliases: { type: "json", required: true } } },
    };
    const collectionsUi = { pages: { editor: "blocks" as const } };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, collectionsUi });
    expect(fieldOf(fieldOf(fieldOf(configFor(modules, "content-default"), "types"), "pages"), "fields")).toEqual({
      slug: {}, title: {}, body: {}, blockAliases: { type: "json", required: true },
    });
  });
});

describe("feature gating: events-queue and migrations", () => {
  it("replaces events-direct by events-queue with the eventsQueue feature and passes the option through, keeping the bus", () => {
    const names = moduleNames(presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue"], eventsQueue: { pollMs: 200, maxAttempts: 3 } }));
    expect(names).toContain("@michaelthielemann/kestrel-events-queue");
    expect(names).toContain("@michaelthielemann/kestrel-events-inmemory");
    expect(names).not.toContain("@michaelthielemann/kestrel-events-direct");
    expect(configFor(presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue"], eventsQueue: { pollMs: 200, maxAttempts: 3 } }), "events-queue")).toEqual({ pollMs: 200, maxAttempts: 3, relayPipelines: [], lanes: {}, delayMs: {} });
    expect(configFor(presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue"] }), "events-queue")).toEqual({ relayPipelines: [], lanes: {}, delayMs: {} });
  });

  it("selects publishPage and unpublishPage for the queue's relay when delivery is enabled", () => {
    const withDelivery = configFor(presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue", "delivery", "sanitizeSvg"] }), "events-queue");
    expect(withDelivery).toEqual({ relayPipelines: ["publishPage", "unpublishPage"], lanes: { pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"] }, delayMs: { refreshIndexes: 1000, refreshLlms: 3000 } });
  });

  it("selects no relay pipelines for the queue without delivery", () => {
    const withoutDelivery = configFor(presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue", "images"] }), "events-queue");
    expect(withoutDelivery).toEqual({ relayPipelines: [], lanes: { variants: ["generateImageVariants"] }, delayMs: {} });
  });

  it("passes the relay budget through next to the derived relay selection", () => {
    const withBudget = configFor(
      presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue", "delivery", "sanitizeSvg"], eventsQueue: { relayMs: 8000 } }),
      "events-queue",
    );
    expect(withBudget).toEqual({ relayMs: 8000, relayPipelines: ["publishPage", "unpublishPage"], lanes: { pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"] }, delayMs: { refreshIndexes: 1000, refreshLlms: 3000 } });
  });

  it("appends migrations-default with the migrations the option carries", () => {
    const migration = { id: "0001-seed", collection: "pages", up: () => undefined };
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["migrations"], migrations: { migrations: [migration], mode: "check" } });

    expect(moduleNames(modules).at(-1)).toBe("@michaelthielemann/kestrel-migrations-default");
    expect(configFor(modules, "migrations-default")).toEqual({ migrations: [migration], mode: "check" });
  });

  it("omits the migrations mode when the option leaves it out", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["migrations"], migrations: { migrations: [] } });

    expect(configFor(modules, "migrations-default")).toEqual({ migrations: [] });
  });
});

describe("site URL, sitemap, robots and llms", () => {
  it("takes the site URL from NUXT_PUBLIC_SITE_URL in its normalised form, at the top level of delivery-static's config", () => {
    vi.stubEnv("NUXT_PUBLIC_SITE_URL", "https://Example.test/de/");
    const modules = presetModuleConfig({ ...playgroundOptions(), llms: { full: false, headings: { pages: "Seiten" } } });

    expect(configFor(modules, "delivery-static")).toEqual({
      types: { pages: {}, blog: {} },
      prefix: "site/",
      prefixPrimary: false,
      reservedPaths: ["/api", "/admin", "/media"],
      robots: { policy: "disallow" },
      siteUrl: "https://example.test/de",
      llms: { full: false, headings: { pages: "Seiten" } },
      dependencies: { render: "background", rendererReadsDocument: true, indexesDelayMs: 1000 },
    });
  });

  it("gives the same URLs as the sitemap's normalisation: the home page ends in a slash, every other page has none", () => {
    vi.stubEnv("NUXT_PUBLIC_SITE_URL", "https://example.test:443/de/");
    const siteUrl = fieldOf(configFor(presetModuleConfig(playgroundOptions()), "delivery-static"), "siteUrl");
    expect(siteUrl).toBe(normalizeSiteUrl("https://example.test/de"));
    expect(pageUrl(typeof siteUrl === "string" ? siteUrl : undefined, "/")).toBe("https://example.test/de/");
    expect(pageUrl(typeof siteUrl === "string" ? siteUrl : undefined, "/about")).toBe("https://example.test/de/about");
  });

  it("gives every page's canonical URL exactly the sitemap <loc> for the same NUXT_PUBLIC_SITE_URL", () => {
    for (const raw of ["https://example.test", "https://Example.test/", "https://example.test:443/de/", "http://example.test:8080/base//"]) {
      vi.stubEnv("NUXT_PUBLIC_SITE_URL", raw);
      const siteUrl = fieldOf(configFor(presetModuleConfig(playgroundOptions()), "delivery-static"), "siteUrl");
      expect(typeof siteUrl).toBe("string");
      for (const path of ["/", "/about", "/en/about-us/team"]) {
        expect(canonicalUrl(raw, path)).toBe(pageUrl(typeof siteUrl === "string" ? siteUrl : undefined, path));
      }
    }
  });

  it("refuses llms.siteUrl, pointing at NUXT_PUBLIC_SITE_URL, and a NUXT_PUBLIC_SITE_URL that is not a site URL", () => {
    const moved = { ...playgroundOptions(), llms: boundaryCast<PresetModuleConfigOptions["llms"]>({ siteUrl: "https://example.test" }, "json") };
    expect(() => presetModuleConfig(moved)).toThrow("presetModuleConfig: llms.siteUrl is gone – sitemap.xml, llms.txt and every page's canonical link, og:url and og:image take the site URL from NUXT_PUBLIC_SITE_URL; remove llms.siteUrl and set NUXT_PUBLIC_SITE_URL instead");
    vi.stubEnv("NUXT_PUBLIC_SITE_URL", "example.test");
    expect(() => presetModuleConfig(playgroundOptions())).toThrow('presetModuleConfig: NUXT_PUBLIC_SITE_URL "example.test" is not a site URL');
  });

  it("reads NUXT_PUBLIC_SITE_URL only with the delivery feature, so a site without it starts whatever the variable holds", () => {
    for (const raw of ["https://user:secret@staging.example.test", "https://example.test/?preview=1", "example.test"]) {
      vi.stubEnv("NUXT_PUBLIC_SITE_URL", raw);
      expect(() => presetModuleConfig({ ...playgroundOptions(), features: ["images"] })).not.toThrow();
    }
  });

  it("warns once at boot when delivery has no site URL, and not with one", async () => {
    vi.stubEnv("NUXT_PUBLIC_SITE_URL", "https://example.test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.resetModules();
    const fresh = await import("./config");
    fresh.presetModuleConfig(playgroundOptions());
    expect(warn.mock.calls.filter(([message]) => String(message).includes("no site URL"))).toEqual([]);
    vi.stubEnv("NUXT_PUBLIC_SITE_URL", "");
    fresh.presetModuleConfig(playgroundOptions());
    fresh.presetModuleConfig(playgroundOptions());
    expect(warn.mock.calls.filter(([message]) => String(message).includes("no site URL"))).toEqual([
      ["presetModuleConfig: NUXT_PUBLIC_SITE_URL is not set, so the site has no site URL – no sitemap.xml is written, llms.txt lists paths instead of URLs and pages carry no canonical link"],
    ]);
    warn.mockRestore();
  });

  it("fills in robots.policy the way the bundled server sees NODE_ENV: allow in a production build, disallow otherwise, with one warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.resetModules();
    const fresh = await import("./config");
    expect(fieldOf(configFor(fresh.presetModuleConfig(playgroundOptions()), "delivery-static"), "robots")).toEqual({ policy: "disallow" });
    vi.stubEnv("NODE_ENV", "production");
    const extra = ["Disallow: /preview/"];
    expect(fieldOf(configFor(fresh.presetModuleConfig({ ...playgroundOptions(), robots: { extra } }), "delivery-static"), "robots")).toEqual({ policy: "allow", extra });
    expect(warn.mock.calls.filter(([message]) => String(message).includes("robots.policy"))).toEqual([
      ["presetModuleConfig: robots.policy is not set – robots.txt keeps crawlers out because this is not a production build; set robots.policy or KESTREL_ROBOTS_POLICY"],
    ]);
    warn.mockRestore();
  });

  it("takes a missing robots.policy from KESTREL_ROBOTS_POLICY without a warning and refuses another value there", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.resetModules();
    const fresh = await import("./config");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KESTREL_ROBOTS_POLICY", "disallow");
    expect(fieldOf(configFor(fresh.presetModuleConfig(playgroundOptions()), "delivery-static"), "robots")).toEqual({ policy: "disallow" });
    const extra = ["Disallow: /preview/"];
    expect(fieldOf(configFor(fresh.presetModuleConfig({ ...playgroundOptions(), robots: { extra } }), "delivery-static"), "robots")).toEqual({ policy: "disallow", extra });
    expect(fieldOf(configFor(fresh.presetModuleConfig({ ...playgroundOptions(), robots: { policy: "disallow" } }), "delivery-static"), "robots")).toEqual({ policy: "disallow" });
    expect(warn.mock.calls.filter(([message]) => String(message).includes("robots.policy"))).toEqual([]);
    vi.stubEnv("KESTREL_ROBOTS_POLICY", "Allow");
    expect(() => fresh.presetModuleConfig(playgroundOptions())).toThrow('kestrel.config: KESTREL_ROBOTS_POLICY must be "allow" or "disallow", not "Allow"');
    warn.mockRestore();
  });

  it("refuses an invalid KESTREL_ROBOTS_POLICY and warns once that a valid one is ignored when robots.policy differs or robots is false", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.resetModules();
    const fresh = await import("./config");
    vi.stubEnv("KESTREL_ROBOTS_POLICY", "Disallow");
    expect(() => fresh.presetModuleConfig({ ...playgroundOptions(), robots: { policy: "allow" } })).toThrow('kestrel.config: KESTREL_ROBOTS_POLICY must be "allow" or "disallow", not "Disallow"');
    expect(() => fresh.presetModuleConfig({ ...playgroundOptions(), robots: false })).toThrow('kestrel.config: KESTREL_ROBOTS_POLICY must be "allow" or "disallow", not "Disallow"');
    vi.stubEnv("KESTREL_ROBOTS_POLICY", "disallow");
    expect(fieldOf(configFor(fresh.presetModuleConfig({ ...playgroundOptions(), robots: { policy: "allow", extra: ["Disallow: /preview/"] } }), "delivery-static"), "robots")).toEqual({ policy: "allow", extra: ["Disallow: /preview/"] });
    expect(fieldOf(configFor(fresh.presetModuleConfig({ ...playgroundOptions(), robots: false }), "delivery-static"), "robots")).toBe(false);
    expect(warn.mock.calls.filter(([message]) => String(message).includes("KESTREL_ROBOTS_POLICY"))).toEqual([
      ['presetModuleConfig: KESTREL_ROBOTS_POLICY is "disallow" but is ignored, since the robots option of presetModuleConfig() sets robots.policy "allow" – remove robots.policy to let the variable decide, or unset KESTREL_ROBOTS_POLICY'],
    ]);
    warn.mockClear();
    vi.resetModules();
    const robotsOff = await import("./config");
    expect(fieldOf(configFor(robotsOff.presetModuleConfig({ ...playgroundOptions(), robots: false }), "delivery-static"), "robots")).toBe(false);
    expect(fieldOf(configFor(robotsOff.presetModuleConfig({ ...playgroundOptions(), robots: { policy: "disallow" } }), "delivery-static"), "robots")).toEqual({ policy: "disallow" });
    expect(warn.mock.calls.filter(([message]) => String(message).includes("KESTREL_ROBOTS_POLICY"))).toEqual([
      ['presetModuleConfig: KESTREL_ROBOTS_POLICY is "disallow" but is ignored, since the robots option of presetModuleConfig() is false and no robots.txt is written – remove robots: false to let the variable decide, or unset KESTREL_ROBOTS_POLICY'],
    ]);
    warn.mockRestore();
  });

  it("gives delivery-static the prefixPrimary site-default gets, so exported paths, sitemap <loc> and _paths agree", () => {
    for (const prefixPrimary of [true, false, undefined]) {
      const modules = presetModuleConfig({ ...playgroundOptions(), ...(prefixPrimary === undefined ? {} : { prefixPrimary }) });
      expect(fieldOf(configFor(modules, "delivery-static"), "prefixPrimary")).toBe(prefixPrimary ?? false);
      expect(fieldOf(configFor(modules, "delivery-static"), "prefixPrimary")).toBe(fieldOf(configFor(modules, "site-default"), "prefixPrimary"));
    }
  });

  it("passes sitemap and robots through to delivery-static", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), sitemap: false, robots: { policy: "disallow", extra: ["Disallow: /preview/"] } });
    expect(fieldOf(configFor(modules, "delivery-static"), "sitemap")).toBe(false);
    expect(fieldOf(configFor(modules, "delivery-static"), "robots")).toEqual({ policy: "disallow", extra: ["Disallow: /preview/"] });
    expect(fieldOf(configFor(presetModuleConfig({ ...playgroundOptions(), robots: false }), "delivery-static"), "robots")).toBe(false);
  });
});

describe("media trash retention", () => {
  it("keeps trashed media 30 days by default", () => {
    expect(fieldOf(configFor(presetModuleConfig(playgroundOptions()), "media-default"), "trashRetentionDays")).toBe(30);
  });

  it("passes another number of days on to media-default", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), media: { trashRetentionDays: 7 } });
    expect(fieldOf(configFor(modules, "media-default"), "trashRetentionDays")).toBe(7);
  });

  it("leaves the key out at 0, which turns the trash off", () => {
    const config = configFor(presetModuleConfig({ ...playgroundOptions(), media: { trashRetentionDays: 0 } }), "media-default");
    expect(typeof config === "object" && config !== null && "trashRetentionDays" in config).toBe(false);
  });

  it("refuses a negative or fractional number of days", () => {
    for (const days of [-1, 1.5, Number.NaN]) {
      expect(() => presetModuleConfig({ ...playgroundOptions(), media: { trashRetentionDays: days } }), String(days)).toThrow(
        "presetModuleConfig: media.trashRetentionDays must be a whole number of days, 0 to turn the trash off",
      );
    }
  });
});

describe("options", () => {
  it("overrides the media policy, the login bucket and the session settings", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      media: { maxBytes: 20971520, allowedTypes: ["image/*", "video/*"], deniedTypes: ["text/html"] },
      ratelimit: { login: { limit: 3, windowSeconds: 120 } },
      session: { identifier: "email", minPasswordLength: 12, sessionTtlSeconds: 3600, secureCookie: false },
      bootstrap: { username: "root", passwordHash: PASSWORD_HASH, roles: ["admin", "editor"] },
    });

    expect(configFor(modules, "media-default")).toEqual({
      prefix: "media/",
      publicPath: "/media",
      allowedTypes: ["image/*", "video/*"],
      deniedTypes: ["text/html"],
      maxBytes: 20971520,
      locales: ["de", "en"],
      defaultLocale: "de",
      publicCopy: { prefix: "site/" },
      storageMigrations: "check",
      trashRetentionDays: 30,
    });
    expect(configFor(modules, "ratelimit-memory")).toEqual({ buckets: { login: { limit: 3, windowSeconds: 120 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "email", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } }, deviceCookies: { secretKey: deviceKeys().secretKey, secure: false } });
    expect(configFor(modules, "authn-multi")).toEqual({
      identifier: "email",
      minPasswordLength: 12,
      sessionTtlSeconds: 3600,
      secureCookie: false,
      bootstrap: { username: "root", passwordHash: PASSWORD_HASH, roles: ["admin", "editor"] },
    });
  });

  it("reserves the build assets path of the site for redirects instead of /_nuxt", () => {
    const own = presetModuleConfig({ ...playgroundOptions(), buildAssetsPath: "/site/assets" });
    expect(configFor(own, "redirects-default")).toEqual({ prefix: "site/", reservedPaths: ["/api", "/admin", "/media", "/site/assets", "/__nuxt_island", "/__nuxt_error", "/_ipx", "/_preview"] });

    vi.stubEnv("NUXT_APP_BUILD_ASSETS_DIR", "/assets/");
    const fromEnv = presetModuleConfig(playgroundOptions());
    expect(configFor(fromEnv, "redirects-default")).toHaveProperty("reservedPaths", ["/api", "/admin", "/media", "/assets", "/__nuxt_island", "/__nuxt_error", "/_ipx", "/_preview"]);
  });

  it("refuses a build assets path that is not a path", () => {
    expect(() => presetModuleConfig({ ...playgroundOptions(), buildAssetsPath: "assets" })).toThrow(/buildAssetsPath/);
    expect(() => presetModuleConfig({ ...playgroundOptions(), buildAssetsPath: "/" })).toThrow(/buildAssetsPath/);
  });

  it("merges overrides onto the derived config of the module they name, consumer keys winning", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      overrides: {
        "@michaelthielemann/kestrel-replication-sqlite": { prefix: "database/", restoreOnStart: true, retentionSeconds: 604800 },
        "@michaelthielemann/kestrel-redirects-default": { prefix: "static/" },
      },
    });

    expect(configFor(modules, "replication-sqlite")).toEqual({ file: DATABASE_FILE, prefix: "database/", restoreOnStart: true, retentionSeconds: 604800 });
    expect(configFor(modules, "redirects-default")).toEqual({ prefix: "static/", reservedPaths: ["/api", "/admin", "/media", "/_nuxt", "/__nuxt_island", "/__nuxt_error", "/_ipx", "/_preview"] });
    expect(configFor(modules, "persistence-sqlite")).toEqual({ file: DATABASE_FILE });
    expect(moduleNames(modules)).toEqual(moduleNames(presetModuleConfig(playgroundOptions())));
  });

  it("leaves persistence-sqlite's acquireTimeoutMs unset, so a raised busyTimeoutMs is not capped by a fixed value", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      overrides: { "@michaelthielemann/kestrel-persistence-sqlite": { busyTimeoutMs: 20000 } },
    });

    expect(configFor(modules, "persistence-sqlite")).toEqual({ file: DATABASE_FILE, busyTimeoutMs: 20000 });
  });

  it("replaces a derived top-level key whole, so an override can remove a role the preset derived", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      overrides: { "@michaelthielemann/kestrel-authz-roles": { roles: { admin: ["*"] } } },
    });

    const authz = configFor(modules, "authz-roles");
    expect(authz).toMatchObject({ roles: { admin: ["*"] } });
    const roles = fieldOf(authz, "roles");
    expect(typeof roles === "object" && roles !== null ? Object.keys(roles) : []).toEqual(["admin"]);
  });

  it("keeps every other derived key of the module an override names one key of", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      overrides: { "@michaelthielemann/kestrel-delivery-static": { llms: { full: false } } },
    });

    expect(configFor(modules, "delivery-static")).toMatchObject({
      dependencies: { render: "background", rendererReadsDocument: true, indexesDelayMs: 1000 },
      llms: { full: false },
    });
  });

  it("takes the known-device budget and the device cookies' keys and lifetime from the ratelimit options", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      ratelimit: { knownDevice: { limit: 4, windowSeconds: 120 }, deviceCookies: { secretKey: "ab".repeat(32), previousSecretKeys: ["cd".repeat(32)], maxAgeSeconds: 3600 } },
    });
    const config = configFor(modules, "ratelimit-memory");
    expect(fieldOf(fieldOf(config, "buckets"), "loginAccount")).toMatchObject({ knownDevices: { limit: 4, windowSeconds: 120 } });
    expect(fieldOf(config, "deviceCookies")).toEqual({ secretKey: "ab".repeat(32), previousSecretKeys: ["cd".repeat(32)], maxAgeSeconds: 3600, secure: true });
  });

  it("signs the device cookies with the second factor's keys when the mfa feature is on and no device key is given", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      features: [...features, "mfa"],
      mfa: { secretKey: "cd".repeat(32), previousSecretKeys: ["ef".repeat(32)] },
    });
    expect(fieldOf(configFor(modules, "ratelimit-memory"), "deviceCookies")).toEqual({ secretKey: "cd".repeat(32), previousSecretKeys: ["ef".repeat(32)], secure: true });
    expect(configFor(modules, "mfa-totp")).toMatchObject({ secretKey: "cd".repeat(32), previousSecretKeys: ["ef".repeat(32)] });
  });

  it("falls back to the schema default, not the preset's, when an override sets a key to undefined", () => {
    const withPreset = fieldOf(configFor(presetModuleConfig(playgroundOptions()), "ratelimit-memory"), "buckets");
    expect(withPreset).toEqual({ login: { limit: 20, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "username", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } });

    const modules = presetModuleConfig({
      ...playgroundOptions(),
      overrides: { "@michaelthielemann/kestrel-ratelimit-memory": { buckets: undefined } },
    });
    const overridden = fieldOf(configFor(modules, "ratelimit-memory"), "buckets");
    expect(overridden).not.toEqual({ login: { limit: 20, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "username", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } });
  });

  it("throws naming a module the overrides address that the built list does not contain", () => {
    const options = { ...playgroundOptions(), features: [], overrides: { "@michaelthielemann/kestrel-replication-sqlite": { prefix: "database/" } } };

    expect(() => presetModuleConfig(options)).toThrow('presetModuleConfig: overrides name module "@michaelthielemann/kestrel-replication-sqlite" which is not enabled');
  });

  it("throws naming a required option that is missing", () => {
    for (const name of ["dataDir", "blobstore", "model", "features", "roles", "bootstrap"] as const) {
      const options = { ...playgroundOptions(), [name]: undefined };
      expect(() => presetModuleConfig(options)).toThrow(`presetModuleConfig: option "${name}" is required`);
    }
  });

  it("throws naming migrations when the feature is on without them", () => {
    const enabled: readonly Feature[] = ["migrations"];
    expect(() => presetModuleConfig({ ...playgroundOptions(), features: enabled })).toThrow('presetModuleConfig: option "migrations" is required');
  });
});
