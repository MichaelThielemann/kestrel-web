import { fileURLToPath } from "node:url";

const PIPELINES_VIRTUAL_ID = "#kestrel/pipelines";
const PIPELINES_ENTRY = fileURLToPath(new URL("./pipelines/index.ts", import.meta.url));
const COLLECTIONS_UI_VIRTUAL_ID = "#kestrel/collections-ui";
const COLLECTIONS_UI_ENTRY = fileURLToPath(new URL("./collections-ui/index.ts", import.meta.url));
const MODULE_REGISTRY_VIRTUAL_ID = "#kestrel/modules";
const MODULE_REGISTRY_ENTRY = fileURLToPath(new URL("./module-registry/index.ts", import.meta.url));
const CAST_VIRTUAL_ID = "#kestrel/cast";
const CAST_ENTRY = fileURLToPath(new URL("./app/utils/cast.ts", import.meta.url));

export default defineNuxtConfig({
  modules: [
    fileURLToPath(new URL("./modules/blocks/index.ts", import.meta.url)),
    fileURLToPath(new URL("./modules/migrations/index.ts", import.meta.url)),
    fileURLToPath(new URL("./modules/build-assets/index.ts", import.meta.url)),
    fileURLToPath(new URL("./modules/schemas/index.ts", import.meta.url)),
    fileURLToPath(new URL("./modules/consumer-entries/index.ts", import.meta.url)),
  ],
  alias: { [PIPELINES_VIRTUAL_ID]: PIPELINES_ENTRY, [COLLECTIONS_UI_VIRTUAL_ID]: COLLECTIONS_UI_ENTRY, [MODULE_REGISTRY_VIRTUAL_ID]: MODULE_REGISTRY_ENTRY, [CAST_VIRTUAL_ID]: CAST_ENTRY },
  hooks: {
    "vite:extendConfig"(config) {
      config.resolve!.alias = {
        [PIPELINES_VIRTUAL_ID]: PIPELINES_ENTRY,
        [COLLECTIONS_UI_VIRTUAL_ID]: COLLECTIONS_UI_ENTRY,
        [MODULE_REGISTRY_VIRTUAL_ID]: MODULE_REGISTRY_ENTRY,
        [CAST_VIRTUAL_ID]: CAST_ENTRY,
        ...(config.resolve!.alias as Record<string, string> | undefined),
      };
    },
    "nitro:config"(config) {
      config.externals ??= {};
      config.externals.external = [...(config.externals.external ?? []), "node:sqlite"];
      config.rollupConfig ??= {};
      config.rollupConfig.external = [...((config.rollupConfig.external as string[] | undefined) ?? []), "node:sqlite"];

      config.alias = {
        [PIPELINES_VIRTUAL_ID]: PIPELINES_ENTRY,
        [COLLECTIONS_UI_VIRTUAL_ID]: COLLECTIONS_UI_ENTRY,
        [MODULE_REGISTRY_VIRTUAL_ID]: MODULE_REGISTRY_ENTRY,
        [CAST_VIRTUAL_ID]: CAST_ENTRY,
        ...(config.alias ?? {}),
      };

      if (config.dev) {
        config.replace ??= {};
        config.replace["process.env.KESTREL_APP_ROOT"] = JSON.stringify(config.rootDir ?? process.cwd());
      }
    },
  },
  ignore: ["**/node_modules"],
  runtimeConfig: { kestrel: { access: { admin: "", site: "", trustProxy: false, proxyHops: 1, trustedHeader: "" } }, public: { kestrelDebugActions: false } },
});
