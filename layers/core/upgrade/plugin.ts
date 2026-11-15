import type { BootCheck } from "@michaelthielemann/kestrel";
import type { HostProblem, LoadedProject, UpgradePlugin } from "@michaelthielemann/kestrel-upgrade/plugin";
import { layerHostProblems } from "../server/utils/host-checks";
import { linkDataFindings } from "./linkData";
import { detectLayerProject, layerProjectData, loadDataModel, loadLayerProject, loadSharedContentModel, prepareLayerProject } from "./load";
import { layerLocateModelFields, layerLocateSteps } from "./locators";
import { layerMediaWiring } from "./mediaWiring";
import { layerOpsFacts } from "./ops";
import { layerRules } from "./rules";
import { layerIdempotentPipelines, layerSwitchEdits } from "./switchEdits";

/** The checks the layer's server runs at boot beyond `boot()`, for a project loaded by `loadLayerProject()` and its boot check. */
export function layerHostChecks(project: LoadedProject, bootCheck: BootCheck): HostProblem[] {
  const data = layerProjectData(project);
  return layerHostProblems({
    configModules: project.input.config.modules,
    modules: project.input.modules,
    pipelines: project.input.pipelines,
    collectionsUi: data?.collectionsUi ?? {},
    presetProblems: data?.presetProblems ?? [],
    bootErrors: bootCheck.errors,
    complete: bootCheck.errors.length === 0 && bootCheck.notChecked.length === 0,
    ...(data?.siteModel === undefined ? {} : { siteModel: data.siteModel }),
    ...(bootCheck.manifest === undefined ? {} : { manifest: bootCheck.manifest }),
  });
}

/**
 * The layer's `UpgradePlugin`: detects a project built on this layer, loads its config, modules and
 * pipelines through jiti with the layer's own aliases and the schemas its build bundles, adds the layer's
 * rules to kestrel's own `DEFAULT_RULES`, and reports what the layer's server checks at boot beyond
 * `boot()` through `hostChecks`. `@michaelthielemann/kestrel-renderer-nuxt` is not in kestrel's sandbox
 * table, so it is declared known-safe here: its `setup()` only registers the `renderer@1` contract
 * kestrel-web itself provides at request time, nothing at boot. `dataModel` and `switchEdits` are hooks
 * the built-in `model/underscore-field` and `offer/event-queue` rules consult directly; this plugin does
 * not replace either rule. `dataFindings` adds the layer's own stored-value checks to `kestrel upgrade data`.
 * `ops` (plugin API 6) answers what `kestrel status`, `backup`, `restore` and `update` need to know about the
 * project: its readiness route, its blob store and database file from a deployed environment's variables, the
 * variables that hold secrets, the migration switches and how a local copy starts.
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
    dataFindings: async (db, root) => linkDataFindings(db, await loadSharedContentModel(root)),
    switchEdits: layerSwitchEdits,
    idempotentPipelines: layerIdempotentPipelines,
    mediaWiring: layerMediaWiring,
    hostChecks: layerHostChecks,
    ops: layerOpsFacts,
  };
}
