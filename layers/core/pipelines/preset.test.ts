import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { definePreset, presetSchemas } from "./index";
import type { CollectionModel, PresetStep } from "./index";

const baseModules = [
  { use: "@michaelthielemann/kestrel-authn-multi" },
  { use: "@michaelthielemann/kestrel-authz-roles" },
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
  { use: "@michaelthielemann/kestrel-media-default" },
];

describe("definePreset option handling", () => {
  it("defaults exportDir and homeSlug", () => {
    const preset = definePreset({ modules: baseModules, features: [] });
    const resolvePage = preset.pipelines.find((pipeline) => pipeline.name === "resolvePage");
    expect(resolvePage?.steps).toContain("site.resolve:pages?home=home&status=published&fallback=true");
    const exportMedia = preset.pipelines.find((pipeline) => pipeline.name === "exportMedia");
    expect(exportMedia?.steps.some((step) => step.startsWith("media.export:"))).toBe(true);
  });

  it("applies a custom exportDir and homeSlug", () => {
    const preset = definePreset({ modules: baseModules, features: [], exportDir: "/tmp/export", homeSlug: "start" });
    const resolvePage = preset.pipelines.find((pipeline) => pipeline.name === "resolvePage");
    expect(resolvePage?.steps).toContain("site.resolve:pages?home=start&status=published&fallback=true");
    const exportMedia = preset.pipelines.find((pipeline) => pipeline.name === "exportMedia");
    expect(exportMedia?.steps).toContain("media.export:/tmp/export");
  });

  it("sorts output pipelines by name", () => {
    const preset = definePreset({ modules: baseModules, features: [] });
    const names = preset.pipelines.map((pipeline) => pipeline.name);
    expect(names).toEqual([...names].sort());
  });

  it("keeps triggers in canonical order regardless of feature declaration order", () => {
    const modules = [
      ...baseModules,
      { use: "@michaelthielemann/kestrel-links-default" },
      { use: "@michaelthielemann/kestrel-ratelimit-memory" },
    ];
    const a = definePreset({ modules, features: ["links", "ratelimit"] });
    const b = definePreset({ modules, features: ["ratelimit", "links"] });
    expect(a.triggers).toEqual(b.triggers);
    const pipelineNames = a.triggers.map((trigger) => trigger.pipeline);
    expect(pipelineNames.indexOf("checkLinks")).toBeLessThan(pipelineNames.indexOf("sweepRateLimits"));
  });

  it("applies overrides to the fully composed step list", () => {
    const preset = definePreset({
      modules: baseModules,
      features: [],
      overrides: { deletePage: ["authn.requireUser", "authz.require:pages.delete", "content.remove:pages", "events.emit:page.deleted"] },
    });
    const deletePage = preset.pipelines.find((pipeline) => pipeline.name === "deletePage");
    expect(deletePage?.steps).toEqual(["authn.requireUser", "authz.require:pages.delete", "content.remove:pages", "events.emit:page.deleted"]);
  });

  it("throws for an override of an unknown pipeline name", () => {
    const overrides = { unknownPipeline: ["x"] };
    expect(() => definePreset({ modules: baseModules, features: [], overrides })).toThrow();
  });

  it("rejects an override naming a step no registered module provides", () => {
    // @ts-expect-error "authn.requireUsr" is not a registered step
    const preset = definePreset({ modules: baseModules, features: [], overrides: { me: ["authn.requireUsr", "authn.loadIdentity"] } });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "me")?.steps).toEqual(["authn.requireUsr", "authn.loadIdentity"]);
  });

  it("accepts an override widened with a step union of the consumer's own modules", () => {
    const preset = definePreset<Record<string, CollectionModel>, PresetStep | "own.step">({
      modules: baseModules,
      features: [],
      overrides: { me: ["authn.requireUser", "own.step"] },
    });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "me")?.steps).toEqual(["authn.requireUser", "own.step"]);
  });

  it("excludes a pipeline and its trigger", () => {
    const preset = definePreset({ modules: baseModules, features: [], exclude: ["me"] });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "me")).toBeUndefined();
    expect(preset.triggers.some((trigger) => trigger.pipeline === "me")).toBe(false);
  });

  it("throws when the same pipeline name is both overridden and excluded", () => {
    expect(() =>
      definePreset({
        modules: baseModules,
        features: [],
        overrides: { me: ["authn.requireUser", "authn.loadIdentity"] },
        exclude: ["me"],
      }),
    ).toThrow();
  });

  it("schedules reconcileMedia nightly and report-only without any feature", () => {
    const preset = definePreset({ modules: baseModules, features: [] });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "reconcileMedia")?.steps).toEqual(["media.reconcile"]);
    expect(preset.triggers.find((trigger) => trigger.pipeline === "reconcileMedia")).toEqual({ cron: "30 3 * * *", pipeline: "reconcileMedia" });
  });

  it("offers the admin routes for the reconcile report and the orphan deletion", () => {
    const preset = definePreset({ modules: baseModules, features: [] });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "reconcileMediaReport")?.steps).toEqual(["authn.requireUser", "authz.require:media.manage", "media.reconcile"]);
    expect(preset.pipelines.find((pipeline) => pipeline.name === "reconcileMediaDelete")?.steps).toEqual(["authn.requireUser", "authz.require:media.manage", "media.reconcileDelete"]);
    expect(preset.triggers.find((trigger) => trigger.pipeline === "reconcileMediaReport")).toEqual({ http: "POST /admin/media/reconcile", pipeline: "reconcileMediaReport" });
    expect(preset.triggers.find((trigger) => trigger.pipeline === "reconcileMediaDelete")).toEqual({ http: "POST /admin/media/reconcile/delete", pipeline: "reconcileMediaDelete" });
  });

  it("registers the code-declared image sizes through a pipeline without a trigger", () => {
    const preset = definePreset({ modules: [...baseModules, { use: "@michaelthielemann/kestrel-images-default" }], features: ["images"] });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "registerImageSizesBoot")?.steps).toEqual(["images.register"]);
    expect(preset.triggers.some((trigger) => trigger.pipeline === "registerImageSizesBoot")).toBe(false);
  });

  it("applies a custom cron schedule", () => {
    const preset = definePreset({ modules: baseModules, features: [], schedules: { cleanupSessions: "5 5 * * *" } });
    const trigger = preset.triggers.find((t) => t.pipeline === "cleanupSessions");
    expect(trigger).toEqual({ cron: "5 5 * * *", pipeline: "cleanupSessions" });
  });

  it("throws for a schedule on an unknown or non-cron pipeline", () => {
    const schedules = { me: "5 5 * * *" };
    expect(() => definePreset({ modules: baseModules, features: [], schedules: schedules as never })).toThrow();
  });

  it("throws naming the gating feature for a schedule on a known cron pipeline whose feature is not enabled", () => {
    expect(() => definePreset({ modules: baseModules, features: [], schedules: { checkLinks: "5 5 * * *" } })).toThrow(
      'preset: schedule for pipeline "checkLinks" – feature "links" is not enabled',
    );
  });

  it("throws a specific error when the same pipeline is both excluded and rescheduled", () => {
    const modules = [...baseModules, { use: "@michaelthielemann/kestrel-ratelimit-memory" }];
    expect(() =>
      definePreset({ modules, features: ["ratelimit"], exclude: ["sweepRateLimits"], schedules: { sweepRateLimits: "0 0 * * *" } }),
    ).toThrow('preset: pipeline "sweepRateLimits" is both excluded and rescheduled');
  });
});

