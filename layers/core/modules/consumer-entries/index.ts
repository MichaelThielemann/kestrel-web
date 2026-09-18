import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineNuxtModule } from "@nuxt/kit";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";

const PIPELINES_VIRTUAL_ID = "#kestrel/consumer-pipelines";
const PIPELINES_DEFAULT = fileURLToPath(new URL("./pipelines.default.ts", import.meta.url));
const MODULES_VIRTUAL_ID = "#kestrel/consumer-modules";
const MODULES_DEFAULT = fileURLToPath(new URL("./modules.default.ts", import.meta.url));
const BLOCK_TAGS_VIRTUAL_ID = "#kestrel/consumer-block-tags";
const BLOCK_TAGS_DEFAULT = fileURLToPath(new URL("./block-tags.default.ts", import.meta.url));
const TYPES = fileURLToPath(new URL("../../types/consumer-entries.d.ts", import.meta.url));

type ViteConfig = { resolve?: { alias?: Record<string, string> | readonly { find: string | RegExp; replacement: string }[] } };

function registerViteAlias(vite: ViteConfig, id: string, dst: string): void {
  vite.resolve ??= {};
  const existing = vite.resolve.alias ?? {};
  vite.resolve.alias = Array.isArray(existing)
    ? [{ find: id, replacement: dst }, ...boundaryCast<readonly { find: string | RegExp; replacement: string }[]>(existing, "host")]
    : { [id]: dst, ...existing };
}

export default defineNuxtModule({
  meta: { name: "kestrel-consumer-entries" },
  setup(_options, nuxt) {
    const pipelinesEntry = resolve(nuxt.options.rootDir, "pipelines/index.ts");
    const pipelinesTarget = existsSync(pipelinesEntry) ? pipelinesEntry : PIPELINES_DEFAULT;
    const modulesEntry = resolve(nuxt.options.rootDir, "kestrel.modules.ts");
    const modulesTarget = existsSync(modulesEntry) ? modulesEntry : MODULES_DEFAULT;
    const blockTagsEntry = resolve(nuxt.options.rootDir, "shared/block-tags.ts");
    const blockTagsTarget = existsSync(blockTagsEntry) ? blockTagsEntry : BLOCK_TAGS_DEFAULT;

    nuxt.options.alias[PIPELINES_VIRTUAL_ID] = pipelinesTarget;
    nuxt.options.alias[MODULES_VIRTUAL_ID] = modulesTarget;
    nuxt.options.alias[BLOCK_TAGS_VIRTUAL_ID] = blockTagsTarget;

    nuxt.hook("vite:extendConfig", (config) => {
      registerViteAlias(config, PIPELINES_VIRTUAL_ID, pipelinesTarget);
      registerViteAlias(config, MODULES_VIRTUAL_ID, modulesTarget);
      registerViteAlias(config, BLOCK_TAGS_VIRTUAL_ID, blockTagsTarget);
    });

    nuxt.hook("nitro:config", (config) => {
      config.alias = { [PIPELINES_VIRTUAL_ID]: pipelinesTarget, [MODULES_VIRTUAL_ID]: modulesTarget, [BLOCK_TAGS_VIRTUAL_ID]: blockTagsTarget, ...(config.alias ?? {}) };
    });

    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ path: TYPES });
    });
  },
});
