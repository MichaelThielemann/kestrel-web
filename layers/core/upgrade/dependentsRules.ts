import { join, relative } from "node:path";
import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import { findCalls, firstArgument, isAstNode, objectProperty, parseTs, propertyKeyName, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Edit, Finding, Rule, RuleContext, SourceRule, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import { delaysFor, lanesFor, relayPipelinesFor } from "../pipelines/checkPreset";
import type { Feature } from "../pipelines/checkPreset";
import { consumerScripts } from "./consumerRules";
import { QUEUE_DEFAULT_BACKOFF_SECONDS, QUEUE_DEFAULT_MAX_ATTEMPTS } from "../pipelines/config";
import { MEDIA_DEPENDENT_EVENTS, REFRESH_INDEXES_PIPELINE, REQUEST_INDEXES_STEP } from "../pipelines/features/delivery";
import { mediaTrashEnabled } from "../pipelines/media-trash";
import { addModuleEntryConfigProperty, addModuleEntryNestedConfigProperties, hasModuleEntry, removeStepsFromArray, setDependenciesRender, setModuleEntryConfigProperties, setPresetModuleConfigOverride } from "./edits";
import type { PropertyText } from "./edits";
import { layerProjectData } from "./load";
import { MEDIA_PUBLIC_PATH, MOUNT_PATH } from "../mount-path";
import type { HttpTriggerEntry } from "../server/utils/admin-capabilities";
import { mediaPathProblems } from "../server/utils/media-paths";
import type { DeliveryConfig, PipelineStepsEntry } from "../server/utils/media-paths";
import { layerLocateSteps } from "./locators";
import { deliveryEnabled, docsAnchor, fileForPipeline, presetOptionsCast } from "./ruleHelpers";

const DELIVERY_STATIC_MODULE = "@michaelthielemann/kestrel-delivery-static";
const RENDERER_NUXT_MODULE = "@michaelthielemann/kestrel-renderer-nuxt";
const EVENTS_QUEUE_MODULE = "@michaelthielemann/kestrel-events-queue";
const MEDIA_MODULE = "@michaelthielemann/kestrel-media-default";
const IMAGES_MODULE = "@michaelthielemann/kestrel-images-default";

/** The `checkPreset()` problem codes the rules below report themselves, so the generic preset problem rule leaves them out. */
export const DEPENDENTS_PROBLEM_CODES: ReadonlySet<string> = new Set([
  "preset/render-mode-needs-events",
  "preset/render-mode-needs-queue",
  "preset/page-renders-lane",
  "preset/generate-image-variants-lane",
  "preset/index-exports-lane",
  "preset/delay-pipeline-unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function configOf(entry: { config?: unknown; defaults?: { from: string; values: Record<string, unknown> } } | undefined): Record<string, unknown> | undefined {
  const effective = entry === undefined ? undefined : effectiveModuleConfig(entry);
  return isRecord(effective) ? effective : undefined;
}

function finding(rule: string, id: string, severity: Finding["severity"], where: Finding["where"], message: string, suggestion: string, fix: Finding["fix"]): Finding {
  return { id, rule, severity, tier: "source", where, message, suggestion, fix, docs: docsAnchor(rule.replace("/", "-")) };
}

function problemsOf(ctx: RuleContext, codes: readonly string[]): string[] {
  const data = layerProjectData(ctx.project);
  return (data?.presetProblems ?? []).filter((problem) => codes.includes(problem.code)).map((problem) => problem.message);
}

/**
 * A module list with `kestrel-renderer-nuxt` and `kestrel-delivery-static` whose delivery entry has no
 * `dependencies`: delivery-static then renders in the background and never learns that a lost read left a
 * page with unknown dependencies, and with `kestrel-events-queue` the preset refuses it outright. Adds
 * `dependencies: { render, rendererReadsDocument: true }` to a literal entry in `kestrel.config.ts`, with
 * `render` following the event delivery module; manual when the entry is not a literal there (a list
 * built by `presetModuleConfig()` with other features) or its `render` is set to the wrong mode.
 */
export const deliveryDependenciesRule: Rule = {
  id: "preset/delivery-dependencies",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const modules = cast.modules ?? [];
    const entry = modules.find((m) => m.use === DELIVERY_STATIC_MODULE);
    if (entry === undefined || !modules.some((m) => m.use === RENDERER_NUXT_MODULE)) return [];
    const queue = modules.find((m) => m.use === EVENTS_QUEUE_MODULE);
    const render = queue !== undefined ? "events" : "background";
    const problems = problemsOf(ctx, ["preset/render-mode-needs-events", "preset/render-mode-needs-queue"]);
    const rule = "preset/delivery-dependencies";
    const where = { module: DELIVERY_STATIC_MODULE, file: ctx.project.configFile };
    const wanted = renderDependenciesText(render, configOf(queue));
    const dependencies = configOf(entry)?.dependencies;
    const source = ctx.readFile(ctx.project.configFile);
    if (dependencies !== undefined) {
      if (problems.length === 0) return [];
      const literal = source !== undefined && hasModuleEntry(source, DELIVERY_STATIC_MODULE);
      const edit =
        source === undefined
          ? undefined
          : literal
            ? setDependenciesRender(ctx.project.configFile, source, DELIVERY_STATIC_MODULE, render, wanted)
            : setPresetModuleConfigOverride(ctx.project.configFile, source, DELIVERY_STATIC_MODULE, "dependencies", wanted);
      const how = literal ? `sets dependencies.render to "${render}" on the ${DELIVERY_STATIC_MODULE} entry` : `gives presetModuleConfig() an override for ${DELIVERY_STATIC_MODULE}: ${wanted}`;
      return edit === undefined
        ? [finding(rule, rule, "error", where, problems.join("; "), `set dependencies.render to "${render}" on ${DELIVERY_STATIC_MODULE}, through presetModuleConfig({ overrides }) when that call builds the entry`, { kind: "manual" })]
        : [finding(rule, rule, "error", where, problems.join("; "), how, { kind: "auto", edits: [edit] })];
    }
    const edit = source === undefined ? undefined : addModuleEntryConfigProperty(ctx.project.configFile, source, DELIVERY_STATIC_MODULE, "dependencies", wanted);
    const message = problems.length > 0 ? problems.join("; ") : `${DELIVERY_STATIC_MODULE} has no dependencies config, so pages are re-rendered without checking that each render read its own page`;
    const severity = problems.length > 0 ? "error" : "warning";
    return edit === undefined
      ? [finding(rule, rule, severity, where, message, `add ${wanted} to ${DELIVERY_STATIC_MODULE}'s config; when presetModuleConfig() builds that entry, pass the same features it gets to definePreset(), or set it through presetModuleConfig({ overrides })`, { kind: "manual" })]
      : [finding(rule, rule, severity, where, message, `adds ${wanted} to ${DELIVERY_STATIC_MODULE}'s config`, { kind: "auto", edits: [edit] })];
  },
};

/**
 * The `dependencies` property `presetModuleConfig()` gives `kestrel-delivery-static` for `render`: with
 * `"events"`, also the queue's own `maxAttempts` and `backoffSeconds` (its defaults when `queueConfig` names
 * none), so a failed re-render is retried on the schedule the queue reports.
 */
export function renderDependenciesText(render: "events" | "background", queueConfig?: Record<string, unknown>): string {
  if (render === "background") return `dependencies: { render: "background", rendererReadsDocument: true }`;
  const maxAttempts = typeof queueConfig?.maxAttempts === "number" ? queueConfig.maxAttempts : QUEUE_DEFAULT_MAX_ATTEMPTS;
  const backoff = Array.isArray(queueConfig?.backoffSeconds) ? queueConfig.backoffSeconds : QUEUE_DEFAULT_BACKOFF_SECONDS;
  return `dependencies: { render: "events", rendererReadsDocument: true, maxAttempts: ${maxAttempts}, backoffSeconds: [${backoff.map(String).join(", ")}] }`;
}

const ASSUMED_TRIGGERS: readonly HttpTriggerEntry[] = [
  { method: "GET", path: `${MEDIA_PUBLIC_PATH}/:id/:name`, pipeline: "media.serve" },
  { method: "GET", path: `${MEDIA_PUBLIC_PATH}/:id/variants/:file`, pipeline: "images.serve" },
];
const ASSUMED_PIPELINES: readonly PipelineStepsEntry[] = [
  { name: "media.serve", steps: [{ name: "media.serve" }] },
  { name: "images.serve", steps: [{ name: "images.serve" }] },
];

function mediaModuleConfig(cast: { modules?: readonly { use: string; config?: unknown }[] }, use: string): Record<string, unknown> | undefined {
  return configOf((cast.modules ?? []).find((m) => m.use === use));
}

/**
 * The publicPath/publicCopy/reservedPaths subset of the layer's own boot-time media-path check
 * (`assertMediaPaths`, `layers/core/server/utils/media-paths.ts`), run statically against the configured
 * module list, so `check` reports what the real boot would refuse (a `publicPath: "/api/media"` suggestion,
 * say) instead of passing it. The trigger-binding half of that check needs a live, started instance
 * (`kestrel.describe()`, `kestrel.steps.owner()`) no rule context has access to, so this always feeds
 * `mediaPathProblems()` an assumed-correct route table for that half and never reports on it; a project
 * whose own pipelines actually break that binding still only fails at boot. Says nothing while
 * `delivery-static` still has its old `media` option set: `modules/delivery-media` already reports (and,
 * with `mediaWiring`, usually fixes) that same wiring, and a project in that state would otherwise see the
 * same problem twice, with two different suggestions.
 */
export const mediaPathsRule: Rule = {
  id: "site/media-paths",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const media = mediaModuleConfig(cast, MEDIA_MODULE);
    const images = mediaModuleConfig(cast, IMAGES_MODULE);
    if (media === undefined && images === undefined) return [];
    const deliveryConfig = mediaModuleConfig(cast, DELIVERY_STATIC_MODULE);
    if (deliveryConfig !== undefined && isRecord(deliveryConfig.media)) return [];
    const delivery: DeliveryConfig | undefined = deliveryConfig;
    const problems = mediaPathProblems({ media, images, delivery, triggers: ASSUMED_TRIGGERS, pipelines: ASSUMED_PIPELINES });
    if (problems.length === 0) return [];
    const rule = "site/media-paths";
    return [
      finding(
        rule,
        rule,
        "error",
        { module: MEDIA_MODULE, file: ctx.project.configFile },
        problems.join("; "),
        `see consuming-kestrel-web.md's media wiring (§6): publicPath: "${MEDIA_PUBLIC_PATH}" and publicCopy: { prefix: ... } on both media modules, reservedPaths: ["${MOUNT_PATH}", "/admin", "${MEDIA_PUBLIC_PATH}"] on delivery-static`,
        { kind: "manual" },
      ),
    ];
  },
};

