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

const ALIAS = "Startseiten-Teaser";

describe("a block's alias never reaches an anonymous caller, on any pipeline that returns a page", () => {
  let appRoot = "";
  let kestrel: Kestrel | undefined;
  let server: Server | undefined;
  let base = "";
  let pageId = "";

  async function call(method: string, path: string, token: string | undefined, body?: unknown): Promise<{ status: number; text: string; json: unknown }> {
    const headers: Record<string, string> = { ...(token === undefined ? {} : { authorization: `Bearer ${token}` }), ...(body === undefined ? {} : { "content-type": "application/json" }) };
    const response = await fetch(`${base}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, text, json: text === "" ? undefined : JSON.parse(text) };
  }

  async function login(username: string, password: string): Promise<string> {
    const answer = await call("POST", "/login", undefined, { username, password });
    const token: unknown = typeof answer.json === "object" && answer.json !== null ? Reflect.get(answer.json, "token") : undefined;
    return String(token);
  }

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-page-privacy-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    const { default: playground, preset } = await import("../../../playground/kestrel.config");
    const modules = presetModules(playground.modules, { "@michaelthielemann/kestrel-insights": insights });
    kestrel = await boot({ config: playground, modules, pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.start();
    const app = createApp();
    use(app, defineEventHandler(createKestrelHandler(kestrel, { mountPath: "/api" })));
    server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;

    const admin = await login("admin", "change-me");
    const body = [{ id: "b1", type: "hero", props: {} }];
    const created = await call("POST", "/pages", admin, { locale: "de", slug: "home", title: "Startseite", status: "published", body, blockAliases: { b1: ALIAS } });
    expect(created.status).toBe(200);
    pageId = typeof created.json === "object" && created.json !== null ? String(Reflect.get(created.json, "id")) : "";
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("keeps the alias out of resolvePage's answer, with or without a trailing slash", async () => {
    for (const path of ["/site", "/site/", "/site/home", "/site//home"]) {
      const answer = await call("GET", path, undefined);
      expect(answer.text).not.toContain(ALIAS);
      expect(answer.text).not.toContain("blockAliases");
    }
  });

  it("keeps the alias out of resolvePage's answer for a percent-encoded path", async () => {
    const answer = await call("GET", "/%73ite/home", undefined);
    expect(answer.text).not.toContain(ALIAS);
    expect(answer.text).not.toContain("blockAliases");
  });

  it("keeps the alias out of readPage's answer", async () => {
    const answer = await call("GET", `/pages/${pageId}`, undefined);
    expect(answer.text).not.toContain(ALIAS);
    expect(answer.text).not.toContain("blockAliases");
  });

  it("keeps the alias out of listPages' answer", async () => {
    const answer = await call("GET", "/pages", undefined);
    expect(answer.text).not.toContain(ALIAS);
    expect(answer.text).not.toContain("blockAliases");
  });

  it("still gives the admin's own read of the page its alias", async () => {
    const admin = await login("admin", "change-me");
    const own = await call("GET", `/pages/${pageId}`, admin);
    expect(own.text).toContain(ALIAS);
    const list = await call("GET", "/pages", admin);
    expect(list.text).toContain(ALIAS);
  });
});
