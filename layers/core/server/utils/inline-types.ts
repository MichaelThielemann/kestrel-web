import { hasModuleForStep, type ModuleLike, type StepOwnerLookup } from "./modules";

export const SANITIZE_SVG_STEP = "sanitize.svg";

export function inlineTypesFor(kestrel: StepOwnerLookup, modules: readonly ModuleLike[]): string[] {
  return hasModuleForStep(modules, kestrel.steps.owner(SANITIZE_SVG_STEP)) ? ["image/svg+xml"] : [];
}