describe("definePreset module coupling", () => {
  it("throws when a feature is enabled but its module is not configured", () => {
    expect(() => definePreset({ modules: baseModules, features: ["ratelimit"] })).toThrow(
      'preset: feature "ratelimit" requires module "@michaelthielemann/kestrel-ratelimit-memory"',
    );
  });

  it("throws naming the first missing module when delivery is enabled but only one of its two modules is configured", () => {
    const modules = [...baseModules, { use: "@michaelthielemann/kestrel-delivery-static" }];
    expect(() => definePreset({ modules, features: ["delivery"] })).toThrow(
      'preset: feature "delivery" requires module "@michaelthielemann/kestrel-renderer-nuxt"',
    );
  });

  it("succeeds when delivery is enabled and both its modules are configured", () => {
    const modules = [...baseModules, { use: "@michaelthielemann/kestrel-delivery-static" }, { use: "@michaelthielemann/kestrel-renderer-nuxt" }];
    expect(() => definePreset({ modules, features: ["delivery"] })).not.toThrow();
  });

  it("throws when migrations is enabled but its module is not configured", () => {
    expect(() => definePreset({ modules: baseModules, features: ["migrations"] })).toThrow(
      'preset: feature "migrations" requires module "@michaelthielemann/kestrel-migrations-default"',
    );
  });

  it("wires listMigrations/applyMigrations and their triggers when migrations is enabled and configured", () => {
    const modules = [...baseModules, { use: "@michaelthielemann/kestrel-migrations-default" }];
    const preset = definePreset({ modules, features: ["migrations"] });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "listMigrations")?.steps).toEqual([
      "authn.requireUser",
      "authz.require:migrations.manage",
      "migrations.list",
    ]);
    expect(preset.pipelines.find((pipeline) => pipeline.name === "applyMigrations")?.steps).toEqual([
      "authn.requireUser",
      "authz.require:migrations.manage",
      "migrations.apply",
    ]);
    expect(preset.triggers).toContainEqual({ http: "GET /admin/migrations", pipeline: "listMigrations" });
    expect(preset.triggers).toContainEqual({ http: "POST /admin/migrations/apply", pipeline: "applyMigrations" });
  });

  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  afterEach(() => warnSpy.mockClear());
  afterAll(() => warnSpy.mockRestore());

  it("warns when a feature module is configured but its feature is not enabled", () => {
    const modules = [...baseModules, { use: "@michaelthielemann/kestrel-ratelimit-memory" }];
    definePreset({ modules, features: [] });
    expect(warnSpy).toHaveBeenCalledWith(
      'preset: module "@michaelthielemann/kestrel-ratelimit-memory" is configured but feature "ratelimit" is not enabled – its pipelines and steps are not wired',
    );
  });

  it("never warns for a module mapped to no feature", () => {
    definePreset({ modules: baseModules, features: [] });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("throws when redirects is enabled but validate-jsonschema config lacks the redirects.rules schema key", () => {
    const modules = [...baseModules, { use: "@michaelthielemann/kestrel-redirects-default" }];
    expect(() => definePreset({ modules, features: ["redirects"] })).toThrow(
      'preset: feature "redirects" needs schema "redirects.rules" in validate-jsonschema config – use presetSchemas()',
    );
  });

  it("succeeds when redirects is enabled and validate-jsonschema config has the redirects.rules schema key", () => {
    const modules = [
      ...baseModules.filter((m) => m.use !== "@michaelthielemann/kestrel-validate-jsonschema"),
      { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x", "redirects.rules": "y" } } },
      { use: "@michaelthielemann/kestrel-redirects-default" },
    ];
    expect(() => definePreset({ modules, features: ["redirects"] })).not.toThrow();
  });

  it("throws naming the missing validate-jsonschema module when redirects is enabled and that module is absent entirely", () => {
    const modules = [
      ...baseModules.filter((m) => m.use !== "@michaelthielemann/kestrel-validate-jsonschema"),
      { use: "@michaelthielemann/kestrel-redirects-default" },
    ];
    expect(() => definePreset({ modules, features: ["redirects"] })).toThrow(
      'preset: feature "redirects" needs module "@michaelthielemann/kestrel-validate-jsonschema" with schema "redirects.rules" – use presetSchemas()',
    );
  });
});

describe("definePreset feature composition", () => {
  it("wires redirects without delivery: publishAllPages absent, setRedirects still exports, resolvePage still looks up", () => {
    const modules = [
      ...baseModules.filter((m) => m.use !== "@michaelthielemann/kestrel-validate-jsonschema"),
      { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x", "redirects.rules": "y" } } },
      { use: "@michaelthielemann/kestrel-redirects-default" },
    ];
    const preset = definePreset({ modules, features: ["redirects"] });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "publishAllPages")).toBeUndefined();
    const setRedirects = preset.pipelines.find((pipeline) => pipeline.name === "setRedirects");
    expect(setRedirects?.steps).toContain("redirects.export");
    const resolvePage = preset.pipelines.find((pipeline) => pipeline.name === "resolvePage");
    expect(resolvePage?.steps).toContain("redirects.lookup");
  });

  it("throws when a feature pipeline name collides with a base pipeline", async () => {
    vi.resetModules();
    vi.doMock("./features/audit", () => ({
      default: () => ({ modules: ["@michaelthielemann/kestrel-audit-persistence"], pipelines: { login: ["x"] }, patches: [] }),
    }));
    const { definePreset: definePresetWithCollidingAudit } = await import("./index");
    const modules = [...baseModules, { use: "@michaelthielemann/kestrel-audit-persistence" }];
    expect(() => definePresetWithCollidingAudit({ modules, features: ["audit"] })).toThrow();
    vi.doUnmock("./features/audit");
    vi.resetModules();
  });
});

