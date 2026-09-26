import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, toNodeListener } from "h3";
import { boot, silentLogger, type Kestrel } from "@michaelthielemann/kestrel";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
import { blockSchema } from "../block-schema";
import type { SerializedBlock, SerializedField } from "../app/types/kestrel";

const field = (type: string, extra: Partial<SerializedField> = {}): SerializedField => ({ type, required: false, unique: false, ...extra });

const blocks: SerializedBlock[] = [
  { name: "picture", fields: { image: field("media"), caption: field("text") } },
  { name: "gallery", fields: { images: field("media", { options: { multiple: true } }) } },
  { name: "slides", fields: { items: field("repeater", { options: { fields: { picture: field("media") } } }) } },
  { name: "columns", fields: {}, slots: ["left"] },
  { name: "teaser", fields: { target: field("relation", { relation: { collection: "pages", many: false } }), more: field("relation", { relation: { collection: "pages", many: true } }) } },
  { name: "prose", fields: { text: field("richtext") } },
];

function objectField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

describe("deleting what a content block still uses, over HTTP", () => {
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

  async function upload(name: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], { type: "application/pdf" }), name);
    const response = await fetch(`${base}/api/media`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    const json: unknown = await response.json();
    expect(response.status).toBe(200);
    return String(objectField(json, "id"));
  }

  async function page(slug: string, body: unknown[] = []): Promise<string> {
    const created = await call("POST", "/pages", { locale: "de", slug, title: slug, status: "draft", body });
    expect(created.status, JSON.stringify(created.json)).toBe(200);
    return String(objectField(created.json, "id"));
  }

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-block-references-"));
    const schemaFile = join(appRoot, "pages.body.json");
    writeFileSync(schemaFile, JSON.stringify(blockSchema(blocks)));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_DATA_DIR = join(appRoot, "data");
    process.env.KESTREL_BLOCK_SCHEMA = schemaFile;
    const { default: playground, preset } = await import("../../../playground/kestrel.config");
    const modules = presetModules(playground.modules, { "@michaelthielemann/kestrel-insights": insights });
    kestrel = await boot({ config: playground, modules, pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.start();
    const app = createApp();
    app.use(createKestrelHandler(kestrel, { mountPath: "/api" }));
    server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
    const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "change-me" }) });
    token = String(objectField(await login.json(), "token"));
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_DATA_DIR;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("refuses to delete a file used only by a block's media field, naming the page", async () => {
    const file = await upload("single.pdf");
    const id = await page("single-image", [{ type: "picture", props: { image: file, caption: "A caption" } }]);

    const refused = await call("DELETE", `/media/${file}`);
    expect(refused.status).toBe(409);
    expect(objectField(refused.json, "error")).toBe(`media/${file} is referenced by pages/${id} (body)`);

    const preview = await call("GET", `/admin/references/to/media?ids=${file}`);
    expect(objectField(preview.json, file)).toEqual([{ type: "pages", field: "body", id, via: "body" }]);
  });

  it("refuses for a multiple media field, a repeater and a block nested in a slot", async () => {
    const [first, second, slide, nested] = await Promise.all(["first.pdf", "second.pdf", "slide.pdf", "nested.pdf"].map(upload));
    await page("many-images", [
      { type: "gallery", props: { images: [first, second] } },
      { type: "slides", props: { items: [{ picture: slide }] } },
      { type: "columns", props: {}, slots: { left: [{ type: "columns", props: {}, slots: { left: [{ type: "picture", props: { image: nested } }] } }] } },
    ]);
    for (const file of [first, second, slide, nested]) expect((await call("DELETE", `/media/${file}`)).status, file).toBe(409);
  });

  it("deletes a file once no block uses it any more", async () => {
    const file = await upload("released.pdf");
    const id = await page("released", [{ type: "picture", props: { image: file } }]);
    expect((await call("DELETE", `/media/${file}`)).status).toBe(409);
    expect((await call("PATCH", `/pages/${id}`, { locale: "de", body: [] })).status).toBe(200);
    expect((await call("DELETE", `/media/${file}`)).status).toBe(200);
  });

  it("refuses to delete a page a block's relation field or a rich-text link points to", async () => {
    const single = await page("teased");
    const listed = await page("listed");
    const linked = await page("linked");
    await page("teaser", [
      { type: "teaser", props: { target: single, more: [listed] } },
      { type: "prose", props: { text: `<p><a href="kestrel:pages:${linked}">read on</a></p>` } },
    ]);
    for (const id of [single, listed, linked]) expect((await call("DELETE", `/pages/${id}`)).status, id).toBe(409);
  });

  it("keeps block references when the index is rebuilt", async () => {
    const file = await upload("rebuilt.pdf");
    await page("rebuilt", [{ type: "picture", props: { image: file } }]);
    const rebuilt = await call("POST", "/admin/references/rebuild");
    expect(rebuilt.status).toBe(200);
    expect(objectField(rebuilt.json, "entries")).toBeGreaterThan(0);
    expect((await call("DELETE", `/media/${file}`)).status).toBe(409);
  });
});
