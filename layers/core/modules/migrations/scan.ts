import { readdirSync } from "node:fs";
import { join } from "node:path";

export const MIGRATIONS_DIR_DEFAULT = "migrations";

type Lister = (dir: string) => string[];

export function listMigrationFiles(dir: string, list: Lister = readdirSync): string[] {
  let entries: string[];
  try {
    entries = list(dir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
  return entries
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts") && !name.endsWith(".test.ts"))
    .sort()
    .map((name) => join(dir, name));
}

export function renderMigrationsModule(paths: string[]): string {
  const imports = paths.map((path, index) => `import _${index} from ${JSON.stringify(path)};`);
  const entries = paths.map((_, index) => `  _${index},`);
  return [...imports, "", "export const migrations = [", ...entries, "];", ""].join("\n");
}
