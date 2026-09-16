import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function packageInstalled(name: string, from: readonly string[]): boolean {
  for (const start of from) {
    let dir = start;
    for (;;) {
      if (existsSync(join(dir, "node_modules", name, "package.json"))) return true;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return false;
}
