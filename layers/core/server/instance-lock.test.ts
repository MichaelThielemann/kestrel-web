import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { instanceLockFile } from "@michaelthielemann/kestrel/instanceLock";
import { bootPlaygroundPreset, type BootedPreset } from "./__fixtures__/boot-preset";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const PROBE = `
import { acquireInstanceLock } from "@michaelthielemann/kestrel/instanceLock";
try {
  acquireInstanceLock(process.argv[1], { module: "probe" }).release();
  console.log("acquired");
} catch (error) {
  console.log(error.code);
}
`;

function lockFromAnotherProcess(file: string): string {
  const probe = spawnSync(process.execPath, ["--input-type=module", "-e", PROBE, file], { cwd: repoRoot, encoding: "utf8", timeout: 30_000 });
  return probe.stdout.trim();
}

describe("the playground preset takes the instance lock of its database file", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-instance-lock-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  });

  afterEach(async () => {
    await preset?.kestrel.stop();
    preset = undefined;
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("holds the lock while it runs, refuses another process the same file, and gives the lock up on stop", async () => {
    const database = join(appRoot, "kestrel.db");
    const lockFile = instanceLockFile(database);
    if (lockFile === undefined) throw new Error("expected the database file to take a lock");
    preset = await bootPlaygroundPreset(appRoot);
    expect(existsSync(lockFile)).toBe(true);
    expect(lockFromAnotherProcess(database)).toBe("instance-locked");
    await preset.kestrel.stop();
    preset = undefined;
    expect(existsSync(lockFile)).toBe(false);
    expect(lockFromAnotherProcess(database)).toBe("acquired");
  }, 60_000);
});
