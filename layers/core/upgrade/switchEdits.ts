import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { objectProperty, parseTs, replaceModuleListEntry, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Edit, RuleContext, SwitchEditsResult } from "@michaelthielemann/kestrel-upgrade/plugin";
import { addStringToNamedExportArray } from "./edits";
import { findFeaturesArrayFile, packageJsonPath } from "./ruleHelpers";

const SERVERLESS_MARKER_FILES = ["vercel.json", "netlify.toml", "wrangler.toml", "serverless.yml", "template.yaml"];
const EVENTS_DIRECT_PACKAGE = "@michaelthielemann/kestrel-events-direct";
const EVENTS_QUEUE_PACKAGE = "@michaelthielemann/kestrel-events-queue";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nitroPresetMarker(ctx: RuleContext): string | undefined {
  const source = ctx.readFile(join(ctx.root, "nuxt.config.ts"));
  if (source === undefined) return undefined;
  const root = parseTs(source);
  let preset: string | undefined;
  walk(root, (node) => {
    if (preset !== undefined || node.type !== "ObjectExpression") return;
    const nitro = objectProperty(node, "nitro");
    if (nitro === undefined || nitro.type !== "ObjectExpression") return;
    const presetNode = objectProperty(nitro, "preset");
    if (presetNode !== undefined) preset = stringValue(presetNode) ?? "(computed)";
  });
  return preset === undefined ? undefined : `nitro.preset ("${preset}") in nuxt.config.ts`;
}

function nitroPresetScriptMarker(ctx: RuleContext): string | undefined {
  const source = ctx.readFile(packageJsonPath(ctx));
  if (source === undefined) return undefined;
  try {
    const scripts: unknown = JSON.parse(source).scripts;
    if (isRecord(scripts) && Object.values(scripts).some((s) => typeof s === "string" && s.includes("NITRO_PRESET"))) return "NITRO_PRESET in package.json's scripts";
  } catch {
    return undefined;
  }
  return undefined;
}

function nitroPresetFileMarker(ctx: RuleContext): string | undefined {
  let entries: string[];
  try {
    entries = readdirSync(ctx.root);
  } catch {
    return undefined;
  }
  const candidate = entries.find((e) => e === "Dockerfile" || e.startsWith(".env"));
  if (candidate === undefined) return undefined;
  try {
    if (readFileSync(join(ctx.root, candidate), "utf8").includes("NITRO_PRESET")) return `NITRO_PRESET in "${candidate}"`;
  } catch {
    return undefined;
  }
  return undefined;
}

function deploymentBlockers(ctx: RuleContext): string[] {
  const blockers: string[] = [];
  const file = SERVERLESS_MARKER_FILES.find((m) => existsSync(join(ctx.root, m)));
  if (file !== undefined) blockers.push(`"${file}" suggests the process does not stay alive between requests`);
  const nitro = nitroPresetMarker(ctx) ?? nitroPresetScriptMarker(ctx) ?? nitroPresetFileMarker(ctx);
  if (nitro !== undefined) blockers.push(`${nitro} suggests the process does not stay alive between requests`);
  return blockers;
}

function importsEventsDirectLiteral(source: string): boolean {
  return source.includes(`"${EVENTS_DIRECT_PACKAGE}"`) || source.includes(`'${EVENTS_DIRECT_PACKAGE}'`);
}

function handWrittenModuleListEdit(ctx: RuleContext, relayPipelines: readonly string[]): Edit | undefined {
  const source = ctx.readFile(ctx.project.configFile);
  if (source === undefined || !importsEventsDirectLiteral(source)) return undefined;
  const config = `{ relayPipelines: [${relayPipelines.map((p) => `"${p}"`).join(", ")}] }`;
  return replaceModuleListEntry(ctx.project.configFile, source, { use: EVENTS_DIRECT_PACKAGE, newUse: EVENTS_QUEUE_PACKAGE, config });
}

function hasAtMostOneDeliveryModule(ctx: RuleContext): boolean {
  const count = ctx.project.input.config.modules.filter((m) => m.use === EVENTS_DIRECT_PACKAGE || m.use === EVENTS_QUEUE_PACKAGE).length;
  return count <= 1;
}

/**
 * Supplies `UpgradePlugin.switchEdits` for a layer project: `offer/event-queue` keeps every gate (an
 * open event-payload or emits finding, the boot preview, no default when unverified) and only asks this
 * hook for the edits and any extra deployment markers. `presetModuleConfig()` derives the module list
 * from `features` at runtime, so the only edit a `presetModuleConfig()` project needs is adding
 * `"eventsQueue"` to `shared/model.ts`'s `features` array. A hand-written module list that names
 * `@michaelthielemann/kestrel-events-direct` literally in `kestrel.config.ts` also gets that entry
 * replaced with `events-queue` and `relayPipelines` set to the `relayPipelines` this hook receives — the
 * value `offer/event-queue` already asked the `relay-pipelines` question for and verified — never a value
 * this hook computes on its own, as a second, independent all-or-nothing part: either edit failing to
 * locate makes the whole switch manual and names which one. That second part is left out entirely (not
 * offered, not required) when the project already has more than one delivery module — the features edit
 * alone then yields exactly one `events-queue` entry, from `presetModuleConfig()`'s own reactive one.
 */
export async function layerSwitchEdits(ctx: RuleContext, relayPipelines: readonly string[]): Promise<SwitchEditsResult> {
  const file = findFeaturesArrayFile(ctx);
  const source = file === undefined ? undefined : ctx.readFile(file);
  const featuresEdit = file !== undefined && source !== undefined ? addStringToNamedExportArray(file, source, "features", "eventsQueue") : undefined;
  const parts: Record<string, Edit[] | undefined> = {
    "shared/model.ts's features array": featuresEdit === undefined ? undefined : [featuresEdit],
  };
  const configSource = ctx.readFile(ctx.project.configFile);
  if (configSource !== undefined && importsEventsDirectLiteral(configSource) && hasAtMostOneDeliveryModule(ctx)) {
    const moduleListEdit = handWrittenModuleListEdit(ctx, relayPipelines);
    parts["kestrel.config.ts's hand-written events-direct entry"] = moduleListEdit === undefined ? undefined : [moduleListEdit];
  }
  return { parts, blockers: deploymentBlockers(ctx) };
}
