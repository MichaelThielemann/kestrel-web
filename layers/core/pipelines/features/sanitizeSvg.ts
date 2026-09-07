import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function sanitizeSvg(_context: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-sanitize-svg"],
    pipelines: {},
    patches: [{ pipeline: "uploadMedia", steps: ["sanitize.svg"], at: "before", anchor: "media.upload" }],
  };
}
