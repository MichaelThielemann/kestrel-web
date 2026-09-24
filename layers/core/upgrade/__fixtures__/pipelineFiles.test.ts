import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runUpgradeCli } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { UpgradeReport } from "@michaelthielemann/kestrel-upgrade";
import { loadLayerProject } from "../load";
import { createLayerPlugin } from "../plugin";
import { cleanupAllFixtures, materializeFixture } from "./materialize";

const execFileAsync = promisify(execFile);

async function prepare(): Promise<string> {
  const dir = materializeFixture("site-2.0-own-pipelines");
  const nuxtBin = join(dir, "node_modules", ".bin", "nuxt");
  await execFileAsync(nuxtBin, ["prepare", dir], { cwd: dir, env: { ...process.env, NUXT_TELEMETRY_DISABLED: "1" } });
  return dir;
}

async function check(dir: string): Promise<UpgradeReport> {
  const lines: string[] = [];
  await runUpgradeCli(["check", "--root", dir, "--json"], { plugins: [createLayerPlugin()], stdout: (l) => lines.push(l), stderr: (l) => lines.push(l), forceInstalledMajor: 6 });
  return JSON.parse(lines.join("\n"));
}

afterEach(() => {
  cleanupAllFixtures();
});

describe("pipelineFiles attribution: an own pipelines/index.ts alongside definePreset({ overrides }) in kestrel.config.ts", () => {
  it("puts overrides in kestrel.config.ts and own pipelines in pipelines/index.ts, each file and each pipeline exactly once", async () => {
    const dir = await prepare();
    const { project, issues } = await loadLayerProject(dir);
    if (project === undefined) throw new Error(`project failed to load: ${issues.map((i) => i.message).join("; ")}`);

    const configFile = join(dir, "kestrel.config.ts");
    const pipelinesFile = join(dir, "pipelines/index.ts");

    const files = project.pipelineFiles.map((f) => f.file);
    expect(new Set(files).size).toBe(files.length);

    const overrides = project.pipelineFiles.find((f) => f.file === configFile);
    expect(overrides?.pipelines).toContain("deletePage");

    const own = project.pipelineFiles.find((f) => f.file === pipelinesFile);
    expect(own?.pipelines).toContain("adminPing");
    expect(own?.pipelines).not.toContain("deletePage");

    const allNames = project.pipelineFiles.flatMap((f) => f.pipelines);
    expect(new Set(allNames).size).toBe(allNames.length);
  }, 60_000);

  it("locates the override's atomic-group and relay forward-ports instead of falling back to manual", async () => {
    const dir = await prepare();
    const report = await check(dir);

    const group = report.findings.find((f) => f.rule === "preset/override-group");
    expect(group?.fix.kind).toBe("auto");
    const relay = report.findings.find((f) => f.rule === "preset/override-relay");
    expect(relay?.fix.kind).toBe("auto");
  }, 60_000);
});
