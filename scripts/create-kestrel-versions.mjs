#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_PATH = join(ROOT, "package.json");
export const VERSIONS_PATH = join(ROOT, "packages/create-kestrel/versions.json");

function required(manifest, section, name) {
  const value = manifest[section]?.[name];
  if (typeof value !== "string") throw new Error(`package.json: ${section}["${name}"] is missing`);
  return value;
}

export function expectedVersions(manifest) {
  return {
    kestrelWeb: `^${manifest.version}`,
    kestrel: required(manifest, "dependencies", "@michaelthielemann/kestrel"),
    insights: required(manifest, "peerDependencies", "@michaelthielemann/kestrel-insights"),
    vueFlow: required(manifest, "peerDependencies", "@vue-flow/core"),
    dagre: required(manifest, "peerDependencies", "@dagrejs/dagre"),
    nuxt: required(manifest, "peerDependencies", "nuxt"),
    vue: required(manifest, "peerDependencies", "vue"),
    vueRouter: required(manifest, "peerDependencies", "vue-router"),
    typescript: required(manifest, "dependencies", "typescript"),
    vueTsc: required(manifest, "devDependencies", "vue-tsc"),
  };
}

export function serialize(versions) {
  return `${JSON.stringify(versions, null, 2)}\n`;
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const wanted = serialize(expectedVersions(manifest));
  if (!process.argv.includes("--check")) {
    writeFileSync(VERSIONS_PATH, wanted);
    return;
  }
  const current = readFileSync(VERSIONS_PATH, "utf8");
  if (current === wanted) return;
  process.stderr.write("packages/create-kestrel/versions.json is stale — run `node scripts/create-kestrel-versions.mjs`\n");
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
