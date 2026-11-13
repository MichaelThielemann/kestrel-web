import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineEventHandler, toNodeListener } from "h3";
import type { EventHandler } from "h3";
import { defineConfig } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { KestrelHandlers } from "../utils/kestrel-handlers";

const consumer = vi.hoisted(() => {
  const state: { config: unknown; pipelines: unknown[]; modules: unknown[] } = { config: undefined, pipelines: [], modules: [] };
  return state;
});

vi.mock("~~/kestrel.config", () => ({ default: consumer.config }));
vi.mock("~~/shared/collections-ui", () => ({ default: {} }));
vi.mock("~~/shared/model", () => ({ prefixPrimary: false, homeSlug: "home" }));
vi.mock("#kestrel/build-assets", () => ({ default: [] }));
vi.mock("#kestrel/schemas", () => ({ default: { mode: "inline", schemas: {} } }));
vi.mock("#kestrel/consumer-pipelines", () => ({ pipelines: consumer.pipelines }));
vi.mock("#kestrel/consumer-modules", () => ({ default: consumer.modules }));
vi.mock("#kestrel/image-sizes", () => ({ imageSizes: [] }));

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});

async function serve(handler: EventHandler): Promise<string> {
  const app = createApp();
  app.use(handler);
  const server = createServer(toNodeListener(app));
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  cleanups.push(() => new Promise<void>((resolvePromise) => { server.closeAllConnections(); server.close(() => resolvePromise()); }));
  return `http://127.0.0.1:${boundaryCast<AddressInfo>(server.address(), "host").port}`;
}

function routedLikeNitro(nitro: KestrelHandlers): EventHandler {
  return defineEventHandler(async (event) => {
    const handler = event.path.startsWith("/api/") ? await nitro.kestrelHandler : await nitro.publicMediaHandler;
    const response: unknown = await handler(event);
    return response;
  });
}

function recordOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("expected an object");
  return boundaryCast<Record<string, unknown>>(value, "host");
}

describe("the kestrel Nitro plugin", () => {
  it("attaches the API handler for /api and the public media handler for /media/** to the Nitro app", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-nitro-plugin-"));
    cleanups.push(() => rmSync(appRoot, { recursive: true, force: true }));
    const collections = { settings: { kind: "single" as const, fields: { title: { type: "text" } } } };
    const modules = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: { types: collections },
      features: [],
      roles: { roles: { admin: ["*"] }, anonymous: ["media.read"] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules, features: [], collections });
    const config = defineConfig({ modules, triggers: preset.triggers, http: null });
    consumer.config = config;
    consumer.pipelines = [...preset.pipelines];
    consumer.modules = presetModules(config.modules);

    vi.stubGlobal("defineNitroPlugin", (plugin: unknown) => plugin);
    vi.stubGlobal("useRuntimeConfig", () => ({ app: { baseURL: "/", buildAssetsDir: "/_nuxt/", cdnURL: "" }, public: { siteUrl: "" } }));
    const { default: plugin, getKestrel } = await import("./kestrel");

    const closeHooks: (() => Promise<void>)[] = [];
    const nitro = {
      hooks: { hook: (name: string, fn: () => Promise<void>) => { if (name === "close") closeHooks.push(fn); } },
      localFetch: () => Promise.reject(new Error("not rendering in this test")),
    };
    plugin(boundaryCast<Parameters<typeof plugin>[0]>(nitro, "host"));
    cleanups.push(async () => { for (const close of closeHooks) await close(); });

    const kestrel = await getKestrel();
    const login = recordOf((await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } })).result);
    const upload = recordOf((await kestrel.run("uploadMedia", {
      trigger: { kind: "http", name: "POST /media" },
      headers: { authorization: `Bearer ${String(login.token)}` },
      files: [{ field: "file", filename: "a.png", contentType: "image/png", data: new Uint8Array([1, 2, 3, 4]) }],
    })).result);
    const id = String(upload.id);
    const path = String(upload.path);

    const base = await serve(routedLikeNitro(boundaryCast<KestrelHandlers>(nitro, "host")));

    expect((await fetch(`${base}${path}`)).status).toBe(200);
    expect((await fetch(`${base}/media/${id}`)).status).toBe(404);
    const apiItem = await fetch(`${base}/api/media/${id}`);
    expect(apiItem.status).toBe(200);
    expect(await apiItem.json()).toMatchObject({ id, path });
  }, 20000);
});
