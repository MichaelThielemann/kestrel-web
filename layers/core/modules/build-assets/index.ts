import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { addTemplate, defineNuxtModule } from "@nuxt/kit";
import { listBuildAssets, renderBuildAssetsModule } from "./scan";

const VIRTUAL_ID = "#kestrel/build-assets";
const TEMPLATE = "kestrel/build-assets.mjs";
const TYPES = fileURLToPath(new URL("../../types/build-assets.d.ts", import.meta.url));

type ViteConfig = { resolve?: { alias?: Record<string, string> | { find: string | RegExp; replacement: string }[] } };

function registerViteAlias(config: unknown, id: string, dst: string): void {
  const vite = config as ViteConfig;
  vite.resolve ??= {};
  const existing = vite.resolve.alias ?? {};
  vite.resolve.alias = Array.isArray(existing) ? [{ find: id, replacement: dst }, ...existing] : { [id]: dst, ...existing };
}

export default defineNuxtModule({
  meta: { name: "kestrel-build-assets", configKey: "kestrel" },
  setup(_options, nuxt) {
    let scanned: string[] = [];
    const template = addTemplate({ filename: TEMPLATE, write: true, getContents: () => renderBuildAssetsModule(scanned) });
    nuxt.options.alias[VIRTUAL_ID] = template.dst;

    nuxt.hook("vite:extendConfig", (config) => {
      registerViteAlias(config, VIRTUAL_ID, template.dst);
    });

    nuxt.hook("nitro:config", (config) => {
      config.alias = { [VIRTUAL_ID]: template.dst, ...(config.alias ?? {}) };
      config.typescript ??= {};
      config.typescript.tsConfig ??= {};
      config.typescript.tsConfig.include = [...(config.typescript.tsConfig.include ?? []), TYPES];
    });

    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ path: TYPES });
    });

    nuxt.hook("nitro:build:public-assets", async (nitro) => {
      const dir = join(nitro.options.output.publicDir, nuxt.options.app.buildAssetsDir);
      scanned = await listBuildAssets(dir);
      await writeFile(template.dst, renderBuildAssetsModule(scanned));
    });
  },
});
