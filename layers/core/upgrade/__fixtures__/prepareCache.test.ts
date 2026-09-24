import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLayerProject, prepareLayerProject } from "../load";
import { cleanupAllFixtures, cleanupFixture, materializeFixture } from "./materialize";

const ROOT_KEY = "/fake/root-for-the-cache-key";

function addMigration(dir: string): void {
  mkdirSync(join(dir, "migrations"), { recursive: true });
  writeFileSync(join(dir, "migrations", "2026-09-01-example.ts"), 'export default { name: "example" };\n');
  const configFile = join(dir, "kestrel.config.ts");
  const source = readFileSync(configFile, "utf8");
  writeFileSync(configFile, `import { migrations } from "#kestrel/migrations";\nvoid migrations;\n${source}`);
}

afterEach(() => {
  cleanupAllFixtures();
});

describe("prepareLayerProject's nuxt-prepare cache, replayed into a later scratch copy", () => {
  it("rewrites the cached migrations module's absolute paths, so a later copy can still import it after the first is gone", async () => {
    const cache = new Map<string, unknown>();

    const scratch1 = materializeFixture("site-2.0");
    addMigration(scratch1);
    await prepareLayerProject(ROOT_KEY, scratch1, cache);
    const generated1 = readFileSync(join(scratch1, ".nuxt", "kestrel", "migrations.mjs"), "utf8");
    expect(generated1).toContain(scratch1);
    cleanupFixture(scratch1);

    const scratch2 = materializeFixture("site-2.0");
    addMigration(scratch2);
    await prepareLayerProject(ROOT_KEY, scratch2, cache);
    const generated2 = readFileSync(join(scratch2, ".nuxt", "kestrel", "migrations.mjs"), "utf8");
    expect(generated2).toContain(scratch2);
    expect(generated2).not.toContain(scratch1);

    const { project, issues } = await loadLayerProject(scratch2);
    expect(issues).toEqual([]);
    expect(project).toBeDefined();
  }, 60_000);
});
