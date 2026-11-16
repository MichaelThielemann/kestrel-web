import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { isUpgradePlugin, loadHostPlugins, PLUGIN_API_VERSION, scanHosts } from "@michaelthielemann/kestrel-upgrade/hosts";
import { expectedKestrelField, kestrelFieldProblem } from "./kestrel-engine-range.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST: Record<string, unknown> = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const KESTREL_RANGE: string = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).dependencies["@michaelthielemann/kestrel"];
const CORE_VERSION: string = JSON.parse(readFileSync(join(ROOT, "node_modules/@michaelthielemann/kestrel/package.json"), "utf8")).version;

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function consumerProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-web-plugin-entry-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "example-site", private: true, dependencies: { "@michaelthielemann/kestrel-web": "*" } }));
  mkdirSync(join(dir, "node_modules", "@michaelthielemann"), { recursive: true });
  symlinkSync(ROOT, join(dir, "node_modules", "@michaelthielemann", "kestrel-web"));
  return dir;
}

describe("the kestrel plugin entry", () => {
  it("builds the layer's plugin, with hostChecks, from the factory the kestrel field names", async () => {
    const mod: unknown = await import(pathToFileURL(join(ROOT, "cli/plugin.mjs")).href);
    const factory = typeof mod === "object" && mod !== null && "default" in mod ? mod.default : undefined;
    expect(typeof factory).toBe("function");
    const plugin: unknown = typeof factory === "function" ? await factory({ pluginApiVersion: PLUGIN_API_VERSION, cliVersion: CORE_VERSION }) : undefined;
    expect(isUpgradePlugin(plugin)).toBe(true);
    if (!isUpgradePlugin(plugin)) return;
    expect(plugin.kind).toBe("kestrel-web");
    expect(typeof plugin.hostChecks).toBe("function");
  });

  it("is found and loaded by the kestrel CLI's host scan of a project that depends on the layer", async () => {
    const scan = scanHosts(consumerProject(), { cliVersion: CORE_VERSION });
    expect(scan.refused).toEqual([]);
    expect(scan.outdated).toEqual([]);
    expect(scan.loadable.map((host) => host.package)).toEqual(["@michaelthielemann/kestrel-web"]);
    const { loaded, refused } = await loadHostPlugins(scan.loadable, { pluginApiVersion: PLUGIN_API_VERSION, cliVersion: CORE_VERSION });
    expect(refused).toEqual([]);
    expect(loaded.map((host) => host.kind)).toEqual(["kestrel-web"]);
  });

  it("declares the plugin API of the installed kestrel CLI, which loads the plugin with its ops hook", async () => {
    expect(PLUGIN_API_VERSION).toBe(6);
    const scan = scanHosts(consumerProject(), { cliVersion: CORE_VERSION });
    expect(scan.loadable.map((host) => host.pluginApi)).toEqual([PLUGIN_API_VERSION]);
    const { loaded } = await loadHostPlugins(scan.loadable, { pluginApiVersion: PLUGIN_API_VERSION, cliVersion: CORE_VERSION });
    const facts = await loaded[0]?.plugin.ops?.("/srv/example-site");
    expect(facts?.readyPath).toBe("/api/ready");
    expect(facts?.databaseFile?.({ KESTREL_DATA_DIR: "/var/lib/site" })).toBe("/var/lib/site/kestrel.db");
  });

  it("is reported outdated to a kestrel CLI of another major", () => {
    const [major] = CORE_VERSION.split(".");
    const scan = scanHosts(consumerProject(), { cliVersion: `${Number(major) + 1}.0.0` });
    expect(scan.loadable).toEqual([]);
    expect(scan.outdated.map((host) => host.package)).toEqual(["@michaelthielemann/kestrel-web"]);
  });

  it("is packed, and no bin is", async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    const packed: unknown = JSON.parse(stdout.slice(stdout.search(/^[[{]/m)));
    const entry: unknown = Array.isArray(packed) ? packed[0] : typeof packed === "object" && packed !== null ? Object.values(packed)[0] : undefined;
    const files: unknown[] = typeof entry === "object" && entry !== null && "files" in entry && Array.isArray(entry.files) ? entry.files : [];
    const paths = files.map((file) => (typeof file === "object" && file !== null && "path" in file ? String(file.path) : ""));
    expect(paths).toContain("cli/plugin.mjs");
    expect(paths.filter((path: string) => path.startsWith("bin/"))).toEqual([]);
    expect(MANIFEST.bin).toBeUndefined();
  }, 60_000);
});

describe("the kestrel field's engine range", () => {
  it("matches the layer's own kestrel dependency range", () => {
    expect(kestrelFieldProblem(MANIFEST)).toBeUndefined();
    expect(expectedKestrelField(MANIFEST).engine).toBe(KESTREL_RANGE);
  });

  it("is reported stale once the field is edited by hand", () => {
    const edited = { ...MANIFEST, kestrel: { plugin: "./cli/plugin.mjs", pluginApi: 4, engine: "^99.0.0" } };
    expect(kestrelFieldProblem(edited)).toContain('"engine":"^99.0.0"');
    const withoutField = Object.fromEntries(Object.entries(MANIFEST).filter(([key]) => key !== "kestrel"));
    expect(kestrelFieldProblem(withoutField)).toContain("missing");
  });

  it("refuses a kestrel dependency range the CLI's host scan would not accept", () => {
    const manifest = { dependencies: { "@michaelthielemann/kestrel": ">=6.0.0" } };
    expect(() => expectedKestrelField(manifest)).toThrow("^<major>.<minor>.<patch>");
  });
});
