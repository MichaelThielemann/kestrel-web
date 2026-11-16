import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, effectiveModuleConfig, silentLogger, type JsonSchema, type Kestrel, type Manifest, type NarrowsDeclaration } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { validateSchema } from "@michaelthielemann/kestrel/schema";
import { anonymousPipelines, type Config } from "@michaelthielemann/kestrel-authz-roles/impl";
import insights from "@michaelthielemann/kestrel-insights";
import { generateOpenApi } from "@michaelthielemann/kestrel-openapi";
import { presetModules } from "#kestrel/modules";

const SENTINELS = ["SENTINEL-EN-DRAFT", "SENTINEL-DRAFT-PAGE", "sentinel-folder", "sentinel-editor"];
const CORE_FILE_HEADERS = new Set([
  "x-content-type-options", "cache-control", "x-kestrel-run-id", "x-request-id", "content-type", "content-length", "content-disposition", "content-security-policy",
  "access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers", "vary", "date", "connection", "keep-alive", "transfer-encoding",
]);

const PER_REQUEST_HEADERS = new Set(["date", "x-kestrel-run-id", "x-request-id"]);

type Grant = Map<string, Grant | true>;
type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function grantOf(paths: readonly string[]): Grant {
  const tree: Grant = new Map();
  for (const path of paths) {
    const names = path.split(".").map((name) => name.replace(/\[\]$/, ""));
    let node = tree;
    for (const [index, name] of names.entries()) {
      const existing = node.get(name);
      if (existing === true) break;
      if (index === names.length - 1) {
        node.set(name, true);
        break;
      }
      const next: Grant = existing ?? new Map<string, Grant | true>();
      node.set(name, next);
      node = next;
    }
  }
  return tree;
}

function outside(value: unknown, grant: Grant, at: string, found: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((element, index) => outside(element, grant, `${at}[${index}]`, found));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, member] of Object.entries(value)) {
    const path = at === "" ? key : `${at}.${key}`;
    const granted = grant.get(key);
    if (granted === undefined) found.push(path);
    else if (granted !== true) outside(member, granted, path, found);
  }
}

function membersOutsideGrant(answer: unknown, shape: NarrowsDeclaration["shape"], grant: Grant): string[] {
  const found: string[] = [];
  if (shape === "list" && isRecord(answer)) {
    for (const [key, member] of Object.entries(answer)) {
      if (key === "items" && Array.isArray(member)) member.forEach((item, index) => outside(item, grant, `items[${index}]`, found));
      else if (key !== "total") found.push(key);
    }
    return found;
  }
  outside(answer, grant, "", found);
  return found;
}

function contains(whole: unknown, part: unknown): boolean {
  if (Array.isArray(part)) return Array.isArray(whole) && whole.length === part.length && part.every((element, index) => contains(whole[index], element));
  if (isRecord(part)) return isRecord(whole) && Object.entries(part).every(([key, member]) => Object.hasOwn(whole, key) && contains(whole[key], member));
  return Object.is(whole, part);
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

interface Answer {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
}

async function request(base: string, method: string, path: string, options: { token?: string; json?: unknown; form?: FormData } = {}): Promise<Answer> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  if (options.json !== undefined) headers["content-type"] = "application/json";
  const body = options.json !== undefined ? { body: JSON.stringify(options.json) } : options.form !== undefined ? { body: options.form } : {};
  const response = await fetch(`${base}${path}`, { method, headers, ...body });
  const bytes = Buffer.from(await response.arrayBuffer());
  const json: unknown = (response.headers.get("content-type") ?? "").startsWith("application/json") ? JSON.parse(bytes.toString("utf8")) : undefined;
  const responseHeaders = Object.fromEntries([...response.headers].filter(([name]) => !PER_REQUEST_HEADERS.has(name)));
  return { status: response.status, headers: responseHeaders, text: bytes.toString("latin1"), json };
}

function comparable(answer: Answer): unknown {
  if (!isRecord(answer.json)) return { status: answer.status, text: answer.text };
  const { runId: _runId, ...json } = answer.json;
  return { status: answer.status, json };
}

async function ok(base: string, method: string, path: string, options: Parameters<typeof request>[3]): Promise<Json> {
  const answer = await request(base, method, path, options);
  expect(answer.status, `${method} ${path}: ${answer.text.slice(0, 300)}`).toBe(200);
  return boundaryCast<Json>(answer.json, "json");
}

