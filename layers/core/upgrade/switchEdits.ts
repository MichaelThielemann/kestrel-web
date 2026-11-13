import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findCalls, firstArgument, objectProperty, parseTs, replaceModuleListEntry, span, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Edit, LoadedProject, RuleContext, SwitchEditsResult } from "@michaelthielemann/kestrel-upgrade/plugin";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { delaysFor, lanesFor } from "../pipelines/checkPreset";
import type { Feature, PresetOptions } from "../pipelines/checkPreset";
import { PAGE_DELIVERY_PIPELINES, REFRESH_INDEXES_PIPELINE, REFRESH_LLMS_PIPELINE, REPUBLISH_OUTPUT_PIPELINE, dependentsPipelineNames } from "../pipelines/features/delivery";
import { PATH_PIPELINES } from "../pipelines/paths";
import { addStringToNamedExportArray, dependenciesRender, hasModuleEntry, setDependenciesRender } from "./edits";
import { renderDependenciesText } from "./dependentsRules";
import { layerProjectData } from "./load";
import { queueEmitPlacementEdits } from "./overrideEmit";
import { findFeaturesArrayFile, packageJsonPath, presetOptionsCast } from "./ruleHelpers";

const SERVERLESS_MARKER_FILES = ["vercel.json", "netlify.toml", "wrangler.toml", "serverless.yml", "template.yaml"];
const EVENTS_DIRECT_PACKAGE = "@michaelthielemann/kestrel-events-direct";
const EVENTS_QUEUE_PACKAGE = "@michaelthielemann/kestrel-events-queue";
const DELIVERY_STATIC_PACKAGE = "@michaelthielemann/kestrel-delivery-static";

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

function queuedFeatures(ctx: RuleContext): Feature[] {
  return [...(presetOptionsCast(ctx)?.features ?? []), "eventsQueue"];
}

function queuedLanes(ctx: RuleContext): string {
  const lanes = lanesFor(queuedFeatures(ctx));
  return Object.entries(lanes).map(([lane, members]) => `${lane}: [${members.map((m) => `"${m}"`).join(", ")}]`).join(", ");
}

function queuedDelays(ctx: RuleContext): string {
  const delays = Object.entries(delaysFor(queuedFeatures(ctx)));
  return delays.length === 0 ? "" : `, delayMs: { ${delays.map(([pipeline, ms]) => `${pipeline}: ${ms}`).join(", ")} }`;
}

function presetModuleConfigReactsToFeatures(source: string): boolean {
  const call = findCalls(parseTs(source), "presetModuleConfig")[0];
  const options = call === undefined ? undefined : firstArgument(call);
  const value = options === undefined ? undefined : objectProperty(options, "features");
  return value !== undefined && value.type === "Identifier" && value.name === "features";
}

function removeModuleListEntry(file: string, source: string, use: string): Edit | undefined {
  let found: ReturnType<typeof parseTs> | undefined;
  walk(parseTs(source), (node) => {
    if (found !== undefined || node.type !== "ObjectExpression") return;
    if (stringValue(objectProperty(node, "use")) === use) found = node;
  });
  if (found === undefined) return undefined;
  const { start, end } = span(found);
  const after = /^\s*,\s*/.exec(source.slice(end));
  if (after !== null) return { file, start, end: end + after[0].length, text: "" };
  const before = /,\s*$/.exec(source.slice(0, start));
  if (before !== null) return { file, start: start - before[0].length, end, text: "" };
  return { file, start, end, text: "" };
}

