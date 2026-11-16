import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp, defineEventHandler, toNodeListener, type EventHandler } from "h3";
import { boot, defineConfig, silentLogger, type Kestrel } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { Feature } from "#kestrel/pipelines";
import { kestrelHandlers, type KestrelHandlers } from "./utils/kestrel-handlers";
import fieldTypes from "../../../playground/shared/field-types";
import { contentModel, contentTypes } from "../../../playground/shared/model";

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";
const OPEN_POLICY = { trustProxy: false, proxyHops: 1, trustedHeader: "", trustedProxies: [] };
const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.example.test/</loc></url></urlset>\n';
const ROBOTS = "User-agent: *\nAllow: /\n\nSitemap: https://www.example.test/sitemap.xml\n";
const LLMS = "# Example – Grüße\n\n> A site.\n";

const roots: string[] = [];
let close: (() => Promise<void>) | undefined;

beforeAll(() => {
  process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
});

afterEach(async () => {
  await close?.();
  close = undefined;
});

afterAll(() => {
  delete process.env.KESTREL_BLOCK_SCHEMA;
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function serve(handler: EventHandler): Promise<string> {
  const app = createApp();
  app.use(handler);
  const server = createServer(toNodeListener(app));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  close = () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); });
  return `http://127.0.0.1:${boundaryCast<AddressInfo>(server.address(), "host").port}`;
}

async function bootSite(features: Feature[]): Promise<{ kestrel: Kestrel; blobs: string }> {
  const appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-index-files-"));
  roots.push(appRoot);
  const blobs = resolve(appRoot, "blobs");
  const modules = presetModuleConfig({
    dataDir: appRoot,
    blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: blobs } },
    model: contentModel,
    features,
    fieldTypes,
    roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "blog.read", "settings.read", "media.read"] },
    bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    robots: { policy: "allow" },
  });
  const preset = definePreset({ modules, features, collections: contentTypes, fieldTypes });
  const config = defineConfig({ modules, triggers: preset.triggers, http: null });
  const kestrel = await boot({ config, modules: presetModules(config.modules), pipelines: preset.pipelines, logger: silentLogger });
  await kestrel.start();
  return { kestrel, blobs };
}

function exportFile(blobs: string, name: string, content: string): Uint8Array {
  const bytes = new TextEncoder().encode(content);
  mkdirSync(join(blobs, "site"), { recursive: true });
  writeFileSync(join(blobs, "site", name), bytes);
  return bytes;
}

function wiring(onBootFailure: (err: unknown) => void = () => {}) {
  return {
    logger: silentLogger,
    policy: () => OPEN_POLICY,
    inlineTypes: () => [],
    maxBodyBytes: () => undefined,
    onBootFailure,
    status: () => ({ state: "failed" as const, error: "kestrel-delivery-static: boom" }),
  };
}

function routed(handlers: KestrelHandlers): EventHandler {
  return defineEventHandler(async (event) => {
    const handler = event.path.startsWith("/api/") ? await handlers.kestrelHandler : await handlers.indexFileHandler;
    const response: unknown = await handler(event);
    return response;
  });
}

describe("the index files on the site root", () => {
  it("answers each exported file with its stored bytes and the content type the export writes, inline, and 404 for a file not written", async () => {
    const { kestrel, blobs } = await bootSite(["delivery", "sanitizeSvg"]);
    try {
      const written = {
        "sitemap.xml": exportFile(blobs, "sitemap.xml", SITEMAP),
        "robots.txt": exportFile(blobs, "robots.txt", ROBOTS),
        "llms.txt": exportFile(blobs, "llms.txt", LLMS),
      };
      const base = await serve(routed(kestrelHandlers(Promise.resolve(kestrel), wiring())));

      for (const [name, bytes] of Object.entries(written)) {
        const response = await fetch(`${base}/${name}`);
        expect(response.status, name).toBe(200);
        expect(new Uint8Array(await response.arrayBuffer()), name).toEqual(bytes);
        expect(response.headers.get("content-type"), name).toBe(name === "sitemap.xml" ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8");
        expect(response.headers.get("content-disposition"), name).toBe(`inline; filename="${name}"`);
        expect(response.headers.get("cache-control"), name).toBe("no-cache");
        expect(response.headers.get("etag"), name).toMatch(/^"[0-9a-f]{64}"$/);
      }

      const missing = await fetch(`${base}/llms-full.txt`);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await kestrel.stop();
    }
  }, 30000);

  it("answers HEAD with the headers of the GET and no body, and 404 for a file not written", async () => {
    const { kestrel, blobs } = await bootSite(["delivery", "sanitizeSvg"]);
    try {
      exportFile(blobs, "robots.txt", ROBOTS);
      const base = await serve(routed(kestrelHandlers(Promise.resolve(kestrel), wiring())));

      const get = await fetch(`${base}/robots.txt`);
      await get.arrayBuffer();
      const head = await fetch(`${base}/robots.txt`, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      for (const name of ["content-type", "content-length", "cache-control", "etag"]) expect(head.headers.get(name), name).toBe(get.headers.get(name));
      expect(head.headers.get("content-length")).toBe(String(new TextEncoder().encode(ROBOTS).byteLength));
      expect((await fetch(`${base}/sitemap.xml`, { method: "HEAD" })).status).toBe(404);
    } finally {
      await kestrel.stop();
    }
  }, 30000);

  it("answers nothing but the four files: a nested, a differently cased or another file name and a write all get 404", async () => {
    const { kestrel, blobs } = await bootSite(["delivery", "sanitizeSvg"]);
    try {
      exportFile(blobs, "robots.txt", ROBOTS);
      exportFile(blobs, "index.html", "<!doctype html>");
      const base = await serve(routed(kestrelHandlers(Promise.resolve(kestrel), wiring())));

      for (const path of ["/index.html", "/site/robots.txt", "/Robots.txt", "/me", "/media/x/y.png"]) {
        expect((await fetch(`${base}${path}`)).status, path).toBe(404);
      }
      expect((await fetch(`${base}/robots.txt`, { method: "POST", body: "x" })).status).toBe(404);
    } finally {
      await kestrel.stop();
    }
  }, 30000);

  it("answers 404 on every index path when the delivery feature is off, even with a file at the export's key", async () => {
    const { kestrel, blobs } = await bootSite([]);
    try {
      exportFile(blobs, "robots.txt", ROBOTS);
      const base = await serve(routed(kestrelHandlers(Promise.resolve(kestrel), wiring())));
      for (const name of ["sitemap.xml", "robots.txt", "llms.txt", "llms-full.txt"]) expect((await fetch(`${base}/${name}`)).status, name).toBe(404);
    } finally {
      await kestrel.stop();
    }
  }, 30000);

  it("answers 503 with the boot status once boot has failed", async () => {
    const failures: unknown[] = [];
    const boom = new Error("boom");
    const base = await serve(routed(kestrelHandlers(Promise.reject(boom), wiring((err) => failures.push(err)))));
    const response = await fetch(`${base}/robots.txt`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ data: { state: "failed", error: "kestrel-delivery-static: boom" } });
    expect(failures).toContain(boom);
  });
});
