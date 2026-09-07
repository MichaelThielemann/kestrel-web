import { describe, expect, it } from "vitest";
import { extractImageSizesFile, mergeImageSizes, normalizeImageSize, renderImageSizesJson } from "./image-sizes";

describe("normalizeImageSize", () => {
  it("fills defaults and omits an absent height", () => {
    expect(normalizeImageSize({ name: "content", width: 1200 }, "Image.vue")).toEqual({
      name: "content",
      width: 1200,
      fit: "inside",
      format: "webp",
      quality: 82,
    });
  });

  it("keeps a declared height", () => {
    expect(normalizeImageSize({ name: "teaser", width: 480, height: 320, fit: "cover" }, "Image.vue")).toEqual({
      name: "teaser",
      width: 480,
      height: 320,
      fit: "cover",
      format: "webp",
      quality: 82,
    });
  });

  it.each(["Card", "1card", "card_x"])("rejects an invalid name %s", (name) => {
    expect(() => normalizeImageSize({ name, width: 100 }, "Image.vue")).toThrow(/Image\.vue:.*name/);
  });

  it("requires a height when fit is cover", () => {
    expect(() => normalizeImageSize({ name: "card", width: 100, fit: "cover" }, "Image.vue")).toThrow(/Image\.vue:.*fit "cover"/);
  });

  it("rejects a declared format key", () => {
    expect(() => normalizeImageSize({ name: "card", width: 100, format: "webp" }, "Image.vue")).toThrow(/Image\.vue:.*format/);
  });

  it("rejects an unknown key, naming it", () => {
    expect(() => normalizeImageSize({ name: "card", width: 100, blur: true }, "Image.vue")).toThrow(/Image\.vue:.*"blur"/);
  });

  it.each([8, 8193])("rejects a width outside 16..8192 (%d)", (width) => {
    expect(() => normalizeImageSize({ name: "card", width }, "Image.vue")).toThrow(/Image\.vue:.*width/);
  });
});

describe("mergeImageSizes", () => {
  it("collapses two identical declarations from two files into one entry", () => {
    const a = normalizeImageSize({ name: "teaser", width: 480 }, "Hero.vue");
    const b = normalizeImageSize({ name: "teaser", width: 480 }, "app/image-sizes.ts");
    expect(mergeImageSizes([{ where: "Hero.vue", sizes: [a] }, { where: "app/image-sizes.ts", sizes: [b] }])).toEqual([a]);
  });

  it("treats declarations that normalize to the same value as identical, no error", () => {
    const a = normalizeImageSize({ name: "a", width: 100 }, "Hero.vue");
    const b = normalizeImageSize({ name: "a", width: 100, fit: "inside", quality: 82 }, "app/image-sizes.ts");
    expect(() => mergeImageSizes([{ where: "Hero.vue", sizes: [a] }, { where: "app/image-sizes.ts", sizes: [b] }])).not.toThrow();
  });

  it("throws on the same name with a different width, naming both files", () => {
    const a = normalizeImageSize({ name: "teaser", width: 480 }, "Hero.vue");
    const b = normalizeImageSize({ name: "teaser", width: 600 }, "app/image-sizes.ts");
    expect(() => mergeImageSizes([{ where: "Hero.vue", sizes: [a] }, { where: "app/image-sizes.ts", sizes: [b] }])).toThrow(
      /image size "teaser" is declared differently in Hero\.vue and app\/image-sizes\.ts/,
    );
  });

  it("sorts the result by name regardless of source order", () => {
    const b = normalizeImageSize({ name: "b", width: 100 }, "B.vue");
    const a = normalizeImageSize({ name: "a", width: 100 }, "A.vue");
    expect(mergeImageSizes([{ where: "B.vue", sizes: [b] }, { where: "A.vue", sizes: [a] }]).map((s) => s.name)).toEqual(["a", "b"]);
  });
});

describe("extractImageSizesFile", () => {
  it("reads export default defineImageSizes([...])", () => {
    expect(extractImageSizesFile("export default defineImageSizes([{ name: 'teaser', width: 480 }])", "image-sizes.ts")).toEqual([
      { name: "teaser", width: 480, fit: "inside", format: "webp", quality: 82 },
    ]);
  });

  it("reads it behind as const", () => {
    expect(extractImageSizesFile("export default defineImageSizes([{ name: 'teaser', width: 480 }]) as const", "image-sizes.ts")).toHaveLength(1);
  });

  it("reads it behind satisfies", () => {
    expect(extractImageSizesFile("export default defineImageSizes([{ name: 'teaser', width: 480 }]) satisfies ImageSizeDecl[]", "image-sizes.ts")).toHaveLength(1);
  });

  it("rejects an imported constant", () => {
    expect(() => extractImageSizesFile("import { SIZES } from './sizes'\nexport default defineImageSizes(SIZES)", "image-sizes.ts")).toThrow(/image-sizes\.ts/);
  });

  it("rejects a spread of a variable", () => {
    expect(() => extractImageSizesFile("const extra = []\nexport default defineImageSizes([...extra])", "image-sizes.ts")).toThrow(/image-sizes\.ts/);
  });

  it("rejects a missing default export", () => {
    expect(() => extractImageSizesFile("const sizes = defineImageSizes([])", "image-sizes.ts")).toThrow(/image-sizes\.ts/);
  });

  it("rejects a non-array argument", () => {
    expect(() => extractImageSizesFile("export default defineImageSizes({ name: 'teaser', width: 480 })", "image-sizes.ts")).toThrow(/image-sizes\.ts/);
  });
});

describe("renderImageSizesJson", () => {
  it("renders an empty registry with the generated marker and a trailing newline", () => {
    const json = renderImageSizesJson([]);
    expect(json).toBe(
      `${JSON.stringify({ $comment: "Generated by kestrel-web from app/blocks/*.vue on every build - do not edit", sizes: [] }, null, 2)}\n`,
    );
  });

  it("fixes key order per entry", () => {
    const size = normalizeImageSize({ name: "teaser", width: 480, height: 320, fit: "cover" }, "Image.vue");
    const json = renderImageSizesJson([size]);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed.sizes[0])).toEqual(["name", "width", "height", "fit", "format", "quality"]);
  });
});
