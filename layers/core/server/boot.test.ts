import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, defineConfig, definePipeline, isOk, KestrelBootError, type Logger } from "@michaelthielemann/kestrel";
import { PERSISTENCE } from "@michaelthielemann/kestrel-contracts/persistence";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
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
        const modules = presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights });
        const logger = collectingLogger();

        const kestrel = await boot({ config: { ...config, http: null }, modules, pipelines: preset.pipelines, logger });
        expect(kestrel.pipelines.size).toBe(preset.pipelines.length);
        expect(logger.entries.filter((entry) => entry.level !== "info")).toEqual([]);

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
          anonymous: [],
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

      try {
        await kestrel.start();
      } finally {
        await kestrel.stop();
      }
    }, 10000);
  });

  it("rejects boot with a KestrelBootError naming a mistyped step", async () => {
    const config = defineConfig({ modules: [], triggers: [], http: null });
    const pipelines = [definePipeline({ name: "broken", steps: ["totally.not.a.step"] })];

    await expect(boot({ config, modules: [], pipelines, logger: collectingLogger() })).rejects.toThrow(KestrelBootError);
    await expect(boot({ config, modules: [], pipelines, logger: collectingLogger() })).rejects.toThrow(/totally\.not\.a\.step/);
  });
});
