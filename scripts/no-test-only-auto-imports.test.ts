import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const AUTO_IMPORT_DIRS = ["layers/public/app/composables", "layers/public/app/utils"];

const TEST_ONLY_EXPORTS = ["sanitizedHtmlKey"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function autoImportedFiles(): string[] {
  return AUTO_IMPORT_DIRS.flatMap((dir) => {
    const abs = join(ROOT, dir);
    try {
      statSync(abs);
    } catch {
      return [];
    }
    return walk(abs).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
  });
}

describe("no auto-imported composable or util exports a test-only helper", () => {
  const files = autoImportedFiles();
  for (const name of TEST_ONLY_EXPORTS) {
    it(`${name} is not exported from an auto-import directory`, () => {
      const offenders = files.filter((file) => new RegExp(`export (?:function|const) ${name}\\b`).test(readFileSync(file, "utf-8")));
      expect(offenders.map((file) => file.slice(ROOT.length))).toEqual([]);
    });
  }
});
