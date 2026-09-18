export interface ConfigEntry {
  use: string;
  config?: unknown;
}

export interface ModuleLike {
  name: string;
  configSchema?: { safeParse: (value: unknown) => { success: boolean; data?: unknown } };
}

export interface StepOwnerLookup {
  steps: { owner: (step: string) => string | undefined };
}

export function moduleIndexForStep(modules: readonly ModuleLike[], owner: string | undefined): number {
  if (owner === undefined) return -1;
  return modules.findIndex((mod) => mod.name === owner);
}

export function hasModuleForStep(modules: readonly ModuleLike[], owner: string | undefined): boolean {
  return moduleIndexForStep(modules, owner) !== -1;
}

export function moduleNameForStep(modules: readonly ModuleLike[], owner: string | undefined): string | undefined {
  return modules[moduleIndexForStep(modules, owner)]?.name;
}

export function moduleConfigForStep(modules: readonly ModuleLike[], entries: readonly ConfigEntry[], owner: string | undefined): unknown {
  if (modules.length !== entries.length) {
    throw new Error(`kestrel-web: kestrel.config lists ${entries.length} modules but ${modules.length} were loaded — the module list and the config entries must be in the same order`);
  }
  const index = moduleIndexForStep(modules, owner);
  if (index === -1) return undefined;
  const raw = entries[index]?.config ?? {};
  const parsed = modules[index]?.configSchema?.safeParse(raw);
  return parsed?.success === true ? parsed.data : raw;
}
