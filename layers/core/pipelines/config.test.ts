import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import { presetModuleConfig } from "./config";
import type { ModuleEntry, PresetModuleConfigOptions } from "./config";
import eventsQueueModule from "@michaelthielemann/kestrel-events-queue";
import { lanesFor, presetSchemas } from "./index";
import type { Feature } from "./index";
import type { CollectionModel } from "./collections";
import { deviceKey } from "../config";
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
        }),
      },
      { use: "@michaelthielemann/kestrel-images-default", ...preset({ publicPath: "/media", publicCopy: { prefix: "site/" } }) },
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
            media: ["id", "path", "filename", "contentType", "size", "width", "height", "alt", "title", "description", "provenance", "variants[].size", "variants[].width", "variants[].height", "variants[].format", "variants[].path"],
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
          reservedPaths: ["/api", "/admin", "/media"],
          llms: { full: true, headings: { pages: "Pages", blog: "Blog" } },
          dependencies: { render: "background", rendererReadsDocument: true },
        }),
      },
      { use: "@michaelthielemann/kestrel-revisions-default", ...preset({ statusField: "status", liveStatuses: ["published"] }) },
      { use: "@michaelthielemann/kestrel-redirects-default", ...preset({ prefix: "site/" }) },
      { use: "@michaelthielemann/kestrel-audit-persistence", ...preset({}) },
      { use: "@michaelthielemann/kestrel-events-inmemory", config: {} },
      { use: "@michaelthielemann/kestrel-events-direct", config: {} },
      { use: "@michaelthielemann/kestrel-ratelimit-memory", ...preset({ buckets: { login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "username", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } }, deviceCookies: { secretKey: deviceKey(), secure: true } }) },
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
      reservedPaths: ["/api", "/admin", "/media"],
      llms: { full: true, headings: { pages: "Pages", news: "News" } },
      dependencies: { render: "background", rendererReadsDocument: true },
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
    expect(configFor(modules, "images-default")).toEqual({ publicPath: "/media" });
  });

  it("sets publicCopy on media-default alone when images is not enabled", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["delivery", "sanitizeSvg"] });
    expect(configFor(modules, "media-default")).toMatchObject({ publicCopy: { prefix: "site/" } });
    expect(configFor(modules, "images-default")).toBeUndefined();
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
    expect(configFor(modules, "events-queue")).toEqual({ relayPipelines: [], lanes: { variants: ["generateImageVariants"] } });
  });

  it("has no lanes without images and delivery", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue"] });
    expect(configFor(modules, "events-queue")).toEqual({ relayPipelines: [], lanes: {} });
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

  it("runs page re-renders and the llms.txt export in the pages lane and image variants in the variants lane", () => {
    const modules = presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue", "delivery", "images", "sanitizeSvg", "audit"] });
    expect(fieldOf(configFor(modules, "events-queue"), "lanes")).toEqual({ pages: ["republishOutput", "refreshLlms"], variants: ["generateImageVariants"] });
  });
});

describe("dependent re-rendering", () => {
  function dependenciesOf(modules: readonly ModuleEntry[]): unknown {
    return fieldOf(configFor(modules, "delivery-static"), "dependencies");
  }

  it("renders marked pages in the background and records what the renderer reads without the queue", () => {
    expect(dependenciesOf(presetModuleConfig(playgroundOptions()))).toEqual({ render: "background", rendererReadsDocument: true });
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
    expect(configFor(presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue"], eventsQueue: { pollMs: 200, maxAttempts: 3 } }), "events-queue")).toEqual({ pollMs: 200, maxAttempts: 3, relayPipelines: [], lanes: {} });
    expect(configFor(presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue"] }), "events-queue")).toEqual({ relayPipelines: [], lanes: {} });
  });

  it("selects publishPage and unpublishPage for the queue's relay when delivery is enabled", () => {
    const withDelivery = configFor(presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue", "delivery", "sanitizeSvg"] }), "events-queue");
    expect(withDelivery).toEqual({ relayPipelines: ["publishPage", "unpublishPage"], lanes: { pages: ["republishOutput", "refreshLlms"] } });
  });

  it("selects no relay pipelines for the queue without delivery", () => {
    const withoutDelivery = configFor(presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue", "images"] }), "events-queue");
    expect(withoutDelivery).toEqual({ relayPipelines: [], lanes: { variants: ["generateImageVariants"] } });
  });

  it("passes the relay budget through next to the derived relay selection", () => {
    const withBudget = configFor(
      presetModuleConfig({ ...playgroundOptions(), features: ["eventsQueue", "delivery", "sanitizeSvg"], eventsQueue: { relayMs: 8000 } }),
      "events-queue",
    );
    expect(withBudget).toEqual({ relayMs: 8000, relayPipelines: ["publishPage", "unpublishPage"], lanes: { pages: ["republishOutput", "refreshLlms"] } });
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
      types: { pages: {}, blog: {} },
      prefix: "site/",
      reservedPaths: ["/api", "/admin", "/media"],
      llms: { full: false, headings: { pages: "Seiten" }, siteUrl: "https://example.test" },
      dependencies: { render: "background", rendererReadsDocument: true },
    });
  });

  it("falls back to NUXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NUXT_PUBLIC_SITE_URL", "https://from-env.test");
    const modules = presetModuleConfig(playgroundOptions());

    expect(configFor(modules, "delivery-static")).toEqual({
      types: { pages: {}, blog: {} },
      prefix: "site/",
      reservedPaths: ["/api", "/admin", "/media"],
      llms: { full: true, headings: { pages: "Pages", blog: "Blog" }, siteUrl: "https://from-env.test" },
      dependencies: { render: "background", rendererReadsDocument: true },
    });
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
    });
    expect(configFor(modules, "ratelimit-memory")).toEqual({ buckets: { login: { limit: 3, windowSeconds: 120 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "email", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } }, deviceCookies: { secretKey: deviceKey(), secure: false } });
    expect(configFor(modules, "authn-multi")).toEqual({
      identifier: "email",
      minPasswordLength: 12,
      sessionTtlSeconds: 3600,
      secureCookie: false,
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
      dependencies: { render: "background", rendererReadsDocument: true },
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

  it("falls back to the schema default, not the preset's, when an override sets a key to undefined", () => {
    const withPreset = fieldOf(configFor(presetModuleConfig(playgroundOptions()), "ratelimit-memory"), "buckets");
    expect(withPreset).toEqual({ login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "username", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } });

    const modules = presetModuleConfig({
      ...playgroundOptions(),
      overrides: { "@michaelthielemann/kestrel-ratelimit-memory": { buckets: undefined } },
    });
    const overridden = fieldOf(configFor(modules, "ratelimit-memory"), "buckets");
    expect(overridden).not.toEqual({ login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "username", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } });
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
