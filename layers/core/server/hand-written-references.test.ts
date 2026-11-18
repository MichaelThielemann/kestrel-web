import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, toNodeListener } from "h3";
import { boot, effectiveModuleConfig, silentLogger, type Kestrel } from "@michaelthielemann/kestrel";
import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetSchemas, referenceSchemas } from "#kestrel/pipelines";
import type { PresetOptions } from "#kestrel/pipelines";
import { blockSchema } from "../block-schema";
import type { SerializedBlock, SerializedField } from "../app/types/kestrel";

const REFERENCES = "@michaelthielemann/kestrel-references-default";

const field = (type: string, extra: Partial<SerializedField> = {}): SerializedField => ({ type, required: false, unique: false, ...extra });

const blocks: SerializedBlock[] = [
  { name: "hero", fields: { image: field("media"), heading: field("text") } },
  { name: "gallery", fields: { images: field("media", { options: { multiple: true } }) } },
];

function objectField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

type ModuleList = { use: string; config?: unknown }[];

describe("a hand-written module list with the references feature", () => {
  let appRoot = "";
  let kestrel: Kestrel | undefined;
  let server: Server | undefined;
  let base = "";
  let token = "";
  let handWritten: (references: { use: string; config: unknown }) => ModuleList = () => [];
  let presetOptions: Omit<PresetOptions, "modules"> | undefined;

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) };
    const response = await fetch(`${base}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, json: text === "" ? undefined : JSON.parse(text) };
  }

  async function upload(name: string, folder?: string): Promise<string> {
    const form = new FormData();
    if (folder !== undefined) form.append("folder", folder);
    form.append("file", new Blob([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], { type: "application/pdf" }), name);
    const response = await fetch(`${base}/api/media`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    const json: unknown = await response.json();
    expect(response.status).toBe(200);
    return String(objectField(json, "id"));
  }

  async function page(slug: string, body: unknown[] = [], extra: Record<string, unknown> = {}): Promise<string> {
    const created = await call("POST", "/pages", { locale: "de", slug, title: slug, status: "draft", body, ...extra });
    expect(created.status, JSON.stringify(created.json)).toBe(200);
    return String(objectField(created.json, "id"));
  }

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-hand-written-references-"));
    const schemaFile = join(appRoot, "pages.body.json");
    writeFileSync(schemaFile, JSON.stringify(blockSchema(blocks)));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_DATA_DIR = join(appRoot, "data");
    process.env.KESTREL_BLOCK_SCHEMA = schemaFile;
    const { default: playground } = await import("../../../playground/kestrel.config");
    const { contentTypes, features, homeSlug } = await import("../../../playground/shared/model");
    const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
    const { default: fieldTypes } = await import("../../../playground/shared/field-types");
    presetOptions = { features, collections: contentTypes, collectionsUi, fieldTypes, homeSlug };
    const validated = presetSchemas({ features, collections: contentTypes, collectionsUi, fieldTypes });
    handWritten = (references) => playground.modules.map((entry) => {
      if (entry.use === REFERENCES) return references;
      if (entry.use === "@michaelthielemann/kestrel-validate-jsonschema") return { use: entry.use, config: { schemas: validated, watch: true } };
      return { use: entry.use, config: effectiveModuleConfig(entry) };
    });

    const modules = handWritten({
      use: REFERENCES,
      config: { targets: { pages: { content: "pages" }, blog: { content: "blog" }, media: { media: true } }, schemas: referenceSchemas({ features, collections: contentTypes, collectionsUi, fieldTypes }), watch: true },
    });
    const preset = definePreset({ ...presetOptions, modules });
    const config = defineConfig({ modules, triggers: preset.triggers, http: null });
    kestrel = await boot({ config, modules: presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights }), pipelines: preset.pipelines, logger: silentLogger });
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
    await new Promise<void>((resolve) => {
      server?.closeAllConnections();
      server?.close(() => resolve());
    });
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_DATA_DIR;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("refuses to delete a file only a block uses, names the page and keeps the file", async () => {
    const file = await upload("harbour.pdf");
    const id = await page("harbour", [{ type: "hero", props: { image: file, heading: "Harbour" } }]);

    const preview = await call("GET", `/admin/references/to/media?ids=${file}`);
    expect(objectField(preview.json, file)).toEqual([{ type: "pages", field: "body", id, via: "body" }]);

    const refused = await call("DELETE", `/media/${file}`);
    expect(refused.status).toBe(409);
    expect(objectField(refused.json, "error")).toBe(`media/${file} is referenced by pages/${id} (body)`);
    expect((await call("GET", `/media/${file}`)).status).toBe(200);
  });

  it("refuses a file in a multiple media field and still guards a top-level ref field", async () => {
    const [first, second, cover] = await Promise.all(["first.pdf", "second.pdf", "cover.pdf"].map(upload));
    await page("lighthouse", [{ type: "gallery", props: { images: [first, second] } }], { shareImage: cover });
    for (const file of [first, second, cover]) expect((await call("DELETE", `/media/${file}`)).status, file).toBe(409);
  });

  it("deletes a file no page uses", async () => {
    const file = await upload("unused.pdf");
    expect((await call("DELETE", `/media/${file}`)).status).toBe(200);
  });

  it("deletes only the unused files of a mixed selection and names the page for each one a block uses", async () => {
    const [used, spare, alsoUsed, alsoSpare] = await Promise.all(["meadow.pdf", "pebble.pdf", "orchard.pdf", "brook.pdf"].map((name) => upload(name)));
    const id = await page("meadow", [{ type: "hero", props: { image: used, heading: "Meadow" } }, { type: "gallery", props: { images: [alsoUsed] } }]);

    const outcomes = new Map<string, { status: number; json: unknown }>();
    for (const file of [used, spare, alsoUsed, alsoSpare]) outcomes.set(file, await call("DELETE", `/media/${file}`));

    for (const file of [used, alsoUsed]) {
      expect(outcomes.get(file)?.status, file).toBe(409);
      expect(objectField(outcomes.get(file)?.json, "error")).toBe(`media/${file} is referenced by pages/${id} (body)`);
      expect((await call("GET", `/media/${file}`)).status, file).toBe(200);
    }
    for (const file of [spare, alsoSpare]) {
      expect(outcomes.get(file)?.status, file).toBe(200);
      expect((await call("GET", `/media/${file}`)).status, file).toBe(404);
    }
  });

  it("refuses to delete a folder holding a file only a block uses and keeps every file in it", async () => {
    const used = await upload("dune.pdf", "coast");
    const spare = await upload("tide.pdf", "coast");
    await page("dune", [{ type: "hero", props: { image: used, heading: "Dune" } }]);

    const refused = await call("DELETE", "/media/folders/coast?recursive=true");
    expect(refused.status).toBe(409);
    expect(objectField(refused.json, "error")).toBe(`1 media item(s) are still referenced: media/${used}`);
    for (const file of [used, spare]) expect((await call("GET", `/media/${file}`)).status, file).toBe(200);
  });

  it("is refused by definePreset() when the references-default entry has targets but no schemas", () => {
    const modules = handWritten({ use: REFERENCES, config: { targets: { pages: { content: "pages" }, blog: { content: "blog" }, media: { media: true } } } });
    if (presetOptions === undefined) throw new Error("the hand-written list was not set up");
    expect(() => definePreset({ ...presetOptions, modules })).toThrow(/feature "references" needs schemas .*"pages\.body".* in references-default config/);
  });
});