function lanesLiteral(lanes: Record<string, string[]>): string {
  return `{ ${Object.entries(lanes).map(([lane, members]) => `${lane}: [${members.map((m) => `"${m}"`).join(", ")}]`).join(", ")} }`;
}

function delaysLiteral(delays: Record<string, number>): string {
  return `{ ${Object.entries(delays).map(([pipeline, ms]) => `${pipeline}: ${ms}`).join(", ")} }`;
}

const LANE_PROBLEM_CODES = ["preset/page-renders-lane", "preset/generate-image-variants-lane", "preset/index-exports-lane"];
const INDEX_LANE_PROBLEM = "preset/index-exports-lane";
const DELAY_PROBLEM = "preset/delay-pipeline-unknown";
const INDEX_LANE = "indexes";

function problemCodesOf(ctx: RuleContext, codes: readonly string[]): Set<string> {
  const data = layerProjectData(ctx.project);
  return new Set((data?.presetProblems ?? []).filter((problem) => codes.includes(problem.code)).map((problem) => problem.code));
}

interface LanePart {
  message: string;
  severity: "error" | "warning";
  edits?: Edit[];
  manual?: string;
}

function lanesParts(ctx: RuleContext, config: Record<string, unknown> | undefined, features: readonly Feature[], source: string | undefined): LanePart[] {
  const lanes = lanesFor(features);
  const literal = lanesLiteral(lanes);
  const problems = problemsOf(ctx, LANE_PROBLEM_CODES);
  const codes = problemCodesOf(ctx, LANE_PROBLEM_CODES);
  const file = ctx.project.configFile;
  if (config === undefined || !("lanes" in config)) {
    const properties: PropertyText[] = [{ key: "lanes", text: `lanes: ${literal}` }];
    if (config === undefined || !("relayPipelines" in config)) {
      properties.unshift({ key: "relayPipelines", text: `relayPipelines: [${relayPipelinesFor(features).map((p) => `"${p}"`).join(", ")}]` });
    }
    const delays = delaysFor(features);
    if (Object.keys(delays).length > 0 && (config === undefined || !("delayMs" in config))) properties.push({ key: "delayMs", text: `delayMs: ${delaysLiteral(delays)}` });
    const edit = source === undefined ? undefined : setModuleEntryConfigProperties(file, source, EVENTS_QUEUE_MODULE, properties);
    const message = `${EVENTS_QUEUE_MODULE} has no lanes, so page re-renders, the index exports and image variants would run in the main lane and delay uploads, publishing and the login audit`;
    return [edit === undefined ? { message, severity: "error", manual: `add lanes: ${literal} (lanesFor(features))` } : { message, severity: "error", edits: [edit] }];
  }
  if (problems.length === 0) return [];
  const configured: unknown = config.lanes;
  const members = typeof configured === "object" && configured !== null ? Object.values(configured).flat() : [];
  const onlyIndexLane = codes.size === 1 && codes.has(INDEX_LANE_PROBLEM);
  const addable = onlyIndexLane && typeof configured === "object" && configured !== null && !(INDEX_LANE in configured) && !members.includes(REFRESH_INDEXES_PIPELINE);
  const edit = addable && source !== undefined ? addModuleEntryNestedConfigProperties(file, source, EVENTS_QUEUE_MODULE, ["lanes"], [INDEX_LANE], [`${INDEX_LANE}: ["${REFRESH_INDEXES_PIPELINE}"]`]) : undefined;
  return [edit === undefined ? { message: problems.join("; "), severity: "error", manual: `set lanes to ${literal} (lanesFor(features))` } : { message: problems.join("; "), severity: "error", edits: [edit] }];
}

