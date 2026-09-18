import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { presetModuleConfig } from "./config";
import type { ModuleEntry, PresetModuleConfigOptions } from "./config";
import { presetSchemas } from "./index";
import type { Feature } from "./index";
import type { CollectionModel } from "./collections";
import { contentModel, contentTypes, features } from "../../../playground/shared/model";

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
  return { dataDir: DATA_DIR, blobstore, model: contentModel, features, roles, bootstrap: { username: "admin", passwordHash: PASSWORD_HASH } };
}

function configFor(modules: readonly ModuleEntry[], use: string): unknown {
  return modules.find((entry) => entry.use === `@michaelthielemann/kestrel-${use}`)?.config;
}

function moduleNames(modules: readonly ModuleEntry[]): string[] {
  return modules.map((entry) => entry.use);
}

beforeEach(() => {
  vi.stubEnv("NUXT_PUBLIC_SITE_URL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("presetModuleConfig with the playground inputs", () => {
  it("produces the module list the playground spelled out by hand, plus delivery's media publicPath", () => {
    expect(presetModuleConfig(playgroundOptions())).toEqual([
      { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(DATA_DIR, "blobs") } },
      { use: "@michaelthielemann/kestrel-replication-sqlite", config: { file: DATABASE_FILE } },
      { use: "@michaelthielemann/kestrel-persistence-sqlite", config: { file: DATABASE_FILE } },
      { use: "@michaelthielemann/kestrel-sanitize-svg", config: {} },
      {
        use: "@michaelthielemann/kestrel-media-default",
        config: {
          prefix: "media/",
          allowedTypes: ["image/*", "application/pdf"],
          deniedTypes: ["text/html", "application/xhtml+xml"],
          maxBytes: 5242880,
          locales: ["de", "en"],
          defaultLocale: "de",
        },
      },
      { use: "@michaelthielemann/kestrel-images-default", config: { publicPath: "/api/media" } },
      {
        use: "@michaelthielemann/kestrel-authn-multi",
        config: {
          identifier: "username",
          minPasswordLength: 8,
          sessionTtlSeconds: 86400,
          bootstrap: { username: "admin", passwordHash: PASSWORD_HASH, roles: ["admin"] },
        },
      },
      {
        use: "@michaelthielemann/kestrel-authz-roles",
        config: {
          roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"] },
          anonymous: ["pages.read", "settings.read", "media.read"],
        },
      },
      { use: "@michaelthielemann/kestrel-content-default", config: contentModel },
      { use: "@michaelthielemann/kestrel-site-default", config: {} },
      { use: "@michaelthielemann/kestrel-references-default", config: { targets: { pages: { content: "pages" }, media: { collection: "media_items" } } } },
      { use: "@michaelthielemann/kestrel-links-default", config: { timeoutMs: 10000, concurrency: 4, recheckAfterSeconds: 21600 } },
      {
        use: "@michaelthielemann/kestrel-validate-jsonschema",
        config: { schemas: presetSchemas({ features, collections: contentTypes }), watch: process.env.NODE_ENV !== "production" },
      },
      { use: "@michaelthielemann/kestrel-renderer-nuxt", config: {} },
      {
        use: "@michaelthielemann/kestrel-delivery-static",
        config: { types: { pages: {} }, prefix: "site/", media: { publicPath: "/api/media" }, llms: { full: true, headings: { pages: "Pages" } } },
      },
      { use: "@michaelthielemann/kestrel-redirects-default", config: { prefix: "site/" } },
      { use: "@michaelthielemann/kestrel-audit-persistence", config: {} },
      { use: "@michaelthielemann/kestrel-events-inmemory", config: {} },
      { use: "@michaelthielemann/kestrel-ratelimit-memory", config: { buckets: { login: { limit: 5, windowSeconds: 60 } } } },
      { use: "@michaelthielemann/kestrel-insights", config: {} },
    ]);
  });
});

describe("derived references targets", () => {
  it("maps pages to its content type, a media ref to the media_items collection and a ref to another collection to that content type", () => {
    const types: Record<string, CollectionModel> = {
      pages: { kind: "multi", fields: { slug: {}, status: {}, body: {}, shareImage: { type: "ref", to: "media" } } },
      news: { kind: "multi", fields: { slug: {}, status: {}, body: {}, author: { type: "ref", to: "people" }, cover: { type: "ref", to: "media" } } },
      people: { kind: "multi", fields: { name: {} } },
    };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["references"] });

    expect(configFor(modules, "references-default")).toEqual({
      targets: { pages: { content: "pages" }, media: { collection: "media_items" }, people: { content: "people" } },
    });
  });

  it("ignores a ref whose target is neither media nor a collection in the model", () => {
    const types: Record<string, CollectionModel> = { pages: { kind: "multi", fields: { slug: {}, status: {}, body: {}, owner: { type: "ref", to: "nowhere" } } } };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["references"] });

    expect(configFor(modules, "references-default")).toEqual({ targets: { pages: { content: "pages" } } });
  });
});

