import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { hashPassword } from "./password.mjs";
import { envFile, renderTemplate, templateValues } from "./render.mjs";

const ENV_FILE = ".env";

export function readVersions(packageRoot) {
  const parsed = JSON.parse(readFileSync(join(packageRoot, "versions.json"), "utf8"));
  return parsed;
}

export function targetName(relativePath) {
  const segments = relativePath.split("/");
  const last = segments[segments.length - 1];
  segments[segments.length - 1] = last.startsWith("_") ? `.${last.slice(1)}` : last;
  return segments.join("/");
}

export function templateEntries(templateDir) {
  const entries = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else entries.push(relative(templateDir, full).split(/[\\/]/).join("/"));
    }
  };
  walk(templateDir);
  return entries;
}

export function projectFiles(answers, versions, templateDir) {
  const values = templateValues(answers, versions);
  const files = new Map();
  for (const entry of templateEntries(templateDir)) {
    files.set(targetName(entry), renderTemplate(readFileSync(join(templateDir, entry), "utf8"), values));
  }
  files.set(ENV_FILE, envFile(answers, hashPassword(answers.password)));
  return files;
}

export function occupants(directory) {
  try {
    return readdirSync(directory).filter((entry) => entry !== ".git" && entry !== ".DS_Store");
  } catch {
    return [];
  }
}

export function writeProject(directory, files) {
  for (const [path, content] of files) {
    const full = join(directory, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}
