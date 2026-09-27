import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createJiti } from "jiti";
import { findCalls, firstArgument, objectProperty, parseTs, stringValue } from "@michaelthielemann/kestrel-upgrade/codemods";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { KestrelConfigInput } from "@michaelthielemann/kestrel";
import type { ModuleDefinition } from "@michaelthielemann/kestrel/defineModule";
import type { PipelineDefinition } from "@michaelthielemann/kestrel/definePipeline";
import type { DataContentField, DataContentModel, DataContentType, LoadedProject, LoadIssue, LoadResult, PipelineFile } from "@michaelthielemann/kestrel-upgrade/plugin";
import { kestrelAliases } from "./aliases";
import { namedExportArray } from "./edits";
import { presetOverridesObjects } from "./locators";
import type { CapturedPreset } from "./pipelinesCapture";
import { layerBootInput } from "../server/utils/boot-input";
import type { SchemaBundle } from "../server/utils/bundled-schemas";
import type { SiteModel } from "../server/utils/site-model";
import type { WorkflowUi } from "../collections-ui/workflow";

const execFileAsync = promisify(execFile);

const CAPTURE_WRAPPER = fileURLToPath(new URL("./pipelinesCapture.ts", import.meta.url));

const SVG_NOT_SANITIZED_MESSAGE = 'the "sanitizeSvg" feature is not enabled';

function configLoadIssue(err: unknown, configFile: string): LoadIssue {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes(SVG_NOT_SANITIZED_MESSAGE)) {
    const configSource = existsSync(configFile) ? readFileSync(configFile, "utf8") : undefined;
    const inline = configSource !== undefined && namedExportArray(configSource, "features") !== undefined;
    const file = inline ? "kestrel.config.ts" : "shared/model.ts";
    return { file, message: `${file}'s features is missing "sanitizeSvg": ${message}` };
  }
  return { file: "kestrel.config.ts", message };
}

export interface LayerProjectData {
  presetOptions?: unknown;
  presetProblems: Array<{ code: string; pipeline?: string; message: string }>;
  siteModel?: SiteModel;
  collectionsUi?: Record<string, WorkflowUi>;
}

type Jiti = ReturnType<typeof createJiti>;

async function importIfPresent(jiti: Jiti, file: string | undefined): Promise<Record<string, unknown> | undefined> {
  if (file === undefined || !existsSync(file)) return undefined;
  const mod = await jiti.import<unknown>(pathToFileURL(file).href);
  return isRecord(mod) ? mod : undefined;
}

function schemaBundleOf(value: unknown): SchemaBundle {
  if (isRecord(value) && typeof value.mode === "string" && isRecord(value.schemas)) return { mode: value.mode, schemas: value.schemas };
  return { mode: "none", schemas: {} };
}

function siteModelOf(value: Record<string, unknown> | undefined): SiteModel | undefined {
  if (value === undefined || typeof value.prefixPrimary !== "boolean" || typeof value.homeSlug !== "string") return undefined;
  return { prefixPrimary: value.prefixPrimary, homeSlug: value.homeSlug };
}

async function serverInputs(jiti: Jiti, scratch: string, schemasFile: string | undefined): Promise<{ bundledSchemas: SchemaBundle; siteModel?: SiteModel; collectionsUi: Record<string, WorkflowUi> }> {
  const schemas = await importIfPresent(jiti, schemasFile);
  const model = await importIfPresent(jiti, sharedModelFile(scratch));
  const ui = await importIfPresent(jiti, join(scratch, "shared", "collections-ui.ts"));
  const siteModel = siteModelOf(model);
  const collectionsUi = isRecord(ui?.default) ? boundaryCast<Record<string, WorkflowUi>>(ui.default, "host") : {};
  return { bundledSchemas: schemaBundleOf(schemas?.default), collectionsUi, ...(siteModel === undefined ? {} : { siteModel }) };
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

function restoreDir(files: ReadonlyMap<string, Buffer>, dir: string, rebase: { from: string; to: string }): void {
  for (const [rel, content] of files) {
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content.toString("utf8").split(rebase.from).join(rebase.to));
  }
}

