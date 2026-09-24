import { readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { checkBoot } from "@michaelthielemann/kestrel";
import { createPersistenceSqlite } from "@michaelthielemann/kestrel-persistence-sqlite/impl";
import { silentLogger } from "@michaelthielemann/kestrel/logger";
import { runUpgradeCli } from "@michaelthielemann/kestrel-upgrade/plugin";
import { sandboxBootInput } from "@michaelthielemann/kestrel-upgrade/sandbox";
import type { UpgradeReport } from "@michaelthielemann/kestrel-upgrade";
import { createLayerPlugin } from "../plugin";
import { loadLayerProject } from "../load";
import { cleanupAllFixtures, materializeFixture } from "./materialize";

const execFileAsync = promisify(execFile);

function renameToUnderscore(dir: string): void {
  const file = join(dir, "shared", "model.ts");
  const source = readFileSync(file, "utf8");
  const patched = source.replace('titlePosition: { type: "enum"', '_titlePosition: { type: "enum"');
  if (patched === source) throw new Error("fixture no longer has settings.titlePosition to rename");
  writeFileSync(file, patched);
}

async function prepare(): Promise<string> {
  const dir = materializeFixture("site-2.0");
  renameToUnderscore(dir);
  const nuxtBin = join(dir, "node_modules", ".bin", "nuxt");
  await execFileAsync(nuxtBin, ["prepare", dir], { cwd: dir, env: { ...process.env, NUXT_TELEMETRY_DISABLED: "1" } });
  return dir;
}

async function seedDb(dir: string, storedValue: string | undefined): Promise<string> {
  const file = join(dir, "kestrel.db");
  const db = createPersistenceSqlite({ file }, { logger: silentLogger });
  try {
    await db.ensureCollection("settings", { _titlePosition: "string" });
    if (storedValue !== undefined) await db.createOne("settings", { _titlePosition: storedValue });
  } finally {
    db.close();
  }
  return file;
}

async function runData(dir: string, dbFile: string, outFile: string): Promise<UpgradeReport & { underscoreFields: Record<string, Record<string, number | null>> }> {
  const lines: string[] = [];
  await runUpgradeCli(["data", "--db", dbFile, "--root", dir, "--out", outFile, "--json"], { plugins: [createLayerPlugin()], stdout: (l) => lines.push(l), stderr: (l) => lines.push(l) });
  return JSON.parse(lines.join("\n"));
}

async function checkWithReport(dir: string, reportFile: string): Promise<UpgradeReport> {
  const lines: string[] = [];
  await runUpgradeCli(["check", "--root", dir, "--data-report", reportFile, "--json"], { plugins: [createLayerPlugin()], stdout: (l) => lines.push(l), stderr: (l) => lines.push(l), forceInstalledMajor: 6 });
  return JSON.parse(lines.join("\n"));
}

async function fixWithReport(dir: string, reportFile: string): Promise<number> {
  return runUpgradeCli(["fix", "--root", dir, "--write", "--yes", "--data-report", reportFile], { plugins: [createLayerPlugin()], stdout: () => undefined, stderr: () => undefined, forceInstalledMajor: 6 });
}

afterEach(() => {
  cleanupAllFixtures();
});

describe("dataModel() and model/underscore-field, verified against a real data report", () => {
  it("data --db counts zero stored values; check proves it safe, fix --write renames shared/model.ts automatically, the fixed project still boots", async () => {
    const dir = await prepare();
    const dbFile = await seedDb(dir, undefined);
    const outFile = join(dir, "report.json");
    const dataReport = await runData(dir, dbFile, outFile);
    expect(dataReport.tiers.data).toBe("done");
    expect(dataReport.underscoreFields["settings._titlePosition"]).toEqual({ unlocalized: 0 });

    const report = await checkWithReport(dir, outFile);
    const finding = report.findings.find((f) => f.rule === "model/underscore-field");
    expect(finding?.message).toContain("zero stored values");
    expect(finding?.fix.kind).toBe("auto");

    await fixWithReport(dir, outFile);
    const model = readFileSync(join(dir, "shared", "model.ts"), "utf8");
    expect(model).toContain("titlePosition:");
    expect(model).not.toContain("_titlePosition");

    const { project } = await loadLayerProject(dir);
    if (project === undefined) throw new Error("project failed to load after the rename");
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);
  }, 60_000);

  it("data --db counts a stored value; check still asks, with no default", async () => {
    const dir = await prepare();
    const dbFile = await seedDb(dir, "suffix");
    const outFile = join(dir, "report.json");
    const dataReport = await runData(dir, dbFile, outFile);
    expect(dataReport.underscoreFields["settings._titlePosition"]).toEqual({ unlocalized: 1 });

    const report = await checkWithReport(dir, outFile);
    const finding = report.findings.find((f) => f.rule === "model/underscore-field");
    expect(finding?.fix.kind).toBe("ask");
    if (finding?.fix.kind !== "ask") throw new Error("expected ask");
    expect(finding.fix).not.toHaveProperty("defaultValue");
  }, 60_000);
});
