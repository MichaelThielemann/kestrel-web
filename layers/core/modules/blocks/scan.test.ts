import { describe, expect, it } from "vitest";
import { collectImageSizeFiles, collectImageSizes, extractBlocks, relativeSource, renderBlockImagesModule, renderBlocksModule, renderImageSizesModule } from "./scan";
import type { SerializedBlock } from "../../app/types/kestrel";
import type { ImageSize } from "../../app/utils/define-image-sizes";

describe("collectImageSizeFiles", () => {
  it("returns app/image-sizes.ts for every layer root where it exists", () => {
    const exists = (path: string) => path === "/root-a/app/image-sizes.ts";
    expect(collectImageSizeFiles(["/root-a", "/root-b"], exists)).toEqual(["/root-a/app/image-sizes.ts"]);
  });

  it("contributes nothing when no layer has the file", () => {
    expect(collectImageSizeFiles(["/root-a", "/root-b"], () => false)).toEqual([]);
  });
});

describe("collectImageSizes", () => {
  const block = (name: string, imageSizes?: SerializedBlock["imageSizes"]): SerializedBlock => ({ name, fields: {}, ...(imageSizes ? { imageSizes } : {}) });

  it("merges block-declared and file-declared sizes, using the block's file basename as where", () => {
    const definitions = [block("image", [{ name: "content", width: 1200, fit: "inside", format: "webp", quality: 82 }])];
    const paths = ["/root/app/blocks/Image.vue"];
    const read = () => "export default defineImageSizes([{ name: 'teaser', width: 480, height: 320, fit: 'cover' }])";
    const sizes = collectImageSizes(paths, definitions, ["/root/app/image-sizes.ts"], read);
    expect(sizes).toEqual([
      { name: "content", width: 1200, fit: "inside", format: "webp", quality: 82 },
      { name: "teaser", width: 480, height: 320, fit: "cover", format: "webp", quality: 82 },
    ]);
  });

  it("names the block's basename, not its full path, in a collision error", () => {
    const definitions = [block("image", [{ name: "teaser", width: 480, fit: "inside", format: "webp", quality: 82 }])];
    const paths = ["/root/app/blocks/Image.vue"];
    const read = () => "export default defineImageSizes([{ name: 'teaser', width: 600 }])";
    expect(() => collectImageSizes(paths, definitions, ["/root/app/image-sizes.ts"], read)).toThrow(/Image\.vue and \/root\/app\/image-sizes\.ts/);
  });

  it("a missing app/image-sizes.ts contributes nothing", () => {
    const definitions = [block("image")];
    expect(collectImageSizes(["/root/app/blocks/Image.vue"], definitions, [])).toEqual([]);
  });

  it("two layers declaring the same name identically merge to one entry", () => {
    const read = (path: string) => (path.includes("root-a") ? "export default defineImageSizes([{ name: 'teaser', width: 480 }])" : "export default defineImageSizes([{ name: 'teaser', width: 480 }])");
    const sizes = collectImageSizes([], [], ["/root-a/app/image-sizes.ts", "/root-b/app/image-sizes.ts"], read);
    expect(sizes).toEqual([{ name: "teaser", width: 480, fit: "inside", format: "webp", quality: 82 }]);
  });

  it("two layers declaring the same name differently throw", () => {
    const read = (path: string) => (path.includes("root-a") ? "export default defineImageSizes([{ name: 'teaser', width: 480 }])" : "export default defineImageSizes([{ name: 'teaser', width: 600 }])");
    expect(() => collectImageSizes([], [], ["/root-a/app/image-sizes.ts", "/root-b/app/image-sizes.ts"], read)).toThrow(
      /image size "teaser" is declared differently in \/root-a\/app\/image-sizes\.ts and \/root-b\/app\/image-sizes\.ts/,
    );
  });
});

