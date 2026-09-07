import { fileURLToPath } from "node:url";
import { defineConfig, defaultExclude } from "vitest/config";

const adminAppDir = fileURLToPath(new URL("./layers/admin/app", import.meta.url));
const collectionsUiEntry = fileURLToPath(new URL("./layers/core/collections-ui/index.ts", import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: [
            { find: "#kestrel/collections-ui", replacement: collectionsUiEntry },
            { find: /^#kestrel\//, replacement: `${adminAppDir}/` },
          ],
        },
        test: { name: "admin", include: ["layers/admin/**/*.test.ts"], environment: "node" },
      },
      {
        test: {
          name: "rest",
          include: ["layers/**/*.test.ts", "packages/**/*.test.ts"],
          exclude: [...defaultExclude, "layers/admin/**"],
          environment: "node",
        },
      },
    ],
  },
});
