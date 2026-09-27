import { arrayElements, isArrayExpression, isAstNode, objectProperty, parseTs, span, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Edit, Finding, Rule, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset } from "../pipelines/checkPreset";
import type { PresetOptions } from "../pipelines/checkPreset";
import { dependentsPipelineNames } from "../pipelines/features/delivery";
import { applySplices, insertAfterElement, removeElement, wrapElements } from "./arraySplices";
import { layerProjectData } from "./load";
import { presetOverrideArrays } from "./locators";
import { autoFinding, docsAnchor, fileForPipeline, manualFinding, presetOptionsCast } from "./ruleHelpers";

const RULE = "preset/override-emit";
const WATCHED_EMIT_PROBLEM = "preset/override-drops-watched-emit";
const INLINE_EXPORT = "delivery.exportLlms";
const RELAY = "events.relay";
const EMIT = "events.emit:";

const isEmit = (step: string): boolean => step.startsWith(EMIT);
const isInlineExport = (step: string | undefined): boolean => step === INLINE_EXPORT || (step?.startsWith(`${INLINE_EXPORT}?`) ?? false);
const eventOf = (step: string): string => step.slice(EMIT.length).split("?")[0] ?? "";

function defaultSteps(cast: PresetOptions, name: string): readonly PipelineEntry[] {
  return checkPreset({ ...cast, overrides: {} }).preset.pipelines.find((p) => p.name === name)?.steps ?? [];
}

function watchedEvents(cast: PresetOptions): Set<string> {
  const dependents = new Set(dependentsPipelineNames(cast.collections ?? {}));
  const { triggers } = checkPreset({ ...cast, overrides: {} }).preset;
  return new Set(triggers.flatMap((trigger) => ("event" in trigger && dependents.has(trigger.pipeline) ? [trigger.event] : [])));
}

function isGroupEntry(entry: PipelineEntry | undefined): entry is { atomic: readonly string[] } {
  return typeof entry === "object";
}

function emitFollowsWriteGroup(defaults: readonly PipelineEntry[], own: readonly PipelineEntry[], watched: ReadonlySet<string>): boolean {
  const group = defaults.find(isGroupEntry);
  if (group === undefined) return false;
  const members = group.atomic.filter((step) => !isEmit(step));
  const events = new Set(group.atomic.filter(isEmit).map(eventOf).filter((event) => watched.has(event)));
  const at = own.findIndex((entry) => isGroupEntry(entry) && entry.atomic.some((step) => members.includes(step)));
  const next = own[at + 1];
  return at !== -1 && typeof next === "string" && isEmit(next) && events.has(eventOf(next));
}

function atomicArray(node: AstNode | undefined): AstNode | undefined {
  if (node === undefined || node.type !== "ObjectExpression") return undefined;
  const atomic = objectProperty(node, "atomic");
  return isArrayExpression(atomic) ? atomic : undefined;
}

type Anchor = { kind: "group"; members: readonly string[] } | { kind: "step"; step: string };

interface Plan {
  anchor: Anchor;
  inGroup: string[];
  groupEvents: Set<string>;
  after: string[];
  dropExport: boolean;
}

function planFor(defaults: readonly PipelineEntry[], own: readonly PipelineEntry[], keepExport: boolean): Plan | string {
  const ownEvents = new Set(pipelineSteps(own).filter(isEmit).map(eventOf));
  const missing = (steps: readonly string[]): string[] => steps.filter((step) => isEmit(step) && !ownEvents.has(eventOf(step)));
  const dropExport = !keepExport && !pipelineSteps(defaults).some(isInlineExport);
  const group = defaults.find(isGroupEntry);
  const after = missing(defaults.filter((entry): entry is string => typeof entry === "string"));
  if (group !== undefined) {
    const members = group.atomic.filter((step) => !isEmit(step));
    return { anchor: { kind: "group", members }, inGroup: missing(group.atomic), groupEvents: new Set(group.atomic.filter(isEmit).map(eventOf)), after, dropExport };
  }
  const firstEmit = defaults.findIndex((entry) => typeof entry === "string" && isEmit(entry));
  const step = defaults[firstEmit - 1];
  return typeof step === "string" ? { anchor: { kind: "step", step }, inGroup: [], groupEvents: new Set(), after, dropExport } : "the 3.0 default has no write step before its emit";
}

function literalSteps(array: AstNode): { steps: string[]; complete: boolean } {
  const steps: string[] = [];
  let complete = true;
  for (const element of arrayElements(array)) {
    const inner = atomicArray(element);
    const values = inner === undefined ? [stringValue(element)] : arrayElements(inner).map((el) => stringValue(el));
    for (const value of values) {
      if (value === undefined) complete = false;
      else steps.push(value);
    }
  }
  return { steps, complete };
}

