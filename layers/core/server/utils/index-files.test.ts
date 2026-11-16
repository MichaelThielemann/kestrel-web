import { describe, expect, it } from "vitest";
import type { Route } from "@michaelthielemann/kestrel";
import { INDEX_FILE_NAMES as EXPORTED_NAMES, INDEX_FILE_TYPES } from "@michaelthielemann/kestrel-delivery-static/impl";
import { INDEX_FILE_NAMES } from "../../pipelines/delivery-names";
import { INDEX_FILE_INLINE_TYPES, indexFileRoutes } from "./index-files";

function route(over: Partial<Route>): Route {
  return { method: "GET", segments: [], pipeline: "unused", ...over };
}

describe("indexFileRoutes", () => {
  it("keeps the GET and HEAD routes of the four index files at the site root", () => {
    const routes = [
      route({ segments: ["sitemap.xml"], pipeline: "serveSitemapXml" }),
      route({ segments: ["robots.txt"], pipeline: "serveRobotsTxt" }),
      route({ segments: ["llms.txt"], pipeline: "serveLlmsTxt" }),
      route({ segments: ["llms-full.txt"], pipeline: "serveLlmsFullTxt" }),
      route({ method: "HEAD", segments: ["robots.txt"], pipeline: "serveRobotsTxt" }),
    ];
    expect(indexFileRoutes(routes).map((r) => `${r.method} ${r.pipeline}`)).toEqual([
      "GET serveSitemapXml",
      "GET serveRobotsTxt",
      "GET serveLlmsTxt",
      "GET serveLlmsFullTxt",
      "HEAD serveRobotsTxt",
    ]);
  });

  it("drops every other route, a nested or differently cased file name and a write to an index path among them", () => {
    const routes = [
      route({ segments: ["media", ":id", ":name"], pipeline: "serveMediaFile" }),
      route({ segments: ["site", "robots.txt"], pipeline: "nested" }),
      route({ segments: ["Sitemap.xml"], pipeline: "cased" }),
      route({ segments: [":file"], pipeline: "anyFile" }),
      route({ method: "POST", segments: ["robots.txt"], pipeline: "write" }),
      route({ segments: ["me"], pipeline: "me" }),
    ];
    expect(indexFileRoutes(routes)).toEqual([]);
  });
});

describe("the index file names and types", () => {
  it("are the files delivery-static exports and reads back", () => {
    expect([...INDEX_FILE_NAMES].sort()).toEqual([...EXPORTED_NAMES].sort());
  });

  it("serve every exported content type inline", () => {
    for (const name of EXPORTED_NAMES) {
      const mediaType = INDEX_FILE_TYPES[name].split(";")[0]?.trim();
      expect(INDEX_FILE_INLINE_TYPES, name).toContain(mediaType);
    }
  });
});
