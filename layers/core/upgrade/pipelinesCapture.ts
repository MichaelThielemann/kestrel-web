import { checkPreset } from "#kestrel-core/pipelines/checkPreset";
import type { PresetOptions, PresetProblem } from "#kestrel-core/pipelines/checkPreset";
import { dropUncutGrants } from "#kestrel-core/pipelines/field-grants";

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
 * usable `Preset` so the project's own `kestrel.config.ts` keeps working unmodified. Like the real one, it
 * drops the derived anonymous grants of resources no composed pipeline cuts.
 */
export function definePreset(options: PresetOptions): ReturnType<typeof checkPreset>["preset"] {
  const { preset, problems } = checkPreset(options);
  dropUncutGrants(options.modules, preset.pipelines);
  captured.last = { options, problems };
  return preset;
}
