import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { blockNameFromFile, extractBlockDef } from "./extract-block";
import { IMAGE_SIZES_FILE, extractImageSizesFile, mergeImageSizes } from "./image-sizes";
import type { SerializedBlock } from "../../app/types/kestrel";
import type { ImageSize } from "../../app/utils/define-image-sizes";
import type { SizeSource } from "./image-sizes";

export const BLOCKS_DIR = "app/blocks";

type Lister = (dir: string) => string[];

export function listBlockFiles(dir: string, list: Lister = readdirSync): string[] {
  let entries: string[];
  try {
    entries = list(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((name) => name.endsWith(".vue"))
    .sort()
    .map((name) => join(dir, name));
}

export function collectBlockSfcs(layerRoots: string[], list?: Lister): string[] {
  const byName = new Map<string, string>();
  for (const root of layerRoots) {
    for (const file of listBlockFiles(join(root, BLOCKS_DIR), list)) {
      const name = blockNameFromFile(basename(file));
      if (!byName.has(name)) byName.set(name, file);
    }
  }
  return [...byName.values()].sort();
}

export function relativeSource(rootDir: string, path: string): string {
  return relative(rootDir, path).split(sep).join("/");
}

export function extractBlocks(
  paths: string[],
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
  exists: (path: string) => boolean = existsSync,
  imagesDir?: string,
  rootDir?: string,
): SerializedBlock[] {
  return paths.map((path) => extractBlockDef(read(path), basename(path), path, exists, imagesDir, rootDir ? relativeSource(rootDir, path) : undefined));
}

export function renderBlocksModule(paths: string[], definitions: SerializedBlock[], sizes: ImageSize[]): string {
  const imports = paths.map((path, index) => `import _${index} from ${JSON.stringify(path)};`);
  const entries = definitions.map((definition, index) => `  ${JSON.stringify(definition.name)}: _${index},`);
  const publicDefinitions = definitions.map((definition) => {
    const rest = { ...definition };
    delete rest.imageFile;
    return rest;
  });
  return [
    ...imports,
    "",
    `export const blockDefinitions = ${JSON.stringify(publicDefinitions, null, 2)};`,
    "",
    "export const blockComponents = {",
    ...entries,
    "};",
    "",
    `export const imageSizes = ${JSON.stringify(sizes, null, 2)};`,
    "",
  ].join("\n");
}

export function renderImageSizesModule(sizes: readonly ImageSize[]): string {
  return `export const imageSizes = ${JSON.stringify(sizes, null, 2)};\n`;
}

export function renderBlockImagesModule(definitions: SerializedBlock[]): string {
  const withImage = definitions.filter((definition) => definition.imageFile);
  const imports = withImage.map((definition, index) => `import _${index} from ${JSON.stringify(definition.imageFile)};`);
  const entries = withImage.map((definition, index) => `  ${JSON.stringify(definition.name)}: _${index},`);
  return [...imports, "", "export const blockImages = {", ...entries, "};", ""].join("\n");
}

export function collectImageSizeFiles(layerRoots: readonly string[], exists: (path: string) => boolean = existsSync): string[] {
  return layerRoots.map((root) => join(root, IMAGE_SIZES_FILE)).filter((path) => exists(path));
}

export function collectImageSizes(
  blockPaths: readonly string[],
  definitions: readonly SerializedBlock[],
  imageSizeFiles: readonly string[],
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
): ImageSize[] {
  const sources: SizeSource[] = [];
  definitions.forEach((definition, index) => {
    const blockPath = blockPaths[index];
    if (definition.imageSizes?.length && blockPath !== undefined) sources.push({ where: basename(blockPath), sizes: definition.imageSizes });
  });
  for (const file of imageSizeFiles) {
    const sizes = extractImageSizesFile(read(file), file);
    if (sizes.length) sources.push({ where: file, sizes });
  }
  return mergeImageSizes(sources);
}
