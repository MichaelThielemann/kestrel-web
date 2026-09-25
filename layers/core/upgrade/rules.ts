import { join } from "node:path";
import { arrayElements, findCalls, firstArgument, insertStepAfterEmitOutsideGroup, isArrayExpression, isAstNode, objectProperty, parseTs, stringValue } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Edit, Finding, Rule, RuleContext, SourceRule, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineDefinition, PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset, relayPipelinesFor } from "../pipelines/checkPreset";
import { DEFAULT_COLLECTIONS } from "../pipelines/collections";
import type { CollectionModel } from "../pipelines/collections";
import { anonymousFieldGrants, fieldCutSteps } from "../pipelines/field-grants";
import type { FieldGrantModel, FieldGrants } from "../pipelines/field-grants";
import type { PresetOptions } from "../pipelines/checkPreset";
import { consumerRules } from "./consumerRules";
import { DEPENDENTS_PROBLEM_CODES, dependentsRules } from "./dependentsRules";
import { overrideEmitRule } from "./overrideEmit";
import { addModuleEntryConfigProperty, addStringToNamedExportArray, bumpPackageJsonDependency, namedExportArray, removeStepsFromArray, wrapAtomicGroup, wrapRange } from "./edits";
import type { SourceRange } from "./edits";
import { layerProjectData } from "./load";
import { layerLocateSteps, ownPipelineSteps } from "./locators";
import { autoFinding, docsAnchor, fileForPipeline, findFeaturesArrayFile, LAYER_PACKAGE, LAYER_RANGE, layerPackageRange, manualFinding, packageJsonPath, presetOptionsCast, resolvedArrayValues } from "./ruleHelpers";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";

const EVENTS_QUEUE_MODULE = "@michaelthielemann/kestrel-events-queue";

/**
 * Bumps `@michaelthielemann/kestrel-web` to `^3.0.0` in the project's `package.json`. Kestrel's own
 * `deps/kestrel-range` only ever looks at `@michaelthielemann/kestrel*` backend packages, never this one.
 * A source rule, like `deps/kestrel-range` itself, so it still runs (and can still bump the range) on a
 * project whose `kestrel.config.ts` fails to load for an unrelated reason.
 */
