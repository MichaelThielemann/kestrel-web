export interface ConfigEntry {
  use: string;
  config?: unknown;
}

export interface ModuleLike {
  name: string;
  steps?: (instance: unknown) => Record<string, unknown>;
  configSchema?: { safeParse: (value: unknown) => { success: boolean; data?: unknown } };
}

function stepPrefix(name: string): string {
  return name.split("/")[0] ?? name;
}

function registersStep(mod: ModuleLike, step: string): boolean {
  const prefix = `${stepPrefix(mod.name)}.`;
  if (!step.startsWith(prefix) || !mod.steps) return false;
  try {
    return Object.hasOwn(mod.steps(undefined), step.slice(prefix.length));
  } catch {
    return true;
  }
}

export function moduleIndexForStep(modules: readonly ModuleLike[], step: string): number {
  return modules.findIndex((mod) => registersStep(mod, step));
}

export function hasModuleForStep(modules: readonly ModuleLike[], step: string): boolean {
  return moduleIndexForStep(modules, step) !== -1;
}

export function moduleNameForStep(modules: readonly ModuleLike[], step: string): string | undefined {
  return modules[moduleIndexForStep(modules, step)]?.name;
}

export function moduleConfigForStep(modules: readonly ModuleLike[], entries: readonly ConfigEntry[], step: string): unknown {
  if (modules.length !== entries.length) {
    throw new Error(`kestrel-web: kestrel.config lists ${entries.length} modules but ${modules.length} were loaded — the module list and the config entries must be in the same order`);
  }
  const index = moduleIndexForStep(modules, step);
  if (index === -1) return undefined;
  const raw = entries[index]?.config ?? {};
  const parsed = modules[index]?.configSchema?.safeParse(raw);
  return parsed?.success === true ? parsed.data : raw;
}
