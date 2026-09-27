import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, defineEventHandler, toNodeListener, use } from "h3";
import { boot, silentLogger, type Kestrel } from "@michaelthielemann/kestrel";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";

describe("a translation needs a slug of its own to be published, over HTTP", () => {
  let appRoot = "";
  let kestrel: Kestrel | undefined;
  let server: Server | undefined;
  let base = "";
  let token = "";

  async function call(method: string, path: string, body?: unknown, auth = true): Promise<{ status: number; json: unknown }> {
    const headers: Record<string, string> = { ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) };
    const response = await fetch(`${base}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, json: text === "" ? undefined : JSON.parse(text) };
  }

  const field = (value: unknown, key: string): unknown => (typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined);

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-translation-slug-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    const { default: playground, preset } = await import("../../../playground/kestrel.config");
    kestrel = await boot({ config: playground, modules: presetModules(playground.modules, { "@michaelthielemann/kestrel-insights": insights }), pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.start();
    const app = createApp();
    use(app, defineEventHandler(createKestrelHandler(kestrel, { mountPath: "/api" })));
    server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
    token = String(field((await call("POST", "/login", { username: "admin", password: "change-me" }, false)).json, "token"));
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("refuses a published translation without a slug and one whose slug is cleared, and never serves it under the default slug", async () => {
    const created = await call("POST", "/pages", { locale: "de", slug: "sommerfest", title: "Sommerfest", status: "draft" });
    expect(created.status).toBe(200);
    const id = String(field(created.json, "id"));

    const withoutSlug = await call("PATCH", `/pages/${id}`, { locale: "en", title: "Summer party", status: "published" });
    expect(withoutSlug.status).toBe(400);
    expect(JSON.stringify(field(withoutSlug.json, "details"))).toContain("slug");

    expect((await call("PATCH", `/pages/${id}`, { locale: "en", slug: "summer-party", title: "Summer party", status: "published" })).status).toBe(200);
    expect((await call("PATCH", `/pages/${id}`, { locale: "en", slug: null })).status).toBe(400);

    expect((await call("GET", "/site/en/sommerfest", undefined, false)).status).toBe(404);
    const served = await call("GET", "/site/en/summer-party", undefined, false);
    expect(served.status).toBe(200);
    expect(field(served.json, "_paths")).toEqual({ de: null, en: "/en/summer-party" });
  });
});
