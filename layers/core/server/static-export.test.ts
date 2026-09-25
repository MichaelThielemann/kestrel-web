import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { boot, defineConfig, silentLogger } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import { contentModel, contentTypes } from "../../../playground/shared/model";
import fieldTypes from "../../../playground/shared/field-types";

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

async function waitFor(check: () => boolean, attempts = 20, delayMs = 250): Promise<void> {
  for (let i = 0; i < attempts && !check(); i++) await new Promise((r) => setTimeout(r, delayMs));
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

function serveStatic(root: string): Promise<string> {
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      const target = resolve(root, `.${req.url ?? "/"}`);
      if (!target.startsWith(resolve(root) + sep) || !existsSync(target) || statSync(target).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200);
      createReadStream(target).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); });
      resolvePromise(`http://127.0.0.1:${boundaryCast<AddressInfo>(server.address(), "host").port}`);
    });
  });
}

describe("static export: a media file's public copy serves from plain disk, no backend", () => {
  it("has an upload's original copy under site/ when the upload answers and every variant's once placed, and a plain file server serves them after kestrel has stopped", async () => {
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-static-export-"));
    const blobsRoot = resolve(appRoot, "blobs");
    const siteRoot = resolve(blobsRoot, "site");

    const modules = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: blobsRoot } },
      model: contentModel,
      features: ["images", "delivery", "sanitizeSvg"],
      fieldTypes,
      roles: { roles: { admin: ["*"] }, anonymous: ["media.read"] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules, features: ["images", "delivery", "sanitizeSvg"], collections: contentTypes, fieldTypes });
    const config = defineConfig({ modules, triggers: preset.triggers, http: null });
    const bootedModules = presetModules(config.modules);
    const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.start();

    let png: Record<string, unknown>;
    let svg: Record<string, unknown>;
    try {
      const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
      const token = String(resultOf(login).token);

      png = resultOf(
        await kestrel.run("uploadMedia", {
          trigger: { kind: "http", name: "POST /media" },
          headers: { authorization: `Bearer ${token}` },
          files: [{ field: "file", filename: "hero.png", contentType: "image/png", data: new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]) }],
        }),
      );
      svg = resultOf(
        await kestrel.run("uploadMedia", {
          trigger: { kind: "http", name: "POST /media" },
          headers: { authorization: `Bearer ${token}` },
          files: [{ field: "file", filename: "logo.svg", contentType: "image/svg+xml", data: new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>") }],
        }),
      );

      expect(existsSync(resolve(siteRoot, String(png.path).replace(/^\//, "")))).toBe(true);
      expect(existsSync(resolve(siteRoot, String(svg.path).replace(/^\//, "")))).toBe(true);

      let variants: unknown[] = [];
      for (let attempt = 0; attempt < 20 && variants.length === 0; attempt++) {
        const getPng = resultOf(await kestrel.run("getMedia", { trigger: { kind: "http", name: "GET /media/:id" }, params: { id: String(png.id) } }));
        variants = Array.isArray(getPng.variants) ? getPng.variants : [];
        if (variants.length === 0) await new Promise((r) => setTimeout(r, 250));
      }
      expect(variants.length).toBeGreaterThan(0);
      const variantPaths = variants.map(pathOf);
      await waitFor(() => variantPaths.every((p) => existsSync(resolve(siteRoot, p.replace(/^\//, "")))));
      for (const variantPath of variantPaths) {
        expect(existsSync(resolve(siteRoot, variantPath.replace(/^\//, "")))).toBe(true);
      }
    } finally {
      await kestrel.stop();
      delete process.env.KESTREL_BLOCK_SCHEMA;
    }

    const base = await serveStatic(siteRoot);
    expect((await fetch(`${base}${String(png.path)}`)).status).toBe(200);
    expect((await fetch(`${base}${String(svg.path)}`)).status).toBe(200);
  }, 20000);
});
