import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { unflatten } from "devalue";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ENABLED = process.env.KESTREL_STATIC_E2E === "1";
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUTPUT = join(REPO_ROOT, "playground", ".output");
const BOOT_TIMEOUT_MS = 120_000;
const SUITE_TIMEOUT_MS = 1_200_000;

const SENTINELS = ["SENTINEL-EN-DRAFT", "SENTINEL-DRAFT-PAGE", "sentinel-folder", "sentinel-user", "SENTINEL-DE-DRAFT"];
const PUBLISHED_PATHS = ["/", "/en", "/ueber-uns", "/en/about", "/kontakt", "/projekte", "/en/press"];
const UNPUBLISHED_TRANSLATIONS: Record<string, string> = { "/projekte": "en", "/en/press": "de" };

const PAGE_FIELDS = new Set(["id", "_locale", "_locales", "_links", "_paths", "_translations", "slug", "title", "body", "seo", "status", "shareImage", "accent", "layout"]);
const LOCALE_LINK_FIELDS = ["current", "locale", "path"];
const SETTINGS_FIELDS = ["description", "navigation", "title", "titlePosition", "titleSeparator"];
const MEDIA_FIELDS = ["alt", "contentType", "description", "filename", "focus", "framing", "height", "id", "path", "provenance", "size", "title", "variants", "width"];
const VARIANT_FIELDS = ["crop", "format", "height", "path", "size", "width"];

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, what: string): Json {
  if (!isRecord(value)) throw new Error(`expected ${what} to be an object`);
  return value;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function gradientPng(width: number, height: number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const t = (x + y) / (width + height);
      row[1 + x * 3] = Math.round(40 + 190 * t);
      row[2 + x * 3] = Math.round(90 + 80 * t);
      row[3 + x * 3] = Math.round(160 - 100 * t);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(Buffer.concat(rows))), pngChunk("IEND", Buffer.alloc(0))]);
}

async function freePort(from: number): Promise<number> {
  for (let port = from; port < from + 100; port += 1) {
    if (port === 3000 || port === 3005) continue;
    const free = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`no free port from ${from}`);
}

class Api {
  token: string | null = null;
  constructor(readonly base: string) {}

