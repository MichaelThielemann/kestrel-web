#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = (process.env.KESTREL_RELEASE_REGISTRY ?? "https://registry.npmjs.org").replace(/\/+$/, "");
const PLAN = "release.json";
const SUMS = "SHA512SUMS";
const OWN_VERSION = new Set(["create-kestrel"]);

function fail(message) {
  process.stderr.write(`release: ${message}\n`);
  process.exit(1);
}

function args(argv) {
  const out = { command: argv[0], dryRun: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--tag") out.tag = argv[++i];
    else if (argv[i] === "--dir") out.dir = argv[++i];
    else if (argv[i] === "--root") out.root = argv[++i];
    else if (argv[i] === "--dry-run") out.dryRun = true;
    else fail(`unknown argument ${argv[i]}`);
  }
  return out;
}

function versionOf(tag) {
  const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag ?? "");
  if (match === null) fail(`"${tag ?? ""}" is not a release tag of the form v<major>.<minor>.<patch>`);
  return match[1];
}

function manifestAt(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return { dir, name: manifest.name, version: manifest.version, private: manifest.private === true };
}

function publishablePackages(root) {
  const dirs = [root, join(root, "packages", "renderer-nuxt"), join(root, "packages", "create-kestrel")];
  return dirs.filter((dir) => existsSync(join(dir, "package.json"))).map(manifestAt).filter((pkg) => !pkg.private);
}

function tarballName(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

function integrityOf(file) {
  return `sha512-${createHash("sha512").update(readFileSync(file)).digest("base64")}`;
}

function sha512Hex(file) {
  return createHash("sha512").update(readFileSync(file)).digest("hex");
}

async function registryEntry(name, version) {
  const response = await fetch(`${REGISTRY}/${name.replace("/", "%2f")}/${encodeURIComponent(version)}`, { signal: globalThis.AbortSignal.timeout(30000) });
  if (response.status === 404) return null;
  if (!response.ok) fail(`the registry answered ${response.status} for ${name}@${version}`);
  const body = await response.json();
  return { integrity: typeof body?.dist?.integrity === "string" ? body.dist.integrity : "", tarball: typeof body?.dist?.tarball === "string" ? body.dist.tarball : "" };
}

function tarEntries(gzipped) {
  const data = gunzipSync(gzipped);
  const files = new Map();
  for (let offset = 0; offset + 512 <= data.length; ) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
    const size = Number.parseInt(field(124, 12).trim() || "0", 8);
    const prefix = field(345, 155);
    const name = prefix === "" ? field(0, 100) : `${prefix}/${field(0, 100)}`;
    const type = field(156, 1);
    if (type === "0" || type === "") files.set(name.replace(/^[^/]+\//, ""), createHash("sha512").update(data.subarray(offset + 512, offset + 512 + size)).digest("hex"));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

function sameContent(a, b) {
  const left = tarEntries(a);
  const right = tarEntries(b);
  return left.size === right.size && [...left].every(([name, hash]) => right.get(name) === hash);
}

function pack(pkg, dir) {
  execFileSync("pnpm", ["pack", "--pack-destination", dir], { cwd: pkg.dir, stdio: ["ignore", "ignore", "inherit"] });
  const file = tarballName(pkg.name, pkg.version);
  if (!existsSync(join(dir, file))) fail(`pnpm pack did not write ${file}`);
  return file;
}

async function plan(options) {
  const root = resolve(options.root ?? ROOT);
  const version = versionOf(options.tag);
  const packages = publishablePackages(root);
  const mismatched = packages.filter((pkg) => !OWN_VERSION.has(pkg.name) && pkg.version !== version);
  if (mismatched.length > 0) fail(`every published package but ${[...OWN_VERSION].join(", ")} must carry the tag version ${version}: ${mismatched.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")}`);
  const dir = resolve(options.dir ?? "release-artifacts");
  mkdirSync(dir, { recursive: true });
  const entries = [];
  for (const pkg of packages) {
    const file = pack(pkg, dir);
    if (OWN_VERSION.has(pkg.name)) {
      const published = await registryEntry(pkg.name, pkg.version);
      if (published !== null) {
        const response = await fetch(published.tarball, { signal: globalThis.AbortSignal.timeout(60000) });
        if (!response.ok) fail(`could not download ${pkg.name}@${pkg.version} from the registry (${response.status})`);
        if (!sameContent(Buffer.from(await response.arrayBuffer()), readFileSync(join(dir, file)))) {
          fail(`${pkg.name}@${pkg.version} is on the registry with other content than this checkout: bump its version`);
        }
        rmSync(join(dir, file));
        process.stdout.write(`keep    ${pkg.name}@${pkg.version} (unchanged, already on the registry)\n`);
        continue;
      }
    }
    entries.push({ name: pkg.name, version: pkg.version, file, integrity: integrityOf(join(dir, file)) });
    process.stdout.write(`packed  ${pkg.name}@${pkg.version}\n`);
  }
  writeFileSync(join(dir, PLAN), `${JSON.stringify({ tag: options.tag, packages: entries }, null, 2)}\n`);
  writeFileSync(join(dir, SUMS), entries.map((entry) => `${sha512Hex(join(dir, entry.file))}  ${entry.file}\n`).join(""));
}

async function publish(options) {
  const dir = resolve(options.dir ?? "release-artifacts");
  const version = versionOf(options.tag);
  const release = JSON.parse(readFileSync(join(dir, PLAN), "utf8"));
  if (release.tag !== options.tag) fail(`the artifacts were built for ${release.tag}, not ${options.tag}`);
  const sums = new Map(readFileSync(join(dir, SUMS), "utf8").trim().split("\n").filter((line) => line !== "").map((line) => {
    const [hash, file] = line.split(/\s+/);
    return [file, hash];
  }));
  for (const entry of release.packages) {
    if (!OWN_VERSION.has(entry.name) && entry.version !== version) fail(`${entry.name}@${entry.version} does not carry the tag version ${version}`);
    const file = join(dir, entry.file);
    if (sums.get(entry.file) !== sha512Hex(file) || integrityOf(file) !== entry.integrity) fail(`${entry.file} does not match its recorded checksum`);
  }
  const decisions = [];
  for (const entry of release.packages) {
    const published = await registryEntry(entry.name, entry.version);
    if (published === null) decisions.push({ entry, action: "publish" });
    else if (published?.integrity === entry.integrity) decisions.push({ entry, action: "done" });
    else decisions.push({ entry, action: "conflict" });
  }
  const conflicts = decisions.filter((decision) => decision.action === "conflict").map((decision) => `${decision.entry.name}@${decision.entry.version}`);
  if (conflicts.length > 0) fail(`already on the registry with different content: ${conflicts.join(", ")}; nothing of this release is published`);
  for (const { entry, action } of decisions) {
    if (action === "done") {
      process.stdout.write(`done    ${entry.name}@${entry.version} (this artifact is already on the registry)\n`);
      continue;
    }
    process.stdout.write(`publish ${entry.name}@${entry.version}\n`);
    if (options.dryRun) continue;
    execFileSync("pnpm", ["publish", join(dir, entry.file), "--access", "public", "--provenance", "--no-git-checks"], { cwd: dir, stdio: "inherit" });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = args(process.argv.slice(2));
  if (options.command === "plan") await plan(options);
  else if (options.command === "publish") await publish(options);
  else fail("usage: release.mjs plan --tag v<version> [--dir <dir>] | publish --tag v<version> [--dir <dir>] [--dry-run]");
}
