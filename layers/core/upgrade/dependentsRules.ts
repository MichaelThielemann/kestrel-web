import { join, relative } from "node:path";
import { findCalls, firstArgument, isAstNode, objectProperty, parseTs, propertyKeyName, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, Rule, RuleContext, SourceRule, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import { lanesFor, relayPipelinesFor } from "../pipelines/checkPreset";
import type { Feature } from "../pipelines/checkPreset";
import { consumerScripts } from "./consumerRules";
import { QUEUE_DEFAULT_BACKOFF_SECONDS, QUEUE_DEFAULT_MAX_ATTEMPTS } from "../pipelines/config";
import { addModuleEntryConfigProperty, hasModuleEntry, setDependenciesRender, setModuleEntryConfigProperties, setPresetModuleConfigOverride } from "./edits";
import type { PropertyText } from "./edits";
import { layerProjectData } from "./load";
import { MEDIA_PUBLIC_PATH, MOUNT_PATH } from "../mount-path";
import type { HttpTriggerEntry } from "../server/utils/admin-capabilities";
import { mediaPathProblems } from "../server/utils/media-paths";
import type { DeliveryConfig, PipelineStepsEntry } from "../server/utils/media-paths";
import { deliveryEnabled, docsAnchor, presetOptionsCast } from "./ruleHelpers";

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
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function configOf(entry: { config?: unknown } | undefined): Record<string, unknown> | undefined {
  return isRecord(entry?.config) ? entry.config : undefined;
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

/**
 * A hand-written `kestrel-events-queue` entry without `lanes`: page re-renders, the `llms.txt` export and
 * image variants would all run in the queue's main lane and delay uploads, publishing and the login audit,
 * and the preset refuses it. Sets `lanes` to `lanesFor(features)` (and `relayPipelines` to
 * `relayPipelinesFor(features)` when that is missing too) in one edit of the entry's config; manual when
 * the entry is not a literal in `kestrel.config.ts`, or its `lanes` exist but leave a pipeline out.
 */
export const queueLanesRule: Rule = {
  id: "preset/queue-lanes",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const entry = (cast.modules ?? []).find((m) => m.use === EVENTS_QUEUE_MODULE);
    const features: readonly Feature[] = cast.features ?? [];
    const lanes = lanesFor(features);
    if (entry === undefined || Object.keys(lanes).length === 0) return [];
    const rule = "preset/queue-lanes";
    const where = { module: EVENTS_QUEUE_MODULE, file: ctx.project.configFile };
    const literal = lanesLiteral(lanes);
    const problems = problemsOf(ctx, ["preset/page-renders-lane", "preset/generate-image-variants-lane"]);
    const config = configOf(entry);
    if (config !== undefined && "lanes" in config) {
      if (problems.length === 0) return [];
      return [finding(rule, rule, "error", where, problems.join("; "), `set lanes to ${literal} (lanesFor(features)) on ${EVENTS_QUEUE_MODULE}`, { kind: "manual" })];
    }
    const properties: PropertyText[] = [{ key: "lanes", text: `lanes: ${literal}` }];
    if (config === undefined || !("relayPipelines" in config)) {
      properties.unshift({ key: "relayPipelines", text: `relayPipelines: [${relayPipelinesFor(features).map((p) => `"${p}"`).join(", ")}]` });
    }
    const source = ctx.readFile(ctx.project.configFile);
    const edit = source === undefined ? undefined : setModuleEntryConfigProperties(ctx.project.configFile, source, EVENTS_QUEUE_MODULE, properties);
    const message = `${EVENTS_QUEUE_MODULE} has no lanes, so page re-renders and image variants would run in the main lane and delay uploads, publishing and the login audit`;
    return edit === undefined
      ? [finding(rule, rule, "error", where, message, `add lanes: ${literal} (lanesFor(features)) to ${EVENTS_QUEUE_MODULE}'s config`, { kind: "manual" })]
      : [finding(rule, rule, "error", where, message, `sets lanes to ${literal}, what lanesFor(features) gives`, { kind: "auto", edits: [edit] })];
  },
};

/** An override of `setSettings` that still runs `delivery.exportLlms` writes `llms.txt` inside the settings request; the preset requests the export after the re-renders instead. Information only; an override that also lacks the emit is left to `preset/override-emit`, which drops the export. */
export const settingsLlmsRule: Rule = {
  id: "preset/settings-llms",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    const override = cast?.overrides?.setSettings;
    if (override === undefined || !pipelineSteps(override).includes("delivery.exportLlms")) return [];
    if (problemsOf(ctx, ["preset/override-drops-watched-emit"]).length > 0) return [];
    const rule = "preset/settings-llms";
    return [
      finding(
        rule,
        rule,
        "info",
        { pipeline: "setSettings" },
        'override for "setSettings" still runs "delivery.exportLlms", which writes llms.txt inside the settings request',
        'remove "delivery.exportLlms" and keep "events.emit:settings.updated": settingsDependents re-renders the pages and requests the export after them',
        { kind: "none" },
      ),
    ];
  },
};

const MEDIA_EVENTS = ["media.updated", "media.deleted", "images.variantsChanged"];
const TRIGGER_FILES = ["kestrel.config.ts", join("pipelines", "index.ts")];

function ownTriggers(source: string): Array<{ event: string; pipeline: string | undefined }> {
  const found: Array<{ event: string; pipeline: string | undefined }> = [];
  walk(parseTs(source), (node) => {
    if (node.type !== "ObjectExpression") return;
    const event = stringValue(objectProperty(node, "event"));
    if (event === undefined || !MEDIA_EVENTS.includes(event)) return;
    found.push({ event, pipeline: stringValue(objectProperty(node, "pipeline")) });
  });
  return found;
}

/** A trigger of the project's own on a media event: a folder deletion and the events `images-default` raises arrive with `id: null` and every id in `ids`. Information only. */
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
            `${pipeline === undefined ? "a pipeline" : `"${pipeline}"`} runs on "${event}", which can arrive with id: null and the affected ids in ids (a folder deletion, and the events images-default raises itself)`,
            "read payload.ids as well as payload.id",
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

export const dependentsRules: readonly Rule[] = [deliveryDependenciesRule, queueLanesRule, settingsLlmsRule, mediaEventIdsRule, deliveryAsyncRule, serverCacheRule, mediaPathsRule];
