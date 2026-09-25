import { mkdtempSync, rmSync } from "node:fs";
import { Server } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineConfig } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";

const consumer = vi.hoisted(() => {
  const state: { config: unknown; pipelines: unknown[]; modules: unknown[]; collectionsUi: unknown } = { config: undefined, pipelines: [], modules: [], collectionsUi: {} };
  return state;
});

vi.mock("~~/kestrel.config", () => ({ default: consumer.config }));
vi.mock("~~/shared/collections-ui", () => ({ default: consumer.collectionsUi }));
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

describe("the kestrel Nitro plugin's status-filter check", () => {
  it("throws before starting crons or the HTTP listener when a workflow never reached the pipelines that were composed", async () => {
    const listenSpy = vi.spyOn(Server.prototype, "listen");
    cleanups.push(() => listenSpy.mockRestore());
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    cleanups.push(() => exitSpy.mockRestore());

    const appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-status-filter-order-"));
    cleanups.push(() => rmSync(appRoot, { recursive: true, force: true }));
    const collections = {
      settings: { kind: "single" as const, fields: { title: { type: "text" } } },
      news: { kind: "multi" as const, fields: { slug: { type: "slug" }, title: { type: "text" }, status: { type: "enum", options: ["pending", "live"] } } },
    };
    const modules = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: { types: collections },
      features: [],
      roles: { roles: { admin: ["*"] }, anonymous: ["news.read"] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules, features: [], collections });
    const config = defineConfig({ modules, triggers: preset.triggers, http: { port: 0 } });
    consumer.config = config;
    consumer.pipelines = [...preset.pipelines];
    consumer.modules = presetModules(config.modules);
    consumer.collectionsUi = { news: { workflow: { field: "status", live: "live", draft: "pending" } } };

    vi.stubGlobal("defineNitroPlugin", (plugin: unknown) => plugin);
    vi.stubGlobal("useRuntimeConfig", () => ({ app: { baseURL: "/", buildAssetsDir: "/_nuxt/", cdnURL: "" } }));
    const { default: plugin, getKestrel } = await import("./kestrel");

    const closeHooks: (() => Promise<void>)[] = [];
    const nitro = {
      hooks: { hook: (name: string, fn: () => Promise<void>) => { if (name === "close") closeHooks.push(fn); } },
      localFetch: () => Promise.reject(new Error("not rendering in this test")),
    };
    plugin(boundaryCast<Parameters<typeof plugin>[0]>(nitro, "host"));
    cleanups.push(async () => { for (const close of closeHooks) await close(); });

    await expect(getKestrel()).rejects.toThrow(/status/);
    expect(listenSpy).not.toHaveBeenCalled();
  }, 20000);
});
