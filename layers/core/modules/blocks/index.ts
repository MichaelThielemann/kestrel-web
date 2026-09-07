import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addTemplate, defineNuxtModule, updateTemplates } from "@nuxt/kit";
import { blockSchema } from "../../block-schema";
import { SIBLING_IMAGE_EXTENSIONS } from "./extract-block";
import { offerableLayouts, renderLayoutRegistry, type ResolvedLayout } from "./layouts";
import { IMAGE_SIZES_FILE, renderImageSizesJson } from "./image-sizes";
import { BLOCKS_DIR, collectBlockSfcs, collectImageSizeFiles, collectImageSizes, extractBlocks, renderBlockImagesModule, renderBlocksModule, renderImageSizesModule } from "./scan";
import type { SerializedBlock } from "../../app/types/kestrel";
import type { ImageSize } from "../../app/utils/define-image-sizes";

const BLOCK_WATCH_EXTENSIONS = [".vue", ...SIBLING_IMAGE_EXTENSIONS.map((extension) => `.${extension}`)];

const VIRTUAL_ID = "#kestrel/blocks";
const TEMPLATE = "kestrel/blocks.mjs";
const IMAGES_VIRTUAL_ID = "#kestrel/block-images";
const IMAGES_TEMPLATE = "kestrel/block-images.mjs";
const SIZES_VIRTUAL_ID = "#kestrel/image-sizes";
const SIZES_TEMPLATE = "kestrel/image-sizes.mjs";
const SIZES_TYPES = fileURLToPath(new URL("../../types/image-sizes.d.ts", import.meta.url));
const SCHEMA_FILE = "pages.body.json";
const IMAGE_SIZES_SCHEMA_FILE = "image-sizes.json";
const TYPES = fileURLToPath(new URL("../../types/blocks.d.ts", import.meta.url));

const LAYOUTS_VIRTUAL_ID = "#kestrel/layouts";
const LAYOUTS_TEMPLATE = "kestrel-layouts.mjs";
const LAYOUTS_TYPES = fileURLToPath(new URL("../../types/layouts.d.ts", import.meta.url));

const CONFIG_TYPES = fileURLToPath(new URL("../../types/kestrel-config.d.ts", import.meta.url));

interface ModuleOptions {
  blockImagesDir?: string;
}

type ViteConfig = { resolve?: { alias?: Record<string, string> | { find: string | RegExp; replacement: string }[] } };

function registerViteAlias(config: unknown, id: string, dst: string): void {
  const vite = config as ViteConfig;
  vite.resolve ??= {};
  const existing = vite.resolve.alias ?? {};
  vite.resolve.alias = Array.isArray(existing) ? [{ find: id, replacement: dst }, ...existing] : { [id]: dst, ...existing };
}

function writeIfChanged(path: string, contents: string): void {
  let current: string | undefined;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = undefined;
  }
  if (current === contents) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: "kestrel-blocks", configKey: "kestrel" },
  defaults: { blockImagesDir: undefined },
  setup(options, nuxt) {
    const roots = nuxt.options._layers.map((layer) => layer.cwd);
    const schemaPath = join(nuxt.options.buildDir, "kestrel", SCHEMA_FILE);
    const imageSizesPath = join(nuxt.options.buildDir, "kestrel", IMAGE_SIZES_SCHEMA_FILE);
    const imagesDir = options.blockImagesDir ? resolve(nuxt.options.rootDir, options.blockImagesDir) : undefined;

    const scan = (): { paths: string[]; definitions: SerializedBlock[]; sizes: ImageSize[] } => {
      const paths = collectBlockSfcs(roots);
      const definitions = extractBlocks(paths, undefined, undefined, imagesDir, nuxt.options.rootDir);
      const sizes = collectImageSizes(paths, definitions, collectImageSizeFiles(roots));
      return { paths, definitions, sizes };
    };

    const generate = (): string => {
      const { paths, definitions, sizes } = scan();
      writeIfChanged(schemaPath, `${JSON.stringify(blockSchema(definitions), null, 2)}\n`);
      writeIfChanged(imageSizesPath, renderImageSizesJson(sizes));
      return renderBlocksModule(paths, definitions, sizes);
    };

    const template = addTemplate({ filename: TEMPLATE, write: true, getContents: generate });

    const sizesTemplate = addTemplate({ filename: SIZES_TEMPLATE, write: true, getContents: () => renderImageSizesModule(scan().sizes) });
    nuxt.options.alias[SIZES_VIRTUAL_ID] = sizesTemplate.dst;

    const generateImages = (): string => renderBlockImagesModule(extractBlocks(collectBlockSfcs(roots), undefined, undefined, imagesDir));
    const imagesTemplate = addTemplate({ filename: IMAGES_TEMPLATE, write: true, getContents: generateImages });

    let layoutNames: string[] = [];
    nuxt.hook("app:resolve", (app) => {
      layoutNames = offerableLayouts((app.layouts ?? {}) as Record<string, ResolvedLayout | undefined>);
    });
    const layoutsTemplate = addTemplate({ filename: LAYOUTS_TEMPLATE, write: true, getContents: () => renderLayoutRegistry(layoutNames) });

    nuxt.hook("vite:extendConfig", (config) => {
      registerViteAlias(config, VIRTUAL_ID, template.dst);
      registerViteAlias(config, IMAGES_VIRTUAL_ID, imagesTemplate.dst);
      registerViteAlias(config, SIZES_VIRTUAL_ID, sizesTemplate.dst);
      registerViteAlias(config, LAYOUTS_VIRTUAL_ID, layoutsTemplate.dst);
    });

    nuxt.hook("nitro:config", (config) => {
      config.alias = { [VIRTUAL_ID]: template.dst, [SIZES_VIRTUAL_ID]: sizesTemplate.dst, [LAYOUTS_VIRTUAL_ID]: layoutsTemplate.dst, ...(config.alias ?? {}) };
      config.typescript ??= {};
      config.typescript.tsConfig ??= {};
      config.typescript.tsConfig.include = [...(config.typescript.tsConfig.include ?? []), TYPES, SIZES_TYPES];
    });

    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ path: TYPES });
      references.push({ path: SIZES_TYPES });
      references.push({ path: LAYOUTS_TYPES });
      references.push({ path: CONFIG_TYPES });
    });

    const blockDirs = roots.map((root) => resolve(root, BLOCKS_DIR));
    const sizeFiles = roots.map((root) => resolve(root, IMAGE_SIZES_FILE));
    const watchDirs = imagesDir ? [...blockDirs, imagesDir] : blockDirs;
    nuxt.hook("builder:watch", (_event, path) => {
      const absolute = resolve(nuxt.options.srcDir, path);
      const isBlock = BLOCK_WATCH_EXTENSIONS.some((extension) => absolute.endsWith(extension)) && watchDirs.some((dir) => absolute.startsWith(`${dir}/`));
      const isSizes = sizeFiles.includes(absolute);
      if (!isBlock && !isSizes) return;
      void updateTemplates({ filter: (candidate) => candidate.filename === TEMPLATE || candidate.filename === IMAGES_TEMPLATE || candidate.filename === SIZES_TEMPLATE });
    });
  },
});
