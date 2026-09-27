import type { BootInput, KestrelConfigInput } from "@michaelthielemann/kestrel";
import { withLayerBuckets } from "../../pipelines/ratelimit-buckets";
import { applyBundledSchemas, type SchemaBundle } from "./bundled-schemas";

export interface LayerBootInputSource {
  config: KestrelConfigInput;
  modules: BootInput["modules"];
  pipelines: BootInput["pipelines"];
  bundledSchemas: SchemaBundle;
}

/** The `BootInput` a layer project boots with: its config with every schema the build bundled in place of the file it names, and the layer's default for every rate-limit bucket its pipelines check but the config leaves out. */
export function layerBootInput(source: LayerBootInputSource): Pick<BootInput, "config" | "modules" | "pipelines"> {
  return {
    config: { ...source.config, modules: withLayerBuckets(applyBundledSchemas(source.config.modules, source.bundledSchemas), source.pipelines) },
    modules: source.modules,
    pipelines: source.pipelines,
  };
}
