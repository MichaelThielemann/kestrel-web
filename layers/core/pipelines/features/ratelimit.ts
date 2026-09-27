import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function ratelimit(_context: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-ratelimit-memory"],
    pipelines: {
      sweepRateLimits: ["ratelimit.sweep"],
    },
    patches: [
      { pipeline: "login", steps: ["ratelimit.check:login", "ratelimit.check:loginAccount"], at: "start" },
      { pipeline: "login", steps: ["ratelimit.rememberDevice:loginAccount"], at: "before", anchor: "events.emit:auth.loggedIn" },
      { pipeline: "confirmPassword", steps: ["ratelimit.check:passwordCheck"], at: "after", anchor: "authn.requireUser" },
      { pipeline: "changePassword", steps: ["ratelimit.check:passwordCheck"], at: "after", anchor: "authn.requireUser" },
    ],
  };
}
