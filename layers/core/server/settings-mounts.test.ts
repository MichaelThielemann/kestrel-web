import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, silentLogger, type Kestrel } from "@michaelthielemann/kestrel";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";

describe("the playground's settings.mounts across locales", () => {
  let appRoot = "";
  let kestrel: Kestrel | undefined;
  let base = "";
  let token = "";

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    const json: unknown = text === "" ? {} : JSON.parse(text);
    return { status: response.status, json: typeof json === "object" && json !== null ? Object.fromEntries(Object.entries(json)) : {} };
  }

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-mounts-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    const { default: playground, preset } = await import("../../../playground/kestrel.config");
    const modules = presetModules(playground.modules, { "@michaelthielemann/kestrel-insights": insights });
    kestrel = await boot({ config: { ...playground, http: { port: 0, host: "127.0.0.1" } }, modules, pipelines: preset.pipelines, logger: silentLogger });
    const started = await kestrel.start();
    base = `http://127.0.0.1:${started.http?.port ?? 0}`;
    const login: unknown = await (await fetch(`${base}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "change-me" }) })).json();
    token = String(typeof login === "object" && login !== null ? Reflect.get(login, "token") : "");
  }, 60_000);

  afterAll(async () => {
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("refuses a settings save without the mount assignment, which would reset it for every locale, and keeps the stored one", async () => {
    const page = await call("POST", "/pages", { locale: "de", slug: "journal", title: "Journal", status: "published" });
    const id = String(page.json.id);
    expect((await call("PUT", "/settings", { locale: "de", title: "Seite", mounts: { blog: id } })).status).toBe(200);
    const withoutMounts = await call("PUT", "/settings", { locale: "en", title: "Site" });
    expect(withoutMounts.status).toBe(400);
    expect(JSON.stringify(withoutMounts.json)).toContain("mounts");
    expect((await call("PUT", "/settings", { locale: "en", title: "Site", mounts: { blog: id } })).status).toBe(200);
    expect((await call("GET", "/settings?locale=de")).json.mounts).toEqual({ blog: id });
    expect((await call("GET", "/settings?locale=en")).json.mounts).toEqual({ blog: id });
    const post = await call("POST", "/blog", { locale: "de", slug: "hallo", title: "Hallo", status: "published" });
    expect((await call("GET", `/admin/blog/${String(post.json.id)}`)).json._paths).toMatchObject({ de: "/journal/hallo" });
  });
});