export const layerRangeRule: SourceRule = {
  id: "deps/layer-range",
  needs: "source",
  check(ctx) {
    const file = packageJsonPath(ctx);
    const source = ctx.readFile(file);
    const current = layerPackageRange(ctx);
    if (source === undefined || current === undefined || current === LAYER_RANGE) return [];
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
    const relay = `[${relayPipelinesFor(cast.features ?? []).map((p) => `"${p}"`).join(", ")}]`;
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

const SANITIZE_SVG_PACKAGE = "@michaelthielemann/kestrel-sanitize-svg";

function featuresInsertionTarget(source: string, features: { elements: readonly AstNode[] }): string {
  for (const el of features.elements) {
    if (el.type !== "SpreadElement") continue;
    const arg = el.argument;
    if (isAstNode(arg) && arg.type === "Identifier" && typeof arg.name === "string" && namedExportArray(source, arg.name) !== undefined) return arg.name;
  }
  return "features";
}

function deniesSvg(ctx: SourceRuleContext): boolean {
  const source = ctx.readFile(join(ctx.root, "kestrel.config.ts"));
  if (source === undefined) return false;
  for (const call of findCalls(parseTs(source), "presetModuleConfig")) {
    const options = firstArgument(call);
    const media = options === undefined ? undefined : objectProperty(options, "media");
    const denied = media === undefined ? undefined : objectProperty(media, "deniedTypes");
    if (denied !== undefined && isArrayExpression(denied) && arrayElements(denied).some((el) => stringValue(el) === "image/svg+xml")) return true;
  }
  return false;
}

function dependsOnSanitizeSvg(ctx: SourceRuleContext): boolean {
  const source = ctx.readFile(join(ctx.root, "package.json"));
  return source !== undefined && source.includes(`"${SANITIZE_SVG_PACKAGE}"`);
}

/**
 * `presetModuleConfig()` turns media's `publicCopy` on for the `delivery` feature and rejects that
 * combination outright when SVG uploads are still allowed without `sanitizeSvg` — a 2.x project, built
 * before that feature existed, always has this shape. Reads `shared/model.ts`'s `features` array directly
 * rather than the loaded preset, so it still finds and fixes the gap on a project whose `kestrel.config.ts`
 * this same condition would otherwise fail to load at all — following a `...presetFeatures`-style spread
 * to the narrower array `presetModuleConfig()` actually receives, and inserting into that array instead of
 * `features` itself when there is one. Stays silent when `features` is not statically resolvable (a
 * `withDelivery([...])` wrapper, a spread of an imported array) or when `media.deniedTypes` already denies
 * SVG outright — `load()`'s own recognition of the preset's refusal message carries the manual finding then.
 */
export const missingSanitizeSvgRule: SourceRule = {
  id: "preset/missing-sanitize-svg",
  needs: "source",
  check(ctx) {
    const file = findFeaturesArrayFile(ctx);
    const source = file === undefined ? undefined : ctx.readFile(file);
    const features = source === undefined ? undefined : namedExportArray(source, "features");
    if (file === undefined || source === undefined || features === undefined) return [];
    const values = resolvedArrayValues(source, features);
    if (!values.includes("delivery") || values.includes("sanitizeSvg") || deniesSvg(ctx)) return [];
    const edit = addStringToNamedExportArray(file, source, featuresInsertionTarget(source, features), "sanitizeSvg");
    if (edit === undefined) return [];
    const where = { file };
    const message = `features has "delivery" (which turns on media's publicCopy) without "sanitizeSvg", which presetModuleConfig() requires once SVG uploads are allowed`;
    const suggestion = dependsOnSanitizeSvg(ctx) ? `adds "sanitizeSvg" to features` : `adds "sanitizeSvg" to features; add ${SANITIZE_SVG_PACKAGE} to your dependencies too`;
    return [autoFinding("preset/missing-sanitize-svg", "preset/missing-sanitize-svg", where, message, suggestion, [edit], docsAnchor("preset-missing-sanitize-svg"))];
  },
};

const WATCHED_EMIT_PROBLEM = "preset/override-drops-watched-emit";
const OWNED_PROBLEM_CODES = new Set(["preset/override-drops-atomic-group", "preset/override-drops-relay", WATCHED_EMIT_PROBLEM, ...DEPENDENTS_PROBLEM_CODES]);

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

function relayedPipelineRunsStep(ctx: RuleContext, events: readonly string[], step: string): boolean {
  const triggered = new Set(ctx.project.input.config.triggers.filter((t) => "event" in t && events.includes(t.event)).map((t) => t.pipeline));
  return [...triggered].some((name) => {
    const def = ctx.project.input.pipelines.find((p) => p.name === name);
    return def !== undefined && pipelineSteps(def.steps).includes(step);
  });
}

function removableDeliverySteps(ctx: RuleContext, ownSteps: readonly string[]): string[] {
  const events = emittedEventsOf(ownSteps);
  return ownSteps.filter(isDeliveryStep).filter((step) => relayedPipelineRunsStep(ctx, events, step));
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
      if (!ownSteps.some(isDeliveryStep)) continue;
      const defaultSteps = pipelineSteps(defaultPipelineOf(cast, pipelineName)?.steps ?? []);
      if (defaultSteps.some(isDeliveryStep)) continue;
      const removable = removableDeliverySteps(ctx, ownSteps);
      if (removable.length === 0) continue;
      const id = `preset/override-delivery:${pipelineName}`;
      const where = { pipeline: pipelineName };
      const docs = docsAnchor("preset-override-delivery");
      const message = `override for "${pipelineName}" still runs ${removable.map((s) => `"${s}"`).join(", ")}, which the 3.0 default moved to the pipeline its event relays to — publishing twice`;
      const file = fileForPipeline(ctx, pipelineName);
      const source = file === undefined ? undefined : ctx.readFile(file);
      if (file === undefined || source === undefined) {
        findings.push(manualFinding(id, "preset/override-delivery", where, message, `remove ${removable.map((s) => `"${s}"`).join(", ")} from the override yourself`, docs));
        continue;
      }
      const root = parseTs(source);
      const arrays = locate(root, pipelineName);
      const edits = arrays.flatMap((array) => removeStepsFromArray(file, source, array, (step) => removable.includes(step)));
      findings.push(
        edits.length > 0
          ? autoFinding(id, "preset/override-delivery", where, message, `removes ${removable.map((s) => `"${s}"`).join(", ")}; the relayed pipeline already runs them`, edits, docs)
          : manualFinding(id, "preset/override-delivery", where, message, `remove ${removable.map((s) => `"${s}"`).join(", ")} from the override yourself`, docs),
      );
    }
    return findings;
  },
};

