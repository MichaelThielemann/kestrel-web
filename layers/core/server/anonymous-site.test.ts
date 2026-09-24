import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, toNodeListener } from "h3";
import type { EventHandler } from "h3";
import { boot, defineConfig, silentLogger, type RunEndEvent } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import { contentModel, contentTypes } from "../../../playground/shared/model";
import fieldTypes from "../../../playground/shared/field-types";
import { publicMediaRoutes } from "./utils/public-media";

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

let appRoot: string | undefined;
let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
  if (appRoot !== undefined) {
    rmSync(appRoot, { recursive: true, force: true });
    appRoot = undefined;
  }
});

async function serve(handler: EventHandler): Promise<string> {
  const app = createApp();
  app.use(handler);
  const server = createServer(toNodeListener(app));
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  close = () => new Promise((resolvePromise) => { server.closeAllConnections(); server.close(() => resolvePromise()); });
  return `http://127.0.0.1:${boundaryCast<AddressInfo>(server.address(), "host").port}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resultOf(run: { result?: unknown }): Record<string, unknown> {
  if (!isRecord(run.result)) throw new Error("expected a run result object");
  return run.result;
}

function pathOf(value: unknown): string {
  if (!isRecord(value) || typeof value.path !== "string") throw new Error("expected an object with a string path");
  return value.path;
}

describe("the anonymous Node site never lists media", () => {
  it("serves a published page and every media form it links, all anonymously, with no listMedia/listMediaFolders run and no 401", async () => {
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-anonymous-site-"));
    const modules = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: contentModel,
      features: ["images", "sanitizeSvg"],
      fieldTypes,
      roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "media.read"] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules, features: ["images", "sanitizeSvg"], collections: contentTypes, fieldTypes });
    const config = defineConfig({ modules, triggers: preset.triggers, http: null });
    const bootedModules = presetModules(config.modules);
    const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.start();

    try {
      const runs: { pipeline: string; status: number }[] = [];
      const unobserve = kestrel.observe({ runEnd: (event: RunEndEvent) => runs.push({ pipeline: event.pipeline, status: event.status }) });

      const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
      const token = String(resultOf(login).token);

      const png = resultOf(
        await kestrel.run("uploadMedia", {
          trigger: { kind: "http", name: "POST /media" },
          headers: { authorization: `Bearer ${token}` },
          files: [{ field: "file", filename: "hero.png", contentType: "image/png", data: new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]) }],
        }),
      );
      const pdf = resultOf(
        await kestrel.run("uploadMedia", {
          trigger: { kind: "http", name: "POST /media" },
          headers: { authorization: `Bearer ${token}` },
          files: [{ field: "file", filename: "brochure.pdf", contentType: "application/pdf", data: new Uint8Array([37, 80, 68, 70]) }],
        }),
      );
      const svg = resultOf(
        await kestrel.run("uploadMedia", {
          trigger: { kind: "http", name: "POST /media" },
          headers: { authorization: `Bearer ${token}` },
          files: [{ field: "file", filename: "logo.svg", contentType: "image/svg+xml", data: new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>") }],
        }),
      );

      const create = await kestrel.run("createPage", {
        trigger: { kind: "http", name: "POST /pages" },
        headers: { authorization: `Bearer ${token}` },
        body: { locale: "de", slug: "anon-site-check", title: "Anon site check", status: "published", body: [], shareImage: String(png.id), accent: "#123456" },
      });
      expect(create.status).toBe(200);

      const page = await kestrel.run("resolvePage", { trigger: { kind: "http", name: "GET /site/*path" }, params: { path: "anon-site-check" } });
      expect(page.status).toBe(200);

      const anonymousGetMedia = async (id: string) =>
        resultOf(await kestrel.run("getMedia", { trigger: { kind: "http", name: "GET /media/:id" }, params: { id } }));
      const pngItem = await anonymousGetMedia(String(png.id));
      const pdfItem = await anonymousGetMedia(String(pdf.id));
      const svgItem = await anonymousGetMedia(String(svg.id));
      const variants = Array.isArray(pngItem.variants) ? pngItem.variants : [];
      expect(variants.length).toBeGreaterThan(0);
      const namedVariantPath = pathOf(variants[0]);

      const handler = createKestrelHandler(
        { run: kestrel.run.bind(kestrel), triggers: { http: publicMediaRoutes(kestrel.triggers.http), events: [], crons: [] } },
        { mountPath: "" },
      );
      const base = await serve(handler);

      expect((await fetch(`${base}${String(pngItem.path)}`)).status).toBe(200);
      expect((await fetch(`${base}${namedVariantPath}`)).status).toBe(200);
      expect((await fetch(`${base}${String(pdfItem.path)}`)).status).toBe(200);
      expect((await fetch(`${base}${String(svgItem.path)}`)).status).toBe(200);

      unobserve();
      expect(runs.some((run) => run.pipeline === "listMedia")).toBe(false);
      expect(runs.some((run) => run.pipeline === "listMediaFolders")).toBe(false);
      expect(runs.some((run) => run.status === 401)).toBe(false);
    } finally {
      await kestrel.stop();
      delete process.env.KESTREL_BLOCK_SCHEMA;
    }
  }, 20000);
});