describe("derived delivery types", () => {
  it("delivers every multi collection carrying slug, status and body and leaves the others out", () => {
    const types: Record<string, CollectionModel> = {
      settings: { kind: "single", fields: { title: {} } },
      redirects: { kind: "single", fields: { rules: {} } },
      pages: { kind: "multi", fields: { slug: {}, status: {}, body: {} } },
      news: { kind: "multi", fields: { slug: {}, status: {}, body: {} } },
      people: { kind: "multi", fields: { slug: {}, name: {} } },
      profile: { kind: "single", fields: { slug: {}, status: {}, body: {} } },
    };
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types }, features: ["delivery"] });
    const delivery = configFor(modules, "delivery-static");

    expect(delivery).toEqual({ types: { pages: {}, news: {} }, prefix: "site/", media: { publicPath: "/api/media" }, llms: { full: true, headings: { pages: "Pages" } } });
  });
});

describe("derived media locales", () => {
  it("takes locales and defaultLocale from the content model", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { locales: ["fr", "it"], defaultLocale: "it", types: contentTypes } });

    expect(configFor(modules, "media-default")).toEqual({
      prefix: "media/",
      allowedTypes: ["image/*", "application/pdf"],
      deniedTypes: ["text/html", "application/xhtml+xml"],
      maxBytes: 5242880,
      locales: ["fr", "it"],
      defaultLocale: "it",
    });
  });

  it("omits both keys for a model without locales", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), model: { types: contentTypes } });

    expect(configFor(modules, "media-default")).toEqual({
      prefix: "media/",
      allowedTypes: ["image/*", "application/pdf"],
      deniedTypes: ["text/html", "application/xhtml+xml"],
      maxBytes: 5242880,
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
    ]);
  });

  it("adds exactly the modules a single feature requires", () => {
    const base = moduleNames(presetModuleConfig({ ...playgroundOptions(), features: [] }));
    const added: Record<string, string[]> = {};
    for (const feature of features) {
      added[feature] = moduleNames(presetModuleConfig({ ...playgroundOptions(), features: [feature] })).filter((use) => !base.includes(use));
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
    });
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

describe("llms", () => {
  it("takes siteUrl from the option", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), llms: { full: false, headings: { pages: "Seiten" }, siteUrl: "https://example.test" } });

    expect(configFor(modules, "delivery-static")).toEqual({
      types: { pages: {} },
      prefix: "site/",
      media: { publicPath: "/api/media" },
      llms: { full: false, headings: { pages: "Seiten" }, siteUrl: "https://example.test" },
    });
  });

  it("falls back to NUXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NUXT_PUBLIC_SITE_URL", "https://from-env.test");
    const modules = presetModuleConfig(playgroundOptions());

    expect(configFor(modules, "delivery-static")).toEqual({
      types: { pages: {} },
      prefix: "site/",
      media: { publicPath: "/api/media" },
      llms: { full: true, headings: { pages: "Pages" }, siteUrl: "https://from-env.test" },
    });
  });
});

describe("options", () => {
  it("overrides the media policy, the login bucket and the session settings", () => {
    const modules = presetModuleConfig({
      ...playgroundOptions(),
      media: { maxBytes: 20971520, allowedTypes: ["image/*", "video/*"], deniedTypes: ["text/html"] },
      ratelimit: { login: { limit: 3, windowSeconds: 120 } },
      session: { identifier: "email", minPasswordLength: 12, sessionTtlSeconds: 3600 },
      bootstrap: { username: "root", passwordHash: PASSWORD_HASH, roles: ["admin", "editor"] },
    });

    expect(configFor(modules, "media-default")).toEqual({
      prefix: "media/",
      allowedTypes: ["image/*", "video/*"],
      deniedTypes: ["text/html"],
      maxBytes: 20971520,
      locales: ["de", "en"],
      defaultLocale: "de",
    });
    expect(configFor(modules, "ratelimit-memory")).toEqual({ buckets: { login: { limit: 3, windowSeconds: 120 } } });
    expect(configFor(modules, "authn-multi")).toEqual({
      identifier: "email",
      minPasswordLength: 12,
      sessionTtlSeconds: 3600,
      bootstrap: { username: "root", passwordHash: PASSWORD_HASH, roles: ["admin", "editor"] },
    });
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
    expect(configFor(modules, "redirects-default")).toEqual({ prefix: "static/" });
    expect(configFor(modules, "persistence-sqlite")).toEqual({ file: DATABASE_FILE });
    expect(moduleNames(modules)).toEqual(moduleNames(presetModuleConfig(playgroundOptions())));
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
