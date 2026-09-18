import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, defineConfig, definePipeline, isOk, KestrelBootError, type Logger } from "@michaelthielemann/kestrel";
import { PERSISTENCE } from "@michaelthielemann/kestrel-contracts/persistence";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
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

  it("rejects boot with a KestrelBootError naming a mistyped step", async () => {
    const config = defineConfig({ modules: [], triggers: [], http: null });
    const pipelines = [definePipeline({ name: "broken", steps: ["totally.not.a.step"] })];

    await expect(boot({ config, modules: [], pipelines, logger: collectingLogger() })).rejects.toThrow(KestrelBootError);
    await expect(boot({ config, modules: [], pipelines, logger: collectingLogger() })).rejects.toThrow(/totally\.not\.a\.step/);
  });
});
