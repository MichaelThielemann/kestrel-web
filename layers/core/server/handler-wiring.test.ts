import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createApp, createError, defineEventHandler, toNodeListener } from "h3";
import type { EventHandler } from "h3";
import { boot, defineConfig, silentLogger } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import { publicMediaRoutes } from "./utils/public-media";
import { bootFailure } from "./utils/boot-failure";

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

let appRoot: string | undefined;
let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

afterAll(() => {
  if (appRoot !== undefined) rmSync(appRoot, { recursive: true, force: true });
});

async function serve(handler: EventHandler): Promise<string> {
  const app = createApp();
  app.use(handler);
  const server = createServer(toNodeListener(app));
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  close = () => new Promise((resolvePromise) => { server.closeAllConnections(); server.close(() => resolvePromise()); });
  return `http://127.0.0.1:${boundaryCast<AddressInfo>(server.address(), "host").port}`;
}

async function bootMediaKestrel() {
  appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-handler-wiring-"));
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
  const bootedModules = presetModules(config.modules);
  const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger: silentLogger });
  await kestrel.start();
  return kestrel;
}

describe("the public /media handler, wired the way the Nitro plugin wires it", () => {
  it("serves an uploaded file's own route with no mount prefix, and 404s every other media route the API answers", async () => {
    const kestrel = await bootMediaKestrel();
    try {
      const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
      if (login.result === undefined || typeof login.result !== "object" || !("token" in login.result)) throw new Error("expected a login token");
      const token = String(login.result.token);

      const upload = await kestrel.run("uploadMedia", {
        trigger: { kind: "http", name: "POST /media" },
        headers: { authorization: `Bearer ${token}` },
        files: [{ field: "file", filename: "a.png", contentType: "image/png", data: new Uint8Array([1, 2, 3, 4]) }],
      });
      if (upload.result === undefined || typeof upload.result !== "object" || !("path" in upload.result) || !("id" in upload.result)) {
        throw new Error("expected the upload to produce an id and a path");
      }
      const path = String(upload.result.path);
      const id = String(upload.result.id);

      const handler = createKestrelHandler(
        { run: kestrel.run.bind(kestrel), triggers: { http: publicMediaRoutes(kestrel.triggers.http), events: [], crons: [] } },
        { mountPath: "" },
      );
      const base = await serve(handler);

      const fileRes = await fetch(`${base}${path}`);
      expect(fileRes.status).toBe(200);

      expect((await fetch(`${base}/media/${id}`)).status).toBe(404);
      expect((await fetch(`${base}/media/folders`)).status).toBe(404);
      expect((await fetch(`${base}/media`)).status).toBe(404);
    } finally {
      await kestrel.stop();
    }
  }, 15000);

  it("answers 503 once boot has failed, the same fallback the plugin installs", async () => {
    const failing = defineEventHandler(() => {
      throw createError(bootFailure({ state: "failed", error: "kestrel-media-default: boom" }));
    });
    const base = await serve(failing);
    const res = await fetch(`${base}/media/anything/here`);
    expect(res.status).toBe(503);
  });
});
