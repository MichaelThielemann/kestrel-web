import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { blockNameFromFile, extractBlockDef } from "./extract-block";
import { IMAGE_SIZES_FILE, extractImageSizeDeclarations, mergeImageSizeLabels, mergeImageSizes } from "./image-sizes";
import type { Localized, SerializedBlock } from "../../app/types/kestrel";
import type { ImageSize } from "../../app/utils/define-image-sizes";
import type { LabelSource, SizeSource } from "./image-sizes";

export const BLOCKS_DIR = "app/blocks";

type Lister = (dir: string) => string[];

function errnoCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

export function listBlockFiles(dir: string, list: Lister = readdirSync): string[] {
  let entries: string[];
  try {
    entries = list(dir);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return [];
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

/** The merged image sizes, the label of each labelled size, and the build warnings about labels that disagree. */
export interface ImageSizeCatalog {
  sizes: ImageSize[];
  labels: Record<string, Localized>;
  warnings: string[];
}

export function renderBlocksModule(paths: string[], definitions: SerializedBlock[], sizes: ImageSize[], labels: Readonly<Record<string, Localized>> = {}): string {
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
    `export const imageSizeLabels = ${JSON.stringify(labels, null, 2)};`,
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

export function collectImageSizeCatalog(
  blockPaths: readonly string[],
  definitions: readonly SerializedBlock[],
  imageSizeFiles: readonly string[],
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
): ImageSizeCatalog {
  const sources: SizeSource[] = [];
  const labelSources: LabelSource[] = [];
  definitions.forEach((definition, index) => {
    const blockPath = blockPaths[index];
    if (definition.imageSizes?.length && blockPath !== undefined) sources.push({ where: basename(blockPath), sizes: definition.imageSizes });
  });
  for (const file of imageSizeFiles) {
    const declared = extractImageSizeDeclarations(read(file), file);
    if (declared.length) sources.push({ where: file, sizes: declared.map((entry) => entry.size) });
    labelSources.push({ where: file, labels: declared.flatMap((entry): [string, Localized][] => (entry.label === undefined ? [] : [[entry.size.name, entry.label]])) });
  }
  return { sizes: mergeImageSizes(sources), ...mergeImageSizeLabels(labelSources) };
}

export function collectImageSizes(
  blockPaths: readonly string[],
  definitions: readonly SerializedBlock[],
  imageSizeFiles: readonly string[],
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
): ImageSize[] {
  return collectImageSizeCatalog(blockPaths, definitions, imageSizeFiles, read).sizes;
}