describe("definePreset step ordering", () => {
  const READS_RESULT_ID = /^(?:references\.(?:index|unindex)|links\.(?:extract|unextract)):/;

  it("puts every step reading ctx.result.id before delivery.publish, which replaces ctx.result", () => {
    const modules = [
      ...baseModules,
      { use: "@michaelthielemann/kestrel-references-default" },
      { use: "@michaelthielemann/kestrel-links-default" },
      { use: "@michaelthielemann/kestrel-delivery-static" },
      { use: "@michaelthielemann/kestrel-renderer-nuxt" },
    ];
    const preset = definePreset({ modules, features: ["references", "links", "delivery"] });
    let asserted = 0;
    for (const pipeline of preset.pipelines) {
      const publish = pipeline.steps.findIndex((step) => step.startsWith("delivery.publish:"));
      if (publish === -1) continue;
      pipeline.steps.forEach((step, index) => {
        if (!READS_RESULT_ID.test(step)) return;
        asserted += 1;
        expect(index, `${pipeline.name}: "${step}" must run before "${pipeline.steps[publish]}"`).toBeLessThan(publish);
      });
    }
    expect(asserted).toBeGreaterThan(0);
  });
});

describe("presetSchemas", () => {
  it("returns pages.body and settings.navigation without the redirects feature", () => {
    const schemas = presetSchemas({ features: [] });
    expect(Object.keys(schemas).sort()).toEqual(["pages.body", "settings.navigation"]);
    expect(schemas["settings.navigation"]).toMatch(/schemas\/settings\.navigation\.json$/);
  });

  it("adds redirects.rules with the redirects feature", () => {
    const schemas = presetSchemas({ features: ["redirects"] });
    expect(Object.keys(schemas).sort()).toEqual(["pages.body", "redirects.rules", "settings.navigation"]);
    expect(schemas["redirects.rules"]).toMatch(/redirects\.rules\.json$/);
  });

  it("does not register a body schema for a single-kind collection", () => {
    const schemas = presetSchemas({ features: [], collections: { profile: { kind: "single", fields: { bio: {}, body: {} } } } });
    expect(schemas["profile.body"]).toBeUndefined();
  });

  it("registers a body schema for a multi-kind collection", () => {
    const schemas = presetSchemas({ features: [], collections: { news: { kind: "multi", fields: { title: {}, body: {} } } } });
    expect(schemas["news.body"]).toMatch(/schemas[/\\]news\.body\.json$/);
  });

  it("respects KESTREL_BLOCK_SCHEMA and KESTREL_REDIRECTS_SCHEMA overrides", () => {
    vi.stubEnv("KESTREL_BLOCK_SCHEMA", "/custom/pages.body.json");
    vi.stubEnv("KESTREL_REDIRECTS_SCHEMA", "/custom/redirects.rules.json");
    const schemas = presetSchemas({ features: ["redirects"] });
    expect(schemas["pages.body"]).toBe("/custom/pages.body.json");
    expect(schemas["redirects.rules"]).toBe("/custom/redirects.rules.json");
    vi.unstubAllEnvs();
  });

  describe("settings.navigation fallback", () => {
    let appRoot: string | undefined;

    afterEach(() => {
      vi.unstubAllEnvs();
      if (appRoot) rmSync(appRoot, { recursive: true, force: true });
    });

    it("uses the layer default when the consumer has no schemas/settings.navigation.json", () => {
      appRoot = mkdtempSync(join(tmpdir(), "kestrel-preset-"));
      vi.stubEnv("KESTREL_APP_ROOT", appRoot);
      const schemas = presetSchemas({ features: [] });
      expect(schemas["settings.navigation"]).toMatch(/layers[/\\]core[/\\]schemas[/\\]settings\.navigation\.json$/);
    });

    it("uses the consumer file when schemas/settings.navigation.json exists", () => {
      appRoot = mkdtempSync(join(tmpdir(), "kestrel-preset-"));
      mkdirSync(join(appRoot, "schemas"), { recursive: true });
      const consumerPath = join(appRoot, "schemas", "settings.navigation.json");
      writeFileSync(consumerPath, "{}");
      vi.stubEnv("KESTREL_APP_ROOT", appRoot);
      const schemas = presetSchemas({ features: [] });
      expect(schemas["settings.navigation"]).toBe(consumerPath);
    });
  });
});

