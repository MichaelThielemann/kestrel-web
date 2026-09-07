import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listBuildAssets, renderBuildAssetsModule } from "./scan";

describe("listBuildAssets", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kestrel-build-assets-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lists files recursively as sorted POSIX-relative paths", async () => {
    await mkdir(join(dir, "builds", "meta"), { recursive: true });
    await writeFile(join(dir, "entry.js"), "");
    await writeFile(join(dir, "builds", "latest.json"), "");
    await writeFile(join(dir, "builds", "meta", "abc.json"), "");

    expect(await listBuildAssets(dir)).toEqual(["builds/latest.json", "builds/meta/abc.json", "entry.js"]);
  });

  it("skips compressed siblings and source maps", async () => {
    for (const name of ["entry.js", "entry.js.gz", "entry.js.br", "entry.js.map", "entry.css"]) await writeFile(join(dir, name), "");

    expect(await listBuildAssets(dir)).toEqual(["entry.css", "entry.js"]);
  });

  it("returns an empty array for an empty directory", async () => {
    expect(await listBuildAssets(dir)).toEqual([]);
  });

  it("returns an empty array when the directory does not exist", async () => {
    expect(await listBuildAssets(join(dir, "missing"))).toEqual([]);
  });
});

describe("renderBuildAssetsModule", () => {
  it("exports the paths as a default array", () => {
    expect(renderBuildAssetsModule(["a.js", "b.css"])).toBe('export default ["a.js","b.css"];\n');
  });

  it("exports an empty array for no paths", () => {
    expect(renderBuildAssetsModule([])).toBe("export default [];\n");
  });
});
