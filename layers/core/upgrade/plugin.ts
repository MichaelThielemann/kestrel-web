import type { UpgradePlugin } from "@michaelthielemann/kestrel-upgrade/plugin";
import { detectLayerProject, loadLayerProject, prepareLayerProject } from "./load";
import { layerRules } from "./rules";

export interface LayerPluginOptions {
  /**
   * Skip `nuxt prepare` when `.nuxt/kestrel/` already exists in the scratch copy (the bin's `--no-prepare`).
   * `.nuxt` is excluded from every scratch copy the tool makes, so this only helps a caller that already
   * populated `.nuxt/kestrel/` in that exact scratch directory itself; it cannot help across the fresh
   * scratch copy each round of an interactive `fix` session gets.
   */
  skipPrepareWhenReady?: boolean;
}

/**
 * The layer's `UpgradePlugin`: detects a project built on this layer, loads its config, modules and
 * pipelines through jiti with the layer's own aliases, and adds the layer's rules to kestrel's own
 * `DEFAULT_RULES` (registered by `runUpgradeCli`, not here). `kestrel-renderer-nuxt` is not in kestrel's
 * sandbox table, so it is declared known-safe here: its `setup()` only registers the `renderer@1`
 * contract kestrel-web itself provides at request time, nothing at boot.
 */
export function createLayerPlugin(options: LayerPluginOptions = {}): UpgradePlugin {
  const skip = options.skipPrepareWhenReady ?? false;
  return {
    kind: "kestrel-web",
    detect: detectLayerProject,
    async load(_root, scratch) {
      await prepareLayerProject(scratch, skip);
      return loadLayerProject(scratch);
    },
    sandbox: { "renderer-nuxt": (config) => config },
    rules: layerRules,
  };
}
