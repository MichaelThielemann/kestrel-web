import { afterEach, describe, expect, it, vi } from "vitest";
import { envBuildAssetsPath, joinBuildAssetsPath, servedPathPrefixes } from "./mount-path";

describe("joinBuildAssetsPath", () => {
  it.each([
    ["/", "/_nuxt/", "/_nuxt"],
    ["/", "/assets/", "/assets"],
    ["/", "assets", "/assets"],
    ["/site/", "/_nuxt/", "/site/_nuxt"],
    ["site", "assets/", "/site/assets"],
    ["", "/_nuxt/", "/_nuxt"],
    ["/site//", "//_nuxt//", "/site/_nuxt"],
  ])("joins the base %j and the directory %j to %j", (baseURL, dir, expected) => {
    expect(joinBuildAssetsPath(baseURL, dir)).toBe(expected);
  });

  it("answers undefined when the build assets are served at the root, which no redirect source may reserve", () => {
    expect(joinBuildAssetsPath("/", "/")).toBeUndefined();
    expect(joinBuildAssetsPath("", "")).toBeUndefined();
  });
});

describe("servedPathPrefixes", () => {
  it("lists the paths the server answers itself and the build assets path", () => {
    expect(servedPathPrefixes("/_nuxt")).toEqual(["/api", "/admin", "/media", "/_nuxt", "/__nuxt_island", "/__nuxt_error", "/_ipx", "/_preview"]);
  });

  it("takes the build assets path of the site instead of /_nuxt", () => {
    const prefixes = servedPathPrefixes("/site/assets");
    expect(prefixes).toContain("/site/assets");
    expect(prefixes).not.toContain("/_nuxt");
  });

  it("names every route Nuxt registers for islands and errors, not the unused /__nuxt", () => {
    const prefixes = servedPathPrefixes("/_nuxt");
    expect(prefixes).toEqual(expect.arrayContaining(["/__nuxt_island", "/__nuxt_error"]));
    expect(prefixes).not.toContain("/__nuxt");
  });

  it("leaves the build assets out when they have no path of their own", () => {
    expect(servedPathPrefixes(undefined)).toEqual(["/api", "/admin", "/media", "/__nuxt_island", "/__nuxt_error", "/_ipx", "/_preview"]);
  });

  it("lists a path once", () => {
    expect(servedPathPrefixes("/media")).toEqual(["/api", "/admin", "/media", "/__nuxt_island", "/__nuxt_error", "/_ipx", "/_preview"]);
  });
});

describe("envBuildAssetsPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is /_nuxt while neither Nuxt variable is set", () => {
    vi.stubEnv("NUXT_APP_BASE_URL", undefined);
    vi.stubEnv("NUXT_APP_BUILD_ASSETS_DIR", undefined);
    expect(envBuildAssetsPath()).toBe("/_nuxt");
  });

  it("follows NUXT_APP_BUILD_ASSETS_DIR and NUXT_APP_BASE_URL in the environment it is called in", () => {
    vi.stubEnv("NUXT_APP_BASE_URL", undefined);
    vi.stubEnv("NUXT_APP_BUILD_ASSETS_DIR", "/assets/");
    expect(envBuildAssetsPath()).toBe("/assets");
    vi.stubEnv("NUXT_APP_BASE_URL", "/site/");
    expect(envBuildAssetsPath()).toBe("/site/assets");
  });

  it("ignores empty values", () => {
    vi.stubEnv("NUXT_APP_BASE_URL", "");
    vi.stubEnv("NUXT_APP_BUILD_ASSETS_DIR", "");
    expect(envBuildAssetsPath()).toBe("/_nuxt");
  });
});
