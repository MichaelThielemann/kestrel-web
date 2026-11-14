import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VISUAL_IMAGE } from "../e2e/support/env.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null) throw new Error(`${path} holds no JSON object`);
  return Object.fromEntries(Object.entries(value));
}

function versionOf(path: string): unknown {
  return readJson(path).version;
}

function imageVersion(image: string): string {
  const match = /^mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-[a-z]+@sha256:[0-9a-f]{64}$/.exec(image);
  if (!match?.[1]) throw new Error(`${image} is not a Playwright image pinned by tag and digest`);
  return match[1];
}

describe("the Playwright runner and the visual image", () => {
  const version = imageVersion(VISUAL_IMAGE);

  it("pins @playwright/test to the exact version of the visual image", () => {
    const devDependencies = readJson(join(ROOT, "package.json")).devDependencies;
    expect(devDependencies).toMatchObject({ "@playwright/test": version });
  });

  it("runs the visual CI job in the same image", () => {
    const ci = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).toContain(`image: ${VISUAL_IMAGE}\n`);
  });

  it("installs the image's version for the runner and for the accessibility checks", () => {
    expect(versionOf(join(ROOT, "node_modules", "@playwright", "test", "package.json"))).toBe(version);
    const fromAxe = createRequire(join(realpathSync(join(ROOT, "node_modules", "@axe-core", "playwright")), "package.json"));
    expect(versionOf(fromAxe.resolve("playwright-core/package.json"))).toBe(version);
  });
});
