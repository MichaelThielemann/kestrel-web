import { fileURLToPath } from "node:url";
import { defineVitestProject } from "@nuxt/test-utils/config";
import { defineConfig, defaultExclude } from "vitest/config";

const adminAppDir = fileURLToPath(new URL("./layers/admin/app", import.meta.url));
const coreLayerDir = fileURLToPath(new URL("./layers/core", import.meta.url));
const collectionsUiEntry = fileURLToPath(new URL("./layers/core/collections-ui/index.ts", import.meta.url));
const castEntry = fileURLToPath(new URL("./layers/core/app/utils/cast.ts", import.meta.url));
const optionalModulesNone = fileURLToPath(new URL("./layers/core/module-registry/optional-modules.none.ts", import.meta.url));
const pipelinesEntry = fileURLToPath(new URL("./layers/core/pipelines/index.ts", import.meta.url));
const moduleRegistryEntry = fileURLToPath(new URL("./layers/core/module-registry/index.ts", import.meta.url));
const playgroundDir = fileURLToPath(new URL("./playground", import.meta.url));

const DOM_TEST_PATTERN = "**/*.dom.test.ts";

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: [
            { find: "#kestrel/collections-ui", replacement: collectionsUiEntry },
            { find: "#kestrel/cast", replacement: castEntry },
            { find: /^#kestrel-admin\//, replacement: `${adminAppDir}/` },
            { find: /^#kestrel-core\//, replacement: `${coreLayerDir}/` },
          ],
        },
        test: {
          name: "admin",
          include: ["layers/admin/**/*.test.ts"],
          exclude: [...defaultExclude, DOM_TEST_PATTERN],
          environment: "node",
        },
      },
      {
        resolve: {
          alias: [
            { find: "#kestrel/cast", replacement: castEntry },
            { find: "#kestrel/optional-modules", replacement: optionalModulesNone },
            { find: "#kestrel/pipelines", replacement: pipelinesEntry },
            { find: "#kestrel/modules", replacement: moduleRegistryEntry },
            { find: /^#kestrel-core\//, replacement: `${coreLayerDir}/` },
          ],
        },
        test: {
          name: "rest",
          include: ["layers/**/*.test.ts", "packages/**/*.test.ts"],
          exclude: [...defaultExclude, "layers/admin/**", DOM_TEST_PATTERN],
          environment: "node",
        },
      },
      await defineVitestProject({
        test: {
          name: "components",
          include: ["layers/**/*.dom.test.ts"],
          environment: "nuxt",
          environmentOptions: { nuxt: { rootDir: playgroundDir, domEnvironment: "jsdom" } },
        },
      }),
    ],
  },
});