function delayParts(ctx: RuleContext, config: Record<string, unknown> | undefined, features: readonly Feature[], source: string | undefined, lanesRewritten: boolean): LanePart[] {
  const delays = delaysFor(features);
  if (Object.keys(delays).length === 0) return [];
  const literal = delaysLiteral(delays);
  if (config !== undefined && "delayMs" in config) {
    const problems = problemsOf(ctx, [DELAY_PROBLEM]);
    return problems.length === 0 ? [] : [{ message: problems.join("; "), severity: "error", manual: `set delayMs to ${literal} (delaysFor(features))` }];
  }
  if (lanesRewritten) return [];
  const edit = source === undefined ? undefined : addModuleEntryConfigProperty(ctx.project.configFile, source, EVENTS_QUEUE_MODULE, "delayMs", `delayMs: ${literal}`);
  const message = `${EVENTS_QUEUE_MODULE} has no delayMs, so every save exports sitemap.xml, robots.txt and llms.txt at once instead of once per burst, and llms-full.txt does not trail the re-renders it reads`;
  return [edit === undefined ? { message, severity: "warning", manual: `add delayMs: ${literal} (delaysFor(features))` } : { message, severity: "warning", edits: [edit] }];
}

/**
 * A hand-written `kestrel-events-queue` entry whose `lanes` or `delayMs` differ from what `presetModuleConfig()`
 * gives: without lanes, page re-renders, the index exports and image variants all run in the queue's main lane and
 * delay uploads, publishing and the login audit, and the preset refuses it; without `delayMs`, every save exports
 * the index files at once. Sets `lanes` to `lanesFor(features)` (and `relayPipelines` to `relayPipelinesFor(features)`
 * when that is missing too) and `delayMs` to `delaysFor(features)` in one edit of the entry's config, adds the
 * `indexes` lane to existing lanes that only lack it, and adds a missing `delayMs`; manual when the entry is not a
 * literal in `kestrel.config.ts`, or its `lanes` or `delayMs` exist but name the wrong pipelines.
 */