/**
 * A pipeline defined directly in `pipelines/index.ts` (not an override) that still runs
 * `delivery.publish`/`unpublish`/`exportLlms` while emitting an event a relay pipeline runs the same
 * steps for also publishes twice. Asks rather than auto-applying, since this is the consumer's own pipeline
 * rather than a known 2.x default shape — but the same provably-correct condition `preset/override-delivery`
 * requires before acting gates the question here too, so "remove" is a safe default.
 */
export const ownPipelineDeliveryRule: Rule = {
  id: "preset/own-pipeline-delivery",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const overrideNames = new Set(Object.keys(cast.overrides ?? {}));
    const ownNames = ctx.project.pipelineFiles.flatMap((pf) => pf.pipelines).filter((name) => !overrideNames.has(name));
    if (ownNames.length === 0) return [];
    const locate = ctx.locateSteps ?? layerLocateSteps;
    const findings: Finding[] = [];
    for (const pipelineName of ownNames) {
      const def = ctx.project.input.pipelines.find((p) => p.name === pipelineName);
      if (def === undefined) continue;
      const ownSteps = pipelineSteps(def.steps);
      if (!ownSteps.some(isDeliveryStep)) continue;
      const removable = removableDeliverySteps(ctx, ownSteps);
      if (removable.length === 0) continue;

      const id = `preset/own-pipeline-delivery:${pipelineName}`;
      const rule = "preset/own-pipeline-delivery";
      const where = { pipeline: pipelineName };
      const docs = docsAnchor("preset-own-pipeline-delivery");
      const stepList = removable.map((s) => `"${s}"`).join(", ");
      const message = `pipeline "${pipelineName}" still runs ${stepList} while emitting an event that also triggers a relay pipeline running them — publishing twice`;
      const questionId = `own-pipeline-delivery:${pipelineName}`;
      const answer = ctx.answers.get(questionId);

      if (answer === "keep") {
        findings.push({ id, rule, severity: "info", tier: "source", where, message, suggestion: "kept as answered; review whether this pipeline should still publish inline", fix: { kind: "none" }, docs });
        continue;
      }
      if (answer === "remove") {
        const file = fileForPipeline(ctx, pipelineName);
        const source = file === undefined ? undefined : ctx.readFile(file);
        let edits: Edit[] = [];
        if (file !== undefined && source !== undefined) {
          const root = parseTs(source);
          const located = locate(root, pipelineName);
          const arrays = located.length > 0 ? located : ownPipelineSteps(root, pipelineName);
          edits = arrays.flatMap((array) => removeStepsFromArray(file, source, array, (step) => removable.includes(step)));
        }
        findings.push(
          edits.length > 0
            ? autoFinding(id, rule, where, message, `removes ${stepList}; the relayed pipeline already runs them`, edits, docs)
            : manualFinding(id, rule, where, message, `remove ${stepList} from the pipeline yourself`, docs),
        );
        continue;
      }
      findings.push({
        id,
        rule,
        severity: "error",
        tier: "source",
        where,
        message,
        suggestion: "the relayed pipeline already runs these steps; keep them here only if this pipeline must publish synchronously",
        fix: { kind: "ask", question: questionId, prompt: `remove ${stepList} from "${pipelineName}", or keep them?`, choices: ["remove", "keep"], closedChoices: true, defaultValue: "remove" },
        docs,
      });
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

type IncludeResult = { kind: "safe"; edit: Edit } | { kind: "unsafe"; reason: string };

async function verifiedInclude(ctx: RuleContext, file: string, source: string, pipelineName: string, range: SourceRange): Promise<IncludeResult> {
  const edit = wrapRange(file, source, range);
  if (!ctx.verifyEdits) return { kind: "unsafe", reason: "could not verify: no boot check ran; upgrade @michaelthielemann/kestrel to 6 first" };
  const result = await ctx.verifyEdits([edit], { pipelines: [pipelineName] });
  if (!result.verified) {
    if (result.unchecked.length > 0) {
      const because = result.unchecked[0]?.because;
      return { kind: "unsafe", reason: `the preview did not check pipeline "${pipelineName}"${because === undefined ? "" : `: ${because}`}` };
    }
    return { kind: "unsafe", reason: "could not verify: no boot check ran, or the edited copy could not be reloaded" };
  }
  if (result.newErrors.length > 0) return { kind: "unsafe", reason: result.newErrors.map((e) => e.reason).join("; ") };
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
      const file = fileForPipeline(ctx, pipelineName);
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
      if (result.extra.length === 0) {
        findings.push(manualFinding(id, rule, where, problem.message, "the window already holds exactly the 3.0 default's group members, only in a different order; wrap them in { atomic: [...] } yourself, in that order", docs));
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
          closedChoices: true,
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
 * A pipeline that also dropped an emit a dependents pipeline listens to is left to `preset/override-emit`,
 * which adds the emit and the relay together.
 */
export const overrideRelayRule: Rule = {
  id: "preset/override-relay",
  check(ctx) {
    const data = layerProjectData(ctx.project);
    if (data === undefined) return [];
    const emitOwned = new Set(data.presetProblems.filter((p) => p.code === WATCHED_EMIT_PROBLEM).map((p) => p.pipeline));
    const problems = data.presetProblems.filter((p) => p.code === "preset/override-drops-relay" && p.pipeline !== undefined && !emitOwned.has(p.pipeline));
    if (problems.length === 0) return [];
    const locate = ctx.locateSteps ?? layerLocateSteps;
    return problems.map((problem): Finding => {
      const pipelineName = problem.pipeline!;
      const id = `preset/override-relay:${pipelineName}`;
      const where = { pipeline: pipelineName };
      const file = fileForPipeline(ctx, pipelineName);
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

/**
 * An override of a read the preset ends with `authz.fields` replaces the whole step list, the field step
 * included; boot refuses it while an anonymous caller can reach it. Names the step to append — information
 * only, since kestrel's own `pipelines/field-step` offers the edit once boot reports it.
 */
export const publicOverrideFieldStepRule: Rule = {
  id: "pipelines/public-override-field-step",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const cuts = fieldCutSteps(cast.collections ?? DEFAULT_COLLECTIONS);
    const findings: Finding[] = [];
    for (const name of Object.keys(cast.overrides ?? {})) {
      const step = cuts[name];
      if (step === undefined) continue;
      const steps = pipelineSteps(ctx.project.input.pipelines.find((p) => p.name === name)?.steps ?? []);
      if (steps.at(-1)?.startsWith("authz.fields:") === true) continue;
      const file = fileForPipeline(ctx, name);
      findings.push({
        id: `pipelines/public-override-field-step:${name}`,
        rule: "pipelines/public-override-field-step",
        severity: "info",
        tier: "source",
        where: file === undefined ? { pipeline: name } : { pipeline: name, file },
        message: `override for "${name}" does not end with "${step}", which the preset's default ends with; the server does not start while anonymous callers can reach it`,
        suggestion: `append "${step}" as the override's last step, so that a visitor without a session receives only the fields anonymousFields grants`,
        fix: { kind: "none" },
        docs: docsAnchor("pipelines-public-override-field-step"),
      });
    }
    return findings;
  },
};

const AUTHZ_ROLES_MODULE = "@michaelthielemann/kestrel-authz-roles";
const CONTENT_MODULE = "@michaelthielemann/kestrel-content-default";

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}

function moduleConfig(ctx: RuleContext, use: string): Record<string, unknown> | undefined {
  return recordOf(ctx.project.input.config.modules.find((entry) => entry.use === use)?.config);
}

function grantModel(ctx: RuleContext): FieldGrantModel {
  const content = moduleConfig(ctx, CONTENT_MODULE);
  const locales = Array.isArray(content?.locales) ? content.locales.filter((locale): locale is string => typeof locale === "string") : undefined;
  const types = boundaryCast<Record<string, CollectionModel>>(recordOf(content?.types) ?? {}, "host");
  return locales === undefined ? { types } : { locales, types };
}

function grantsLiteral(grants: FieldGrants): string {
  return `anonymousFields: { ${Object.entries(grants).map(([resource, paths]) => `${resource}: [${paths.map((path) => JSON.stringify(path)).join(", ")}]`).join(", ")} }`;
}

/**
 * What callers without a session keep of each answer. A hand-written `authz-roles` entry without
 * `anonymousFields` gets the grants `presetModuleConfig()` would derive for the loaded content model and
 * features, to copy; a project whose grants are set, while its layer range is still 2.x, is told once which
 * fields its visitors keep. Information only: `pipelines/field-step` writes the grants when answered.
 */
export const fieldGrantsRule: Rule = {
  id: "preset/field-grants",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    const authz = moduleConfig(ctx, AUTHZ_ROLES_MODULE);
    if (cast === undefined || authz === undefined) return [];
    const docs = docsAnchor("preset-field-grants");
    const where = { module: AUTHZ_ROLES_MODULE, file: ctx.project.configFile };
    const configured = recordOf(authz.anonymousFields);
    if (configured === undefined) {
      const derived = anonymousFieldGrants(grantModel(ctx), cast.features ?? []);
      return [
        {
          id: "preset/field-grants",
          rule: "preset/field-grants",
          severity: "info",
          tier: "source",
          where,
          message: "authz-roles is configured by hand without anonymousFields: the preset's public reads end with authz.fields, and the server does not start while they grant anonymous callers nothing",
          suggestion: `add ${grantsLiteral(derived)} to its config, the grants presetModuleConfig() derives for this model and these features`,
          fix: { kind: "none" },
          docs,
        },
      ];
    }
    const range = layerPackageRange(ctx);
    if (range === undefined || range === LAYER_RANGE) return [];
    const kept = Object.entries(configured).map(([resource, paths]) => `${resource}: ${Array.isArray(paths) ? paths.join(", ") : ""}`);
    return [
      {
        id: "preset/field-grants",
        rule: "preset/field-grants",
        severity: "info",
        tier: "source",
        where,
        message: `visitors without a session keep only these fields of the answers they read — ${kept.join("; ")}; every other field is cut`,
        suggestion: "set roles.anonymousFields in presetModuleConfig() to grant a resource differently",
        fix: { kind: "none" },
        docs,
      },
    ];
  },
};

export const layerRules: readonly Rule[] = [
  layerRangeRule,
  relayScopeRule,
  missingSanitizeSvgRule,
  presetProblemsRule,
  overrideDriftRule,
  overrideDeliveryRule,
  ownPipelineDeliveryRule,
  overrideGroupRule,
  overrideRelayRule,
  overrideEmitRule,
  publicOverrideFieldStepRule,
  fieldGrantsRule,
  ...dependentsRules,
  ...consumerRules,
];
