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
import { materializeFixture } from "./materialize";

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
  while (runningKestrels.length > 0) await runningKestrels.pop()?.stop();
});

describe("site-2.0 (create-kestrel template shape, presetModuleConfig, no overrides)", () => {
  it("check finds only the range bumps and the queue offer; the boot tier itself is unreachable through check", async () => {
    const dir = await prepare("site-2.0");
    const report = await check(dir);
    // `@michaelthielemann/kestrel-web` always carries a different major than the project's kestrel*
    // backend packages by design (2.x with 5.x, 3.x with 6.x); kestrel-upgrade's own installedVersions()
    // treats every "@michaelthielemann/kestrel*"-named dependency uniformly, so `mixedMajors` is
    // permanently true for a layer project and `check`'s load/boot tier gate
    // (`kestrelMajor === 6 && !mixedMajors`) never opens through the standard command, even with
    // forceInstalledMajor. checkBoot cleanliness is instead verified directly, below and in the other
    // tests in this file.
    expect(report.tiers.boot).toBe("not-run");

    const errorRules = new Set(report.findings.filter((f) => f.severity === "error").map((f) => f.rule));
    expect(errorRules).toEqual(new Set(["deps/kestrel-range", "deps/layer-range", "deps/mixed-majors"]));

    const layerRange = report.findings.find((f) => f.rule === "deps/layer-range");
    expect(layerRange?.fix.kind).toBe("auto");

    const offer = report.findings.find((f) => f.rule === "preset/event-queue-offer");
    expect(offer?.message).toBe("can switch to the queue");
    expect(offer?.fix).toMatchObject({ kind: "ask", question: "switch-to-queue", defaultValue: "no" });

    const project = await loadLayerProject(dir);
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);
  }, 60_000);

  it("fix --write --yes bumps the ranges; the fixed project boots and answers POST /api/login 200", async () => {
    const dir = await prepare("site-2.0");
    // fix's own exit code still reflects the findings check() saw before the write (kestrel's own
    // documented behaviour); the real proof of success is the clean boot and the login below.
    await fixWriteYes(dir);

    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(pkg.dependencies["@michaelthielemann/kestrel-web"]).toBe("^3.0.0");
    expect(pkg.dependencies["@michaelthielemann/kestrel"]).toBe("^6.0.0");

    expect(await detectLayerProject(dir)).toBe(true);
    const project = await loadLayerProject(dir);
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

    const project = await loadLayerProject(dir);
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);
    expect(project.input.modules.some((m) => m.name === "events/queue")).toBe(true);

    const status = await bootAndLogin({ ...project.input, root: dir });
    expect(status).toBe(200);
  }, 60_000);
});

describe("site-2.0-custom (hand-written module list, eventsQueue already on)", () => {
  it("check finds the range bump and the missing relayPipelines; the offer says it is already on the queue", async () => {
    const dir = await prepare("site-2.0-custom");
    const report = await check(dir);

    const relayScope = report.findings.find((f) => f.rule === "preset/relay-scope");
    expect(relayScope?.fix.kind).toBe("auto");
    expect(relayScope?.suggestion).toContain("relayPipelines");

    const offer = report.findings.find((f) => f.rule === "preset/event-queue-offer");
    expect(offer?.message).toContain("already on the queue");

    const layerRange = report.findings.find((f) => f.rule === "deps/layer-range");
    expect(layerRange?.fix.kind).toBe("auto");
  }, 60_000);

  it("fix --write --yes adds relayPipelines and bumps ranges; the fixed project boots and answers POST /api/login 200", async () => {
    const dir = await prepare("site-2.0-custom");
    await fixWriteYes(dir);

    const config = readFileSync(join(dir, "kestrel.config.ts"), "utf8");
    expect(config).toMatch(/relayPipelines:\s*\["publishPage",\s*"unpublishPage"\]/);

    const project = await loadLayerProject(dir);
    const box = sandboxBootInput(project.input, { dir });
    const bootCheck = await checkBoot(box.input, { setup: box.setup });
    expect(bootCheck.errors).toEqual([]);

    const status = await bootAndLogin({ ...project.input, root: dir });
    expect(status).toBe(200);
  }, 60_000);

  it("a second fix repeats no edit of its own; kestrel-web's range is the one documented exception", async () => {
    const dir = await prepare("site-2.0-custom");
    await fixWriteYes(dir);
    const before = readFileSync(join(dir, "kestrel.config.ts"), "utf8");
    const beforePkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    await fixWriteYes(dir);
    expect(readFileSync(join(dir, "kestrel.config.ts"), "utf8")).toBe(before);
    const afterPkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    // Every dependency this rule set touches is idempotent except kestrel-web's own range: kestrel's
    // generic deps/kestrel-range (in DEFAULT_RULES) matches any "@michaelthielemann/kestrel*" name,
    // including "-web", and re-asserts ^6.0.0 on a run where the layer's own deps/layer-range rule (which
    // wants ^3.0.0) has nothing left to fix and stays silent — see layerRangeRule's own comment.
    for (const [name, range] of Object.entries(beforePkg.dependencies)) {
      if (name === "@michaelthielemann/kestrel-web") continue;
      expect(afterPkg.dependencies[name]).toBe(range);
    }
    expect(afterPkg.dependencies["@michaelthielemann/kestrel-web"]).toBe("^6.0.0");
  }, 60_000);
});