export const queueLanesRule: Rule = {
  id: "preset/queue-lanes",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const entry = (cast.modules ?? []).find((m) => m.use === EVENTS_QUEUE_MODULE);
    const features: readonly Feature[] = cast.features ?? [];
    if (entry === undefined || Object.keys(lanesFor(features)).length === 0) return [];
    const rule = "preset/queue-lanes";
    const where = { module: EVENTS_QUEUE_MODULE, file: ctx.project.configFile };
    const config = configOf(entry);
    const source = ctx.readFile(ctx.project.configFile);
    const lanes = lanesParts(ctx, config, features, source);
    const lanesRewritten = config === undefined || !("lanes" in config);
    const parts = [...lanes, ...delayParts(ctx, config, features, source, lanesRewritten)];
    if (parts.length === 0) return [];
    const message = parts.map((part) => part.message).join("; ");
    const severity = parts.some((part) => part.severity === "error") ? "error" : "warning";
    const manual = parts.flatMap((part) => (part.manual === undefined ? [] : [part.manual]));
    if (manual.length > 0) return [finding(rule, rule, severity, where, message, `${manual.join(" and ")} on ${EVENTS_QUEUE_MODULE}`, { kind: "manual" })];
    const edits = parts.flatMap((part) => part.edits ?? []);
    const suggestion = `sets lanes to ${lanesLiteral(lanesFor(features))} and delayMs to ${delaysLiteral(delaysFor(features))}, what lanesFor(features) and delaysFor(features) give`;
    return [finding(rule, rule, severity, where, message, suggestion, { kind: "auto", edits })];
  },
};

