declare module "#kestrel/optional-modules" {
  import type { ModuleDefinition } from "@michaelthielemann/kestrel/defineModule";

  const modules: Record<string, ModuleDefinition>;
  export default modules;
}
