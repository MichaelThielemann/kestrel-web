import type { UpgradePlugin } from "@michaelthielemann/kestrel-upgrade/plugin";
import { detectLayerProject, loadDataModel, loadLayerProject, prepareLayerProject } from "./load";
import { layerLocateModelFields, layerLocateSteps } from "./locators";
import { layerRules } from "./rules";
import { layerSwitchEdits } from "./switchEdits";

/**
 * The layer's `UpgradePlugin`: detects a project built on this layer, loads its config, modules and
 * pipelines through jiti with the layer's own aliases, and adds the layer's rules to kestrel's own
 * `DEFAULT_RULES`. `@michaelthielemann/kestrel-renderer-nuxt` is not in kestrel's sandbox table, so it
 * is declared known-safe here: its `setup()` only registers the `renderer@1` contract kestrel-web
 * itself provides at request time, nothing at boot. `dataModel` and `switchEdits` are hooks the
 * built-in `model/underscore-field` and `offer/event-queue` rules consult directly; this plugin does
 * not replace either rule.
 */
export function createLayerPlugin(): UpgradePlugin {
  return {
    kind: "kestrel-web",
    detect: detectLayerProject,
    async load(root, scratch, cache) {
      await prepareLayerProject(root, scratch, cache);
      return loadLayerProject(scratch);
    },
    sandbox: { "@michaelthielemann/kestrel-renderer-nuxt": (config) => config },
    rules: layerRules,
    locateSteps: layerLocateSteps,
    locateModelFields: layerLocateModelFields,
    dataModel: loadDataModel,
    switchEdits: layerSwitchEdits,
  };
}