describe("definePreset collection name validation", () => {
  it.each(["my-collection", "my_collection", "1collection", "MyCollection"])(
    "throws for an invalid collection name %s",
    (name) => {
      expect(() => definePreset({ modules: baseModules, features: [], collections: { [name]: { kind: "single", fields: {} } } })).toThrow(
        `preset: collection name "${name}" must match`,
      );
    },
  );

  it.each(["site", "media", "users", "health", "login", "logout", "me", "admin"])(
    "throws for the reserved collection name %s",
    (name) => {
      expect(() => definePreset({ modules: baseModules, features: [], collections: { [name]: { kind: "single", fields: {} } } })).toThrow(
        `preset: collection name "${name}" is reserved`,
      );
    },
  );

  it("accepts a valid camelCase collection name", () => {
    expect(() => definePreset({ modules: baseModules, features: [], collections: { newsItem: { kind: "multi", fields: {} } } })).not.toThrow();
  });
});

describe("definePreset collection pipeline collisions", () => {
  it("names the collection, not a feature, when a generated pipeline collides with an existing one", () => {
    expect(() => definePreset({ modules: baseModules, features: [], collections: { user: { kind: "multi", fields: {} } } })).toThrow(
      'preset: collection "user" pipeline "createUser" collides with an existing pipeline',
    );
  });
});

describe("definePreset pages-optional boot", () => {
  const collectionsWithoutPages = { settings: { kind: "single" as const, fields: {} } };

  it("boots without a pages collection: no resolvePage pipeline or GET /site/*path trigger", () => {
    const preset = definePreset({ modules: baseModules, features: [], collections: collectionsWithoutPages });
    expect(preset.pipelines.find((pipeline) => pipeline.name === "resolvePage")).toBeUndefined();
    expect(preset.triggers.some((trigger) => "http" in trigger && trigger.pipeline === "resolvePage")).toBe(false);
  });

  it("throws naming both the feature and 'pages' when a page-requiring feature is enabled without a pages collection", () => {
    const modules = [...baseModules, { use: "@michaelthielemann/kestrel-references-default" }];
    expect(() => definePreset({ modules, features: ["references"], collections: collectionsWithoutPages })).toThrow(
      'preset: feature "references" requires a "pages" collection',
    );
  });
});
