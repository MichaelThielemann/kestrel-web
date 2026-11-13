import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp, toNodeListener } from "h3";
import { boot, defineConfig, silentLogger, type Kestrel } from "@michaelthielemann/kestrel";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import { setNuxtRenderer } from "@michaelthielemann/kestrel-renderer-nuxt";
import { pageUrl } from "@michaelthielemann/kestrel-delivery-static/site-url";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { Feature } from "#kestrel/pipelines";
import { canonicalUrl } from "../app/utils/canonical";
import fieldTypes from "../../../playground/shared/field-types";
import { contentModel, contentTypes } from "../../../playground/shared/model";

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";
const SITE_URL = "https://www.example.test";

function objectField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function linkPaths(body: unknown): string[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((block: unknown) => {
    const path = objectField(objectField(block, "link"), "path");
    return typeof path === "string" ? [path] : [];
  });
}

async function until(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((done) => setTimeout(done, 100));
  }
}

describe("a static export with every locale prefixed", () => {
  let appRoot = "";
  let kestrel: Kestrel | undefined;
  let server: Server | undefined;
  let base = "";
  let token = "";

  const exported = (path: string) => join(appRoot, "blobs", "site", ...path.split("/").filter(Boolean), "index.html");

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) };
    const response = await fetch(`${base}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, json: text === "" ? undefined : JSON.parse(text) };
  }

  async function renderPage(path: string): Promise<Response> {
    const response = await fetch(`${base}/api/site${path}`);
    if (!response.ok) return new Response("not found", { status: response.status });
    const page: unknown = await response.json();
    const locale = objectField(page, "_locale");
    const own = typeof locale === "string" ? objectField(objectField(page, "_paths"), locale) : undefined;
    const canonical = canonicalUrl(SITE_URL, typeof own === "string" ? own : path);
    const links = linkPaths(objectField(page, "body")).map((href) => `<a href="${href}">link</a>`).join("");
    const html = `<!doctype html><html><head><link rel="canonical" href="${canonical}"></head><body>${links}<script id="__NUXT_DATA__" type="application/json">[]</script></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-prefixed-export-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    vi.stubEnv("NUXT_PUBLIC_SITE_URL", SITE_URL);
    setNuxtRenderer({
      fetch: (path) => (path.startsWith("/_nuxt/") ? Promise.resolve(new Response("export {};", { headers: { "content-type": "text/javascript" } })) : renderPage(path)),
      dev: false,
      baseURL: "/",
      buildAssets: { dir: "/_nuxt/", paths: ["entry.js"] },
    });
    const features: Feature[] = ["delivery", "sanitizeSvg"];
    const modules = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: contentModel,
      features,
      fieldTypes,
      roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "blog.read", "settings.read", "media.read"] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
      robots: { policy: "allow" },
      prefixPrimary: true,
    });
    const preset = definePreset({ modules, features, collections: contentTypes, fieldTypes });
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
    vi.unstubAllEnvs();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("writes each default-locale page where its canonical link, its sitemap <loc> and every internal link to it point", async () => {
    const about = await call("POST", "/pages", { locale: "de", slug: "ueber-uns", title: "Über uns", status: "published", body: [] });
    expect(about.status, JSON.stringify(about.json)).toBe(200);
    const aboutId = String(objectField(about.json, "id"));
    const home = await call("POST", "/pages", { locale: "de", slug: "home", title: "Start", status: "published", body: [{ type: "teaser", link: { type: "internal", collection: "pages", id: aboutId } }] });
    expect(home.status, JSON.stringify(home.json)).toBe(200);

    const sitemap = join(appRoot, "blobs", "site", "sitemap.xml");
    const locs = (): string[] => (existsSync(sitemap) ? [...readFileSync(sitemap, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "") : []);
    await until(() => locs().length === 2 && existsSync(exported("/de")) && existsSync(exported("/de/ueber-uns")), "the export of both pages and the sitemap");

    expect(locs().sort()).toEqual([pageUrl(SITE_URL, "/de"), pageUrl(SITE_URL, "/de/ueber-uns")]);
    for (const path of ["/de", "/de/ueber-uns"]) {
      const html = readFileSync(exported(path), "utf8");
      expect(/<link rel="canonical" href="([^"]+)">/.exec(html)?.[1]).toBe(pageUrl(SITE_URL, path));
    }
    const hrefs = [...readFileSync(exported("/de"), "utf8").matchAll(/<a href="([^"]+)">/g)].map((match) => match[1] ?? "");
    expect(hrefs).toEqual(["/de/ueber-uns"]);
    expect(existsSync(exported("/ueber-uns"))).toBe(false);
  }, 60_000);
});
