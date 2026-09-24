import { renameContentField } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, Rule } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { PipelineDefinition, PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset } from "../pipelines/checkPreset";
import type { PresetOptions } from "../pipelines/checkPreset";
import { addModuleEntryConfigProperty, bumpPackageJsonDependency, insertStepAfterLastEmit, wrapAtomicGroup } from "./edits";
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

function atomicGroupOf(def: PipelineDefinition | undefined): string[] | undefined {
  for (const entry of def?.steps ?? []) {
    if (typeof entry === "object" && entry !== null && "atomic" in entry) return [...(entry as { atomic: readonly string[] }).atomic];
  }
  return undefined;
}

/**
 * Wraps the write steps a layer preset override drops the atomic group around, using `locateSteps` to
 * find the override's own step array inside `definePreset({ overrides })`: auto when the smallest window
 * containing the default group's members has nothing else in it, a question when the consumer's own steps
 * sit in the same window, manual when the override or the default group cannot be located at all.
 */
export const overrideGroupRule: Rule = {
  id: "preset/override-group",
  check(ctx) {
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
      const members = atomicGroupOf(defaultPipelineOf(cast, pipelineName));
      const file = ctx.project.pipelineFiles.get(pipelineName);
      const source = file === undefined ? undefined : ctx.readFile(file);
      if (members === undefined || file === undefined || source === undefined) {
        findings.push(manualFinding(id, "preset/override-group", where, problem.message, "could not locate the override or the 3.0 default's atomic group; wrap the write steps in { atomic: [...] } yourself", docsAnchor("preset-override-group")));
        continue;
      }
      const result = wrapAtomicGroup(file, source, { pipelineName, members, locateSteps: locate });
      if (result.kind === "wrapped") {
        findings.push(autoFinding(id, "preset/override-group", where, problem.message, `wraps ${members.map((m) => `"${m}"`).join(", ")} in an atomic group, matching the 3.0 default`, [result.edit], docsAnchor("preset-override-group")));
        continue;
      }
      if (result.kind === "not-found") {
        findings.push(manualFinding(id, "preset/override-group", where, problem.message, "could not locate the override's own step array; wrap the write steps in { atomic: [...] } yourself", docsAnchor("preset-override-group")));
        continue;
      }
      const answer = ctx.answers.get(`override-group:${pipelineName}`);
      if (answer === "include") {
        const wide = wrapAtomicGroup(file, source, { pipelineName, members: result.window, locateSteps: locate });
        if (wide.kind === "wrapped") {
          findings.push(autoFinding(id, "preset/override-group", where, problem.message, `wraps ${result.window.map((m) => `"${m}"`).join(", ")} in an atomic group, including this override's own steps`, [wide.edit], docsAnchor("preset-override-group")));
          continue;
        }
      }
      if (answer !== undefined) {
        findings.push(manualFinding(id, "preset/override-group", where, problem.message, "wrap the write steps in { atomic: [...] } yourself", docsAnchor("preset-override-group")));
        continue;
      }
      findings.push({
        id,
        rule: "preset/override-group",
        severity: "error",
        tier: "source",
        where,
        message: `override for "${pipelineName}" drops the atomic group around ${members.map((m) => `"${m}"`).join(", ")}, and its own steps sit in the same window (${result.extra.map((m) => `"${m}"`).join(", ")})`,
        suggestion: "each included step must be declared atomicSafe by its own module",
        fix: { kind: "ask", question: `override-group:${pipelineName}`, prompt: `include ${result.extra.join(", ")} in the atomic group around "${pipelineName}"'s write, or leave this for manual review?`, choices: ["manual", "include"] },
        docs: docsAnchor("preset-override-group"),
      });
    }
    return findings;
  },
};

/**
 * Appends `events.relay` after the last `events.emit:` step a layer preset override keeps, using
 * `locateSteps`; manual when the override's own step array cannot be located.
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
      const edit = file !== undefined && source !== undefined ? insertStepAfterLastEmit(file, source, { pipelineName, newStep: "events.relay", locateSteps: locate }) : undefined;
      return edit === undefined
        ? manualFinding(id, "preset/override-relay", where, problem.message, "append events.relay after the pipeline's events.emit: step yourself", docsAnchor("preset-override-relay"))
        : autoFinding(id, "preset/override-relay", where, problem.message, "appends events.relay after the pipeline's last events.emit: step", [edit], docsAnchor("preset-override-relay"));
    });
  },
};

/**
 * Replaces kestrel's own `model/underscore-field` for a layer project: the built-in rule reads
 * `config.types.<typeName>.fields` on a module-list entry in `kestrel.config.ts`, which a layer project's
 * content model never has — it lives in `shared/model.ts`, wired in by `presetModuleConfig()` at runtime.
 * This version reads the collections the captured preset options carry and edits that file directly, with
 * `locateModelFields` finding its `fields` object by structure. No data step exists for a layer project
 * yet, so a rename is never auto-applied as "proven safe" — always an explicit answer.
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
        const questionId = `underscore-field:${typeName}.${field}`;
        const target = field.replace(/^_+/, "");
        const answer = ctx.answers.get(questionId);
        if (answer === undefined) {
          findings.push({
            id,
            rule: "model/underscore-field",
            severity: "error",
            tier: "source",
            where,
            message: `"${field}" on content type "${typeName}" starts with "_", which fails boot on 6.0.0`,
            suggestion: "no data step exists yet to prove no stored value exists; add a migration on the running 5.8.x instance first if data may exist, then answer to rename",
            fix: { kind: "ask", question: questionId, prompt: `rename "${field}" on "${typeName}" to`, choices: [target, "remove"] },
            docs: docsAnchor("model-underscore-field"),
          });
          continue;
        }
        if (answer === "remove") continue;
        const file = sharedModelFile(ctx);
        const source = ctx.readFile(file);
        const edit = source === undefined ? undefined : renameContentField(file, source, { use: "", typeName, from: field, to: answer, locateModelFields: ctx.locateModelFields ?? layerLocateModelFields });
        findings.push({
          id,
          rule: "model/underscore-field",
          severity: "warning",
          tier: "source",
          where,
          message: `"${field}" on content type "${typeName}" starts with "_"`,
          suggestion: edit === undefined ? `could not locate "shared/model.ts"'s content type; rename "${field}" to "${answer}" by hand` : `renamed to "${answer}" — not proven safe; add a migration on the running 5.8.x instance first if data may exist`,
          fix: edit === undefined ? { kind: "manual" } : { kind: "auto", edits: [edit] },
          docs: docsAnchor("model-underscore-field"),
        });
      }
    }
    return findings;
  },
};

export const layerRules: readonly Rule[] = [layerRangeRule, relayScopeRule, presetProblemsRule, overrideDriftRule, overrideGroupRule, overrideRelayRule];