function holdsLoadedSteps(array: AstNode, loaded: readonly string[]): boolean {
  const { steps, complete } = literalSteps(array);
  return complete ? steps.length === loaded.length && steps.every((step, i) => step === loaded[i]) : steps.every((step) => loaded.includes(step));
}

function overrideArray(source: string, pipelineName: string, own: readonly PipelineEntry[]): AstNode | string {
  const candidates = presetOverrideArrays(parseTs(source), pipelineName);
  if (candidates.length === 0) return "the override's own step array could not be located";
  const loaded = candidates.filter((array) => holdsLoadedSteps(array, pipelineSteps(own)));
  if (loaded.length === 1) return loaded[0]!;
  return candidates.length === 1 ? "the override written in the file does not hold the steps the project loads" : `${candidates.length} definePreset() calls override the pipeline, and not exactly one of them holds the steps the project loads`;
}

interface Located {
  array: AstNode;
  values: (string | undefined)[];
  anchorIndex: number;
  run?: { from: number; to: number };
  group?: AstNode;
}

function locateAnchor(source: string, pipelineName: string, arrayStart: number, anchor: Anchor): Located | string {
  const array = presetOverrideArrays(parseTs(source), pipelineName).find((candidate) => span(candidate).start === arrayStart);
  if (array === undefined) return "the override's own step array could not be located";
  const elements = arrayElements(array);
  const values = elements.map((el) => stringValue(el));
  const groups = elements.map((el) => atomicArray(el));
  if (groups.some((group) => group !== undefined && arrayElements(group).some((el) => stringValue(el) === RELAY))) return `"${RELAY}" sits inside an atomic group`;
  const occurrences = (step: string): number[] => values.flatMap((value, i) => (value === step ? [i] : []));
  if (anchor.kind === "step") {
    const at = occurrences(anchor.step);
    return at.length === 1 ? { array, values, anchorIndex: at[0]! } : `the write step "${anchor.step}" is not in the override exactly once`;
  }
  const writeGroups = groups.flatMap((group, i) => (group !== undefined && arrayElements(group).some((el) => anchor.members.includes(stringValue(el) ?? "")) ? [i] : []));
  if (writeGroups.length > 1) return "more than one atomic group holds the write";
  if (writeGroups.length === 1) return { array, values, anchorIndex: writeGroups[0]!, group: groups[writeGroups[0]!] };
  const at = anchor.members.map(occurrences);
  const from = at[0]?.[0] ?? -1;
  const exact = from >= 0 && at.every((indices, i) => indices.length === 1 && indices[0] === from + i);
  if (!exact) return `the write steps ${anchor.members.map((m) => `"${m}"`).join(", ")} sit in the override neither in an atomic group nor as one run in the default's order`;
  return { array, values, anchorIndex: from, run: { from, to: from + anchor.members.length - 1 } };
}

function quoteOf(source: string, array: AstNode): string {
  const first = arrayElements(array).find((el) => stringValue(el) !== undefined);
  return first !== undefined && source[span(first).start] === "'" ? "'" : '"';
}

export interface EmitRewrite {
  edit?: Edit;
  reason?: string;
  moved?: number;
}

export interface EmitRewriteOptions {
  keepExport?: boolean;
}

/**
 * Rewrites an override's step array into the shape its 3.0 default has around the write. The anchor is
 * the atomic group that holds the default's write step, or those steps as one bare run (then wrapped in
 * `{ atomic: [...] }`), or, for a default without a group, the step right before its emit. The default's
 * missing emits go where the default has them, at the end of the group (with the queue) or right after
 * it; an emit the default runs inside the group that sits right after it moves in. `events.relay`
 * follows, and one that sits before the write moves there. A `delivery.exportLlms` the default does not
 * run is removed unless `keepExport` is set. Everything else, comments included, keeps its bytes and
 * place. The edit spans the whole array, so a narrower edit of another rule into it (the group wrap, the
 * relay) is superseded instead of conflicting.
 */
