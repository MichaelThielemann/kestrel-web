import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function insights(_context: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-insights"],
    pipelines: {
      insightsManifest: ["authn.requireUser", "authz.require:insights.read", "insights.readManifest"],
      insightsStats: ["authn.requireUser", "authz.require:insights.read", "insights.readStats"],
    },
    patches: [],
  };
}