/**
 * An override of `setSettings` that runs `delivery.exportLlms`, which is not a step of delivery-static: boot
 * fails on it. `settingsDependents` re-renders the pages after the emit and requests the index exports, so the fix
 * removes the step when that pipeline runs `delivery.requestIndexes` on an event the override emits. An override that also
 * lacks the emit is left to `preset/override-emit`, which drops the export.
 */
export const settingsLlmsRule: Rule = {
  id: "preset/settings-llms",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    const override = cast?.overrides?.setSettings;
    if (override === undefined || !pipelineSteps(override).some(isInlineLlmsExport)) return [];
    if (problemsOf(ctx, ["preset/override-drops-watched-emit"]).length > 0) return [];
    const emitted = pipelineSteps(override).filter((step) => step.startsWith("events.emit:")).map((step) => step.slice("events.emit:".length).split("?")[0] ?? "");
    const requested = ctx.project.input.config.triggers.some((trigger) => "event" in trigger && emitted.includes(trigger.event) && runsIndexRequest(ctx, trigger.pipeline));
    if (!requested) return [];
    const rule = "preset/settings-llms";
    const file = fileForPipeline(ctx, SETTINGS_PIPELINE);
    const source = file === undefined ? undefined : ctx.readFile(file);
    const arrays = source === undefined ? [] : (ctx.locateSteps ?? layerLocateSteps)(parseTs(source), SETTINGS_PIPELINE);
    const edits = file === undefined || source === undefined ? [] : arrays.flatMap((array) => removeStepsFromArray(file, source, array, isInlineLlmsExport));
    const message = `override for "${SETTINGS_PIPELINE}" still runs "${INLINE_LLMS_EXPORT}", which delivery-static no longer has; boot fails on it`;
    const suggestion = `remove "${INLINE_LLMS_EXPORT}" and keep the emit: settingsDependents re-renders the pages and runs "${REQUEST_INDEXES_STEP}" after them`;
    return [
      edits.length > 0
        ? finding(rule, rule, "error", { pipeline: SETTINGS_PIPELINE }, message, `removes "${INLINE_LLMS_EXPORT}"; settingsDependents runs "${REQUEST_INDEXES_STEP}" after the re-renders`, { kind: "auto", edits })
        : finding(rule, rule, "error", { pipeline: SETTINGS_PIPELINE }, message, `${suggestion}, by hand`, { kind: "manual" }),
    ];
  },
};