export function rewriteOverrideEmits(file: string, source: string, pipelineName: string, defaults: readonly PipelineEntry[], own: readonly PipelineEntry[], options: EmitRewriteOptions = {}): EmitRewrite {
  const plan = planFor(defaults, own, options.keepExport ?? false);
  if (typeof plan === "string") return { reason: plan };
  const original = overrideArray(source, pipelineName, own);
  if (typeof original === "string") return { reason: original };
  const arrayStart = span(original).start;
  const quote = quoteOf(source, original);
  const literal = (step: string): string => `${quote}${step}${quote}`;
  let text = source;
  let located = locateAnchor(text, pipelineName, arrayStart, plan.anchor);
  for (;;) {
    if (typeof located === "string") return { reason: located };
    const { anchorIndex } = located;
    const stray = located.values.findIndex((value, i) => (plan.dropExport && isInlineExport(value)) || (value === RELAY && i < anchorIndex));
    if (stray === -1) break;
    text = applySplices(text, removeElement(text, located.array, stray));
    located = locateAnchor(text, pipelineName, arrayStart, plan.anchor);
  }
  if (located.run !== undefined) {
    text = applySplices(text, wrapElements(located.array, located.run.from, located.run.to));
    located = locateAnchor(text, pipelineName, arrayStart, plan.anchor);
    if (typeof located === "string") return { reason: located };
  }
  const moved: string[] = [];
  for (;;) {
    const next = arrayElements(located.array)[located.anchorIndex + 1];
    const value = located.values[located.anchorIndex + 1];
    if (located.group === undefined || next === undefined || value === undefined || !isEmit(value) || !plan.groupEvents.has(eventOf(value))) break;
    moved.push(text.slice(span(next).start, span(next).end));
    text = applySplices(text, removeElement(text, located.array, located.anchorIndex + 1));
    located = locateAnchor(text, pipelineName, arrayStart, plan.anchor);
    if (typeof located === "string") return { reason: located };
  }
  const inGroup = [...moved, ...plan.inGroup.map(literal)];
  if (inGroup.length > 0) {
    if (located.group === undefined) return { reason: "the write has no atomic group to hold the emit" };
    text = applySplices(text, insertAfterElement(text, located.group, arrayElements(located.group).length - 1, inGroup));
    located = locateAnchor(text, pipelineName, arrayStart, plan.anchor);
    if (typeof located === "string") return { reason: located };
  }
  const anchorIndex = located.anchorIndex;
  const relayed = located.values.some((value, i) => value === RELAY && i > anchorIndex);
  const after = [...plan.after, ...(relayed ? [] : [RELAY])];
  if (after.length > 0) text = applySplices(text, insertAfterElement(text, located.array, anchorIndex, after.map(literal)));
  const rewritten = presetOverrideArrays(parseTs(text), pipelineName).find((candidate) => span(candidate).start === arrayStart);
  if (rewritten === undefined) return { reason: "the override's own step array could not be located" };
  return { edit: { file, start: arrayStart, end: span(original).end, text: text.slice(arrayStart, span(rewritten).end) }, moved: moved.length };
}

function propertyStart(source: string, valueStart: number): number | undefined {
  let found: number | undefined;
  walk(parseTs(source), (node) => {
    if (found !== undefined || (node.type !== "Property" && node.type !== "ObjectProperty")) return;
    if (isAstNode(node.value) && span(node.value).start === valueStart && span(node).start < valueStart) found = span(node).start;
  });
  return found;
}

interface OverrideTarget {
  name: string;
  file: string | undefined;
  source: string | undefined;
  own: readonly PipelineEntry[];
}

function ownSteps(ctx: RuleContext, cast: PresetOptions, name: string): readonly PipelineEntry[] {
  const written = Object.entries(cast.overrides ?? {}).find(([pipeline]) => pipeline === name)?.[1];
  return written ?? ctx.project.input.pipelines.find((p) => p.name === name)?.steps ?? [];
}

function overrideTargets(ctx: RuleContext, cast: PresetOptions, names: readonly string[]): OverrideTarget[] {
  return names.map((name) => {
    const file = fileForPipeline(ctx, name);
    return { name, file, source: file === undefined ? undefined : ctx.readFile(file), own: ownSteps(ctx, cast, name) };
  });
}

/**
 * The switch to the queue's own part for overrides: every override that drops a watched emit, or whose
 * watched emit sits right after the write's group, rewritten with the emit inside that group, as the
 * queue's default has it, so the event's row commits with the write. Each edit spans the override's whole
 * property, so it supersedes `preset/override-emit`'s edit of the same array, which places the emit for the
 * inline delivery the project is still on. Overrides the rewrite cannot place are left to that rule.
 */
