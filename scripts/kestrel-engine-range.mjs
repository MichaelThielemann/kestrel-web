#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_PATH = join(ROOT, "package.json");
export const PLUGIN_ENTRY = "./cli/plugin.mjs";
export const PLUGIN_API = 4;

export function expectedKestrelField(manifest) {
  const range = manifest.dependencies?.["@michaelthielemann/kestrel"];
  if (typeof range !== "string") throw new Error('package.json: dependencies["@michaelthielemann/kestrel"] is missing');
  if (!/^\^\d+\.\d+\.\d+$/.test(range)) {
    throw new Error(`package.json: dependencies["@michaelthielemann/kestrel"] is "${range}", but the kestrel field's engine accepts only ^<major>.<minor>.<patch>`);
  }
  return { plugin: PLUGIN_ENTRY, pluginApi: PLUGIN_API, engine: range };
}

export function kestrelFieldProblem(manifest) {
  const wanted = JSON.stringify(expectedKestrelField(manifest));
  const current = JSON.stringify(manifest.kestrel);
  return current === wanted ? undefined : `package.json: the kestrel field is ${current ?? "missing"}, expected ${wanted}`;
}

export function withKestrelField(source) {
  const manifest = JSON.parse(source);
  const field = expectedKestrelField(manifest);
  const entries = Object.entries(manifest).filter(([key]) => key !== "kestrel");
  const at = entries.findIndex(([key]) => key === "publishConfig");
  entries.splice(at === -1 ? entries.length : at, 0, ["kestrel", field]);
  return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
}

function main() {
  const source = readFileSync(MANIFEST_PATH, "utf8");
  if (!process.argv.includes("--check")) {
    writeFileSync(MANIFEST_PATH, withKestrelField(source));
    return;
  }
  const problem = kestrelFieldProblem(JSON.parse(source));
  if (problem === undefined) return;
  process.stderr.write(`${problem} — run \`node scripts/kestrel-engine-range.mjs\`\n`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
