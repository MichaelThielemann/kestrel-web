import { arrayElements, objectProperty, parseTs, span, stringValue } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Edit, Finding, Rule } from "@michaelthielemann/kestrel-upgrade/plugin";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset } from "../pipelines/checkPreset";
import type { PresetOptions } from "../pipelines/checkPreset";
import { layerProjectData } from "./load";
import { layerLocateSteps } from "./locators";
import { autoFinding, docsAnchor, fileForPipeline, manualFinding, presetOptionsCast } from "./ruleHelpers";

const RULE = "preset/override-emit";
const INLINE_EXPORT = "delivery.exportLlms";
const RELAY = "events.relay";

function defaultSteps(cast: PresetOptions, name: string): readonly PipelineEntry[] {
  return checkPreset({ ...cast, overrides: {} }).preset.pipelines.find((p) => p.name === name)?.steps ?? [];
}

function groupMembers(steps: readonly PipelineEntry[]): string[] {
  const group = steps.find((entry): entry is { atomic: readonly string[] } => typeof entry === "object");
  return group === undefined ? [] : group.atomic.filter((step) => !step.startsWith("events.emit:"));
}

function isGroup(node: AstNode): boolean {
  return node.type === "ObjectExpression" && objectProperty(node, "atomic") !== undefined;
}

function separatorOf(source: string, elements: readonly AstNode[]): string {
  if (elements.length < 2) return ", ";
  const between = source.slice(span(elements[0]!).end, span(elements[1]!).start);
  return between.includes("\n") ? between : ", ";
}

export interface EmitRewrite {
  edit?: Edit;
  reason?: string;
}

/**
 * Rewrites an override's own top-level step array into the shape its 3.0 default has around the write: the
 * default group's members wrapped in `{ atomic: [...] }` (only when they sit in the array as an exact,
 * contiguous run, in order), each of the default's `events.emit:` steps the override lacks right after the
 * group, then `events.relay` when missing; a `delivery.exportLlms` the default does not run is left out.
 * Every other entry is kept verbatim and in place. One edit spans the whole array, so a narrower
 * edit of another rule into it (the group wrap, the relay) is superseded instead of conflicting.
 */
export function rewriteOverrideEmits(file: string, source: string, pipelineName: string, defaults: readonly PipelineEntry[], own: readonly PipelineEntry[]): EmitRewrite {
  const array = layerLocateSteps(parseTs(source), pipelineName)[0];
  if (array === undefined) return { reason: "the override's own step array could not be located" };
  const elements = arrayElements(array);
  const texts = elements.map((el) => source.slice(span(el).start, span(el).end));
  const values = elements.map((el) => stringValue(el));
  const defaultFlat = pipelineSteps(defaults);
  const ownFlat = pipelineSteps(own);
  const missingEmits = defaultFlat.filter((step) => step.startsWith("events.emit:") && !ownFlat.includes(step));
  let groupAt = elements.findIndex(isGroup);
  let entries = texts.map((text, i) => ({ text, value: values[i] }));
  if (groupAt === -1) {
    const members = groupMembers(defaults);
    const indices = members.map((m) => values.indexOf(m));
    const start = Math.min(...indices);
    const exact = members.length > 0 && start >= 0 && indices.every((index, i) => index === start + i);
    if (!exact) return { reason: `the write steps ${members.map((m) => `"${m}"`).join(", ")} do not sit in the override as one run in the default's order` };
    const group = { text: `{ atomic: [${texts.slice(start, start + members.length).join(", ")}] }`, value: undefined };
    entries = [...entries.slice(0, start), group, ...entries.slice(start + members.length)];
    groupAt = start;
  }
  const removeExport = !defaultFlat.includes(INLINE_EXPORT);
  const after = missingEmits.map((step) => ({ text: `"${step}"`, value: step }));
  if (!ownFlat.includes(RELAY)) after.push({ text: `"${RELAY}"`, value: RELAY });
  const next = [...entries.slice(0, groupAt + 1), ...after, ...entries.slice(groupAt + 1)].filter((entry) => !(removeExport && entry.value === INLINE_EXPORT));
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (first === undefined || last === undefined) return { reason: "the override has no steps" };
  const { start, end } = span(array);
  const text = source.slice(start, span(first).start) + next.map((entry) => entry.text).join(separatorOf(source, elements)) + source.slice(span(last).end, end);
  return { edit: { file, start, end, text } };
}

/**
 * An override that drops an `events.emit:` step a dependents pipeline listens to (a 2.x `setSettings` or
 * `set<Name>` override never had one) stops the pages showing what it writes from being re-rendered, and the
 * preset refuses it. Adds the emit, the relay and the atomic group the 3.0 default has, and drops an inline
 * `llms.txt` export the default does not run, in one edit of the override's own step array; manual when
 * that array cannot be located or the write steps are not one exact run.
 */
export const overrideEmitRule: Rule = {
  id: RULE,
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    const data = layerProjectData(ctx.project);
    if (cast === undefined || data === undefined) return [];
    const problems = data.presetProblems.filter((p) => p.code === "preset/override-drops-watched-emit" && p.pipeline !== undefined);
    return problems.map((problem): Finding => {
      const pipelineName = problem.pipeline!;
      const id = `${RULE}:${pipelineName}`;
      const where = { pipeline: pipelineName };
      const docs = docsAnchor("preset-override-emit");
      const file = fileForPipeline(ctx, pipelineName);
      const source = file === undefined ? undefined : ctx.readFile(file);
      const own = ctx.project.input.pipelines.find((p) => p.name === pipelineName)?.steps ?? [];
      const rewrite = file === undefined || source === undefined ? { reason: "the override's file is not known" } : rewriteOverrideEmits(file, source, pipelineName, defaultSteps(cast, pipelineName), own);
      return rewrite.edit === undefined
        ? manualFinding(id, RULE, where, problem.message, `add the emit and "events.relay" after the write's atomic group yourself (${rewrite.reason ?? "not located"})`, docs)
        : autoFinding(id, RULE, where, problem.message, "adds the emit and events.relay after the write's atomic group, as the 3.0 default has them, and drops an inline llms.txt export", [rewrite.edit], docs);
    });
  },
};
