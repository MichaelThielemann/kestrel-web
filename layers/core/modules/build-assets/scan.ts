import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKIPPED = /\.(gz|br|map)$/i;

export async function listBuildAssets(dir: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(currentDir: string, relativePrefix: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return;
      throw error;
    }
    for (const entry of entries) {
      const relativePath = relativePrefix === "" ? entry.name : `${relativePrefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(currentDir, entry.name), relativePath);
      else if (entry.isFile() && !SKIPPED.test(entry.name)) paths.push(relativePath);
    }
  }

  await walk(dir, "");
  return paths.sort();
}

export function renderBuildAssetsModule(paths: string[]): string {
  return `export default ${JSON.stringify(paths)};\n`;
}