describe("extractBlocks", () => {
  it("resolves a relative defineBlock image against the SFC's own directory", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineBlock({ image: './Hero.png' })\n</script>\n<template><div /></template>\n";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read);
    expect(definitions[0]?.imageFile).toBe("/root/app/blocks/Hero.png");
    expect(definitions[0]).not.toHaveProperty("image");
  });

  it("auto-detects a sibling image file with the same basename", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineProps({})\n</script>\n<template><div /></template>\n";
    const exists = (path: string) => path === "/root/app/blocks/Hero.webp";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, exists);
    expect(definitions[0]?.imageFile).toBe("/root/app/blocks/Hero.webp");
  });

  it("prefers webp, then jpg, then jpeg, then png when several sibling images exist", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineProps({})\n</script>\n<template><div /></template>\n";
    const exists = (path: string) => ["/root/app/blocks/Hero.jpg", "/root/app/blocks/Hero.png", "/root/app/blocks/Hero.webp"].includes(path);
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, exists);
    expect(definitions[0]?.imageFile).toBe("/root/app/blocks/Hero.webp");
  });

  it("does not auto-detect when no sibling image extension matches", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineProps({})\n</script>\n<template><div /></template>\n";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, () => false);
    expect(definitions[0]).not.toHaveProperty("imageFile");
  });

  it("looks in the configured images directory instead of next to the SFC when set", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineProps({})\n</script>\n<template><div /></template>\n";
    const exists = (path: string) => path === "/root/app/block-images/Hero.webp" || path === "/root/app/blocks/Hero.webp";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, exists, "/root/app/block-images");
    expect(definitions[0]?.imageFile).toBe("/root/app/block-images/Hero.webp");
  });

  it("falls back to sibling detection when no images directory is configured", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineProps({})\n</script>\n<template><div /></template>\n";
    const exists = (path: string) => path === "/root/app/blocks/Hero.webp";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, exists, undefined);
    expect(definitions[0]?.imageFile).toBe("/root/app/blocks/Hero.webp");
  });

  it("prefers webp, then jpg, then jpeg, then png in the configured images directory", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineProps({})\n</script>\n<template><div /></template>\n";
    const exists = (path: string) => ["/root/app/block-images/Hero.jpg", "/root/app/block-images/Hero.png", "/root/app/block-images/Hero.webp"].includes(path);
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, exists, "/root/app/block-images");
    expect(definitions[0]?.imageFile).toBe("/root/app/block-images/Hero.webp");
  });

  it("an explicit defineBlock image wins over the configured images directory", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineBlock({ image: './Explicit.png' })\n</script>\n<template><div /></template>\n";
    const exists = (path: string) => path === "/root/app/block-images/Hero.webp" || path === "/root/app/blocks/Explicit.png";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, exists, "/root/app/block-images");
    expect(definitions[0]?.imageFile).toBe("/root/app/blocks/Explicit.png");
  });

  it("an explicit defineBlock image wins over an auto-detected sibling", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineBlock({ image: './Explicit.png' })\n</script>\n<template><div /></template>\n";
    const exists = (path: string) => path === "/root/app/blocks/Hero.webp" || path === "/root/app/blocks/Explicit.png";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, exists);
    expect(definitions[0]?.imageFile).toBe("/root/app/blocks/Explicit.png");
  });

  it("an explicit absolute defineBlock image wins over an auto-detected sibling", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineBlock({ image: '/icons/hero.png' })\n</script>\n<template><div /></template>\n";
    const exists = (path: string) => path === "/root/app/blocks/Hero.webp";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, exists);
    expect(definitions[0]?.image).toBe("/icons/hero.png");
    expect(definitions[0]).not.toHaveProperty("imageFile");
  });

  it("sets source to the SFC path relative to rootDir when rootDir is given", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineProps({})\n</script>\n<template><div /></template>\n";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, () => false, undefined, "/root");
    expect(definitions[0]?.source).toBe("app/blocks/Hero.vue");
  });

  it("omits source entirely when no rootDir is given", () => {
    const read = () => "<script setup lang=\"ts\">\ndefineProps({})\n</script>\n<template><div /></template>\n";
    const definitions = extractBlocks(["/root/app/blocks/Hero.vue"], read, () => false);
    expect(definitions[0]).not.toHaveProperty("source");
  });
});

describe("relativeSource", () => {
  it("converts an absolute SFC path into a rootDir-relative POSIX path", () => {
    expect(relativeSource("/root", "/root/app/blocks/Hero.vue")).toBe("app/blocks/Hero.vue");
  });

  it("resolves a nested consumer directory the same way", () => {
    expect(relativeSource("/apps/site", "/apps/site/app/blocks/marketing/Hero.vue")).toBe("app/blocks/marketing/Hero.vue");
  });
});

describe("renderBlocksModule", () => {
  const block = (name: string, extra: Partial<SerializedBlock> = {}): SerializedBlock => ({ name, fields: {}, ...extra });

  it("keeps an absolute image URL on blockDefinitions", () => {
    const contents = renderBlocksModule(["/root/app/blocks/Hero.vue"], [block("hero", { image: "/icons/hero.png" })], []);
    expect(contents).toContain('"image": "/icons/hero.png"');
  });

  it("strips imageFile from blockDefinitions so no filesystem path reaches the client", () => {
    const contents = renderBlocksModule(["/root/app/blocks/Hero.vue"], [block("hero", { imageFile: "/root/app/blocks/Hero.png" })], []);
    expect(contents).not.toContain("imageFile");
    expect(contents).not.toContain("/root/app/blocks/Hero.png");
  });
});

describe("renderImageSizesModule", () => {
  const size: ImageSize = { name: "content", width: 1200, fit: "inside", format: "webp", quality: 82 };

  it("exports the sizes as a plain array", () => {
    const contents = renderImageSizesModule([size]);
    expect(contents).toContain("export const imageSizes = [");
    expect(contents).toContain('"name": "content"');
    expect(contents.endsWith("\n")).toBe(true);
  });

  it("emits an empty array when nothing declares a size", () => {
    expect(renderImageSizesModule([])).toBe("export const imageSizes = [];\n");
  });

  it("imports nothing so the module is safe to load from Nitro", () => {
    const contents = renderImageSizesModule([size]);
    expect(contents).not.toContain("import");
    expect(contents).not.toContain(".vue");
  });
});

describe("renderBlockImagesModule", () => {
  const block = (name: string, extra: Partial<SerializedBlock> = {}): SerializedBlock => ({ name, fields: {}, ...extra });

  it("imports each block's resolved image file and maps it by block name", () => {
    const contents = renderBlockImagesModule([block("hero", { imageFile: "/root/app/blocks/Hero.png" }), block("prose")]);
    expect(contents).toContain('import _0 from "/root/app/blocks/Hero.png";');
    expect(contents).toContain('"hero": _0,');
    expect(contents).not.toContain('"prose"');
  });

  it("emits an empty map when no block declares a relative image", () => {
    const contents = renderBlockImagesModule([block("prose")]);
    expect(contents).not.toContain("import");
    expect(contents).toContain("export const blockImages = {\n};");
  });
});
