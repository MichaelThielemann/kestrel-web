import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createJiti } from "jiti";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { KestrelConfigInput } from "@michaelthielemann/kestrel";
import type { ModuleDefinition } from "@michaelthielemann/kestrel/defineModule";
import type { PipelineDefinition } from "@michaelthielemann/kestrel/definePipeline";
import type { LoadedProject, LoadIssue, LoadResult } from "@michaelthielemann/kestrel-upgrade/plugin";
import { kestrelAliases } from "./aliases";
import type { CapturedPreset } from "./pipelinesCapture";

const execFileAsync = promisify(execFile);

const CAPTURE_WRAPPER = fileURLToPath(new URL("./pipelinesCapture.ts", import.meta.url));

export interface LayerProjectData {
  presetOptions?: unknown;
  presetProblems: Array<{ code: string; pipeline?: string; message: string }>;
}

/**
 * A layer project has its own `kestrel.config.ts` (a plain backend project has one too, so this alone
 * does not decide it) and an installed `@michaelthielemann/kestrel-web`, whose own `nuxt.config.ts` is
 * what every layer project's `nuxt.config.ts` extends. Checking the package is on disk is cheap and does
 * not need to load or parse anything.
 */
export async function detectLayerProject(root: string): Promise<boolean> {
  if (!existsSync(join(root, "kestrel.config.ts"))) return false;
  try {
    const require = createRequire(pathToFileURL(resolve(root, "package.json")).href);
    const packageJsonFile = require.resolve("@michaelthielemann/kestrel-web/package.json");
    return existsSync(join(dirname(packageJsonFile), "nuxt.config.ts"));
  } catch {
    return false;
  }
}

function resolveModuleFile(root: string, use: string): string | undefined {
  if (use.startsWith("./") || use.startsWith("../")) return resolve(root, use);
  try {
    return createRequire(pathToFileURL(resolve(root, "package.json")).href).resolve(use);
  } catch {
    return undefined;
  }
}

function snapshotDir(dir: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const walkDir = (current: string, relBase: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      const rel = relBase === "" ? entry.name : join(relBase, entry.name);
      if (entry.isDirectory()) walkDir(abs, rel);
      else if (entry.isFile()) files.set(rel, readFileSync(abs));
    }
  };
  walkDir(dir, "");
  return files;
}

