import { describe, expect, it } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { extractImageSizeDeclarations, extractImageSizesFile, mergeImageSizeLabels, mergeImageSizes, normalizeImageSize, normalizeLabelledImageSize, renderImageSizesJson } from "./image-sizes";

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

  it("rejects a label on a block's size and names app/image-sizes.ts as its place", () => {
    expect(() => normalizeImageSize({ name: "card", width: 100, label: "Card" }, "Teaser.vue")).toThrow(/Teaser\.vue:.*"label".*app\/image-sizes\.ts/);
  });
});

describe("normalizeLabelledImageSize", () => {
  it.each(["Teaser card", { en: "Teaser card", de: "Teaser-Karte" }])("keeps the label %j beside the size, out of its entry", (label) => {
    expect(normalizeLabelledImageSize({ name: "teaser", width: 480, height: 320, fit: "cover", label }, "app/image-sizes.ts")).toEqual({
      size: { name: "teaser", width: 480, height: 320, fit: "cover", format: "webp", quality: 82 },
      label,
    });
  });

  it("has no label when none is declared", () => {
    expect(normalizeLabelledImageSize({ name: "teaser", width: 480 }, "app/image-sizes.ts")).toEqual({
      size: { name: "teaser", width: 480, fit: "inside", format: "webp", quality: 82 },
    });
  });

  it.each([[""], [{}], [{ en: 3 }], [["Teaser"]], [{ en: "" }]])("rejects the label %j", (label) => {
    expect(() => normalizeLabelledImageSize({ name: "teaser", width: 480, label }, "app/image-sizes.ts")).toThrow(/app\/image-sizes\.ts:.*"teaser" label/);
  });

  it("still rejects an unknown key", () => {
    expect(() => normalizeLabelledImageSize({ name: "teaser", width: 480, title: "x" }, "app/image-sizes.ts")).toThrow(/"title"/);
  });
});

describe("mergeImageSizeLabels", () => {
  it("maps every labelled size to its label", () => {
    expect(mergeImageSizeLabels([{ where: "/a/app/image-sizes.ts", labels: [["teaser", { en: "Teaser card" }], ["avatar", "Avatar"]] }])).toEqual({
      labels: { teaser: { en: "Teaser card" }, avatar: "Avatar" },
      warnings: [],
    });
  });

  it("keeps the first label of a size and warns about a different later one, naming both files", () => {
    const merged = mergeImageSizeLabels([
      { where: "/a/app/image-sizes.ts", labels: [["teaser", "Teaser card"]] },
      { where: "/b/app/image-sizes.ts", labels: [["teaser", "Card"]] },
    ]);
    expect(merged.labels).toEqual({ teaser: "Teaser card" });
    expect(merged.warnings).toHaveLength(1);
    expect(merged.warnings[0]).toMatch(/image size "teaser" is labelled differently in \/a\/app\/image-sizes\.ts and \/b\/app\/image-sizes\.ts/);
  });

  it("does not warn about the same label declared twice", () => {
    const merged = mergeImageSizeLabels([
      { where: "/a/app/image-sizes.ts", labels: [["teaser", { de: "Karte", en: "Card" }]] },
      { where: "/b/app/image-sizes.ts", labels: [["teaser", { en: "Card", de: "Karte" }]] },
    ]);
    expect(merged).toEqual({ labels: { teaser: { de: "Karte", en: "Card" } }, warnings: [] });
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

describe("extractImageSizeDeclarations", () => {
  it("reads each size with its label", () => {
    const source = "export default defineImageSizes([{ name: 'teaser', width: 480, height: 320, fit: 'cover', label: { en: 'Teaser card', de: 'Teaser-Karte' } }, { name: 'avatar', width: 96 }])";
    expect(extractImageSizeDeclarations(source, "app/image-sizes.ts")).toEqual([
      { size: { name: "teaser", width: 480, height: 320, fit: "cover", format: "webp", quality: 82 }, label: { en: "Teaser card", de: "Teaser-Karte" } },
      { size: { name: "avatar", width: 96, fit: "inside", format: "webp", quality: 82 } },
    ]);
  });
});

describe("extractImageSizesFile", () => {
  it("returns the sizes of a labelled declaration without their labels", () => {
    const source = "export default defineImageSizes([{ name: 'teaser', width: 480, label: 'Teaser card' }])";
    expect(extractImageSizesFile(source, "app/image-sizes.ts")).toEqual([{ name: "teaser", width: 480, fit: "inside", format: "webp", quality: 82 }]);
  });

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
    const parsed = boundaryCast<{ sizes: Array<Record<string, unknown>> }>(JSON.parse(json), "json");
    expect(Object.keys(parsed.sizes[0] ?? {})).toEqual(["name", "width", "height", "fit", "format", "quality"]);
  });
});
