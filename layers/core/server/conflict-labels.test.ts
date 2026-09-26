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
import { redactingConflictLabels, withoutHiddenLabels } from "./utils/conflict-labels";

const HOLDER = "Unreleased launch plan";

describe("path conflicts over HTTP", () => {
  let appRoot = "";
  let kestrel: Kestrel | undefined;
  let server: Server | undefined;
  let base = "";

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
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-conflicts-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    const { default: playground, preset } = await import("../../../playground/kestrel.config");
    const withWriter = playground.modules.map((entry) => {
      if (entry.use !== "@michaelthielemann/kestrel-authz-roles") return entry;
      return { ...entry, config: { roles: { pageWriter: ["pages.write"] } } };
    });
    const modules = presetModules(withWriter, { "@michaelthielemann/kestrel-insights": insights });
    kestrel = await boot({ config: { ...playground, modules: withWriter }, modules, pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.start();
    const app = createApp();
    use(app, defineEventHandler(redactingConflictLabels(kestrel, createKestrelHandler(kestrel, { mountPath: "/api" }))));
    server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("names the holder of a taken path only to a caller who can manage its collection, drafts included", async () => {
    const admin = await login("admin", "change-me");
    expect((await call("POST", "/blog", admin, { locale: "de", slug: "plan", title: HOLDER, status: "draft" })).status).toBe(200);
    expect((await call("POST", "/users", admin, { username: "writer", password: "writer-passphrase", roles: ["pageWriter"] })).status).toBe(200);
    const writer = await login("writer", "writer-passphrase");

    const hidden = await call("POST", "/pages", writer, { locale: "de", slug: "plan", title: "Plan", status: "draft" });
    expect(hidden.status).toBe(409);
    expect(hidden.text).not.toContain(HOLDER);
    expect(hidden.json).toMatchObject({
      error: "/plan (de) is taken; /en/plan (en) is taken",
      details: {
        fields: [{ field: "slug", message: "/plan (de) is taken" }, { field: "slug", message: "/en/plan (en) is taken" }],
        conflicts: [{ path: "/plan", type: "blog", label: "" }, { path: "/en/plan", type: "blog", label: "" }],
      },
    });

    const preview = await call("POST", "/admin/pages/path-preview", writer, { locale: "de", slug: "plan" });
    expect(preview.status).toBe(200);
    expect(preview.text).not.toContain(HOLDER);
    expect(preview.json).toMatchObject({ path: "/plan", conflict: { type: "blog", label: "" } });
    expect((await call("POST", "/admin/pages/path-preview", admin, { locale: "de", slug: "plan" })).text).toContain(HOLDER);

    const shown = await call("POST", "/pages", admin, { locale: "de", slug: "plan", title: "Plan", status: "draft" });
    expect(shown.status).toBe(409);
    expect(shown.text).toContain(HOLDER);
  });
});

describe("withoutHiddenLabels", () => {
  it("leaves an answer alone when every holder is readable", () => {
    const body = { error: '/a (de) is taken by pages "A"', details: { conflicts: [{ path: "/a", locale: "de", type: "pages", id: "p", label: "A" }] } };
    expect(withoutHiddenLabels(body, () => true)).toBeUndefined();
  });
});