  async call(method: string, path: string, body?: unknown, form?: FormData): Promise<Json> {
    const headers: Record<string, string> = {};
    if (this.token !== null) headers.authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${this.base}/api${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${text.slice(0, 300)}`);
    return text === "" ? {} : record(JSON.parse(text), `${method} ${path}`);
  }

  async login(username: string, password: string): Promise<this> {
    const session = await this.call("POST", "/login", { username, password });
    this.token = String(session.token);
    return this;
  }

  upload(filename: string, bytes: Buffer, folder?: string): Promise<Json> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), filename);
    if (folder !== undefined) form.append("folder", folder);
    return this.call("POST", "/media", undefined, form);
  }
}

async function waitForVariants(api: Api, id: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const item = await api.call("GET", `/media/${id}`);
    if (item.available !== false && Array.isArray(item.variants) && item.variants.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`media ${id} never became available`);
}

type Mode = "direct" | "queue";

async function idle(api: Api, mode: Mode): Promise<boolean> {
  const status = await api.call("GET", "/admin/publish-status/pages");
  if (status.stale !== 0 || status.rendering !== 0) return false;
  if (mode === "direct") return true;
  const queue = await api.call("GET", "/admin/events/status");
  return queue.pending === 0 && queue.running === 0;
}

async function settled(api: Api, mode: Mode): Promise<void> {
  let quiet = 0;
  for (let attempt = 0; attempt < 480; attempt += 1) {
    quiet = (await idle(api, mode)) ? quiet + 1 : 0;
    if (quiet >= 3) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("the pages marked for a re-render were not rendered within two minutes");
}

async function until(what: string, check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${what} did not happen within a minute`);
}

const prose = (id: string, html: string) => ({ id, type: "prose", props: { body: html } });
const image = (id: string, media: unknown, alt: string) => ({ id, type: "image", props: { image: String(media), alt } });
const internal = (label: string, id: unknown) => ({ label, link: { type: "internal", collection: "pages", id: String(id) } });

interface Seeded { admin: Api; photo: string; contact: string; navigation: Json[] }

async function seed(base: string, mode: Mode): Promise<Seeded> {
  const api = await new Api(base).login("admin", "change-me");
  const photo = await api.upload("landscape.png", gradientPng(1200, 700));
  const archive = await api.upload("archive.png", gradientPng(600, 400), "sentinel-folder");
  await waitForVariants(api, String(photo.id));
  await waitForVariants(api, String(archive.id));

  const create = (body: Json) => api.call("POST", "/pages", body);
  const translate = (id: unknown, body: Json) => api.call("PATCH", `/pages/${String(id)}`, body);

  const home = await create({ locale: "de", slug: "home", title: "Startseite", status: "published", body: [prose("h1", "<p>Willkommen</p>")] });
  await translate(home.id, { locale: "en", slug: "home", title: "Home", status: "published", body: [prose("h1", "<p>Welcome</p>")] });
  const about = await create({ locale: "de", slug: "ueber-uns", title: "Über uns", status: "published", shareImage: String(photo.id), body: [image("a1", photo.id, "Ein Farbverlauf"), prose("a2", "<p>Wir bauen Seiten.</p>")] });
  await translate(about.id, { locale: "en", slug: "about", title: "About us", status: "published", body: [image("a1", photo.id, "A gradient"), prose("a2", "<p>We build sites.</p>")] });
  const contact = await create({ locale: "de", slug: "kontakt", title: "Kontakt", status: "published", body: [prose("c1", "<p>Schreiben Sie uns.</p>")] });
  const projects = await create({ locale: "de", slug: "projekte", title: "Projekte", status: "published", body: [image("p1", archive.id, "Archivbild")] });
  await translate(projects.id, { locale: "en", slug: "projects", title: "SENTINEL-EN-DRAFT", status: "draft", body: [prose("p2", "<p>SENTINEL-EN-DRAFT</p>")] });
  await create({ locale: "de", slug: "entwurf", title: "SENTINEL-DRAFT-PAGE", status: "draft", body: [prose("d1", "<p>SENTINEL-DRAFT-PAGE</p>")] });
  const press = await create({ locale: "de", slug: "presse", title: "Presse", status: "draft", seo: { title: "SENTINEL-DE-DRAFT", description: "SENTINEL-DE-DRAFT" }, body: [prose("r1", "<p>Pressetext</p>")] });
  await translate(press.id, { locale: "en", slug: "press", title: "Press", status: "published", seo: {}, body: [prose("r1", "<p>Press kit</p>")] });

  const navigation = [internal("Start", home.id), internal("Über uns", about.id), internal("Kontakt", contact.id), { label: "Fehlt", link: { type: "external", url: "/fehlt" } }];
  await api.call("PUT", "/settings", { locale: "de", title: "Kestrel Beispiel", mounts: {}, navigation });
  await api.call("PUT", "/settings", { locale: "en", title: "Kestrel Example", mounts: {}, navigation: [internal("Home", home.id), internal("About us", about.id), internal("Press", press.id)] });
  await api.call("PUT", "/redirects", { rules: [{ from: "/alt", to: "/ueber-uns", status: "301" }] });

  await api.call("POST", "/users", { username: "sentinel-user", password: "sentinel-passphrase", roles: ["admin"] });
  const publisher = await new Api(base).login("sentinel-user", "sentinel-passphrase");
  const queued = await publisher.call("POST", "/admin/publish-all/pages");
  expect(queued.marked).toBeGreaterThanOrEqual(PUBLISHED_PATHS.length);
  await settled(api, mode);
  return { admin: api, photo: String(photo.id), contact: String(contact.id), navigation };
}

const REVIVERS: Record<string, (value: unknown) => unknown> = Object.fromEntries(
  ["NuxtError", "EmptyShallowRef", "EmptyRef", "ShallowRef", "ShallowReactive", "Ref", "Reactive"].map((name) => [name, (value: unknown) => value]),
);

function payloadOf(html: string): Json {
  const match = /<script\b[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) throw new Error("no __NUXT_DATA__ payload");
  const parsed: unknown = JSON.parse(match[1]);
  if (!Array.isArray(parsed)) throw new Error("the payload is not a devalue array");
  return record(unflatten(parsed, REVIVERS), "the payload");
}

function htmlAttribute(html: string, name: string): string | null {
  const tag = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

function exportedFile(siteRoot: string, path: string): string {
  return join(siteRoot, path === "/" ? "" : path.slice(1), "index.html");
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

function shapeProblems(key: string, value: unknown, unknown: string[]): string[] {
  const sorted = (object: Json) => Object.keys(object).sort();
  if (key.startsWith("site:settings:")) {
    const keys = sorted(record(value, key));
    return JSON.stringify(keys) === JSON.stringify(SETTINGS_FIELDS) ? [] : [`${key}: ${keys.join(",")}`];
  }
  if (key.startsWith("site:locales:")) {
    if (!Array.isArray(value)) return [`${key}: not a list`];
    return value.flatMap((link) => (JSON.stringify(sorted(record(link, key))) === JSON.stringify(LOCALE_LINK_FIELDS) ? [] : [`${key}: ${sorted(record(link, key)).join(",")}`]));
  }
  if (key.startsWith("media:")) {
    if (value === null) return [];
    const item = record(value, key);
    const problems = JSON.stringify(sorted(item)) === JSON.stringify(MEDIA_FIELDS) ? [] : [`${key}: ${sorted(item).join(",")}`];
    const variants = Array.isArray(item.variants) ? item.variants : [];
    for (const variant of variants) if (JSON.stringify(sorted(record(variant, key))) !== JSON.stringify(VARIANT_FIELDS)) problems.push(`${key} variant: ${sorted(record(variant, key)).join(",")}`);
    return problems;
  }
  if (key.startsWith("site:")) {
    return Object.keys(record(value, key)).filter((field) => !PAGE_FIELDS.has(field)).map((field) => `${key}: unexpected field ${field}`);
  }
  unknown.push(key);
  return [];
}

let buildId = "";

function productionEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("VITEST") && name !== "TEST" && name !== "NODE_ENV"));
  return { ...env, NODE_ENV: "production", ...extra };
}