interface Seeded {
  admin: string;
  editor: string;
  loggedOut: string;
  homeId: string;
  aboutId: string;
  draftId: string;
  postId: string;
  mediaId: string;
  mediaName: string;
  variantFiles: string[];
}

async function seed(base: string): Promise<Seeded> {
  const admin = String((await ok(base, "POST", "/login", { json: { username: "admin", password: "change-me" } })).token);
  const form = new FormData();
  form.set("folder", "sentinel-folder");
  form.set("file", new Blob([new Uint8Array(gradientPng(1200, 700))], { type: "image/png" }), "landscape.png");
  const mediaId = String((await ok(base, "POST", "/media", { token: admin, form })).id);
  let item: Json = {};
  for (let attempt = 0; attempt < 60; attempt += 1) {
    item = await ok(base, "GET", `/media/${mediaId}`, { token: admin });
    if (item.available !== false && Array.isArray(item.variants) && item.variants.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const variants = boundaryCast<Array<{ path: string }>>(item.variants, "json");
  expect(variants.length).toBeGreaterThan(0);
  const draftId = String((await ok(base, "POST", "/pages", { token: admin, json: { locale: "de", slug: "entwurf", title: "SENTINEL-DRAFT-PAGE", status: "draft" } })).id);
  const aboutId = String((await ok(base, "POST", "/pages", { token: admin, json: { locale: "de", slug: "ueber-uns", title: "Über uns", status: "published", body: [] } })).id);
  const body = [{ type: "prose", props: { body: `<p><a href="kestrel:pages:${aboutId}">Über uns</a> <a href="kestrel:pages:${draftId}">Entwurf</a></p>` } }];
  const homeId = String((await ok(base, "POST", "/pages", { token: admin, json: { locale: "de", slug: "home", title: "Start", status: "published", shareImage: mediaId, seo: { title: "Start" }, body } })).id);
  await ok(base, "PATCH", `/pages/${homeId}`, { token: admin, json: { locale: "en", slug: "home", title: "SENTINEL-EN-DRAFT", status: "draft" } });
  const blogPageId = String((await ok(base, "POST", "/pages", { token: admin, json: { locale: "de", slug: "blog", title: "Blog", status: "draft", body: [] } })).id);
  await ok(base, "PUT", "/settings", { token: admin, json: { locale: "de", title: "Seite", description: "Beschreibung", navigation: [{ label: "Über uns", link: { type: "internal", collection: "pages", id: aboutId } }], mounts: { blog: blogPageId } } });
  await ok(base, "PUT", "/redirects", { token: admin, json: { rules: [{ from: "/alt", to: "/ueber-uns", status: "301" }] } });
  const postId = String((await ok(base, "POST", "/blog", { token: admin, json: { locale: "de", slug: "hallo", title: "Hallo", status: "published", body: [] } })).id);
  await ok(base, "PATCH", `/blog/${postId}`, { token: admin, json: { locale: "en", slug: "hello", title: "SENTINEL-EN-DRAFT-POST", status: "draft" } });
  await ok(base, "PATCH", `/pages/${homeId}`, { token: admin, json: { locale: "en", title: "SENTINEL-EN-DRAFT" } });
  await ok(base, "POST", "/users", { token: admin, json: { username: "sentinel-editor", password: "sentinel-passphrase", roles: ["editor"] } });
  const editor = String((await ok(base, "POST", "/login", { json: { username: "sentinel-editor", password: "sentinel-passphrase" } })).token);
  const loggedOut = String((await ok(base, "POST", "/login", { json: { username: "sentinel-editor", password: "sentinel-passphrase" } })).token);
  await ok(base, "POST", "/logout", { token: loggedOut });
  const fileOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  return { admin, editor, loggedOut, homeId, aboutId, draftId, postId, mediaId, mediaName: fileOf(String(item.path)), variantFiles: variants.map((variant) => fileOf(variant.path)) };
}

function requestsFor(s: Seeded): Record<string, string[]> {
  return {
    "GET /settings": ["/settings", "/settings?locale=en"],
    "GET /redirects.json": ["/redirects.json"],
    "GET /site/*path": ["/site/", "/site/en", "/site/ueber-uns", "/site/alt", "/site/entwurf", "/site/blog/hallo", "/site/blog"],
    "GET /routes/blog/*path": ["/routes/blog/blog/hallo", "/routes/blog/en/blog/hello"],
    "GET /blog": ["/blog", "/blog?locale=en"],
    "GET /blog/:id": [`/blog/${s.postId}`, `/blog/${s.postId}?locale=en`],
    "GET /pages": ["/pages", "/pages?locale=en"],
    "GET /pages/:id": [`/pages/${s.homeId}`, `/pages/${s.homeId}?locale=en`, `/pages/${s.aboutId}`, `/pages/${s.draftId}`],
    "GET /media": [`/media?ids=${s.mediaId}`],
    "GET /media/:id": [`/media/${s.mediaId}`, `/media/${s.mediaId}?locale=en`],
    "GET /media/:id/file": [`/media/${s.mediaId}/file`],
    "GET /media/:id/variants/:file": s.variantFiles.map((file) => `/media/${s.mediaId}/variants/${file}`),
    "GET /media/:id/:name": [`/media/${s.mediaId}/${s.mediaName}`],
    "GET /sitemap.xml": ["/sitemap.xml"],
    "GET /robots.txt": ["/robots.txt"],
    "GET /llms.txt": ["/llms.txt"],
    "GET /llms-full.txt": ["/llms-full.txt"],
  };
}

interface OpenApi {
  paths: Record<string, Record<string, { operationId: string; responses: Record<string, Json> }>>;
  components: { schemas: Record<string, JsonSchema> };
}

describe("the playground preset: what a caller without a session receives", () => {
  let appRoot = "";
  let kestrel: Kestrel | undefined;
  let base = "";
  let manifest: Manifest;
  let config: Config;
  let openapi: OpenApi;
  let seeded: Seeded;

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-anonymous-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    const { default: playground, preset } = await import("../../../playground/kestrel.config");
    const modules = presetModules(playground.modules, { "@michaelthielemann/kestrel-insights": insights });
    kestrel = await boot({ config: { ...playground, http: { port: 0, host: "127.0.0.1" } }, modules, pipelines: preset.pipelines, validateOutput: true, logger: silentLogger });
    const started = await kestrel.start();
    base = `http://127.0.0.1:${started.http?.port ?? 0}`;
    manifest = kestrel.describe();
    const authzEntry = playground.modules.find((entry) => entry.use === "@michaelthielemann/kestrel-authz-roles");
    const authz = boundaryCast<Omit<Config, "roleClaim">>(authzEntry === undefined ? undefined : effectiveModuleConfig(authzEntry), "host");
    config = { ...authz, roleClaim: "roles" };
    openapi = boundaryCast<OpenApi>(generateOpenApi(kestrel, { title: "t", version: "1" }), "json");
    seeded = await seed(base);
    const exported = join(appRoot, "data", "blobs", "site");
    mkdirSync(exported, { recursive: true });
    for (const name of ["sitemap.xml", "robots.txt", "llms.txt", "llms-full.txt"]) writeFileSync(join(exported, name), `${name}\n`);
  }, 60_000);

  afterAll(async () => {
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  function cutOf(pipeline: string): { resource: string; narrows: NarrowsDeclaration } {
    const last = manifest.pipelines.find((p) => p.name === pipeline)?.steps.at(-1);
    expect(last?.name, `${pipeline} ends with the field step`).toBe("authz.fields");
    const narrows = last?.description.narrows;
    if (last === undefined || narrows === undefined) throw new Error(`${pipeline}: no narrowing step at its end`);
    return { resource: last.spec.slice("authz.fields:".length).split("?")[0] ?? "", narrows };
  }

  it("reaches exactly the preset's public reads without a session", () => {
    expect(anonymousPipelines(config, manifest).map((p) => p.name).sort()).toEqual(
      [
        "downloadMedia", "getMedia", "getSettings", "listBlog", "listMedia", "listPages", "readBlog", "readPage", "renderRedirects", "resolveBlog", "resolvePage",
        "serveImageVariant", "serveLlmsFullTxt", "serveLlmsTxt", "serveMediaFile", "serveRobotsTxt", "serveSitemapXml",
      ],
    );
  });

  it("answers every public read over HTTP with nothing outside its grant, the same with a revoked session, and a signed-in editor a superset", async () => {
    const table = requestsFor(seeded);
    const answered = new Set<string>();
    for (const pipeline of anonymousPipelines(config, manifest)) {
      const { resource, narrows } = cutOf(pipeline.name);
      const paths = config.anonymousFields?.[resource];
      expect(paths, resource).toBeDefined();
      const grant = grantOf(paths ?? []);
      const routes = manifest.triggers.http.filter((route) => route.pipeline === pipeline.name);
      expect(routes.length, pipeline.name).toBeGreaterThan(0);
      for (const route of routes) {
        const requests = table[`${route.method} ${route.path}`];
        if (requests === undefined) throw new Error(`no request for ${route.method} ${route.path}, which anonymous callers reach through "${pipeline.name}"`);
        const operation = openapi.paths[route.path.replace(/[:*](\w+)/g, "{$1}")]?.[route.method.toLowerCase()];
        for (const path of requests) {
          const label = `${route.method} ${path}`;
          const anonymous = await request(base, route.method, path);
          const revoked = await request(base, route.method, path, { token: seeded.loggedOut });
          const signedIn = await request(base, route.method, path, { token: seeded.editor });
          expect(comparable(revoked), `${label} with a revoked session`).toEqual(comparable(anonymous));
          for (const sentinel of SENTINELS) {
            expect(anonymous.text, `${label} body`).not.toContain(sentinel);
            expect(JSON.stringify(anonymous.headers), `${label} headers`).not.toContain(sentinel);
          }
          if (anonymous.status !== 200) {
            expect(anonymous.status, label).toBeGreaterThanOrEqual(300);
            continue;
          }
          answered.add(pipeline.name);
          const answers = boundaryCast<Record<string, { $ref?: string; headers?: string[] }>>(operation?.responses["200"]?.["x-kestrel-answers"], "json");
          expect(signedIn.status, label).toBe(200);
          if (narrows.shape === "file") {
            const granted = new Set(answers.anonymous?.headers ?? []);
            expect(Object.keys(anonymous.headers).filter((name) => !CORE_FILE_HEADERS.has(name) && !granted.has(name)), label).toEqual([]);
            for (const [name, value] of Object.entries(anonymous.headers)) if (granted.has(name)) expect(signedIn.headers[name], `${label} ${name}`).toBe(value);
            continue;
          }
          const anonymousSchema = openapi.components.schemas[(answers.anonymous?.$ref ?? "").replace("#/components/schemas/", "")];
          const fullSchema = operation === undefined ? undefined : openapi.components.schemas[operation.operationId];
          if (anonymousSchema === undefined || fullSchema === undefined) throw new Error(`${label}: no documented answers`);
          expect(validateSchema(anonymousSchema, anonymous.json), label).toEqual([]);
          expect(membersOutsideGrant(anonymous.json, narrows.shape, grant), label).toEqual([]);
          expect(validateSchema(fullSchema, signedIn.json), `${label} signed in`).toEqual([]);
          expect(contains(signedIn.json, anonymous.json), `${label}: the editor's answer contains the anonymous one`).toBe(true);
        }
      }
    }
    expect([...answered].sort()).toEqual(anonymousPipelines(config, manifest).map((p) => p.name).sort());
  }, 60_000);

  it("lets a caller without a session sort a public list by the system fields and by granted fields only, and the editor by any field", async () => {
    for (const [path, pipeline] of [["/pages", "listPages"], ["/blog", "listBlog"]] as const) {
      const { resource } = cutOf(pipeline);
      const granted = new Set((config.anonymousFields?.[resource] ?? []).map((field) => field.split(".")[0]));
      const operation = openapi.paths[path]?.get;
      const items = boundaryCast<{ properties?: { items?: { items?: { properties?: Json } } } }>(operation === undefined ? undefined : openapi.components.schemas[operation.operationId], "json");
      const fields = Object.keys(items.properties?.items?.items?.properties ?? {}).filter((field) => !field.startsWith("_"));
      const hidden = fields.find((field) => !granted.has(field) && !["id", "createdAt", "updatedAt"].includes(field));
      const visible = fields.find((field) => granted.has(field) && field !== "id");
      if (hidden === undefined || visible === undefined) throw new Error(`${path}: expected a granted and a withheld field among ${fields.join(", ")}`);
      for (const sort of ["-createdAt", "updatedAt", "id", visible]) expect((await request(base, "GET", `${path}?sort=${sort}`)).status, `${path}?sort=${sort}`).toBe(200);
      const refused = await request(base, "GET", `${path}?sort=-${hidden}`);
      expect(refused.status, `${path}?sort=-${hidden}`).toBe(400);
      expect(JSON.stringify(refused.json)).not.toContain("SENTINEL");
      expect((await request(base, "GET", `${path}?sort=-${hidden}`, { token: seeded.editor })).status, `${path}?sort=-${hidden} signed in`).toBe(200);
    }
  });

  it("keeps the timestamps and the folder from a caller without a session, and gives them to the editor", async () => {
    const anonymousPage = boundaryCast<Json>((await request(base, "GET", "/site/")).json, "json");
    const editorPage = boundaryCast<Json>((await request(base, "GET", "/site/", { token: seeded.editor })).json, "json");
    expect(anonymousPage).not.toHaveProperty("createdAt");
    expect(anonymousPage).not.toHaveProperty("updatedAt");
    expect(editorPage).toHaveProperty("updatedAt");
    const anonymousItem = boundaryCast<Json>((await request(base, "GET", `/media/${seeded.mediaId}`)).json, "json");
    const editorItem = boundaryCast<Json>((await request(base, "GET", `/media/${seeded.mediaId}`, { token: seeded.editor })).json, "json");
    for (const member of ["folder", "createdAt", "updatedAt", "available", "variantCounts"]) expect(anonymousItem, member).not.toHaveProperty(member);
    expect(editorItem.folder).toBe("sentinel-folder");
    expect(boundaryCast<Json[]>(anonymousItem.variants, "json").every((variant) => !("state" in variant) && !("bytes" in variant))).toBe(true);
  });

  it("gives a caller without a session the item's focus and of the editor's framing only the oriented dimensions", async () => {
    const focus = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const framed = await request(base, "PUT", `/media/${seeded.mediaId}/framing`, { token: seeded.editor, json: { focus } });
    expect(framed.status).toBe(200);
    expect(boundaryCast<Json>(framed.json, "json").framing).toMatchObject({ focus, crops: {} });
    const anonymousItem = boundaryCast<Json>((await request(base, "GET", `/media/${seeded.mediaId}`)).json, "json");
    expect(anonymousItem.focus).toEqual(focus);
    const dimensions = boundaryCast<Json>(anonymousItem.framing, "json");
    expect(Object.keys(dimensions).sort()).toEqual(["height", "width"]);
    expect([typeof dimensions.width, typeof dimensions.height]).toEqual(["number", "number"]);
    const reset = await request(base, "PUT", `/media/${seeded.mediaId}/framing`, { token: seeded.editor, json: {} });
    expect(reset.status).toBe(200);
    expect(boundaryCast<Json>((await request(base, "GET", `/media/${seeded.mediaId}`)).json, "json").focus).toBeNull();
  });

  it("gives a caller without a session the crop each variant shows, null for the whole image and the cut of a manual crop", async () => {
    const before = boundaryCast<Json[]>(boundaryCast<Json>((await request(base, "GET", `/media/${seeded.mediaId}`)).json, "json").variants, "json");
    expect(before.length).toBeGreaterThan(0);
    for (const variant of before) expect(variant, String(variant.size)).toHaveProperty("crop", null);
    const registered = await request(base, "PUT", "/admin/images/sizes", { token: seeded.admin, json: { sizes: [{ name: "avatar", width: 96, height: 96, fit: "cover" }] } });
    expect(registered.status, registered.text.slice(0, 300)).toBe(200);
    const framed = await request(base, "PUT", `/media/${seeded.mediaId}/framing`, { token: seeded.editor, json: { crops: { "1:1": { x: 0, y: 0, w: 0.5, h: 0.857 } } } });
    expect(framed.status).toBe(200);
    let avatar: Json | undefined;
    for (let attempt = 0; attempt < 60 && !isRecord(avatar?.crop); attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250));
      const variants = boundaryCast<Json[]>(boundaryCast<Json>((await request(base, "GET", `/media/${seeded.mediaId}`)).json, "json").variants, "json");
      avatar = variants.find((variant) => variant.size === "avatar");
    }
    expect(avatar?.crop).toEqual({ left: 0, top: 0, width: 600, height: 600 });
    const reset = await request(base, "PUT", `/media/${seeded.mediaId}/framing`, { token: seeded.editor, json: {} });
    expect(reset.status).toBe(200);
  }, 30_000);
});
