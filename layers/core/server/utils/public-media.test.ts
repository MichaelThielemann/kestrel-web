import { describe, expect, it } from "vitest";
import type { Route } from "@michaelthielemann/kestrel";
import { publicMediaRoutes, withHeadRoutes } from "./public-media";

function route(over: Partial<Route>): Route {
  return { method: "GET", segments: [], pipeline: "unused", ...over };
}

describe("publicMediaRoutes", () => {
  it("keeps the file route and the variant route", () => {
    const routes = [
      route({ segments: ["media", ":id", ":name"], pipeline: "serveMediaFile" }),
      route({ segments: ["media", ":id", "variants", ":file"], pipeline: "serveImageVariant" }),
    ];
    const kept = publicMediaRoutes(routes);
    expect(kept.map((r) => r.pipeline)).toEqual(["serveMediaFile", "serveImageVariant"]);
  });

  it("drops every other media route: get by id, folders, download, folder listing", () => {
    const routes = [
      route({ segments: ["media", ":id"], pipeline: "getMedia" }),
      route({ segments: ["media"], pipeline: "listMedia" }),
      route({ segments: ["media", "folders"], pipeline: "listMediaFolders" }),
      route({ segments: ["media", ":id", "file"], pipeline: "downloadMedia" }),
      route({ method: "PATCH", segments: ["media", ":id"], pipeline: "updateMedia" }),
      route({ method: "DELETE", segments: ["media", ":id"], pipeline: "deleteMedia" }),
    ];
    expect(publicMediaRoutes(routes)).toEqual([]);
  });

  it("keeps only the file route when images-default is not loaded", () => {
    const routes = [route({ segments: ["media", ":id", ":name"], pipeline: "serveMediaFile" })];
    expect(publicMediaRoutes(routes).map((r) => r.pipeline)).toEqual(["serveMediaFile"]);
  });

  it("is a pattern match, not a pipeline-name match: a route bound to a different pipeline at the same pattern still counts", () => {
    const routes = [route({ segments: ["media", ":id", ":name"], pipeline: "getMedia" })];
    expect(publicMediaRoutes(routes)).toHaveLength(1);
  });
});

describe("withHeadRoutes", () => {
  it("adds a HEAD twin for every GET route and leaves the other methods alone", () => {
    const routes = [
      route({ segments: ["media", ":id", ":name"], pipeline: "serveMediaFile" }),
      route({ method: "PATCH", segments: ["media", ":id"], pipeline: "updateMedia" }),
    ];
    expect(withHeadRoutes(routes).map((r) => `${r.method} ${r.pipeline}`)).toEqual(["GET serveMediaFile", "PATCH updateMedia", "HEAD serveMediaFile"]);
  });

  it("keeps a HEAD route a pipeline declares itself instead of shadowing it with a twin", () => {
    const routes = [
      route({ segments: ["status"], pipeline: "readStatus" }),
      route({ method: "HEAD", segments: ["status"], pipeline: "probeStatus" }),
    ];
    expect(withHeadRoutes(routes).filter((r) => r.method === "HEAD").map((r) => r.pipeline)).toEqual(["probeStatus"]);
  });
});
