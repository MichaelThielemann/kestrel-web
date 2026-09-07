import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function audit(_context: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-audit-persistence"],
    pipelines: {
      auditAuth: ["audit.record"],
    },
    patches: [],
  };
}
