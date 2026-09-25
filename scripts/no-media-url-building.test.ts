import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function sourceFiles(dirs: readonly string[]): string[] {
  return dirs.flatMap((dir) => {
    const abs = join(ROOT, dir);
    try {
      statSync(abs);
    } catch {
      return [];
    }
    return walk(abs).filter(
      (file) =>
        (file.endsWith(".vue") || file.endsWith(".ts")) &&
        !file.endsWith(".test.ts") &&
        !file.includes("__lint_fixtures__") &&
        !file.includes("__fixtures__") &&
        !file.endsWith(".generated.ts"),
    );
  });
}

const LAYER_APP_AND_SERVER_DIRS = ["layers/core/app", "layers/core/server", "layers/admin/app", "layers/admin/server", "layers/public/app", "layers/public/server"];

const BUILT_MEDIA_URL = /\/media\/\$\{[^}]*\}\/|\/api\/media/;

describe("no layer code builds a media file URL from an id", () => {
  for (const file of sourceFiles(LAYER_APP_AND_SERVER_DIRS)) {
    const relative = file.slice(ROOT.length);
    it(`${relative} does not contain a built media URL`, () => {
      const source = readFileSync(file, "utf-8");
      const offenders = source.split("\n").map((line, i) => ({ line, i })).filter(({ line }) => BUILT_MEDIA_URL.test(line));
      expect(offenders, JSON.stringify(offenders)).toEqual([]);
    });
  }
});
