import { combineEditParts, insertStepAfterEmitOutsideGroup, objectProperty, parseTs, renameContentField } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { StepListLocator } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Edit, Finding, Rule, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { BootProblem } from "@michaelthielemann/kestrel";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineDefinition, PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset } from "../pipelines/checkPreset";
import type { PresetOptions } from "../pipelines/checkPreset";
import { addModuleEntryConfigProperty, addStringToArrayProperty, bumpPackageJsonDependency, removeObjectProperty, wrapAtomicGroup } from "./edits";
import { layerProjectData } from "./load";
import { definePresetOptionsNode, layerLocateModelFields, layerLocateSteps } from "./locators";
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

function atomicGroupOf(def: PipelineDefinition | undefined): string[] | undefined {
  for (const entry of def?.steps ?? []) {
    if (typeof entry === "object" && entry !== null && "atomic" in entry) return [...(entry as { atomic: readonly string[] }).atomic];
  }
  return undefined;
}

function errKey(e: BootProblem): string {
  return [e.code, e.owner, e.reason, e.module, e.pipeline, e.step, e.path].join(":");
}

async function newBootErrors(ctx: RuleContext, edits: readonly Edit[]): Promise<readonly BootProblem[] | undefined> {
  if (!ctx.previewBoot) return undefined;
  const preview = await ctx.previewBoot(edits);
  if (preview === undefined) return undefined;
  const baseline = new Set(ctx.bootCheck.errors.map(errKey));
  return preview.errors.filter((e) => !baseline.has(errKey(e)));
}

type IncludeResult = { kind: "safe"; edit: Edit } | { kind: "unsafe"; reason: string };

async function verifiedInclude(ctx: RuleContext, file: string, source: string, pipelineName: string, window: readonly string[], locate: StepListLocator): Promise<IncludeResult> {
  const wide = wrapAtomicGroup(file, source, { pipelineName, members: window, locateSteps: locate });
  if (wide.kind !== "wrapped") return { kind: "unsafe", reason: "could not locate the override's own step array" };
  const newErrors = await newBootErrors(ctx, [wide.edit]);
  if (newErrors === undefined) return { kind: "unsafe", reason: "could not verify: no boot check ran, or the edited copy could not be reloaded" };
  if (newErrors.length > 0) return { kind: "unsafe", reason: newErrors.map((e) => e.reason).join("; ") };
  return { kind: "safe", edit: wide.edit };
}

type ExcludeResult = { kind: "ok"; edits: Edit[] } | { kind: "missing"; parts: readonly string[] };

function excludeEdits(file: string, source: string, pipelineName: string): ExcludeResult {
  const root = parseTs(source);
  const options = definePresetOptionsNode(root);
  const overridesObj = options === undefined ? undefined : objectProperty(options, "overrides");
  const removeEdit = overridesObj === undefined ? undefined : removeObjectProperty(file, source, overridesObj, pipelineName);
  const excludeEdit = options === undefined ? undefined : addStringToArrayProperty(file, source, options, "exclude", pipelineName);
  const { edits, missing } = combineEditParts({
    "the override entry": removeEdit === undefined ? undefined : [removeEdit],
    "the exclude array": excludeEdit === undefined ? undefined : [excludeEdit],
  });
  return missing.length > 0 ? { kind: "missing", parts: missing } : { kind: "ok", edits };
}

/**
 * Wraps the write steps a layer preset override drops the atomic group around, using `locateSteps` to
 * find the override's own step array inside `definePreset({ overrides })`: auto when the smallest window
 * containing the default group's members has nothing else in it. Otherwise a question with spec's three
 * choices and no default — include the consumer's own steps too (offered only once a preview shows no new
 * boot error, which is where an unsafe, non-`atomicSafe` step would surface), exclude the pipeline from
 * the preset via `exclude: [...]`, or leave it for manual review. Manual, naming the reason, when the
 * override, the default group, or the file structure `exclude`/`include` needs cannot be located at all.
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
      const answer = ctx.answers.get(`override-group:${pipelineName}`);
      if (answer === "include") {
        const include = await verifiedInclude(ctx, file, source, pipelineName, result.window, locate);
        findings.push(
          include.kind === "safe"
            ? autoFinding(id, rule, where, problem.message, `wraps ${result.window.map((m) => `"${m}"`).join(", ")} in an atomic group, including this override's own steps`, [include.edit], docs)
            : manualFinding(id, rule, where, problem.message, `"include" could not be applied (${include.reason}); wrap the write steps yourself, or exclude the pipeline`, docs),
        );
        continue;
      }
      if (answer === "exclude") {
        const excluded = excludeEdits(file, source, pipelineName);
        findings.push(
          excluded.kind === "ok"
            ? autoFinding(id, rule, where, problem.message, `excludes "${pipelineName}" from the preset; define it as your own pipeline`, excluded.edits, docs)
            : manualFinding(id, rule, where, problem.message, `could not exclude the pipeline by hand; could not locate: ${excluded.parts.join(", ")}`, docs),
        );
        continue;
      }
      if (answer === "manual" || answer !== undefined) {
        findings.push(manualFinding(id, rule, where, problem.message, "wrap the write steps in { atomic: [...] } yourself, or exclude the pipeline", docs));
        continue;
      }
      const include = await verifiedInclude(ctx, file, source, pipelineName, result.window, locate);
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
        fix: { kind: "ask", question: `override-group:${pipelineName}`, prompt: `include ${result.extra.join(", ")} in the atomic group around "${pipelineName}"'s write, exclude the pipeline from the preset, or leave this for manual review?${unsafeNote}`, choices },
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
 * only on an explicit answer (never proven safe), and no report at all asks with no default.
 */
export const underscoreFieldOverrideRule: Rule = {
  id: "model/underscore-field",
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const collections = cast.collections ?? {};
    const findings: Finding[] = [];
    for (const [typeName, model] of Object.entries(collections)) {
      for (const field of Object.keys(model.fields ?? {})) {
        if (!field.startsWith("_")) continue;
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

export const layerRules: readonly Rule[] = [layerRangeRule, relayScopeRule, presetProblemsRule, overrideDriftRule, overrideGroupRule, overrideRelayRule];
