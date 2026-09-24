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

async function prepare(name: string): Promise<string> {
  const dir = materializeFixture(name);
  const nuxtBin = join(dir, "node_modules", ".bin", "nuxt");
  await execFileAsync(nuxtBin, ["prepare", dir], { cwd: dir, env: { ...process.env, NUXT_TELEMETRY_DISABLED: "1" } });
  return dir;
}

async function check(dir: string): Promise<UpgradeReport> {
  const lines: string[] = [];
  await runUpgradeCli(["check", "--root", dir, "--json"], { plugins: [createLayerPlugin()], stdout: (l) => lines.push(l), stderr: (l) => lines.push(l), forceInstalledMajor: 6 });
  return JSON.parse(lines.join("\n")) as UpgradeReport;
}

async function fixWriteYes(dir: string): Promise<number> {
  return runUpgradeCli(["fix", "--root", dir, "--write", "--yes"], { plugins: [createLayerPlugin()], stdout: () => undefined, stderr: () => undefined, forceInstalledMajor: 6 });
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
  it("check finds only the range bump and the queue offer; the boot tier runs", async () => {
    const dir = await prepare("site-2.0");
    const report = await check(dir);
    expect(report.tiers.boot).toBe("done");

    const errorRules = new Set(report.findings.filter((f) => f.severity === "error").map((f) => f.rule));
    expect(errorRules).toEqual(new Set(["deps/kestrel-range", "deps/layer-range"]));

    const layerRange = report.findings.find((f) => f.rule === "deps/layer-range");
    expect(layerRange?.fix.kind).toBe("auto");

    const offer = report.findings.find((f) => f.rule === "offer/event-queue");
    expect(offer?.message).toBe("can switch to the queue");
    expect(offer?.fix).toMatchObject({ kind: "ask", question: "switch-to-queue", defaultValue: "no" });

    const project = await loadProject(dir);
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);
  }, 60_000);

  it("fix --write --yes bumps the ranges; the fixed project boots and answers POST /api/login 200", async () => {
    const dir = await prepare("site-2.0");
    await fixWriteYes(dir);

    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(pkg.dependencies["@michaelthielemann/kestrel-web"]).toBe("^3.0.0");

    expect(await detectLayerProject(dir)).toBe(true);
    const project = await loadProject(dir);
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);

    const status = await bootAndLogin({ ...project.input, root: dir });
    expect(status).toBe(200);
  }, 60_000);

  it("fix --write --answers switch-to-queue:yes switches delivery; the switched project still boots and logs in", async () => {
    const dir = await prepare("site-2.0");
    const answersFile = join(dir, "answers.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(answersFile, JSON.stringify({ "switch-to-queue": "yes" }));
    // --write refuses without --yes or a TTY even with --answers supplied (consent to write is separate
    // from supplying an answer); --yes only fills in undecided questions here, since switch-to-queue is
    // already answered by the file.
    await runUpgradeCli(["fix", "--root", dir, "--write", "--yes", "--answers", answersFile], { plugins: [createLayerPlugin()], stdout: () => undefined, stderr: () => undefined, forceInstalledMajor: 6 });

    const model = readFileSync(join(dir, "shared", "model.ts"), "utf8");
    expect(model).toMatch(/"eventsQueue"/);

    const project = await loadProject(dir);
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);
    expect(project.input.modules.some((m) => m.name === "events/queue")).toBe(true);

    const status = await bootAndLogin({ ...project.input, root: dir });
    expect(status).toBe(200);
  }, 60_000);
});

describe("site-2.0-custom (hand-written module list, eventsQueue already on, a 2.x-shaped override)", () => {
  it("check finds the range bump, the missing relayPipelines and the forward-port for deletePage; the offer says it is already on the queue", async () => {
    const dir = await prepare("site-2.0-custom");
    const report = await check(dir);

    const relayScope = report.findings.find((f) => f.rule === "preset/relay-scope");
    expect(relayScope?.fix.kind).toBe("auto");
    expect(relayScope?.suggestion).toContain("relayPipelines");

    const offer = report.findings.find((f) => f.rule === "offer/event-queue");
    expect(offer?.message).toContain("already on the queue");

    const layerRange = report.findings.find((f) => f.rule === "deps/layer-range");
    expect(layerRange?.fix.kind).toBe("auto");

    const group = report.findings.find((f) => f.rule === "preset/override-group");
    expect(group?.fix.kind).toBe("auto");
    const relay = report.findings.find((f) => f.rule === "preset/override-relay");
    expect(relay?.fix.kind).toBe("auto");
  }, 60_000);

  it("fix --write --yes forward-ports deletePage's override, adds relayPipelines and bumps ranges; the fixed project boots and answers POST /api/login 200", async () => {
    const dir = await prepare("site-2.0-custom");
    await fixWriteYes(dir);

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

  it("a second fix makes no further edit at all (fully idempotent)", async () => {
    const dir = await prepare("site-2.0-custom");
    await fixWriteYes(dir);
    const beforeConfig = readFileSync(join(dir, "kestrel.config.ts"), "utf8");
    const beforePkg = readFileSync(join(dir, "package.json"), "utf8");
    await fixWriteYes(dir);
    expect(readFileSync(join(dir, "kestrel.config.ts"), "utf8")).toBe(beforeConfig);
    expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(beforePkg);
  }, 60_000);
});
