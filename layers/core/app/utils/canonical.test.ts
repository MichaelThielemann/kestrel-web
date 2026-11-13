import { describe, expect, it } from "vitest";
import { absoluteUrl, canonicalUrl } from "./canonical";

describe("canonicalUrl", () => {
  it("ends the home page in a slash, gives every other page none and keeps a base path", () => {
    expect(canonicalUrl("https://Example.test/de/", "/")).toBe("https://example.test/de/");
    expect(canonicalUrl("https://example.test/de", "/about")).toBe("https://example.test/de/about");
    expect(canonicalUrl("https://example.test:443", "/en/about-us")).toBe("https://example.test/en/about-us");
  });

  it("gives nothing without a site URL or with one that is not a site URL", () => {
    expect(canonicalUrl("", "/about")).toBe("");
    expect(canonicalUrl(undefined, "/about")).toBe("");
    expect(canonicalUrl("example.test", "/about")).toBe("");
    expect(canonicalUrl("ftp://example.test", "/about")).toBe("");
  });
});

describe("absoluteUrl", () => {
  it("puts a root-relative path under the normalised site URL, and leaves it relative without one", () => {
    expect(absoluteUrl("https://example.test/", "/media/a.jpg")).toBe("https://example.test/media/a.jpg");
    expect(absoluteUrl("", "/media/a.jpg")).toBe("/media/a.jpg");
  });
});
