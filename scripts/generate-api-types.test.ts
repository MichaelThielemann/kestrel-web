import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const generatedPath = fileURLToPath(new URL("../layers/core/app/types/openapi.generated.ts", import.meta.url));

function runCheck(target?: string): { status: number | null; stderr: string } {
  const args = ["--import", "tsx", "scripts/generate-api-types.ts", "--check", ...(target === undefined ? [] : ["--target", target])];
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8", timeout: 60_000 });
  return { status: result.status, stderr: result.stderr };
}

describe("generate-api-types.ts --check", { timeout: 60_000 }, () => {
  const workDir = mkdtempSync(join(tmpdir(), "kestrel-generate-api-types-"));

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("passes against the committed generated file", () => {
    const { status } = runCheck();
    expect(status).toBe(0);
  });

  it("fails and names the regenerate command when the generated file was hand-edited", () => {
    const target = join(workDir, "openapi.generated.ts");
    const original = readFileSync(generatedPath, "utf8");
    writeFileSync(target, `${original}\nexport const staleMarker = true;\n`);

    const { status, stderr } = runCheck(target);
    expect(status).not.toBe(0);
    expect(stderr).toContain("is stale");
    expect(stderr).toContain("pnpm generate:api-types");
  });
});
