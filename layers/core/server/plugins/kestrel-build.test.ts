import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineConfig } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { PERSISTENCE } from "@michaelthielemann/kestrel-contracts/persistence";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";

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

describe("the kestrel Nitro plugin with static delivery", () => {
  it("marks every published page for a re-render once after start when the build changed, and stores the build", async () => {
    const appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-nitro-build-"));
    cleanups.push(() => rmSync(appRoot, { recursive: true, force: true }));
    process.env.KESTREL_BLOCK_SCHEMA = resolve(appRoot, "pages.body.json");
    cleanups.push(() => { delete process.env.KESTREL_BLOCK_SCHEMA; });
    writeFileSync(process.env.KESTREL_BLOCK_SCHEMA, JSON.stringify({ type: "array" }));
    const collections = {
      settings: { kind: "single" as const, fields: { title: { type: "text" } } },
      pages: { kind: "multi" as const, fields: { slug: { type: "slug" }, title: { type: "text" }, body: { type: "json" }, status: { type: "enum", options: ["draft", "published"] } } },
    };
    const features = ["delivery", "sanitizeSvg"] as const;
    const modules = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: { types: collections },
      features,
      roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "settings.read", "media.read"] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules, features, collections });
    const config = defineConfig({ modules, triggers: preset.triggers, http: null });
    consumer.config = config;
    consumer.pipelines = [...preset.pipelines];
    consumer.modules = presetModules(config.modules);

    vi.stubGlobal("defineNitroPlugin", (plugin: unknown) => plugin);
    vi.stubGlobal("useRuntimeConfig", () => ({ app: { baseURL: "/", buildAssetsDir: "/_nuxt/", cdnURL: "", buildId: "build-2026-09" } }));
    const { default: plugin, getKestrel } = await import("./kestrel");
    const closeHooks: (() => Promise<void>)[] = [];
    plugin(boundaryCast<Parameters<typeof plugin>[0]>({
      hooks: { hook: (name: string, fn: () => Promise<void>) => { if (name === "close") closeHooks.push(fn); } },
      localFetch: () => Promise.reject(new Error("not rendering in this test")),
    }, "host"));
    cleanups.push(async () => { for (const close of closeHooks) await close(); });

    const kestrel = await getKestrel();
    const persistence = kestrel.contracts.find(PERSISTENCE);
    if (persistence === undefined) throw new Error("expected persistence@1");
    const stored = await persistence.findOne("delivery_state", { id: "build" });
    expect(stored).toMatchObject({ ok: true, value: { value: "build-2026-09" } });
  }, 20000);
});