const SETTINGS_PIPELINE = "setSettings";
const INLINE_LLMS_EXPORT = "delivery.exportLlms";

function isInlineLlmsExport(step: string): boolean {
  return step === INLINE_LLMS_EXPORT || step.startsWith(`${INLINE_LLMS_EXPORT}?`);
}

function runsIndexRequest(ctx: RuleContext, pipeline: string): boolean {
  const def = ctx.project.input.pipelines.find((candidate) => candidate.name === pipeline);
  return def !== undefined && pipelineSteps(def.steps).includes(REQUEST_INDEXES_STEP);
}

const TRIGGER_FILES = ["kestrel.config.ts", join("pipelines", "index.ts")];

function ownTriggers(source: string): Array<{ event: string; pipeline: string | undefined }> {
  const found: Array<{ event: string; pipeline: string | undefined }> = [];
  walk(parseTs(source), (node) => {
    if (node.type !== "ObjectExpression") return;
    const event = stringValue(objectProperty(node, "event"));
    if (event === undefined || !MEDIA_DEPENDENT_EVENTS.includes(event)) return;
    found.push({ event, pipeline: stringValue(objectProperty(node, "pipeline")) });
  });
  return found;
}

const MEDIA_EVENT_SOURCES: Record<string, string> = {
  "media.deleted": "a folder deletion and every delete for good from the trash (Delete permanently, Empty trash, the nightly purge) arrive with id: null and the affected ids in ids",
  "media.trashed": "every move into the trash arrives with id: null and the affected ids in ids",
  "media.restored": "every restore from the trash arrives with id: null and the affected ids in ids",
  "images.variantsChanged": "images-default raises it with id: null and the affected ids in ids",
};

/** A trigger of the project's own on a media event: a folder deletion, a delete for good from the trash, a move into or out of the trash and the events `images-default` raises arrive with `id: null` and every id in `ids`. Information only. */
export const mediaEventIdsRule: SourceRule = {
  id: "runtime/media-event-ids",
  needs: "source",
  check(ctx) {
    const findings: Finding[] = [];
    for (const rel of TRIGGER_FILES) {
      const file = join(ctx.root, rel);
      const source = ctx.readFile(file);
      if (source === undefined) continue;
      for (const { event, pipeline } of ownTriggers(source)) {
        const rule = "runtime/media-event-ids";
        findings.push(
          finding(
            rule,
            `${rule}:${event}:${pipeline ?? ""}`,
            "info",
            { file, ...(pipeline === undefined ? {} : { pipeline }) },
            `${pipeline === undefined ? "a pipeline" : `"${pipeline}"`} runs on "${event}": ${MEDIA_EVENT_SOURCES[event] ?? "it can arrive with id: null and the affected ids in ids"}`,
            "read payload.ids as well as payload.id",
            { kind: "none" },
          ),
        );
      }
    }
    return findings;
  },
};

const MEDIA_DELETE_PIPELINES = ["deleteMedia", "deleteMediaFolder"] as const;

/**
 * With the media trash composed (`presetModuleConfig()` does so unless `media.trashRetentionDays` is `0`), a
 * delete in the admin runs `trashMedia` or `trashMediaFolder` and raises `media.trashed`; `media.deleted`
 * follows only when an item is deleted for good from the trash. Notes an override of `deleteMedia` or
 * `deleteMediaFolder`, which a delete in the admin does not run while the trash is on; an exclude of either,
 * which leaves the trash pipelines and their final deletes in place; and an own trigger on `media.deleted`
 * without one on `media.trashed` for the same pipeline. Information only.
 */
