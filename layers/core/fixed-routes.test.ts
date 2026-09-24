import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADMIN_BOOTSTRAP_ROUTES, LAYER_ROUTES } from "./fixed-routes";
import { canonicalTriggers } from "./pipelines/triggers";

function nitroFileFor(path: string): string {
  return fileURLToPath(new URL(`./server/api${path}.get.ts`, import.meta.url));
}

describe("LAYER_ROUTES", () => {
  it("names layer routes that have a server route file", () => {
    for (const route of Object.values(LAYER_ROUTES)) {
      expect(existsSync(nitroFileFor(route.path)), `expected a Nitro route file for "${route.path}"`).toBe(true);
    }
  });
});

describe("ADMIN_BOOTSTRAP_ROUTES", () => {
  it("matches the preset's login, logout and me triggers", () => {
    const httpTriggers = canonicalTriggers.filter((entry): entry is { trigger: { http: string; pipeline: string } } => "http" in entry.trigger).map((entry) => entry.trigger);
    for (const [pipeline, route] of Object.entries(ADMIN_BOOTSTRAP_ROUTES)) {
      expect(httpTriggers).toContainEqual({ http: `${route.method} ${route.path}`, pipeline });
    }
  });
});
