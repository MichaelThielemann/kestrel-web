import { existsSync } from "node:fs";
import { join } from "node:path";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { PipelineDefinition, PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import type { AskFix, Edit, Finding, Rule, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { checkPreset } from "../pipelines/checkPreset";
import type { Feature, PresetOptions } from "../pipelines/checkPreset";
import { addModuleEntryConfigProperty, addStringToNamedExportArray, bumpPackageJsonDependency } from "./edits";
import { layerProjectData } from "./load";

const LAYER_RANGE = "^3.0.0";
const LAYER_PACKAGE = "@michaelthielemann/kestrel-web";
const SERVERLESS_MARKERS = ["vercel.json", "netlify.toml", "wrangler.toml", "serverless.yml", "template.yaml"];

function packageJsonPath(ctx: RuleContext): string {
  return join(ctx.root, "package.json");
}

function docsAnchor(anchor: string): string {
  return `docs/consuming-kestrel-web.md#${anchor}`;
}

/** Bumps `@michaelthielemann/kestrel-web` to `^3.0.0` in the project's `package.json`. */
export const layerRangeRule: Rule = {
  id: "deps/layer-range",
  check(ctx) {
    const file = packageJsonPath(ctx);
    const source = ctx.readFile(file);
    if (source === undefined) return [];
    const match = new RegExp(`"${LAYER_PACKAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"([^"]*)"`).exec(source);
    const current = match?.[1];
    if (current === undefined || current === LAYER_RANGE) return [];
    const edit = bumpPackageJsonDependency(file, source, LAYER_PACKAGE, LAYER_RANGE);
    return [
      {
        id: "deps/layer-range",
        rule: "deps/layer-range",
        severity: "error",
        tier: "source",
        where: { file, module: LAYER_PACKAGE },
        message: `${LAYER_PACKAGE} is at ${current}, not a 3.x range`,
        suggestion: `set ${LAYER_PACKAGE} to "${LAYER_RANGE}"`,
        fix: edit === undefined ? { kind: "manual" } : { kind: "auto", edits: [edit] },
        docs: docsAnchor("deps-layer-range"),
      },
    ];
  },
};

interface CapturedOptions {
  features?: readonly Feature[];
  modules?: readonly { use: string; config?: unknown }[];
}

function presetOptionsOf(ctx: RuleContext): CapturedOptions | undefined {
  const data = layerProjectData(ctx.project);
  if (data?.presetOptions === undefined) return undefined;
  return boundaryCast<CapturedOptions>(data.presetOptions, "host");
}

const EVENTS_QUEUE_MODULE = "@michaelthielemann/kestrel-events-queue";

function hasRelayPipelinesKey(entry: { use: string; config?: unknown }): boolean {
  return typeof entry.config === "object" && entry.config !== null && "relayPipelines" in entry.config;
}

/**
 * With `presetModuleConfig()`, `relayPipelinesFor(features)` already fills `relayPipelines` correctly and
 * there is nothing to fix — reported as information only. A hand-written `events-queue` entry without the
 * key gets one added, valued with the layer's own `RELAY_CANDIDATE_PIPELINES` when a literal `{ use, config
 * }` object for it can be found in the config file, else the same information-only finding (manual).
 */
export const relayScopeRule: Rule = {
  id: "preset/relay-scope",
  check(ctx) {
    const options = presetOptionsOf(ctx);
    if (options === undefined) return [];
    const entry = (options.modules ?? []).find((m) => m.use === EVENTS_QUEUE_MODULE);
    if (entry === undefined || hasRelayPipelinesKey(entry)) return [];
    const source = ctx.readFile(ctx.project.configFile);
    const relay = options.features?.includes("delivery") ? '["publishPage", "unpublishPage"]' : "[]";
    const edit = source === undefined ? undefined : addModuleEntryConfigProperty(ctx.project.configFile, source, EVENTS_QUEUE_MODULE, "relayPipelines", `relayPipelines: ${relay}`);
    return [
      {
        id: "preset/relay-scope",
        rule: "preset/relay-scope",
        severity: "info",
        tier: "source",
        where: { module: EVENTS_QUEUE_MODULE, file: ctx.project.configFile },
        message: "events-queue has no explicit relayPipelines",
        suggestion:
          edit === undefined
            ? "presetModuleConfig() fills relayPipelines from relayPipelinesFor(features); a hand-written module list needs it added by hand — see the docs"
            : `add relayPipelines: ${relay} to the events-queue entry's config`,
        fix: edit === undefined ? { kind: "manual" } : { kind: "auto", edits: [edit] },
        docs: docsAnchor("preset-relay-scope"),
      },
    ];
  },
};

function loadIssuesRule(): Rule {
  return {
    id: "load/failed",
    check(ctx) {
      const data = layerProjectData(ctx.project);
      if (data === undefined) return [];
      return data.loadIssues.map(
        (issue, i): Finding => ({
          id: `load/failed:${issue.file ?? issue.use ?? i}`,
          rule: "load/failed",
          severity: "error",
          tier: "source",
          where: issue.file !== undefined ? { file: issue.file } : issue.use !== undefined ? { module: issue.use } : {},
          message: issue.message,
          suggestion: "fix the file so it loads, then run check again",
          fix: { kind: "manual" },
          docs: docsAnchor("load"),
        }),
      );
    },
  };
}

const PRESET_PROBLEM_RULES: Record<string, { rule: string; docs: string }> = {
  "preset/override-drops-atomic-group": { rule: "preset/override-group", docs: docsAnchor("preset-override-group") },
  "preset/override-drops-relay": { rule: "preset/override-relay", docs: docsAnchor("preset-override-relay") },
  "preset/override-unknown-pipeline": { rule: "preset/override-unknown-pipeline", docs: docsAnchor("preset-override-unknown-pipeline") },
};

function presetProblemsRule(): Rule {
  return {
    id: "preset/problem",
    check(ctx) {
      const data = layerProjectData(ctx.project);
      if (data === undefined) return [];
      return data.presetProblems.map((problem, i): Finding => {
        const known = PRESET_PROBLEM_RULES[problem.code];
        return {
          id: `${known?.rule ?? `preset/${problem.code}`}:${problem.pipeline ?? i}`,
          rule: known?.rule ?? `preset/${problem.code}`,
          severity: "error",
          tier: "source",
          where: problem.pipeline === undefined ? {} : { pipeline: problem.pipeline },
          message: problem.message,
          suggestion: "resolve the override or configuration that causes this, then run check again",
          fix: { kind: "manual" },
          docs: known?.docs ?? docsAnchor("preset-problem"),
        };
      });
    },
  };
}

function overrideDriftRule(): Rule {
  return {
    id: "preset/override-drift",
    check(ctx) {
      const data = layerProjectData(ctx.project);
      const options = data?.presetOptions;
      if (options === undefined) return [];
      const cast = boundaryCast<PresetOptions>(options, "host");
      const overrideNames = Object.keys(cast.overrides ?? {});
      if (overrideNames.length === 0) return [];
      const { preset: defaultPreset } = checkPreset({ ...cast, overrides: {} });
      const findings: Finding[] = [];
      const flatSteps = (def: PipelineDefinition | undefined): string[] => (def?.steps ?? []).filter((s: PipelineEntry): s is string => typeof s === "string");
      for (const name of overrideNames) {
        const defaultSteps = flatSteps(defaultPreset.pipelines.find((p: PipelineDefinition) => p.name === name));
        const overriddenSteps = new Set(flatSteps(ctx.project.input.pipelines.find((p: PipelineDefinition) => p.name === name)));
        const missing = defaultSteps.filter((s) => !overriddenSteps.has(s));
        if (missing.length === 0) continue;
        findings.push({
          id: `preset/override-drift:${name}`,
          rule: "preset/override-drift",
          severity: "info",
          tier: "source",
          where: { pipeline: name },
          message: `override for "${name}" lacks ${missing.map((s) => `"${s}"`).join(", ")}, which the 3.0 default runs`,
          suggestion: "review whether the override should include it too; never changed automatically",
          fix: { kind: "none" },
          docs: docsAnchor("preset-override-drift"),
        });
      }
      return findings;
    },
  };
}

function featuresOf(ctx: RuleContext): { features: readonly Feature[]; file?: string } | undefined {
  const options = presetOptionsOf(ctx);
  if (options?.features === undefined) return undefined;
  return { features: options.features };
}

function findFeaturesArrayFile(ctx: RuleContext): string | undefined {
  const candidate = join(ctx.root, "shared", "model.ts");
  return ctx.readFile(candidate) === undefined ? undefined : candidate;
}

const OFFER_ID = "preset/event-queue-offer";
const CONSEQUENCES = "uploads and other requests answer at once; image variants, the login audit and any other subscriber not published inline run in the worker moments later, retried with backoff; a failing subscriber no longer fails the request that emitted the event; every event may reach a pipeline more than once; the queue lives in the database and switching back later needs it drained first";

function offerUnmetConditions(ctx: RuleContext): string[] {
  const unmet: string[] = [];
  const features = featuresOf(ctx)?.features;
  if (features === undefined) return ["could not read the project's own features list"];
  if (features.includes("eventsQueue")) return ["already on the queue"];
  if (!ctx.project.input.config.triggers.some((t) => "event" in t)) unmet.push("no event trigger to move to the queue");
  const marker = SERVERLESS_MARKERS.find((m) => existsSync(join(ctx.root, m)));
  if (marker !== undefined) unmet.push(`"${marker}" suggests the process does not stay alive between requests`);
  return unmet;
}

function switchEdits(ctx: RuleContext): { edits: Edit[]; missing: string | undefined } {
  const file = findFeaturesArrayFile(ctx);
  if (file === undefined) return { edits: [], missing: "shared/model.ts (the project's features array)" };
  const source = ctx.readFile(file);
  if (source === undefined) return { edits: [], missing: "shared/model.ts (the project's features array)" };
  const edit = addStringToNamedExportArray(file, source, "features", "eventsQueue");
  if (edit === undefined) return { edits: [], missing: "shared/model.ts's features array" };
  return { edits: [edit], missing: undefined };
}

function queueOfferRule(): Rule {
  return {
    id: OFFER_ID,
    async check(ctx) {
      const unmet = offerUnmetConditions(ctx);
      if (unmet.length > 0) {
        return [
          {
            id: OFFER_ID,
            rule: OFFER_ID,
            severity: "info",
            tier: "source",
            where: {},
            message: `cannot switch to the queue: ${unmet.join("; ")}`,
            suggestion: "resolve the conditions above and run check again",
            fix: { kind: "none" },
            docs: docsAnchor("preset-event-queue-offer"),
          },
        ];
      }
      const answer = ctx.answers.get("switch-to-queue");
      if (answer === undefined) {
        const fix: AskFix = { kind: "ask", question: "switch-to-queue", prompt: `switch event delivery to the queue? ${CONSEQUENCES}`, choices: ["no", "yes"], defaultValue: "no" };
        return [{ id: OFFER_ID, rule: OFFER_ID, severity: "info", tier: "source", where: {}, message: "can switch to the queue", suggestion: "run fix to be asked; check never decides this on its own", fix, docs: docsAnchor("preset-event-queue-offer") }];
      }
      if (answer !== "yes") return [];
      const { edits, missing } = switchEdits(ctx);
      if (ctx.previewBoot && edits.length > 0) {
        const preview = await ctx.previewBoot(edits);
        if (preview === undefined || preview.errors.length > 0) {
          return [
            {
              id: OFFER_ID,
              rule: OFFER_ID,
              severity: "info",
              tier: "source",
              where: {},
              message: preview === undefined ? "could not verify the switch: the edited copy could not be reloaded" : `the switch fails to boot: ${preview.errors.map((e) => e.reason).join("; ")}`,
              suggestion: "run fix again to re-verify, or resolve the boot error above",
              fix: { kind: "manual" },
              docs: docsAnchor("preset-event-queue-offer"),
            },
          ];
        }
      }
      return [
        {
          id: OFFER_ID,
          rule: OFFER_ID,
          severity: "info",
          tier: "source",
          where: {},
          message: "switching event delivery to the queue",
          suggestion: missing !== undefined ? `add "eventsQueue" to the features array by hand; could not locate: ${missing}` : `adds "eventsQueue" to the features array; presetModuleConfig() takes it from there. run pnpm install afterwards`,
          fix: edits.length > 0 ? { kind: "auto", edits } : { kind: "manual" },
          docs: docsAnchor("preset-event-queue-offer"),
        },
      ];
    },
  };
}

export const layerRules: readonly Rule[] = [layerRangeRule, relayScopeRule, loadIssuesRule(), presetProblemsRule(), overrideDriftRule(), queueOfferRule()];
