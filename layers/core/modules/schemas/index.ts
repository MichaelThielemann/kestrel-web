import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { addTemplate, defineNuxtModule } from "@nuxt/kit";
import { bundledSchemaPaths, inlineSchemas, renderSchemasModule, type SchemaSources } from "./scan";

const VIRTUAL_ID = "#kestrel/schemas";
const TEMPLATE = "kestrel/schemas.mjs";
const TYPES = fileURLToPath(new URL("../../types/schemas.d.ts", import.meta.url));
const NAVIGATION_DEFAULT = fileURLToPath(new URL("../../schemas/settings.navigation.json", import.meta.url));
const REDIRECTS_DEFAULT = fileURLToPath(new URL("../../schemas/redirects.rules.json", import.meta.url));

type ViteConfig = { resolve?: { alias?: Record<string, string> | { find: string | RegExp; replacement: string }[] } };

function registerViteAlias(config: unknown, id: string, dst: string): void {
  const vite = config as ViteConfig;
  vite.resolve ??= {};
  const existing = vite.resolve.alias ?? {};
  vite.resolve.alias = Array.isArray(existing) ? [{ find: id, replacement: dst }, ...existing] : { [id]: dst, ...existing };
}

export default defineNuxtModule({
  meta: { name: "kestrel-schemas", configKey: "kestrel" },
  setup(_options, nuxt) {
    const sources: SchemaSources = { rootDir: nuxt.options.rootDir, buildDir: nuxt.options.buildDir, navigationDefault: NAVIGATION_DEFAULT, redirectsDefault: REDIRECTS_DEFAULT };
    const template = addTemplate({ filename: TEMPLATE, write: true, getContents: () => renderSchemasModule({ mode: "paths", schemas: bundledSchemaPaths(sources) }) });
    nuxt.options.alias[VIRTUAL_ID] = template.dst;

    nuxt.hook("vite:extendConfig", (config) => {
      registerViteAlias(config, VIRTUAL_ID, template.dst);
    });

    nuxt.hook("nitro:config", (config) => {
      config.alias = { [VIRTUAL_ID]: template.dst, ...(config.alias ?? {}) };
    });

    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ path: TYPES });
    });

    nuxt.hook("nitro:build:public-assets", async () => {
      await writeFile(template.dst, renderSchemasModule({ mode: "inline", schemas: inlineSchemas(bundledSchemaPaths(sources)) }));
    });
  },
});
