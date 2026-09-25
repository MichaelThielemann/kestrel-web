import { describe, expect, it, vi } from "vitest";
import { rendererTarget } from "./renderer-target";

const app = { baseURL: "/", buildAssetsDir: "/_nuxt/", cdnURL: "" };

describe("rendererTarget", () => {
  it("renders through Nitro's localFetch with the path only, so no request data reaches a publish", async () => {
    const response = new Response("<html></html>");
    const localFetch = vi.fn((_path: string) => Promise.resolve(response));
    const target = rendererTarget({ localFetch }, app, ["a.js"], false);

    await expect(target.fetch("/about")).resolves.toBe(response);
    expect(localFetch).toHaveBeenCalledTimes(1);
    expect(localFetch.mock.calls[0]).toEqual(["/about"]);
  });

  it("names the build assets under the build assets directory, unless a CDN serves them", () => {
    const localFetch = () => Promise.resolve(new Response(""));
    expect(rendererTarget({ localFetch }, app, ["a.js"], false)).toMatchObject({ dev: false, baseURL: "/", buildAssets: { dir: "/_nuxt/", paths: ["a.js"] } });
    expect(rendererTarget({ localFetch }, { ...app, cdnURL: "https://cdn.example" }, ["a.js"], true)).not.toHaveProperty("buildAssets");
  });
});
