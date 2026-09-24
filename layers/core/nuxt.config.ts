import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { MEDIA_PUBLIC_PATH } from "./mount-path";
import { kestrelAliases } from "./upgrade/aliases";

const EARLY_ALIASES = kestrelAliases(process.cwd(), resolve(process.cwd(), ".nuxt"));

export default defineNuxtConfig({
  serverHandlers: [
    { route: `${MEDIA_PUBLIC_PATH}/**`, method: "get", handler: fileURLToPath(new URL("./server/handlers/public-media.ts", import.meta.url)) },
  ],
  modules: [
    fileURLToPath(new URL("./modules/blocks/index.ts", import.meta.url)),
    fileURLToPath(new URL("./modules/migrations/index.ts", import.meta.url)),
    fileURLToPath(new URL("./modules/build-assets/index.ts", import.meta.url)),
    fileURLToPath(new URL("./modules/schemas/index.ts", import.meta.url)),
    fileURLToPath(new URL("./modules/consumer-entries/index.ts", import.meta.url)),
    fileURLToPath(new URL("./modules/optional-modules/index.ts", import.meta.url)),
  ],
  alias: { ...EARLY_ALIASES },
  hooks: {
    "vite:extendConfig"(config: { resolve?: { alias?: Record<string, string> | readonly { find: string | RegExp; replacement: string }[] } }) {
      config.resolve ??= {};
      config.resolve.alias = { ...EARLY_ALIASES, ...config.resolve.alias };
    },
    "nitro:config"(config) {
      config.externals ??= {};
      config.externals.external = [...(config.externals.external ?? []), "node:sqlite"];
      config.rollupConfig ??= {};
      const external = Array.isArray(config.rollupConfig.external) ? boundaryCast<string[]>(config.rollupConfig.external, "host") : [];
      config.rollupConfig.external = [...external, "node:sqlite"];

      config.alias = { ...EARLY_ALIASES, ...(config.alias ?? {}) };

      if (config.dev) {
        config.replace ??= {};
        config.replace["process.env.KESTREL_APP_ROOT"] = JSON.stringify(config.rootDir ?? process.cwd());
      }
    },
  },
  ignore: ["**/node_modules"],
  runtimeConfig: { kestrel: { access: { admin: "", site: "", trustProxy: false, proxyHops: 1, trustedHeader: "" } }, public: { kestrelDebugActions: false } },
  typescript: { shim: true },
});