interface PrepareCache {
  scratch: string;
  files: Map<string, Buffer>;
}

function isPrepareCache(value: unknown): value is PrepareCache {
  return typeof value === "object" && value !== null && "scratch" in value && "files" in value && (value as { files: unknown }).files instanceof Map;
}

/**
 * Runs `nuxt prepare` in the scratch copy so the migrations and optional-modules templates exist at the
 * paths `kestrelAliases()` predicts. Its output depends only on the project's own blocks and content
 * model, neither of which any rule in this plugin edits, so the first run's `.nuxt` is snapshotted into
 * `cache` (keyed by `root`, the one project this whole `check`/`fix` invocation loads) and replayed by a
 * plain file copy for every later scratch copy of the same project instead of rerunning the command. A
 * generated file such as `kestrel/migrations.mjs` embeds absolute import paths under the scratch root that
 * produced it (`modules/migrations/scan.ts`'s `renderMigrationsModule`, rooted at `nuxt.options.rootDir`);
 * every restore rewrites the cached snapshot's own scratch root to the new one so those paths stay valid
 * once the copy that generated them is gone.
 */
export async function prepareLayerProject(root: string, scratch: string, cache: Map<string, unknown>): Promise<void> {
  const nuxtDir = join(scratch, ".nuxt");
  const cacheKey = `kestrel-web:nuxt-prepare:${root}`;
  const cached = cache.get(cacheKey);
  if (isPrepareCache(cached)) {
    restoreDir(cached.files, nuxtDir, { from: cached.scratch, to: scratch });
    return;
  }
  const nuxtBin = join(scratch, "node_modules", ".bin", "nuxt");
  const bin = existsSync(nuxtBin) ? nuxtBin : "nuxt";
  await execFileAsync(bin, ["prepare", scratch], { cwd: scratch, env: { ...process.env, NUXT_TELEMETRY_DISABLED: "1" } });
  if (existsSync(nuxtDir)) cache.set(cacheKey, { scratch, files: snapshotDir(nuxtDir) });
}

function definedPipelineNames(source: string): string[] {
  const root = parseTs(source);
  const names: string[] = [];
  for (const call of findCalls(root, "definePipeline")) {
    const options = firstArgument(call);
    const name = options === undefined ? undefined : stringValue(objectProperty(options, "name"));
    if (name !== undefined) names.push(name);
  }
  return names;
}