function handWrittenModuleListEdit(ctx: RuleContext, relayPipelines: readonly string[]): Edit | undefined {
  const source = ctx.readFile(ctx.project.configFile);
  if (source === undefined || !importsEventsDirectLiteral(source)) return undefined;
  if (presetModuleConfigReactsToFeatures(source)) return removeModuleListEntry(ctx.project.configFile, source, EVENTS_DIRECT_PACKAGE);
  const config = `{ relayPipelines: [${relayPipelines.map((p) => `"${p}"`).join(", ")}], lanes: { ${queuedLanes(ctx)} }${queuedDelays(ctx)} }`;
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
 * edited: deleted outright when `presetModuleConfig()`'s own `features:` argument is the same `features`
 * export the switch is adding `"eventsQueue"` to (it then supplies its own `events-queue` entry once that
 * lands, and keeping the literal would list the module twice), otherwise replaced with `events-queue` and
 * `relayPipelines` set to the `relayPipelines` this hook receives — the
 * value `offer/event-queue` already asked the `relay-pipelines` question for and verified — never a value
 * this hook computes on its own, as a second, independent all-or-nothing part: either edit failing to
 * locate makes the whole switch manual and names which one. That second part is left out entirely (not
 * offered, not required) when the project already has more than one delivery module — the features edit
 * alone then yields exactly one `events-queue` entry, from `presetModuleConfig()`'s own reactive one.
 * The replacing entry also gets the `lanes` of `lanesFor(features)` and the `delayMs` of `delaysFor(features)`, and a `kestrel-delivery-static` entry
 * written literally in `kestrel.config.ts` gets `dependencies.render: "events"` as a part of its own, since
 * the preset refuses queue delivery with background renders. An override whose watched emit the queue's
 * default runs inside the write's group gets it placed there, as a part of its own
 * (`queueEmitPlacementEdits`); an override that part cannot place leaves the switch as it is.
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
  if (configSource !== undefined && hasModuleEntry(configSource, DELIVERY_STATIC_PACKAGE) && dependenciesRender(configSource, DELIVERY_STATIC_PACKAGE) !== "events") {
    const renderEdit = setDependenciesRender(ctx.project.configFile, configSource, DELIVERY_STATIC_PACKAGE, "events", renderDependenciesText("events"));
    parts["kestrel.config.ts's delivery-static render mode"] = renderEdit === undefined ? undefined : [renderEdit];
  }
  const placement = queueEmitPlacementEdits(ctx);
  if (placement.length > 0) parts["kestrel.config.ts's overrides, their emits inside the write's group"] = placement;
  return { parts, blockers: deploymentBlockers(ctx) };
}

const ALWAYS_IDEMPOTENT_PIPELINES: readonly string[] = [
  REPUBLISH_OUTPUT_PIPELINE,
  REFRESH_INDEXES_PIPELINE,
  REFRESH_LLMS_PIPELINE,
  PAGE_DELIVERY_PIPELINES.publish,
  PAGE_DELIVERY_PIPELINES.unpublish,
  "generateImageVariants",
  "auditAuth",
  "anonymizeAuditUser",
  PATH_PIPELINES.movedRedirects,
  PATH_PIPELINES.movedDelivery,
  PATH_PIPELINES.rebuildAfterMigrations,
];

function presetOptionsOf(project: LoadedProject): PresetOptions | undefined {
  const data = layerProjectData(project);
  if (data?.presetOptions === undefined) return undefined;
  return boundaryCast<PresetOptions>(data.presetOptions, "host");
}

/**
 * Every event-triggered pipeline of the preset's own that `offer/event-queue` can skip its
 * `idempotent:<pipeline>` question for, because the module that runs it already guarantees running it
 * twice for one event is safe: `republishOutput` checks the current row before writing, and it,
 * `refreshIndexes` and `refreshLlms` are pure recomputations; `publishPage`/`unpublishPage` and each generic collection's own
 * `<name>Dependents` (plus `settingsDependents`/`mediaDependents`) write through an optimistic version
 * check or a plain state overwrite, never an increment; `generateImageVariants` dedupes in-process by
 * media id and every write is itself state-checked; `auditAuth` and `anonymizeAuditUser` dedupe by the
 * event's own `eventId` (`audit.record`) or are themselves idempotent state changes
 * (`audit.anonymize`, documented to change nothing on a second call); `pathsMovedRedirects` applies a move
 * only when its sequence number is newer than the stored one, `pathsMovedDelivery` only marks outputs, and
 * `rebuildPathsAfterMigrations` recomputes the path index from the stored documents. A project's own event pipelines are
 * never included here — only what this preset's own modules already guarantee.
 */
export function layerIdempotentPipelines(project: LoadedProject): readonly string[] {
  const collections = presetOptionsOf(project)?.collections ?? {};
  return [...ALWAYS_IDEMPOTENT_PIPELINES, ...dependentsPipelineNames(collections)];
}
