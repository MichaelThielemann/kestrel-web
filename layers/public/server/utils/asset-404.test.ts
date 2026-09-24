import { describe, expect, it } from "vitest";
import { isMissingAsset } from "./asset-404";

describe("isMissingAsset", () => {
  it("404s a path that looks like a static file with no route behind it", () => {
    expect(isMissingAsset("/robots.txt")).toBe(true);
    expect(isMissingAsset("/does-not-exist.css")).toBe(true);
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
