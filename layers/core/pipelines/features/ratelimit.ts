import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function ratelimit(_context: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-ratelimit-memory"],
    pipelines: {
      sweepRateLimits: ["ratelimit.sweep"],
    },
    patches: [{ pipeline: "login", steps: ["ratelimit.check:login"], at: "start" }],
  };
}
