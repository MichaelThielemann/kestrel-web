import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runUpgradeCli } from "@michaelthielemann/kestrel-upgrade/plugin";
import { createLayerPlugin } from "../plugin";
import { cleanupAllFixtures, materializeFixture } from "./materialize";

const execFileAsync = promisify(execFile);

async function prepare(name: string): Promise<string> {
  const dir = materializeFixture(name);
  const nuxtBin = join(dir, "node_modules", ".bin", "nuxt");
  await execFileAsync(nuxtBin, ["prepare", dir], { cwd: dir, env: { ...process.env, NUXT_TELEMETRY_DISABLED: "1" } });
  return dir;
}

afterEach(() => {
  cleanupAllFixtures();
});

describe("a closed-choice question rejects an answer outside its choices", () => {
  it("own-pipeline-delivery's remove/keep question exits 2 for an answer that is neither", async () => {
    const dir = await prepare("site-2.0-double-publish");
    const answersFile = join(dir, "answers.json");
    writeFileSync(answersFile, JSON.stringify({ "own-pipeline-delivery:publishesInline": "sometimes" }));
    const lines: string[] = [];
    const exitCode = await runUpgradeCli(["fix", "--root", dir, "--answers", answersFile], {
      plugins: [createLayerPlugin()],
      stdout: (l) => lines.push(l),
      stderr: (l) => lines.push(l),
    });
    expect(exitCode).toBe(2);
    expect(lines.join("\n")).toContain('"own-pipeline-delivery:publishesInline" is "sometimes"');
  }, 60_000);
});
