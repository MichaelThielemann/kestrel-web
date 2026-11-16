import { describe, expect, it } from "vitest";
import { isMissingAsset } from "./asset-404";

describe("isMissingAsset", () => {
  it("404s a path that looks like a static file with no route behind it", () => {
    expect(isMissingAsset("/favicon.png")).toBe(true);
    expect(isMissingAsset("/does-not-exist.css")).toBe(true);
  });

  it("passes through the exported index files at the site root only", () => {
    for (const path of ["/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt"]) expect(isMissingAsset(path), path).toBe(false);
    expect(isMissingAsset("/de/robots.txt")).toBe(true);
    expect(isMissingAsset("/Sitemap.xml")).toBe(true);
    expect(isMissingAsset("/llms.md")).toBe(true);
  });

  it("passes through /api, /media, /_nuxt, /__nuxt and /_ipx", () => {
    expect(isMissingAsset("/api/media/m1/file")).toBe(false);
    expect(isMissingAsset("/media/m1/photo.jpg")).toBe(false);
    expect(isMissingAsset("/media/m1/variants/thumb.webp")).toBe(false);
    expect(isMissingAsset("/_nuxt/entry.js")).toBe(false);
    expect(isMissingAsset("/__nuxt/foo.js")).toBe(false);
    expect(isMissingAsset("/_ipx/f_webp/foo.jpg")).toBe(false);
  });

  it("passes through a path with no extension and an .html path", () => {
    expect(isMissingAsset("/about")).toBe(false);
    expect(isMissingAsset("/about.html")).toBe(false);
  });
});