export const mediaTrashDeletesRule: Rule = {
  id: "runtime/media-trash-deletes",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (!mediaTrashEnabled(cast?.modules)) return [];
    const rule = "runtime/media-trash-deletes";
    const findings: Finding[] = [];
    const excluded = new Set<string>(cast?.exclude ?? []);
    for (const pipeline of MEDIA_DELETE_PIPELINES) {
      if (!excluded.has(pipeline)) continue;
      findings.push(
        finding(
          rule,
          `${rule}:${pipeline}`,
          "info",
          { pipeline },
          `"${pipeline}" is excluded, but the media trash is on: anyone who may delete media can still move items to the trash through trashMedia and trashMediaFolder and delete them for good through purgeMedia and emptyMediaTrash, and the nightly purgeExpiredMedia deletes them once their time in the trash runs out`,
          "exclude trashMedia, trashMediaFolder, purgeMedia, emptyMediaTrash and purgeExpiredMedia as well, or set media.trashRetentionDays: 0 so that no trash pipeline is composed",
          { kind: "none" },
        ),
      );
    }
    for (const pipeline of MEDIA_DELETE_PIPELINES) {
      if (cast?.overrides?.[pipeline] === undefined) continue;
      findings.push(
        finding(
          rule,
          `${rule}:${pipeline}`,
          "info",
          { pipeline },
          `override for "${pipeline}" does not run when someone deletes in the admin: with the media trash on, the admin moves items to the trash through trashMedia and trashMediaFolder, and deletes them for good through purgeMedia, emptyMediaTrash and the nightly purgeExpiredMedia`,
          "move the extra steps into the trash and purge pipelines that need them, or set media.trashRetentionDays: 0 to keep deleting at once",
          { kind: "none" },
        ),
      );
    }
    for (const rel of TRIGGER_FILES) {
      const file = join(ctx.root, rel);
      const source = ctx.readFile(file);
      if (source === undefined) continue;
      const triggers = ownTriggers(source);
      for (const { event, pipeline } of triggers) {
        if (event !== "media.deleted" || triggers.some((t) => t.event === "media.trashed" && t.pipeline === pipeline)) continue;
        findings.push(
          finding(
            rule,
            `${rule}:${pipeline ?? ""}`,
            "info",
            { file, ...(pipeline === undefined ? {} : { pipeline }) },
            `${pipeline === undefined ? "a pipeline" : `"${pipeline}"`} runs on "media.deleted", which with the media trash on fires only when an item is deleted for good: trashRetentionDays after it went to the trash at the earliest, and never while a page still uses it; a delete in the admin raises "media.trashed"`,
            'add a trigger on "media.trashed" for the same pipeline, and one on "media.restored" if the pipeline must undo its work when an item comes back',
            { kind: "none" },
          ),
        );
      }
    }
    return findings;
  },
};

const PUBLISH_ALL_MARKERS = ["/admin/publish-all/pages", "publishAllPages"];
const OLD_PUBLISH_ALL_FIELDS = ["documents", "live", "errors"];

function memberNames(root: AstNode): Set<string> {
  const names = new Set<string>();
  walk(root, (node) => {
    if (node.type !== "MemberExpression" && node.type !== "OptionalMemberExpression") return;
    const property = node.property;
    if (!isAstNode(property)) return;
    if (node.computed !== true && property.type === "Identifier" && typeof property.name === "string") names.add(property.name);
    const literal = stringValue(property);
    if (node.computed === true && literal !== undefined) names.add(literal);
  });
  return names;
}

function mentionsString(root: AstNode, values: readonly string[]): boolean {
  let found = false;
  walk(root, (node) => {
    const value = stringValue(node);
    if (value !== undefined && values.some((v) => value.includes(v))) found = true;
  });
  return found;
}

/**
 * A client of the project's own that reads `_llms` from a settings or page save, or `documents`, `live` or
 * `errors` from Publish all: saves answer without `_llms`, and Publish all answers `{ marked }` at once and
 * renders in the background. A heuristic over `app/` and `server/`; information only.
 */
