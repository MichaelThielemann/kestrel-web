import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = readFileSync(join(ROOT, ".github", "dependabot.yml"), "utf8");

function updateEntries(source: string): string[] {
  const entries: string[] = [];
  for (const line of source.split("\n")) {
    if (line.startsWith("  - package-ecosystem:")) entries.push(line);
    else if (entries.length > 0) entries[entries.length - 1] += `\n${line}`;
  }
  return entries;
}

describe("the dependency update configuration", () => {
  it("waits at least three days after a release before it proposes it, for every ecosystem", () => {
    const entries = updateEntries(CONFIG);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const days = /^ {4}cooldown:\n {6}default-days: (\d+)$/m.exec(entry)?.[1];
      expect(days, entry.split("\n")[0]).toBeDefined();
      expect(Number(days)).toBeGreaterThanOrEqual(3);
    }
  });
});
