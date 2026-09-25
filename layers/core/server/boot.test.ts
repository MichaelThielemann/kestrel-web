import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, defineConfig, defineModule, definePipeline, isOk, KestrelBootError, type Logger, type ModuleDefinition } from "@michaelthielemann/kestrel";
import { failure } from "@michaelthielemann/kestrel/errors";
import { err } from "@michaelthielemann/kestrel/result";
import { stepFactory } from "@michaelthielemann/kestrel/context";
import { PERSISTENCE } from "@michaelthielemann/kestrel-contracts/persistence";
import { BLOBSTORE } from "@michaelthielemann/kestrel-contracts/blobstore";
import referencesDefault from "@michaelthielemann/kestrel-references-default";
import insights from "@michaelthielemann/kestrel-insights";
import persistenceSqlite from "@michaelthielemann/kestrel-persistence-sqlite";
import replicationSqlite from "@michaelthielemann/kestrel-replication-sqlite";
import { presetModules } from "#kestrel/modules";
import { definePreset, featureOrder, presetModuleConfig } from "#kestrel/pipelines";
import type { Feature } from "#kestrel/pipelines";
import { ATOMIC_SAFE_STEPS } from "../pipelines/atomic-safe";
import { uploadLimits } from "./utils/limits";
import { inlineTypesFor } from "./utils/inline-types";

interface CollectedLog {
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
}

function collectingLogger(): Logger & { entries: CollectedLog[] } {
  const entries: CollectedLog[] = [];
  return {
    entries,
    step: () => {},
    info: (message, data) => entries.push({ level: "info", message, data }),
    warn: (message, data) => entries.push({ level: "warn", message, data }),
    error: (message, data) => entries.push({ level: "error", message, data }),
  };
}

function recordingSetup(mod: ModuleDefinition, order: string[]): ModuleDefinition {
  return {
    ...mod,
    setup: async (...args: Parameters<ModuleDefinition["setup"]>) => {
      const instance = await mod.setup(...args);
      order.push(mod.name);
      return instance;
    },
  };
}

function asFeatures(names: readonly string[]): Feature[] {
  const known = new Set<string>(featureOrder);
  const result = names.filter((name): name is Feature => known.has(name));
  if (result.length !== names.length) throw new Error(`unexpected feature name(s) in ${JSON.stringify(names)}`);
  return result;
}

