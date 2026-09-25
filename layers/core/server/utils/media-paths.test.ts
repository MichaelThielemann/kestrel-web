import { describe, expect, it } from "vitest";
import { mediaPathProblems, mediaPathsFailure } from "./media-paths";
import type { MediaPathsInput } from "./media-paths";

const FILE_TRIGGER = { method: "GET", path: "/media/:id/:name", pipeline: "serveMediaFile" };
const VARIANT_TRIGGER = { method: "GET", path: "/media/:id/variants/:file", pipeline: "serveImageVariant" };
const SERVE_PIPELINE = { name: "serveMediaFile", steps: [{ name: "authn.identifyUser" }, { name: "authz.require:media.read" }, { name: "media.serve" }] };
const VARIANT_PIPELINE = { name: "serveImageVariant", steps: [{ name: "authn.identifyUser" }, { name: "authz.require:media.read" }, { name: "images.serve" }] };

function baseInput(over: Partial<MediaPathsInput> = {}): MediaPathsInput {
  return {
    media: { publicPath: "/media" },
    images: { publicPath: "/media" },
    delivery: undefined,
    triggers: [FILE_TRIGGER, VARIANT_TRIGGER],
    pipelines: [SERVE_PIPELINE, VARIANT_PIPELINE],
    ...over,
  };
}

describe("mediaPathProblems", () => {
  it("finds nothing wrong with a correctly wired preset", () => {
    expect(mediaPathProblems(baseInput())).toEqual([]);
  });

  it("reports media-default's publicPath when it is not /media", () => {
    const problems = mediaPathProblems(baseInput({ media: { publicPath: "/api/media" } }));
    expect(problems).toEqual([
      'media: media-default publicPath "/api/media" is not "/media", the path this server answers media on – remove the key or set it to "/media"',
    ]);
  });

  it("does not report a missing publicPath: both modules default it to /media themselves", () => {
    expect(mediaPathProblems(baseInput({ media: {}, images: {} }))).toEqual([]);
  });

  it("reports images-default's publicPath when it is not /media", () => {
    const problems = mediaPathProblems(baseInput({ images: { publicPath: "/api/media" } }));
    expect(problems).toEqual([
      'media: images-default publicPath "/api/media" is not "/media", the path this server answers media on – remove the key or set it to "/media"',
    ]);
  });

  it("reports a missing trigger binding for the file route", () => {
    const problems = mediaPathProblems(baseInput({ triggers: [VARIANT_TRIGGER] }));
    expect(problems).toContain("media: no trigger binds GET /media/:id/:name to a pipeline that runs media.serve – public media URLs would 404 on this server");
  });

  it("reports a trigger bound to a pipeline that does not run media.serve (override removed the step)", () => {
    const problems = mediaPathProblems(baseInput({ pipelines: [{ name: "serveMediaFile", steps: [{ name: "media.download" }] }, VARIANT_PIPELINE] }));
    expect(problems).toContain("media: no trigger binds GET /media/:id/:name to a pipeline that runs media.serve – public media URLs would 404 on this server");
  });

  it("reports a trigger bound to a different pipeline entirely (e.g. getMedia)", () => {
    const problems = mediaPathProblems(
      baseInput({ triggers: [{ method: "GET", path: "/media/:id/:name", pipeline: "getMedia" }, VARIANT_TRIGGER], pipelines: [{ name: "getMedia", steps: [{ name: "media.get" }] }, VARIANT_PIPELINE] }),
    );
    expect(problems).toContain("media: no trigger binds GET /media/:id/:name to a pipeline that runs media.serve – public media URLs would 404 on this server");
  });

  it("checks the variant route only when images-default is loaded", () => {
    expect(mediaPathProblems(baseInput({ images: undefined, triggers: [FILE_TRIGGER], pipelines: [SERVE_PIPELINE] }))).toEqual([]);
    const problems = mediaPathProblems(baseInput({ triggers: [FILE_TRIGGER] }));
    expect(problems).toContain("media: no trigger binds GET /media/:id/variants/:file to a pipeline that runs images.serve – public media URLs would 404 on this server");
  });

  it("passes when every loaded media module's publicCopy.prefix matches delivery-static's prefix and reservedPaths has all three", () => {
    const problems = mediaPathProblems(
      baseInput({
        media: { publicPath: "/media", publicCopy: { prefix: "site/" } },
        images: { publicPath: "/media", publicCopy: { prefix: "site/" } },
        delivery: { prefix: "site/", reservedPaths: ["/api", "/admin", "/media"] },
      }),
    );
    expect(problems).toEqual([]);
  });

  it("reports a media module with no publicCopy at all", () => {
    const problems = mediaPathProblems(
      baseInput({
        media: { publicPath: "/media" },
        images: { publicPath: "/media", publicCopy: { prefix: "site/" } },
        delivery: { prefix: "site/", reservedPaths: ["/api", "/admin", "/media"] },
      }),
    );
    expect(problems).toContain(
      'media: delivery-static writes the site under "site/", but media-default has no publicCopy with that prefix – exported pages would reference files the export does not contain',
    );
  });

  it("reports a media module whose publicCopy.prefix does not match delivery-static's prefix", () => {
    const problems = mediaPathProblems(
      baseInput({
        media: { publicPath: "/media", publicCopy: { prefix: "web/" } },
        images: { publicPath: "/media", publicCopy: { prefix: "site/" } },
        delivery: { prefix: "site/", reservedPaths: ["/api", "/admin", "/media"] },
      }),
    );
    expect(problems).toContain(
      'media: delivery-static writes the site under "site/", but media-default has no publicCopy with that prefix – exported pages would reference files the export does not contain',
    );
  });

  it("reports reservedPaths missing one of the three required entries", () => {
    const problems = mediaPathProblems(
      baseInput({
        media: { publicPath: "/media", publicCopy: { prefix: "site/" } },
        images: { publicPath: "/media", publicCopy: { prefix: "site/" } },
        delivery: { prefix: "site/", reservedPaths: ["/media"] },
      }),
    );
    expect(problems).toContain('media: delivery-static\'s reservedPaths must contain "/api", "/admin" and "/media"');
  });

  it("does not apply without delivery-static", () => {
    expect(mediaPathProblems(baseInput({ delivery: undefined }))).toEqual([]);
  });
});

describe("mediaPathsFailure", () => {
  it("joins every problem into one message, undefined for none", () => {
    expect(mediaPathsFailure([])).toBeUndefined();
    expect(mediaPathsFailure(["a", "b"])).toBe("a\nb");
  });
});
