import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupAllFixtures, materializeFixture } from "./materialize";

const HERE = dirname(fileURLToPath(import.meta.url));
// A subdirectory of the repository root, not the system tmpdir: the child script imports "jiti", which
// Node resolves by walking up from the script's own location, and only the repo's own node_modules has it.
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

const created: string[] = [];

afterEach(() => {
  cleanupAllFixtures();
});

describe("materializeFixture cleanup", () => {
  it("removes the directory after a normal test", () => {
    created.push(materializeFixture("site-2.0"));
  });

  it.fails("removes the directory even when the test itself throws", () => {
    created.push(materializeFixture("site-2.0"));
    throw new Error("simulated failure");
  });

  it.fails("removes the directory even when an assertion fails", () => {
    created.push(materializeFixture("site-2.0-custom"));
    expect(1).toBe(2);
  });

  it("left none of the directories from the runs above behind, including the two that failed", () => {
    expect(created.length).toBeGreaterThanOrEqual(3);
    for (const dir of created) expect(existsSync(dir)).toBe(false);
  });

  it("removes every directory made across several calls in one test", () => {
    for (let i = 0; i < 3; i++) created.push(materializeFixture("site-2.0"));
  });

  it("removes its directory when the process is killed by a signal, not just on a normal hook", async () => {
    const scriptDir = mkdtempSync(join(REPO_ROOT, ".kestrel-web-upgrade-signal-test-"));
    try {
      const script = join(scriptDir, "child.mjs");
      const materializePath = join(HERE, "materialize.ts");
      writeFileSync(
        script,
        `
        import { createJiti } from "jiti";
        const jiti = createJiti(import.meta.url, { interopDefault: true });
        const { materializeFixture } = await jiti.import(${JSON.stringify(materializePath)});
        const dir = materializeFixture("site-2.0");
        process.stdout.write(dir + "\\n");
        setInterval(() => {}, 1000);
        `,
      );

      const child = execFile("node", [script], { cwd: REPO_ROOT });
      const dir = await new Promise<string>((resolvePromise, reject) => {
        let buffer = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const newline = buffer.indexOf("\n");
          if (newline !== -1) resolvePromise(buffer.slice(0, newline).trim());
        });
        child.on("error", reject);
      });

      expect(existsSync(dir)).toBe(true);
      child.kill("SIGTERM");
      await new Promise((resolvePromise) => child.on("exit", resolvePromise));
      expect(existsSync(dir)).toBe(false);
    } finally {
      rmSync(scriptDir, { recursive: true, force: true });
    }
  }, 20_000);
});
