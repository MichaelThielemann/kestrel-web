import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, toNodeListener, use } from "h3";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import { checkBoot, type BootInput, type Kestrel } from "@michaelthielemann/kestrel";
import { sandboxBootInput } from "@michaelthielemann/kestrel-upgrade/sandbox";
import { runUpgradeCli } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { UpgradeReport } from "@michaelthielemann/kestrel-upgrade";
import { detectLayerProject, loadLayerProject } from "../load";
import { createLayerPlugin } from "../plugin";
import { cleanupAllFixtures, materializeFixture } from "./materialize";

const execFileAsync = promisify(execFile);
const runningKestrels: Kestrel[] = [];

function runOptionsWithMajor6(options: Parameters<typeof runUpgradeCli>[1]): Parameters<typeof runUpgradeCli>[1] & { forceInstalledMajor: number } {
  return { ...options, forceInstalledMajor: 6 };
}

async function prepare(name: string): Promise<string> {
  const dir = materializeFixture(name);
  const nuxtBin = join(dir, "node_modules", ".bin", "nuxt");
  await execFileAsync(nuxtBin, ["prepare", dir], { cwd: dir, env: { ...process.env, NUXT_TELEMETRY_DISABLED: "1" } });
  return dir;
}

async function check(dir: string): Promise<UpgradeReport> {
  const { report } = await checkWithExit(dir);
  return report;
}

async function checkWithExit(dir: string): Promise<{ report: UpgradeReport; exitCode: number }> {
  const lines: string[] = [];
  const exitCode = await runUpgradeCli(["check", "--root", dir, "--json"], runOptionsWithMajor6({ plugins: [createLayerPlugin()], stdout: (l) => lines.push(l), stderr: (l) => lines.push(l) }));
  return { report: JSON.parse(lines.join("\n")) as UpgradeReport, exitCode };
}

async function fixWriteYes(dir: string): Promise<number> {
  return runUpgradeCli(["fix", "--root", dir, "--write", "--yes"], runOptionsWithMajor6({ plugins: [createLayerPlugin()], stdout: () => undefined, stderr: () => undefined }));
}

async function loadProject(dir: string): Promise<import("@michaelthielemann/kestrel-upgrade/plugin").LoadedProject> {
  const { project, issues } = await loadLayerProject(dir);
  if (project === undefined) throw new Error(`project failed to load: ${issues.map((i) => i.message).join("; ")}`);
  return project;
}

