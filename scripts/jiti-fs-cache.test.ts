import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { PLUGIN_API_VERSION } from "@michaelthielemann/kestrel-upgrade/hosts";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIPPED_DIRS = new Set(["node_modules", ".nuxt", ".output", "dist"]);
const SOURCE = /\.(?:[cm]?[jt]s|vue)$/;

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) sourceFiles(join(dir, entry.name), out);
    } else if (entry.isFile() && SOURCE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function createJitiCalls(source: string): string[] {
  const calls: string[] = [];
  for (let start = source.indexOf("createJiti("); start !== -1; start = source.indexOf("createJiti(", start + 1)) {
    let depth = 0;
    let end = start + "createJiti".length;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")" && --depth === 0) break;
    }
    calls.push(source.slice(start, end + 1));
  }
  return calls;
}

function listTree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" });
}

describe("jiti's transpile cache", () => {
  it("is switched off in every createJiti call under cli/ and layers/", () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of [...sourceFiles(join(ROOT, "cli")), ...sourceFiles(join(ROOT, "layers"))]) {
      if (file === fileURLToPath(import.meta.url)) continue;
      for (const call of createJitiCalls(readFileSync(file, "utf8"))) {
        seen++;
        if (!/\bfsCache:\s*false\b/.test(call)) offenders.push(`${relative(ROOT, file)}: ${call}`);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("leaves nothing in the temp directory when the kestrel CLI loads the layer's plugin and reads a project's model", async () => {
    const temp = mkdtempSync(join(tmpdir(), "kestrel-web-jiti-temp-"));
    dirs.push(temp);
    const project = mkdtempSync(join(tmpdir(), "kestrel-web-jiti-project-"));
    dirs.push(project);
    mkdirSync(join(project, "shared"), { recursive: true });
    writeFileSync(join(project, "shared", "model.ts"), 'export const contentModel: { types: Record<string, unknown> } = { types: {} };\n');
    const script = [
      `const mod = await import(${JSON.stringify(pathToFileURL(join(ROOT, "cli/plugin.mjs")).href)});`,
      `const plugin = await mod.default({ pluginApiVersion: ${PLUGIN_API_VERSION}, cliVersion: "0.0.0" });`,
      `await plugin.dataModel(${JSON.stringify(project)});`,
    ].join("\n");
    await execFileAsync(process.execPath, ["--input-type=module", "--eval", script], { cwd: ROOT, env: { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp } });
    expect(listTree(temp)).toEqual([]);
  }, 60000);
});
