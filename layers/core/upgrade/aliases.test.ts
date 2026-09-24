import { loadNuxt } from "@nuxt/kit";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { kestrelAliases } from "./aliases";

const playgroundDir = fileURLToPath(new URL("../../../playground", import.meta.url));

describe("kestrelAliases", () => {
  it("equals the #kestrel* subset of nuxt.options.alias after loadNuxt on the playground", async () => {
    const nuxt = await loadNuxt({ cwd: playgroundDir, dev: false, ready: true });
    try {
      const expected = kestrelAliases(nuxt.options.rootDir, nuxt.options.buildDir);
      const actual = Object.fromEntries(Object.entries(nuxt.options.alias).filter(([id]) => id.startsWith("#kestrel")));
      for (const [id, path] of Object.entries(expected)) {
        expect(actual[id], `alias "${id}"`).toBe(path);
      }
    } finally {
      await nuxt.close();
    }
  }, 60_000);
});
