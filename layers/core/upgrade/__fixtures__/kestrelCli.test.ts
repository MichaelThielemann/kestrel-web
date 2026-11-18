import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkBoot, silentLogger, type BootCheck } from "@michaelthielemann/kestrel";
import { loadHostPlugins, PLUGIN_API_VERSION, scanHosts, selectHostPlugin } from "@michaelthielemann/kestrel-upgrade/hosts";
import { runUpgradeCli, type HostProblem, type LoadIssue, type UpgradePlugin } from "@michaelthielemann/kestrel-upgrade/plugin";
import { sandboxBootInput } from "@michaelthielemann/kestrel-upgrade/sandbox";
import { createScratchCopy, removeScratchCopy } from "@michaelthielemann/kestrel-upgrade/scratch";
import type { UpgradeReport } from "@michaelthielemann/kestrel-upgrade";
import { cleanupAllFixtures, materializeFixture, materializeProject } from "./materialize";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PLAYGROUND = join(REPO_ROOT, "playground");
const CLI_VERSION: string = JSON.parse(readFileSync(join(REPO_ROOT, "node_modules/@michaelthielemann/kestrel/package.json"), "utf8")).version;
const HOST = { pluginApiVersion: PLUGIN_API_VERSION, cliVersion: CLI_VERSION };

afterEach(() => {
  cleanupAllFixtures();
});

