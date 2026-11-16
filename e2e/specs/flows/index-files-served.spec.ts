import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PUBLIC_DIR, REPO_ROOT, SITE_DIR } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

const EXPORT_DEADLINE_MS = 30_000;
const BOOT_DEADLINE_MS = 60_000;
const XML = "application/xml; charset=utf-8";
const TEXT = "text/plain; charset=utf-8";
const EXPORTED: Record<string, string> = { "sitemap.xml": XML, "llms.txt": TEXT, "llms-full.txt": TEXT };

const stored = (dir: string, name: string): Buffer | undefined => {
  const file = join(dir, name);
  return existsSync(file) ? readFileSync(file) : undefined;
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

test("the built server answers the exported index files with the stored bytes and the export's content type, inline", async ({ visitor }) => {
  for (const name of Object.keys(EXPORTED)) await expect.poll(() => stored(SITE_DIR, name) !== undefined, { timeout: EXPORT_DEADLINE_MS }).toBe(true);

  for (const [name, type] of Object.entries(EXPORTED)) {
    await expect.poll(async () => {
      const response = await visitor.get(`/${name}`);
      return response.status() === 200 && Buffer.compare(await response.body(), stored(SITE_DIR, name) ?? Buffer.alloc(0)) === 0;
    }, { message: `${name} matches the blob store`, timeout: EXPORT_DEADLINE_MS }).toBe(true);
    const response = await visitor.get(`/${name}`);
    expect(response.headers()["content-type"], name).toBe(type);
    expect(response.headers()["content-disposition"], name).toBe(`inline; filename="${name}"`);
    expect(response.headers()["cache-control"], name).toBe("no-cache");
    expect(response.headers()["etag"], name).toMatch(/^"[0-9a-f]{64}"$/);
  }
});

test("HEAD on an index file answers the headers of the GET without a body", async ({ visitor }) => {
  await expect.poll(() => stored(SITE_DIR, "sitemap.xml") !== undefined, { timeout: EXPORT_DEADLINE_MS }).toBe(true);
  const get = await visitor.get("/sitemap.xml");
  const body = await get.body();
  const head = await visitor.head("/sitemap.xml");
  expect(head.status()).toBe(200);
  expect((await head.body()).byteLength).toBe(0);
  for (const name of ["content-type", "content-length", "etag", "cache-control"]) expect(head.headers()[name], name).toBe(get.headers()[name]);
  expect(head.headers()["content-length"]).toBe(String(body.byteLength));
});

test("a robots.txt in the site's own public directory wins over the exported one", async ({ visitor }) => {
  await expect.poll(() => stored(SITE_DIR, "robots.txt") !== undefined, { timeout: EXPORT_DEADLINE_MS }).toBe(true);
  const own = readFileSync(join(PUBLIC_DIR, "robots.txt"));
  expect(Buffer.compare(own, stored(SITE_DIR, "robots.txt") ?? Buffer.alloc(0))).not.toBe(0);
  const response = await visitor.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(Buffer.compare(await response.body(), own)).toBe(0);
});

test.describe("a server started on an empty data directory without a site URL", () => {
  let server: ChildProcess | undefined;
  let workDir = "";

  test.afterAll(async () => {
    if (server !== undefined && server.exitCode === null) {
      const exited = new Promise((resolve) => server?.once("exit", resolve));
      server.kill("SIGTERM");
      await exited;
    }
    if (workDir !== "") rmSync(workDir, { recursive: true, force: true });
  });

  test("answers 404 for the sitemap it has not written, and the files it wrote from its own blob store", async () => {
    test.setTimeout(BOOT_DEADLINE_MS + EXPORT_DEADLINE_MS);
    workDir = mkdtempSync(join(tmpdir(), "kestrel-e2e-unwritten-"));
    const dataDir = join(workDir, "data");
    mkdirSync(dataDir, { recursive: true });
    const port = await freePort();
    const base = `http://127.0.0.1:${String(port)}`;
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", PORT: String(port), NITRO_PORT: String(port), NITRO_HOST: "127.0.0.1", KESTREL_DATA_DIR: dataDir, NUXT_PUBLIC_SITE_URL: "" };
    delete env.TEST;
    const log = openSync(join(workDir, "server.log"), "w");
    server = spawn(process.execPath, [join(REPO_ROOT, "playground", ".output", "server", "index.mjs")], { stdio: ["ignore", log, log], env });
    closeSync(log);

    await expect.poll(async () => (await fetch(`${base}/api/ready`).catch(() => undefined))?.status, { timeout: BOOT_DEADLINE_MS }).toBe(200);
    const siteDir = join(dataDir, "blobs", "site");
    await expect.poll(() => stored(siteDir, "robots.txt") !== undefined, { timeout: EXPORT_DEADLINE_MS }).toBe(true);

    expect(stored(siteDir, "sitemap.xml")).toBeUndefined();
    expect((await fetch(`${base}/sitemap.xml`)).status).toBe(404);
    expect((await fetch(`${base}/sitemap.xml`, { method: "HEAD" })).status).toBe(404);

    await expect.poll(() => stored(siteDir, "llms.txt") !== undefined, { timeout: EXPORT_DEADLINE_MS }).toBe(true);
    const llms = await fetch(`${base}/llms.txt`);
    expect(llms.status).toBe(200);
    expect(Buffer.compare(Buffer.from(await llms.arrayBuffer()), stored(siteDir, "llms.txt") ?? Buffer.alloc(0))).toBe(0);

    const own = await fetch(`${base}/robots.txt`);
    expect(Buffer.compare(Buffer.from(await own.arrayBuffer()), readFileSync(join(PUBLIC_DIR, "robots.txt")))).toBe(0);
  });
});
