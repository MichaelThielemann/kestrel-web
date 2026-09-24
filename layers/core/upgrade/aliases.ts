import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_TYPES_ENTRY, FIELD_TYPES_ID } from "../modules/consumer-entries/field-types-entry";
import { OPTIONAL_MODULES } from "../modules/optional-modules";
import { packageInstalled } from "../modules/optional-modules/installed";

const CORE_LAYER_DIR = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

export const CONSUMER_ENTRIES: ReadonlyArray<{ id: string; entry: string; fallback: string }> = [
  { id: "#kestrel/consumer-pipelines", entry: "pipelines/index.ts", fallback: join(CORE_LAYER_DIR, "modules/consumer-entries/pipelines.default.ts") },
  { id: "#kestrel/consumer-modules", entry: "kestrel.modules.ts", fallback: join(CORE_LAYER_DIR, "modules/consumer-entries/modules.default.ts") },
  { id: "#kestrel/consumer-block-tags", entry: "shared/block-tags.ts", fallback: join(CORE_LAYER_DIR, "modules/consumer-entries/block-tags.default.ts") },
  { id: "#kestrel/consumer-admin-i18n", entry: "shared/admin-i18n.ts", fallback: join(CORE_LAYER_DIR, "modules/consumer-entries/admin-i18n.default.ts") },
  { id: FIELD_TYPES_ID, entry: FIELD_TYPES_ENTRY, fallback: join(CORE_LAYER_DIR, "modules/consumer-entries/field-types.default.ts") },
];

/**
 * Every `#kestrel/*` alias the layer resolves for a project at `rootDir`, built against `buildDir` (a
 * `.nuxt`-shaped directory holding the generated migrations and optional-modules templates): the layer's
 * own modules (fixed, under the layer directory), each consumer entry (the project's own file when it
 * exists, the layer's bundled default otherwise) and the two build-time templates. `nuxt.config.ts`, the
 * consumer-entries and migrations Nuxt modules, `vitest.config.ts` and the upgrade tool's project loader
 * all resolve `#kestrel/*` through this one function, so they cannot drift from each other.
 */
export function kestrelAliases(rootDir: string, buildDir: string): Record<string, string> {
  const aliases: Record<string, string> = {
    "#kestrel/pipelines": join(CORE_LAYER_DIR, "pipelines/index.ts"),
    "#kestrel/collections-ui": join(CORE_LAYER_DIR, "collections-ui/index.ts"),
    "#kestrel/modules": join(CORE_LAYER_DIR, "module-registry/index.ts"),
    "#kestrel/cast": join(CORE_LAYER_DIR, "app/utils/cast.ts"),
    "#kestrel/config": join(CORE_LAYER_DIR, "config/index.ts"),
    "#kestrel-core": CORE_LAYER_DIR,
    "#kestrel/migrations": join(buildDir, "kestrel", "migrations.mjs"),
    "#kestrel/optional-modules": OPTIONAL_MODULES.some((name) => packageInstalled(name, [rootDir, CORE_LAYER_DIR]))
      ? join(buildDir, "kestrel", "optional-modules.mjs")
      : join(CORE_LAYER_DIR, "module-registry/optional-modules.none.ts"),
  };
  for (const { id, entry, fallback } of CONSUMER_ENTRIES) {
    const consumerEntry = resolve(rootDir, entry);
    aliases[id] = existsSync(consumerEntry) ? consumerEntry : fallback;
  }
  return aliases;
}
