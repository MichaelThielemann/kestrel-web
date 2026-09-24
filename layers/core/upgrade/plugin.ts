import type { UpgradePlugin } from "@michaelthielemann/kestrel-upgrade/plugin";
import { detectLayerProject, loadLayerProject, prepareLayerProject } from "./load";
import { layerLocateModelFields, layerLocateSteps } from "./locators";
import { layerRules, underscoreFieldOverrideRule } from "./rules";
import { queueOfferRule } from "./ruleQueueOffer";

const LAYER_PACKAGE = "@michaelthielemann/kestrel-web";

/**
 * The layer's `UpgradePlugin`: detects a project built on this layer, loads its config, modules and
 * pipelines through jiti with the layer's own aliases, and adds the layer's rules to kestrel's own
 * `DEFAULT_RULES`. `kestrel-renderer-nuxt` is not in kestrel's sandbox table, so it is declared
 * known-safe here: its `setup()` only registers the `renderer@1` contract kestrel-web itself provides
 * at request time, nothing at boot.
 */
export function createLayerPlugin(): UpgradePlugin {
  return {
    kind: "kestrel-web",
    detect: detectLayerProject,
    async load(root, scratch, cache) {
      await prepareLayerProject(root, scratch, cache);
      return loadLayerProject(scratch);
    },
    sandbox: { "renderer-nuxt": (config) => config },
    rules: layerRules,
    ownsPackages: [LAYER_PACKAGE],
    overrides: {
      "offer/event-queue": queueOfferRule,
      "model/underscore-field": underscoreFieldOverrideRule,
    },
    locateSteps: layerLocateSteps,
    locateModelFields: layerLocateModelFields,
  };
}
