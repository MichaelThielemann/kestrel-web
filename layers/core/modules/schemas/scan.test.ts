import { describe, expect, it } from "vitest";
import { bundledSchemaPaths, inlineSchemas, renderSchemasModule } from "./scan";

const sources = { rootDir: "/app", buildDir: "/app/.cache/.nuxt", navigationDefault: "/layer/schemas/settings.navigation.json", redirectsDefault: "/layer/schemas/redirects.rules.json" };

describe("bundledSchemaPaths", () => {
  it("uses the layer defaults when the consumer ships no schema files", () => {
    const paths = bundledSchemaPaths(sources, (p) => p === "/app/.cache/.nuxt/kestrel/pages.body.json", () => []);
    expect(paths).toEqual({
      "pages.body": "/app/.cache/.nuxt/kestrel/pages.body.json",
      "settings.navigation": "/layer/schemas/settings.navigation.json",
      "redirects.rules": "/layer/schemas/redirects.rules.json",
    });
  });

  it("prefers the consumer navigation schema and picks up hand-written body schemas", () => {
    const existing = new Set(["/app/schemas", "/app/schemas/settings.navigation.json"]);
    const paths = bundledSchemaPaths(sources, (p) => existing.has(p), () => ["news.body.json", "settings.navigation.json", "notes.txt"]);
    expect(paths["settings.navigation"]).toBe("/app/schemas/settings.navigation.json");
    expect(paths["news.body"]).toBe("/app/schemas/news.body.json");
    expect(paths).not.toHaveProperty("pages.body");
    expect(paths).not.toHaveProperty("notes");
  });
});

describe("inlineSchemas / renderSchemasModule", () => {
  it("parses every file and renders a default export", () => {
    const inline = inlineSchemas({ "pages.body": "/a.json" }, () => '{"type":"array"}');
    expect(inline).toEqual({ "pages.body": { type: "array" } });
    expect(renderSchemasModule({ mode: "inline", schemas: inline })).toBe('export default {"mode":"inline","schemas":{"pages.body":{"type":"array"}}};\n');
  });
});
