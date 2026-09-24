import { insertStepAfterEmitOutsideGroup, parseTs, renameContentField } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Edit, Finding, Rule, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { BootProblem } from "@michaelthielemann/kestrel";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineDefinition, PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset } from "../pipelines/checkPreset";
import type { PresetOptions } from "../pipelines/checkPreset";
import { addModuleEntryConfigProperty, bumpPackageJsonDependency, removeStepsFromArray, wrapAtomicGroup, wrapRange } from "./edits";
import type { SourceRange } from "./edits";
import { layerProjectData } from "./load";
import { layerLocateModelFields, layerLocateSteps } from "./locators";
import { autoFinding, docsAnchor, manualFinding, packageJsonPath, presetOptionsCast, sharedModelFile } from "./ruleHelpers";

const LAYER_RANGE = "^3.0.0";
const LAYER_PACKAGE = "@michaelthielemann/kestrel-web";
const EVENTS_QUEUE_MODULE = "@michaelthielemann/kestrel-events-queue";

/**
 * Bumps `@michaelthielemann/kestrel-web` to `^3.0.0` in the project's `package.json`. The layer declares
 * this package under `ownsPackages`, so kestrel's own `deps/kestrel-range` never touches it.
 */
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
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const entry = (cast.modules ?? []).find((m) => m.use === EVENTS_QUEUE_MODULE);
    if (entry === undefined || hasRelayPipelinesKey(entry)) return [];
    const source = ctx.readFile(ctx.project.configFile);
    const relay = cast.features?.includes("delivery") ? '["publishPage", "unpublishPage"]' : "[]";
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

const OWNED_PROBLEM_CODES = new Set(["preset/override-drops-atomic-group", "preset/override-drops-relay"]);

/** Every `checkPreset()` problem not already owned by a more specific rule, one manual finding each. */
export const presetProblemsRule: Rule = {
  id: "preset/problem",
  check(ctx) {
    const data = layerProjectData(ctx.project);
    if (data === undefined) return [];
    return data.presetProblems
      .filter((problem) => !OWNED_PROBLEM_CODES.has(problem.code))
      .map(
        (problem, i): Finding => ({
          id: `preset/${problem.code}:${problem.pipeline ?? i}`,
          rule: `preset/${problem.code}`,
          severity: "error",
          tier: "source",
          where: problem.pipeline === undefined ? {} : { pipeline: problem.pipeline },
          message: problem.message,
          suggestion: "resolve the override or configuration that causes this, then run check again",
          fix: { kind: "manual" },
          docs: docsAnchor("preset-problem"),
        }),
      );
  },
};

function flatSteps(def: PipelineDefinition | undefined): string[] {
  return (def?.steps ?? []).filter((s: PipelineEntry): s is string => typeof s === "string");
}

function defaultPipelineOf(cast: PresetOptions, name: string): PipelineDefinition | undefined {
  const { preset } = checkPreset({ ...cast, overrides: {} });
  return preset.pipelines.find((p) => p.name === name);
}

