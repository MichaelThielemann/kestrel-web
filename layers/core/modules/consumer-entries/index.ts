import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineNuxtModule } from "@nuxt/kit";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";

const ENTRIES = [
  { id: "#kestrel/consumer-pipelines", entry: "pipelines/index.ts", fallback: fileURLToPath(new URL("./pipelines.default.ts", import.meta.url)) },
  { id: "#kestrel/consumer-modules", entry: "kestrel.modules.ts", fallback: fileURLToPath(new URL("./modules.default.ts", import.meta.url)) },
  { id: "#kestrel/consumer-block-tags", entry: "shared/block-tags.ts", fallback: fileURLToPath(new URL("./block-tags.default.ts", import.meta.url)) },
  { id: "#kestrel/consumer-admin-i18n", entry: "shared/admin-i18n.ts", fallback: fileURLToPath(new URL("./admin-i18n.default.ts", import.meta.url)) },
];
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
    const targets: Record<string, string> = {};
    for (const { id, entry, fallback } of ENTRIES) {
      const consumerEntry = resolve(nuxt.options.rootDir, entry);
      const target = existsSync(consumerEntry) ? consumerEntry : fallback;
      targets[id] = target;
      nuxt.options.alias[id] = target;
    }

    nuxt.hook("vite:extendConfig", (config) => {
      for (const [id, target] of Object.entries(targets)) registerViteAlias(config, id, target);
    });

    nuxt.hook("nitro:config", (config) => {
      config.alias = { ...targets, ...(config.alias ?? {}) };
    });

    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ path: TYPES });
    });
  },
});
