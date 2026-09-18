import { fileURLToPath } from "node:url";
import { addTemplate, defineNuxtModule } from "@nuxt/kit";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { packageInstalled } from "./installed";

const VIRTUAL_ID = "#kestrel/optional-modules";
const TEMPLATE = "kestrel/optional-modules.mjs";
const NONE = fileURLToPath(new URL("../../module-registry/optional-modules.none.ts", import.meta.url));
const TYPES = fileURLToPath(new URL("../../types/optional-modules.d.ts", import.meta.url));
const LAYER_DIR = fileURLToPath(new URL("../..", import.meta.url));

export const OPTIONAL_MODULES = ["@michaelthielemann/kestrel-insights"] as const;

type ViteConfig = { resolve?: { alias?: Record<string, string> | readonly { find: string | RegExp; replacement: string }[] } };

function registerViteAlias(vite: ViteConfig, id: string, dst: string): void {
  vite.resolve ??= {};
  const existing = vite.resolve.alias ?? {};
  vite.resolve.alias = Array.isArray(existing)
    ? [{ find: id, replacement: dst }, ...boundaryCast<readonly { find: string | RegExp; replacement: string }[]>(existing, "host")]
    : { [id]: dst, ...existing };
}

export function renderOptionalModules(names: readonly string[]): string {
  const imports = names.map((name, i) => `import m${i} from ${JSON.stringify(name)};`).join("\n");
  const entries = names.map((name, i) => `  ${JSON.stringify(name)}: m${i},`).join("\n");
  return `${imports}\n\nexport default {\n${entries}\n};\n`;
}

export default defineNuxtModule({
  meta: { name: "kestrel-optional-modules" },
  setup(_options, nuxt) {
    const present = OPTIONAL_MODULES.filter((name) => packageInstalled(name, [nuxt.options.rootDir, LAYER_DIR]));
    const dst = present.length === 0 ? NONE : addTemplate({ filename: TEMPLATE, write: true, getContents: () => renderOptionalModules(present) }).dst;

    nuxt.options.alias[VIRTUAL_ID] = dst;

    nuxt.hook("vite:extendConfig", (config) => {
      registerViteAlias(config, VIRTUAL_ID, dst);
    });

    nuxt.hook("nitro:config", (config) => {
      config.alias = { [VIRTUAL_ID]: dst, ...(config.alias ?? {}) };
      config.typescript ??= {};
      config.typescript.tsConfig ??= {};
      config.typescript.tsConfig.include = [...(config.typescript.tsConfig.include ?? []), TYPES];
    });

    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ path: TYPES });
    });
  },
});