function restoreDir(files: ReadonlyMap<string, Buffer>, dir: string): void {
  for (const [rel, content] of files) {
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

/**
 * Runs `nuxt prepare` in the scratch copy so the migrations and optional-modules templates exist at the
 * paths `kestrelAliases()` predicts. Its output depends only on the project's own blocks and content
 * model, neither of which any rule in this plugin edits, so the first run's `.nuxt` is snapshotted into
 * `cache` (keyed by `root`, the one project this whole `check`/`fix` invocation loads) and replayed by a
 * plain file copy for every later scratch copy of the same project instead of rerunning the command.
 */
export async function prepareLayerProject(root: string, scratch: string, cache: Map<string, unknown>): Promise<void> {
  const nuxtDir = join(scratch, ".nuxt");
  const cacheKey = `kestrel-web:nuxt-prepare:${root}`;
  const cached = cache.get(cacheKey);
  if (cached instanceof Map) {
    restoreDir(cached as Map<string, Buffer>, nuxtDir);
    return;
  }
  const nuxtBin = join(scratch, "node_modules", ".bin", "nuxt");
  const bin = existsSync(nuxtBin) ? nuxtBin : "nuxt";
  await execFileAsync(bin, ["prepare", scratch], { cwd: scratch, env: { ...process.env, NUXT_TELEMETRY_DISABLED: "1" } });
  if (existsSync(nuxtDir)) cache.set(cacheKey, snapshotDir(nuxtDir));
}

function scratchUnique(scratch: string, aliasValue: string, filename: string): string {
  if (aliasValue.startsWith(`${scratch}/`) || aliasValue === scratch) return aliasValue;
  const dir = join(scratch, ".kestrel-upgrade-capture");
  mkdirSync(dir, { recursive: true });
  const target = join(dir, filename);
  writeFileSync(target, readFileSync(aliasValue, "utf8"));
  return target;
}

/**
 * Loads a layer project's config, modules and pipelines through jiti with the same `#kestrel/*` aliases
 * Nuxt resolves, substituting a capture wrapper for `#kestrel/pipelines` so `checkPreset()` composes the
 * preset instead of `definePreset()`. Every fixed-path fallback file (a bundled default, the capture
 * wrapper itself) is copied into this call's own `scratch` first, so jiti's module cache never answers a
 * later call — for a different project, or a different edit preview of this one — from an earlier one's
 * cached module. `project` is absent only when `kestrel.config.ts` itself fails to import; a module or
 * pipeline file failing becomes an `issues` entry instead.
 */
export async function loadLayerProject(scratch: string): Promise<LoadResult> {
  const buildDir = join(scratch, ".nuxt");
  const configFile = join(scratch, "kestrel.config.ts");
  const baseAliases = kestrelAliases(scratch, buildDir);
  const aliases: Record<string, string> = {
    ...baseAliases,
    "#kestrel/pipelines": scratchUnique(scratch, CAPTURE_WRAPPER, "pipelines-capture.ts"),
    "#kestrel/consumer-modules": scratchUnique(scratch, baseAliases["#kestrel/consumer-modules"]!, "modules-default.ts"),
    "#kestrel/consumer-pipelines": scratchUnique(scratch, baseAliases["#kestrel/consumer-pipelines"]!, "pipelines-default.ts"),
    "~~/kestrel.config": configFile,
    "@@/kestrel.config": configFile,
    "~~/": `${scratch}/`,
    "@@/": `${scratch}/`,
  };
  const jiti = createJiti(pathToFileURL(configFile).href, { alias: aliases, moduleCache: true, interopDefault: true });

  const previousAppRoot = process.env.KESTREL_APP_ROOT;
  process.env.KESTREL_APP_ROOT = scratch;
  try {
    let config: KestrelConfigInput;
    try {
      const configModule = await jiti.import<{ default: KestrelConfigInput }>(pathToFileURL(configFile).href);
      config = boundaryCast<KestrelConfigInput>(configModule.default, "host");
    } catch (err) {
      return { issues: [{ file: "kestrel.config.ts", message: err instanceof Error ? err.message : String(err) }] };
    }

    const issues: LoadIssue[] = [];

    let modules: ModuleDefinition[] = [];
    try {
      const modulesPath = aliases["#kestrel/consumer-modules"]!;
      const modulesModule = await jiti.import<{ default: ModuleDefinition[] }>(pathToFileURL(modulesPath).href);
      modules = modulesModule.default;
    } catch (err) {
      issues.push({ file: "kestrel.modules.ts", message: err instanceof Error ? err.message : String(err) });
    }

    let pipelines: PipelineDefinition[] = [];
    const pipelinesPath = aliases["#kestrel/consumer-pipelines"]!;
    const projectPipelinesFile = resolve(scratch, "pipelines/index.ts");
    const pipelinesFile = pipelinesPath === projectPipelinesFile ? projectPipelinesFile : configFile;
    try {
      const pipelinesModule = await jiti.import<{ pipelines: PipelineDefinition[] }>(pathToFileURL(pipelinesPath).href);
      pipelines = pipelinesModule.pipelines;
    } catch (err) {
      issues.push({ file: pipelinesPath === projectPipelinesFile ? "pipelines/index.ts" : "kestrel.config.ts", message: err instanceof Error ? err.message : String(err) });
    }

    const capture = await jiti.import<{ captured: { last?: CapturedPreset } }>(pathToFileURL(aliases["#kestrel/pipelines"]!).href);
    const presetProblems = capture.captured.last?.problems ?? [];

    const moduleFiles = new Map<string, string>();
    config.modules.forEach((entry, i) => {
      const mod = modules[i];
      if (mod === undefined) return;
      const file = resolveModuleFile(scratch, entry.use);
      if (file !== undefined) moduleFiles.set(mod.name, file);
    });

    const pipelineFiles = new Map<string, string>();
    const overriddenNames = Object.keys(boundaryCast<Record<string, unknown>>(capture.captured.last?.options.overrides ?? {}, "host"));
    for (const name of overriddenNames) pipelineFiles.set(name, pipelinesFile);

    const data: LayerProjectData = { presetProblems, ...(capture.captured.last === undefined ? {} : { presetOptions: capture.captured.last.options }) };

    const project: LoadedProject = {
      input: { config, modules, pipelines, root: scratch },
      kind: "kestrel-web",
      configFile,
      moduleFiles,
      pipelineFiles,
      data: boundaryCast<Record<string, unknown>>(data, "host"),
    };
    return { project, issues };
  } finally {
    if (previousAppRoot === undefined) delete process.env.KESTREL_APP_ROOT;
    else process.env.KESTREL_APP_ROOT = previousAppRoot;
  }
}

export function layerProjectData(project: LoadedProject): LayerProjectData | undefined {
  if (project.data === undefined) return undefined;
  return boundaryCast<LayerProjectData>(project.data, "host");
}

export function sharedModelFile(scratch: string): string {
  return join(scratch, "shared", "model.ts");
}
