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
import { contentTypes, defaultLocale, features, locales, prefixPrimary } from "../../../playground/shared/model";
import collectionsUi from "../../../playground/shared/collections-ui";
import fieldTypes from "../../../playground/shared/field-types";
import { customFieldTypes } from "../collections-ui";
import { buildCapabilities } from "./utils/admin-capabilities";
import { schemaFromRun } from "./utils/admin-schema";

const customTypes = customFieldTypes(contentTypes, fieldTypes);

function schemaSources(triggers: readonly { method: string; path: string; pipeline: string }[]) {
  return { collectionsUi, features, prefixPrimary, locales, defaultLocale, customTypes, triggers };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function tokenOf(result: unknown): string {
  const token = isRecord(result) ? result.token : undefined;
  if (typeof token !== "string") throw new Error(`expected a login result with a string token, got ${JSON.stringify(result)}`);
  return token;
}

describe("adminSchemaModel run to admin schema", () => {
  let appRoot: string;
  let kestrel: Kestrel;
  let adminToken: string;

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-capabilities-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));

    const { default: config, preset } = await import("../../../playground/kestrel.config");
    const modules = presetModules(config.modules, {
      "@michaelthielemann/kestrel-insights": insights,
      "@michaelthielemann/kestrel-replication-sqlite": replicationSqlite,
      "@michaelthielemann/kestrel-persistence-sqlite": persistenceSqlite,
    });
    kestrel = await boot({ config: { ...config, http: null }, modules, pipelines: preset.pipelines });
    await kestrel.start();

    const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
    if (login.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(login)}`);
    adminToken = tokenOf(login.result);
  }, 20000);

  afterAll(async () => {
    await kestrel.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("names every capability the admin bootstrap user is not denied, none as denied", async () => {
    const run = await kestrel.run("adminSchemaModel", {
      trigger: { kind: "http", name: "GET /admin/schema" },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(run.status).toBe(200);
    const triggers = kestrel.describe().triggers.http;
    const schema = schemaFromRun(run, schemaSources(triggers));
    if (schema.status !== 200) throw new Error(`unexpected schema error: ${JSON.stringify(schema.body)}`);
    expect(schema.body.capabilities.deleteUser).toEqual({ method: "DELETE", path: "/users/:id" });
    expect(schema.body.capabilities.listUsers).toEqual({ method: "GET", path: "/users" });
    expect(schema.body.capabilities.changePassword).toEqual({ method: "POST", path: "/me/password" });
    const pages = schema.body.collections.find((collection) => collection.name === "pages");
    expect(pages?.capabilities.update).toEqual({ method: "PATCH", path: "/pages/:id" });
    expect(pages?.capabilities.delete).toEqual({ method: "DELETE", path: "/pages/:id" });
  });

  it("gives a caller no capability whose authz.require permission its roles lack, and keeps what they do have", async () => {
    const createEditor = await kestrel.run("createUser", {
      trigger: { kind: "http", name: "POST /users" },
      headers: { authorization: `Bearer ${adminToken}` },
      body: { username: "author", password: "change-me-too", roles: ["editor"] },
    });
    expect(createEditor.status).toBe(200);

    const editorLogin = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "author", password: "change-me-too" } });
    expect(editorLogin.status).toBe(200);
    const editorToken = tokenOf(editorLogin.result);

    const run = await kestrel.run("adminSchemaModel", {
      trigger: { kind: "http", name: "GET /admin/schema" },
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(run.status).toBe(200);
    const triggers = kestrel.describe().triggers.http;
    const schema = schemaFromRun(run, schemaSources(triggers));
    if (schema.status !== 200) throw new Error(`unexpected schema error: ${JSON.stringify(schema.body)}`);

    expect(schema.body.capabilities.listUsers).toBeUndefined();
    expect(schema.body.capabilities.deleteUser).toBeUndefined();
    expect(schema.body.capabilities.replicationStatus).toBeUndefined();
    expect(schema.body.capabilities.changePassword).toEqual({ method: "POST", path: "/me/password" });
    expect(schema.body.capabilities.setMediaFraming).toEqual({ method: "PUT", path: "/media/:id/framing" });
    expect(schema.body.capabilities.syncImages).toBeUndefined();

    const pages = schema.body.collections.find((collection) => collection.name === "pages");
    expect(pages?.capabilities.update).toEqual({ method: "PATCH", path: "/pages/:id" });
  });
});

describe("buildAdminSchema capability placement, composed from a real preset", () => {
  function bootedTriggers(overrides: Parameters<typeof definePreset>[0]["overrides"], exclude?: readonly string[]) {
    const preset = definePreset({
      modules: [
        { use: "@michaelthielemann/kestrel-authn-multi" },
        { use: "@michaelthielemann/kestrel-authz-roles" },
        { use: "@michaelthielemann/kestrel-content-default" },
        { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
        { use: "@michaelthielemann/kestrel-media-default" },
        { use: "@michaelthielemann/kestrel-events-inmemory" },
        { use: "@michaelthielemann/kestrel-events-direct" },
      ],
      features: [],
      overrides,
      exclude,
    });
    return preset.triggers.filter((trigger): trigger is { http: string; pipeline: string } => "http" in trigger).map((trigger) => {
      const [method, path] = trigger.http.split(" ");
      return { method: method ?? "", path: path ?? "", pipeline: trigger.pipeline };
    });
  }

  it("leaves deleteUser out of the schema when the preset excludes it", () => {
    const triggers = bootedTriggers(undefined, ["deleteUser"]);
    const { global } = buildCapabilities({ triggers, access: {}, verbs: {} });
    expect(global.deleteUser).toBeUndefined();
    expect(global.listUsers).toBeDefined();
  });

  it("reports deleteUser at the path a consumer trigger list gives it", () => {
    const preset = definePreset({
      modules: [
        { use: "@michaelthielemann/kestrel-authn-multi" },
        { use: "@michaelthielemann/kestrel-authz-roles" },
        { use: "@michaelthielemann/kestrel-content-default" },
        { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
        { use: "@michaelthielemann/kestrel-media-default" },
        { use: "@michaelthielemann/kestrel-events-inmemory" },
        { use: "@michaelthielemann/kestrel-events-direct" },
      ],
      features: [],
    });
    const moved = preset.triggers.filter((trigger) => !("http" in trigger) || trigger.pipeline !== "deleteUser");
    const rerouted = [...moved, { http: "POST /staff/:id/remove", pipeline: "deleteUser" }];
    const triggers = rerouted.filter((trigger): trigger is { http: string; pipeline: string } => "http" in trigger).map((trigger) => {
      const [method, path] = trigger.http.split(" ");
      return { method: method ?? "", path: path ?? "", pipeline: trigger.pipeline };
    });
    const { global } = buildCapabilities({ triggers, access: {}, verbs: {} });
    expect(global.deleteUser).toEqual({ method: "POST", path: "/staff/:id/remove" });
  });

  it("keeps a pipeline whose override has no authz.require step", () => {
    const triggers = bootedTriggers({ listUsers: ["authn.requireUser", "authz.requireRole", "authn.listUsers"] });
    const { global } = buildCapabilities({ triggers, access: { listUsers: "unknown" }, verbs: {} });
    expect(global.listUsers).toEqual({ method: "GET", path: "/users" });
  });

  it("keeps changePassword for every signed-in caller", () => {
    const triggers = bootedTriggers(undefined);
    const { global } = buildCapabilities({ triggers, access: { changePassword: "unknown" }, verbs: {} });
    expect(global.changePassword).toEqual({ method: "POST", path: "/me/password" });
  });
});

describe("kestrel.describe() on a real boot with a customized trigger table", () => {
  let appRoot: string;
  let kestrel: Kestrel;
  let adminToken: string;
  let editorToken: string;

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-capabilities-boot-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));

    const { default: config } = await import("../../../playground/kestrel.config");
    const preset = definePreset({
      modules: config.modules,
      features,
      collections: contentTypes,
      collectionsUi,
      fieldTypes,
      exclude: ["deleteUser"],
      overrides: { listUsers: ["authn.requireUser", "authz.requireRole", "authn.listUsers"] },
    });
    const rerouted = preset.triggers.filter((trigger) => !("http" in trigger) || trigger.pipeline !== "listUsers");
    rerouted.push({ http: "GET /staff/directory", pipeline: "listUsers" });

    const modules = presetModules(config.modules, {
      "@michaelthielemann/kestrel-insights": insights,
      "@michaelthielemann/kestrel-replication-sqlite": replicationSqlite,
      "@michaelthielemann/kestrel-persistence-sqlite": persistenceSqlite,
    });
    kestrel = await boot({ config: defineConfig({ modules: config.modules, triggers: rerouted, http: null }), modules, pipelines: preset.pipelines });
    await kestrel.start();

    const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
    if (login.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(login)}`);
    adminToken = tokenOf(login.result);

    const createEditor = await kestrel.run("createUser", {
      trigger: { kind: "http", name: "POST /users" },
      headers: { authorization: `Bearer ${adminToken}` },
      body: { username: "boot-editor", password: "change-me-too", roles: ["editor"] },
    });
    if (createEditor.status !== 200) throw new Error(`editor creation failed: ${JSON.stringify(createEditor)}`);
    const editorLogin = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "boot-editor", password: "change-me-too" } });
    if (editorLogin.status !== 200) throw new Error(`editor login failed: ${JSON.stringify(editorLogin)}`);
    editorToken = tokenOf(editorLogin.result);
  }, 20000);

  afterAll(async () => {
    await kestrel.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("omits an excluded pipeline's trigger from the booted descriptor", () => {
    const http = kestrel.describe().triggers.http;
    expect(http.some((trigger) => trigger.pipeline === "deleteUser")).toBe(false);
  });

  it("reports a pipeline at the path a consumer's own trigger list gives it, not the preset default", () => {
    const http = kestrel.describe().triggers.http;
    expect(http.find((trigger) => trigger.pipeline === "listUsers")).toEqual({ method: "GET", path: "/staff/directory", pipeline: "listUsers" });
  });

  it("carries both the exclude and the reroute through to the admin schema's capabilities", async () => {
    const run = await kestrel.run("adminSchemaModel", {
      trigger: { kind: "http", name: "GET /admin/schema" },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(run.status).toBe(200);
    const schema = schemaFromRun(run, schemaSources(kestrel.describe().triggers.http));
    if (schema.status !== 200) throw new Error(`unexpected schema error: ${JSON.stringify(schema.body)}`);
    expect(schema.body.capabilities.deleteUser).toBeUndefined();
    expect(schema.body.capabilities.listUsers).toEqual({ method: "GET", path: "/staff/directory" });
  });

  it("keeps listUsers present for an editor once the override drops its authz.require step", async () => {
    const run = await kestrel.run("adminSchemaModel", {
      trigger: { kind: "http", name: "GET /admin/schema" },
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(run.status).toBe(200);
    const schema = schemaFromRun(run, schemaSources(kestrel.describe().triggers.http));
    if (schema.status !== 200) throw new Error(`unexpected schema error: ${JSON.stringify(schema.body)}`);
    expect(schema.body.capabilities.listUsers).toEqual({ method: "GET", path: "/staff/directory" });
  });
});
