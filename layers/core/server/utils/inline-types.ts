import { hasModuleForStep, type ModuleLike } from "./modules";

export const SANITIZE_SVG_STEP = "sanitize.svg";

export function inlineTypesFor(modules: readonly ModuleLike[]): string[] {
  return hasModuleForStep(modules, SANITIZE_SVG_STEP) ? ["image/svg+xml"] : [];
}
