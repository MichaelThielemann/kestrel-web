import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const generatedPath = fileURLToPath(new URL("../layers/core/app/types/openapi.generated.ts", import.meta.url));
const tsxBin = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

function runCheck(): { status: number | null; stderr: string } {
  const result = spawnSync(tsxBin, ["scripts/generate-api-types.ts", "--check"], { cwd: repoRoot, encoding: "utf8" });
  return { status: result.status, stderr: result.stderr };
}

describe("generate-api-types.ts --check", () => {
  const original = readFileSync(generatedPath, "utf8");

  afterEach(() => {
    writeFileSync(generatedPath, original);
  });

  it("passes against the committed generated file", () => {
    const { status } = runCheck();
    expect(status).toBe(0);
  });

  it("fails and names the regenerate command when the generated file was hand-edited", () => {
    writeFileSync(generatedPath, `${original}\nexport const staleMarker = true;\n`);
    const { status, stderr } = runCheck();
    expect(status).not.toBe(0);
    expect(stderr).toContain("is stale");
    expect(stderr).toContain("pnpm generate:api-types");
  });
});
