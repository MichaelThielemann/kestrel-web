import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { checkPreset } from "#kestrel-core/pipelines/checkPreset";
import type { CollectionModel, PresetOptions, PresetProblem } from "#kestrel-core/pipelines/checkPreset";
import type { PresetStep } from "#kestrel-core/module-registry";

export * from "#kestrel-core/pipelines/index";

export interface CapturedPreset {
  options: PresetOptions;
  problems: PresetProblem[];
}

/** Filled by `definePreset()` below every time a loaded project calls it. */
export const captured: { last?: CapturedPreset } = {};

/**
 * Replaces the real `definePreset()` for the duration of an upgrade-tool load: composes in collecting
 * mode instead of throwing, records the options and problems into `captured.last`, and still returns a
 * usable `Preset` so the project's own `kestrel.config.ts` keeps working unmodified.
 */
export function definePreset<C extends Record<string, CollectionModel> = Record<string, CollectionModel>, S extends string = PresetStep>(
  options: PresetOptions<C, S>,
): ReturnType<typeof checkPreset>["preset"] {
  const { preset, problems } = checkPreset(options);
  captured.last = { options: boundaryCast<PresetOptions>(options, "host"), problems };
  return preset;
}
