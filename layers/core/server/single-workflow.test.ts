import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, toNodeListener } from "h3";
import { boot, defineConfig, silentLogger, type Kestrel } from "@michaelthielemann/kestrel";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { CollectionModel } from "#kestrel/pipelines";
import fieldTypes from "../../../playground/shared/field-types";
import { contentModel, contentTypes } from "../../../playground/shared/model";

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

describe("a single collection with a publish workflow, over HTTP", () => {
  let appRoot = "";
  let kestrel: Kestrel | undefined;
  let server: Server | undefined;
  let base = "";
  let token = "";

  async function call(method: string, path: string, auth: boolean, body?: unknown): Promise<{ status: number; text: string }> {
    const headers: Record<string, string> = { ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) };
    const response = await fetch(`${base}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, text: await response.text() };
  }

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-single-workflow-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    const notice: CollectionModel = { kind: "single", fields: { title: { type: "text" }, message: { type: "text" }, status: { type: "enum", options: ["draft", "finished", "published"] } } };
    const types: Record<string, CollectionModel> = { ...contentTypes, notice };
    const modules = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: { ...contentModel, types },
      features: [],
      fieldTypes,
      roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "blog.read", "settings.read", "notice.read"] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules, features: [], collections: types, fieldTypes });
    const config = defineConfig({ modules, triggers: preset.triggers, http: null });
    kestrel = await boot({ config, modules: presetModules(config.modules), pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.start();
    const app = createApp();
    app.use(createKestrelHandler(kestrel, { mountPath: "/api" }));
    server = createServer(toNodeListener(app));
    await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
    const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "change-me" }) });
    const answer: unknown = await login.json();
    token = String(typeof answer === "object" && answer !== null ? Reflect.get(answer, "token") : "");
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((done) => {
      server?.closeAllConnections();
      server?.close(() => done());
    });
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("keeps a draft from anonymous callers, lets the admin read and edit it, and serves it once published", async () => {
    expect((await call("PUT", "/notice", true, { title: "Opening", message: "Doors open at nine", status: "draft" })).status).toBe(200);

    const anonymousDraft = await call("GET", "/notice", false);
    expect(anonymousDraft.status).toBe(404);
    expect(anonymousDraft.text).not.toContain("Doors open at nine");

    const adminDraft = await call("GET", "/admin/notice", true);
    expect(adminDraft.status).toBe(200);
    expect(adminDraft.text).toContain("Doors open at nine");

    expect((await call("PUT", "/notice", true, { title: "Opening", message: "Doors open at ten", status: "draft" })).status).toBe(200);
    expect((await call("GET", "/admin/notice", true)).text).toContain("Doors open at ten");
    expect((await call("GET", "/notice", false)).status).toBe(404);

    expect((await call("PUT", "/notice", true, { title: "Opening", message: "Doors open at ten", status: "published" })).status).toBe(200);
    const published = await call("GET", "/notice", false);
    expect(published.status).toBe(200);
    expect(published.text).toContain("Doors open at ten");
  });

  it("refuses the admin read to an anonymous caller", async () => {
    expect((await call("GET", "/admin/notice", false)).status).toBe(401);
  });
});
