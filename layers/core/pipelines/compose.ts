import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";

export type Patch<F extends string = string, S extends string = string> =
  | { pipeline: string; steps: readonly S[]; when?: F; at: "before"; anchor: S }
  | { pipeline: string; steps: readonly S[]; when?: F; at: "start" }
  | { pipeline: string; steps: readonly S[]; when?: F; at: "end" };

function clonePipelines(pipelines: Record<string, readonly string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(pipelines).map(([name, steps]) => [name, [...steps]]));
}

export function applyFeaturePatches<F extends string>(
  pipelines: Record<string, readonly string[]>,
  feature: F,
  patches: readonly Patch<F>[],
  enabledFeatures: ReadonlySet<F>,
): Record<string, string[]> {
  const result = clonePipelines(pipelines);
  for (const patch of patches) {
    if (patch.when !== undefined && !enabledFeatures.has(patch.when)) continue;
    const current = result[patch.pipeline];
    if (current === undefined) {
      throw new Error(`preset: feature "${feature}" patches unknown pipeline "${patch.pipeline}"`);
    }
    for (const step of patch.steps) {
      if (current.includes(step)) {
        throw new Error(`preset: feature "${feature}" step "${step}" already present in pipeline "${patch.pipeline}"`);
      }
    }
    if (patch.at === "start") {
      current.unshift(...patch.steps);
    } else if (patch.at === "end") {
      current.push(...patch.steps);
    } else {
      const occurrences = current.filter((step) => step === patch.anchor).length;
      if (occurrences !== 1) {
        const problem = occurrences === 0 ? "not found" : "found more than once";
        throw new Error(`preset: feature "${feature}" pipeline "${patch.pipeline}" anchor "${patch.anchor}" ${problem}`);
      }
      current.splice(current.indexOf(patch.anchor), 0, ...patch.steps);
    }
  }
  return result;
}

export function mergePipelines(
  base: Record<string, readonly string[]>,
  additions: Record<string, readonly string[]>,
  owner: string,
  ownerKind: string = "feature",
): Record<string, string[]> {
  const result = clonePipelines(base);
  for (const [name, steps] of Object.entries(additions)) {
    if (name in result) {
      throw new Error(`preset: ${ownerKind} "${owner}" pipeline "${name}" collides with an existing pipeline`);
    }
    result[name] = [...steps];
  }
  return result;
}

export function applyOverrides(pipelines: Record<string, readonly string[]>, overrides: Partial<Record<string, readonly string[]>>): Record<string, string[]> {
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

export function applyExclude<T extends { pipeline: string }>(
  pipelines: Record<string, readonly string[]>,
  triggers: readonly T[],
  exclude: readonly string[],
): { pipelines: Record<string, string[]>; triggers: T[] } {
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
