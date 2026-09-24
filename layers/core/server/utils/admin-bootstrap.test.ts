import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, defineConfig, type Kestrel } from "@michaelthielemann/kestrel";
import insights from "@michaelthielemann/kestrel-insights";
import persistenceSqlite from "@michaelthielemann/kestrel-persistence-sqlite";
import replicationSqlite from "@michaelthielemann/kestrel-replication-sqlite";
import { presetModules } from "#kestrel/modules";
import { definePreset } from "#kestrel/pipelines";
import { contentTypes, features } from "../../../../playground/shared/model";
import collectionsUi from "../../../../playground/shared/collections-ui";
import fieldTypes from "../../../../playground/shared/field-types";
import { adminBootstrapProblem, assertAdminBootstrapRoutes, bootWithAdminBootstrapCheck } from "./admin-bootstrap";

const FIXED = [
  { method: "POST", path: "/login", pipeline: "login" },
  { method: "POST", path: "/logout", pipeline: "logout" },
  { method: "GET", path: "/me", pipeline: "me" },
];

describe("adminBootstrapProblem", () => {
  it("accepts a trigger table with all three bootstrap routes at their fixed path", () => {
    expect(adminBootstrapProblem(FIXED)).toBeUndefined();
  });

  it("reports login bound to another path", () => {
    const http = [{ method: "POST", path: "/signin", pipeline: "login" }, ...FIXED.slice(1)];
    expect(adminBootstrapProblem(http)).toBe(
      'admin: pipeline "login" must be reachable at "POST /login" (found: "POST /signin") – the admin calls it before it can read its capabilities',
    );
  });

  it("reports an excluded login", () => {
    const http = FIXED.slice(1);
    expect(adminBootstrapProblem(http)).toBe(
      'admin: pipeline "login" must be reachable at "POST /login" (found: none) – the admin calls it before it can read its capabilities',
    );
  });

  it("accepts an alias next to the fixed route", () => {
    const http = [...FIXED, { method: "POST", path: "/auth/login", pipeline: "login" }];
    expect(adminBootstrapProblem(http)).toBeUndefined();
  });

  it("reports the first missing pipeline in login, logout, me order", () => {
    const http = [{ method: "POST", path: "/login", pipeline: "login" }];
    expect(adminBootstrapProblem(http)).toContain('pipeline "logout"');
  });
});

describe("assertAdminBootstrapRoutes against a real boot", () => {
  let appRoot: string;
  let kestrel: Kestrel;

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-admin-bootstrap-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../../pipelines/__fixtures__/pages.body.json", import.meta.url));

    const { default: config } = await import("../../../../playground/kestrel.config");
    const preset = definePreset({ modules: config.modules, features, collections: contentTypes, collectionsUi, fieldTypes });
    const rerouted = preset.triggers.filter((trigger) => !("http" in trigger) || trigger.pipeline !== "login");
    rerouted.push({ http: "POST /signin", pipeline: "login" });

    const modules = presetModules(config.modules, {
      "@michaelthielemann/kestrel-insights": insights,
      "@michaelthielemann/kestrel-replication-sqlite": replicationSqlite,
      "@michaelthielemann/kestrel-persistence-sqlite": persistenceSqlite,
    });
    kestrel = await boot({ config: defineConfig({ modules: config.modules, triggers: rerouted, http: null }), modules, pipelines: preset.pipelines });
    await kestrel.start();
  }, 20000);

  afterAll(async () => {
    await kestrel.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("throws the boot-failure message when a consumer's trigger list moves login off its fixed route", () => {
    expect(() => assertAdminBootstrapRoutes(kestrel)).toThrow(
      'admin: pipeline "login" must be reachable at "POST /login" (found: "POST /signin") – the admin calls it before it can read its capabilities',
    );
  });
});

describe("bootWithAdminBootstrapCheck, the call getKestrel() makes", () => {
  let appRoot: string;

  beforeAll(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-admin-bootstrap-combined-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../../pipelines/__fixtures__/pages.body.json", import.meta.url));
  });

  afterAll(() => {
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("rejects with the boot-failure message in one call, so getKestrel() cannot get a Kestrel instance without passing the check", async () => {
    const { default: config } = await import("../../../../playground/kestrel.config");
    const preset = definePreset({ modules: config.modules, features, collections: contentTypes, collectionsUi, fieldTypes });
    const rerouted = preset.triggers.filter((trigger) => !("http" in trigger) || trigger.pipeline !== "login");
    rerouted.push({ http: "POST /signin", pipeline: "login" });

    const modules = presetModules(config.modules, {
      "@michaelthielemann/kestrel-insights": insights,
      "@michaelthielemann/kestrel-replication-sqlite": replicationSqlite,
      "@michaelthielemann/kestrel-persistence-sqlite": persistenceSqlite,
    });

    await expect(
      bootWithAdminBootstrapCheck({ config: defineConfig({ modules: config.modules, triggers: rerouted, http: null }), modules, pipelines: preset.pipelines }),
    ).rejects.toThrow(
      'admin: pipeline "login" must be reachable at "POST /login" (found: "POST /signin") – the admin calls it before it can read its capabilities',
    );
  }, 20000);
});
