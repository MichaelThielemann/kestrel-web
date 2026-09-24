import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ADMIN_AUTO_IMPORT_DIRS = ["layers/admin/app/composables", "layers/admin/app/utils"];
const PUBLIC_DIR = "layers/public/app";

const ALLOWED_CROSSINGS = new Set(["useApi", "apiErrorStatus", "apiErrorMessage"]);

const EXPORT_PATTERN = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|export\s+const\s+([A-Za-z_$][\w$]*)\s*[:=]|export\s+class\s+([A-Za-z_$][\w$]*)/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function adminAutoImportNames(): Set<string> {
  const names = new Set<string>();
  for (const dir of ADMIN_AUTO_IMPORT_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const source = readFileSync(file, "utf-8");
      for (const match of source.matchAll(EXPORT_PATTERN)) {
        const name = match[1] ?? match[2] ?? match[3];
        if (name !== undefined && !ALLOWED_CROSSINGS.has(name)) names.add(name);
      }
    }
  }
  return names;
}

function scriptContentOf(file: string): string {
  const source = readFileSync(file, "utf-8");
  if (!file.endsWith(".vue")) return source;
  const match = /<script[^>]*>([\s\S]*?)<\/script>/.exec(source);
  return match?.[1] ?? "";
}

function locallyBoundNames(script: string): Set<string> {
  const names = new Set<string>();
  for (const match of script.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from/g)) {
    for (const spec of match[1]!.split(",")) {
      const name = spec.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const match of script.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|\s+from)/g)) names.add(match[1]!);
  for (const match of script.matchAll(/\b(?:const|let|var|function\*?)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]!);
  return names;
}

function publicFiles(): string[] {
  return walk(join(ROOT, PUBLIC_DIR)).filter(
    (file) => (file.endsWith(".vue") || file.endsWith(".ts")) && !file.endsWith(".test.ts") && !file.includes("__lint_fixtures__") && !file.includes("__fixtures__"),
  );
}

describe("public layer does not call an admin-only auto-import", () => {
  const adminNames = adminAutoImportNames();

  it("collects a non-trivial admin auto-import surface to check against", () => {
    expect(adminNames.size).toBeGreaterThan(20);
  });

  for (const file of publicFiles()) {
    const relative = file.slice(ROOT.length);
    it(`${relative} calls only names it imports, declares, or that are allowed to cross layers`, () => {
      const script = scriptContentOf(file);
      const bound = locallyBoundNames(script);
      const offenders = [...adminNames].filter((name) => !bound.has(name) && new RegExp(`\\b${name}\\s*\\(`).test(script));
      expect(offenders).toEqual([]);
    });
  }
});
