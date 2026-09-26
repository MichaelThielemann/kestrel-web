import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, toNodeListener } from "h3";
import { boot, defineConfig, silentLogger, type Kestrel } from "@michaelthielemann/kestrel";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { CollectionModel, Feature } from "#kestrel/pipelines";
import { blockSchema } from "../block-schema";
import fieldTypes from "../../../playground/shared/field-types";
import { contentModel, contentTypes } from "../../../playground/shared/model";

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

function objectField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

describe("references of a collection that is not mounted, over HTTP", () => {
  let appRoot = "";
  let kestrel: Kestrel | undefined;
  let server: Server | undefined;
  let base = "";
  let token = "";

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) };
    const response = await fetch(`${base}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, json: text === "" ? undefined : JSON.parse(text) };
  }

  async function create(collection: string, body: Record<string, unknown>): Promise<string> {
    const created = await call("POST", `/${collection}`, body);
    expect(created.status, JSON.stringify(created.json)).toBe(200);
    return String(objectField(created.json, "id"));
  }

  const page = (slug: string, body: unknown[] = []) => create("pages", { locale: "de", slug, title: slug, status: "draft", body });
  const internal = (id: string) => [{ type: "internal", collection: "pages", id }];

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-collection-references-"));
    const schemaFile = join(appRoot, "pages.body.json");
    writeFileSync(schemaFile, JSON.stringify(blockSchema([{ name: "byline", fields: { writer: { type: "relation", required: false, unique: false, relation: { collection: "authors", many: false } } } }])));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = schemaFile;
    const authors: CollectionModel = { kind: "multi", fields: { name: { type: "text", required: true }, links: { type: "json" } } };
    const types: Record<string, CollectionModel> = { ...contentTypes, authors };
    const features: Feature[] = ["references"];
    const modules = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: { ...contentModel, types },
      features,
      fieldTypes,
      roles: { roles: { admin: ["*"] }, anonymous: [] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules, features, collections: types, fieldTypes });
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
    token = String(objectField(await login.json(), "token"));
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

  it("refuses to delete an author a block's relation field points to", async () => {
    const author = await create("authors", { name: "A. Writer" });
    const id = await page("with-byline", [{ type: "byline", props: { writer: author } }]);
    const refused = await call("DELETE", `/authors/${author}`);
    expect(refused.status).toBe(409);
    expect(objectField(refused.json, "error")).toBe(`authors/${author} is referenced by pages/${id} (body)`);
    expect(objectField((await call("GET", `/admin/references/to/authors?ids=${author}`)).json, author)).toEqual([{ type: "pages", field: "body", id, via: "body" }]);
  });

  it("re-indexes an author on update, so a link it dropped no longer blocks the page", async () => {
    const target = await page("linked-from-author");
    const author = await create("authors", { name: "B. Writer", links: internal(target) });
    expect((await call("DELETE", `/pages/${target}`)).status).toBe(409);
    expect((await call("PATCH", `/authors/${author}`, { links: [] })).status).toBe(200);
    expect((await call("DELETE", `/pages/${target}`)).status).toBe(200);
  });

  it("drops a deleted author's references, so they block nothing afterwards", async () => {
    const target = await page("linked-from-deleted-author");
    const author = await create("authors", { name: "C. Writer", links: internal(target) });
    expect((await call("DELETE", `/pages/${target}`)).status).toBe(409);
    expect((await call("DELETE", `/authors/${author}`)).status).toBe(200);
    expect((await call("DELETE", `/pages/${target}`)).status).toBe(200);
  });
});
