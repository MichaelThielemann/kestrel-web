import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_DIRS = ["layers/core/server", "layers/core/app", "layers/admin/app", "layers/admin/server", "layers/public/app", "layers/public/server"];
const IMPL_IMPORT = /@michaelthielemann\/kestrel-authz-roles\/impl/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function sourceFiles(): string[] {
  return SCAN_DIRS.flatMap((dir) => {
    const abs = join(ROOT, dir);
    try {
      statSync(abs);
    } catch {
      return [];
    }
    return walk(abs).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
  });
}

describe("no production code imports authz-roles's /impl subpath", () => {
  for (const file of sourceFiles()) {
    const relative = file.slice(ROOT.length);
    it(`${relative} does not import kestrel-authz-roles/impl`, () => {
      const source = readFileSync(file, "utf-8");
      expect(IMPL_IMPORT.test(source)).toBe(false);
    });
  }
});