describe("boot", () => {
  describe("playground config", () => {
    let appRoot: string;

    beforeAll(() => {
      appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-boot-"));
      process.env.KESTREL_APP_ROOT = appRoot;
      process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    });

    afterAll(() => {
      delete process.env.KESTREL_APP_ROOT;
      delete process.env.KESTREL_BLOCK_SCHEMA;
      rmSync(appRoot, { recursive: true, force: true });
    });

    it(
      "boots, runs the login pipeline through the real runner and derives module limits from the booted registry",
      async () => {
        const { default: config, preset } = await import("../../../playground/kestrel.config");
        const setupOrder: string[] = [];
        const modules = presetModules(config.modules, {
          "@michaelthielemann/kestrel-insights": insights,
          "@michaelthielemann/kestrel-replication-sqlite": recordingSetup(replicationSqlite, setupOrder),
          "@michaelthielemann/kestrel-persistence-sqlite": recordingSetup(persistenceSqlite, setupOrder),
        });
        const logger = collectingLogger();

        const kestrel = await boot({ config: { ...config, http: null }, modules, pipelines: preset.pipelines, logger });
        expect(kestrel.pipelines.size).toBe(preset.pipelines.length);
        expect(logger.entries.filter((entry) => entry.level !== "info")).toEqual([]);
        expect(kestrel.warnings, `unexpected boot warnings: ${JSON.stringify(kestrel.warnings)}`).toEqual([]);

        const replicationIndex = setupOrder.indexOf("replication/sqlite");
        const persistenceIndex = setupOrder.indexOf("persistence/sqlite");
        expect(replicationIndex, `expected replication/sqlite's setup() to have run, order was ${JSON.stringify(setupOrder)}`).toBeGreaterThanOrEqual(0);
        expect(persistenceIndex, `expected persistence/sqlite's setup() to have run, order was ${JSON.stringify(setupOrder)}`).toBeGreaterThanOrEqual(0);
        expect(
          replicationIndex,
          `replication/sqlite must be set up before persistence/sqlite so a restore runs before the file is opened; order was ${JSON.stringify(setupOrder)}`,
        ).toBeLessThan(persistenceIndex);

        try {
          await kestrel.start();

          const login = await kestrel.run("login", {
            trigger: { kind: "http", name: "POST /login" },
            body: { username: "admin", password: "change-me" },
          });
          expect(login.status).toBe(200);

          const persistence = kestrel.contracts.find(PERSISTENCE);
          if (persistence === undefined) throw new Error("expected the booted instance to provide persistence@1");
          const auditEntries = await persistence.findMany("audit_entries", { event: "auth.loggedIn" });
          if (!isOk(auditEntries)) throw new Error("expected the audit_entries query to succeed");
          expect(auditEntries.value.total).toBeGreaterThan(0);

          const limits = uploadLimits(kestrel, modules, config.modules);
          expect(limits.maxBodyBytes).toBe(5242880 + 1024 * 1024);
          expect(inlineTypesFor(kestrel, modules)).toContain("image/svg+xml");
        } finally {
          await kestrel.stop();
        }
      },
      10000,
    );
  });

  describe("playground config with the eventsQueue feature", () => {
    let appRoot: string;

    beforeAll(() => {
      appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-boot-queue-"));
      process.env.KESTREL_APP_ROOT = appRoot;
      process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    });

    afterAll(() => {
      delete process.env.KESTREL_APP_ROOT;
      delete process.env.KESTREL_BLOCK_SCHEMA;
      rmSync(appRoot, { recursive: true, force: true });
    });

    it("boots and starts with the bus plus events-queue instead of events-direct", async () => {
      const { contentModel, contentTypes, features } = await import("../../../playground/shared/model");
      const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
      const { default: fieldTypes } = await import("../../../playground/shared/field-types");
      const dataDir = appRoot;
      const eventsQueueFeatures = [...features, "eventsQueue"] as const;

      const modules = presetModuleConfig({
        dataDir,
        blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(dataDir, "blobs") } },
        model: contentModel,
        features: eventsQueueFeatures,
        collectionsUi,
        fieldTypes,
        audit: { retentionDays: 365 },
        roles: {
          roles: { admin: ["*"] },
          anonymous: ["media.read"],
        },
        bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
      });
      const preset = definePreset({ modules, features: eventsQueueFeatures, collections: contentTypes, collectionsUi, fieldTypes });
      const config = defineConfig({ modules, triggers: preset.triggers, http: null });
      const bootedModules = presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights });
      const logger = collectingLogger();

      const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger });
      expect(config.modules.some((m) => m.use === "@michaelthielemann/kestrel-events-queue")).toBe(true);
      expect(config.modules.some((m) => m.use === "@michaelthielemann/kestrel-events-inmemory")).toBe(true);
      expect(config.modules.some((m) => m.use === "@michaelthielemann/kestrel-events-direct")).toBe(false);
      expect(logger.entries.filter((entry) => entry.level !== "info")).toEqual([]);
      expect(kestrel.warnings, `unexpected boot warnings: ${JSON.stringify(kestrel.warnings)}`).toEqual([]);

      try {
        await kestrel.start();
      } finally {
        await kestrel.stop();
      }
    }, 10000);

    it("keeps atomic-safe.ts's step set in sync with every module's atomicSafe declaration", async () => {
      const { contentModel, contentTypes, features } = await import("../../../playground/shared/model");
      const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
      const { default: fieldTypes } = await import("../../../playground/shared/field-types");
      const eventsQueueFeatures = [...features, "eventsQueue"] as const;

      const modules = presetModuleConfig({
        dataDir: appRoot,
        blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
        model: contentModel,
        features: eventsQueueFeatures,
        collectionsUi,
        fieldTypes,
        audit: { retentionDays: 365 },
        roles: { roles: { admin: ["*"] }, anonymous: ["media.read"] },
        bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
      });
      const preset = definePreset({ modules, features: eventsQueueFeatures, collections: contentTypes, collectionsUi, fieldTypes });
      const config = defineConfig({ modules, triggers: preset.triggers, http: null });
      const bootedModules = presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights });

      const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger: collectingLogger() });
      try {
        const manifest = kestrel.describe();
        const atomicSafeInManifest = new Set(manifest.steps.filter((step) => step.description.atomicSafe === true).map((step) => step.name));
        const missingFromSet = [...atomicSafeInManifest].filter((name) => !ATOMIC_SAFE_STEPS.has(name));
        const staleInSet = [...ATOMIC_SAFE_STEPS].filter((name) => !atomicSafeInManifest.has(name));
        expect(missingFromSet, `atomic-safe.ts is missing step(s) the booted manifest marks atomicSafe: ${missingFromSet.join(", ")}`).toEqual([]);
        expect(staleInSet, `atomic-safe.ts has step(s) the booted manifest no longer marks atomicSafe: ${staleInSet.join(", ")}`).toEqual([]);
      } finally {
        await kestrel.stop();
      }
    }, 10000);
  });

  describe("playground config with the eventsQueue feature and no event-triggering feature", () => {
    let appRoot: string;

    beforeAll(() => {
      appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-boot-idle-queue-"));
      process.env.KESTREL_APP_ROOT = appRoot;
    });

    afterAll(() => {
      delete process.env.KESTREL_APP_ROOT;
      rmSync(appRoot, { recursive: true, force: true });
    });

    it("boots and starts with an empty warning list, the queue idle from the start", async () => {
      const collections = { settings: { kind: "single" as const, fields: { title: { type: "text" } } } };
      const modules = presetModuleConfig({
        dataDir: appRoot,
        blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
        model: { types: collections },
        features: ["eventsQueue"],
        roles: { roles: { admin: ["*"] }, anonymous: [] },
        bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
      });
      const preset = definePreset({ modules, features: ["eventsQueue"], collections });
      expect(preset.triggers.some((trigger) => "event" in trigger)).toBe(false);

      const config = defineConfig({ modules, triggers: preset.triggers, http: null });
      const bootedModules = presetModules(config.modules);
      const logger = collectingLogger();

      const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger });
      expect(logger.entries.filter((entry) => entry.level !== "info")).toEqual([]);
      expect(kestrel.warnings, `unexpected boot warnings: ${JSON.stringify(kestrel.warnings)}`).toEqual([]);

      try {
        await kestrel.start();
      } finally {
        await kestrel.stop();
      }
    }, 10000);
  });

  describe("the scaffold's default feature set", () => {
    let appRoot: string;

    beforeAll(() => {
      appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-boot-scaffold-default-"));
      process.env.KESTREL_APP_ROOT = appRoot;
      process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    });

    afterAll(() => {
      delete process.env.KESTREL_APP_ROOT;
      delete process.env.KESTREL_BLOCK_SCHEMA;
      rmSync(appRoot, { recursive: true, force: true });
    });

    it("boots and starts with an empty warning list and relays page publishing, exactly as a freshly scaffolded project would", async () => {
      const { DEFAULT_FEATURES } = await import("../../../packages/create-kestrel/src/features.mjs");
      const { contentModel, contentTypes } = await import("../../../playground/shared/model");
      const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
      const { default: fieldTypes } = await import("../../../playground/shared/field-types");
      const features = asFeatures(DEFAULT_FEATURES);

      const modules = presetModuleConfig({
        dataDir: appRoot,
        blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
        model: contentModel,
        features,
        collectionsUi,
        fieldTypes,
        roles: { roles: { admin: ["*"] }, anonymous: ["media.read"] },
        bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
      });
      const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi, fieldTypes });
      const queueEntry = modules.find((entry) => entry.use === "@michaelthielemann/kestrel-events-queue");
      expect(queueEntry?.config).toMatchObject({ relayPipelines: ["publishPage", "unpublishPage"] });

      const config = defineConfig({ modules, triggers: preset.triggers, http: null });
      const bootedModules = presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights });
      const logger = collectingLogger();

      const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger });
      expect(logger.entries.filter((entry) => entry.level !== "info")).toEqual([]);
      expect(kestrel.warnings, `unexpected boot warnings: ${JSON.stringify(kestrel.warnings)}`).toEqual([]);

      try {
        await kestrel.start();

        const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
        expect(login.status).toBe(200);
        if (login.result === undefined || typeof login.result !== "object" || !("token" in login.result)) throw new Error("expected the login run to produce a token");
        const token = String(login.result.token);

        const create = await kestrel.run("createPage", {
          trigger: { kind: "http", name: "POST /pages" },
          headers: { authorization: `Bearer ${token}` },
          body: { locale: "de", slug: "scaffold-default-boot", title: "Scaffold default boot", status: "published", body: [], accent: "#123456" },
        });
        expect(create.status).toBe(200);
        const events = create.result !== undefined && typeof create.result === "object" && "_events" in create.result ? create.result._events : undefined;
        const pipelines: unknown = typeof events === "object" && events !== null ? Reflect.get(events, "pipelines") : undefined;
        expect(pipelines).toContainEqual(expect.objectContaining({ pipeline: "publishPage", status: "done" }));
        expect(pipelines).toContainEqual(expect.objectContaining({ pipeline: "pageDependents", status: "queued" }));
      } finally {
        await kestrel.stop();
      }
    }, 15000);

    it("boots and starts a project scaffolded with --features delivery alone, which brings sanitizeSvg along", async () => {
      const { resolveOptions } = await import("../../../packages/create-kestrel/src/args.mjs");
      const { contentModel, contentTypes } = await import("../../../playground/shared/model");
      const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
      const { default: fieldTypes } = await import("../../../playground/shared/field-types");
      const resolved = resolveOptions(["--features", "delivery"], {});
      expect(resolved.errors).toEqual([]);
      const features = asFeatures(resolved.options.features ?? []);
      expect(features).toEqual(["sanitizeSvg", "delivery"]);
      const deliveryRoot = mkdtempSync(join(tmpdir(), "kestrel-web-boot-delivery-only-"));

      try {
        const modules = presetModuleConfig({
          dataDir: deliveryRoot,
          blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(deliveryRoot, "blobs") } },
          model: contentModel,
          features,
          collectionsUi,
          fieldTypes,
          roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "settings.read", "media.read"] },
          bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
        });
        const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi, fieldTypes });
        const config = defineConfig({ modules, triggers: preset.triggers, http: null });
        const kestrel = await boot({ config: { ...config, http: null }, modules: presetModules(config.modules), pipelines: preset.pipelines, logger: collectingLogger() });
        try {
          await kestrel.start();
        } finally {
          await kestrel.stop();
        }
      } finally {
        rmSync(deliveryRoot, { recursive: true, force: true });
      }
    }, 15000);

    it("refuses to boot the default feature set with an empty anonymous role, naming the missing media.read permission", async () => {
      const { DEFAULT_FEATURES } = await import("../../../packages/create-kestrel/src/features.mjs");
      const { contentModel, contentTypes } = await import("../../../playground/shared/model");
      const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
      const { default: fieldTypes } = await import("../../../playground/shared/field-types");
      const features = asFeatures(DEFAULT_FEATURES);
      const negativeRoot = mkdtempSync(join(tmpdir(), "kestrel-web-boot-no-anonymous-media-"));

      try {
        const modules = presetModuleConfig({
          dataDir: negativeRoot,
          blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(negativeRoot, "blobs") } },
          model: contentModel,
          features,
          collectionsUi,
          fieldTypes,
          roles: { roles: { admin: ["*"] }, anonymous: [] },
          bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
        });
        const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi, fieldTypes });
        const config = defineConfig({ modules, triggers: preset.triggers, http: null });
        const bootedModules = presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights });

        await expect(boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger: collectingLogger() })).rejects.toThrow(
          /anonymous callers lack "media\.read"/,
        );
      } finally {
        rmSync(negativeRoot, { recursive: true, force: true });
      }
    }, 15000);
  });

  describe("persistence-sqlite's acquireTimeoutMs is derived from busyTimeoutMs", () => {
    let appRoot: string;

    beforeAll(() => {
      appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-boot-acquire-timeout-"));
      process.env.KESTREL_APP_ROOT = appRoot;
    });

    afterAll(() => {
      delete process.env.KESTREL_APP_ROOT;
      rmSync(appRoot, { recursive: true, force: true });
    });

    async function bootWithBusyTimeoutMs(busyTimeoutMs?: number) {
      const collections = { settings: { kind: "single" as const, fields: { title: { type: "text" } } } };
      const modules = presetModuleConfig({
        dataDir: appRoot,
        blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
        model: { types: collections },
        features: [],
        roles: { roles: { admin: ["*"] }, anonymous: [] },
        bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
        ...(busyTimeoutMs === undefined ? {} : { overrides: { "@michaelthielemann/kestrel-persistence-sqlite": { busyTimeoutMs } } }),
      });
      const preset = definePreset({ modules, features: [], collections });
      const config = defineConfig({ modules, triggers: preset.triggers, http: null });
      const bootedModules = presetModules(config.modules);
      return boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines });
    }

    it("boots with the preset's persistence-sqlite config, which no longer sets acquireTimeoutMs", async () => {
      const kestrel = await bootWithBusyTimeoutMs();
      try {
        await kestrel.start();
      } finally {
        await kestrel.stop();
      }
    });

    it("boots when a consumer raises busyTimeoutMs through overrides, since acquireTimeoutMs is derived from it", async () => {
      const kestrel = await bootWithBusyTimeoutMs(20000);
      try {
        await kestrel.start();
      } finally {
        await kestrel.stop();
      }
    });
  });

  describe("atomic group: a forced failure inside the group leaves nothing stored", () => {
    let appRoot: string;

    beforeAll(() => {
      appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-boot-atomic-"));
      process.env.KESTREL_APP_ROOT = appRoot;
      process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    });

    afterAll(() => {
      delete process.env.KESTREL_APP_ROOT;
      delete process.env.KESTREL_BLOCK_SCHEMA;
      rmSync(appRoot, { recursive: true, force: true });
    });

    function referencesDefaultWithFailingIndex(): ModuleDefinition {
      return {
        ...referencesDefault,
        steps: (instance: unknown) => {
          const real = referencesDefault.steps!(instance);
          return {
            ...real,
            index: stepFactory((_type: string) => () => Promise.resolve(err(failure("TRANSIENT", "forced failure for the atomic-group acceptance test")))),
          };
        },
      };
    }

    it("a forced failure in references.index inside createPage stores no page, no revision, no index row and no queue row", async () => {
      const { contentModel, contentTypes, features } = await import("../../../playground/shared/model");
      const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
      const { default: fieldTypes } = await import("../../../playground/shared/field-types");
      const dataDir = appRoot;
      const eventsQueueFeatures = [...features, "eventsQueue"] as const;

      const moduleConfig = presetModuleConfig({
        dataDir,
        blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(dataDir, "blobs") } },
        model: contentModel,
        features: eventsQueueFeatures,
        collectionsUi,
        fieldTypes,
        audit: { retentionDays: 365 },
        roles: { roles: { admin: ["*"] }, anonymous: ["media.read"] },
        bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
      });
      const preset = definePreset({ modules: moduleConfig, features: eventsQueueFeatures, collections: contentTypes, collectionsUi, fieldTypes });
      const config = defineConfig({ modules: moduleConfig, triggers: preset.triggers, http: null });
      const bootedModules = presetModules(config.modules, {
        "@michaelthielemann/kestrel-insights": insights,
        "@michaelthielemann/kestrel-references-default": referencesDefaultWithFailingIndex(),
      });
      const logger = collectingLogger();

      const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger });

      try {
        await kestrel.start();

        const login = await kestrel.run("login", {
          trigger: { kind: "http", name: "POST /login" },
          body: { username: "admin", password: "change-me" },
        });
        expect(login.status).toBe(200);
        const token = login.result && typeof login.result === "object" && "token" in login.result ? String(login.result.token) : undefined;
        if (token === undefined) throw new Error("expected the login run to produce a token");

        const create = await kestrel.run("createPage", {
          trigger: { kind: "http", name: "POST /pages" },
          headers: { authorization: `Bearer ${token}` },
          body: { locale: "de", slug: "atomic-acceptance", title: "Atomic acceptance", status: "draft", body: [], accent: "#123456" },
        });

        expect(create.status).toBe(503);
        expect(create.code).toBe("TRANSIENT");
        expect(create.step).toBe("references.index:pages");

        const persistence = kestrel.contracts.find(PERSISTENCE);
        if (persistence === undefined) throw new Error("expected the booted instance to provide persistence@1");

        const pages = await persistence.findMany("pages", {});
        if (!isOk(pages)) throw new Error("expected the pages query to succeed");
        expect(pages.value.total).toBe(0);

        const revisions = await persistence.findMany("revisions_heads", { collection: "pages" });
        if (!isOk(revisions)) throw new Error("expected the revisions_heads query to succeed");
        expect(revisions.value.total).toBe(0);

        const referencesIndex = await persistence.findMany("references_index", { fromType: "pages" });
        if (!isOk(referencesIndex)) throw new Error("expected the references_index query to succeed");
        expect(referencesIndex.value.total).toBe(0);

        const queue = await persistence.findMany("events_queue", { name: "page.created" });
        if (!isOk(queue)) throw new Error("expected the events_queue query to succeed");
        expect(queue.value.total).toBe(0);
      } finally {
        await kestrel.stop();
      }
    }, 15000);
  });

  describe("module setup order: a custom module that requires persistence while replication must run before it", () => {
    function fakeBlobstoreRequiringPersistence(): ModuleDefinition {
      return defineModule({
        name: "blobstore/fake",
        provides: [BLOBSTORE],
        requires: [PERSISTENCE],
        configSchema: referencesDefault.configSchema,
        setup(): Promise<never> {
          return Promise.reject(new Error("blobstore/fake: setup must not run once sortModules finds the cycle first"));
        },
      });
    }

    it("fails boot with a KestrelBootError naming the cycle through replication, the custom blobstore and persistence", async () => {
      const config = defineConfig({
        modules: [
          { use: "@michaelthielemann/kestrel-replication-sqlite", config: {} },
          { use: "@michaelthielemann/kestrel-persistence-sqlite", config: {} },
          { use: "kestrel-blobstore-fake", config: {} },
        ],
        triggers: [],
        http: null,
      });
      const modules = [replicationSqlite, persistenceSqlite, fakeBlobstoreRequiringPersistence()];

      await expect(boot({ config, modules, pipelines: [], logger: collectingLogger() })).rejects.toThrow(KestrelBootError);
      await expect(boot({ config, modules, pipelines: [], logger: collectingLogger() })).rejects.toThrow(
        /dependency cycle: replication\/sqlite -> blobstore\/fake -> persistence\/sqlite -> replication\/sqlite/,
      );
    });
  });

  describe("the field step and the field grants", () => {
    let appRoot: string;

    beforeAll(() => {
      appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-boot-field-grants-"));
      process.env.KESTREL_APP_ROOT = appRoot;
      process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    });

    afterAll(() => {
      delete process.env.KESTREL_APP_ROOT;
      delete process.env.KESTREL_BLOCK_SCHEMA;
      rmSync(appRoot, { recursive: true, force: true });
    });

    async function bootPlayground(options: { overrides?: Record<string, readonly string[]>; anonymousFields?: Record<string, string[]> }): Promise<void> {
      const { contentModel, contentTypes, features } = await import("../../../playground/shared/model");
      const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
      const { default: fieldTypes } = await import("../../../playground/shared/field-types");
      const modules = presetModuleConfig({
        dataDir: appRoot,
        blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
        model: contentModel,
        features,
        collectionsUi,
        fieldTypes,
        audit: { retentionDays: 365 },
        roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "settings.read", "media.read"], ...(options.anonymousFields === undefined ? {} : { anonymousFields: options.anonymousFields }) },
        bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
      });
      const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi, fieldTypes, ...(options.overrides === undefined ? {} : { overrides: options.overrides }) });
      const config = defineConfig({ modules, triggers: preset.triggers, http: null });
      const kestrel = await boot({ config, modules: presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights }), pipelines: preset.pipelines, logger: collectingLogger() });
      await kestrel.stop();
    }

    it("refuses an override of a public read that drops the field step, naming the pipeline", async () => {
      const boot = bootPlayground({ overrides: { getMedia: ["authn.identifyUser", "authz.require:media.read", "media.get", "images.attach"] } });
      await expect(boot).rejects.toThrow(KestrelBootError);
      await expect(boot).rejects.toThrow('pipeline "getMedia" answers anonymous callers but does not end with authz.fields:<resource>?shape=item');
    }, 15000);

    it("refuses a grant naming a field no public read declares, naming the grant and the field", async () => {
      const boot = bootPlayground({ anonymousFields: { media: ["id", "path", "folderr"] } });
      await expect(boot).rejects.toThrow(KestrelBootError);
      await expect(boot).rejects.toThrow('anonymousFields.media names "folderr", which no pipeline ending with authz.fields:media declares');
    }, 15000);

    it("boots a model without locales and without images whose collections anonymous callers read, and answers them only the granted fields", async () => {
      const types = {
        settings: { kind: "single", fields: { title: { type: "text" } } },
        redirects: { kind: "single", fields: { rules: { type: "json" } } },
        pages: { kind: "multi", fields: { slug: { type: "slug" }, title: { type: "text" }, body: { type: "json" }, status: { type: "enum", options: ["draft", "published"] } } },
        news: { kind: "multi", fields: { title: { type: "text" }, status: { type: "enum", options: ["draft", "published"] } } },
        profile: { kind: "single", fields: { bio: { type: "text" } } },
      } as const;
      const features = asFeatures(["redirects"]);
      const modules = presetModuleConfig({
        dataDir: appRoot,
        blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs-plain") } },
        model: { types },
        features,
        roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "settings.read", "media.read", "news.read", "profile.read", "redirects.read"] },
        bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
        overrides: { "@michaelthielemann/kestrel-persistence-sqlite": { file: ":memory:" } },
      });
      const preset = definePreset({ modules, features, collections: types });
      const config = defineConfig({ modules, triggers: preset.triggers, http: null });
      const kestrel = await boot({ config, modules: presetModules(config.modules), pipelines: preset.pipelines, logger: collectingLogger() });
      try {
        await kestrel.start();
        const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
        const token = login.result !== undefined && typeof login.result === "object" && "token" in login.result ? String(login.result.token) : "";
        const created = await kestrel.run("createNews", { trigger: { kind: "http", name: "POST /news" }, headers: { authorization: `Bearer ${token}` }, body: { title: "Hello", status: "published" } });
        expect(created.status).toBe(200);
        const anonymous = await kestrel.run("listNews", { trigger: { kind: "http", name: "GET /news" } });
        expect(anonymous.status).toBe(200);
        expect(anonymous.result).toEqual({ items: [expect.objectContaining({ title: "Hello", status: "published" })], total: 1 });
        const items: unknown = anonymous.result !== undefined && typeof anonymous.result === "object" && "items" in anonymous.result ? anonymous.result.items : undefined;
        const first: unknown = Array.isArray(items) ? items[0] : undefined;
        expect(typeof first === "object" && first !== null ? Object.keys(first).sort() : []).toEqual(["id", "status", "title"]);
      } finally {
        await kestrel.stop();
      }
    }, 15000);

    describe("a resource whose every read is excluded or kept private", () => {
      const types = {
        settings: { kind: "single", fields: { title: { type: "text" } } },
        redirects: { kind: "single", fields: { rules: { type: "json" } } },
        pages: { kind: "multi", fields: { slug: { type: "slug" }, title: { type: "text" }, body: { type: "json" }, status: { type: "enum", options: ["draft", "published"] } } },
        news: { kind: "multi", fields: { title: { type: "text" }, status: { type: "enum", options: ["draft", "published"] } } },
      } as const;
      const privateNews = {
        listNews: ["authn.requireUser", "authz.require:news.read", "content.list:news"],
        readNews: ["authn.requireUser", "authz.require:news.read", "content.get:news"],
      } as const;
      const publicReads = ["pages.read", "settings.read", "media.read"];

      async function bootPlain(anonymous: string[], preset: { exclude?: string[]; overrides?: Record<string, readonly string[]> }): Promise<void> {
        const features = asFeatures(["redirects"]);
        const modules = presetModuleConfig({
          dataDir: appRoot,
          blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs-private") } },
          model: { types },
          features,
          roles: { roles: { admin: ["*"], editor: ["news.*"] }, anonymous },
          bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
          overrides: { "@michaelthielemann/kestrel-persistence-sqlite": { file: ":memory:" } },
        });
        const composed = definePreset({ modules, features, collections: types, ...(preset.exclude === undefined ? {} : { exclude: preset.exclude }), ...(preset.overrides === undefined ? {} : { overrides: preset.overrides }) });
        const config = defineConfig({ modules, triggers: composed.triggers, http: null });
        const kestrel = await boot({ config, modules: presetModules(config.modules), pipelines: composed.pipelines, logger: collectingLogger() });
        await kestrel.stop();
      }

      it("boots with news reads overridden behind a session, while news.read is not anonymous", async () => {
        await expect(bootPlain(publicReads, { overrides: privateNews })).resolves.toBeUndefined();
      }, 15000);

      it("boots with the news reads excluded, whether or not news.read is anonymous", async () => {
        await expect(bootPlain(publicReads, { exclude: ["listNews", "readNews"] })).resolves.toBeUndefined();
        await expect(bootPlain([...publicReads, "news.read"], { exclude: ["listNews", "readNews"] })).resolves.toBeUndefined();
      }, 15000);

      it("boots with getRedirects excluded under the redirects feature, whether or not redirects.read is anonymous", async () => {
        await expect(bootPlain(publicReads, { exclude: ["getRedirects"] })).resolves.toBeUndefined();
        await expect(bootPlain([...publicReads, "redirects.read"], { exclude: ["getRedirects"] })).resolves.toBeUndefined();
      }, 15000);

      it("boots with every media file route excluded", async () => {
        await expect(bootPlain(publicReads, { exclude: ["downloadMedia", "serveMediaFile"] })).resolves.toBeUndefined();
      }, 15000);

      it("still refuses a news read anonymous callers reach that an override leaves without the cut", async () => {
        const overrides = { listNews: ["authn.identifyUser", "authz.require:news.read", "content.list:news"] };
        await expect(bootPlain([...publicReads, "news.read"], { overrides })).rejects.toThrow('pipeline "listNews" answers anonymous callers but does not end with authz.fields:<resource>?shape=list');
      }, 15000);
    });

    it("boots the playground with the grants the preset derives", async () => {
      await expect(bootPlayground({})).resolves.toBeUndefined();
    }, 15000);
  });

  it("rejects boot with a KestrelBootError naming a mistyped step", async () => {
    const config = defineConfig({ modules: [], triggers: [], http: null });
    const pipelines = [definePipeline({ name: "broken", steps: ["totally.not.a.step"] })];

    await expect(boot({ config, modules: [], pipelines, logger: collectingLogger() })).rejects.toThrow(KestrelBootError);
    await expect(boot({ config, modules: [], pipelines, logger: collectingLogger() })).rejects.toThrow(/totally\.not\.a\.step/);
  });
});
