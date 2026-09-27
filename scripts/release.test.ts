import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "release.mjs");

interface Outcome {
  code: number;
  stdout: string;
  stderr: string;
}

interface Planned {
  tag: string;
  packages: { name: string; version: string; file: string; integrity: string }[];
}

function run(args: string[], env: Record<string, string> = {}): Promise<Outcome> {
  return new Promise((done) => {
    execFile(process.execPath, [SCRIPT, ...args], { env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      done({ code: error === null ? 0 : typeof error.code === "number" ? error.code : 1, stdout, stderr });
    });
  });
}

let root: string;
let out: string;
let server: Server | undefined;
let registryUrl = "";
const published = new Map<string, { integrity: string; file?: string }>();

function writePackage(dir: string, manifest: Record<string, unknown>, source: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ files: ["index.js"], ...manifest }));
  writeFileSync(join(dir, "index.js"), source);
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "kestrel-web-release-root-"));
  out = join(root, "artifacts");
  published.clear();
  writePackage(root, { name: "@example/layer", version: "2.1.0" }, "export default 1;\n");
  writePackage(join(root, "packages", "renderer-nuxt"), { name: "@example/renderer", version: "2.1.0" }, "export default 2;\n");
  writePackage(join(root, "packages", "create-kestrel"), { name: "create-kestrel", version: "5.1.0" }, "export default 3;\n");
  server = createServer((request, response) => {
    const path = decodeURIComponent(request.url ?? "").replace(/^\//, "");
    if (path.startsWith("tarballs/")) {
      const entry = [...published.values()].find((candidate) => candidate.file !== undefined && path === `tarballs/${candidate.file.split("/").at(-1) ?? ""}`);
      if (entry?.file === undefined) response.writeHead(404).end();
      else response.writeHead(200).end(readFileSync(entry.file));
      return;
    }
    const entry = published.get(path);
    if (entry === undefined) {
      response.writeHead(404).end("{}");
      return;
    }
    const tarball = entry.file === undefined ? "" : `${registryUrl}/tarballs/${entry.file.split("/").at(-1) ?? ""}`;
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ dist: { integrity: entry.integrity, tarball } }));
  });
  await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
  const address = server.address();
  registryUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
});

afterEach(async () => {
  rmSync(root, { recursive: true, force: true });
  if (server !== undefined) await new Promise((done) => server?.close(done));
  server = undefined;
});

function planned(): Planned {
  const parsed: unknown = JSON.parse(readFileSync(join(out, "release.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("packages" in parsed) || !Array.isArray(parsed.packages)) throw new Error("release.json has no packages");
  const packages = parsed.packages.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) throw new Error("bad entry");
    return { name: String(Reflect.get(entry, "name")), version: String(Reflect.get(entry, "version")), file: String(Reflect.get(entry, "file")), integrity: String(Reflect.get(entry, "integrity")) };
  });
  return { tag: String(Reflect.get(parsed, "tag")), packages };
}

function plan(tag = "v2.1.0"): Promise<Outcome> {
  return run(["plan", "--tag", tag, "--root", root, "--dir", out], { KESTREL_RELEASE_REGISTRY: registryUrl });
}

function publishDry(tag = "v2.1.0"): Promise<Outcome> {
  return run(["publish", "--tag", tag, "--dir", out, "--dry-run"], { KESTREL_RELEASE_REGISTRY: registryUrl });
}

describe("release plan", () => {
  it("packs the layer and the renderer at the tag version, and create-kestrel when its version is new", async () => {
    const result = await plan();
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(planned().packages.map((entry) => `${entry.name}@${entry.version}`)).toEqual(["@example/layer@2.1.0", "@example/renderer@2.1.0", "create-kestrel@5.1.0"]);
    expect(readFileSync(join(out, "SHA512SUMS"), "utf8").trim().split("\n")).toHaveLength(3);
  }, 60000);

  it("refuses a tag the layer or the renderer does not carry", async () => {
    writePackage(join(root, "packages", "renderer-nuxt"), { name: "@example/renderer", version: "2.0.9" }, "export default 2;\n");
    const result = await plan();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("@example/renderer@2.0.9");
  }, 60000);

  it("leaves out an unchanged create-kestrel whose version is already on the registry", async () => {
    await plan();
    const kept = join(mkdtempSync(join(tmpdir(), "kestrel-web-release-registry-")), "create-kestrel-5.1.0.tgz");
    copyFileSync(join(out, "create-kestrel-5.1.0.tgz"), kept);
    published.set("create-kestrel/5.1.0", { integrity: "sha512-registry", file: kept });
    rmSync(out, { recursive: true, force: true });
    const result = await plan();
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("keep    create-kestrel@5.1.0");
    expect(planned().packages.map((entry) => entry.name)).toEqual(["@example/layer", "@example/renderer"]);
    rmSync(dirname(kept), { recursive: true, force: true });
  }, 60000);

  it("refuses a create-kestrel whose version is on the registry with other content", async () => {
    await plan();
    const kept = join(mkdtempSync(join(tmpdir(), "kestrel-web-release-registry-")), "create-kestrel-5.1.0.tgz");
    copyFileSync(join(out, "create-kestrel-5.1.0.tgz"), kept);
    published.set("create-kestrel/5.1.0", { integrity: "sha512-registry", file: kept });
    writeFileSync(join(root, "packages", "create-kestrel", "index.js"), "export default 4;\n");
    const result = await plan();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("create-kestrel@5.1.0 is on the registry with other content than this checkout: bump its version");
    rmSync(dirname(kept), { recursive: true, force: true });
  }, 60000);
});

describe("release publish", () => {
  it("publishes every planned package that is not on the registry yet", async () => {
    await plan();
    const result = await publishDry();
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("publish @example/layer@2.1.0\npublish @example/renderer@2.1.0\npublish create-kestrel@5.1.0\n");
  }, 60000);

  it("fails when a planned version is already on the registry with other content", async () => {
    await plan();
    published.set("@example/renderer/2.1.0", { integrity: "sha512-other" });
    const result = await publishDry();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("@example/renderer@2.1.0 is already on the registry with different content");
  }, 60000);

  it("treats a version already published from this very artifact as done", async () => {
    await plan();
    const layer = planned().packages.find((entry) => entry.name === "@example/layer");
    published.set("@example/layer/2.1.0", { integrity: layer?.integrity ?? "" });
    const result = await publishDry();
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("done    @example/layer@2.1.0 (this artifact is already on the registry)\n");
  }, 60000);

  it("refuses artifacts that do not match their checksums or were built for another tag", async () => {
    await plan();
    expect((await publishDry("v2.1.1")).stderr).toContain("built for v2.1.0");
    writeFileSync(join(out, "example-renderer-2.1.0.tgz"), "not the packed file");
    const tampered = await publishDry();
    expect(tampered.code).toBe(1);
    expect(tampered.stderr).toContain("example-renderer-2.1.0.tgz does not match its recorded checksum");
  }, 60000);
});
