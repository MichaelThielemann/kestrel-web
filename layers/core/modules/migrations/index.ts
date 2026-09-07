import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addTemplate, defineNuxtModule, updateTemplates } from "@nuxt/kit";
import { MIGRATIONS_DIR_DEFAULT, listMigrationFiles, renderMigrationsModule } from "./scan";

const VIRTUAL_ID = "#kestrel/migrations";
const TEMPLATE = "kestrel/migrations.mjs";
const TYPES = fileURLToPath(new URL("../../types/migrations.d.ts", import.meta.url));
const CONFIG_TYPES = fileURLToPath(new URL("../../types/kestrel-config.d.ts", import.meta.url));

interface ModuleOptions {
  migrationsDir?: string;
}

type ViteConfig = { resolve?: { alias?: Record<string, string> | { find: string | RegExp; replacement: string }[] } };

function registerViteAlias(config: unknown, id: string, dst: string): void {
  const vite = config as ViteConfig;
  vite.resolve ??= {};
  const existing = vite.resolve.alias ?? {};
  vite.resolve.alias = Array.isArray(existing) ? [{ find: id, replacement: dst }, ...existing] : { [id]: dst, ...existing };
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: "kestrel-migrations", configKey: "kestrel" },
  defaults: { migrationsDir: undefined },
  setup(options, nuxt) {
    const migrationsDir = resolve(nuxt.options.rootDir, options.migrationsDir ?? MIGRATIONS_DIR_DEFAULT);

    const generate = (): string => renderMigrationsModule(listMigrationFiles(migrationsDir));

    const template = addTemplate({ filename: TEMPLATE, write: true, getContents: generate });
    nuxt.options.alias[VIRTUAL_ID] = template.dst;
    nuxt.options.watch.push(migrationsDir);

    nuxt.hook("vite:extendConfig", (config) => {
      registerViteAlias(config, VIRTUAL_ID, template.dst);
    });

    nuxt.hook("nitro:config", (config) => {
      config.alias = { [VIRTUAL_ID]: template.dst, ...(config.alias ?? {}) };
      config.externals ??= {};
      config.externals.inline = [...(config.externals.inline ?? []), migrationsDir];
    });

    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ path: TYPES });
      references.push({ path: CONFIG_TYPES });
    });

    nuxt.hook("builder:watch", (_event, path) => {
      const absolute = resolve(nuxt.options.srcDir, path);
      if (!absolute.endsWith(".ts") || !absolute.startsWith(`${migrationsDir}/`)) return;
      void updateTemplates({ filter: (candidate) => candidate.filename === TEMPLATE });
    });
  },
});