export function queueEmitPlacementEdits(ctx: RuleContext): Edit[] {
  const cast = presetOptionsCast(ctx);
  const data = layerProjectData(ctx.project);
  if (cast === undefined || data === undefined || (cast.features ?? []).includes("eventsQueue")) return [];
  const queued: PresetOptions = { ...cast, features: [...(cast.features ?? []), "eventsQueue"] };
  const watched = watchedEvents(cast);
  const dropping = new Set(data.presetProblems.filter((p) => p.code === WATCHED_EMIT_PROBLEM).map((p) => p.pipeline));
  const edits: Edit[] = [];
  for (const { name, file, source, own } of overrideTargets(ctx, cast, Object.keys(cast.overrides ?? {}))) {
    const defaults = defaultSteps(queued, name);
    if (file === undefined || source === undefined || (!dropping.has(name) && !emitFollowsWriteGroup(defaults, own, watched))) continue;
    const { edit } = rewriteOverrideEmits(file, source, name, defaults, own, { keepExport: !dropping.has(name) });
    const start = edit === undefined ? undefined : propertyStart(source, edit.start);
    if (edit !== undefined && start !== undefined) edits.push({ ...edit, start, text: source.slice(start, edit.start) + edit.text });
  }
  return edits;
}

function misplacedEmitFindings(ctx: RuleContext, cast: PresetOptions, skip: ReadonlySet<string>): Finding[] {
  const watched = watchedEvents(cast);
  const names = Object.keys(cast.overrides ?? {}).filter((name) => !skip.has(name));
  return overrideTargets(ctx, cast, names).flatMap(({ name, file, source, own }): Finding[] => {
    const defaults = defaultSteps(cast, name);
    if (!emitFollowsWriteGroup(defaults, own, watched)) return [];
    const id = `${RULE}:${name}`;
    const where = { pipeline: name };
    const docs = docsAnchor("preset-override-emit");
    const message = `override for "${name}" emits right after its atomic group; with the queue the emit belongs inside it, so the event commits with the write`;
    const rewrite = file === undefined || source === undefined ? { reason: "the override's file is not known" } : rewriteOverrideEmits(file, source, name, defaults, own, { keepExport: true });
    const finding =
      rewrite.edit === undefined
        ? manualFinding(id, RULE, where, message, `move the emit to the end of the write's atomic group yourself (${rewrite.reason ?? "not located"})`, docs)
        : autoFinding(id, RULE, where, message, "moves the emit to the end of the write's atomic group, as the queue's default has it", [rewrite.edit], docs);
    return [{ ...finding, severity: "warning" }];
  });
}

/**
 * An override that drops an `events.emit:` step a dependents pipeline listens to (a 2.x `setSettings` or
 * `set<Name>` override never had one) stops the pages showing what it writes from being re-rendered, and the
 * preset refuses it. Adds the emit next to the write and `events.relay` after it, as the 3.0 default has
 * them, and drops an inline `llms.txt` export the default does not run, in one edit of the override's own
 * step array; manual when that array or the write in it cannot be located unambiguously. On the queue it
 * also moves such an emit that sits right after the write's group into it (a warning: the preset accepts
 * it, but the event would not commit with the write).
 */
export const overrideEmitRule: Rule = {
  id: RULE,
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    const data = layerProjectData(ctx.project);
    if (cast === undefined || data === undefined) return [];
    const problems = data.presetProblems.filter((p) => p.code === WATCHED_EMIT_PROBLEM && p.pipeline !== undefined);
    const misplaced = (cast.features ?? []).includes("eventsQueue") ? misplacedEmitFindings(ctx, cast, new Set(problems.map((p) => p.pipeline!))) : [];
    const dropped = problems.map((problem): Finding => {
      const pipelineName = problem.pipeline!;
      const id = `${RULE}:${pipelineName}`;
      const where = { pipeline: pipelineName };
      const docs = docsAnchor("preset-override-emit");
      const file = fileForPipeline(ctx, pipelineName);
      const source = file === undefined ? undefined : ctx.readFile(file);
      const own = ownSteps(ctx, cast, pipelineName);
      const rewrite = file === undefined || source === undefined ? { reason: "the override's file is not known" } : rewriteOverrideEmits(file, source, pipelineName, defaultSteps(cast, pipelineName), own);
      return rewrite.edit === undefined
        ? manualFinding(id, RULE, where, problem.message, `add the emit next to the write, where the 3.0 default has it, and "events.relay" after it yourself (${rewrite.reason ?? "not located"})`, docs)
        : autoFinding(id, RULE, where, problem.message, "adds the emit next to the write and events.relay after it, as the 3.0 default has them, and drops an inline llms.txt export", [rewrite.edit], docs);
    });
    return [...dropped, ...misplaced];
  },
};