export const deliveryAsyncRule: SourceRule = {
  id: "responses/delivery-async",
  needs: "source",
  check(ctx) {
    const findings: Finding[] = [];
    const rule = "responses/delivery-async";
    for (const { file, root } of consumerScripts(ctx, ["app", "server"])) {
      const relativeFile = relative(ctx.root, file);
      const members = memberNames(root);
      if (members.has("_llms")) {
        findings.push(finding(rule, `${rule}:${file}:_llms`, "info", { file }, `${relativeFile} reads _llms, which settings and page saves no longer answer with`, "llms.txt is written in the background after the re-renders; stop reading _llms", { kind: "none" }));
      }
      const old = OLD_PUBLISH_ALL_FIELDS.filter((field) => members.has(field));
      if (old.length > 0 && mentionsString(root, PUBLISH_ALL_MARKERS)) {
        findings.push(
          finding(rule, `${rule}:${file}:publish-all`, "info", { file }, `${relativeFile} calls Publish all and reads ${old.join(", ")}, which it no longer answers with`, "Publish all answers { marked } at once; read the progress from GET /admin/publish-status/pages", { kind: "none" }),
        );
      }
    }
    return findings;
  },
};

const CACHE_FUNCTIONS = ["cachedEventHandler", "defineCachedEventHandler", "cachedFunction", "defineCachedFunction", "useStorage"];
const CACHE_ROUTE_KEYS = ["cache", "swr", "isr"];

function apiRouteCaches(ctx: SourceRuleContext): string[] {
  const source = ctx.readFile(join(ctx.root, "nuxt.config.ts"));
  if (source === undefined) return [];
  const patterns: string[] = [];
  for (const call of findCalls(parseTs(source), "defineNuxtConfig")) {
    const options = firstArgument(call);
    const routeRules = options === undefined ? undefined : objectProperty(options, "routeRules");
    if (routeRules === undefined || routeRules.type !== "ObjectExpression") continue;
    for (const prop of Array.isArray(routeRules.properties) ? routeRules.properties.filter(isAstNode) : []) {
      const pattern = propertyKeyName(prop);
      const value = prop.value;
      if (pattern === undefined || !pattern.startsWith("/api") || !isAstNode(value) || value.type !== "ObjectExpression") continue;
      if (CACHE_ROUTE_KEYS.some((key) => objectProperty(value, key) !== undefined)) patterns.push(pattern);
    }
  }
  return patterns;
}

/**
 * With `delivery`, a page depends on what its server render reads through `/api` in the same process; an
 * answer served from a cache kept across requests is not seen as a read, so a page showing it is not
 * re-rendered when the data changes. A heuristic over `app/` and `server/` and the `/api` route rules;
 * information only.
 */
export const serverCacheRule: SourceRule = {
  id: "static/server-cache",
  needs: "source",
  check(ctx) {
    if (!deliveryEnabled(ctx)) return [];
    const rule = "static/server-cache";
    const findings: Finding[] = [];
    const suggestion = "read the data through useApi() during server rendering without a cache, or set dependencies.maxAgeSeconds on kestrel-delivery-static so such pages are re-rendered on a schedule";
    for (const { file, root } of consumerScripts(ctx, ["app", "server"])) {
      const used = CACHE_FUNCTIONS.filter((fn) => findCalls(root, fn).length > 0);
      if (used.length === 0) continue;
      findings.push(finding(rule, `${rule}:${file}`, "info", { file }, `${relative(ctx.root, file)} uses ${used.join(", ")}; a page that shows data answered from such a cache is not re-rendered when that data changes`, suggestion, { kind: "none" }));
    }
    for (const pattern of apiRouteCaches(ctx)) {
      findings.push(finding(rule, `${rule}:${pattern}`, "info", { file: join(ctx.root, "nuxt.config.ts"), path: pattern }, `routeRules["${pattern}"] caches API answers; a page that reads them is not re-rendered when the data changes`, suggestion, { kind: "none" }));
    }
    return findings;
  },
};

export const dependentsRules: readonly Rule[] = [deliveryDependenciesRule, queueLanesRule, settingsLlmsRule, mediaEventIdsRule, mediaTrashDeletesRule, deliveryAsyncRule, serverCacheRule, mediaPathsRule];