/** An override lacks a step the 3.0 default of that pipeline runs — information only, never changed automatically. */
export const overrideDriftRule: Rule = {
  id: "preset/override-drift",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const overrideNames = Object.keys(cast.overrides ?? {});
    if (overrideNames.length === 0) return [];
    const findings: Finding[] = [];
    for (const name of overrideNames) {
      const defaultSteps = flatSteps(defaultPipelineOf(cast, name));
      const overriddenSteps = new Set(flatSteps(ctx.project.input.pipelines.find((p) => p.name === name)));
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

const DELIVERY_STEP_PREFIXES = ["delivery.publish:", "delivery.unpublish:"];
const DELIVERY_EXPORT_STEP = "delivery.exportLlms";

function isDeliveryStep(step: string): boolean {
  return DELIVERY_STEP_PREFIXES.some((p) => step.startsWith(p)) || step === DELIVERY_EXPORT_STEP;
}

function emittedEventsOf(steps: readonly string[]): string[] {
  return steps.filter((s) => s.startsWith("events.emit:")).map((s) => s.slice("events.emit:".length).split("?")[0]!);
}

function relayedPipelineRunsDelivery(ctx: RuleContext, events: readonly string[]): boolean {
  const triggered = new Set(ctx.project.input.config.triggers.filter((t) => "event" in t && events.includes(t.event)).map((t) => t.pipeline));
  return [...triggered].some((name) => {
    const def = ctx.project.input.pipelines.find((p) => p.name === name);
    return def !== undefined && pipelineSteps(def.steps).some(isDeliveryStep);
  });
}

/**
 * A forward-ported 2.x override that still runs `delivery.publish:<c>` / `delivery.unpublish:<c>` /
 * `delivery.exportLlms` inline publishes twice once the 3.0 default moved publishing to a separate
 * event-triggered pipeline (`publishPage` for pages today) reached through the relay. Auto-removes those
 * steps from the override's own step array when the 3.0 default of the same pipeline no longer has them
 * AND an event the override emits triggers a pipeline that runs them — the exact condition that makes
 * keeping them a double publish, never a guess. Own pipelines defined directly in `pipelines/index.ts`
 * (not overrides of a preset pipeline) are not covered here.
 */
export const overrideDeliveryRule: Rule = {
  id: "preset/override-delivery",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const overrideNames = Object.keys(cast.overrides ?? {});
    if (overrideNames.length === 0) return [];
    const locate = ctx.locateSteps ?? layerLocateSteps;
    const findings: Finding[] = [];
    for (const pipelineName of overrideNames) {
      const def = ctx.project.input.pipelines.find((p) => p.name === pipelineName);
      if (def === undefined) continue;
      const ownSteps = pipelineSteps(def.steps);
      const deliverySteps = ownSteps.filter(isDeliveryStep);
      if (deliverySteps.length === 0) continue;
      const defaultSteps = pipelineSteps(defaultPipelineOf(cast, pipelineName)?.steps ?? []);
      if (defaultSteps.some(isDeliveryStep)) continue;
      if (!relayedPipelineRunsDelivery(ctx, emittedEventsOf(ownSteps))) continue;
      const id = `preset/override-delivery:${pipelineName}`;
      const where = { pipeline: pipelineName };
      const docs = docsAnchor("preset-override-delivery");
      const message = `override for "${pipelineName}" still runs ${deliverySteps.map((s) => `"${s}"`).join(", ")}, which the 3.0 default moved to the pipeline its event relays to — publishing twice`;
      const file = ctx.project.pipelineFiles.get(pipelineName);
      const source = file === undefined ? undefined : ctx.readFile(file);
      if (file === undefined || source === undefined) {
        findings.push(manualFinding(id, "preset/override-delivery", where, message, `remove ${deliverySteps.map((s) => `"${s}"`).join(", ")} from the override yourself`, docs));
        continue;
      }
      const root = parseTs(source);
      const arrays = locate(root, pipelineName);
      const edits = arrays.flatMap((array) => removeStepsFromArray(file, source, array, isDeliveryStep));
      findings.push(
        edits.length > 0
          ? autoFinding(id, "preset/override-delivery", where, message, `removes ${deliverySteps.map((s) => `"${s}"`).join(", ")}; the relayed pipeline already runs them`, edits, docs)
          : manualFinding(id, "preset/override-delivery", where, message, `remove ${deliverySteps.map((s) => `"${s}"`).join(", ")} from the override yourself`, docs),
      );
    }
    return findings;
  },
};

function atomicGroupOf(def: PipelineDefinition | undefined): string[] | undefined {
  for (const entry of def?.steps ?? []) {
    if (typeof entry === "object" && entry !== null && "atomic" in entry) return [...(entry as { atomic: readonly string[] }).atomic];
  }
  return undefined;
}

function errKey(e: BootProblem): string {
  return [e.code, e.owner, e.reason, e.module, e.pipeline, e.step, e.path].join(":");
}

type IncludeResult = { kind: "safe"; edit: Edit } | { kind: "unsafe"; reason: string };

async function verifiedInclude(ctx: RuleContext, file: string, source: string, pipelineName: string, range: SourceRange): Promise<IncludeResult> {
  const edit = wrapRange(file, source, range);
  if (!ctx.previewBoot) return { kind: "unsafe", reason: "could not verify: no boot check ran; upgrade @michaelthielemann/kestrel to 6 first" };
  const preview = await ctx.previewBoot([edit]);
  if (preview === undefined) return { kind: "unsafe", reason: "could not verify: the edited copy could not be reloaded" };
  const uncheckedPipeline = preview.notChecked.find((n) => n.kind === "pipeline" && n.name === pipelineName);
  if (uncheckedPipeline !== undefined) return { kind: "unsafe", reason: `the preview did not check pipeline "${pipelineName}" (${uncheckedPipeline.because}); run with --run-setup for the step's own module first` };
  const baseline = new Set(ctx.bootCheck.errors.map(errKey));
  const newErrors = preview.errors.filter((e) => !baseline.has(errKey(e)));
  if (newErrors.length > 0) return { kind: "unsafe", reason: newErrors.map((e) => e.reason).join("; ") };
  return { kind: "safe", edit };
}

function pipelineTriggerLabels(ctx: RuleContext, pipelineName: string): string[] {
  return ctx.project.input.config.triggers
    .filter((t) => t.pipeline === pipelineName)
    .map((t) => ("http" in t ? `"${t.http}"` : "event" in t ? `event "${t.event}"` : `cron "${t.cron}"`));
}

/**
 * Wraps the write steps a layer preset override drops the atomic group around, using `locateSteps` to
 * find the override's own step array inside `definePreset({ overrides })`: auto when the smallest window
 * containing the default group's members holds exactly those members, in that order, and nothing else —
 * a spread or any other non-string entry, an extra step, or a different order all make it a question,
 * never a guess. Otherwise a question with three choices and no default — include the consumer's
 * own steps too (offered only once a preview shows no new boot error AND actually checked the pipeline,
 * which is where an unsafe, non-`atomicSafe` step would surface), exclude the pipeline from the preset
 * (kept manual — see below), or leave it for manual review. Manual, naming the reason, when the override
 * or the 3.0 default's atomic group cannot be located at all.
 *
 * "Exclude" is never auto-applied: removing the override's steps would also remove the routes and event
 * triggers it serves (moving it into `pipelines/index.ts` as an own pipeline with the preset's trigger
 * keeps them, but this plugin does not yet synthesize that trigger), so choosing it always yields a
 * manual finding naming exactly what the pipeline currently serves.
 */
export const overrideGroupRule: Rule = {
  id: "preset/override-group",
  async check(ctx) {
    const cast = presetOptionsCast(ctx);
    const data = layerProjectData(ctx.project);
    if (cast === undefined || data === undefined) return [];
    const problems = data.presetProblems.filter((p) => p.code === "preset/override-drops-atomic-group" && p.pipeline !== undefined);
    if (problems.length === 0) return [];
    const locate = ctx.locateSteps ?? layerLocateSteps;
    const findings: Finding[] = [];
    for (const problem of problems) {
      const pipelineName = problem.pipeline!;
      const id = `preset/override-group:${pipelineName}`;
      const where = { pipeline: pipelineName };
      const rule = "preset/override-group";
      const docs = docsAnchor("preset-override-group");
      const members = atomicGroupOf(defaultPipelineOf(cast, pipelineName));
      const file = ctx.project.pipelineFiles.get(pipelineName);
      const source = file === undefined ? undefined : ctx.readFile(file);
      if (members === undefined || file === undefined || source === undefined) {
        findings.push(manualFinding(id, rule, where, problem.message, "could not locate the override or the 3.0 default's atomic group; wrap the write steps in { atomic: [...] } yourself", docs));
        continue;
      }
      const result = wrapAtomicGroup(file, source, { pipelineName, members, locateSteps: locate });
      if (result.kind === "wrapped") {
        findings.push(autoFinding(id, rule, where, problem.message, `wraps ${members.map((m) => `"${m}"`).join(", ")} in an atomic group, matching the 3.0 default`, [result.edit], docs));
        continue;
      }
      if (result.kind === "not-found") {
        findings.push(manualFinding(id, rule, where, problem.message, "could not locate the override's own step array; wrap the write steps in { atomic: [...] } yourself", docs));
        continue;
      }
      const triggers = pipelineTriggerLabels(ctx, pipelineName);
      const excludeSuggestion = `excluding "${pipelineName}" from the preset would also remove ${triggers.length > 0 ? triggers.join(", ") : "its trigger"}; move the override into pipelines/index.ts as your own pipeline with the same trigger(s), add "${pipelineName}" to exclude: [...] in kestrel.config.ts, then wrap the write steps in { atomic: [...] } yourself`;
      const answer = ctx.answers.get(`override-group:${pipelineName}`);
      if (answer === "include") {
        const include = await verifiedInclude(ctx, file, source, pipelineName, result.range);
        findings.push(
          include.kind === "safe"
            ? autoFinding(id, rule, where, problem.message, `wraps ${result.window.map((m) => `"${m}"`).join(", ")} in an atomic group, including this override's own steps`, [include.edit], docs)
            : manualFinding(id, rule, where, problem.message, `"include" could not be applied (${include.reason}); wrap the write steps yourself, or exclude the pipeline`, docs),
        );
        continue;
      }
      if (answer === "exclude") {
        findings.push(manualFinding(id, rule, where, problem.message, excludeSuggestion, docs));
        continue;
      }
      if (answer === "manual" || answer !== undefined) {
        findings.push(manualFinding(id, rule, where, problem.message, "wrap the write steps in { atomic: [...] } yourself, or exclude the pipeline", docs));
        continue;
      }
      const include = await verifiedInclude(ctx, file, source, pipelineName, result.range);
      const choices = include.kind === "safe" ? ["include", "exclude", "manual"] : ["exclude", "manual"];
      const unsafeNote = include.kind === "safe" ? "" : ` ("include" is not offered: ${include.reason})`;
      findings.push({
        id,
        rule,
        severity: "error",
        tier: "source",
        where,
        message: `override for "${pipelineName}" drops the atomic group around ${members.map((m) => `"${m}"`).join(", ")}, and its own steps sit in the same window (${result.extra.map((m) => `"${m}"`).join(", ")})`,
        suggestion: "each step entering the group must be declared atomicSafe by its own module, verified by a preview boot before this is offered",
        fix: {
          kind: "ask",
          question: `override-group:${pipelineName}`,
          prompt: `include ${result.extra.join(", ")} in the atomic group around "${pipelineName}"'s write, exclude the pipeline from the preset (${excludeSuggestion}), or leave this for manual review?${unsafeNote}`,
          choices,
        },
        docs,
      });
    }
    return findings;
  },
};

/**
 * Appends `events.relay` after the pipeline's own last `events.emit:` step (the loaded, overridden
 * pipeline's own step list, not the 3.0 default's) via kestrel's `insertStepAfterEmitOutsideGroup` and
 * `locateSteps`; manual when the pipeline has no `events.emit:` step or the step array cannot be located.
 */
export const overrideRelayRule: Rule = {
  id: "preset/override-relay",
  check(ctx) {
    const data = layerProjectData(ctx.project);
    if (data === undefined) return [];
    const problems = data.presetProblems.filter((p) => p.code === "preset/override-drops-relay" && p.pipeline !== undefined);
    if (problems.length === 0) return [];
    const locate = ctx.locateSteps ?? layerLocateSteps;
    return problems.map((problem): Finding => {
      const pipelineName = problem.pipeline!;
      const id = `preset/override-relay:${pipelineName}`;
      const where = { pipeline: pipelineName };
      const file = ctx.project.pipelineFiles.get(pipelineName);
      const source = file === undefined ? undefined : ctx.readFile(file);
      const def = ctx.project.input.pipelines.find((p) => p.name === pipelineName);
      const emitStep = def === undefined ? undefined : pipelineSteps(def.steps).filter((s) => s.startsWith("events.emit:")).at(-1);
      const edit =
        file !== undefined && source !== undefined && emitStep !== undefined
          ? insertStepAfterEmitOutsideGroup(file, source, { pipelineName, emitStep, newStep: "events.relay", locateSteps: locate })
          : undefined;
      return edit === undefined
        ? manualFinding(id, "preset/override-relay", where, problem.message, "append events.relay after the pipeline's events.emit: step yourself", docsAnchor("preset-override-relay"))
        : autoFinding(id, "preset/override-relay", where, problem.message, "appends events.relay after the pipeline's last events.emit: step", [edit], docsAnchor("preset-override-relay"));
    });
  },
};

function underscoreQuestionId(typeName: string, field: string): string {
  return `underscore-field:${typeName}.${field}`;
}

function underscoreStoredCounts(ctx: RuleContext, typeName: string, field: string): Record<string, number | null> | undefined {
  const underscoreFields = ctx.project.dataReport?.underscoreFields;
  if (typeof underscoreFields !== "object" || underscoreFields === null) return undefined;
  const counts = (underscoreFields as Record<string, unknown>)[`${typeName}.${field}`];
  if (typeof counts !== "object" || counts === null) return undefined;
  const out: Record<string, number | null> = {};
  for (const [locale, n] of Object.entries(counts)) if (typeof n === "number" || n === null) out[locale] = n;
  return out;
}

function describeUnderscoreCounts(counts: Record<string, number | null>): string {
  return Object.entries(counts)
    .map(([locale, n]) => {
      if (n === null) return locale === "unlocalized" ? "not counted" : `not counted in "${locale}"`;
      return locale === "unlocalized" ? `${n} stored value(s)` : `${n} in "${locale}"`;
    })
    .join(", ");
}

function underscoreFieldEdit(ctx: RuleContext, typeName: string, field: string, to: string): Edit | undefined {
  const file = sharedModelFile(ctx);
  const source = ctx.readFile(file);
  return source === undefined ? undefined : renameContentField(file, source, { use: "", typeName, from: field, to, locateModelFields: ctx.locateModelFields ?? layerLocateModelFields });
}

/**
 * Replaces kestrel's own `model/underscore-field` for a layer project: the built-in rule reads
 * `config.types.<typeName>.fields` on a module-list entry in `kestrel.config.ts`, which a layer project's
 * content model never has — it lives in `shared/model.ts`, wired in by `presetModuleConfig()` at runtime,
 * and `dataModel()` (the layer's own hook) supplies it to `data --db` too. This version reads the
 * collections the captured preset options carry, edits `shared/model.ts` with `locateModelFields`, and
 * reads its counts from `ctx.project.dataReport.underscoreFields` exactly as kestrel's built-in rule does:
 * a data report counting zero stored values in every locale renames automatically, one counting any renames
 * only on an explicit answer (never proven safe), and no report at all asks with no default. It also warns
 * about an orphaned shadow column: for a field whose name does not start with "_", if its `_`-prefixed
 * counterpart is not declared, a data report counting stored values there is a warning, judged fresh on
 * every `check --data-report` against the model's current fields until a report counts that column empty.
 */
export const underscoreFieldOverrideRule: Rule = {
  id: "model/underscore-field",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const collections = cast.collections ?? {};
    const findings: Finding[] = [];
    for (const [typeName, model] of Object.entries(collections)) {
      const declaredFields = new Set(Object.keys(model.fields ?? {}));
      for (const field of declaredFields) {
        if (!field.startsWith("_")) {
          const orphanField = `_${field}`;
          if (declaredFields.has(orphanField)) continue;
          const orphanCounts = underscoreStoredCounts(ctx, typeName, orphanField);
          if (orphanCounts === undefined || Object.values(orphanCounts).every((n) => n === 0)) continue;
          findings.push({
            id: `model/underscore-field:${typeName}.${orphanField}`,
            rule: "model/underscore-field",
            severity: "warning",
            tier: "source",
            where: { path: `types.${typeName}.fields.${field}` },
            message: `the old column "${orphanField}" on content type "${typeName}" still has stored data (${describeUnderscoreCounts(orphanCounts)}); the current field is named "${field}"`,
            suggestion: `add a migration on the running 5.8.x instance (defineMigration) copying "${orphanField}" to "${field}", then run \`kestrel-web-upgrade data\` again to confirm "${orphanField}" is empty`,
            fix: { kind: "none" },
            docs: docsAnchor("model-underscore-field"),
          });
          continue;
        }
        const id = `model/underscore-field:${typeName}.${field}`;
        const where = { path: `types.${typeName}.fields.${field}` };
        const questionId = underscoreQuestionId(typeName, field);
        const target = field.replace(/^_+/, "");
        const counts = underscoreStoredCounts(ctx, typeName, field);
        const verifiedEmpty = counts !== undefined && Object.values(counts).every((n) => n === 0);
        const hasStoredData = counts !== undefined && Object.values(counts).some((n) => n !== null && n > 0);
        const answer = ctx.answers.get(questionId);
        const autoTarget = answer === "remove" ? undefined : (answer ?? (verifiedEmpty ? target : undefined));

        if (verifiedEmpty && autoTarget !== undefined) {
          const edit = underscoreFieldEdit(ctx, typeName, field, autoTarget);
          findings.push({
            id,
            rule: "model/underscore-field",
            severity: "error",
            tier: "source",
            where,
            message: `"${field}" on content type "${typeName}" starts with "_"; a data report counted zero stored values (${describeUnderscoreCounts(counts!)})`,
            suggestion: edit === undefined ? `could not locate "shared/model.ts"'s content type; rename "${field}" to "${autoTarget}" by hand` : `renamed to "${autoTarget}"`,
            fix: edit === undefined ? { kind: "manual" } : { kind: "auto", edits: [edit] },
            docs: docsAnchor("model-underscore-field"),
          });
          continue;
        }
        if (answer !== undefined && answer !== "remove") {
          const edit = underscoreFieldEdit(ctx, typeName, field, answer);
          const proof = counts === undefined ? "no data report was supplied" : `a data report counted stored values (${describeUnderscoreCounts(counts)})`;
          findings.push({
            id,
            rule: "model/underscore-field",
            severity: "warning",
            tier: "source",
            where,
            message: `"${field}" on content type "${typeName}" starts with "_"`,
            suggestion:
              edit === undefined
                ? `could not locate "shared/model.ts"'s content type; rename "${field}" to "${answer}" by hand`
                : `renamed to "${answer}" — ${proof}, not a proving zero count; the old field "${field}" on "${typeName}" may still hold data`,
            fix: edit === undefined ? { kind: "manual" } : { kind: "auto", edits: [edit] },
            docs: docsAnchor("model-underscore-field"),
          });
          continue;
        }
        findings.push({
          id,
          rule: "model/underscore-field",
          severity: "error",
          tier: "source",
          where,
          message: hasStoredData
            ? `"${field}" on content type "${typeName}" starts with "_", which fails boot on 6.0.0; a data report counted stored values (${describeUnderscoreCounts(counts!)})`
            : `"${field}" on content type "${typeName}" starts with "_", which fails boot on 6.0.0`,
          suggestion:
            counts === undefined
              ? "run `kestrel-web-upgrade data --db <file> --out <report>.json` against a copy of the store, then check again with --data-report <report>.json"
              : "a stored value exists in at least one locale; add a migration on the running 5.8.x instance (defineMigration) copying it to the new key before upgrading",
          fix: { kind: "ask", question: questionId, prompt: counts === undefined ? `rename "${field}" on "${typeName}" to (no data report supplied; run \`kestrel-web-upgrade data\` first)` : `rename "${field}" on "${typeName}" to`, choices: [target, "remove"] },
          docs: docsAnchor("model-underscore-field"),
        });
      }
    }
    return findings;
  },
};

export const layerRules: readonly Rule[] = [layerRangeRule, relayScopeRule, presetProblemsRule, overrideDriftRule, overrideDeliveryRule, overrideGroupRule, overrideRelayRule];
