import { checkPreset } from "#kestrel-core/pipelines/checkPreset";
import type { PresetOptions, PresetProblem } from "#kestrel-core/pipelines/checkPreset";
import { presetModuleConfig as realPresetModuleConfig } from "#kestrel-core/pipelines/config";
import type { ModuleEntry, PresetModuleConfigOptions } from "#kestrel-core/pipelines/config";

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
export function definePreset(options: PresetOptions): ReturnType<typeof checkPreset>["preset"] {
  const { preset, problems } = checkPreset(options);
  captured.last = { options, problems };
  return preset;
}

/**
 * Replaces the real `presetModuleConfig()` for the duration of an upgrade-tool load: it throws before
 * `definePreset()` ever runs when the project's media config still allows SVG uploads without the
 * `sanitizeSvg` feature, failing the whole load before `definePreset()`'s own collecting composition gets
 * a chance to run. Retrying once with `sanitizeSvg` added is exactly what the real function asks for, so a
 * project whose only problem is that keeps composing a fully usable module list for the tool's own load
 * (`preset/missing-sanitize-svg` still fixes the project's own `shared/model.ts`, unaffected by this);
 * anything else still throwing falls back to an empty list, same as a load the tool cannot make sense of.
 */
export function presetModuleConfig(options: PresetModuleConfigOptions): ModuleEntry[] {
  try {
    return realPresetModuleConfig(options);
  } catch {
    if (options.features.includes("sanitizeSvg")) return [];
    try {
      return realPresetModuleConfig({ ...options, features: [...options.features, "sanitizeSvg"] });
    } catch {
      return [];
    }
  }
}