function definesPresetOverrides(source: string): boolean {
  return presetOverridesObjects(parseTs(source)).length > 0;
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
  const jiti = createJiti(pathToFileURL(configFile).href, { alias: aliases, moduleCache: true, fsCache: false, interopDefault: true });

  const previousAppRoot = process.env.KESTREL_APP_ROOT;
  process.env.KESTREL_APP_ROOT = scratch;
  try {
    let config: KestrelConfigInput;
    try {
      const configModule = await jiti.import<{ default: KestrelConfigInput }>(pathToFileURL(configFile).href);
      config = boundaryCast<KestrelConfigInput>(configModule.default, "host");
    } catch (err) {
      return { issues: [configLoadIssue(err, configFile)] };
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

    const overriddenNames = Object.keys(boundaryCast<Record<string, unknown>>(capture.captured.last?.options.overrides ?? {}, "host"));
    const hasOwnPipelinesFile = pipelinesPath === projectPipelinesFile;
    const ownSource = hasOwnPipelinesFile && existsSync(projectPipelinesFile) ? readFileSync(projectPipelinesFile, "utf8") : undefined;
    const configSource = existsSync(configFile) ? readFileSync(configFile, "utf8") : undefined;
    const overridesFile =
      configSource !== undefined && definesPresetOverrides(configSource)
        ? configFile
        : ownSource !== undefined && definesPresetOverrides(ownSource)
          ? projectPipelinesFile
          : configFile;
    const ownNames = ownSource === undefined ? [] : definedPipelineNames(ownSource).filter((name) => !overriddenNames.includes(name));

    const pipelineFilesByFile = new Map<string, string[]>();
    const addToPipelineFiles = (file: string, names: readonly string[]): void => {
      if (names.length === 0) return;
      pipelineFilesByFile.set(file, [...(pipelineFilesByFile.get(file) ?? []), ...names]);
    };
    if (overriddenNames.length > 0) addToPipelineFiles(overridesFile, overriddenNames);
    addToPipelineFiles(projectPipelinesFile, ownNames);
    const pipelineFiles: PipelineFile[] = [...pipelineFilesByFile].map(([file, names]) => ({ file, pipelines: names }));

    let server: Awaited<ReturnType<typeof serverInputs>> = { bundledSchemas: { mode: "none", schemas: {} }, collectionsUi: {} };
    try {
      server = await serverInputs(jiti, scratch, aliases["#kestrel/schemas"]);
    } catch (err) {
      issues.push({ file: "shared/model.ts", message: err instanceof Error ? err.message : String(err) });
    }

    const data: LayerProjectData = {
      presetProblems,
      collectionsUi: server.collectionsUi,
      ...(server.siteModel === undefined ? {} : { siteModel: server.siteModel }),
      ...(capture.captured.last === undefined ? {} : { presetOptions: capture.captured.last.options }),
    };

    const project: LoadedProject = {
      input: { ...layerBootInput({ config, modules, pipelines, bundledSchemas: server.bundledSchemas }), root: scratch },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function dataContentModelOf(value: unknown, file: string): DataContentModel | undefined {
  if (!isRecord(value) || !isRecord(value.types)) return undefined;
  const types: Record<string, DataContentType> = {};
  for (const [typeName, type] of Object.entries(value.types)) {
    if (!isRecord(type) || !isRecord(type.fields)) continue;
    const fields: Record<string, DataContentField> = {};
    for (const [field, def] of Object.entries(type.fields)) fields[field] = { localized: isRecord(def) && def.localized === true };
    types[typeName] = { fields };
  }
  const locales = value.locales;
  return { types, use: "shared/model.ts", file, ...(Array.isArray(locales) ? { locales: locales.filter((l): l is string => typeof l === "string") } : {}) };
}

/**
 * Supplies `UpgradePlugin.dataModel(root)`: loads `shared/model.ts` at `root` (not a scratch copy — the
 * `data` command never runs `nuxt prepare`) through jiti with the same `#kestrel/*` aliases as
 * `loadLayerProject`, then reads its `contentModel` export. `file` points `model/underscore-field`'s rename
 * at `shared/model.ts` itself instead of the built-in default (`LoadedProject.configFile`, which never has
 * the layer's content model inline). `undefined` on any load or shape failure, which skips underscore-field
 * counting for this run without failing the rest of `data`.
 *
 * Runs in place, against `root` itself, on every `check`/`fix` round too: `dataModel(root)` has no scratch
 * copy to import from (unlike `load(root, scratch, cache)`), and whether any field actually needs the
 * underscore-field rule can only be told by reading the model — there is no cheaper, safe pre-check, so
 * skipping this would risk missing a genuine orphaned-column warning instead of an unnecessary import.
 */
export async function loadDataModel(root: string): Promise<DataContentModel | undefined> {
  const model = await loadSharedContentModel(root);
  return model === undefined ? undefined : dataContentModelOf(model, sharedModelFile(root));
}

/** The `contentModel` export of `shared/model.ts` at `root`, loaded in place like `loadDataModel`; `undefined` when the file is missing or does not load. */
export async function loadSharedContentModel(root: string): Promise<unknown> {
  const file = sharedModelFile(root);
  if (!existsSync(file)) return undefined;
  const aliases = kestrelAliases(root, join(root, ".nuxt"));
  const jiti = createJiti(pathToFileURL(file).href, { alias: aliases, moduleCache: false, fsCache: false, interopDefault: true });
  try {
    const mod = await jiti.import<{ contentModel?: unknown }>(pathToFileURL(file).href);
    return mod.contentModel;
  } catch {
    return undefined;
  }
}