function stopServer(child: ChildProcess | null): void {
  if (child?.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

const mtime = (file: string): number | null => (existsSync(file) ? statSync(file).mtimeMs : null);

describe.skipIf(!ENABLED)("a static export of the playground", () => {
  beforeAll(() => {
    const built = spawnSync("pnpm", ["build"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: productionEnv({}) });
    if (built.status !== 0) throw new Error(`nuxt build failed\n${built.stdout}\n${built.stderr}`);
    buildId = String(record(JSON.parse(readFileSync(join(OUTPUT, "public", "_nuxt", "builds", "latest.json"), "utf8")), "latest.json").id);
    expect(buildId).toMatch(/^[0-9a-f-]{36}$/);
  }, SUITE_TIMEOUT_MS);

  describe.each<Mode>(["direct", "queue"])("with %s event delivery", (mode) => {
    let workDir: string | null = null;
    let server: ChildProcess | null = null;
    let base = "";
    let seeded: Seeded | null = null;

    beforeAll(async () => {
      workDir = mkdtempSync(join(tmpdir(), `kestrel-static-export-${mode}-`));
      const port = await freePort(Number(process.env.KESTREL_STATIC_E2E_PORT ?? 3010));
      base = `http://127.0.0.1:${port}`;
      const log = openSync(join(workDir, "server.log"), "w");
      server = spawn(process.execPath, [join(OUTPUT, "server", "index.mjs")], {
        detached: true,
        stdio: ["ignore", log, log],
        env: productionEnv({
          PORT: String(port),
          NITRO_PORT: String(port),
          NITRO_HOST: "127.0.0.1",
          KESTREL_DATA_DIR: join(workDir, "data"),
          KESTREL_PLAYGROUND_EVENTS_QUEUE: mode === "queue" ? "1" : "0",
        }),
      });
      closeSync(log);
      const deadline = Date.now() + BOOT_TIMEOUT_MS;
      for (;;) {
        const ready = await fetch(`${base}/api/ready`).then((response) => response.ok, () => false);
        if (ready) break;
        if (Date.now() > deadline) throw new Error(`the server did not become ready\n${readFileSync(join(workDir, "server.log"), "utf8").slice(-4000)}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      seeded = await seed(base, mode);
    }, SUITE_TIMEOUT_MS);

    afterAll(() => {
      stopServer(server);
      server = null;
      if (workDir !== null) rmSync(workDir, { recursive: true, force: true });
    });

    const siteRoot = () => join(workDir ?? "", "data", "blobs", "site");
    const page = (path: string) => exportedFile(siteRoot(), path);
    const admin = (): Api => {
      if (seeded === null) throw new Error("expected the seed to have run");
      return seeded.admin;
    };

    it("delivers events through the configured module", async () => {
      const queue = await fetch(`${base}/api/admin/events/status`, { headers: { authorization: `Bearer ${admin().token ?? ""}` } });
      expect(queue.status).toBe(mode === "queue" ? 200 : 404);
    });

    it("marks every published page as static, names the running build and embeds its own page data", () => {
      for (const path of PUBLISHED_PATHS) {
        const html = readFileSync(page(path), "utf8");
        expect(htmlAttribute(html, "data-kestrel-delivery"), path).toBe("static");
        expect(htmlAttribute(html, "data-kestrel-build"), path).toBe(buildId);
        const payload = payloadOf(html);
        expect(payload.path, path).toBe(path);
        expect(record(payload.data, "data")[`site:${path}`], path).toBeDefined();
      }
    });

    it("serves no page from the Node origin with the marker, and every one with the build id", async () => {
      for (const path of PUBLISHED_PATHS) {
        const html = await (await fetch(`${base}${path}`)).text();
        expect(htmlAttribute(html, "data-kestrel-delivery"), path).toBeNull();
        expect(htmlAttribute(html, "data-kestrel-build"), path).toBe(buildId);
      }
    });

    it("exports no draft, no unpublished translation, no internal media field and no user data", async () => {
      const hits = filesUnder(siteRoot()).flatMap((file) => {
        const text = readFileSync(file, "latin1");
        return SENTINELS.filter((sentinel) => text.includes(sentinel)).map((sentinel) => `${relative(siteRoot(), file)}: ${sentinel}`);
      });
      expect(hits).toEqual([]);

      const unknown: string[] = [];
      for (const path of PUBLISHED_PATHS) {
        const html = readFileSync(page(path), "utf8");
        const payload = payloadOf(html);
        const data = record(payload.data, "data");
        const problems = Object.entries(data).flatMap(([key, value]) => shapeProblems(key, value, unknown));
        expect(problems, path).toEqual([]);

        const translations = record(record(data[`site:${path}`], "page")._translations ?? {}, "_translations");
        const unpublished = UNPUBLISHED_TRANSLATIONS[path];
        if (unpublished !== undefined) expect(translations[unpublished], path).not.toBe(true);

        const anonymous = await (await fetch(`${base}${path}`)).text();
        expect(payloadOf(anonymous), path).toEqual(payload);
      }
      if (unknown.length > 0) console.info(`payload keys outside the layer's public shapes: ${[...new Set(unknown)].join(", ")}`);
      expect(existsSync(page("/entwurf"))).toBe(false);
    });

    it("renders every published page on the Node origin the same for a visitor, a signed-in editor and an editor who logged out", async () => {
      if (seeded === null) throw new Error("expected the seed to have run");
      const editorName = `parity-editor-${mode}`;
      await admin().call("POST", "/users", { username: editorName, password: "parity-passphrase", roles: ["editor"] });
      const editor = await new Api(base).login(editorName, "parity-passphrase");
      const loggedOut = await new Api(base).login(editorName, "parity-passphrase");
      await loggedOut.call("POST", "/logout");
      const render = async (path: string, token: string | null): Promise<{ body: string; payload: Json }> => {
        const html = await (await fetch(`${base}${path}`, { headers: token === null ? {} : { cookie: `__Host-kestrel_token=${token}` } })).text();
        return { body: /<body[\s\S]*<\/body>/.exec(html)?.[0] ?? "", payload: payloadOf(html) };
      };
      for (const path of PUBLISHED_PATHS) {
        const visitor = await render(path, null);
        expect(visitor.body, path).not.toBe("");
        expect(await render(path, editor.token), `${path} signed in`).toEqual(visitor);
        expect(await render(path, loggedOut.token), `${path} after logging out`).toEqual(visitor);
        const page = record(record(visitor.payload.data, "data")[`site:${path}`], "page");
        expect(page, path).not.toHaveProperty("createdAt");
        expect(page, path).not.toHaveProperty("updatedAt");
      }
      const about = await render("/ueber-uns", null);
      expect(about.body).toContain(`/media/${seeded.photo}/variants/`);
      expect(about.body).toContain('href="/en/about"');
    }, 180_000);

    it("re-renders every published page after a settings change, without any page being saved", async () => {
      if (seeded === null) throw new Error("expected the seed to have run");
      const before = new Map(PUBLISHED_PATHS.map((path) => [path, mtime(page(path))]));
      await admin().call("PUT", "/settings", { locale: "de", title: "Kestrel Beispiel Zwei", mounts: {}, navigation: seeded.navigation });
      await until("the settings re-render", () => PUBLISHED_PATHS.every((path) => mtime(page(path)) !== before.get(path)));
      await settled(admin(), mode);
      for (const path of PUBLISHED_PATHS) {
        if (!path.startsWith("/en")) expect(readFileSync(page(path), "utf8"), path).toContain("Kestrel Beispiel Zwei");
      }
    }, 180_000);

    it("re-renders only the pages that show a media item after its alt text changes", async () => {
      if (seeded === null) throw new Error("expected the seed to have run");
      const untouchedBefore = mtime(page("/kontakt"));
      await admin().call("PATCH", `/media/${seeded.photo}`, { locale: "de", alt: "Ein neuer Alternativtext" });
      await until("the media re-render", () => readFileSync(page("/ueber-uns"), "utf8").includes("Ein neuer Alternativtext"));
      await settled(admin(), mode);
      expect(mtime(page("/kontakt"))).toBe(untouchedBefore);
    }, 180_000);

    it("re-renders the pages that link to a page whose path changed, and removes the old path", async () => {
      if (seeded === null) throw new Error("expected the seed to have run");
      await admin().call("PATCH", `/pages/${seeded.contact}`, { locale: "de", slug: "kontakt-neu" });
      await until("the link re-render", () => existsSync(page("/kontakt-neu")) && readFileSync(page("/"), "utf8").includes('href="/kontakt-neu"'));
      await settled(admin(), mode);
      expect(existsSync(page("/kontakt"))).toBe(false);
      for (const path of ["/", "/ueber-uns", "/kontakt-neu"]) {
        const html = readFileSync(page(path), "utf8");
        expect(html, path).toContain('href="/kontakt-neu"');
        expect(html, path).not.toContain('href="/kontakt"');
      }
    }, 180_000);
  });
});