function playgroundProject(edit?: (config: string) => string): string {
  return materializeProject("kestrel-web-playground-project", (dir) => {
    for (const entry of ["kestrel.config.ts", "shared", "app"]) cpSync(join(PLAYGROUND, entry), join(dir, entry), { recursive: true });
    writeFileSync(join(dir, "nuxt.config.ts"), 'export default defineNuxtConfig({ compatibilityDate: "2026-08-28", extends: ["@michaelthielemann/kestrel-web"] });\n');
    writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "example-site", private: true, type: "module", dependencies: { "@michaelthielemann/kestrel-web": "*" } }, null, 2)}\n`);
    if (edit !== undefined) writeFileSync(join(dir, "kestrel.config.ts"), edit(readFileSync(join(dir, "kestrel.config.ts"), "utf8")));
  });
}

async function discoveredPlugin(root: string): Promise<UpgradePlugin> {
  const scan = scanHosts(root, { cliVersion: CLI_VERSION });
  expect(scan.refused).toEqual([]);
  expect(scan.outdated).toEqual([]);
  const { loaded, refused } = await loadHostPlugins(scan.loadable, HOST);
  expect(refused).toEqual([]);
  const selection = await selectHostPlugin(loaded, root);
  if (!selection.ok || selection.active === undefined) throw new Error("no host plugin detects the project");
  return selection.active.plugin;
}

interface Checked {
  issues: LoadIssue[];
  bootCheck?: BootCheck;
  host: HostProblem[];
}

async function checkLikeTheCli(root: string): Promise<Checked> {
  const plugin = await discoveredPlugin(root);
  const scratch = await createScratchCopy(root);
  try {
    const { project, issues } = await plugin.load(root, scratch.dir, new Map());
    if (project === undefined) return { issues, host: [] };
    const box = sandboxBootInput(project.input, { dir: scratch.dir, ...(plugin.sandbox === undefined ? {} : { entries: plugin.sandbox }) });
    const bootCheck = await checkBoot({ ...box.input, root: scratch.dir, logger: silentLogger }, { setup: box.setup });
    const host = plugin.hostChecks === undefined ? [] : [...(await plugin.hostChecks(project, bootCheck))];
    return { issues, bootCheck, host };
  } finally {
    await removeScratchCopy(scratch);
  }
}

describe("the kestrel CLI's view of the playground's project, through the plugin the layer registers", () => {
  it("checks clean: it loads, boots without an error and passes every check the layer's server adds", async () => {
    const result = await checkLikeTheCli(playgroundProject());
    expect(result.issues).toEqual([]);
    expect(result.bootCheck?.errors).toEqual([]);
    expect(result.bootCheck?.notChecked).toEqual([]);
    expect(result.host).toEqual([]);
    expect(result.bootCheck?.manifest?.pipelines.some((pipeline) => pipeline.name === "updatePage")).toBe(true);
  }, 180_000);

  it("describes updatePage's atomic group and relay, and the event pipelines behind it, with the events queue on", async () => {
    const previous = process.env.KESTREL_PLAYGROUND_EVENTS_QUEUE;
    process.env.KESTREL_PLAYGROUND_EVENTS_QUEUE = "1";
    try {
      const result = await checkLikeTheCli(playgroundProject());
      expect(result.bootCheck?.errors).toEqual([]);
      const manifest = result.bootCheck?.manifest;
      const updatePage = manifest?.pipelines.find((pipeline) => pipeline.name === "updatePage");
      expect(updatePage?.steps.some((step) => step.atomic !== undefined)).toBe(true);
      expect(updatePage?.steps.some((step) => step.name === "events.relay")).toBe(true);
      expect(manifest?.triggers.events.some((trigger) => trigger.pipeline === "publishPage")).toBe(true);
      expect(manifest?.modules.some((mod) => mod.use === "@michaelthielemann/kestrel-events-queue")).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.KESTREL_PLAYGROUND_EVENTS_QUEUE;
      else process.env.KESTREL_PLAYGROUND_EVENTS_QUEUE = previous;
    }
  }, 180_000);

  it("reports a preset problem the layer's server would refuse to boot with as a host error", async () => {
    const root = playgroundProject((config) => config.replace("collectionsUi, homeSlug, fieldTypes", 'collectionsUi, homeSlug: "start", fieldTypes'));
    const result = await checkLikeTheCli(root);
    expect(result.host).toContainEqual(expect.objectContaining({ code: "preset/home-slug", severity: "error", owner: "kestrel-web" }));
  }, 180_000);

  it("boots a references-default entry with targets alone and reports the missing schemas as a host warning naming the fix", async () => {
    const targetsOnly = [
      "const listed = modules.map((entry) => (entry.use === \"@michaelthielemann/kestrel-references-default\"",
      "  ? { use: entry.use, config: { targets: { pages: { content: \"pages\" }, blog: { content: \"blog\" }, media: { media: true } } } }",
      "  : entry));",
      "export const preset = definePreset({ modules: listed,",
    ].join("\n");
    const root = playgroundProject((config) => config.replace("export const preset = definePreset({ modules,", targetsOnly).replace("defineConfig({ modules,", "defineConfig({ modules: listed,"));
    const result = await checkLikeTheCli(root);
    expect(result.issues).toEqual([]);
    expect(result.bootCheck?.errors).toEqual([]);
    const warning = result.host.find((problem) => problem.code === "preset/references-needs-schemas");
    expect(warning).toMatchObject({ severity: "warning", owner: "kestrel-web" });
    expect(warning?.reason).toMatch(/needs schemas? .*"pages\.body".* in references-default config.* set schemas: referenceSchemas\(/);
    expect(result.host.filter((problem) => problem.severity === "error")).toEqual([]);
  }, 180_000);
});

describe("kestrel upgrade through the plugin the layer registers", () => {
  it("finds the layer's rules on a 2.x project without a layer binary", async () => {
    const root = materializeFixture("site-2.0-custom");
    const plugin = await discoveredPlugin(root);
    const lines: string[] = [];
    const code = await runUpgradeCli(["check", "--root", root, "--json"], { plugins: [plugin], stdout: (line) => lines.push(line), stderr: () => undefined });
    const report: UpgradeReport = JSON.parse(lines.join("\n"));
    expect(code).toBe(1);
    expect(plugin.kind).toBe("kestrel-web");
    expect(report.findings.some((finding) => finding.rule === "deps/layer-range")).toBe(true);
    expect(report.findings.some((finding) => finding.rule === "deps/host-outdated")).toBe(false);
  }, 180_000);
});