/** Boots the fixed project for real and answers `POST /api/login` through the layer's own h3 handler. */
async function bootAndLogin(input: BootInput): Promise<number> {
  const { bootWithAdminBootstrapCheck } = await import("../../server/utils/admin-bootstrap");
  const kestrel = await bootWithAdminBootstrapCheck(input);
  runningKestrels.push(kestrel);
  await kestrel.start();
  const app = createApp();
  use(app, createKestrelHandler(kestrel, { mountPath: "/api" }));
  const server = createServer(toNodeListener(app));
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  try {
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no server address");
    const res = await fetch(`http://127.0.0.1:${address.port}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "change-me" }),
    });
    return res.status;
  } finally {
    server.close();
  }
}

afterEach(async () => {
  cleanupAllFixtures();
  while (runningKestrels.length > 0) await runningKestrels.pop()?.stop();
});

describe("site-2.0 (create-kestrel template shape, presetModuleConfig, no overrides)", () => {
  it("check on the untouched fixture finds the range bumps and the missing sanitizeSvg feature; the project itself does not load yet (the real preset error, not a false green)", async () => {
    const dir = await prepare("site-2.0");
    const report = await check(dir);
    expect(report.tiers.source).toBe("failed");
    expect(report.tiers.load).toBe("not-run");
    expect(report.tiers.boot).toBe("not-run");

    const errorRules = new Set(report.findings.filter((f) => f.severity === "error").map((f) => f.rule));
    expect(errorRules).toEqual(new Set(["deps/kestrel-range", "deps/layer-range", "preset/missing-sanitize-svg", "load/failed"]));

    const layerRange = report.findings.find((f) => f.rule === "deps/layer-range");
    expect(layerRange?.fix.kind).toBe("auto");

    const sanitizeSvg = report.findings.find((f) => f.rule === "preset/missing-sanitize-svg");
    expect(sanitizeSvg?.fix.kind).toBe("auto");

    const loadFailed = report.findings.find((f) => f.rule === "load/failed");
    expect(loadFailed?.where.file).toBe("shared/model.ts");
    expect(loadFailed?.message).toContain('the "sanitizeSvg" feature is not enabled');

    expect(report.findings.some((f) => f.rule === "offer/event-queue")).toBe(false);
  }, 60_000);

  it("a second check, after fixing the range bumps and sanitizeSvg, loads the project, boots it and offers the queue switch", async () => {
    const dir = await prepare("site-2.0");
    await fixWriteYes(dir);
    const report = await check(dir);
    expect(report.tiers.boot).toBe("done");
    expect(report.findings.some((f) => f.severity === "error")).toBe(false);

    const offer = report.findings.find((f) => f.rule === "offer/event-queue");
    expect(offer?.message).toBe("can switch to the queue");
    expect(offer?.fix).toMatchObject({ kind: "ask", question: "switch-to-queue", defaultValue: "no" });

    const project = await loadProject(dir);
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);
  }, 60_000);

  it("fix --write --yes bumps the ranges and adds sanitizeSvg; the fixed project boots and answers POST /api/login 200", async () => {
    const dir = await prepare("site-2.0");
    await fixWriteYes(dir);

    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(pkg.dependencies["@michaelthielemann/kestrel-web"]).toBe("^3.0.0");

    const model = readFileSync(join(dir, "shared", "model.ts"), "utf8");
    expect(model).toMatch(/"sanitizeSvg"/);

    expect(await detectLayerProject(dir)).toBe(true);
    const project = await loadProject(dir);
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);

    const status = await bootAndLogin({ ...project.input, root: dir });
    expect(status).toBe(200);
  }, 60_000);

  it("a check run right after fix --write --yes loads and boots cleanly, with no preset/missing-sanitize-svg finding left", async () => {
    const dir = await prepare("site-2.0");
    await fixWriteYes(dir);

    const report = await check(dir);
    expect(report.tiers.source).toBe("done");
    expect(report.tiers.load).toBe("done");
    expect(report.tiers.boot).toBe("done");
    expect(report.findings.some((f) => f.rule === "preset/missing-sanitize-svg")).toBe(false);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
  }, 60_000);

  it("fix --write --answers switch-to-queue:yes switches delivery; the switched project still boots and logs in", async () => {
    const dir = await prepare("site-2.0");
    await fixWriteYes(dir); // unblocks the project's own load first (bumps ranges, adds sanitizeSvg)
    const eventPipelines = ["generateImageVariants", "publishPage", "unpublishPage", "reassignRevisionAuthor"];
    const answersFile = join(dir, "answers.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(answersFile, JSON.stringify({ "switch-to-queue": "yes", ...Object.fromEntries(eventPipelines.map((p) => [`idempotent:${p}`, "yes"])) }));
    await runUpgradeCli(["fix", "--root", dir, "--write", "--yes", "--answers", answersFile], runOptionsWithMajor6({ plugins: [createLayerPlugin()], stdout: () => undefined, stderr: () => undefined }));

    const model = readFileSync(join(dir, "shared", "model.ts"), "utf8");
    expect(model).toMatch(/"eventsQueue"/);

    const fixedProject = await loadProject(dir);
    const box = sandboxBootInput(fixedProject.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);
    expect(fixedProject.input.modules.some((m) => m.name === "events/queue")).toBe(true);
    expect(fixedProject.input.modules.some((m) => m.name === "events/direct")).toBe(false);

    const status = await bootAndLogin({ ...fixedProject.input, root: dir });
    expect(status).toBe(200);
  }, 60_000);
});

describe("site-2.0-custom (hand-written module list, eventsQueue already on, a 2.x-shaped override)", () => {
  it("check on the untouched fixture finds the range bumps and the missing sanitizeSvg feature; the project itself does not load yet, so the relayPipelines and override findings (which need it) don't appear", async () => {
    const dir = await prepare("site-2.0-custom");
    const report = await check(dir);
    expect(report.tiers.source).toBe("failed");
    expect(report.tiers.load).toBe("not-run");

    const layerRange = report.findings.find((f) => f.rule === "deps/layer-range");
    expect(layerRange?.fix.kind).toBe("auto");
    const sanitizeSvg = report.findings.find((f) => f.rule === "preset/missing-sanitize-svg");
    expect(sanitizeSvg?.fix.kind).toBe("auto");

    for (const rule of ["preset/relay-scope", "preset/override-group", "preset/override-relay", "offer/event-queue"]) {
      expect(report.findings.find((f) => f.rule === rule)).toBeUndefined();
    }
  }, 60_000);

  it("a second check, once the first fix has unblocked the project's own load, finds the missing relayPipelines and the forward-port for deletePage; the offer says nothing since it is already on the queue", async () => {
    const dir = await prepare("site-2.0-custom");
    await fixWriteYes(dir);
    const report = await check(dir);
    expect(report.tiers.load).toBe("done");

    const relayScope = report.findings.find((f) => f.rule === "preset/relay-scope");
    expect(relayScope?.fix.kind).toBe("auto");
    expect(relayScope?.suggestion).toContain("relayPipelines");

    expect(report.findings.find((f) => f.rule === "offer/event-queue")).toBeUndefined();

    const group = report.findings.find((f) => f.rule === "preset/override-group");
    expect(group?.fix.kind).toBe("auto");
    const relay = report.findings.find((f) => f.rule === "preset/override-relay");
    expect(relay?.fix.kind).toBe("auto");
  }, 60_000);

  it("two fix --write --yes passes forward-port deletePage's override, add relayPipelines and bump ranges; the fixed project boots and answers POST /api/login 200", async () => {
    const dir = await prepare("site-2.0-custom");
    await fixWriteYes(dir); // pass 1: unblocks the project's own load (range bumps, sanitizeSvg)
    await fixWriteYes(dir); // pass 2: now that it loads, the project-tier findings (relayPipelines, the override forward-port)

    const config = readFileSync(join(dir, "kestrel.config.ts"), "utf8");
    expect(config).toMatch(/relayPipelines:\s*\["publishPage",\s*"unpublishPage"\]/);
    expect(config).toMatch(/\{\s*atomic:\s*\[\s*"references\.guard:pages",\s*"content\.remove:pages",\s*"references\.unindex:pages",\s*"links\.unextract:pages",\s*"events\.emit:page\.deleted"\s*\]\s*\}/);
    expect(config).toMatch(/events\.emit:page\.deleted"\s*\]\s*\},\s*"events\.relay"/);

    const project = await loadProject(dir);
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);

    const status = await bootAndLogin({ ...project.input, root: dir });
    expect(status).toBe(200);
  }, 60_000);

  it("a third fix makes no further edit at all (fully idempotent once both passes have run)", async () => {
    const dir = await prepare("site-2.0-custom");
    await fixWriteYes(dir);
    await fixWriteYes(dir);
    const beforeConfig = readFileSync(join(dir, "kestrel.config.ts"), "utf8");
    const beforePkg = readFileSync(join(dir, "package.json"), "utf8");
    await fixWriteYes(dir);
    expect(readFileSync(join(dir, "kestrel.config.ts"), "utf8")).toBe(beforeConfig);
    expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(beforePkg);
  }, 60_000);
});

describe("site-2.0-withdelivery (features built by a function call, not a plain array literal)", () => {
  it("never reports success while the real load fails: preset/missing-sanitize-svg stays silent, a manual load/failed finding names shared/model.ts, and the exit code is not 0", async () => {
    const dir = await prepare("site-2.0-withdelivery");
    const { report, exitCode } = await checkWithExit(dir);

    expect(report.tiers.source).toBe("failed");
    expect(report.tiers.load).toBe("not-run");
    expect(report.findings.some((f) => f.rule === "preset/missing-sanitize-svg")).toBe(false);

    const loadFailed = report.findings.find((f) => f.rule === "load/failed");
    expect(loadFailed?.severity).toBe("error");
    expect(loadFailed?.fix.kind).toBe("manual");
    expect(loadFailed?.where.file).toBe("shared/model.ts");
    expect(loadFailed?.message).toContain('"sanitizeSvg"');
    expect(loadFailed?.message).toContain('the "sanitizeSvg" feature is not enabled');

    expect(exitCode).not.toBe(0);
  }, 60_000);

  it("fix --write --yes also cannot succeed: it makes no edit and its own exit code is not 0", async () => {
    const dir = await prepare("site-2.0-withdelivery");
    const before = readFileSync(join(dir, "shared", "model.ts"), "utf8");
    const exitCode = await fixWriteYes(dir);
    expect(readFileSync(join(dir, "shared", "model.ts"), "utf8")).toBe(before);
    expect(exitCode).not.toBe(0);
  }, 60_000);
});

describe("site-2.0-bad-override (presetModuleConfig's own overrides names a module that is not enabled)", () => {
  it("surfaces the real preset error verbatim as load/failed, not swallowed or replaced by an unrelated finding", async () => {
    const dir = await prepare("site-2.0-bad-override");
    const { report, exitCode } = await checkWithExit(dir);

    expect(report.tiers.source).toBe("failed");
    const loadFailed = report.findings.find((f) => f.rule === "load/failed");
    expect(loadFailed?.message).toBe('presetModuleConfig: overrides name module "@michaelthielemann/kestrel-nonexistent-module" which is not enabled');
    expect(loadFailed?.where.file).toBe("kestrel.config.ts");
    expect(report.findings.some((f) => f.rule === "preset/missing-sanitize-svg")).toBe(false);
    expect(exitCode).not.toBe(0);
  }, 60_000);
});

describe("site-2.0-static-rules (the settings-key, route-cache and publish-all reminders wired end to end through the real CLI)", () => {
  it("check finds the old site:settings key, the page-route cache rule and the Publish all reminder, on the very first run", async () => {
    const dir = await prepare("site-2.0-static-rules");
    const report = await check(dir);

    const settingsKey = report.findings.find((f) => f.rule === "site/settings-key");
    expect(settingsKey?.message).toContain("refreshNuxtData");
    expect(settingsKey?.severity).toBe("error");

    const routeCache = report.findings.find((f) => f.rule === "static/route-cache");
    expect(routeCache?.message).toContain('routeRules["/about/**"]');
    expect(routeCache?.severity).toBe("info");

    const publishAll = report.findings.find((f) => f.rule === "ops/publish-all");
    expect(publishAll?.suggestion).toContain("Publish all");
    expect(publishAll?.severity).toBe("warning");
  }, 60_000);
});

describe("site-2.0-inline-features (features declared directly in kestrel.config.ts, not imported from shared/model.ts)", () => {
  it("names kestrel.config.ts, not shared/model.ts, as the file to fix", async () => {
    const dir = await prepare("site-2.0-inline-features");
    const report = await check(dir);

    const loadFailed = report.findings.find((f) => f.rule === "load/failed");
    expect(loadFailed?.where.file).toBe("kestrel.config.ts");
    expect(loadFailed?.message).toContain("kestrel.config.ts's features is missing");
  }, 60_000);
});
