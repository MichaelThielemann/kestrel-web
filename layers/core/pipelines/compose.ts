import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import { isAtomicGroup, pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { AtomicGroup, PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";

/** One entry of a preset pipeline's step list: a step name, or an atomic group of them. */
export type PresetEntry<S extends string = string> = PipelineEntry<S>;

/**
 * Anchor value for a `before`/`after` patch meaning the closing boundary of a pipeline's atomic group:
 * `before` appends to the group, `after` inserts as the first plain entry following it. Not a step name
 * and never collides with one.
 */
export const ATOMIC_END = "\0atomic-end";

export type Patch<F extends string = string, S extends string = string> =
  | { pipeline: string; steps: readonly S[]; when?: F; at: "before"; anchor: S | typeof ATOMIC_END }
  | { pipeline: string; steps: readonly S[]; when?: F; at: "after"; anchor: S | typeof ATOMIC_END }
  | { pipeline: string; steps: readonly S[]; when?: F; at: "start" }
  | { pipeline: string; steps: readonly S[]; when?: F; at: "end" };

interface FlatRef<S extends string> {
  step: S;
  entryIndex: number;
  subIndex?: number;
}

function flatten<S extends string>(entries: readonly PresetEntry<S>[]): FlatRef<S>[] {
  const result: FlatRef<S>[] = [];
  entries.forEach((entry, entryIndex) => {
    if (isAtomicGroup(entry)) {
      entry.atomic.forEach((step, subIndex) => result.push({ step, entryIndex, subIndex }));
    } else {
      result.push({ step: entry, entryIndex });
    }
  });
  return result;
}

function clonePipelines(pipelines: Record<string, readonly PresetEntry[]>): Record<string, PresetEntry[]> {
  return Object.fromEntries(
    Object.entries(pipelines).map(([name, steps]) => [name, steps.map((entry): PresetEntry => (isAtomicGroup(entry) ? { atomic: [...entry.atomic] } : entry))]),
  );
}

export function applyFeaturePatches<F extends string>(
  pipelines: Record<string, readonly PresetEntry[]>,
  feature: F,
  patches: readonly Patch<F>[],
  enabledFeatures: ReadonlySet<F>,
): Record<string, PresetEntry[]> {
  const result = clonePipelines(pipelines);
  for (const patch of patches) {
    if (patch.when !== undefined && !enabledFeatures.has(patch.when)) continue;
    const current = result[patch.pipeline];
    if (current === undefined) {
      throw new Error(`preset: feature "${feature}" patches unknown pipeline "${patch.pipeline}"`);
    }
    const flatSteps = pipelineSteps(current);
    for (const step of patch.steps) {
      if (flatSteps.includes(step)) {
        throw new Error(`preset: feature "${feature}" step "${step}" already present in pipeline "${patch.pipeline}"`);
      }
    }
    if (patch.at === "start") {
      current.unshift(...patch.steps);
    } else if (patch.at === "end") {
      current.push(...patch.steps);
    } else if (patch.anchor === ATOMIC_END) {
      const groups = current.filter(isAtomicGroup);
      if (groups.length !== 1) {
        const problem = groups.length === 0 ? "not found" : "found more than once";
        throw new Error(`preset: feature "${feature}" pipeline "${patch.pipeline}" anchor "${ATOMIC_END}" ${problem}`);
      }
      const group = groups[0]!;
      const groupIndex = current.indexOf(group);
      if (patch.at === "before") {
        current[groupIndex] = { atomic: [...group.atomic, ...patch.steps] };
      } else {
        current.splice(groupIndex + 1, 0, ...patch.steps);
      }
    } else {
      const flat = flatten(current);
      const matches = flat.filter((ref) => ref.step === patch.anchor);
      if (matches.length !== 1) {
        const problem = matches.length === 0 ? "not found" : "found more than once";
        throw new Error(`preset: feature "${feature}" pipeline "${patch.pipeline}" anchor "${patch.anchor}" ${problem}`);
      }
      const ref = matches[0]!;
      if (ref.subIndex === undefined) {
        const insertAt = ref.entryIndex + (patch.at === "after" ? 1 : 0);
        current.splice(insertAt, 0, ...patch.steps);
      } else {
        const group = current[ref.entryIndex];
        if (group === undefined || !isAtomicGroup(group)) throw new Error(`preset: internal error – entry ${ref.entryIndex} of "${patch.pipeline}" was expected to be an atomic group`);
        const insertAt = ref.subIndex + (patch.at === "after" ? 1 : 0);
        const atomic = [...group.atomic];
        atomic.splice(insertAt, 0, ...patch.steps);
        current[ref.entryIndex] = { atomic };
      }
    }
  }
  return result;
}

export function mergePipelines(
  base: Record<string, readonly PresetEntry[]>,
  additions: Record<string, readonly PresetEntry[]>,
  owner: string,
  ownerKind: string = "feature",
): Record<string, PresetEntry[]> {
  const result = clonePipelines(base);
  for (const [name, steps] of Object.entries(additions)) {
    if (name in result) {
      throw new Error(`preset: ${ownerKind} "${owner}" pipeline "${name}" collides with an existing pipeline`);
    }
    result[name] = [...steps];
  }
  return result;
}

export function applyOverrides(
  pipelines: Record<string, readonly PresetEntry[]>,
  overrides: Partial<Record<string, readonly PresetEntry[]>>,
): Record<string, PresetEntry[]> {
  const result = clonePipelines(pipelines);
  for (const [name, steps] of Object.entries(overrides)) {
    if (steps === undefined) continue;
    if (!(name in result)) {
      throw new Error(`preset: override for unknown pipeline "${name}"`);
    }
    result[name] = [...steps];
  }
  return result;
}

export function applyExclude<T extends { pipeline: string } = { pipeline: string }>(
  pipelines: Record<string, readonly PresetEntry[]>,
  triggers: readonly T[],
  exclude: readonly string[],
): { pipelines: Record<string, PresetEntry[]>; triggers: T[] } {
  const excludeSet = new Set(exclude);
  for (const name of exclude) {
    if (!(name in pipelines)) {
      throw new Error(`preset: exclude for unknown pipeline "${name}"`);
    }
  }
  const result = Object.fromEntries(Object.entries(clonePipelines(pipelines)).filter(([name]) => !excludeSet.has(name)));
  return { pipelines: result, triggers: triggers.filter((trigger) => !excludeSet.has(trigger.pipeline)) };
}

export function applySchedules(triggers: readonly TriggerConfig[], schedules: Partial<Record<string, string>>): TriggerConfig[] {
  const pending = new Set(Object.entries(schedules).filter(([, cron]) => cron !== undefined).map(([name]) => name));
  const result = triggers.map((trigger) => {
    if (!("cron" in trigger)) return trigger;
    const cron = schedules[trigger.pipeline];
    if (cron === undefined) return trigger;
    pending.delete(trigger.pipeline);
    return { ...trigger, cron };
  });
  if (pending.size > 0) {
    const [name] = pending;
    throw new Error(`preset: schedule for unknown cron pipeline "${name}"`);
  }
  return result;
}

/** The last step of a pipeline's composed entries. Throws if the pipeline has no steps. */
export function lastStepOf<S extends string>(entries: readonly PresetEntry<S>[]): S {
  const flat = pipelineSteps(entries);
  const last = flat[flat.length - 1];
  if (last === undefined) throw new Error("preset: pipeline has no steps");
  return last;
}

/**
 * Drops the first `head` and last `dropLast` entries of a composed pipeline, keeping any atomic group
 * intact. The caller guarantees the dropped entries are plain steps, never part of a group.
 */
export function bodyOf<S extends string>(entries: readonly PresetEntry<S>[], head: number, dropLast: number): PresetEntry<S>[] {
  return entries.slice(head, entries.length - dropLast).map((entry) => (isAtomicGroup(entry) ? { atomic: [...entry.atomic] } : entry));
}

/**
 * Without the `eventsQueue` feature a pipeline's trailing `events.emit:` stays outside its atomic group,
 * because `events/direct` runs subscribers inline and must not hold the write lock. With the queue the
 * emit is a row insert and belongs with the write it reports: if the pipeline's last entry is an
 * `events.emit:` step and it has exactly one atomic group, the emit moves to the end of that group.
 * Nothing else moves — a step between the group and the emit (`delivery.*`, `revisions.reportRestore`)
 * keeps its position; both steps merge into the response via `extendsOutput`
 * (`resolveOutputSchema`, `@michaelthielemann/kestrel/schema`), so their order no longer matters. A
 * pipeline with no group, or whose last entry is not an emit, is returned unchanged. A
 * pipeline with more than one group throws, naming it.
 */
export function foldTrailingEmit<S extends string>(name: string, entries: readonly PresetEntry<S>[]): PresetEntry<S>[] {
  const last = entries[entries.length - 1];
  if (typeof last !== "string" || !last.startsWith("events.emit:")) return [...entries];
  const groups = entries.filter(isAtomicGroup);
  if (groups.length === 0) return [...entries];
  if (groups.length > 1) {
    throw new Error(`preset: cannot fold the trailing emit of "${name}" – it has more than one atomic group`);
  }
  const group = groups[0]!;
  const groupIndex = entries.indexOf(group);
  const between = entries.slice(groupIndex + 1, entries.length - 1).map((entry): PresetEntry<S> => (isAtomicGroup(entry) ? { atomic: [...entry.atomic] } : entry));
  const newGroup: AtomicGroup<S> = { atomic: [...group.atomic, last] };
  return [...entries.slice(0, groupIndex), newGroup, ...between];
}

/** The index of the entry carrying a pipeline's `events.emit:` step — a bare entry, or the atomic group holding it. -1 when the pipeline has none. */
export function emitEntryIndex<S extends string>(entries: readonly PresetEntry<S>[]): number {
  return entries.findIndex((entry) => (isAtomicGroup(entry) ? entry.atomic.some((step) => step.startsWith("events.emit:")) : entry.startsWith("events.emit:")));
}

/**
 * Inserts `events.relay` immediately after the entry carrying the pipeline's `events.emit:` step — a
 * bare entry, or the atomic group it ends (with the queue, after `foldTrailingEmit`). A step that reads
 * the result after the emit but outside the group, such as `revisions.reportRestore` on
 * `restorePageRevision`, stays after the relay: both merge into the result independently, and neither
 * reads the other's addition. A pipeline with no emit, including an empty one, is returned unchanged.
 */
export function appendRelay<S extends string>(entries: readonly PresetEntry<S>[]): PresetEntry<S>[] {
  const emitIndex = emitEntryIndex(entries);
  if (emitIndex === -1) return [...entries];
  const result = entries.map((entry): PresetEntry<S> => (isAtomicGroup(entry) ? { atomic: [...entry.atomic] } : entry));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- "events.relay" is a step name registered by both delivery modules; S is a step-name union, not a JSON type
  result.splice(emitIndex + 1, 0, "events.relay" as S);
  return result;
}

const CONTENT_WRITE_STEP = /^content\.(?:create|update|remove|removeTranslation|set):([^?]+)/;
const DELETE_USER_STEP = "authn.deleteUser";

/** What the preset's override guard protects in a group: a content write, identified by its collection so a consumer may switch between `create`/`update`/`set`, or `authn.deleteUser`, which has no target. */
export interface GroupSignature<S extends string = string> {
  step: S;
  target: string | undefined;
}

/**
 * The step of an atomic group the preset's override guard protects against loss: a `content.*` write
 * (matched by its collection, not its exact operation) or `authn.deleteUser`. Returns undefined for a
 * group with neither, which the guard leaves unprotected.
 */
export function groupSignatureOf<S extends string>(group: AtomicGroup<S>): GroupSignature<S> | undefined {
  const contentStep = group.atomic.find((step) => CONTENT_WRITE_STEP.test(step));
  if (contentStep !== undefined) {
    const target = CONTENT_WRITE_STEP.exec(contentStep)?.[1];
    return { step: contentStep, target };
  }
  const deleteStep = group.atomic.find((step): step is S => step === DELETE_USER_STEP);
  if (deleteStep !== undefined) return { step: deleteStep, target: undefined };
  return undefined;
}
