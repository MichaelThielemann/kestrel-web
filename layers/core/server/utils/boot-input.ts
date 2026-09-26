import type { BootInput, KestrelConfigInput } from "@michaelthielemann/kestrel";
import { applyBundledSchemas, type SchemaBundle } from "./bundled-schemas";

export interface LayerBootInputSource {
  config: KestrelConfigInput;
  modules: BootInput["modules"];
  pipelines: BootInput["pipelines"];
  bundledSchemas: SchemaBundle;
}

/** The `BootInput` a layer project boots with: its config with every schema the build bundled in place of the file it names. */
export function layerBootInput(source: LayerBootInputSource): Pick<BootInput, "config" | "modules" | "pipelines"> {
  return {
    config: { ...source.config, modules: applyBundledSchemas(source.config.modules, source.bundledSchemas) },
    modules: source.modules,
    pipelines: source.pipelines,
  };
}
